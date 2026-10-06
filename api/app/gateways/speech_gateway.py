"""Text-to-speech synthesis boundary. None means the provider is unavailable."""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass


@dataclass
class SpeechClip:
    """One synthesized clip: MP3 bytes and an optional duration estimate in ms."""

    mp3: bytes
    duration_ms: int | None


class SpeechGateway(ABC):
    @abstractmethod
    async def synthesize(self, text: str, *, voice_name: str) -> SpeechClip | None:
        """Return the narration as MP3, or None when synthesis is unavailable."""

    def stream_pcm(self, text: str, *, voice_name: str) -> AsyncIterator[bytes]:
        """Yield 16-bit mono PCM chunks (24 kHz) as the provider produces them.
        Raises on failure; the first chunk arriving means the provider accepted the request."""
        raise NotImplementedError

    async def pcm_to_mp3(self, pcm: bytes, rate: int = 24000) -> bytes:
        """Encode raw 16-bit mono PCM as MP3 (used to cache a streamed narration)."""
        raise NotImplementedError

    @abstractmethod
    async def close(self) -> None:
        """Release any held network resources."""
