"""Global Intent-Task-Capability registry client.

Talks to workspace-svc ``/api/registry/*`` endpoints.  Agents use this to:
- Load the intent registry for NLU prompt generation
- Resolve task templates for a given intent + context
- Self-register capabilities on startup
- Send heartbeats to keep capabilities marked healthy
- Load agent manifests from YAML files
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from .config import config

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes (mirrors Go models, but lightweight for SDK use)
# ---------------------------------------------------------------------------

@dataclass
class IntentDef:
    name: str
    label_zh: str = ""
    label_en: str = ""
    hint: str = ""
    slots_schema: dict[str, Any] = field(default_factory=dict)
    context_scopes: list[str] = field(default_factory=list)
    priority: int = 0
    enabled: bool = True
    source: str = "system"


@dataclass
class TaskTemplateDef:
    intent_pattern: str
    context: str = "*"
    task_type: str = "atomic"
    required_capabilities: list[str] = field(default_factory=list)
    params_mapping: dict[str, Any] = field(default_factory=dict)
    handler_type: str = "capability"
    handler_ref: str = ""
    priority: int = 0
    enabled: bool = True
    source: str = "system"


@dataclass
class CapabilityDef:
    name: str
    provider: str
    description: str = ""
    endpoint: str = ""
    input_schema: dict[str, Any] = field(default_factory=dict)
    output_schema: dict[str, Any] = field(default_factory=dict)
    constraints: dict[str, Any] = field(default_factory=dict)
    version: str = "1.0.0"
    enabled: bool = True
    source: str = "system"


@dataclass
class ResolvedTemplate:
    """Result of template resolution from the registry."""
    id: str
    intent_pattern: str
    context: str
    task_type: str
    required_capabilities: list[str]
    params_mapping: dict[str, Any]
    handler_type: str
    handler_ref: str
    priority: int


# ---------------------------------------------------------------------------
# Agent Manifest (for bulk registration)
# ---------------------------------------------------------------------------

@dataclass
class AgentManifest:
    agent_type: str
    version: str = "1.0.0"
    source: str = ""
    intents: list[IntentDef] = field(default_factory=list)
    templates: list[TaskTemplateDef] = field(default_factory=list)
    capabilities: list[CapabilityDef] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "agentType": self.agent_type,
            "version": self.version,
            "source": self.source or self.agent_type,
            "intents": [_intent_to_api(i) for i in self.intents],
            "templates": [_template_to_api(t) for t in self.templates],
            "capabilities": [_capability_to_api(c) for c in self.capabilities],
        }


# ---------------------------------------------------------------------------
# Registry Client
# ---------------------------------------------------------------------------

class RegistryClient:
    """Async client for the global registry API on workspace-svc."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = (base_url or config.workspace_svc_url).rstrip("/")
        self._http = httpx.AsyncClient(base_url=self._base, timeout=15)

    # -- Intents -----------------------------------------------------------

    async def list_intents(self, *, enabled_only: bool = True) -> list[dict[str, Any]]:
        params = {} if enabled_only else {"enabled": "false"}
        resp = await self._http.get("/api/registry/intents", params=params)
        resp.raise_for_status()
        return _unwrap(resp)

    async def get_intent(self, name: str) -> dict[str, Any] | None:
        resp = await self._http.get(f"/api/registry/intents/{name}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return _unwrap(resp)

    async def upsert_intent(self, intent: IntentDef) -> dict[str, Any]:
        resp = await self._http.post("/api/registry/intents", json=_intent_to_api(intent))
        resp.raise_for_status()
        return _unwrap(resp)

    async def delete_intent(self, name: str) -> None:
        resp = await self._http.delete(f"/api/registry/intents/{name}")
        resp.raise_for_status()

    # -- Task Templates ----------------------------------------------------

    async def list_templates(self, *, enabled_only: bool = True) -> list[dict[str, Any]]:
        params = {} if enabled_only else {"enabled": "false"}
        resp = await self._http.get("/api/registry/templates", params=params)
        resp.raise_for_status()
        return _unwrap(resp)

    async def resolve_template(self, intent: str, context: str = "*") -> ResolvedTemplate | None:
        resp = await self._http.get(
            "/api/registry/templates/resolve",
            params={"intent": intent, "context": context},
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = _unwrap(resp)
        return ResolvedTemplate(
            id=data.get("id", ""),
            intent_pattern=data.get("intentPattern", ""),
            context=data.get("context", "*"),
            task_type=data.get("taskType", "atomic"),
            required_capabilities=data.get("requiredCapabilities", []),
            params_mapping=data.get("paramsMapping", {}),
            handler_type=data.get("handlerType", "capability"),
            handler_ref=data.get("handlerRef", ""),
            priority=data.get("priority", 0),
        )

    async def create_template(self, template: TaskTemplateDef) -> dict[str, Any]:
        resp = await self._http.post("/api/registry/templates", json=_template_to_api(template))
        resp.raise_for_status()
        return _unwrap(resp)

    # -- Capabilities ------------------------------------------------------

    async def list_capabilities(self, *, provider: str | None = None) -> list[dict[str, Any]]:
        params: dict[str, str] = {}
        if provider:
            params["provider"] = provider
        resp = await self._http.get("/api/registry/capabilities", params=params)
        resp.raise_for_status()
        return _unwrap(resp)

    async def upsert_capability(self, cap: CapabilityDef) -> dict[str, Any]:
        resp = await self._http.post("/api/registry/capabilities", json=_capability_to_api(cap))
        resp.raise_for_status()
        return _unwrap(resp)

    async def heartbeat(self, name: str, provider: str, health: str = "healthy") -> None:
        resp = await self._http.post(
            "/api/registry/capabilities/heartbeat",
            json={"name": name, "provider": provider, "health": health},
        )
        resp.raise_for_status()

    async def delete_capability(self, name: str, provider: str) -> None:
        resp = await self._http.delete(
            f"/api/registry/capabilities/{name}",
            params={"provider": provider},
        )
        resp.raise_for_status()

    # -- Manifest (bulk) ---------------------------------------------------

    async def register_manifest(self, manifest: AgentManifest) -> dict[str, Any]:
        resp = await self._http.post("/api/registry/manifest", json=manifest.to_dict())
        resp.raise_for_status()
        return _unwrap(resp)

    async def close(self) -> None:
        await self._http.aclose()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _unwrap(resp: httpx.Response) -> Any:
    body = resp.json()
    return body.get("data", body)


def _intent_to_api(i: IntentDef) -> dict[str, Any]:
    d: dict[str, Any] = {"name": i.name, "labelZh": i.label_zh, "labelEn": i.label_en, "hint": i.hint}
    if i.slots_schema:
        d["slotsSchema"] = i.slots_schema
    if i.context_scopes:
        d["contextScopes"] = i.context_scopes
    if i.priority:
        d["priority"] = i.priority
    d["enabled"] = i.enabled
    d["source"] = i.source
    return d


def _template_to_api(t: TaskTemplateDef) -> dict[str, Any]:
    d: dict[str, Any] = {"intentPattern": t.intent_pattern}
    if t.context != "*":
        d["context"] = t.context
    if t.task_type != "atomic":
        d["taskType"] = t.task_type
    if t.required_capabilities:
        d["requiredCapabilities"] = t.required_capabilities
    if t.params_mapping:
        d["paramsMapping"] = t.params_mapping
    if t.handler_type != "capability":
        d["handlerType"] = t.handler_type
    if t.handler_ref:
        d["handlerRef"] = t.handler_ref
    if t.priority:
        d["priority"] = t.priority
    d["enabled"] = t.enabled
    d["source"] = t.source
    return d


def _capability_to_api(c: CapabilityDef) -> dict[str, Any]:
    d: dict[str, Any] = {"name": c.name, "provider": c.provider}
    if c.description:
        d["description"] = c.description
    if c.endpoint:
        d["endpoint"] = c.endpoint
    if c.input_schema:
        d["inputSchema"] = c.input_schema
    if c.output_schema:
        d["outputSchema"] = c.output_schema
    if c.constraints:
        d["constraints"] = c.constraints
    if c.version != "1.0.0":
        d["version"] = c.version
    d["enabled"] = c.enabled
    d["source"] = c.source
    return d


# ---------------------------------------------------------------------------
# YAML manifest loader
# ---------------------------------------------------------------------------

def load_manifest_from_yaml(path: str | Path) -> AgentManifest:
    """Load an ``AgentManifest`` from a YAML file.

    Requires ``pyyaml`` (optional dependency).  Falls back to JSON if the
    file extension is ``.json``.
    """
    p = Path(path)
    text = p.read_text(encoding="utf-8")

    if p.suffix in (".yaml", ".yml"):
        try:
            import yaml
        except ImportError as exc:
            raise ImportError("pyyaml is required to load YAML manifests") from exc
        data = yaml.safe_load(text)
    else:
        import json as _json
        data = _json.loads(text)

    agent = data.get("agent", {})
    agent_type = agent.get("type", data.get("agentType", ""))
    version = agent.get("version", data.get("version", "1.0.0"))
    source = agent.get("source", data.get("source", agent_type))

    intents = [
        IntentDef(
            name=i["name"],
            label_zh=i.get("labels", {}).get("zh", i.get("label_zh", "")),
            label_en=i.get("labels", {}).get("en", i.get("label_en", "")),
            hint=i.get("hint", ""),
            slots_schema=i.get("slots_schema", i.get("slotsSchema", {})),
            context_scopes=i.get("context_scopes", i.get("contextScopes", [])),
            priority=i.get("priority", 0),
            source=source,
        )
        for i in data.get("intents", [])
    ]

    templates = [
        TaskTemplateDef(
            intent_pattern=t.get("intent", t.get("intent_pattern", "")),
            context=t.get("context", "*"),
            task_type=t.get("task_type", t.get("taskType", "atomic")),
            required_capabilities=t.get("capabilities", t.get("required_capabilities", [])),
            params_mapping=t.get("params_mapping", t.get("paramsMapping", {})),
            handler_type=t.get("handler_type", t.get("handlerType", "capability")),
            handler_ref=t.get("handler_ref", t.get("handlerRef", "")),
            priority=t.get("priority", 0),
            source=source,
        )
        for t in data.get("templates", [])
    ]

    capabilities = [
        CapabilityDef(
            name=c["name"],
            provider=c.get("provider", agent_type),
            description=c.get("description", ""),
            endpoint=c.get("endpoint", ""),
            input_schema=c.get("input_schema", c.get("inputSchema", {})),
            output_schema=c.get("output_schema", c.get("outputSchema", {})),
            constraints=c.get("constraints", {}),
            version=c.get("version", "1.0.0"),
            source=source,
        )
        for c in data.get("capabilities", [])
    ]

    return AgentManifest(
        agent_type=agent_type,
        version=version,
        source=source,
        intents=intents,
        templates=templates,
        capabilities=capabilities,
    )
