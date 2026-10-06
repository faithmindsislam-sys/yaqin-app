"""Curriculum invariants, shared by transactional storage implementations."""

import re
from copy import deepcopy

from .courses import TRACK_IDS, lesson_level
from .errors import ApiError


def slug(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:100]


def reject(message: str) -> None:
    raise ApiError(409, "in_use", message)


def apply_save(config: dict, courses: dict, key: str, items: list, track_id: str | None = None) -> dict:
    """Validate before mutation. Return only courses whose track membership changed."""
    ids = [i["id"] for i in items]
    if len(ids) != len(set(ids)):
        raise ApiError(400, "bad_request", "IDs must be unique.")
    if key == "subjects":
        old_ids = {s["id"] for s in config[key]}
        levels = {l["id"] for l in config["levels"]}
        for s in items:
            if s["id"] not in old_ids and (not slug(s["title"]["en"]) or s["id"] != slug(s["title"]["en"])):
                raise ApiError(400, "bad_request", "A new subject ID must be the slug of its English title.")
            if len(s["levels"]) != len(set(s["levels"])) or not set(s["levels"]) <= levels:
                raise ApiError(400, "bad_request", "Choose distinct existing levels.")
        offered = {s["id"]: s["levels"] for s in items}
        for c in courses.values():
            if c["subject"] not in offered:
                reject("A course uses this subject. Move its courses before deleting it.")
            if lesson_level(c["level"]) not in offered[c["subject"]]:
                reject("A course uses this subject level. Move its courses before removing it.")
    elif key == "levels":
        old_ids = {l["id"] for l in config[key]}
        added = [i for i in ids if i not in old_ids]
        if added != list(range(max(old_ids, default=0) + 1, max(old_ids, default=0) + 1 + len(added))):
            raise ApiError(400, "bad_request", "New levels must use the next number.")
        if any(lesson_level(c["level"]) not in ids for c in courses.values()):
            reject("A course uses this level. Move its courses before deleting it.")
        config["subjects"] = [{**s, "levels": [i for i in s["levels"] if i in ids]} for s in config["subjects"]]
    elif key == "tracks":
        track = next((t for t in config[key] if t["id"] == track_id), None)
        if track_id not in TRACK_IDS or track is None:
            raise ApiError(404, "not_found", "Track not found.")
        listed = [cid for m in items for cid in m["lessons"]]
        listed_ids = set(listed)
        if len(listed) != len(listed_ids) or any(cid not in courses for cid in listed):
            raise ApiError(400, "bad_request", "Choose distinct existing courses for this track.")
        if any(courses[cid]["tracks"] != [track_id] for cid in listed):
            reject("A course belongs to one journey. Change its journey in the course editor first.")
        for m in track["modules"]:
            if m["id"] not in ids and any(cid not in listed_ids for cid in m.get("lessons", [])):
                reject("Move this module's courses before deleting it.")
        changed = {}
        for cid, c in courses.items():
            present = track_id in c["tracks"]
            if present == (cid in listed_ids):
                continue
            members = [*c["tracks"], track_id] if not present else [t for t in c["tracks"] if t != track_id]
            if not members:
                reject("A course must belong to one journey.")
            changed[cid] = {**c, "tracks": members}
        track["modules"] = deepcopy(items)
        return changed
    config[key] = deepcopy(items)
    return {}


def check_revision(revisions: dict, key: str, expected: str | None) -> None:
    if revisions[key] != expected:
        raise ApiError(409, "stale_curriculum", "The curriculum changed. Reload it before saving again.")
