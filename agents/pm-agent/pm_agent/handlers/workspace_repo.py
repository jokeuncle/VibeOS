"""Bind a GitLab project to a workspace from NLP (clone URL + saved credentials)."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from vibeos_agent import WorkspaceClient

_GIT_AT_RE = re.compile(r"git@[\w.-]+:[\w./-]+(?:\.git)?", re.I)
_HTTPS_GIT_RE = re.compile(r"https?://[\w./-]+?\.git", re.I)


def _extract_repo_url_from_message(message: str) -> str:
    for rx in (_GIT_AT_RE, _HTTPS_GIT_RE):
        m = rx.search(message)
        if m:
            return m.group(0).strip()
    if "ssh://" in message:
        start = message.index("ssh://")
        tail = message[start:].split()[0]
        return tail.rstrip(".,);]")
    return ""


def parse_git_remote_url(raw: str) -> tuple[str, str] | None:
    """Return (host_lower, path_with_namespace) or None."""
    s = raw.strip()
    if not s:
        return None
    if s.startswith("git@"):
        rest = s[4:]
        if ":" not in rest:
            return None
        host, path = rest.split(":", 1)
        host = host.strip().lower()
        path = path.strip().strip("/")
        if path.endswith(".git"):
            path = path[:-4]
        return host, path
    if s.startswith("ssh://"):
        u = urlparse(s)
        host = (u.hostname or "").lower()
        path = (u.path or "").strip("/")
        if path.endswith(".git"):
            path = path[:-4]
        if not host:
            return None
        return host, path
    if s.startswith("http://") or s.startswith("https://"):
        u = urlparse(s)
        host = (u.hostname or "").lower()
        path = (u.path or "").strip("/")
        if path.endswith(".git"):
            path = path[:-4]
        if not host:
            return None
        return host, path
    return None


def _host_matches(target_host: str, gitlab_url: str) -> bool:
    u = urlparse(gitlab_url)
    gh = (u.hostname or "").lower()
    if not gh or not target_host:
        return False
    return target_host == gh or target_host.endswith("." + gh)


async def handle_bind_workspace_repo(
    workspace_id: str,
    message: str,
    slots: dict[str, Any],
    context: dict[str, Any] | None,
    ws_client: WorkspaceClient,
) -> dict[str, Any]:
    bind = slots.get("bind_workspace_repo") or {}
    repo_url = ""
    if isinstance(bind, dict):
        repo_url = str(bind.get("repo_url") or "").strip()
    if not repo_url:
        repo_url = _extract_repo_url_from_message(message)

    parsed = parse_git_remote_url(repo_url)
    if not parsed:
        return {
            "action": "bind_repo_failed",
            "summary": "请提供可识别的 Git 仓库地址（例如 git@host:group/project.git 或 https://host/group/project.git）。",
        }

    target_host, path_ns = parsed
    if not path_ns:
        return {
            "action": "bind_repo_failed",
            "summary": "仓库地址中缺少项目路径（group/project）。",
        }

    ctx = context or {}
    cred_id_override = str(ctx.get("gitlab_credential_id") or "").strip()

    creds = await ws_client.list_gitlab_credentials()
    matching: list[dict[str, Any]] = []
    for c in creds:
        if cred_id_override:
            if str(c.get("id")) == cred_id_override:
                matching.append(c)
        elif _host_matches(target_host, str(c.get("gitlabUrl") or "")):
            matching.append(c)

    if not matching:
        if cred_id_override:
            return {
                "action": "bind_repo_failed",
                "summary": "上下文中的 GitLab 凭据无效或未找到，请先在集成设置中添加该实例的 PAT。",
            }
        return {
            "action": "bind_repo_failed",
            "summary": (
                f"没有与「{target_host}」匹配的已保存 GitLab 凭据。"
                "请先在「工作空间集成」中添加该 GitLab 实例的访问令牌，然后再绑定仓库。"
            ),
        }

    path_lower = path_ns.lower()
    last_seg = path_ns.split("/")[-1] if "/" in path_ns else path_ns

    chosen: tuple[str, dict[str, Any]] | None = None
    for cred in matching:
        cid = str(cred.get("id") or "")
        if not cid:
            continue
        for term in (path_ns, last_seg):
            if not term:
                continue
            try:
                projects = await ws_client.search_gitlab_projects(cid, term)
            except Exception:
                continue
            for p in projects:
                pwn = str(p.get("pathWithNamespace") or "")
                if pwn.lower() == path_lower:
                    chosen = (cid, p)
                    break
            if chosen:
                break
        if chosen:
            break

    if not chosen:
        return {
            "action": "bind_repo_failed",
            "summary": (
                f"在 GitLab 上未找到与「{path_ns}」完全一致的项目，或当前令牌无权访问。"
                "请确认路径与凭据。"
            ),
        }

    cred_id, project = chosen
    pid = str(project.get("pathWithNamespace") or project.get("id") or "")
    pname = str(project.get("name") or path_ns.split("/")[-1])
    purl = str(project.get("webUrl") or "")
    if not pid:
        return {"action": "bind_repo_failed", "summary": "解析项目 ID 失败。"}

    existing = await ws_client.list_workspace_repos(workspace_id)
    for r in existing:
        if str(r.get("projectId") or "") == pid:
            return {
                "action": "bind_repo_duplicate",
                "summary": f"仓库「{project.get('pathWithNamespace', path_ns)}」已经绑定到该工作空间。",
            }

    has_primary = any(r.get("isPrimary") for r in existing)
    is_primary = not has_primary

    try:
        await ws_client.create_workspace_repo(
            workspace_id,
            credential_id=cred_id,
            project_id=pid,
            project_name=pname,
            project_url=purl,
            is_primary=is_primary,
        )
    except Exception as exc:
        return {
            "action": "bind_repo_failed",
            "summary": f"绑定失败：{exc}",
        }

    role = "主仓库" if is_primary else "附属仓库"
    return {
        "action": "bind_repo_ok",
        "summary": f"已将「{project.get('pathWithNamespace', path_ns)}」绑定为{role}。",
        "created_repo": {"projectId": pid, "projectName": pname, "webUrl": purl},
    }
