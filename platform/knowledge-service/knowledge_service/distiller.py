from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

import httpx

from .graph_store import GraphStore

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """\
You are a knowledge engineer. Analyze the following workspace data and extract \
reusable organizational knowledge.

WORKSPACE DATA:
{workspace_data}

Extract the following categories of knowledge. For each item provide a \
confidence score (0.0-1.0) indicating how generalizable the knowledge is.

Return a JSON object with this exact structure:
{{
  "patterns": [
    {{
      "name": "<short pattern name>",
      "description": "<how and when to apply this pattern>",
      "category": "<architecture|development|operations|testing|data>",
      "confidence": 0.85,
      "related_tech": ["<technology1>", "<technology2>"]
    }}
  ],
  "decisions": [
    {{
      "name": "<decision title>",
      "description": "<what was decided and why>",
      "alternatives_considered": "<what other options were evaluated>",
      "outcome": "<result of the decision>",
      "confidence": 0.8
    }}
  ],
  "lessons": [
    {{
      "name": "<lesson title>",
      "description": "<what was learned>",
      "category": "<what-worked|what-didnt|unexpected>",
      "confidence": 0.75,
      "recommendation": "<actionable recommendation>"
    }}
  ]
}}

Rules:
- Remove any specific company names, project names, or people's names
- Generalise specific business data into abstract descriptions
- Only include knowledge that would be useful to other teams
- Set confidence lower for context-specific knowledge
- Prefer actionable, concrete patterns over vague observations

Return ONLY valid JSON, no markdown fencing or commentary.
"""

SANITIZATION_PATTERNS = [
    (re.compile(r"\b[A-Z][a-z]+ (?:Corp|Inc|Ltd|LLC|GmbH)\b"), "<company>"),
    (re.compile(r"\b[A-Z]{2,6}-\d{2,6}\b"), "<ticket-id>"),
    (re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b"), "<email>"),
    (re.compile(r"\bhttps?://[^\s]+"), "<url>"),
]


def _sanitize_text(text: str) -> str:
    """Strip identifiable information from extracted knowledge."""
    for pattern, replacement in SANITIZATION_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def _sanitize_item(item: dict[str, Any]) -> dict[str, Any]:
    """Sanitize all string values in a knowledge item."""
    result: dict[str, Any] = {}
    for key, value in item.items():
        if isinstance(value, str):
            result[key] = _sanitize_text(value)
        elif isinstance(value, list):
            result[key] = [
                _sanitize_text(v) if isinstance(v, str) else v for v in value
            ]
        else:
            result[key] = value
    return result


class Distiller:
    """Extracts reusable knowledge from workspace activity."""

    def __init__(
        self,
        graph_store: GraphStore,
        llm_gateway_url: str,
        workspace_svc_url: str = "http://localhost:8010",
    ) -> None:
        self.graph = graph_store
        self.llm_gateway_url = llm_gateway_url
        self.workspace_svc_url = workspace_svc_url

    async def fetch_workspace_data(self, workspace_id: str) -> dict[str, Any]:
        """Pull phases, tasks, and activities from workspace-svc."""
        async with httpx.AsyncClient(timeout=30) as client:
            workspace_resp = await client.get(
                f"{self.workspace_svc_url}/api/workspaces/{workspace_id}"
            )
            workspace_resp.raise_for_status()
            ws_body = workspace_resp.json()
            workspace = ws_body.get("data", ws_body) if isinstance(ws_body, dict) else ws_body
            phases = workspace.get("phases", []) if isinstance(workspace, dict) else []

            all_activities: list[dict[str, Any]] = []
            page = 1
            page_size = 100
            while True:
                activities_resp = await client.get(
                    f"{self.workspace_svc_url}/api/workspaces/{workspace_id}/activities",
                    params={"page": page, "pageSize": page_size},
                )
                if activities_resp.status_code != 200:
                    break
                act_body = activities_resp.json()
                act_data = act_body.get("data", act_body) if isinstance(act_body, dict) else act_body
                batch = act_data if isinstance(act_data, list) else []
                all_activities.extend(batch)
                if len(batch) < page_size or len(all_activities) >= 200:
                    break
                page += 1

        return {
            "workspace": workspace,
            "phases": phases,
            "activities": all_activities,
        }

    async def extract_knowledge(
        self, workspace_data: dict[str, Any]
    ) -> dict[str, list[dict]]:
        """Call the LLM gateway to extract structured knowledge."""
        data_summary = json.dumps(workspace_data, indent=2, default=str)
        if len(data_summary) > 12_000:
            data_summary = data_summary[:12_000] + "\n... (truncated)"

        prompt = EXTRACTION_PROMPT.format(workspace_data=data_summary)

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self.llm_gateway_url}/api/chat/completions",
                json={
                    "messages": [{"role": "user", "content": prompt}],
                    "model": "auto",
                    "temperature": 0.3,
                    "max_tokens": 8192,
                },
            )
            resp.raise_for_status()
            body = resp.json()

        content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```[a-z]*\n?", "", content)
            content = re.sub(r"\n?```\s*$", "", content)

        try:
            extracted = json.loads(content)
        except json.JSONDecodeError:
            logger.error("LLM returned unparseable JSON: %s", content[:500])
            return {"patterns": [], "decisions": [], "lessons": []}

        return {
            "patterns": [_sanitize_item(p) for p in extracted.get("patterns", [])],
            "decisions": [_sanitize_item(d) for d in extracted.get("decisions", [])],
            "lessons": [_sanitize_item(le) for le in extracted.get("lessons", [])],
        }

    async def store_knowledge(
        self,
        knowledge: dict[str, list[dict]],
        workspace_id: str,
        target_access_level: str,
    ) -> list[dict]:
        """Persist extracted knowledge as graph nodes with *pending* status."""
        created: list[dict] = []

        for pattern in knowledge.get("patterns", []):
            node = await self.graph.upsert_node(
                label="Pattern",
                name=pattern["name"],
                properties={
                    "description": pattern.get("description", ""),
                    "category": pattern.get("category", ""),
                    "source_workspace_id": workspace_id,
                    "access_level": target_access_level,
                    "confidence": pattern.get("confidence", 0.5),
                    "usage_count": 1,
                    "status": "pending",
                },
            )
            created.append({"type": "pattern", "node": node})

            for tech_name in pattern.get("related_tech", []):
                tech_node = await self.graph.upsert_node(
                    label="TechStack",
                    name=tech_name,
                    properties={
                        "description": tech_name,
                        "source_workspace_id": workspace_id,
                        "access_level": target_access_level,
                        "confidence": 0.95,
                        "usage_count": 1,
                        "status": "approved",
                    },
                )
                node_id = (
                    node.get("properties", {}).get("id")
                    or node.get("id")
                    or ""
                )
                tech_id = (
                    tech_node.get("properties", {}).get("id")
                    or tech_node.get("id")
                    or ""
                )
                if node_id and tech_id:
                    await self.graph.create_edge(
                        from_id=node_id,
                        to_id=tech_id,
                        relationship="SUITED_FOR",
                        properties={"source": "distillation"},
                    )

        for decision in knowledge.get("decisions", []):
            node = await self.graph.upsert_node(
                label="Decision",
                name=decision["name"],
                properties={
                    "description": decision.get("description", ""),
                    "alternatives_considered": decision.get(
                        "alternatives_considered", ""
                    ),
                    "outcome": decision.get("outcome", ""),
                    "source_workspace_id": workspace_id,
                    "access_level": target_access_level,
                    "confidence": decision.get("confidence", 0.5),
                    "usage_count": 1,
                    "status": "pending",
                },
            )
            created.append({"type": "decision", "node": node})

        for lesson in knowledge.get("lessons", []):
            node = await self.graph.upsert_node(
                label="BestPractice",
                name=lesson["name"],
                properties={
                    "description": lesson.get("description", ""),
                    "category": lesson.get("category", ""),
                    "recommendation": lesson.get("recommendation", ""),
                    "source_workspace_id": workspace_id,
                    "access_level": target_access_level,
                    "confidence": lesson.get("confidence", 0.5),
                    "usage_count": 1,
                    "status": "pending",
                },
            )
            created.append({"type": "lesson", "node": node})

        return created

    async def distill(
        self, workspace_id: str, target_access_level: str
    ) -> dict[str, Any]:
        """Full distillation pipeline: fetch -> extract -> sanitize -> store."""
        workspace_data = await self.fetch_workspace_data(workspace_id)
        knowledge = await self.extract_knowledge(workspace_data)
        stored = await self.store_knowledge(
            knowledge, workspace_id, target_access_level
        )
        return {
            "workspace_id": workspace_id,
            "target_access_level": target_access_level,
            "extracted": knowledge,
            "stored_count": len(stored),
            "items": stored,
        }

    async def approve(
        self, knowledge_ids: list[str], approved_access_level: str
    ) -> list[dict]:
        """Mark pending knowledge items as approved.

        Updates the ``status`` and ``access_level`` for each node whose
        application-level ``id`` is in *knowledge_ids*.
        """
        approved: list[dict] = []
        for kid in knowledge_ids:
            safe_id = kid.replace("'", "\\'")
            safe_level = approved_access_level.replace("'", "\\'")
            sql = (
                f"SELECT * FROM cypher('{self.graph.GRAPH_NAME}', $$"
                f"  MATCH (n {{id: '{safe_id}'}})"
                f"  SET n.status = 'approved', n.access_level = '{safe_level}'"
                f"  RETURN n"
                f"$$) AS (n agtype)"
            )
            conn = await self.graph._connect()
            async with conn:
                cur = await conn.execute(sql)
                row = await cur.fetchone()
                await conn.commit()
            if row:
                from .graph_store import _parse_agtype

                approved.append(_parse_agtype(row[0]))
        return approved
