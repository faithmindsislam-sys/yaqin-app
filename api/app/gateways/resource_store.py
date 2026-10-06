"""Object storage boundary for cached speech MP3s."""

from abc import ABC, abstractmethod


class ResourceStore(ABC):
    @abstractmethod
    async def exists(self, key: str) -> bool:
        """True when an object already lives at `key`."""

    @abstractmethod
    async def put_mp3(self, key: str, body: bytes) -> None:
        """Store immutable, publicly cacheable MP3 audio at `key`."""
