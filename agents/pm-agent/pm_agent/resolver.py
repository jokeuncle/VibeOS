"""Task resolver: maps parsed intents to handler functions via the registry.

Replaces the if-chain in ``execute_pm_intent`` with a two-layer lookup:
1. **Local handler registry** – decorated callables keyed by intent name + context.
2. **Remote template registry** – workspace-svc DB lookup (``handler_type`` +
   ``handler_ref`` determine which agent/capability to invoke).

If no template is matched, falls back to the local handler registry so that
existing PM handlers continue to work unchanged.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Coroutine, TYPE_CHECKING

from vibeos_agent import RegistryClient, ResolvedTemplate

if TYPE_CHECKING:
    from .intent import ParsedIntent

logger = logging.getLogger(__name__)

HandlerFn = Callable[..., Coroutine[Any, Any, dict[str, Any]]]

# ---------------------------------------------------------------------------
# Local handler registry (decorator-based, replaces the if-chain)
# ---------------------------------------------------------------------------

_HANDLERS: dict[tuple[str, str], HandlerFn] = {}


def intent_handler(intent: str, context: str = "*"):
    """Register a local handler for *intent* in *context* (``workspace`` / ``home`` / ``*``)."""
    def _wrap(fn: HandlerFn) -> HandlerFn:
        _HANDLERS[(intent, context)] = fn
        if context != "*":
            _HANDLERS.setdefault((intent, "*"), fn)
        return fn
    return _wrap


def get_local_handler(intent: str, context: str = "workspace") -> HandlerFn | None:
    """Look up a locally registered handler, trying exact context then wildcard."""
    return _HANDLERS.get((intent, context)) or _HANDLERS.get((intent, "*"))


# ---------------------------------------------------------------------------
# Template-based resolution (remote registry)
# ---------------------------------------------------------------------------

async def resolve_intent(
    intent_name: str,
    context: str,
    registry: RegistryClient | None,
) -> ResolvedTemplate | None:
    """Resolve an intent to a task template via the remote registry.

    Returns ``None`` if the registry is unavailable or no template matches.
    """
    if registry is None:
        return None
    try:
        return await registry.resolve_template(intent_name, context)
    except Exception as exc:
        logger.debug("Template resolution failed for %s/%s: %s", intent_name, context, exc)
        return None


# ---------------------------------------------------------------------------
# Unified dispatch: template → local handler fallback
# ---------------------------------------------------------------------------

async def dispatch_intent(
    parsed: "ParsedIntent",
    context_scope: str,
    registry: RegistryClient | None,
    *,
    handler_kwargs: dict[str, Any],
) -> dict[str, Any] | None:
    """Try to resolve and dispatch an intent.

    Resolution order:
    1. Remote task template (if registry available and match found).
       - ``handler_type == "internal"`` → looks up local handler by ``handler_ref``.
       - ``handler_type == "agent"`` → returns routing metadata (caller dispatches).
    2. Local handler registry (decorator-registered functions).
    3. Returns ``None`` if nothing matched (caller should provide default behavior).
    """
    template = await resolve_intent(parsed.intent, context_scope, registry)

    if template:
        if template.handler_type == "internal":
            ref = template.handler_ref or parsed.intent
            handler = get_local_handler(ref, context_scope)
            if handler:
                return await handler(parsed=parsed, **handler_kwargs)

        if template.handler_type == "agent":
            return {
                "resolved_by": "template",
                "handler_type": "agent",
                "handler_ref": template.handler_ref,
                "task_type": template.task_type,
                "required_capabilities": template.required_capabilities,
                "params_mapping": template.params_mapping,
            }

    local = get_local_handler(parsed.intent, context_scope)
    if local:
        return await local(parsed=parsed, **handler_kwargs)

    return None
