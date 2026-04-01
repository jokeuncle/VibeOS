"""Monitoring Agent -- FastAPI application."""

from vibeos_agent.app import create_agent_app

from .agent import MonitoringAgent

app = create_agent_app(MonitoringAgent, "Monitoring Agent", "monitoring")
