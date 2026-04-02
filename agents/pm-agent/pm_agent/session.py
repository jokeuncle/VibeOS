"""Unified Execution Session manager for VibeOS SSE protocol.

Every frontend-AI interaction is modeled as an ExecutionSession with a
standardized SSE frame format:

    event: <category>:<action>
    data: {"sid": "<session-id>", ...payload}

Categories: session, intent, timeline, content, task, phase, project, graph, agent
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from vibeos_agent import WorkspaceClient, WSGatewayClient


class SessionManager:
    """Creates, tracks, and emits unified SSE events for execution sessions."""

    def __init__(self, ws_client: WorkspaceClient, ws_gw: WSGatewayClient) -> None:
        self.ws_client = ws_client
        self.ws_gw = ws_gw

    async def create(
        self,
        session_type: str,
        workspace_id: str,
        *,
        user_message: str = "",
        intent_type: str = "",
        intent_summary: str = "",
        agent_type: str = "pm",
        triggered_by: str = "user",
        requirement_id: str | None = None,
        task_ids: list[str] | None = None,
        result_type: str = "",
        parent_execution_id: str | None = None,
        workspace_persist: bool = True,
    ) -> str:
        """Create a new session; optionally persist AgentExecution to workspace-svc.

        NLP streaming sets workspace_persist=False and persists after intent is known
        so intent_type/agent_type/requirement_id match parse_intent (avoids double INSERT).
        """
        sid = uuid.uuid4().hex
        if workspace_persist and workspace_id and workspace_id != "__home__":
            try:
                await self.ws_client.create_execution(
                    workspace_id,
                    execution_id=sid,
                    requirement_id=requirement_id,
                    task_ids=task_ids or [],
                    intent_type=intent_type or session_type,
                    intent_summary=intent_summary or user_message[:60],
                    triggered_by=triggered_by,
                    user_message=user_message,
                    agent_type=agent_type,
                    result_type=result_type or "general",
                    parent_execution_id=parent_execution_id,
                )
            except Exception:
                pass
        return sid

    def ev(self, sid: str, category: str, action: str, payload: dict[str, Any] | None = None) -> str:
        """Build a unified SSE frame string."""
        data: dict[str, Any] = {"sid": sid}
        if payload:
            data.update(payload)
        return f"event: {category}:{action}\ndata: {json.dumps(data)}\n\n"

    def session_start(self, sid: str, session_type: str, workspace_id: str) -> str:
        return self.ev(sid, "session", "start", {"type": session_type, "workspaceId": workspace_id})

    def session_complete(self, sid: str, status: str = "success") -> str:
        return self.ev(sid, "session", "complete", {"status": status})

    def session_error(self, sid: str, error: str, error_type: str = "system_error") -> str:
        return self.ev(sid, "session", "error", {"error": error, "error_type": error_type})

    def timeline(self, sid: str, step_id: str, label: str, status: str, detail: str = "") -> str:
        payload: dict[str, str] = {"step_id": step_id, "label": label, "status": status}
        if detail:
            payload["detail"] = detail
        return self.ev(sid, "timeline", "step", payload)

    def content_delta(self, sid: str, delta: str) -> str:
        return self.ev(sid, "content", "delta", {"delta": delta})

    def content_block(self, sid: str, block_type: str, block_data: dict[str, Any]) -> str:
        return self.ev(sid, "content", "block", {"blockType": block_type, **block_data})

    def content_payload(self, sid: str, payload: dict[str, Any]) -> str:
        return self.ev(sid, "content", "payload", {"payload": payload})

    async def finish(
        self,
        sid: str,
        workspace_id: str,
        status: str = "success",
        error_message: str | None = None,
        *,
        steps: str | None = None,
    ) -> None:
        """Mark the persistent AgentExecution as terminal; optional steps JSON array."""
        if workspace_id and workspace_id != "__home__":
            try:
                await self.ws_client.update_execution(
                    workspace_id,
                    sid,
                    status=status,
                    error_message=error_message,
                    steps=steps,
                )
            except Exception:
                pass

    async def broadcast(
        self,
        workspace_id: str,
        sid: str,
        category: str,
        action: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        """Broadcast an event through WebSocket gateway."""
        try:
            await self.ws_gw.publish({
                "type": f"{category}:{action}",
                "workspaceId": workspace_id,
                "sid": sid,
                **(payload or {}),
            })
        except Exception:
            pass

    @staticmethod
    def done() -> str:
        return "data: [DONE]\n\n"

    @staticmethod
    def parse(sse_str: str) -> tuple[str, str, dict[str, Any]] | None:
        """Parse an SSE frame string back into (category, action, data).

        Returns None for non-event lines (e.g. ``data: [DONE]``).
        """
        event_name = ""
        data_str = ""
        for line in sse_str.strip().split("\n"):
            if line.startswith("event: "):
                event_name = line[7:]
            elif line.startswith("data: "):
                data_str = line[6:]
        if not event_name or not data_str:
            return None
        parts = event_name.split(":", 1)
        if len(parts) != 2:
            return None
        try:
            data = json.loads(data_str)
        except (json.JSONDecodeError, TypeError):
            return None
        return (parts[0], parts[1], data)
