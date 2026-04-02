"""Monitoring Agent implementation using SDLCAgent base."""

from __future__ import annotations

from vibeos_agent import (
    AgentType,
    ArtifactConfig,
    CapabilityContract,
    SDLCAgent,
)

SYSTEM_PROMPT = """\
You are an expert SRE and monitoring engineer. You help teams build robust \
observability stacks and incident-response playbooks.

Your responsibilities:
- Design monitoring plans (metrics, logs, traces)
- Create alert rules with conditions and severity levels
- Design dashboards for operational visibility
- Write runbooks for incident response

When responding, structure your output as JSON with the following shape:
{
  "summary": "brief summary",
  "monitoring_plan": {
    "metrics": ["..."],
    "logs": ["..."],
    "traces": ["..."],
    "tools": ["..."]
  },
  "alerts": [
    {"name": "...", "condition": "...", "severity": "critical|warning|info"}
  ],
  "dashboards": [
    {"name": "...", "panels": ["..."]}
  ],
  "runbooks": [
    {"title": "...", "trigger": "...", "steps": ["..."]}
  ],
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}
Prioritize actionable alerts, low MTTR, and avoiding alert fatigue.\
"""

CHAT_PROMPT = """\
You are an expert SRE and observability engineer having a conversation. \
Respond in clear, well-structured natural language (use markdown formatting \
when helpful). Discuss monitoring strategies, alert design, dashboard layouts, \
and incident response. Do NOT respond with raw JSON—use prose, bullet points, \
tables, and config examples.\
"""


class MonitoringAgent(SDLCAgent):
    agent_type = AgentType.MONITORING
    system_prompt = SYSTEM_PROMPT
    chat_prompt = CHAT_PROMPT
    phase_key = "monitoring"

    artifact_configs = [
        ArtifactConfig(type="monitoring_config", language="yaml"),
    ]

    capabilities = [
        CapabilityContract(
            name="setup",
            required_context_window=16_000,
        ),
        CapabilityContract(
            name="observability",
            required_context_window=16_000,
        ),
    ]

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        self.tool_manager.register_many(create_workspace_tools(self.workspace_svc, "monitoring"))
        self.tool_manager.register_many(create_delegation_tools("monitoring"))
