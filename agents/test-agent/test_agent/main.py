"""Testing Agent -- FastAPI application."""

from vibeos_agent.app import create_agent_app

from .agent import TestingAgent

app = create_agent_app(TestingAgent, "Testing Agent", "testing")
