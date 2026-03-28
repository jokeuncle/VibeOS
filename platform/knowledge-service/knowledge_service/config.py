from __future__ import annotations

import os


PORT = int(os.getenv("PORT", "8070"))
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgres://vibeos:vibeos_dev@localhost:5432/vibeos"
)
LLM_GATEWAY_URL = os.getenv("LLM_GATEWAY_URL", "http://localhost:8030")
WORKSPACE_SVC_URL = os.getenv("WORKSPACE_SVC_URL", "http://localhost:8010")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/5")
