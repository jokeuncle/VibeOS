"""Architecture Agent -- FastAPI application."""

from vibeos_agent.app import create_agent_app

from .agent import ArchitectureAgent

app = create_agent_app(ArchitectureAgent, "Architecture Agent", "architecture")
