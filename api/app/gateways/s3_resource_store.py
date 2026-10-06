"""S3-backed resource store for cached speech audio.

Credentials come from the task role / app profile exactly like the Bedrock gateways,
via `app.gateways.bedrock.identity.session`. All boto3 calls run in a worker thread.
"""

from __future__ import annotations

import asyncio
from threading import Lock

import botocore.exceptions

from app.configuration.settings import Settings
from app.gateways.bedrock.identity import session as app_session
from app.gateways.resource_store import ResourceStore

CACHE_CONTROL = "public,max-age=31536000,immutable"


class S3ResourceStore(ResourceStore):
    def __init__(self, settings: Settings, *, region: str = "eu-west-1"):
        self.settings = settings
        self.region = region
        self.bucket = settings.speech_bucket
        self._client = None
        self._client_lock = Lock()

    def _get_client(self):
        with self._client_lock:
            if self._client is None:
                self._client = app_session(self.settings, self.region).client("s3")
            return self._client

    def _exists_sync(self, key: str) -> bool:
        try:
            self._get_client().head_object(Bucket=self.bucket, Key=key)
            return True
        except botocore.exceptions.ClientError as exc:
            # Without s3:ListBucket a missing key answers 403, not 404: both mean "not cached".
            if exc.response.get("Error", {}).get("Code") in ("403", "404", "NoSuchKey", "NotFound", "Forbidden"):
                return False
            raise

    def _put_sync(self, key: str, body: bytes) -> None:
        self._get_client().put_object(
            Bucket=self.bucket, Key=key, Body=body,
            ContentType="audio/mpeg", CacheControl=CACHE_CONTROL,
        )

    async def exists(self, key: str) -> bool:
        return await asyncio.to_thread(self._exists_sync, key)

    async def put_mp3(self, key: str, body: bytes) -> None:
        await asyncio.to_thread(self._put_sync, key, body)
