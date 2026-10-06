"""Original excerpt and verdict contracts, independent of model semantics."""

from copy import deepcopy

import pytest

from app.domain.support import SupportFailure, review_payload, validate_support

SOURCE = {"id": "quran:1:1", "text_ar": "التوحيد هو إفراد الله بالعبادة", "text_en": "God is one."}
UNITS = {"answer": "God alone is worshipped. [[quran:1:1]]"}


def verdict(excerpt=None):
    return {
        "personal_ruling": False,
        "units": [
            {
                "id": "answer",
                "verdict": "supported",
                "evidence": [{"source": SOURCE["id"], "excerpt": excerpt or SOURCE["text_ar"]}],
            }
        ],
    }


@pytest.mark.parametrize("evidence_lang,claim", [("ar", "God alone is worshipped."), ("en", "الله واحد")])
def test_original_cross_language_evidence_is_valid(evidence_lang, claim):
    units = {"answer": claim + " [[quran:1:1]]"}
    result = verdict(SOURCE["text_" + evidence_lang])
    validate_support(result, units, {SOURCE["id"]: SOURCE}, [SOURCE["id"]])


@pytest.mark.parametrize(
    "failure",
    [
        "unknown",
        "mismatch",
        "unsupported",
        "missing",
        "duplicate",
        "personal",
        "non_claim_evidence",
        "non_claim_citation",
        "unknown_id",
        "boolean",
        "malformed",
    ],
)
def test_invalid_judge_outputs_fail_closed(failure):
    result = deepcopy(verdict())
    row = result["units"][0]
    if failure == "unknown":
        row["evidence"][0]["source"] = "quran:unknown"
    if failure == "mismatch":
        row["evidence"][0]["excerpt"] = "a translated or invented excerpt"
    if failure == "unsupported":
        row["verdict"] = "unsupported"
    if failure == "missing":
        result["units"] = []
    if failure == "duplicate":
        result["units"] *= 2
    if failure == "personal":
        result["personal_ruling"] = True
    if failure == "non_claim_evidence":
        row["verdict"] = "non_claim"
    if failure == "non_claim_citation":
        row.update(verdict="non_claim", evidence=[])
    if failure == "unknown_id":
        row["id"] = "not-a-unit"
    if failure == "boolean":
        result = {"approved": True}
    if failure == "malformed":
        result = None
    with pytest.raises(SupportFailure):
        validate_support(result, UNITS, {SOURCE["id"]: SOURCE}, [SOURCE["id"]])


def test_non_claim_cannot_satisfy_required_source_without_citation_marker():
    units = {"answer": "Next question?"}
    result = {
        "personal_ruling": False,
        "units": [{"id": "answer", "verdict": "non_claim", "evidence": []}],
    }
    with pytest.raises(SupportFailure):
        validate_support(result, units, {SOURCE["id"]: SOURCE}, [SOURCE["id"]])


def test_review_budget_never_truncates_evidence_or_units():
    with pytest.raises(SupportFailure):
        review_payload({}, {"answer": "x" * 100001}, {SOURCE["id"]: SOURCE})
