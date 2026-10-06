"""Course classification and compatibility for persisted lesson records.

Course data owns membership. The legacy modules in app_config own ordering only;
their IDs and titles are retained, never inferred from difficulty.
"""

import json
from pathlib import Path

from .errors import ApiError

SUBJECTS = json.loads((Path(__file__).resolve().parents[3] / "content" / "subjects.json").read_text())
SUBJECTS = [{**s, "levels": [1, 2, 3, 4]} for s in SUBJECTS]
DEFAULT_LEVELS = json.loads((Path(__file__).resolve().parents[3] / "content" / "levels.json").read_text())
TRACK_IDS = {"explore", "first-steps", "deepen"}
_MAPPING = json.loads((Path(__file__).resolve().parents[3] / "content" / "course-migration.json").read_text())
SEED_SUBJECTS = _MAPPING["courses"]
MODULE_SUBJECTS = _MAPPING["modules"]


def migrate_course(data: dict, tracks: list[dict] = ()) -> dict:
    """Idempotent metadata conversion; keep the first saved journey for older courses."""
    out = {k: v for k, v in data.items() if k not in ("track", "module", "tags")}
    out.setdefault("subject", SEED_SUBJECTS.get(data.get("id"), MODULE_SUBJECTS.get(data.get("module"), "islam")))
    if "tracks" not in out:
        listed = [t["id"] for t in tracks if any(data.get("id") in m.get("lessons", []) for m in t.get("modules", []))]
        out["tracks"] = list(dict.fromkeys([*([data["track"]] if data.get("track") else []), *listed]))
    out["tracks"] = out["tracks"][:1]
    return out


def lesson_level(level):
    return {"foundation": 1, "deeper": 2}.get(level, level)


def validate_classification(course: dict, tracks: list[dict], subjects=None, levels=None) -> None:
    subjects = SUBJECTS if subjects is None else subjects
    levels = DEFAULT_LEVELS if levels is None else levels
    subject = next((s for s in subjects if s["id"] == course.get("subject")), None)
    if subject is None:
        raise ApiError(400, "bad_request", "Choose an existing subject.")
    level = lesson_level(course.get("level"))
    if type(level) is not int or level not in {l["id"] for l in levels}:
        raise ApiError(400, "bad_request", "Choose an existing level.")
    if level not in subject["levels"]:
        raise ApiError(400, "bad_request", "This level is not offered by the subject.")
    members = course.get("tracks", [])
    if len(members) != 1 or not set(members) <= {t["id"] for t in tracks}:
        raise ApiError(400, "bad_request", "Choose exactly one existing journey.")


def place_course(tracks: list[dict], course: dict, subjects=None, levels=None) -> None:
    """Keep existing positions; append new membership, remove obsolete ordering references."""
    validate_classification(course, tracks, subjects, levels)
    for track in tracks:
        seen = False
        for section in track.get("modules", []):
            ordered = []
            for cid in section.get("lessons", []):
                if cid != course["id"]:
                    ordered.append(cid)
                elif track["id"] in course["tracks"] and not seen:
                    ordered.append(cid)
                    seen = True
            section["lessons"] = ordered
        if track["id"] in course["tracks"] and not seen:
            if not track.get("modules"):
                track["modules"] = [{"id": "courses", "title": track["title"], "lessons": []}]
            track["modules"][0]["lessons"].append(course["id"])
