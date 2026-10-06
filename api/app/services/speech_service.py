"""Narration synthesis with server-side caching.

The audio key is a stable sha256 of model, voice, language and the normalised text, so
identical requests reuse the same cached object. The service never calls the TTS provider
when the object already exists.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import struct
from collections.abc import AsyncIterator

from app.domain.errors import ApiError
from app.gateways.resource_store import ResourceStore
from app.gateways.speech_gateway import SpeechGateway

MAX_CHARS = 4000
PCM_RATE = 24000
log = logging.getLogger(__name__)


def wav_header_unknown_length(rate: int = PCM_RATE, channels: int = 1, bits: int = 16) -> bytes:
    """WAV header for a stream whose length is not known yet (browsers accept 0xFFFFFFFF)."""
    byte_rate = rate * channels * bits // 8
    return b"".join((
        b"RIFF", struct.pack("<I", 0xFFFFFFFF), b"WAVE",
        b"fmt ", struct.pack("<IHHIIHH", 16, 1, channels, rate, byte_rate, channels * bits // 8, bits),
        b"data", struct.pack("<I", 0xFFFFFFFF),
    ))
_WHITESPACE = re.compile(r"\s+")


def _parse_voices(raw: str) -> dict[str, str]:
    voices: dict[str, str] = {}
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        key, _, name = item.partition("=")
        if name.strip():
            voices[key.strip()] = name.strip()
    return voices


class SpeechService:
    def __init__(self, speech: SpeechGateway, store: ResourceStore, *, model: str, voices: str, enabled: bool):
        self.speech = speech
        self.store = store
        self.model = model
        self.voices = _parse_voices(voices)
        self.enabled = enabled

    def _voice_name(self, lang: str, voice: str) -> str:
        name = self.voices.get(f"{lang}:{voice}")
        if not name:
            raise ApiError(400, "bad_request", "Unsupported voice for this language.")
        return name

    def _key(self, voice_name: str, lang: str, text: str) -> str:
        normalised = _WHITESPACE.sub(" ", text).strip()
        digest = hashlib.sha256(f"{self.model}|{voice_name}|{lang}|{normalised}".encode()).hexdigest()
        return digest

    def _prepare(self, text: str, lang: str, voice: str) -> tuple[str, str, str]:
        if not self.enabled:
            raise ApiError(503, "speech_unavailable", "Narration is temporarily unavailable.")
        if len(text) > MAX_CHARS:
            raise ApiError(400, "bad_request", "Text is too long to narrate.")
        if "[[" in text or "]]" in text:
            # Quran/hadith markers: scripture is never synthesized.
            raise ApiError(400, "bad_request", "Scripture text cannot be narrated.")
        voice_name = self._voice_name(lang, voice)
        key = self._key(voice_name, lang, text)
        # The CloudFront origin serves bucket keys as-is, so the URL path equals the object key.
        object_key = f"resources/speech/{key[:2]}/{key}.mp3"
        return voice_name, object_key, f"/{object_key}"

    async def cached_url(self, text: str, lang: str, voice: str) -> str | None:
        """The cached MP3 path when this narration already exists, else None."""
        _, object_key, url = self._prepare(text, lang, voice)
        return url if await self.store.exists(object_key) else None

    async def stream_wav(self, text: str, lang: str, voice: str) -> AsyncIterator[bytes]:
        """Yield a WAV stream (header, then PCM as the provider produces it) and cache the MP3
        afterwards. Call cached_url() first; this always synthesizes."""
        voice_name, object_key, _ = self._prepare(text, lang, voice)
        pcm = bytearray()
        yield wav_header_unknown_length()
        async for chunk in self.speech.stream_pcm(text, voice_name=voice_name):
            pcm.extend(chunk)
            yield chunk
        if pcm:
            # Cache in the background so the response ends as soon as the audio does.
            asyncio.get_running_loop().create_task(self._cache(object_key, bytes(pcm)))

    async def _cache(self, object_key: str, pcm: bytes) -> None:
        try:
            await self.store.put_mp3(object_key, await self.speech.pcm_to_mp3(pcm))
        except Exception as exc:  # noqa: BLE001  caching is best effort; the learner already heard the audio
            log.warning("speech_cache_failed error=%s", type(exc).__name__)

    async def narrate(self, text: str, lang: str, voice: str) -> dict:
        voice_name, object_key, url = self._prepare(text, lang, voice)

        if await self.store.exists(object_key):
            return {"url": url, "cached": True, "duration_ms": None}

        clip = await self.speech.synthesize(text, voice_name=voice_name)
        if clip is None:
            raise ApiError(503, "speech_unavailable", "Narration is temporarily unavailable.")
        await self.store.put_mp3(object_key, clip.mp3)
        return {"url": url, "cached": False, "duration_ms": clip.duration_ms}
