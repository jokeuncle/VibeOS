from __future__ import annotations

import os


class Settings:
    PORT: int = int(os.getenv("PORT", "8060"))
    QDRANT_URL: str = os.getenv("QDRANT_URL", "http://localhost:6333")
    LLM_GATEWAY_URL: str = os.getenv("LLM_GATEWAY_URL", "http://localhost:8030")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/4")
    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", "512"))
    CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "50"))

    EMBEDDING_API_KEY: str = os.getenv("EMBEDDING_API_KEY", "") or os.getenv("OPENAI_API_KEY", "")
    EMBEDDING_BASE_URL: str = os.getenv(
        "EMBEDDING_BASE_URL",
        os.getenv("LLM_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"),
    )
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "doubao-embedding-large")
    EMBEDDING_DIM: int = int(os.getenv("EMBEDDING_DIM", "2048"))


settings = Settings()
