from abc import ABC, abstractmethod


class EmbeddingGateway(ABC):
    """None means embeddings are unavailable; retrieval uses keyword search."""

    @abstractmethod
    async def embed(self, text: str) -> list[float] | None: ...

    @abstractmethod
    async def close(self) -> None: ...
