from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    port: int = int(os.getenv("PORT", "8030"))
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY")
    deepseek_api_key: str | None = os.getenv("DEEPSEEK_API_KEY")
    dashscope_api_key: str | None = os.getenv("DASHSCOPE_API_KEY")
    volcengine_api_key: str | None = os.getenv("VOLCENGINE_API_KEY") or os.getenv("ARK_API_KEY")

    default_model: str = os.getenv("DEFAULT_MODEL", "auto")
    default_temperature: float = float(os.getenv("DEFAULT_TEMPERATURE", "0.7"))
    default_max_tokens: int = int(os.getenv("DEFAULT_MAX_TOKENS", "4096"))

    monthly_token_limit: int = int(os.getenv("MONTHLY_TOKEN_LIMIT", "10000000"))
    budget_warn_pct: float = float(os.getenv("BUDGET_WARN_PCT", "0.8"))

    @property
    def available_models(self) -> list[str]:
        models: list[str] = []
        if self.anthropic_api_key:
            models.append("claude-sonnet-4-20250514")
        if self.openai_api_key:
            models.append("gpt-4o")
        if self.deepseek_api_key:
            models.append("deepseek-chat")
        if self.dashscope_api_key:
            models.append("qwen-plus")
        if self.volcengine_api_key:
            models.append("doubao-seed-2-0-pro-260215")
        return models

    @property
    def default_preference_order(self) -> list[str]:
        """Preferred model order when no capability contract is given."""
        return [m for m in [
            "doubao-seed-2-0-pro-260215",
            "claude-sonnet-4-20250514",
            "gpt-4o",
            "deepseek-chat",
            "qwen-plus",
        ] if m in self.available_models]


settings = Settings()
