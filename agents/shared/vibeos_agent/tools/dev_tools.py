"""Development tools – LLM-backed code generation, review, and planning."""

from __future__ import annotations

from typing import Any

from .base import BaseTool


class GenerateCodeTool(BaseTool):
    name = "generate_code"
    display_name = "生成代码"
    description = (
        "Generate source code for a given specification. Returns the generated code "
        "which can then be committed via gitlab_push_file."
    )
    parameters = {
        "type": "object",
        "properties": {
            "specification": {
                "type": "string",
                "description": "Detailed specification of what code to generate",
            },
            "language": {
                "type": "string",
                "enum": ["python", "typescript", "go", "rust", "java"],
                "description": "Programming language",
            },
            "framework": {
                "type": "string",
                "description": "Framework or library to use (e.g. FastAPI, React, Chi)",
            },
        },
        "required": ["specification", "language"],
    }

    def __init__(self, llm_client: Any) -> None:
        self._llm = llm_client

    async def _execute(self, **kwargs: Any) -> str:
        spec = kwargs.get("specification", "")
        language = kwargs.get("language", "python")
        framework = kwargs.get("framework", "")

        framework_hint = f" using the {framework} framework" if framework else ""
        prompt = (
            f"Generate production-ready {language} code{framework_hint} for:\n\n{spec}\n\n"
            "Return ONLY the code with no markdown fences or explanation. "
            "Include necessary imports and type hints."
        )

        result = await self._llm.chat(
            [{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        code = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        return self._json_result({
            "language": language,
            "framework": framework,
            "code": code,
        })


class ReviewCodeTool(BaseTool):
    name = "review_code"
    display_name = "审查代码"
    description = (
        "Review code for bugs, performance issues, security vulnerabilities, "
        "and best-practice violations. Returns structured findings."
    )
    parameters = {
        "type": "object",
        "properties": {
            "code": {
                "type": "string",
                "description": "The code to review",
            },
            "language": {
                "type": "string",
                "description": "Programming language of the code",
            },
            "focus": {
                "type": "string",
                "enum": ["bugs", "performance", "security", "style", "all"],
                "description": "What aspect to focus on (default: all)",
            },
        },
        "required": ["code"],
    }

    def __init__(self, llm_client: Any) -> None:
        self._llm = llm_client

    async def _execute(self, **kwargs: Any) -> str:
        code = kwargs.get("code", "")
        language = kwargs.get("language", "")
        focus = kwargs.get("focus", "all")

        lang_hint = f" ({language})" if language else ""
        prompt = (
            f"Review the following code{lang_hint} with focus on: {focus}.\n\n"
            f"```\n{code}\n```\n\n"
            "Return a JSON object with: "
            '{"issues": [{"severity": "critical|warning|info", "line": "...", '
            '"description": "...", "suggestion": "..."}], '
            '"summary": "...", "score": <1-10>}'
        )

        result = await self._llm.chat(
            [{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        review = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        return review


class PlanImplementationTool(BaseTool):
    name = "plan_implementation"
    display_name = "规划实现"
    description = (
        "Create a step-by-step implementation plan for a feature, "
        "breaking it into files, functions, and concrete coding tasks."
    )
    parameters = {
        "type": "object",
        "properties": {
            "feature_description": {
                "type": "string",
                "description": "Description of the feature to implement",
            },
            "tech_stack": {
                "type": "string",
                "description": "Technology stack (e.g. 'React + FastAPI + PostgreSQL')",
            },
            "constraints": {
                "type": "string",
                "description": "Any constraints or requirements to consider",
            },
        },
        "required": ["feature_description"],
    }

    def __init__(self, llm_client: Any) -> None:
        self._llm = llm_client

    async def _execute(self, **kwargs: Any) -> str:
        feature = kwargs.get("feature_description", "")
        tech_stack = kwargs.get("tech_stack", "")
        constraints = kwargs.get("constraints", "")

        stack_hint = f"\nTech stack: {tech_stack}" if tech_stack else ""
        constraint_hint = f"\nConstraints: {constraints}" if constraints else ""

        prompt = (
            f"Create a detailed implementation plan for:\n\n{feature}"
            f"{stack_hint}{constraint_hint}\n\n"
            "Return a JSON object with: "
            '{"steps": [{"step": 1, "description": "...", '
            '"files": ["path/to/file.ext"], "details": "..."}], '
            '"estimated_files": <count>, "dependencies": ["pkg@version"]}'
        )

        result = await self._llm.chat(
            [{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        plan = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        return plan


def create_dev_tools(llm_client: Any) -> list[BaseTool]:
    """Factory: create all development-specific tools."""
    return [
        GenerateCodeTool(llm_client),
        ReviewCodeTool(llm_client),
        PlanImplementationTool(llm_client),
    ]
