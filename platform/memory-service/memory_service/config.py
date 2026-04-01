from __future__ import annotations

import os


class Settings:
    port: int
    redis_url: str
    qdrant_url: str
    volcengine_api_key: str
    volcengine_base_url: str
    volcengine_llm_model: str
    embedding_model: str
    embedding_dim: int

    def __init__(self) -> None:
        self.port = int(os.getenv("PORT", "8050"))
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/3")
        self.qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        self.volcengine_api_key = (
            os.getenv("VOLCENGINE_API_KEY", "")
            or os.getenv("ARK_API_KEY", "")
            or os.getenv("OPENAI_API_KEY", "")
        )
        self.volcengine_base_url = os.getenv(
            "VOLCENGINE_BASE_URL",
            os.getenv("LLM_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"),
        )
        self.volcengine_llm_model = os.getenv(
            "VOLCENGINE_LLM_MODEL", "volcengine/doubao-seed-2-0-pro-260215"
        )
        self.embedding_model = os.getenv("EMBEDDING_MODEL", "doubao-embedding-large")
        self.embedding_dim = int(os.getenv("EMBEDDING_DIM", "2048"))
        self.org_id = os.getenv("VIBEOS_ORG_ID", "default")


settings = Settings()
