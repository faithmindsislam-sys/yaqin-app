"""Read bundled tracks, lessons and sources for local storage and seeding."""

import json
from pathlib import Path

from app.domain.courses import migrate_course, place_course


def load_content(content_dir: Path) -> tuple[list[dict], dict[str, dict], dict[str, dict]]:
    tracks_path = content_dir / "tracks.json"
    tracks = json.loads(tracks_path.read_text()) if tracks_path.exists() else []
    lessons = {}
    for p in sorted((content_dir / "lessons").glob("*.json")):
        data = json.loads(p.read_text())
        lessons[data["id"]] = migrate_course(data, tracks)
    for course in lessons.values():
        place_course(tracks, course)
    sources = {}
    for p in sorted((content_dir / "sources").glob("*.json")):
        for s in json.loads(p.read_text()):
            sources[s["id"]] = s
    return tracks, lessons, sources
