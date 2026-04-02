"""Tool Search -- BM25 multilingual matching via jieba + rank_bm25.

When many tools are available (MCP servers, skills, static tools), sending
all schemas to the LLM wastes context tokens and degrades tool selection
accuracy.  Tool Search injects a single ``search_tools`` meta-tool whose
schema is tiny; the LLM calls it with a natural-language query and receives
only the matching tool schemas, which are then injected for subsequent turns.

Scoring pipeline:
1. **jieba** (search-engine mode) tokenises mixed Chinese/English text
2. Bilingual synonym expansion bridges Chinese queries to English tool metadata
3. **rank_bm25.BM25Okapi** scores the query against a weighted per-tool corpus
4. Guaranteed fallback: always returns top-N even when scores are low

Reference: Anthropic tool_search_tool_bm25 (Claude Code CLI).
"""

from __future__ import annotations

import json
import logging
import re
import warnings
from typing import Any, TYPE_CHECKING

from .base import BaseTool

if TYPE_CHECKING:
    from .provider import ToolDescriptor, ToolManager

# jieba emits SyntaxWarning on Python 3.14 due to unescaped backslashes
with warnings.catch_warnings():
    warnings.simplefilter("ignore", SyntaxWarning)
    import jieba  # type: ignore[import-untyped]

from rank_bm25 import BM25Okapi  # type: ignore[import-untyped]

logger = logging.getLogger(__name__)

_AUTO_THRESHOLD = 15


class ToolLoadStrategy:
    EAGER = "eager"
    LAZY = "lazy"
    AUTO = "auto"


# ---------------------------------------------------------------------------
# Bilingual synonym table  (Chinese <-> English SDLC vocabulary)
# ---------------------------------------------------------------------------

_SYNONYMS: dict[str, list[str]] = {
    # CRUD
    "创建": ["create", "new", "add"],
    "新建": ["create", "new"],
    "添加": ["add", "create"],
    "删除": ["delete", "remove"],
    "更新": ["update", "modify"],
    "修改": ["update", "modify"],
    "查询": ["query", "list", "search", "get"],
    "查看": ["query", "view", "get"],
    "保存": ["save", "create", "store", "artifact"],
    # Phases
    "需求": ["requirement", "prd", "spec"],
    "架构": ["architecture", "schema"],
    "设计": ["design"],
    "开发": ["development", "dev", "code"],
    "测试": ["testing", "test"],
    "部署": ["deployment", "deploy", "cicd"],
    "监控": ["monitoring", "monitor"],
    # Artifacts
    "草稿": ["draft", "artifact", "document"],
    "产物": ["artifact", "deliverable"],
    "文档": ["document", "doc", "spec"],
    "代码": ["code", "source"],
    # Project management
    "项目": ["project", "workspace"],
    "工作区": ["workspace"],
    "任务": ["task"],
    "阶段": ["phase", "stage"],
    "进度": ["progress", "status"],
    "状态": ["status"],
    # Workflow
    "执行": ["run", "execute"],
    "运行": ["run", "execute"],
    "委派": ["delegate", "assign"],
    "图谱": ["graph", "workflow"],
    "生成": ["generate", "create", "produce"],
    "关联": ["link", "associate", "relate"],
    "同步": ["sync", "update"],
    "管理": ["manage", "management"],
    "分析": ["analyze", "analysis"],
    "清单": ["list", "checklist", "todo"],
    "标准化": ["standard", "spec"],
    # English synonyms
    "draft": ["artifact", "document", "create"],
    "requirement": ["prd", "spec"],
    "create": ["new", "add", "save"],
    "run": ["execute"],
    "search": ["query", "find", "list"],
}

_STOPWORDS = frozenset(",，。、；;：:！!？?（）()[]【】{}\"'`~ \t\n\r+/\\")

# ---------------------------------------------------------------------------
# Tokeniser  (jieba search-engine mode + synonym expansion)
# ---------------------------------------------------------------------------

_DELIM_RE = re.compile(r"[\s_\-]+")


def _tokenize(text: str) -> list[str]:
    """Tokenise mixed Chinese/English text via jieba search-engine mode."""
    text = text.lower().strip()
    if not text:
        return []
    # jieba.lcut_for_search generates sub-words for compound Chinese words
    # and keeps English words / numbers intact
    tokens = jieba.lcut_for_search(text)
    result: list[str] = []
    for tok in tokens:
        # Further split on underscores / hyphens (e.g. "workspace_create")
        for sub in _DELIM_RE.split(tok):
            sub = sub.strip()
            if not sub or all(ch in _STOPWORDS for ch in sub):
                continue
            if len(sub) == 1 and sub.isascii():
                continue
            result.append(sub)
    return result


def _expand_synonyms(tokens: list[str]) -> list[str]:
    """Expand tokens with bilingual synonym equivalents."""
    expanded = list(tokens)
    seen = set(tokens)
    for tok in tokens:
        for syn in _SYNONYMS.get(tok, []):
            if syn not in seen:
                expanded.append(syn)
                seen.add(syn)
    return expanded


# ---------------------------------------------------------------------------
# Per-tool corpus builder  (field repetition = implicit field weighting)
# ---------------------------------------------------------------------------

def _build_tool_doc(desc: "ToolDescriptor") -> str:
    """Build a weighted document string for BM25 indexing.

    Higher-value fields are repeated so BM25's TF naturally boosts them:
    name x3, display_name x2, description x1, params x1.
    """
    parts: list[str] = []
    parts.extend([desc.name] * 3)
    if desc.display_name:
        parts.extend([desc.display_name] * 2)
    parts.append(desc.description)

    for pname, pinfo in desc.parameters.get("properties", {}).items():
        parts.append(pname)
        if isinstance(pinfo, dict):
            parts.append(pinfo.get("description", ""))
            enum_vals = pinfo.get("enum")
            if isinstance(enum_vals, list):
                parts.extend(str(v) for v in enum_vals)

    return " ".join(parts)


# ---------------------------------------------------------------------------
# Public scorer
# ---------------------------------------------------------------------------

_MIN_FALLBACK = 3


def score_tools(
    query: str,
    descriptors: list["ToolDescriptor"],
    *,
    limit: int = 8,
    min_results: int = _MIN_FALLBACK,
) -> list["ToolDescriptor"]:
    """Score and rank tools against a natural-language query via BM25.

    Always returns at least *min_results* tools when enough exist,
    even if scores are low -- the LLM often benefits from seeing the
    closest candidates.
    """
    if not descriptors:
        return []

    query_tokens = _expand_synonyms(_tokenize(query))
    if not query_tokens:
        return descriptors[:min_results]

    # Build tokenised corpus for BM25
    corpus: list[list[str]] = []
    for desc in descriptors:
        doc_text = _build_tool_doc(desc)
        corpus.append(_tokenize(doc_text))

    bm25 = BM25Okapi(corpus)
    scores = bm25.get_scores(query_tokens)

    scored = sorted(
        zip(descriptors, scores), key=lambda x: x[1], reverse=True
    )

    positive_count = sum(1 for _, s in scored if s > 0)
    result_count = max(min(min_results, len(scored)), positive_count)
    result_count = min(result_count, limit, len(scored))

    return [d for d, _ in scored[:result_count]]


# Backward-compatible single-tool scorer (imported by provider.py)
def _score_match(query: str, desc: "ToolDescriptor") -> float:
    """Score a single tool descriptor -- legacy interface."""
    query_tokens = _expand_synonyms(_tokenize(query))
    if not query_tokens:
        return 0.0

    corpus = [_tokenize(_build_tool_doc(desc))]
    bm25 = BM25Okapi(corpus)
    scores = bm25.get_scores(query_tokens)
    return float(scores[0])


# ---------------------------------------------------------------------------
# Meta-tool: LLM-facing tool for lazy loading
# ---------------------------------------------------------------------------

class SearchToolsMeta(BaseTool):
    """Meta-tool: LLM calls this to discover available tools by capability."""

    name = "search_tools"
    description = (
        "Search for available tools by capability description. "
        "Returns matching tool schemas that you can then call directly. "
        "Use this when you need a specific capability but don't see the right tool."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": (
                    "Natural language description of the capability needed, "
                    "e.g. 'create a requirement draft' or '创建需求草稿'"
                ),
            },
        },
        "required": ["query"],
    }

    def __init__(self, manager: "ToolManager") -> None:
        self._manager = manager

    async def execute(self, **kwargs: Any) -> str:
        query = kwargs.get("query", "")
        if not query:
            return json.dumps({"error": "query is required"})

        matches = await self._manager.search(query, limit=8)
        schemas = [m.to_openai_schema() for m in matches]
        return json.dumps({
            "matched_tools": len(schemas),
            "tools": schemas,
            "hint": "You can now call any of these tools directly.",
        }, ensure_ascii=False)
