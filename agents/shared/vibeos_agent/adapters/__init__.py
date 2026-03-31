"""Bridge-layer adapters — non-invasive wrappers around traditional SDLC infrastructure.

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
