"""Requirement Agent implementation (SDLCAgent subclass)."""

from __future__ import annotations

import json
from typing import Any

from vibeos_agent import (
    AgentTask,
    AgentType,
    CapabilityContract,
    RichBlock,
)
from vibeos_agent.sdlc_agent import ArtifactConfig, SDLCAgent

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
Always be thorough, precise, and flag any ambiguities.

## MANDATORY: Artifact Creation
You MUST call workspace_create_artifact for EACH deliverable before finishing. \
Failure to persist artifacts means downstream phases have no input.
Required artifacts for this phase:
1. clarified_requirements — refined requirement analysis
2. prd_document — complete PRD with scope, features, constraints

## Available Tools (all tools are available; key ones for this phase listed first)
- workspace_create_artifact: Persist deliverables to workspace. YOU MUST CALL THIS.
- workspace_query_artifacts: Query prior artifacts for context.
- workspace_create_task: Create follow-up tasks.
- workspace_query_phases: Check current phase/task status.\
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


class RequirementAgent(SDLCAgent):
    agent_type = AgentType.REQUIREMENT
    system_prompt = SYSTEM_PROMPT
    chat_prompt = CHAT_PROMPT
    phase_key = "requirement"

    artifact_configs = [
        ArtifactConfig(type="clarified_requirements", language="markdown"),
        ArtifactConfig(type="prd_document", language="markdown"),
        ArtifactConfig(type="user_stories", language="json"),
        ArtifactConfig(type="acceptance_criteria", language="json"),
        ArtifactConfig(type="stakeholder_analysis", language="json"),
        ArtifactConfig(type="nfr_constraints", language="json"),
    ]

    capabilities = [
        CapabilityContract(
            name="analyze",
            required_context_window=16_000,
        ),
    ]

    def _build_execute_prompt(self, task: AgentTask) -> str:
        user_msg = task.user_message or task.description
        task_title = task.context.get("task_title", "")
        task_config = TASK_PROMPTS.get(task_title)

        if task_config:
            self._task_system_override = task_config["system"]

        parts = [
            f"Task: {task.intent}",
            f"Description: {task.description}",
            f"User request: {user_msg}",
        ]

        phase_artifacts = task.context.get("phase_artifacts", [])
        if phase_artifacts:
            art_parts = [
                f"### {pa.get('title', '')} ({pa.get('type', '')})\n{pa.get('content', '')[:3000]}"
                for pa in phase_artifacts
            ]
            parts.append("## Previous Analysis Steps\n\n" + "\n\n---\n\n".join(art_parts))

        related_artifacts = task.context.get("related_artifacts", {})
        if related_artifacts:
            _LABELS = {
                "depends_on": "Dependency", "parent_of": "Parent Requirement",
                "related_to": "Related Requirement", "evolves_from": "Previous Version",
                "conflicts_with": "Conflicting Requirement",
            }
            rel_parts = []
            for rel_type, arts in related_artifacts.items():
                label = _LABELS.get(rel_type, rel_type)
                for art in arts[:5]:
                    rel_parts.append(
                        f"### [{label}] {art.get('title', '')} ({art.get('type', '')})\n"
                        f"{art.get('content', '')[:3000]}"
                    )
            if rel_parts:
                parts.append("## Related Requirements Context\n\n" + "\n\n---\n\n".join(rel_parts))

        req_desc = task.context.get("requirement_description", "")
        if req_desc:
            parts.append(f"## Requirement Description\n\n{req_desc}")

        return "\n\n".join(parts)

    async def _post_process(
        self,
        task: AgentTask,
        structured: dict[str, Any],
        rich_blocks: list[RichBlock],
    ) -> None:
        for story in structured.get("user_stories", []):
            role = story.get("role", "user")
            action = story.get("action", "")
            rich_blocks.append(
                RichBlock(
                    type="code",
                    language="markdown",
                    content=f"As a {role}, I want to {action}",
                    metadata={
                        "title": f"User Story \u2013 {role}",
                        "priority": story.get("priority", "medium"),
                    },
                )
            )
