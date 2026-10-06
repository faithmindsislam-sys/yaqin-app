"""Ranked source passages returned by a repository."""

from dataclasses import dataclass


@dataclass
class Hit:
    source_id: str
    score: float  # cosine similarity (pg) or normalized BM25 (memory)
    passage: str


@dataclass
class Retrieved:
    sources: dict[str, dict]  # id -> Source, in rank order
    scores: dict[str, float]

    @property
    def ids(self) -> list[str]:
        return list(self.sources)

    def __bool__(self) -> bool:
        return bool(self.sources)
