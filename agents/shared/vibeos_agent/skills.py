"""Skill system -- composable bundles of prompt, tools, and knowledge."""

from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel, Field

from .tools.base import BaseTool, ToolResult
from .tools.provider import ToolDescriptor, ToolProvider

logger = logging.getLogger(__name__)


class Skill(BaseModel):
    """A Skill bundles related prompt fragments, tool references, and knowledge
    queries into a single composable unit.

    Skills can be:
    - **Built-in**: shipped with agents (e.g. "gitlab-workflow")
    - **Workspace-configured**: installed via UI from a catalog
    - **User-created**: custom skills defined in the UI
    """

    id: str = ""
    name: str
    description: str = ""
    prompt_fragments: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    knowledge_queries: list[str] = Field(default_factory=list)
    context_providers: list[str] = Field(default_factory=list)
    applicable_agents: list[str] = Field(default_factory=list)
    version: str = "1.0"
    enabled: bool = True

    @classmethod
    def from_db_config(cls, config: dict[str, Any], **kwargs: Any) -> Skill:
        return cls(
            prompt_fragments=config.get("prompt_fragments", config.get("promptFragments", [])),
            tools=config.get("tools", []),
            knowledge_queries=config.get("knowledge_queries", config.get("knowledgeQueries", [])),
            context_providers=config.get("context_providers", config.get("contextProviders", [])),
            applicable_agents=config.get("applicable_agents", config.get("applicableAgents", [])),
            **kwargs,
        )

    def get_prompt_injection(self) -> str:
        """Return combined prompt fragments for system prompt enrichment."""
        if not self.prompt_fragments:
            return ""
        return "\n\n".join(self.prompt_fragments)


class SkillRegistry:
    """Manages available skills and resolves them for a given agent."""

    def __init__(self) -> None:
        self._skills: dict[str, Skill] = {}

    def register(self, skill: Skill) -> None:
        self._skills[skill.name] = skill

    def register_many(self, skills: list[Skill]) -> None:
        for s in skills:
            self.register(s)

    def get(self, name: str) -> Skill | None:
        return self._skills.get(name)

    def list_for_agent(self, agent_type: str) -> list[Skill]:
        """Return all enabled skills applicable to the given agent type."""
        result = []
        for skill in self._skills.values():
            if not skill.enabled:
                continue
            if skill.applicable_agents and agent_type not in skill.applicable_agents:
                continue
            result.append(skill)
        return result

    def get_combined_prompt(self, agent_type: str) -> str:
        """Return merged prompt fragments from all applicable skills."""
        parts = []
        for skill in self.list_for_agent(agent_type):
            injection = skill.get_prompt_injection()
            if injection:
                parts.append(f"## Skill: {skill.name}\n{injection}")
        return "\n\n".join(parts) if parts else ""


class SkillToolProvider(ToolProvider):
    """Exposes tools defined in active skills as a :class:`ToolProvider`.

    This provider makes skill-defined tool references available to the
    ToolManager alongside static and MCP tools.

    When a skill references a tool by name, the provider first checks local
    implementations (registered via ``register_tool``), then delegates to
    a fallback ``ToolManager`` for auto-discovery across all other providers
    (MCP, static, etc.).
    """

    provider_key = "skill"

    def __init__(
        self,
        skill_registry: SkillRegistry,
        *,
        fallback_manager: Any | None = None,
    ) -> None:
        self._registry = skill_registry
        self._tool_implementations: dict[str, BaseTool] = {}
        self._fallback_manager = fallback_manager

    def set_fallback_manager(self, manager: Any) -> None:
        """Set the parent ToolManager for auto-discovery of tool impls."""
        self._fallback_manager = manager

    def register_tool(self, tool: BaseTool) -> None:
        """Register a concrete tool implementation for a skill tool reference."""
        self._tool_implementations[tool.name] = tool

    async def list_tools(self) -> list[ToolDescriptor]:
        descriptors = []
        seen: set[str] = set()
        for skill in self._registry._skills.values():
            if not skill.enabled:
                continue
            for tool_name in skill.tools:
                if tool_name in seen:
                    continue
                seen.add(tool_name)

                impl = self._tool_implementations.get(tool_name)
                if impl:
                    descriptors.append(ToolDescriptor(
                        name=impl.name,
                        description=impl.description,
                        parameters=impl.parameters,
                        provider_key=self.provider_key,
                    ))
                    continue

                if self._fallback_manager:
                    try:
                        all_descs = await self._fallback_manager._all_descriptors()
                        for d in all_descs:
                            if d.name == tool_name:
                                descriptors.append(ToolDescriptor(
                                    name=d.name,
                                    description=d.description,
                                    parameters=d.parameters,
                                    provider_key=self.provider_key,
                                    display_name=d.display_name,
                                ))
                                break
                    except Exception:
                        logger.debug("Fallback lookup failed for skill tool %s", tool_name)
        return descriptors

    async def execute(self, tool_name: str, arguments: dict[str, Any]) -> ToolResult:
        impl = self._tool_implementations.get(tool_name)
        if impl is not None:
            try:
                result = await impl.execute(**arguments)
                return ToolResult.success(result)
            except Exception as exc:
                logger.exception("Skill tool %s failed", tool_name)
                return ToolResult.error(json.dumps({"error": str(exc)}))

        if self._fallback_manager:
            return await self._fallback_manager.execute(tool_name, arguments)

        return ToolResult.error(json.dumps({"error": f"Skill tool not found: {tool_name}"}))
