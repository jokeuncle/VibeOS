"""Design Agent -- FastAPI application."""

from vibeos_agent.app import create_agent_app

from .agent import DesignAgent

app = create_agent_app(DesignAgent, "Design Agent", "design")
