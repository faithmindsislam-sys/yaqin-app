"""Gemini text-to-speech gateway: generateContent -> PCM/WAV -> MP3 via ffmpeg.

Never logs the API key or the narration text.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import struct

import httpx
from collections.abc import AsyncIterator

from app.configuration.settings import Settings
from app.gateways.speech_gateway import SpeechClip, SpeechGateway

log = logging.getLogger(__name__)

_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_STREAM_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse"
PCM_RATE = 24000


def _wav_header(pcm_len: int, rate: int, channels: int = 1, bits: int = 16) -> bytes:
    byte_rate = rate * channels * bits // 8
    block_align = channels * bits // 8
    return b"".join((
        b"RIFF", struct.pack("<I", 36 + pcm_len), b"WAVE",
        b"fmt ", struct.pack("<IHHIIHH", 16, 1, channels, rate, byte_rate, block_align, bits),
        b"data", struct.pack("<I", pcm_len),
    ))


def _parse_pcm_rate(mime_type: str) -> int:
    """`audio/L16;codec=pcm;rate=24000` -> 24000; default 24 kHz."""
    for part in mime_type.split(";"):
        key, _, value = part.strip().partition("=")
        if key.strip().lower() == "rate" and value.strip().isdigit():
            return int(value.strip())
    return 24000


class GeminiSpeechGateway(SpeechGateway):
    def __init__(self, settings: Settings):
        self.settings = settings
        self.enabled = bool(settings.gemini_api_key)
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(60), follow_redirects=False, trust_env=False)

    async def synthesize(self, text: str, *, voice_name: str) -> SpeechClip | None:
        if not self.enabled:
            return None
        body = {
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice_name}}},
            },
        }
        try:
            response = await self.client.post(
                _ENDPOINT.format(model=self.settings.speech_model),
                headers={"x-goog-api-key": self.settings.gemini_api_key},
                json=body,
            )
            response.raise_for_status()
            data = response.json()
            inline = data["candidates"][0]["content"]["parts"][0]["inlineData"]
            audio = base64.b64decode(inline["data"])
            mime_type = inline.get("mimeType", "")
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
            log.warning("speech_synthesis_failed error=%s", type(exc).__name__)
            return None

        rate: int | None = None
        if mime_type.startswith("audio/l16") or mime_type.startswith("audio/L16") or "codec=pcm" in mime_type:
            rate = _parse_pcm_rate(mime_type)
            source = _wav_header(len(audio), rate) + audio
        else:
            source = audio
            rate = _parse_pcm_rate(mime_type) if "rate=" in mime_type else None

        try:
            mp3 = await self._to_mp3(source)
        except Exception as exc:  # noqa: BLE001  conversion failure must degrade to the browser voice
            log.warning("speech_conversion_failed error=%s", type(exc).__name__)
            return None

        duration_ms = None
        if rate:
            # Estimate from the raw PCM payload: bytes / 2 (16-bit) / rate.
            duration_ms = round(len(audio) / 2 / rate * 1000)
        return SpeechClip(mp3=mp3, duration_ms=duration_ms)

    async def stream_pcm(self, text: str, *, voice_name: str) -> AsyncIterator[bytes]:
        if not self.enabled:
            raise RuntimeError("speech disabled")
        body = {
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice_name}}},
            },
        }
        async with self.client.stream("POST", _STREAM_ENDPOINT.format(model=self.settings.speech_model),
                                      headers={"x-goog-api-key": self.settings.gemini_api_key}, json=body) as response:
            response.raise_for_status()
            buffer = b""
            async for raw in response.aiter_bytes():
                buffer += raw
                while True:
                    # SSE events end with a blank line; Gemini uses \r\n\r\n.
                    cut = min((i for i in (buffer.find(b"\n\n"), buffer.find(b"\r\n\r\n")) if i >= 0), default=-1)
                    if cut < 0:
                        break
                    block, buffer = buffer[:cut], buffer[cut:].lstrip(b"\r\n")
                    for line in block.splitlines():
                        if not line.startswith(b"data:"):
                            continue
                        try:
                            event = json.loads(line[5:].strip())
                        except ValueError:
                            continue
                        for part in event.get("candidates", [{}])[0].get("content", {}).get("parts", []):
                            inline = part.get("inlineData")
                            if inline and "codec=pcm" in inline.get("mimeType", "").replace(" ", "") or (inline and inline.get("mimeType", "").lower().startswith("audio/l16")):
                                yield base64.b64decode(inline["data"])

    async def pcm_to_mp3(self, pcm: bytes, rate: int = PCM_RATE) -> bytes:
        return await self._to_mp3(_wav_header(len(pcm), rate) + pcm)

    async def _to_mp3(self, source: bytes) -> bytes:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "64k", "-f", "mp3", "pipe:1",
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate(source)
        if proc.returncode != 0 or not stdout:
            raise RuntimeError(f"ffmpeg exited {proc.returncode}: {stderr[:200].decode('utf-8', 'replace')}")
        return bytes(stdout)

    async def close(self) -> None:
        await self.client.aclose()
