"""Bridge-layer adapters — non-invasive wrappers around traditional SDLC infrastructure.

.. note::

    **Experimental / internal.** This subsystem is used by ``pipeline_tools``
    as an internal abstraction. New integrations should prefer the ``BaseTool``
    pattern (LLM-callable tools) rather than adding new ``BaseAdapter``
    subclasses, unless a non-LLM programmatic caller is required.

Each adapter exposes a uniform ``execute_task`` / ``get_task_status`` / ``cancel_task``
interface so that AI orchestration is completely decoupled from the underlying
CI/CD platform (GitLab, Jenkins, scripts, etc.).
"""

from .base import AdapterResult, AdapterStatus, BaseAdapter
from .gitlab_pipeline import GitLabPipelineAdapter
from .registry import AdapterRegistry

__all__ = [
    "AdapterRegistry",
    "AdapterResult",
    "AdapterStatus",
    "BaseAdapter",
    "GitLabPipelineAdapter",
]
