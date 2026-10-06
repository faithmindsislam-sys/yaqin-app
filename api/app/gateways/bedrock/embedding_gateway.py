"""Titan embeddings, with keyword-search fallback when AWS is unavailable."""

from __future__ import annotations

import asyncio
import json
import logging
from threading import Lock

from botocore.config import Config

from app.configuration.settings import Settings
from app.domain.operations import CURRENT, diagnostic, stage
from app.gateways.bedrock.identity import session as app_session
from app.gateways.embedding_gateway import EmbeddingGateway

log = logging.getLogger(__name__)
DIMENSIONS = 1024


class BedrockEmbeddingGateway(EmbeddingGateway):
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = None
        self._client_lock = Lock()

    def _get_client(self):
        # Concurrent first requests must share one SDK client.
        with self._client_lock:
            if self._client is None:
                settings = self.settings
                session = app_session(settings, settings.aws_region)
                self._client = session.client("bedrock-runtime", config=Config(connect_timeout=2, read_timeout=8, retries={"total_max_attempts": 1}))
            return self._client

    def _embed_sync(self, text: str, budget=None, call_id=None, loop=None) -> list[float]:
        body = json.dumps({"inputText": text[:8000], "dimensions": DIMENSIONS, "normalize": True})
        response = self._get_client().invoke_model(
            modelId=self.settings.embed_model_id, body=body, accept="application/json", contentType="application/json"
        )
        data = json.loads(response["body"].read())
        diagnostic("embedding_result", model=self.settings.embed_model_id, input_tokens=data.get("inputTextTokenCount"),
                   dimensions=len(data.get("embedding", [])))
        if budget:
            tokens = budget.usage(data.get("inputTextTokenCount"), 0)
            # A timed-out async caller may still receive billable usage in this thread.
            if call_id and tokens is not None:
                asyncio.run_coroutine_threadsafe(budget.finish_usage(call_id, tokens), loop).result(timeout=10)
        return data["embedding"]

    async def embed(self, text: str) -> list[float] | None:
        if not self.settings.aws_enabled:
            diagnostic("embedding_skipped", reason="aws_unconfigured")
            return None
        budget = CURRENT.get()
        if budget:
            budget.reserve(text[:8000], 0, kind="embedding")
        call_id = await budget.begin_usage() if budget else None
        try:
            with stage("embedding", model=self.settings.embed_model_id):
                async with asyncio.timeout(min(10, budget.remaining()) if budget else 10):
                    return await asyncio.to_thread(self._embed_sync, text, budget, call_id, asyncio.get_running_loop())
        except Exception as exc:  # Network, throttling, or missing model access.
            log.warning("embedding_unavailable")
            diagnostic("embedding_fallback", error_type=type(exc).__name__)
            return None

    async def close(self) -> None:
        client, self._client = self._client, None
        if client is not None:
            await asyncio.to_thread(client.close)
