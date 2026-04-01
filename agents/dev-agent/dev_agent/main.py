"""Development Agent -- FastAPI application."""

from vibeos_agent.app import create_agent_app

from .agent import DevelopmentAgent

app = create_agent_app(DevelopmentAgent, "Development Agent", "development")
