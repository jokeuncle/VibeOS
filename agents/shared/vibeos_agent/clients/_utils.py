"""Internal helpers shared across client modules."""

from __future__ import annotations


def _enum_val(v: object) -> str:
    """Safely extract the string value from an enum or plain string."""
    return v.value if hasattr(v, "value") else str(v)
