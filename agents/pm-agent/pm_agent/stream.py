"""SSE streaming helpers for the PM agent (unified protocol).

All SSE events use the unified format:

    event: <category>:<action>
    data: {"sid": "...", ...payload}
"""

from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator


async def yield_text_as_deltas(
    sid: str, text: str, chunk_size: int = 6,
) -> AsyncGenerator[str, None]:
    """Break *text* into small chunks and yield them as content:delta SSE events."""
    i = 0
    while i < len(text):
        end = min(i + chunk_size, len(text))
        if end < len(text) and text[end] not in (" ", "\n", "\t", "，", "。", "、", "；"):
            space = text.find(" ", end)
            newline = text.find("\n", end)
            candidates = [c for c in (space, newline) if c != -1]
            if candidates and min(candidates) - i < chunk_size * 3:
                end = min(candidates) + 1
        chunk = text[i:end]
        if chunk:
            yield f"event: content:delta\ndata: {json.dumps({'sid': sid, 'delta': chunk})}\n\n"
            await asyncio.sleep(0.012)
        i = end
