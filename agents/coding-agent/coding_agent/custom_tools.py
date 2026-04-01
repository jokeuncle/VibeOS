"""Custom OpenHands tools for VibeOS integration.

Provides ProgressTool (WebSocket progress events) and ArtifactTool
(save artifacts to workspace-svc) following the OpenHands
Action / Observation / Executor pattern.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Sequence
from typing import Any

import httpx
from pydantic import Field

from openhands.sdk import (
    Action,
    ImageContent,
    Observation,
    TextContent,
    ToolDefinition,
)
from openhands.sdk.tool import ToolExecutor, register_tool

logger = logging.getLogger(__name__)

_WS_GATEWAY_URL = os.getenv("WS_GATEWAY_URL", "http://localhost:8020")
_WORKSPACE_SVC_URL = os.getenv("WORKSPACE_SVC_URL", "http://localhost:8010")
_PUBLISH_SECRET = os.getenv("PUBLISH_SECRET", "vibeos-internal")


# ---------------------------------------------------------------------------
# ProgressTool – publish real-time status to ws-gateway
# ---------------------------------------------------------------------------

class ProgressAction(Action):
    workspace_id: str = Field(description="VibeOS workspace ID")
    status: str = Field(description="Short status line, e.g. 'Reading files…'")
    detail: str = Field(default="", description="Optional longer detail")


class ProgressObservation(Observation):
    published: bool = True

    @property
    def to_llm_content(self) -> Sequence[TextContent | ImageContent]:
        return [TextContent(text="Progress event published.")]


class ProgressExecutor(ToolExecutor[ProgressAction, ProgressObservation]):
    def __call__(
        self, action: ProgressAction, conversation: Any = None,
    ) -> ProgressObservation:
        payload = {
            "type": "agent:log",
            "workspaceId": action.workspace_id,
            "payload": {
                "agentType": "coding",
                "message": action.status,
                "detail": action.detail,
            },
        }
        try:
            with httpx.Client(timeout=5) as client:
                client.post(
                    f"{_WS_GATEWAY_URL}/api/publish",
                    json=payload,
                    headers={"X-Internal-Token": _PUBLISH_SECRET},
                )
        except Exception:
            logger.debug("Failed to publish progress event", exc_info=True)

        return ProgressObservation()


class ProgressTool(ToolDefinition[ProgressAction, ProgressObservation]):
    @classmethod
    def create(cls, conv_state: Any, **kwargs: Any) -> Sequence[ToolDefinition]:
        return [
            cls(
                description=(
                    "Publish a progress update so the user can see what you are doing. "
                    "Call this before starting a major step (e.g. reading code, writing files, running tests)."
                ),
                action_type=ProgressAction,
                observation_type=ProgressObservation,
                executor=ProgressExecutor(),
            )
        ]


# ---------------------------------------------------------------------------
# ArtifactTool – save an artifact to workspace-svc
# ---------------------------------------------------------------------------

class ArtifactAction(Action):
    workspace_id: str = Field(description="VibeOS workspace ID")
    title: str = Field(description="Artifact title")
    content: str = Field(description="Artifact content (code, summary, etc.)")
    artifact_type: str = Field(default="code", description="Type: code, doc, test, etc.")


class ArtifactObservation(Observation):
    artifact_id: str = ""
    saved: bool = True

    @property
    def to_llm_content(self) -> Sequence[TextContent | ImageContent]:
        return [TextContent(text=f"Artifact saved (id={self.artifact_id}).")]


class ArtifactExecutor(ToolExecutor[ArtifactAction, ArtifactObservation]):
    def __call__(
        self, action: ArtifactAction, conversation: Any = None,
    ) -> ArtifactObservation:
        body = {
            "agent_type": "coding",
            "type": action.artifact_type,
            "title": action.title,
            "content": action.content,
        }
        aid = ""
        try:
            with httpx.Client(base_url=_WORKSPACE_SVC_URL, timeout=15) as client:
                resp = client.post(
                    f"/api/workspaces/{action.workspace_id}/artifacts",
                    json=body,
                )
                resp.raise_for_status()
                aid = resp.json().get("data", {}).get("id", "")
        except Exception:
            logger.debug("Failed to save artifact", exc_info=True)

        return ArtifactObservation(artifact_id=aid)


class ArtifactTool(ToolDefinition[ArtifactAction, ArtifactObservation]):
    @classmethod
    def create(cls, conv_state: Any, **kwargs: Any) -> Sequence[ToolDefinition]:
        return [
            cls(
                description=(
                    "Save a code artifact (summary, implementation plan, etc.) to the "
                    "VibeOS workspace so the user can review it later."
                ),
                action_type=ArtifactAction,
                observation_type=ArtifactObservation,
                executor=ArtifactExecutor(),
            )
        ]


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

register_tool(ProgressTool.__name__, ProgressTool)
register_tool(ArtifactTool.__name__, ArtifactTool)
