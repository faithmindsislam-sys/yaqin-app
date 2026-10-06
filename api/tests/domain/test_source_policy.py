"""Translation identity and original-text boundaries, with no model calls."""
import copy
import json

import pytest

from app.agents.course import prompts as course
from app.agents.policy import source_data
from app.agents.review import prompts as review
from app.agents.review.agent import ReviewAgent
from app.agents.tutor import prompts as tutor
from app.domain.source_policy import TERMINOLOGY_RULES, TRANSLATION_RULES, source_view
from app.domain.support import SupportFailure, review_payload, validate_support

HENC = {"id": "hadith:henc:3313", "kind": "hadith", "provider": "hadeethenc",
        "text_ar": "نص أصلي مع شروطه", "text_en": "Exact published wording, with its condition.",
        "url": "https://hadeethenc.com/en/browse/hadith/3313",
        "translation": "HadeethEnc published English translation", "grading": "Authentic · صحيح",
        "review_status": "pending"}


@pytest.mark.parametrize("change", [{}, {"kind": "quran", "id": "quran:106:3", "provider": "quranenc",
    "url": "https://quranenc.com/en/browse/english_saheeh/106#3",
    "translation": "English Translation - Noor International Center (QuranEnc english_saheeh v1.1.2)"},
    {"kind": "quran", "id": "quran:106:3", "url": "https://quran.com/106/3", "translation": "Saheeh International"},
    {"kind": "quran", "id": "quran:106:3", "url": "https://quranpedia.net/surah/1/106/book/13638",
     "origin": "Quranpedia.net", "translation": "Sahih International - English translation (Quranpedia.net)"},
    {"kind": "quran", "id": "quran:52:35", "url": "https://quranpedia.net/surah/1/52/book/13638",
     "origin": "Quranpedia.net / King Fahd Glorious Quran Printing Complex", "translation": "Sahih International (Quranpedia.net)"}])
def test_published_wording_and_exact_edition_survive_without_granting_approval(change):
    source = {**HENC, **change}
    before = copy.deepcopy(source)
    view = source_view(source)
    assert view["translation_status_en"] == "published"
    assert all(view[k] == source[k] for k in ("id", "text_en", "text_ar", "translation", "grading", "review_status"))
    assert source == before and source["review_status"] == "pending"


@pytest.mark.parametrize("change", [
    {"id": "hadith:muslim:223", "url": "https://sunnah.com/muslim:223", "translation": "fawazahmed0/hadith-api eng-muslim",
     "see_also": ["hadith:henc:65004", "hadith:henc:66526"]},
    {"url": "https://hadeethenc.com.evil.example/en/browse/hadith/3313"},
    {"url": "https://evil.example@hadeethenc.com/en/browse/hadith/3313"},
    {"url": "https://hadeethenc.com/en/browse/hadith/999"},
    {"url": "http://hadeethenc.com/en/browse/hadith/3313"},
    {"url": "\nhttps://hadeethenc.com/en/browse/hadith/3313"},
    {"provider": "unverified"}, {"translation": "Our AI translation"},
    {"url": "https://hadeethenc.com:bad/en/browse/hadith/3313"},
    {"kind": "quran", "id": "quran:106:3", "url": "https://quranenc.com/en/browse/english_saheeh/106#4",
     "translation": "Noor International Center (QuranEnc v1.1.2)"},
    {"kind": "quran", "id": "quran:106:3", "url": "https://quranpedia.net/surah/1/107/book/13638",
     "origin": "Quranpedia.net", "translation": "Sahih International - English translation (Quranpedia.net)"},
])
def test_secondary_unknown_or_mismatched_english_cannot_become_scripture(change):
    source = {**HENC, **change, "review_status": "approved"}
    before = copy.deepcopy(source)
    view = source_view(source)
    assert view["translation_status_en"] == "unsupported_provider" and view["text_en"] == ""
    assert view["id"] == source["id"] and view["text_ar"] == source["text_ar"]
    assert source == before
    payload = json.loads(review_payload({}, {"claim": "Supported meaning"}, {source["id"]: source}))
    assert payload["sources"][source["id"]]["text_en"] == ""
    result = {"personal_ruling": False, "units": [{"id": "claim", "verdict": "supported",
              "evidence": [{"source": source["id"], "excerpt": source["text_en"]}]}]}
    with pytest.raises(SupportFailure):
        validate_support(result, {"claim": "Supported meaning"}, {source["id"]: source})
    result["units"][0]["evidence"][0]["excerpt"] = source["text_ar"]
    validate_support(result, {"claim": "Supported meaning"}, {source["id"]: source})


def test_missing_translation_is_explicit_and_library_originals_are_untouched():
    source = {**HENC, "text_en": ""}
    assert source_view(source)["translation_status_en"] == "unavailable"
    library = {"id": "library:1", "kind": "library", "text_en": "Original book evidence.",
               "original_text": "Original book evidence.", "review_status": "unreviewed"}
    assert source_view(library) == library


def test_unknown_language_original_text_cannot_restore_a_withheld_translation():
    source = {**HENC, "url": "https://sunnah.com/muslim:223", "original_text": "Unverified English fallback."}
    units = {"claim": "Supported meaning"}
    payload = json.loads(review_payload({}, units, {source["id"]: source}))
    assert "original_text" not in payload["sources"][source["id"]]
    result = {"personal_ruling": False, "units": [{"id": "claim", "verdict": "supported",
              "evidence": [{"source": source["id"], "excerpt": source["original_text"]}]}]}
    with pytest.raises(SupportFailure):
        validate_support(result, units, {source["id"]: source})
    assert source["original_text"] == "Unverified English fallback."


def test_metadata_and_shared_teaching_terms_reach_writers_and_reviewers():
    glossary = {"id": "ref:terminologyenc:10482", "kind": "dictionary", "slug": "tawhid",
                "term_en": "Monotheism", "term_ar": "التوحيد", "text_ar": "تعريف أصلي",
                "review_status": "pending", "translation": "TerminologyEnc approved English translation"}
    sources = {s["id"]: s for s in (HENC, glossary)}
    payload = json.loads(source_data(sources))
    assert payload[HENC["id"]]["translation"] == HENC["translation"]
    assert payload[HENC["id"]]["provider"] == "hadeethenc"
    assert payload[glossary["id"]]["term_en"] == "Monotheism"
    assert payload[glossary["id"]]["review_status"] == "pending"
    for system in (course.DRAFT, tutor.ANSWER, tutor.EXPLAIN_BACK, review.REVIEW):
        assert TERMINOLOGY_RULES in system and TRANSLATION_RULES in system
    tutor.ANSWER.format(tier="A", language="English")
    tutor.EXPLAIN_BACK.format(language="Modern Standard Arabic")


async def test_quote_review_blocks_legacy_english_and_preserves_canonical_record():
    from tests.agents.test_course_agent import FakeLLM, FakeRepo
    canonical = {**HENC, "review_status": "approved"}
    legacy = {**canonical, "id": "hadith:muslim:223", "url": "https://sunnah.com/muslim:223",
              "translation": "fawazahmed0/hadith-api eng-muslim", "see_also": [canonical["id"]]}
    for source, passing in [(legacy, False), (canonical, True)]:
        before = copy.deepcopy(source)
        draft = {"title": {"en": "Evidence", "ar": "الدليل"}, "summary": {"en": "Read the evidence.", "ar": "اقرأ الدليل."},
                 "cards": [{"id": "quote", "kind": "quote", "title": {"en": "Reference", "ar": "المصدر"}, "sources": [source["id"]]}]}
        result = await ReviewAgent(FakeRepo({source["id"]: source}), FakeLLM()).check(draft, ai=False)
        assert result["ready_for_reviewer"] is passing
        if not passing:
            assert any(i["severity"] == "high" and "allowed publisher" in i["issue"] for i in result["issues"])
        assert source == before


def test_api_content_projection_does_not_modify_stored_source(learner):
    from app.main import app
    stored = app.state.services.repository.sources["hadith:bukhari:1"]
    before = copy.deepcopy(stored)
    response = learner.get("/api/sources/hadith:bukhari:1")
    assert response.status_code == 200
    view = response.json()
    assert view["text_en"] == "" and view["translation_status_en"] == "unsupported_provider"
    assert view["id"] == before["id"] and view["text_ar"] == before["text_ar"]
    assert stored == before
