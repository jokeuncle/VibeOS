"""Requirement Agent implementation."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

from vibeos_agent import (
    AgentEvent,
    AgentStatus,
    AgentTask,
    AgentType,
    BaseAgent,
    CapabilityContract,
    Message,
    RichBlock,
)

SYSTEM_PROMPT = """\
You are an expert requirements analyst. You help teams capture, refine, and \
structure project requirements with precision and clarity.

Your responsibilities:
- Analyze raw requirements and extract actionable user stories
- Define clear acceptance criteria for each requirement
- Identify constraints (technical, business, regulatory)
- Detect gaps and ambiguities in requirements

When responding, structure your output as JSON with the following shape:
{
  "summary": "brief summary",
  "user_stories": [
    {"role": "...", "action": "...", "benefit": "...", "priority": "high|medium|low"}
  ],
  "acceptance_criteria": [
    {"story_ref": "...", "given": "...", "when": "...", "then": "..."}
  ],
  "constraints": [
    {"type": "technical|business|regulatory", "description": "..."}
  ],
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}
Always be thorough, precise, and flag any ambiguities.\
"""

CHAT_PROMPT = """\
You are an expert requirements analyst having a conversation. Respond in clear, \
well-structured natural language (use markdown formatting when helpful). \
Help the user refine requirements, write user stories, and define acceptance criteria. \
Do NOT respond with raw JSON—use prose, bullet points, and tables.\
"""

TASK_PROMPTS: dict[str, dict[str, str]] = {
    "Requirement Clarification": {
        "system": (
            "You are an expert requirements analyst focused on CLARIFICATION.\n"
            "Your task: analyze the raw requirement description, identify ambiguities, "
            "resolve them with reasonable assumptions, and produce a clear, unambiguous "
            "scope statement.\n\n"
            "Output JSON:\n"
            '{"scope_statement": "...", "clarified_points": [{"original": "...", "clarified": "...", "assumption": "..."}], '
            '"open_questions": ["..."], "boundaries": {"in_scope": ["..."], "out_of_scope": ["..."]}}'
        ),
        "artifact_type": "clarified_requirements",
    },
    "Stakeholder & User Role Analysis": {
        "system": (
            "You are an expert requirements analyst focused on STAKEHOLDER ANALYSIS.\n"
            "Your task: identify all stakeholders and user roles, define personas with "
            "their goals, pain points, and interaction patterns.\n\n"
            "Output JSON:\n"
            '{"stakeholders": [{"role": "...", "type": "primary|secondary|tertiary", '
            '"goals": ["..."], "pain_points": ["..."], "influence": "high|medium|low"}], '
            '"personas": [{"name": "...", "role": "...", "background": "...", "goals": ["..."], "scenarios": ["..."]}]}'
        ),
        "artifact_type": "stakeholder_analysis",
    },
    "User Story Decomposition": {
        "system": (
            "You are an expert requirements analyst focused on USER STORY DECOMPOSITION.\n"
            "Your task: break down the requirement into actionable user stories following "
            "the 'As a [role], I want [action], so that [benefit]' format. Assign priorities.\n\n"
            "Output JSON:\n"
            '{"user_stories": [{"id": "US-001", "role": "...", "action": "...", "benefit": "...", '
            '"priority": "must_have|should_have|could_have|wont_have", "complexity": "S|M|L|XL", '
            '"dependencies": ["US-xxx"]}]}'
        ),
        "artifact_type": "user_stories",
    },
    "Acceptance Criteria Definition": {
        "system": (
            "You are an expert requirements analyst focused on ACCEPTANCE CRITERIA.\n"
            "Your task: define precise, testable acceptance criteria for each user story "
            "using the Given/When/Then format.\n\n"
            "Output JSON:\n"
            '{"acceptance_criteria": [{"story_id": "US-001", "criteria": ['
            '{"id": "AC-001", "given": "...", "when": "...", "then": "...", "notes": "..."}]}]}'
        ),
        "artifact_type": "acceptance_criteria",
    },
    "Non-functional Requirements & Constraints": {
        "system": (
            "You are an expert requirements analyst focused on NON-FUNCTIONAL REQUIREMENTS.\n"
            "Your task: systematically identify NFRs across performance, security, scalability, "
            "reliability, usability, and compliance. Also identify technical and business constraints.\n\n"
            "Output JSON:\n"
            '{"nfrs": [{"category": "performance|security|scalability|reliability|usability|compliance", '
            '"requirement": "...", "metric": "...", "target": "...", "priority": "must|should|could"}], '
            '"constraints": [{"type": "technical|business|regulatory|timeline", "description": "...", "impact": "..."}], '
            '"assumptions": [{"description": "...", "risk_if_wrong": "..."}]}'
        ),
        "artifact_type": "nfr_constraints",
    },
    "PRD Document Generation": {
        "system": (
            "You are an expert requirements analyst generating a comprehensive PRD.\n"
            "Your task: synthesize ALL prior analysis (clarification, stakeholders, user stories, "
            "acceptance criteria, NFRs) into a single, well-structured Product Requirements Document.\n\n"
            "The PRD should be in MARKDOWN format (not JSON) with these sections:\n"
            "1. Executive Summary\n"
            "2. Problem Statement & Goals\n"
            "3. Stakeholders & User Personas\n"
            "4. Functional Requirements (user stories with acceptance criteria)\n"
            "5. Non-functional Requirements\n"
            "6. Constraints & Assumptions\n"
            "7. Dependencies (reference related requirements if any)\n"
            "8. Success Metrics\n"
            "9. Open Questions & Risks\n\n"
            "If related requirements context is provided, explicitly reference their "
            "decisions and ensure consistency."
        ),
        "artifact_type": "prd_document",
    },
}

import re as _re


def _extract_json(text: str) -> dict[str, Any]:
    """Extract a JSON object from LLM output that may contain trailing prose."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = _re.search(r'\{[\s\S]*\}', text)
    if m:
        candidate = m.group()
        while candidate:
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                last_brace = candidate.rfind('}', 0, len(candidate) - 1)
                if last_brace == -1:
                    break
                candidate = candidate[:last_brace + 1]
    return {"summary": text, "user_stories": [], "acceptance_criteria": [], "constraints": [], "tasks": []}


class RequirementAgent(BaseAgent):
    agent_type = AgentType.REQUIREMENT
    system_prompt = SYSTEM_PROMPT

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        self.tool_registry.register_many(create_workspace_tools(self.workspace_svc, "requirement"))
        self.tool_registry.register_many(create_delegation_tools("requirement"))

    capabilities = [
        CapabilityContract(
            name="requirements",
            required_context_window=16_000,
        ),
    ]

    async def execute(self, task: AgentTask) -> AsyncIterator[AgentEvent]:
        yield self._make_event("status", task.workspace_id, {"status": AgentStatus.RUNNING})
        _log = self.ws.publish_log
        agent_name = self.agent_type

        try:
            await self.ws.publish_agent_status(
                task.workspace_id, self.agent_type, AgentStatus.RUNNING, detail=task.intent
            )
            await _log(task.workspace_id, agent_name, f"Starting task: {task.intent}", task_id=task.task_id)

            user_msg = task.user_message or task.description

            # Determine task-specific prompt and artifact type
            task_title = task.context.get("task_title", "")
            task_config = TASK_PROMPTS.get(task_title)

            if task_config:
                system_prompt = task_config["system"]
                artifact_type = task_config["artifact_type"]
            else:
                system_prompt = SYSTEM_PROMPT
                artifact_type = "requirements_spec"

            # Build context from phase artifacts and related requirements
            context_sections: list[str] = []
            phase_artifacts = task.context.get("phase_artifacts", [])
            if phase_artifacts:
                parts = []
                for pa in phase_artifacts:
                    parts.append(f"### {pa.get('title', '')} ({pa.get('type', '')})\n{pa.get('content', '')[:3000]}")
                context_sections.append("## Previous Analysis Steps\n\n" + "\n\n---\n\n".join(parts))

            related_artifacts = task.context.get("related_artifacts", {})
            if related_artifacts:
                _LABELS = {
                    "depends_on": "Dependency", "parent_of": "Parent Requirement",
                    "related_to": "Related Requirement", "evolves_from": "Previous Version",
                    "conflicts_with": "Conflicting Requirement",
                }
                parts = []
                for rel_type, arts in related_artifacts.items():
                    label = _LABELS.get(rel_type, rel_type)
                    for art in arts[:5]:
                        parts.append(f"### [{label}] {art.get('title', '')} ({art.get('type', '')})\n{art.get('content', '')[:3000]}")
                if parts:
                    context_sections.append("## Related Requirements Context\n\n" + "\n\n---\n\n".join(parts))

            req_desc = task.context.get("requirement_description", "")
            if req_desc:
                context_sections.append(f"## Requirement Description\n\n{req_desc}")

            context_block = "\n\n".join(context_sections)

            prompt = (
                f"Task: {task.intent}\n"
                f"Description: {task.description}\n"
                f"User request: {user_msg}\n"
            )
            if context_block:
                prompt += f"\n\n{context_block}"

            self._current_task_context = task.context

            await _log(task.workspace_id, agent_name, f"Calling LLM for: {task_title or 'requirements analysis'}…", task_id=task.task_id)

            saved_prompt = self.system_prompt
            self.system_prompt = system_prompt
            try:
                raw_reply = await self._call_llm_with_tools(prompt, workspace_id=task.workspace_id)
            finally:
                self.system_prompt = saved_prompt

            await _log(task.workspace_id, agent_name, "LLM response received. Parsing structured output…", level="success", task_id=task.task_id)

            structured = _extract_json(raw_reply)

            yield self._make_event(
                "progress", task.workspace_id, {"progress": 0.5, "detail": f"Saving {artifact_type}"}
            )

            try:
                await self._upsert_artifact(
                    task.workspace_id,
                    artifact_type=artifact_type,
                    title=f"{task_title}: {task.description[:60]}" if task_title else f"Requirements: {task.description[:80]}",
                    content=raw_reply,
                )
                await _log(task.workspace_id, agent_name, f"Artifact ({artifact_type}) saved", level="success", task_id=task.task_id)
            except Exception as exc:
                await _log(task.workspace_id, agent_name, f"Failed to save artifact: {exc}", level="error", task_id=task.task_id)

            rich_blocks: list[RichBlock] = []
            for story in structured.get("user_stories", []):
                role = story.get("role", "user")
                action = story.get("action", "")
                rich_blocks.append(
                    RichBlock(
                        type="code",
                        language="markdown",
                        content=f"As a {role}, I want to {action}",
                        metadata={"title": f"User Story – {role}", "priority": story.get("priority", "medium")},
                    )
                )

            msg = self._make_message(
                task.workspace_id,
                structured.get("summary", raw_reply[:200]),
                rich_blocks=rich_blocks,
            )
            await self.session.append(task.workspace_id, self.agent_type, msg)
            await self.ws.publish_message(task.workspace_id, msg)

            await _log(task.workspace_id, agent_name, "Execution complete.", level="success", task_id=task.task_id)

            yield self._make_event(
                "result",
                task.workspace_id,
                {
                    "summary": structured.get("summary", raw_reply[:200]),
                    "artifact_type": artifact_type,
                    "task_title": task_title,
                },
            )
        except Exception as exc:
            try:
                await _log(task.workspace_id, agent_name, f"Execution failed: {exc}", level="error", task_id=task.task_id)
            except Exception:
                pass
            yield self._make_event("error", task.workspace_id, {"error": "execute failed"})
            raise
        finally:
            try:
                await self.ws.publish_agent_status(
                    task.workspace_id, self.agent_type, AgentStatus.IDLE
                )
            except Exception:
                pass

    async def chat(
        self, message: str, *, workspace_id: str, context: dict[str, Any] | None = None
    ) -> AsyncIterator[Message]:
        user_msg = Message(
            id=uuid.uuid4().hex,
            workspace_id=workspace_id,
            agent_type=self.agent_type,
            role="user",
            content=message,
            timestamp=datetime.now(timezone.utc),
        )
        await self.session.append(workspace_id, self.agent_type, user_msg)

        try:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.RUNNING
            )

            reply_text = await self._call_llm(message, workspace_id=workspace_id)

            reply_msg = self._make_message(workspace_id, reply_text)
            await self.session.append(workspace_id, self.agent_type, reply_msg)

            yield reply_msg
        except Exception:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.ERROR, detail="Chat failed"
            )
            raise
        finally:
            try:
                await self.ws.publish_agent_status(
                    workspace_id, self.agent_type, AgentStatus.IDLE
                )
            except Exception:
                pass

    async def chat_stream(
        self, message: str, *, workspace_id: str, context: dict[str, Any] | None = None
    ) -> AsyncIterator[str]:
        """Stream chat response token-by-token."""
        user_msg = Message(
            id=uuid.uuid4().hex,
            workspace_id=workspace_id,
            agent_type=self.agent_type,
            role="user",
            content=message,
            timestamp=datetime.now(timezone.utc),
        )
        await self.session.append(workspace_id, self.agent_type, user_msg)

        try:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.RUNNING
            )

            full_reply = ""
            async for delta in self._call_llm_stream(
                message,
                workspace_id=workspace_id,
                system_prompt_override=CHAT_PROMPT,
            ):
                full_reply += delta
                yield delta

            reply_msg = self._make_message(workspace_id, full_reply)
            await self.session.append(workspace_id, self.agent_type, reply_msg)
        except Exception:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.ERROR, detail="Chat stream failed"
            )
            raise
        finally:
            try:
                await self.ws.publish_agent_status(
                    workspace_id, self.agent_type, AgentStatus.IDLE
                )
            except Exception:
                pass
