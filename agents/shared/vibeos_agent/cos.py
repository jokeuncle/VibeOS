"""Tencent Cloud COS upload utility for VibeOS artifact persistence."""

from __future__ import annotations

import logging
import os
import re
import tempfile
from typing import Any

logger = logging.getLogger(__name__)

BUCKET = os.environ.get("COS_BUCKET", "your-bucket-name")
REGION = os.environ.get("COS_REGION", "ap-guangzhou")
CDN_BASE = os.environ.get("COS_CDN_BASE", "https://your-cdn.example.com")

_DEFAULT_CREDENTIALS = {
    "COS_SECRET_ID": "REDACTED_COS_SECRET_ID",
    "COS_SECRET_KEY": "REDACTED_COS_SECRET_KEY",
}

ARTIFACT_EXT_MAP: dict[str, str] = {
    "prd_document": ".md",
    "clarified_requirements": ".md",
    "user_stories": ".md",
    "acceptance_criteria": ".md",
    "nfr_constraints": ".md",
    "stakeholder_analysis": ".md",
    "requirements_spec": ".md",
    "schema": ".sql",
    "api": ".yaml",
    "diagram": ".mmd",
    "adr": ".md",
    "design_spec": ".md",
    "design_image": ".html",
    "code": ".txt",
    "test_plan": ".md",
    "test_code": ".ts",
    "test_report": ".md",
    "deployment_config": ".yaml",
    "monitoring_config": ".yaml",
}


def _slugify(text: str, max_len: int = 60) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower().strip())
    slug = re.sub(r"[\s_]+", "-", slug)
    return slug[:max_len].rstrip("-") or "untitled"


class CosUploader:
    """Thin wrapper around cos-python-sdk-v5 for uploading artifacts."""

    def __init__(
        self,
        bucket: str = BUCKET,
        region: str = REGION,
        cdn_base: str = CDN_BASE,
        secret_id: str | None = None,
        secret_key: str | None = None,
    ) -> None:
        self.bucket = bucket
        self.region = region
        self.cdn_base = cdn_base.rstrip("/")
        self._secret_id = secret_id or os.environ.get(
            "COS_SECRET_ID", _DEFAULT_CREDENTIALS["COS_SECRET_ID"]
        )
        self._secret_key = secret_key or os.environ.get(
            "COS_SECRET_KEY", _DEFAULT_CREDENTIALS["COS_SECRET_KEY"]
        )
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        try:
            from qcloud_cos import CosConfig, CosS3Client
        except ImportError as exc:
            raise RuntimeError(
                "cos-python-sdk-v5 is not installed. "
                "Run: pip install cos-python-sdk-v5"
            ) from exc

        config = CosConfig(
            Region=self.region,
            SecretId=self._secret_id,
            SecretKey=self._secret_key,
        )
        self._client = CosS3Client(config)
        return self._client

    def generate_key(
        self,
        workspace_id: str,
        artifact_type: str,
        title: str,
        ext: str = "",
    ) -> str:
        if not ext:
            ext = ARTIFACT_EXT_MAP.get(artifact_type, ".txt")
        slug = _slugify(title)
        return f"vibeos/{workspace_id}/{artifact_type}/{slug}{ext}"

    def upload_text(
        self,
        content: str,
        key: str,
        content_type: str = "text/plain; charset=utf-8",
    ) -> str:
        client = self._get_client()
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".tmp", delete=False, encoding="utf-8"
        ) as f:
            f.write(content)
            tmp_path = f.name

        try:
            client.upload_file(
                Bucket=self.bucket,
                Key=key,
                LocalFilePath=tmp_path,
                EnableMD5=False,
                ContentType=content_type,
            )
        finally:
            os.unlink(tmp_path)

        return f"{self.cdn_base}/{key}"

    def upload_bytes(
        self,
        data: bytes,
        key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        client = self._get_client()
        with tempfile.NamedTemporaryFile(
            mode="wb", suffix=".tmp", delete=False
        ) as f:
            f.write(data)
            tmp_path = f.name

        try:
            client.upload_file(
                Bucket=self.bucket,
                Key=key,
                LocalFilePath=tmp_path,
                EnableMD5=False,
                ContentType=content_type,
            )
        finally:
            os.unlink(tmp_path)

        return f"{self.cdn_base}/{key}"

    def upload_artifact(
        self,
        workspace_id: str,
        artifact_type: str,
        title: str,
        content: str,
    ) -> str:
        """Upload artifact content to COS; return CDN URL."""
        ext = ARTIFACT_EXT_MAP.get(artifact_type, ".txt")
        key = self.generate_key(workspace_id, artifact_type, title, ext)

        ct_map: dict[str, str] = {
            ".md": "text/markdown; charset=utf-8",
            ".sql": "text/plain; charset=utf-8",
            ".yaml": "text/yaml; charset=utf-8",
            ".mmd": "text/plain; charset=utf-8",
            ".html": "text/html; charset=utf-8",
            ".txt": "text/plain; charset=utf-8",
            ".ts": "text/plain; charset=utf-8",
        }
        content_type = ct_map.get(ext, "text/plain; charset=utf-8")
        return self.upload_text(content, key, content_type)


_global_uploader: CosUploader | None = None


def get_cos_uploader() -> CosUploader | None:
    """Return a shared CosUploader if COS upload is enabled."""
    global _global_uploader
    if not os.environ.get("VIBEOS_COS_UPLOAD"):
        return None
    if _global_uploader is None:
        _global_uploader = CosUploader()
    return _global_uploader
