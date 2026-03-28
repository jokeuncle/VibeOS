from __future__ import annotations

import os


class Settings:
    PORT: int = int(os.getenv("PORT", "8060"))
    QDRANT_URL: str = os.getenv("QDRANT_URL", "http://localhost:6333")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    LLM_GATEWAY_URL: str = os.getenv("LLM_GATEWAY_URL", "http://localhost:8030")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/4")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", "512"))
    CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "50"))


settings = Settings()
