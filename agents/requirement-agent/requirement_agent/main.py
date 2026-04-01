"""Requirement Agent -- FastAPI application."""

from vibeos_agent.app import create_agent_app

from .agent import RequirementAgent

app = create_agent_app(RequirementAgent, "Requirement Agent", "requirement")
