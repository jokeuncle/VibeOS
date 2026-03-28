from __future__ import annotations

import os


class Settings:
    port: int
    redis_url: str
    qdrant_url: str
    llm_gateway_url: str
    openai_api_key: str

    def __init__(self) -> None:
        self.port = int(os.getenv("PORT", "8050"))
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/3")
        self.qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        self.llm_gateway_url = os.getenv("LLM_GATEWAY_URL", "http://localhost:8030")
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")


settings = Settings()
