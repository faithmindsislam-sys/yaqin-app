import copy

import pytest

from app.http.auth import User, current_user
from app.main import app

AUTHOR = "00000000-0000-0000-0000-000000000001"
OTHER = "00000000-0000-0000-0000-000000000002"


@pytest.fixture
def actor():
    def set_actor(role="teacher", uid=AUTHOR):
        app.dependency_overrides[current_user] = lambda: User(id=uid, role=role)

    yield set_actor
    app.dependency_overrides.clear()


def draft():
    return {
        "id": "test-management",
        "track": "first-steps",
        "module": "purification",
        "minutes": 3,
        "title": {"en": "TEST management", "ar": "اختبار الإدارة"},
        "summary": {"en": "TEST lifecycle", "ar": "اختبار دورة الدرس"},
        "cards": [
            {
                "id": "c1",
                "kind": "concept",
                "title": {"en": "Wash", "ar": "الغسل"},
                "body": {"en": "Wash your face", "ar": "اغسل الوجه"},
                "sources": ["quran:5:6"],
            }
        ],
    }


def unsourced_duty():
    """A page marked obligatory without a source: an instant rule check blocks it."""
    return {
        "id": "c2",
        "kind": "concept",
        "label": "obligatory",
        "title": {"en": "Duty", "ar": "واجب"},
        "body": {"en": "You must do this", "ar": "يجب فعل هذا"},
    }


@pytest.mark.parametrize("level", [1, 2, 3, 4, "foundation", "deeper"])
def test_numbered_levels_and_legacy_drafts(client, actor, level):
    actor()
    lesson = {**draft(), "level": level}
    response = client.post("/api/review/drafts", json=lesson)
    assert response.status_code == 200
    expected = level
    assert app.state.services.repository.lessons[lesson["id"]]["level"] == expected


@pytest.mark.parametrize("level", [0, 5, "advanced"])
def test_invalid_levels_cannot_be_saved(client, actor, level):
    actor()
    assert client.post("/api/review/drafts", json={**draft(), "level": level}).status_code == 400


def test_lifecycle_preserves_position_then_deletes_and_audits(client, fake_llm, actor):
    fake_llm()
    actor()
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    assert client.post("/api/review/test-management/submit").status_code == 200
    assert (
        client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 403
    )  # an author never approves
    actor("super_admin", OTHER)
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
    store = app.state.services.repository
    before = copy.deepcopy(store.tracks)
    assert "lesson:test-management:c1" in store.doc_sources
    actor("teacher", OTHER)
    assert client.post("/api/review/test-management/unpublish").status_code == 403
    actor()
    assert client.post("/api/review/test-management/unpublish").status_code == 200
    assert store.tracks == before
    assert [e["kind"] for e in store.events] == ["created", "submit", "approve", "unpublish"]
    assert "lesson:test-management:c1" not in store.doc_sources
    assert "test-management" not in client.get("/api/content").json()["lessons"]
    assert not any(
        lesson["id"] == "test-management"
        for t in client.get("/api/tracks").json()
        for m in t["modules"]
        for lesson in m["lessons"]
    )
    actor("learner")
    assert client.get("/api/lessons/test-management").status_code == 404
    actor()
    assert client.post("/api/review/test-management/unpublish").status_code == 409
    # Publishing after Hide rebuilds retrieval; an admin can delete it directly.
    assert client.post("/api/review/test-management/submit").status_code == 200
    actor("admin", OTHER)
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
    assert "lesson:test-management:c1" in store.doc_sources
    assert client.post("/api/review/test-management/delete").status_code == 200
    assert "test-management" not in store.lessons
    assert all("test-management" not in m["lessons"] for t in store.tracks for m in t["modules"])
    assert "lesson:test-management:c1" not in store.doc_sources
    assert store.admin_events[-1]["kind"] == "lesson_deleted"
    assert store.admin_events[-1]["payload"] == {"id": "test-management", "title": draft()["title"]}


def test_admin_updates_a_published_course_in_place(client, fake_llm, actor):
    fake_llm()
    actor("admin")
    edited = {**draft(), "summary": {"en": "TEST edited", "ar": "اختبار معدّل"}}
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    assert client.post("/api/review/published", json=edited).status_code == 409  # not published yet
    assert client.post("/api/review/test-management/submit").status_code == 200
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
    store = app.state.services.repository
    before = copy.deepcopy(store.tracks)
    actor()
    assert client.post("/api/review/published", json=edited).status_code == 403  # the author is not an admin
    actor("admin", OTHER)
    # Manual updates skip automated review, including rules about unsourced obligations.
    llm = fake_llm({"issues": [{"severity": "high", "issue": "TEST AI issue"}]})
    unchecked = client.post("/api/review/published", json={**edited, "cards": [*edited["cards"], unsourced_duty()]}).json()
    assert unchecked["issues"] == []
    assert store.lessons["test-management"]["cards"][-1]["id"] == "c2"
    assert store.lessons["test-management"]["summary"] == edited["summary"]
    done = client.post("/api/review/published", json=edited).json()
    assert llm.calls == []
    assert done["status"] == "published" and done["issues"] == []
    # Learners see the new text; the course never left the published state.
    actor("learner")
    assert client.get("/api/lessons/test-management").json()["summary"] == edited["summary"]
    assert store.lessons["test-management"]["author_id"] == AUTHOR
    assert store.tracks == before
    assert "lesson:test-management:c1" in store.doc_sources
    assert [e["kind"] for e in store.events] == ["created", "submit", "approve", "updated", "updated"]


def test_pending_source_allows_manual_submission_publication_and_updates(client, fake_llm, actor):
    store = app.state.services.repository
    store.sources["quran:5:6"]["review_status"] = "pending"
    store.reload_index()
    llm = fake_llm()
    actor()
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    assert client.post("/api/review/test-management/submit").status_code == 200
    actor("admin", OTHER)
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
    edited = {**draft(), "summary": {"en": "Updated with a pending source", "ar": ""}}
    response = client.post("/api/review/published", json=edited)
    assert response.status_code == 200 and response.json()["issues"] == []
    assert store.lessons["test-management"]["status"] == "published"
    assert store.lessons["test-management"]["summary"] == edited["summary"]
    assert store.sources["quran:5:6"]["review_status"] == "pending"
    assert llm.calls == [] and not getattr(llm, "support_calls", [])


def test_manual_publication_skips_rule_checks_but_unknown_sources_still_block(client, fake_llm, actor):
    llm = fake_llm({"issues": [{"severity": "high", "issue": "TEST AI issue"}]})
    store = app.state.services.repository
    actor()
    blocked = {**draft(), "cards": [*draft()["cards"], unsourced_duty()]}
    assert client.post("/api/review/drafts", json=blocked).status_code == 200
    assert [i["card"] for i in client.post("/api/review/check", json=blocked).json()["issues"]] == ["c2"]
    assert client.post("/api/review/test-management/submit").status_code == 200
    actor("admin", OTHER)
    assert store.lessons["test-management"]["status"] == "in_review"
    del store.sources["quran:5:6"]
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 409
    store.sources["quran:5:6"] = {"id": "quran:5:6", "text_en": "Wash your face.", "review_status": "approved"}
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
    assert store.lessons["test-management"]["cards"][-1]["id"] == "c2"
    assert llm.calls == []


@pytest.mark.parametrize("sources", [[], None])
def test_resources_are_optional_for_ordinary_pages(client, fake_llm, actor, sources):
    actor()
    fake_llm()
    store = app.state.services.repository
    lesson = draft()
    if sources is None:
        lesson["cards"][0].pop("sources")
    else:
        lesson["cards"][0]["sources"] = sources
    assert client.post("/api/review/drafts", json=lesson).status_code == 200
    assert client.post("/api/review/test-management/submit").status_code == 200
    actor("admin", OTHER)
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
    assert store.lessons[lesson["id"]]["status"] == "published"
    actor("learner")
    assert client.get("/api/lessons/test-management").status_code == 200
    assert "lesson:test-management:c1" not in store.doc_sources


def test_quote_pages_still_require_a_resource(client, actor):
    actor()
    lesson = draft()
    lesson["cards"] = [{"id": "q1", "kind": "quote", "title": {"en": "Quote"}, "sources": []}]
    assert client.post("/api/review/drafts", json=lesson).status_code == 400


def test_text_references_survive_saving_and_publication_without_becoming_evidence(client, fake_llm, actor):
    actor()
    fake_llm()
    lesson = draft()
    card = lesson["cards"][0]
    card["sources"] = []
    card["references"] = ["  Discover Islam, pp. 10, 28–29  ", "كتاب عن الإسلام، ص. ١٠"]
    references = [reference.strip() for reference in card["references"]]
    assert client.post("/api/review/drafts", json=lesson).status_code == 200
    loaded = client.get("/api/courses/test-management").json()
    assert loaded["cards"][0]["references"] == references and loaded["sources_by_id"] == {}
    assert client.post("/api/review/test-management/submit").status_code == 200
    actor("admin", OTHER)
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
    card["references"] = ["Updated citation"]
    assert client.post("/api/review/published", json=lesson).status_code == 200
    actor("learner")
    assert client.get("/api/courses/test-management").json()["cards"][0]["references"] == ["Updated citation"]
    store = app.state.services.repository
    assert "lesson:test-management:c1" not in store.doc_sources
    assert not set(references) & store.sources.keys()


@pytest.mark.parametrize("references", [[""], ["  "], ["x" * 601], ["x"] * 31, [42]])
def test_invalid_text_references_are_rejected(client, actor, references):
    actor()
    lesson = draft()
    lesson["cards"][0]["references"] = references
    assert client.post("/api/review/drafts", json=lesson).status_code == 400


@pytest.mark.parametrize("status", ["draft", "in_review", "published", "archived"])
@pytest.mark.parametrize("role", ["teacher", "admin", "super_admin"])
def test_delete_course_at_any_status(client, actor, status, role):
    actor()
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    if status != "draft":
        assert client.post("/api/review/test-management/submit").status_code == 200
        actor("admin", OTHER)
        if status == "published":
            assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
        elif status == "archived":
            assert client.post("/api/review/test-management/archive").status_code == 200
    store = app.state.services.repository
    assert store.lessons["test-management"]["status"] == status
    actor(role, AUTHOR if role == "teacher" else OTHER)
    assert client.post("/api/review/test-management/delete").json() == {"lesson_id": "test-management", "deleted": True}
    assert "test-management" not in store.lessons
    assert all("test-management" not in m["lessons"] for t in store.tracks for m in t["modules"])
    assert not any(e["lesson_id"] == "test-management" for e in store.events)
    assert "lesson:test-management:c1" not in store.doc_sources
    assert "quran:5:6" in store.sources
    assert store.admin_events[-1]["kind"] == "lesson_deleted"


@pytest.mark.parametrize("status", ["draft", "in_review", "published", "archived"])
def test_delete_refuses_any_progress_and_foreign_authors(client, actor, status):
    actor()
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    store = app.state.services.repository
    store.lessons["test-management"]["status"] = status
    actor("teacher", OTHER)
    assert client.post("/api/review/test-management/delete").status_code == 403
    actor("admin", OTHER)
    store.progress[(OTHER, "test-management")] = {"card_index": 0}
    before = copy.deepcopy(store.tracks)
    response = client.post("/api/review/test-management/delete")
    assert response.status_code == 409 and response.json()["error"]["code"] == "has_progress"
    assert "Archive" in response.json()["error"]["message"]
    assert "test-management" in store.lessons and store.tracks == before and not store.admin_events
    assert (OTHER, "test-management") in store.progress
    assert client.post("/api/review/missing/delete").status_code == 404
    assert client.post("/api/review/missing/unpublish").status_code == 404


@pytest.mark.parametrize("role", ["teacher", "admin", "super_admin"])
def test_coming_soon_is_an_admin_course_setting_that_locks_the_course_at_any_status(client, fake_llm, actor, role):
    fake_llm()
    actor()
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    store = app.state.services.repository
    kinds = lambda: [e["kind"] for e in store.events if e["kind"].startswith("coming_soon")]  # noqa: E731

    def learner_sees():
        """(locked title shown, course can be opened) as a learner."""
        actor("learner")
        bundle = client.get("/api/content").json()
        listed = [item["id"] for t in client.get("/api/tracks").json() for m in t["modules"] for item in m["lessons"]]
        opened = client.get("/api/courses/test-management").status_code == 200
        assert opened == ("test-management" in bundle["courses"]) == ("test-management" in listed)
        assert opened == ("lesson:test-management:c1" in store.doc_sources)  # Ask only reads open courses
        assert "Wash your face" not in str(bundle["coming_soon"])
        return "test-management" in bundle["coming_soon"], opened

    # Saved with the course, like its other settings. A teacher's value is ignored.
    actor(role, OTHER if role != "teacher" else AUTHOR)
    assert client.post("/api/review/drafts", json={**draft(), "coming_soon": True}).status_code == 200
    if role == "teacher":
        assert "coming_soon" not in store.lessons["test-management"] and kinds() == []
        assert learner_sees() == (False, False)
        return
    assert store.lessons["test-management"]["coming_soon"] is True and kinds() == ["coming_soon"]
    assert store.events[-1]["actor_id"] == OTHER

    # Learners get the title and classification only.
    assert learner_sees() == (True, False)
    teaser = client.get("/api/content").json()["coming_soon"]["test-management"]
    assert set(teaser) == {"id", "title", "subject", "level", "tracks"}
    assert teaser["title"] == draft()["title"] and teaser["tracks"] == ["first-steps"]

    # The author's saves keep the admin's choice, whatever they send; so does a save without the field.
    actor()
    for sent in ({"coming_soon": False}, {}):
        assert client.post("/api/review/drafts", json={**draft(), **sent}).status_code == 200
        assert store.lessons["test-management"]["coming_soon"] is True
    actor(role, OTHER)
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    assert store.lessons["test-management"]["coming_soon"] is True and kinds() == ["coming_soon"]

    # Review and publication do not unlock it: a published course stays locked while the setting is on.
    actor()
    assert client.post("/api/review/test-management/submit").status_code == 200
    assert learner_sees() == (True, False)
    actor(role, OTHER)
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
    assert store.lessons["test-management"]["status"] == "published"
    assert learner_sees() == (True, False)
    actor(role, OTHER)
    assert client.get("/api/courses/test-management").json()["coming_soon"] is True  # staff still open it

    # An admin turns it off the way the editor updates a published course: hide, save, publish again.
    assert client.post("/api/review/test-management/unpublish").status_code == 200
    assert client.post("/api/review/drafts", json={**draft(), "coming_soon": False}).status_code == 200
    assert client.post("/api/review/test-management/submit").status_code == 200
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
    assert "coming_soon" not in store.lessons["test-management"] and kinds() == ["coming_soon", "coming_soon_removed"]
    assert learner_sees() == (False, True)

    # An archived course is hidden completely, with or without the setting.
    actor(role, OTHER)
    assert client.post("/api/review/test-management/unpublish").status_code == 200
    assert client.post("/api/review/drafts", json={**draft(), "coming_soon": True}).status_code == 200
    assert client.post("/api/review/test-management/archive").status_code == 200
    assert learner_sees() == (False, False)


def test_fields_written_by_other_tools_are_not_handed_out_so_the_editor_can_save(client, actor):
    actor("admin")
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    store = app.state.services.repository
    # A generator wrote straight to the database: fields the draft contract refuses.
    stored = store.lessons["test-management"]
    stored.update(warnings=["x"], needs_review=True)
    stored["cards"][0].update(tags=[], intro={"en": "x"}, needs_review=True)
    loaded = client.get("/api/courses/test-management").json()
    assert not {"warnings", "needs_review"} & set(loaded) and set(loaded["cards"][0]) <= {"id", "kind", "title", "body", "sources"}
    assert loaded["author_id"] == AUTHOR and loaded["status"] == "draft"
    # What the editor loaded saves again, and the stored course is clean afterwards.
    sent = {k: v for k, v in loaded.items() if k not in ("author_id", "sources_by_id")}
    assert client.post("/api/review/drafts", json=sent).status_code == 200
    assert "warnings" not in store.lessons["test-management"] and "tags" not in store.lessons["test-management"]["cards"][0]
    # Still refused when a client sends them: the contract did not get looser.
    sent["cards"][0]["tags"] = []
    assert client.post("/api/review/drafts", json=sent).status_code == 400


@pytest.mark.parametrize("role,code", [("anonymous", 401), ("learner", 403)])
def test_learners_and_guests_cannot_manage_lessons(client, actor, role, code):
    actor(role, None if role == "anonymous" else OTHER)
    for suffix in ["unpublish", "delete"]:
        assert client.post(f"/api/review/wudu-order/{suffix}").status_code == code
    for gone in ("planned", "wudu-order/coming-soon"):  # static titles and their endpoints are gone
        assert client.post(f"/api/review/{gone}", json={}).status_code in (404, 405)


def test_editor_text_is_cleaned_and_plain_body_comes_from_it(client, actor):
    actor()
    lesson = draft()
    card = lesson["cards"][0]
    del card["body"]
    card["html"] = {
        "en": '<p onclick="x()">Wash <font color="#b94a2d" face="serif" size="5" style="color:red">your</font> face</p>'
        '<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:x">now</a><b>!'
    }
    assert client.post("/api/review/drafts", json=lesson).status_code == 200
    saved = app.state.services.repository.lessons[lesson["id"]]["cards"][0]
    assert saved["html"] == {
        "en": '<p>Wash <font color="#b94a2d" face="serif" size="5">your</font> face</p>now<b>!</b>',
        "ar": "",
    }
    assert saved["body"] == {"en": "Wash your face\nnow!", "ar": ""}
    card["html"] = {
        "en": '<blockquote data-tone="green" class="x">Note</blockquote><blockquote data-tone="url(x)">Other</blockquote><p data-tone="red">End</p>'
    }
    assert client.post("/api/review/drafts", json=lesson).status_code == 200
    assert (
        app.state.services.repository.lessons[lesson["id"]]["cards"][0]["html"]["en"]
        == '<blockquote data-tone="green">Note</blockquote><blockquote>Other</blockquote><p>End</p>'
    )
    card["html"] = {"en": "<p><br></p>", "ar": "&nbsp;"}  # formatting with no text is not a body
    assert client.post("/api/review/drafts", json=lesson).status_code == 400


def test_lesson_in_one_language_cover_and_contributors(client, actor):
    actor()
    # Credits are the emails of the accounts that save the lesson: a list sent by the editor can neither add nor remove one.
    app.state.services.repository.users = {
        AUTHOR: {"id": AUTHOR, "email": "amina@example.test", "display_name": "Amina"},
        OTHER: {"id": OTHER, "email": "yusuf@example.test", "display_name": None},
    }
    lesson = {
        **draft(),
        "title": {"ar": "درس بالعربية"},
        "contributors": ["Someone Else"],
        "cover": "data:image/webp;base64,UklGRg==",
    }
    assert client.post("/api/review/drafts", json=lesson).json()["contributors"] == ["amina@example.test"]
    actor("admin", OTHER)
    assert client.post("/api/review/drafts", json={**lesson, "contributors": []}).json()["contributors"] == [
        "amina@example.test",
        "yusuf@example.test",
    ]
    actor()
    # An older entry made of the saver's profile name gives way to the email; other typed names stay.
    app.state.services.repository.lessons[lesson["id"]]["contributors"] = ["Amina", "Faith Minds"]
    assert client.post("/api/review/drafts", json=lesson).json()["contributors"] == [
        "Faith Minds",
        "amina@example.test",
    ]
    saved = app.state.services.repository.lessons[lesson["id"]]
    assert saved["title"] == {"en": "", "ar": "درس بالعربية"} and saved["contributors"] == [
        "Faith Minds",
        "amina@example.test",
    ]
    # Staff emails stay in Studio: learner responses carry no contributors.
    assert client.get(f"/api/lessons/{lesson['id']}").json()["contributors"] == ["Faith Minds", "amina@example.test"]
    live = next(lesson for lesson in app.state.services.repository.lessons.values() if lesson["status"] == "published")
    live["contributors"] = ["amina@example.test"]
    actor("learner")
    assert "contributors" not in client.get(f"/api/lessons/{live['id']}").json()
    assert "contributors" not in client.get("/api/content").json()["lessons"][live["id"]]
    assert app.state.services.repository.lessons[live["id"]]["contributors"] == ["amina@example.test"]
    actor()
    for bad in [
        {"title": {"en": " ", "ar": ""}},
        {"cover": "javascript:alert(1)"},
        {"cover": "data:image/svg+xml;base64,AAAA"},
        {"contributors": [""]},
        {"contributors": ["x"] * 21},
    ]:
        assert client.post("/api/review/drafts", json={**lesson, **bad}).status_code == 400


def test_legacy_tags_are_removed_and_new_course_tags_rejected(client, actor):
    actor()
    lesson = {**draft(), "tags": ["wudu", "طهارة"]}
    assert client.post("/api/review/drafts", json=lesson).status_code == 200
    assert "tags" not in app.state.services.repository.lessons[lesson["id"]]
    canonical = {k: v for k, v in lesson.items() if k not in ("track", "module")}
    canonical.update(subject="fiqh", tracks=["first-steps"])
    assert client.post("/api/review/drafts", json=canonical).status_code == 400


def test_any_verse_can_be_quoted(client, actor):
    actor()
    verse = client.post("/api/review/sources/quran", json={"surah": 1, "ayah": 2}).json()
    assert (
        verse["id"] == "quran:1:2"
        and verse["review_status"] == "pending"
        and verse["text_en"].startswith("[All] praise")
    )
    assert "\u06dd" not in verse["text_ar"] and verse["ref_ar"].endswith("٢")
    app.state.services.repository.sources["quran:1:2"]["review_status"] = (
        "approved"  # a second pick keeps the library entry
    )
    assert client.post("/api/review/sources/quran", json={"surah": 1, "ayah": 2}).json()["review_status"] == "approved"
    assert client.post("/api/review/sources/quran", json={"surah": 1, "ayah": 8}).status_code == 404
    quote = {"id": "q1", "kind": "quote", "title": {"en": "Al-Fatihah 1:2"}, "sources": ["quran:1:2"]}
    assert client.post("/api/review/drafts", json={**draft(), "cards": [*draft()["cards"], quote]}).status_code == 200
    actor("learner")
    assert client.post("/api/review/sources/quran", json={"surah": 1, "ayah": 1}).status_code == 403


def test_admin_can_submit_a_draft_they_did_not_write(client, fake_llm, actor):
    fake_llm()
    actor()
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    actor("teacher", OTHER)
    assert client.post("/api/review/test-management/submit").status_code == 403
    actor("admin", OTHER)
    assert client.post("/api/review/test-management/submit").status_code == 200
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
    assert app.state.services.repository.lessons["test-management"]["author_id"] == AUTHOR
