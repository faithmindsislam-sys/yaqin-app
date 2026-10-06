"""In-memory BM25 index over normalized English and Arabic text."""

import math
from collections import Counter

from app.domain.text import tokens


class BM25:
    def __init__(self, docs: dict[str, str], k1: float = 1.4, b: float = 0.75):
        self.k1, self.b = k1, b
        self.docs = {d: tokens(t) for d, t in docs.items()}
        self.len = {d: len(t) for d, t in self.docs.items()}
        self.avg = (sum(self.len.values()) / len(self.len)) if self.len else 1.0
        df: Counter = Counter()
        for toks in self.docs.values():
            df.update(set(toks))
        n = max(len(self.docs), 1)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.tf = {d: Counter(t) for d, t in self.docs.items()}

    def search(self, query: str, k: int = 8) -> list[tuple[str, float, int]]:
        """Returns (doc_id, score, matched_terms)."""
        q = set(tokens(query))
        scored = []
        for d, tf in self.tf.items():
            s, hits = 0.0, 0
            for t in q:
                if t not in tf:
                    continue
                hits += 1
                f = tf[t]
                s += self.idf[t] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * self.len[d] / self.avg))
            if hits:
                scored.append((d, s, hits))
        scored.sort(key=lambda x: -x[1])
        return scored[:k]
