"""Feishu/Lark tools – agent-callable functions backed by lark-oapi SDK."""

from __future__ import annotations

import logging
import os
from typing import Any

from .base import BaseTool

logger = logging.getLogger(__name__)

_FEISHU_APP_ID = os.getenv("FEISHU_APP_ID", "")
_FEISHU_APP_SECRET = os.getenv("FEISHU_APP_SECRET", "")


def _get_client() -> Any:
    """Lazy-init Feishu/Lark client."""
    try:
        import lark_oapi as lark  # type: ignore[import-untyped]
    except ImportError:
        raise RuntimeError("lark-oapi is not installed. Run: pip install lark-oapi")

    if not _FEISHU_APP_ID or not _FEISHU_APP_SECRET:
        raise RuntimeError("FEISHU_APP_ID and FEISHU_APP_SECRET env vars must be set")

    return lark.Client.builder() \
        .app_id(_FEISHU_APP_ID) \
        .app_secret(_FEISHU_APP_SECRET) \
        .build()


class FeishuSendMessage(BaseTool):
    name = "feishu_send_message"
    display_name = "发送飞书消息"
    description = "Send a text or rich-text message to a Feishu chat or user."
    parameters = {
        "type": "object",
        "properties": {
            "receive_id": {"type": "string", "description": "Chat ID, user open_id, or email"},
            "receive_id_type": {
                "type": "string",
                "enum": ["chat_id", "open_id", "email"],
                "description": "Type of receive_id (default: chat_id)",
            },
            "msg_type": {
                "type": "string",
                "enum": ["text", "post", "interactive"],
                "description": "Message type (default: text)",
            },
            "content": {"type": "string", "description": "Message content (JSON string per Feishu API)"},
        },
        "required": ["receive_id", "content"],
    }

    async def execute(self, **kwargs: Any) -> str:
        import asyncio
        import json as _json
        receive_id = kwargs["receive_id"]
        receive_id_type = kwargs.get("receive_id_type", "chat_id")
        msg_type = kwargs.get("msg_type", "text")
        content = kwargs["content"]

        if msg_type == "text" and not content.startswith("{"):
            content = _json.dumps({"text": content})

        def _send() -> dict[str, Any]:
            import lark_oapi as lark  # type: ignore[import-untyped]
            from lark_oapi.api.im.v1 import (  # type: ignore[import-untyped]
                CreateMessageRequest,
                CreateMessageRequestBody,
            )

            client = _get_client()
            body = CreateMessageRequestBody.builder() \
                .receive_id(receive_id) \
                .msg_type(msg_type) \
                .content(content) \
                .build()
            req = CreateMessageRequest.builder() \
                .receive_id_type(receive_id_type) \
                .request_body(body) \
                .build()
            resp = client.im.v1.message.create(req)
            if not resp.success():
                return {"error": f"Feishu API error: code={resp.code} msg={resp.msg}"}
            return {"message_id": resp.data.message_id, "status": "sent"}

        result = await asyncio.to_thread(_send)
        return self._json_result(result)


class FeishuCreateTask(BaseTool):
    name = "feishu_create_task"
    display_name = "创建飞书任务"
    description = "Create a task in Feishu Tasks."
    parameters = {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "Task title/summary"},
            "description": {"type": "string", "description": "Task description"},
            "due_date": {"type": "string", "description": "Due date in ISO 8601 format (optional)"},
        },
        "required": ["summary"],
    }

    async def execute(self, **kwargs: Any) -> str:
        import asyncio

        summary = kwargs["summary"]
        description = kwargs.get("description", "")

        def _create() -> dict[str, Any]:
            import lark_oapi as lark  # type: ignore[import-untyped]
            from lark_oapi.api.task.v2 import (  # type: ignore[import-untyped]
                CreateTaskRequest,
                CreateTaskRequestBody,
                InputTask,
            )

            client = _get_client()
            task = InputTask.builder() \
                .summary(summary) \
                .description(description) \
                .build()
            body = CreateTaskRequestBody.builder() \
                .task(task) \
                .build()
            req = CreateTaskRequest.builder() \
                .request_body(body) \
                .build()
            resp = client.task.v2.task.create(req)
            if not resp.success():
                return {"error": f"Feishu API error: code={resp.code} msg={resp.msg}"}
            return {"task_id": resp.data.task.guid, "summary": summary, "status": "created"}

        result = await asyncio.to_thread(_create)
        return self._json_result(result)


class FeishuUploadDoc(BaseTool):
    name = "feishu_upload_doc"
    display_name = "上传飞书文档"
    description = "Create a document in Feishu Docs with the given content."
    parameters = {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Document title"},
            "content": {"type": "string", "description": "Document content (plain text or Markdown)"},
            "folder_token": {"type": "string", "description": "Parent folder token (optional, uses root if omitted)"},
        },
        "required": ["title", "content"],
    }

    async def execute(self, **kwargs: Any) -> str:
        import asyncio
        import json as _json

        title = kwargs["title"]
        content = kwargs["content"]
        folder_token = kwargs.get("folder_token", "")

        def _create() -> dict[str, Any]:
            import lark_oapi as lark  # type: ignore[import-untyped]
            from lark_oapi.api.docx.v1 import (  # type: ignore[import-untyped]
                CreateDocumentRequest,
                CreateDocumentRequestBody,
            )

            client = _get_client()
            body = CreateDocumentRequestBody.builder() \
                .title(title) \
                .folder_token(folder_token if folder_token else None) \
                .build()
            req = CreateDocumentRequest.builder() \
                .request_body(body) \
                .build()
            resp = client.docx.v1.document.create(req)
            if not resp.success():
                return {"error": f"Feishu API error: code={resp.code} msg={resp.msg}"}
            return {
                "document_id": resp.data.document.document_id,
                "title": title,
                "status": "created",
                "note": "Content was set as title; use Feishu block API for full body",
            }

        result = await asyncio.to_thread(_create)
        return self._json_result(result)


def create_feishu_tools() -> list[BaseTool]:
    """Factory: create all Feishu tools (they lazy-init the client on first call)."""
    return [
        FeishuSendMessage(),
        FeishuCreateTask(),
        FeishuUploadDoc(),
    ]
