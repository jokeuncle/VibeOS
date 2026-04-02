"""WSGatewayClient – publishes real-time events to the ws-gateway."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import httpx

from ..config import config
from ..models import AgentStatus, AgentType, Message
from ._utils import _enum_val


class WSGatewayClient:
    """Publishes real-time events to the ws-gateway."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or config.ws_gateway_url
        self._publish_secret = os.environ.get("PUBLISH_SECRET", "vibeos-internal")
        self._http = httpx.AsyncClient(base_url=self._base, timeout=10)

    async def publish(self, event: dict[str, Any]) -> None:
        import logging
        _ws_log = logging.getLogger("vibeos_agent.ws")
        try:
            resp = await self._http.post(
                "/api/publish",
                json=event,
                headers={"X-Internal-Token": self._publish_secret},
            )
            if resp.status_code != 200:
                _ws_log.warning(
                    "ws-gateway publish %s: %s (base=%s, event=%s)",
                    resp.status_code, resp.text[:100], self._base, event.get("type", "?"),
                )
        except Exception as exc:
            _ws_log.debug("ws-gateway publish failed (non-fatal): %s", exc)

    async def publish_agent_status(
        self,
        workspace_id: str,
        agent_type: "AgentType | str",
        status: AgentStatus,
        *,
        detail: str = "",
        progress: float = 0.0,
    ) -> None:
        await self.publish(
            {
                "type": "agent:status",
                "workspaceId": workspace_id,
                "agentType": _enum_val(agent_type),
                "status": status.value,
                "detail": detail,
                "progress": progress,
            }
        )

    async def publish_message(
        self, workspace_id: str, message: Message
    ) -> None:
        await self.publish(
            {
                "type": "agent:message",
                "workspaceId": workspace_id,
                "payload": {"message": message.model_dump(mode="json", exclude_none=True)},
            }
        )

    async def publish_log(
        self,
        workspace_id: str,
        agent_type: str,
        message: str,
        *,
        level: str = "info",
        task_id: str = "",
    ) -> None:
        await self.publish(
            {
                "type": "agent:log",
                "workspaceId": workspace_id,
                "payload": {
                    "taskId": task_id,
                    "agent": agent_type,
                    "level": level,
                    "message": message,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            }
        )

    async def close(self) -> None:
        await self._http.aclose()
