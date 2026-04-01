"""User context system -- personal preferences and custom instructions."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from pydantic import BaseModel, Field

from .config import config

logger = logging.getLogger(__name__)


class UserContext(BaseModel):
    """User-level context that enriches all agent interactions."""

    user_id: str
    workspace_id: str | None = None
    custom_instructions: str = ""
    preferences: dict[str, Any] = Field(default_factory=dict)
    active_skills: list[str] = Field(default_factory=list)

    def get_prompt_injection(self) -> str:
        """Build a system prompt fragment from the user's custom instructions."""
        parts: list[str] = []
        if self.custom_instructions:
            parts.append(f"## User Custom Instructions\n{self.custom_instructions}")
        if self.preferences:
            pref_lines = "\n".join(f"- {k}: {v}" for k, v in self.preferences.items())
            parts.append(f"## User Preferences\n{pref_lines}")
        return "\n\n".join(parts) if parts else ""


class UserContextClient:
    """Fetches user context from workspace-svc ``/api/ext/user-context``."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = (base_url or config.workspace_svc_url).rstrip("/")
        self._http = httpx.AsyncClient(base_url=self._base, timeout=10)

    async def get(
        self, user_id: str, workspace_id: str | None = None
    ) -> UserContext | None:
        params: dict[str, str] = {"userId": user_id}
        if workspace_id:
            params["workspaceId"] = workspace_id
        try:
            resp = await self._http.get("/api/ext/user-context", params=params)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            data = resp.json().get("data", {})
            return UserContext(
                user_id=data.get("userId", user_id),
                workspace_id=data.get("workspaceId"),
                custom_instructions=data.get("customInstructions", ""),
                preferences=data.get("preferences", {}),
                active_skills=data.get("activeSkills", []),
            )
        except Exception:
            logger.debug("Failed to fetch user context for %s", user_id, exc_info=True)
            return None

    async def upsert(
        self,
        user_id: str,
        *,
        workspace_id: str | None = None,
        custom_instructions: str | None = None,
        preferences: dict[str, Any] | None = None,
        active_skills: list[str] | None = None,
    ) -> UserContext | None:
        body: dict[str, Any] = {"userId": user_id}
        if workspace_id:
            body["workspaceId"] = workspace_id
        if custom_instructions is not None:
            body["customInstructions"] = custom_instructions
        if preferences is not None:
            body["preferences"] = preferences
        if active_skills is not None:
            body["activeSkills"] = active_skills
        try:
            resp = await self._http.post("/api/ext/user-context", json=body)
            resp.raise_for_status()
            data = resp.json().get("data", {})
            return UserContext(
                user_id=data.get("userId", user_id),
                workspace_id=data.get("workspaceId"),
                custom_instructions=data.get("customInstructions", ""),
                preferences=data.get("preferences", {}),
                active_skills=data.get("activeSkills", []),
            )
        except Exception:
            logger.debug("Failed to upsert user context for %s", user_id, exc_info=True)
            return None

    async def close(self) -> None:
        await self._http.aclose()
