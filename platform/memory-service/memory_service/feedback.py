from __future__ import annotations

import difflib
import logging
from dataclasses import dataclass, field
from typing import Any

from .mem0_client import VibeOSMemory

logger = logging.getLogger(__name__)


@dataclass
class FeedbackSignal:
    workspace_id: str
    agent_type: str
    action_type: str  # approve | reject | edit | ignore
    context: dict[str, Any]
    original_output: str = ""
    modified_output: str = ""


@dataclass
class Preference:
    description: str
    category: str  # tech_stack | coding_style | process | domain_terms | general
    sentiment: str  # positive | negative
    reinforcement_count: int = 1
    metadata: dict[str, Any] = field(default_factory=dict)


class FeedbackProcessor:
    """Converts raw feedback signals into structured preference memories."""

    def __init__(self, memory: VibeOSMemory) -> None:
        self.memory = memory

    def process(self, signal: FeedbackSignal) -> dict[str, Any]:
        handler = {
            "approve": self._handle_approve,
            "reject": self._handle_reject,
            "edit": self._handle_edit,
            "ignore": self._handle_ignore,
        }.get(signal.action_type)

        if handler is None:
            logger.warning("Unknown action_type: %s", signal.action_type)
            return {"status": "skipped", "reason": f"unknown action_type: {signal.action_type}"}

        return handler(signal)

    # ------------------------------------------------------------------

    def _handle_approve(self, signal: FeedbackSignal) -> dict[str, Any]:
        summary = self._summarize_context(signal)
        content = f"[APPROVED] {summary}. The output was accepted as-is."
        if signal.original_output:
            content += f" Output: {_truncate(signal.original_output, 300)}"

        return self._store_preference(
            workspace_id=signal.workspace_id,
            content=content,
            category="general",
            sentiment="positive",
            agent_type=signal.agent_type,
        )

    def _handle_reject(self, signal: FeedbackSignal) -> dict[str, Any]:
        summary = self._summarize_context(signal)
        content = f"[REJECTED] {summary}. The output was rejected."
        if signal.original_output:
            content += f" Original: {_truncate(signal.original_output, 300)}"

        return self._store_preference(
            workspace_id=signal.workspace_id,
            content=content,
            category="general",
            sentiment="negative",
            agent_type=signal.agent_type,
        )

    def _handle_edit(self, signal: FeedbackSignal) -> dict[str, Any]:
        diff_text = _compute_diff(signal.original_output, signal.modified_output)
        summary = self._summarize_context(signal)
        content = (
            f"[EDITED] {summary}. User modified the output.\n"
            f"Diff:\n{diff_text}"
        )

        return self._store_preference(
            workspace_id=signal.workspace_id,
            content=content,
            category=self._infer_category(signal),
            sentiment="positive",
            agent_type=signal.agent_type,
        )

    def _handle_ignore(self, signal: FeedbackSignal) -> dict[str, Any]:
        return {"status": "ignored"}

    # ------------------------------------------------------------------

    def _store_preference(
        self,
        *,
        workspace_id: str,
        content: str,
        category: str,
        sentiment: str,
        agent_type: str,
    ) -> dict[str, Any]:
        metadata = {
            "layer": "preference",
            "category": category,
            "sentiment": sentiment,
            "agent_type": agent_type,
        }
        result = self.memory.add_preference(
            content=content,
            workspace_id=workspace_id,
            metadata=metadata,
        )
        return {"status": "stored", "result": result}

    def get_aggregated_preferences(
        self, workspace_id: str
    ) -> dict[str, list[dict[str, Any]]]:
        all_prefs = self.memory.get_all_preferences(workspace_id)

        buckets: dict[str, list[dict[str, Any]]] = {
            "tech_stack": [],
            "coding_style": [],
            "process": [],
            "domain_terms": [],
            "general": [],
        }

        for pref in all_prefs:
            meta = pref.get("metadata", {})
            cat = meta.get("category", "general")
            bucket = buckets.get(cat, buckets["general"])
            bucket.append(pref)

        return buckets

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _summarize_context(signal: FeedbackSignal) -> str:
        ctx = signal.context
        parts: list[str] = []
        if agent := ctx.get("agent_type", signal.agent_type):
            parts.append(f"Agent: {agent}")
        if task := ctx.get("task"):
            parts.append(f"Task: {task}")
        if file_path := ctx.get("file_path"):
            parts.append(f"File: {file_path}")
        return "; ".join(parts) if parts else "General context"

    @staticmethod
    def _infer_category(signal: FeedbackSignal) -> str:
        ctx_keys = set(signal.context.keys())
        if ctx_keys & {"language", "framework", "library", "package"}:
            return "tech_stack"
        if ctx_keys & {"style", "format", "naming", "lint"}:
            return "coding_style"
        if ctx_keys & {"workflow", "process", "pipeline", "ci"}:
            return "process"
        if ctx_keys & {"term", "domain", "glossary"}:
            return "domain_terms"
        return "general"


# ------------------------------------------------------------------
# Utilities
# ------------------------------------------------------------------


def _compute_diff(original: str, modified: str) -> str:
    orig_lines = original.splitlines(keepends=True)
    mod_lines = modified.splitlines(keepends=True)
    diff = difflib.unified_diff(orig_lines, mod_lines, lineterm="")
    return "".join(diff)[:2000]


def _truncate(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."
