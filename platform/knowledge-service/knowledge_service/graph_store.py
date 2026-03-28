from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

import psycopg

logger = logging.getLogger(__name__)

ACCESS_LEVEL_HIERARCHY = ["workspace", "team", "bu", "enterprise"]

VALID_LABELS = {"TechStack", "Pattern", "Decision", "Concept", "BestPractice"}
VALID_RELATIONSHIPS = {
    "SUITED_FOR", "SOLVES", "CONTAINS", "REPLACES", "DEPENDS_ON", "TESTED_IN",
}


def _parse_agtype(raw: Any) -> Any:
    """Best-effort parse of an agtype value returned by AGE.

    AGE returns vertices/edges as JSON-ish strings with a ``::vertex`` or
    ``::edge`` suffix.  We strip the suffix and parse the JSON body.  For
    scalar values the string is returned as-is.
    """
    if raw is None:
        return None
    text = str(raw)
    text = re.sub(r"::(vertex|edge|path)\s*$", "", text)
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return text


def _escape_cypher_string(value: str) -> str:
    """Escape a string for safe embedding inside a Cypher literal."""
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _cypher_props(props: dict[str, Any]) -> str:
    """Serialise a dict into a Cypher property map literal."""
    parts: list[str] = []
    for key, val in props.items():
        if isinstance(val, str):
            parts.append(f"{key}: '{_escape_cypher_string(val)}'")
        elif isinstance(val, bool):
            parts.append(f"{key}: {'true' if val else 'false'}")
        elif isinstance(val, (int, float)):
            parts.append(f"{key}: {val}")
        else:
            parts.append(f"{key}: '{_escape_cypher_string(str(val))}'")
    return "{" + ", ".join(parts) + "}"


def _accessible_levels(access_level: str) -> list[str]:
    """Return the list of access levels visible to *access_level*.

    Higher levels can see everything at or below them.
    """
    try:
        idx = ACCESS_LEVEL_HIERARCHY.index(access_level)
    except ValueError:
        idx = 0
    return ACCESS_LEVEL_HIERARCHY[: idx + 1]


class GraphStore:
    """Apache AGE graph operations on PostgreSQL."""

    GRAPH_NAME = "vibeos_knowledge"

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    async def _connect(self) -> psycopg.AsyncConnection:  # type: ignore[type-arg]
        conn = await psycopg.AsyncConnection.connect(self.database_url)
        await conn.execute("LOAD 'age'")
        await conn.execute(
            "SET search_path = ag_catalog, \"$user\", public"
        )
        return conn

    async def initialize(self) -> None:
        """Create the graph (idempotent) and load the AGE extension."""
        conn = await psycopg.AsyncConnection.connect(self.database_url)
        async with conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS age")
            await conn.execute("LOAD 'age'")
            await conn.execute(
                "SET search_path = ag_catalog, \"$user\", public"
            )
            try:
                await conn.execute(
                    "SELECT create_graph(%s)", [self.GRAPH_NAME]
                )
            except Exception:
                pass  # graph already exists
            await conn.commit()

    # ------------------------------------------------------------------
    # Nodes
    # ------------------------------------------------------------------

    async def create_node(self, label: str, properties: dict[str, Any]) -> dict:
        """Create a vertex with the given *label* and *properties*."""
        if label not in VALID_LABELS:
            raise ValueError(f"Invalid label: {label}")

        node_id = str(uuid.uuid4())
        props = {**properties, "id": node_id}
        prop_str = _cypher_props(props)

        query = (
            f"SELECT * FROM cypher('{self.GRAPH_NAME}', $$"
            f"  CREATE (n:{label} {prop_str})"
            f"  RETURN n"
            f"$$) AS (n agtype)"
        )

        conn = await self._connect()
        async with conn:
            cur = await conn.execute(query)
            row = await cur.fetchone()
            await conn.commit()

        return _parse_agtype(row[0]) if row else {"id": node_id, **properties}

    # ------------------------------------------------------------------
    # Edges
    # ------------------------------------------------------------------

    async def create_edge(
        self,
        from_id: str,
        to_id: str,
        relationship: str,
        properties: dict[str, Any],
    ) -> dict:
        """Create a directed edge between two vertices identified by their
        application-level *id* property."""
        if relationship not in VALID_RELATIONSHIPS:
            raise ValueError(f"Invalid relationship: {relationship}")

        prop_str = _cypher_props(properties) if properties else "{}"

        query = (
            f"SELECT * FROM cypher('{self.GRAPH_NAME}', $$"
            f"  MATCH (a {{id: '{_escape_cypher_string(from_id)}'}}), "
            f"        (b {{id: '{_escape_cypher_string(to_id)}'}})"
            f"  CREATE (a)-[r:{relationship} {prop_str}]->(b)"
            f"  RETURN r"
            f"$$) AS (r agtype)"
        )

        conn = await self._connect()
        async with conn:
            cur = await conn.execute(query)
            row = await cur.fetchone()
            await conn.commit()

        return _parse_agtype(row[0]) if row else {
            "from_id": from_id,
            "to_id": to_id,
            "relationship": relationship,
            **properties,
        }

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    async def search_nodes(
        self,
        query: str,
        labels: list[str] | None,
        access_level: str,
        limit: int = 20,
    ) -> list[dict]:
        """Text search across node properties with access-level filtering.

        Searches the ``name`` and ``description`` properties using
        case-insensitive substring matching (AGE does not support full-text
        indexes, so we do a Cypher ``CONTAINS`` check).
        """
        visible = _accessible_levels(access_level)
        level_clause = " OR ".join(
            f"n.access_level = '{_escape_cypher_string(lv)}'" for lv in visible
        )

        safe_query = _escape_cypher_string(query.lower())

        label_filter = ""
        if labels:
            for lb in labels:
                if lb not in VALID_LABELS:
                    raise ValueError(f"Invalid label: {lb}")
            label_filter = ":" + "|".join(labels)

        cypher = (
            f"MATCH (n{label_filter})"
            f" WHERE ({level_clause})"
            f"   AND (n.name CONTAINS '{safe_query}'"
            f"        OR n.description CONTAINS '{safe_query}')"
            f" RETURN n"
            f" LIMIT {int(limit)}"
        )

        sql = (
            f"SELECT * FROM cypher('{self.GRAPH_NAME}', $$ {cypher} $$)"
            f" AS (n agtype)"
        )

        conn = await self._connect()
        async with conn:
            cur = await conn.execute(sql)
            rows = await cur.fetchall()

        return [_parse_agtype(r[0]) for r in rows]

    # ------------------------------------------------------------------
    # Traversal
    # ------------------------------------------------------------------

    async def get_related(
        self,
        node_id: str,
        depth: int = 1,
        relationship_types: list[str] | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """Return nodes reachable within *depth* hops from *node_id*."""
        depth = max(1, min(depth, 2))

        rel_filter = ""
        if relationship_types:
            for rt in relationship_types:
                if rt not in VALID_RELATIONSHIPS:
                    raise ValueError(f"Invalid relationship type: {rt}")
            rel_filter = ":" + "|".join(relationship_types)

        safe_id = _escape_cypher_string(node_id)
        cypher = (
            f"MATCH (a {{id: '{safe_id}'}})"
            f"-[r{rel_filter}*1..{depth}]-(b)"
            f" RETURN DISTINCT b"
            f" LIMIT {int(limit)}"
        )

        sql = (
            f"SELECT * FROM cypher('{self.GRAPH_NAME}', $$ {cypher} $$)"
            f" AS (b agtype)"
        )

        conn = await self._connect()
        async with conn:
            cur = await conn.execute(sql)
            rows = await cur.fetchall()

        return [_parse_agtype(r[0]) for r in rows]

    # ------------------------------------------------------------------
    # Pattern listing
    # ------------------------------------------------------------------

    async def get_patterns(
        self,
        domain: str | None,
        min_confidence: float,
        min_usage_count: int,
        access_level: str,
    ) -> list[dict]:
        """List Pattern / BestPractice nodes filtered by confidence and usage."""
        visible = _accessible_levels(access_level)
        level_clause = " OR ".join(
            f"n.access_level = '{_escape_cypher_string(lv)}'" for lv in visible
        )

        where_parts = [f"({level_clause})"]
        where_parts.append(f"n.confidence >= {float(min_confidence)}")
        where_parts.append(f"n.usage_count >= {int(min_usage_count)}")

        if domain:
            safe_domain = _escape_cypher_string(domain.lower())
            where_parts.append(
                f"(n.domain CONTAINS '{safe_domain}'"
                f" OR n.category CONTAINS '{safe_domain}')"
            )

        where = " AND ".join(where_parts)

        cypher = (
            f"MATCH (n:Pattern) WHERE {where} RETURN n"
            f" UNION ALL "
            f"MATCH (n:BestPractice) WHERE {where} RETURN n"
        )

        sql = (
            f"SELECT * FROM cypher('{self.GRAPH_NAME}', $$ {cypher} $$)"
            f" AS (n agtype)"
        )

        conn = await self._connect()
        async with conn:
            cur = await conn.execute(sql)
            rows = await cur.fetchall()

        return [_parse_agtype(r[0]) for r in rows]

    # ------------------------------------------------------------------
    # Bulk helpers (used by distiller)
    # ------------------------------------------------------------------

    async def upsert_node(self, label: str, name: str, properties: dict[str, Any]) -> dict:
        """Create a node or update it if one with the same *name* + *label* exists."""
        safe_name = _escape_cypher_string(name)

        find_sql = (
            f"SELECT * FROM cypher('{self.GRAPH_NAME}', $$"
            f"  MATCH (n:{label} {{name: '{safe_name}'}})"
            f"  RETURN n"
            f"$$) AS (n agtype)"
        )

        conn = await self._connect()
        async with conn:
            cur = await conn.execute(find_sql)
            existing = await cur.fetchone()

            if existing:
                parsed = _parse_agtype(existing[0])
                set_clauses = ", ".join(
                    f"n.{k} = '{_escape_cypher_string(str(v))}'"
                    if isinstance(v, str)
                    else f"n.{k} = {v}"
                    for k, v in properties.items()
                    if k != "id"
                )
                if set_clauses:
                    update_sql = (
                        f"SELECT * FROM cypher('{self.GRAPH_NAME}', $$"
                        f"  MATCH (n:{label} {{name: '{safe_name}'}})"
                        f"  SET {set_clauses}"
                        f"  RETURN n"
                        f"$$) AS (n agtype)"
                    )
                    cur2 = await conn.execute(update_sql)
                    row = await cur2.fetchone()
                    await conn.commit()
                    return _parse_agtype(row[0]) if row else parsed
                return parsed

        return await self.create_node(label, {**properties, "name": name})
