"""Git workspace manager for coding sessions.

Handles repo cloning, pulling, committing, and pushing with credential
injection via GIT_ASKPASS so tokens never appear in clone URLs.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import stat
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

_WORKSPACE_SVC_URL = os.getenv("WORKSPACE_SVC_URL", "http://localhost:8010")
_WORKSPACE_ROOT = Path(os.getenv("CODING_WORKSPACE_ROOT", "/tmp/vibeos-workspaces"))

_cred_cache: dict[str, tuple[str, str, float]] = {}
_CACHE_TTL = 300.0


async def _fetch_credential(credential_id: str) -> tuple[str, str]:
    """Fetch decrypted GitLab credential. Returns (gitlab_url, token)."""
    now = time.monotonic()
    cached = _cred_cache.get(credential_id)
    if cached and now < cached[2]:
        return cached[0], cached[1]

    async with httpx.AsyncClient(base_url=_WORKSPACE_SVC_URL, timeout=10) as client:
        resp = await client.get(f"/api/gitlab/credentials/{credential_id}/decrypt")
        resp.raise_for_status()
        data = resp.json().get("data", {})
        url = data.get("gitlabUrl") or ""
        tok = data.get("token") or ""
        if not url or not tok:
            raise RuntimeError(f"Decrypt response missing fields for credential {credential_id}")

    _cred_cache[credential_id] = (url, tok, now + _CACHE_TTL)
    return url, tok


def _resolve_clone_url(gitlab_url: str, project_path: str) -> str:
    """Build HTTPS clone URL from base URL and project path."""
    parsed = urlparse(gitlab_url)
    base = f"{parsed.scheme}://{parsed.hostname}"
    if parsed.port and parsed.port not in (80, 443):
        base += f":{parsed.port}"
    return f"{base}/{project_path}.git"


def _write_askpass_script(token: str, workspace_dir: Path) -> str:
    """Write a temporary GIT_ASKPASS script that echoes the token."""
    script_path = workspace_dir / ".git-askpass.sh"
    script_path.write_text(f"#!/bin/sh\necho '{token}'\n")
    script_path.chmod(stat.S_IRWXU)
    return str(script_path)


async def _run_git(
    *args: str,
    cwd: str | Path,
    env: dict[str, str] | None = None,
    timeout: float = 120,
) -> str:
    """Run a git command and return stdout."""
    merged_env = {**os.environ, **(env or {})}
    proc = await asyncio.create_subprocess_exec(
        "git", *args,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=merged_env,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError(f"git {args[0]} timed out after {timeout}s")
    if proc.returncode != 0:
        err = stderr.decode(errors="replace").strip()
        raise RuntimeError(f"git {args[0]} failed (rc={proc.returncode}): {err}")
    return stdout.decode(errors="replace").strip()


class WorkspaceManager:
    """Manages per-session git workspaces on disk."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = root or _WORKSPACE_ROOT
        self.root.mkdir(parents=True, exist_ok=True)

    def _session_path(self, session_id: str) -> Path:
        return self.root / session_id

    def get_workspace(self, session_id: str) -> Path | None:
        p = self._session_path(session_id)
        return p if p.is_dir() else None

    async def create_workspace(
        self,
        session_id: str,
        gitlab_url: str,
        project_path: str,
        branch: str = "main",
        credential_id: str | None = None,
    ) -> Path:
        """Clone a repo into a session workspace. Returns workspace path."""
        ws = self._session_path(session_id)
        if ws.is_dir():
            logger.info("Workspace %s already exists, reusing", session_id)
            return ws

        ws.mkdir(parents=True, exist_ok=True)
        clone_url = _resolve_clone_url(gitlab_url, project_path)

        git_env: dict[str, str] = {}
        if credential_id:
            _, token = await _fetch_credential(credential_id)
            askpass = _write_askpass_script(token, ws)
            git_env["GIT_ASKPASS"] = askpass
            git_env["GIT_TERMINAL_PROMPT"] = "0"
        elif os.getenv("GITLAB_TOKEN"):
            askpass = _write_askpass_script(os.environ["GITLAB_TOKEN"], ws)
            git_env["GIT_ASKPASS"] = askpass
            git_env["GIT_TERMINAL_PROMPT"] = "0"

        await _run_git(
            "clone", "--branch", branch, "--single-branch", clone_url, str(ws),
            cwd=self.root, env=git_env,
        )
        logger.info("Cloned %s (%s) into %s", project_path, branch, ws)
        return ws

    async def pull_latest(self, session_id: str) -> str:
        ws = self.get_workspace(session_id)
        if not ws:
            raise FileNotFoundError(f"No workspace for session {session_id}")
        return await _run_git("pull", "--ff-only", cwd=ws)

    async def create_branch(self, session_id: str, branch_name: str) -> str:
        ws = self.get_workspace(session_id)
        if not ws:
            raise FileNotFoundError(f"No workspace for session {session_id}")
        await _run_git("checkout", "-b", branch_name, cwd=ws)
        return branch_name

    async def commit_and_push(
        self,
        session_id: str,
        message: str,
        credential_id: str | None = None,
    ) -> dict[str, Any]:
        ws = self.get_workspace(session_id)
        if not ws:
            raise FileNotFoundError(f"No workspace for session {session_id}")

        await _run_git("add", "-A", cwd=ws)

        status = await _run_git("status", "--porcelain", cwd=ws)
        if not status.strip():
            return {"status": "no_changes"}

        await _run_git("commit", "-m", message, cwd=ws)

        git_env: dict[str, str] = {}
        if credential_id:
            _, token = await _fetch_credential(credential_id)
            askpass = _write_askpass_script(token, ws)
            git_env["GIT_ASKPASS"] = askpass
            git_env["GIT_TERMINAL_PROMPT"] = "0"

        branch = await _run_git("rev-parse", "--abbrev-ref", "HEAD", cwd=ws)
        await _run_git("push", "-u", "origin", branch, cwd=ws, env=git_env)
        commit_sha = await _run_git("rev-parse", "HEAD", cwd=ws)

        return {"status": "pushed", "branch": branch, "commit": commit_sha}

    def cleanup(self, session_id: str) -> None:
        ws = self._session_path(session_id)
        if ws.is_dir():
            shutil.rmtree(ws, ignore_errors=True)
            logger.info("Cleaned up workspace %s", session_id)
