from abc import ABC, abstractmethod


class QuranGateway(ABC):
    @abstractmethod
    def ayah_source(self, surah: int, ayah: int) -> dict | None:
        """Read an exact catalog verse, returning None for an unknown reference."""
        ...
