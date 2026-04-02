"""COS upload tool — allows agents to explicitly upload files to Tencent COS."""

from __future__ import annotations

from typing import Any

from .base import BaseTool


class CosUploadTool(BaseTool):
    name = "cos_upload_file"
    description = (
        "Upload text content as a file to cloud storage (Tencent COS) and "
        "return a publicly accessible CDN URL. Use this to persist documents, "
        "images, reports, or any file that should be downloadable."
    )
    parameters = {
        "type": "object",
        "properties": {
            "content": {
                "type": "string",
                "description": "The text content to upload.",
            },
            "filename": {
                "type": "string",
                "description": (
                    "Target filename including extension, e.g. 'wireframe.html' "
                    "or 'test-report.md'. Will be placed under a workspace-scoped path."
                ),
            },
            "content_type": {
                "type": "string",
                "description": "MIME type, e.g. 'text/html', 'text/markdown'. Default: 'text/plain'.",
            },
        },
        "required": ["content", "filename"],
    }

    async def execute(self, **kwargs: Any) -> str:
        content: str = kwargs["content"]
        filename: str = kwargs["filename"]
        content_type: str = kwargs.get("content_type", "text/plain; charset=utf-8")
        workspace_id: str = kwargs.get("_workspace_id", "default")

        from ..cos import CosUploader

        uploader = CosUploader()
        key = f"vibeos/{workspace_id}/uploads/{filename}"
        try:
            url = uploader.upload_text(content, key, content_type)
        except Exception as exc:
            return self._json_result({"status": "error", "error": str(exc)})
        return self._json_result({"status": "ok", "url": url, "filename": filename})


def create_cos_tools() -> list[BaseTool]:
    return [CosUploadTool()]
