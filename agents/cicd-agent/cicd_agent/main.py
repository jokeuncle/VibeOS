"""CI/CD Agent -- FastAPI application."""

from vibeos_agent.app import create_agent_app

from .agent import CicdAgent

app = create_agent_app(CicdAgent, "CI/CD Agent", "cicd")
