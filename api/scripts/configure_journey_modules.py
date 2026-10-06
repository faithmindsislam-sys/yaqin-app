"""Apply the agreed journeys without replacing course content or saved progress.

Run from api/: .venv/bin/python -m scripts.configure_journey_modules [--apply]
The default prints the proposal; --apply saves it atomically to the configured DB.
"""

import argparse
import asyncio
import json
from copy import deepcopy

from app.configuration.settings import get_settings
from app.domain.courses import migrate_course
from app.repositories.postgres_repository import PostgresRepository

LEGACY = {
    "explore": {"common-questions", "prophet-muhammad", "the-quran"},
    "first-steps": {"purification", "prayer", "fasting"},
    "deepen": {"understand-what-you-recite", "understanding-hadith", "fiqh-of-worship"},
}


def journeys(current: list, courses: dict, defaults: list) -> list:
    """Keep custom modules and each course's single journey."""
    result = []
    for template in defaults:
        old = next((t for t in current if t["id"] == template["id"]), template)
        target_ids = {s["id"] for s in template["modules"]}
        # Already configured: retain subsequent editorial changes and ordering.
        if target_ids <= {s["id"] for s in old["modules"]}:
            saved = deepcopy(old)
            for module in saved["modules"]:
                module["lessons"] = [cid for cid in module["lessons"] if cid in courses and courses[cid]["tracks"] == [old["id"]]]
            result.append(saved)
            continue
        track = {**deepcopy(old), "modules": deepcopy(template["modules"])}
        track["audience"] = template["audience"]
        custom = [deepcopy(s) for s in old["modules"] if s["id"] not in LEGACY[old["id"]] | target_ids]
        for module in custom:
            module["lessons"] = [cid for cid in module["lessons"] if cid in courses and courses[cid]["tracks"] == [old["id"]]]
        custom_ids = {cid for s in custom for cid in s["lessons"]}
        assigned = set(custom_ids)
        for module in track["modules"]:
            module["lessons"] = [cid for cid in module["lessons"] if cid in courses and courses[cid]["tracks"] == [old["id"]] and cid not in assigned]
            assigned.update(module["lessons"])
        members = list(dict.fromkeys([
            *[cid for s in old["modules"] for cid in s["lessons"]],
            *[cid for cid, c in courses.items() if old["id"] in c["tracks"]],
        ]))
        for cid in members:
            if cid not in courses or cid in assigned or courses[cid]["tracks"] != [old["id"]]:
                continue
            c = courses[cid]
            title = c["title"]["en"].lower()
            if old["id"] == "explore":
                index = 1 if c["subject"] == "history" else 2 if c["subject"] in {"fiqh", "ethics"} or "pillar" in title else 0
            elif old["id"] == "first-steps":
                index = 1 if c["subject"] in {"fiqh", "quran"} else 2 if c["subject"] == "ethics" else 0
            else:
                index = 1 if c["subject"] in {"fiqh", "quran"} else 2 if c["subject"] in {"hadith", "seerah", "history", "ethics"} else 0
            track["modules"][index]["lessons"].append(cid)
            assigned.add(cid)
        track["modules"].extend(custom)
        result.append(track)
    return result


async def main(apply: bool):
    from app.domain.curriculum import apply_save

    settings = get_settings()
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is not configured.")
    defaults = json.loads((settings.content_dir / "tracks.json").read_text())
    repository = await PostgresRepository.connect(settings.database_url)
    try:
        async with repository.pool.acquire() as conn:
            async with conn.transaction():
                config = await repository._curriculum_config(conn, lock=apply)
                rows = await conn.fetch("select id, data from lessons order by id" + (" for update" if apply else ""))
                courses = {r["id"]: migrate_course(r["data"]) for r in rows}
                proposed = journeys(config["tracks"], courses, defaults)
                if not apply:
                    print(json.dumps(proposed, ensure_ascii=False, indent=2))
                    return
                if proposed == config["tracks"]:
                    print("Journeys already configured; no changes.")
                    return
                changed = {}
                for track in proposed:
                    updates = apply_save(config, courses, "tracks", track["modules"], track["id"])
                    courses.update(updates)
                    changed.update(updates)
                config["tracks"] = proposed
                for cid, course in changed.items():
                    await conn.execute("update lessons set data = jsonb_set(data, '{tracks}', $2::jsonb), updated_at = clock_timestamp() where id = $1", cid, course["tracks"])
                await conn.execute("update app_config set data = $1, updated_at = clock_timestamp() where key = 'tracks'", proposed)
                await conn.execute("insert into admin_events (kind, payload) values ('journey_modules_configured', $1)", {"tracks": proposed})
        print("Configured three guided journeys; course content and progress preserved.")
    finally:
        await repository.pool.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    asyncio.run(main(parser.parse_args().apply))
