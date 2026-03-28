"""Code-aware chunking and indexing for codebase search."""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any

from llama_index.core import Document

logger = logging.getLogger(__name__)

_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    "python": [
        re.compile(r"^(class\s+\w+.*?:)", re.MULTILINE),
        re.compile(r"^((?:async\s+)?def\s+\w+.*?:)", re.MULTILINE),
    ],
    "go": [
        re.compile(r"^(type\s+\w+\s+struct\s*\{)", re.MULTILINE),
        re.compile(r"^(func\s+(?:\(.*?\)\s*)?\w+\s*\(.*?\).*?\{)", re.MULTILINE),
    ],
    "typescript": [
        re.compile(r"^((?:export\s+)?class\s+\w+.*?\{)", re.MULTILINE),
        re.compile(
            r"^((?:export\s+)?(?:async\s+)?function\s+\w+\s*\(.*?\).*?\{)", re.MULTILINE
        ),
        re.compile(
            r"^((?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?\(.*?\)\s*(?:=>|:\s*\w+\s*=>))",
            re.MULTILINE,
        ),
    ],
    "javascript": [
        re.compile(r"^((?:export\s+)?class\s+\w+.*?\{)", re.MULTILINE),
        re.compile(
            r"^((?:export\s+)?(?:async\s+)?function\s+\w+\s*\(.*?\).*?\{)", re.MULTILINE
        ),
    ],
}


def _extract_imports(source: str, language: str) -> str:
    """Extract the import/package preamble from a source file."""
    lines = source.split("\n")
    import_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("//"):
            import_lines.append(line)
            continue
        if language == "python" and (
            stripped.startswith("import ") or stripped.startswith("from ")
        ):
            import_lines.append(line)
        elif language == "go" and (
            stripped.startswith("package ") or stripped.startswith("import")
        ):
            import_lines.append(line)
        elif language in ("typescript", "javascript") and (
            stripped.startswith("import ") or stripped.startswith("require(")
        ):
            import_lines.append(line)
        else:
            break

    return "\n".join(import_lines).strip()


def _split_by_definitions(source: str, language: str) -> list[dict[str, Any]]:
    """Split source into chunks at function/class boundaries.

    Falls back to a simple line-based split for unrecognised languages.
    """
    patterns = _PATTERNS.get(language, [])
    if not patterns:
        return _split_generic(source)

    split_positions: list[tuple[int, str]] = []
    for pat in patterns:
        for m in pat.finditer(source):
            chunk_type = "class" if "class " in m.group(0) else "function"
            split_positions.append((m.start(), chunk_type))

    if not split_positions:
        return _split_generic(source)

    split_positions.sort(key=lambda x: x[0])

    chunks: list[dict[str, Any]] = []
    for i, (pos, ctype) in enumerate(split_positions):
        end = split_positions[i + 1][0] if i + 1 < len(split_positions) else len(source)
        text = source[pos:end].rstrip()
        if text:
            chunks.append({"text": text, "chunk_type": ctype})

    leading = source[: split_positions[0][0]].strip() if split_positions else ""
    if leading:
        chunks.insert(0, {"text": leading, "chunk_type": "module"})

    return chunks


def _split_generic(source: str, max_lines: int = 60) -> list[dict[str, Any]]:
    """Fall-back: split source into fixed-size line groups."""
    lines = source.split("\n")
    chunks: list[dict[str, Any]] = []

    for i in range(0, len(lines), max_lines):
        text = "\n".join(lines[i : i + max_lines]).rstrip()
        if text:
            chunks.append({"text": text, "chunk_type": "module"})

    return chunks


def build_code_documents(
    workspace_id: str,
    files: list[dict[str, str]],
) -> list[Document]:
    """Convert code files into LlamaIndex Documents with rich metadata.

    Each file dict must have: path, content, language.
    """
    documents: list[Document] = []

    for f in files:
        file_path = f["path"]
        content = f["content"]
        language = f.get("language", "").lower()

        imports = _extract_imports(content, language)
        chunks = _split_by_definitions(content, language)

        for chunk in chunks:
            text = chunk["text"]
            if imports and chunk["chunk_type"] != "module":
                text = f"{imports}\n\n{text}"

            doc_id = str(uuid.uuid4())
            doc = Document(
                text=text,
                metadata={
                    "doc_id": doc_id,
                    "workspace_id": workspace_id,
                    "file_path": file_path,
                    "language": language,
                    "chunk_type": chunk["chunk_type"],
                    "doc_type": "code",
                    "title": file_path,
                },
                doc_id=doc_id,
            )
            documents.append(doc)

    logger.info(
        "Built %d code chunks from %d files for workspace %s",
        len(documents),
        len(files),
        workspace_id,
    )
    return documents
