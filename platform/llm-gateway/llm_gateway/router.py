"""Smart model router – selects the best model for a given capability contract."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from pydantic import BaseModel


class ReasoningLevel(str, Enum):
    BASIC = "basic"
    ADVANCED = "advanced"
    EXPERT = "expert"


class CapabilityContract(BaseModel):
    reasoning: ReasoningLevel = ReasoningLevel.BASIC
    code_generation: bool = False
    tool_calling: bool = False
    multimodal: bool = False
    long_context: bool = False
    chinese: bool = False


@dataclass(frozen=True)
class ModelProfile:
    name: str
    provider: str
    reasoning: ReasoningLevel
    context_window: int
    code_generation: bool = False
    tool_calling: bool = False
    multimodal: bool = False
    chinese: bool = False
    litellm_model: str = ""  # provider-prefixed name for litellm; if empty, uses name

    def score(self, contract: CapabilityContract) -> int:
        """Higher score = better match. Negative means hard-fail."""
        s = 0

        if contract.multimodal and not self.multimodal:
            return -1
        if contract.chinese and not self.chinese:
            return -1
        if contract.long_context and self.context_window < 128_000:
            return -1

        reasoning_rank = {ReasoningLevel.BASIC: 1, ReasoningLevel.ADVANCED: 2, ReasoningLevel.EXPERT: 3}
        model_rank = reasoning_rank[self.reasoning]
        required_rank = reasoning_rank[contract.reasoning]
        if model_rank < required_rank:
            return -1
        s += (3 - (model_rank - required_rank)) * 10

        if contract.code_generation and self.code_generation:
            s += 15
        if contract.tool_calling and self.tool_calling:
            s += 10
        if contract.multimodal and self.multimodal:
            s += 5
        if contract.chinese and self.chinese:
            s += 20

        return s


MODEL_REGISTRY: dict[str, ModelProfile] = {
    "claude-sonnet-4-20250514": ModelProfile(
        name="claude-sonnet-4-20250514",
        provider="anthropic",
        reasoning=ReasoningLevel.EXPERT,
        context_window=200_000,
        code_generation=True,
        tool_calling=True,
    ),
    "gpt-4o": ModelProfile(
        name="gpt-4o",
        provider="openai",
        reasoning=ReasoningLevel.ADVANCED,
        context_window=128_000,
        code_generation=True,
        tool_calling=True,
        multimodal=True,
    ),
    "deepseek-chat": ModelProfile(
        name="deepseek-chat",
        provider="deepseek",
        reasoning=ReasoningLevel.ADVANCED,
        context_window=128_000,
        code_generation=True,
        tool_calling=True,
    ),
    "qwen-plus": ModelProfile(
        name="qwen-plus",
        provider="dashscope",
        reasoning=ReasoningLevel.ADVANCED,
        context_window=128_000,
        code_generation=True,
        tool_calling=True,
        chinese=True,
    ),
    "doubao-seed-2-0-pro-260215": ModelProfile(
        name="doubao-seed-2-0-pro-260215",
        provider="volcengine",
        reasoning=ReasoningLevel.ADVANCED,
        context_window=256_000,
        code_generation=True,
        tool_calling=True,
        chinese=True,
        litellm_model="volcengine/doubao-seed-2-0-pro-260215",
    ),
    "doubao-seed-2-0-code-250526": ModelProfile(
        name="doubao-seed-2-0-code-250526",
        provider="volcengine",
        reasoning=ReasoningLevel.ADVANCED,
        context_window=256_000,
        code_generation=True,
        tool_calling=True,
        chinese=True,
        litellm_model="volcengine/doubao-seed-2-0-code-250526",
    ),
    "doubao-seed-2-0-code-preview-260215": ModelProfile(
        name="doubao-seed-2-0-code-preview-260215",
        provider="volcengine",
        reasoning=ReasoningLevel.ADVANCED,
        context_window=256_000,
        code_generation=True,
        tool_calling=True,
        chinese=True,
        litellm_model="volcengine/doubao-seed-2-0-code-preview-260215",
    ),
    "doubao-seed-2-0-lite-260215": ModelProfile(
        name="doubao-seed-2-0-lite-260215",
        provider="volcengine",
        reasoning=ReasoningLevel.ADVANCED,
        context_window=131_072,
        code_generation=True,
        tool_calling=True,
        chinese=True,
        litellm_model="volcengine/doubao-seed-2-0-lite-260215",
    ),
}

AGENT_TYPE_DEFAULTS: dict[str, str] = {
    "pm": "doubao-seed-2-0-pro-260215",
    "architecture": "doubao-seed-2-0-pro-260215",
    "frontend": "doubao-seed-2-0-pro-260215",
    "backend": "doubao-seed-2-0-pro-260215",
    "development": "doubao-seed-2-0-pro-260215",
    "qa": "doubao-seed-2-0-pro-260215",
    "devops": "doubao-seed-2-0-pro-260215",
    "default": "doubao-seed-2-0-pro-260215",
}


class ModelRouter:
    def __init__(self, available_models: list[str]) -> None:
        registry = dict(MODEL_REGISTRY)
        # Dynamically register any models specified via env that aren't in the static registry
        for model_name in available_models:
            if model_name not in registry:
                provider = "volcengine" if any(
                    x in model_name for x in ["doubao", "seed", "deepseek", "glm", "qwen", "kimi"]
                ) else "unknown"
                registry[model_name] = ModelProfile(
                    name=model_name,
                    provider=provider,
                    reasoning=ReasoningLevel.ADVANCED,
                    context_window=128_000,
                    code_generation=True,
                    tool_calling=True,
                    chinese=True,
                    litellm_model=f"{provider}/{model_name}" if provider != "unknown" else model_name,
                )
        self._profiles = {k: v for k, v in registry.items() if k in available_models}

    def select(
        self,
        capability: CapabilityContract | None = None,
        agent_type: str | None = None,
    ) -> list[str]:
        """Return an ordered list of model names (best first). Never empty if any model is available."""
        if not self._profiles:
            raise RuntimeError("No models available – check API key configuration")

        if capability is None:
            return self._default_order(agent_type)

        scored = [(name, profile.score(capability)) for name, profile in self._profiles.items()]
        valid = [(name, sc) for name, sc in scored if sc >= 0]

        if not valid:
            return self._default_order(agent_type)

        valid.sort(key=lambda x: x[1], reverse=True)
        return [name for name, _ in valid]

    def _default_order(self, agent_type: str | None) -> list[str]:
        preferred = AGENT_TYPE_DEFAULTS.get(agent_type or "default", AGENT_TYPE_DEFAULTS["default"])
        ordered: list[str] = []
        if preferred in self._profiles:
            ordered.append(preferred)
        for name in self._profiles:
            if name not in ordered:
                ordered.append(name)
        return ordered
