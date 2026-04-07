"""Configuration loaded from environment variables."""

from __future__ import annotations

import os


_AGENT_ENDPOINT_DEFAULTS: dict[str, tuple[str, str]] = {
    "architecture": ("ARCHITECTURE_AGENT_URL", "http://architecture-agent:8041"),
    "requirement": ("REQUIREMENT_AGENT_URL", "http://requirement-agent:8042"),
    "design": ("DESIGN_AGENT_URL", "http://design-agent:8043"),
    "development": ("DEVELOPMENT_AGENT_URL", "http://dev-agent:8044"),
    "testing": ("TESTING_AGENT_URL", "http://test-agent:8045"),
    "cicd": ("CICD_AGENT_URL", "http://cicd-agent:8046"),
    "monitoring": ("MONITORING_AGENT_URL", "http://monitoring-agent:8047"),
    "coding": ("CODING_AGENT_URL", "http://coding-agent:8048"),
}


def get_agent_endpoints() -> dict[str, str]:
    """Canonical agent endpoint map. All consumers should use this."""
    return {
        k: os.getenv(env, default)
        for k, (env, default) in _AGENT_ENDPOINT_DEFAULTS.items()
    }


AGENT_ENDPOINTS: dict[str, str] = get_agent_endpoints()


class Config:
    """Simple env-var-backed configuration shared by all agents."""

    def __init__(self) -> None:
        self.llm_gateway_url: str = os.getenv(
            "LLM_GATEWAY_URL", "http://llm-gateway:8030"
        )
        self.workspace_svc_url: str = os.getenv(
            "WORKSPACE_SVC_URL", "http://workspace-svc:8010"
        )
        self.ws_gateway_url: str = os.getenv(
            "WS_GATEWAY_URL", "http://ws-gateway:8020"
        )
        self.memory_svc_url: str = os.getenv(
            "MEMORY_SVC_URL", "http://memory-service:8050"
        )
        self.rag_svc_url: str = os.getenv(
            "RAG_SVC_URL", "http://rag-pipeline:8060"
        )
        self.knowledge_svc_url: str = os.getenv(
            "KNOWLEDGE_SVC_URL", "http://knowledge-service:8070"
        )
        self.redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self.org_id: str = os.getenv("VIBEOS_ORG_ID", "default")
        self.port: int = int(os.getenv("PORT", "8040"))


config = Config()
