from copy import deepcopy
import json

from app.configuration.settings import ROOT
from scripts.configure_journey_modules import journeys


def test_journey_upgrade_keeps_custom_modules_membership_and_content_and_is_idempotent():
    defaults = json.loads((ROOT / "content" / "tracks.json").read_text())
    courses = {cid: {"id": cid, "title": {"en": cid, "ar": cid}, "subject": subject,
                      "level": 4, "tracks": ["explore"], "cards": ["keep"]}
               for cid, subject in [("who-is-god", "aqidah"), ("wudu-order", "fiqh"), ("custom", "ethics")]}
    old = deepcopy(defaults)
    for track in old:
        track["modules"] = [{"id": {"explore": "common-questions", "first-steps": "purification", "deepen": "understand-what-you-recite"}[track["id"]],
                              "title": track["title"], "lessons": ["who-is-god", "wudu-order"] if track["id"] == "explore" else []}]
    old[0]["modules"].append({"id": "custom-module", "title": {"en": "Custom", "ar": "خاص"}, "lessons": ["custom"]})
    before = deepcopy(courses)
    upgraded = journeys(old, courses, defaults)
    assert [len(t["modules"]) for t in upgraded] == [4, 3, 3]
    assert upgraded[0]["modules"][-1] == old[0]["modules"][-1]
    assert all(not m["lessons"] for t in upgraded[1:] for m in t["modules"])
    for track in upgraded:
        listed = [cid for s in track["modules"] for cid in s["lessons"]]
        assert len(listed) == len(set(listed))
        assert all(courses[cid]["tracks"] == [track["id"]] for cid in listed)
    assert courses == before
    assert journeys(upgraded, courses, defaults) == upgraded
