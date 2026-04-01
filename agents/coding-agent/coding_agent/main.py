"""Coding Agent -- FastAPI application."""

from vibeos_agent.app import create_agent_app

from .agent import CodingAgent

app = create_agent_app(CodingAgent, "Coding Agent", "coding")
