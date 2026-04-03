"""Built-in skill definitions for VibeOS agents.

These skills provide reusable prompt fragments that can be activated per
workspace. They're registered as default entries when no workspace-specific
configuration is found.
"""

from __future__ import annotations

from .skills import Skill

# ---------------------------------------------------------------------------
# 7a. Artifact Discipline
# ---------------------------------------------------------------------------

SDLC_ARTIFACT_DISCIPLINE = Skill(
    id="builtin:sdlc-artifact-discipline",
    name="sdlc-artifact-discipline",
    description="Enforces artifact creation discipline across all SDLC phases",
    applicable_agents=[],  # empty = applies to all agents
    prompt_fragments=[
        (
            "## MANDATORY: Artifact Discipline\n"
            "You MUST persist ALL deliverables by calling `workspace_create_artifact` "
            "before finishing your task. Failure to persist artifacts means downstream "
            "phases have no input and the project pipeline stalls.\n\n"
            "Rules:\n"
            "1. Call `workspace_query_artifacts` FIRST to load upstream context.\n"
            "2. Produce each required artifact for your phase.\n"
            "3. Call `workspace_create_artifact` for EACH artifact — do NOT skip this step.\n"
            "4. Use `workspace_create_task` to create follow-up tasks when applicable.\n"
            "5. Use `workspace_query_phases` to check current phase/task status.\n\n"
            "The artifact type should match your phase's contract (e.g. 'prd_document', "
            "'adr', 'design_spec', 'code', 'test_plan', etc.)."
        ),
    ],
)

# ---------------------------------------------------------------------------
# 7b. Requirement Playbook
# ---------------------------------------------------------------------------

_REQ_TASKS = {
    "clarification": (
        "Analyze the raw requirement description, identify ambiguities, "
        "resolve them with reasonable assumptions, and produce a clear, "
        "unambiguous scope statement.\n\n"
        "Output JSON:\n"
        '{"scope_statement": "...", "clarified_points": [{"original": "...", '
        '"clarified": "...", "assumption": "..."}], '
        '"open_questions": ["..."], "boundaries": {"in_scope": ["..."], '
        '"out_of_scope": ["..."]}}'
    ),
    "stakeholder_analysis": (
        "Identify all stakeholders and user roles, define personas with "
        "their goals, pain points, and interaction patterns.\n\n"
        "Output JSON:\n"
        '{"stakeholders": [{"role": "...", "type": "primary|secondary|tertiary", '
        '"goals": ["..."], "pain_points": ["..."], '
        '"influence": "high|medium|low"}], '
        '"personas": [{"name": "...", "role": "...", "background": "...", '
        '"goals": ["..."], "scenarios": ["..."]}]}'
    ),
    "user_story_decomposition": (
        "Break down the requirement into actionable user stories following "
        "the 'As a [role], I want [action], so that [benefit]' format. "
        "Assign priorities.\n\n"
        "Output JSON:\n"
        '{"user_stories": [{"id": "US-001", "role": "...", "action": "...", '
        '"benefit": "...", "priority": "must_have|should_have|could_have|wont_have", '
        '"complexity": "S|M|L|XL", "dependencies": ["US-xxx"]}]}'
    ),
    "acceptance_criteria": (
        "Define precise, testable acceptance criteria for each user story "
        "using the Given/When/Then format.\n\n"
        "Output JSON:\n"
        '{"acceptance_criteria": [{"story_id": "US-001", "criteria": ['
        '{"id": "AC-001", "given": "...", "when": "...", "then": "...", '
        '"notes": "..."}]}]}'
    ),
    "nfr_constraints": (
        "Systematically identify NFRs across performance, security, scalability, "
        "reliability, usability, and compliance. Also identify technical and "
        "business constraints.\n\n"
        "Output JSON:\n"
        '{"nfrs": [{"category": "performance|security|scalability|reliability|'
        'usability|compliance", "requirement": "...", "metric": "...", '
        '"target": "...", "priority": "must|should|could"}], '
        '"constraints": [{"type": "technical|business|regulatory|timeline", '
        '"description": "...", "impact": "..."}], '
        '"assumptions": [{"description": "...", "risk_if_wrong": "..."}]}'
    ),
    "prd_generation": (
        "Synthesize ALL prior analysis (clarification, stakeholders, user stories, "
        "acceptance criteria, NFRs) into a single, well-structured Product "
        "Requirements Document in MARKDOWN format with sections:\n"
        "1. Executive Summary\n"
        "2. Problem Statement & Goals\n"
        "3. Stakeholders & User Personas\n"
        "4. Functional Requirements (user stories with acceptance criteria)\n"
        "5. Non-functional Requirements\n"
        "6. Constraints & Assumptions\n"
        "7. Dependencies\n"
        "8. Success Metrics\n"
        "9. Open Questions & Risks\n\n"
        "If related requirements context is provided, explicitly reference "
        "their decisions and ensure consistency."
    ),
}

REQUIREMENT_PLAYBOOK = Skill(
    id="builtin:requirement-playbook",
    name="requirement-playbook",
    description="Task-specific prompt templates for structured requirement analysis",
    applicable_agents=["requirement"],
    prompt_fragments=[
        "## Requirement Analysis Playbook\n\n"
        "When executing requirement tasks, follow the structured approach below "
        "based on the task type:\n\n"
        + "\n\n".join(
            f"### {name.replace('_', ' ').title()}\n{prompt}"
            for name, prompt in _REQ_TASKS.items()
        ),
    ],
)

# ---------------------------------------------------------------------------
# 7c. GitLab Commit Workflow
# ---------------------------------------------------------------------------

GITLAB_COMMIT_WORKFLOW = Skill(
    id="builtin:gitlab-commit-workflow",
    name="gitlab-commit-workflow",
    description="GitLab branching, commit, and merge request workflow instructions",
    applicable_agents=[],  # applies to all agents
    prompt_fragments=[
        (
            "## GitLab Workflow\n"
            "When making code changes to the repository:\n\n"
            "1. **Branch Strategy**: Follow the workspace branch strategy.\n"
            "   - `feature`: Create a feature branch per task (`feat/<slug>`) and "
            "open a Merge Request to the default branch.\n"
            "   - `direct`: Commit directly to the default branch.\n"
            "   - `gitflow`: Use `feature/<slug>` branch, merge via MR to develop.\n\n"
            "2. **Committing**: Use `gitlab_push_file` with the correct `project_id` "
            "and `branch` from the repo context for every file commit.\n\n"
            "3. **Merge Request**: After committing all files, call `gitlab_create_mr` "
            "to open a Merge Request to the default branch.\n\n"
            "4. **Multiple Repos**: If additional repos are configured, use the "
            "appropriate `project_id` for each. The primary repo is the main target."
        ),
    ],
)

# ---------------------------------------------------------------------------
# Registry of all built-in skills
# ---------------------------------------------------------------------------

BUILTIN_SKILLS: list[Skill] = [
    SDLC_ARTIFACT_DISCIPLINE,
    REQUIREMENT_PLAYBOOK,
    GITLAB_COMMIT_WORKFLOW,
]
