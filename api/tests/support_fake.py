"""Explicit permissive offline judge stub: plumbing only, never quality evidence."""
import json

from app.domain.support import evidence_texts


def support_reply(kwargs):
    data = json.loads(kwargs["messages"][0]["content"])
    evidence = [{"source": sid, "excerpt": texts[0]} for sid, source in data["sources"].items()
                if (texts := [t for t in evidence_texts(source) if t.strip()])]
    return {"personal_ruling": False, "units": [
        {"id": uid, "verdict": "supported" if evidence else "non_claim", "evidence": evidence}
        for uid in data["units"]]}


def sentence_reply(kwargs):
    """Every sentence supported by the sources it cites (or all supplied sources when it cites none)."""
    from app.domain.support import MARKER
    data = json.loads(kwargs["messages"][0]["content"])
    rows = []
    for uid, text in data["sentences"].items():
        markers = MARKER.findall(text)
        rows.append({"id": uid, "verdict": "supported" if (markers or data["sources"]) else "non_claim",
                     "sources": markers or list(data["sources"])})
    return {"personal_ruling": False, "sentences": rows}
