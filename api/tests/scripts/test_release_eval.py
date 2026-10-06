"""Offline evaluator/parser tests. Synthetic responses cannot claim live validation."""

import json
from unittest.mock import MagicMock, patch

import httpx
import pytest

from scripts import eval_safety
from scripts import guardrail_preflight as gp
from scripts import release_eval as ev
from scripts.release_dataset import PATHS, TRACKS, calibration_dataset, dataset


def policy():
    return {"version": "1", "status": "READY", "contentPolicy": {"tier": {"tierName": "STANDARD"}, "filters": [
        {"type": kind, "inputEnabled": True, "inputAction": "BLOCK", "inputStrength": "HIGH",
         "outputEnabled": True, "outputAction": "BLOCK", "outputStrength": "HIGH"} for kind in gp.REQUIRED]},
        "wordPolicy": {"managedWordLists": [{"type": "PROFANITY", "outputEnabled": True, "outputAction": "BLOCK", "inputEnabled": False}]}}


def config():
    return {"snapshots": {p: {**{f: "a" * 64 for f in ev.SNAPSHOT_FIELDS}, "model": "writer",
                             "judge_model": "judge", "deployment_version": "version", "verified_by": "operator",
                             "verified_at": "controlled-test", "guardrail_id": "abc", "guardrail_version": "1"} for p in PATHS},
            "fixtures": {path: {key: {"controlled_fixture": True, "reviewed_by": "fixture-reviewer", "expected_outcomes": ["Concrete source-supported outcome"],
                               "original_sources": [{"id": "fixture:one", "original_text": "Controlled original passage", "language": "en"}],
                               "expected_evidence": [{"source_id": "fixture:one", "excerpt": "Controlled original passage", "claim": "Concrete expected teaching outcome"}],
                               "source_ids": ["fixture:one"], "resource_ids": ["a" * 32], "lesson_id": "fixture-course",
                               "transcripts": {"en": "Controlled explanation", "ar": "شرح مضبوط"}}
                         for key in {c["fixture"] for c in dataset()["cases"] if c["path"] == path}} for path in PATHS},
            "endpoints": {"yaqin": "https://staging.invalid", "agents": "https://agents.invalid"}}


def tutor_output():
    return {"tier": "B", "ai_generated": True, "safety_outcome": "allowed", "answer": [{"type": "text", "text": "Useful prose"},
            {"type": "source", "id": "fixture:one"}], "sources": {"fixture:one": {"original_text": "Controlled original passage"}}, "follow_ups": []}


def raw_verdict(label, candidate, source=None):
    source = source or {"id": "fixture:one", "original_text": "Controlled original passage"}
    evidence = [{"source": source["id"], "excerpt": source["original_text"]}] if label == "supported" else []
    return {"personal_ruling": False, "units": [{"id": "candidate.answer", "claim": candidate, "verdict": label, "evidence": evidence}]}


def test_dataset_has_required_positive_matrix_and_bilingual_probes():
    data = dataset()
    ev.check_dataset(data)
    assert len(data["cases"]) == 208
    assert len({c["id"] for c in data["cases"]}) == 208
    for p in PATHS:
        for t in TRACKS:
            assert {c["lang"] for c in data["cases"] if c["path"] == p and c["track"] == t and c["outcome"] == "useful"} == {"en", "ar"}
        for probe in {c["probe"] for c in data["cases"] if c["probe"]}:
            assert {c["lang"] for c in data["cases"] if c["path"] == p and c["probe"] == probe} == {"en", "ar"}


@pytest.mark.parametrize("change", ["empty", "duplicate", "unknown", "partial"])
def test_invalid_dataset_never_passes(change):
    data = dataset()
    if change == "empty":
        data["cases"] = []
    elif change == "duplicate":
        data["cases"].append(data["cases"][0])
    elif change == "unknown":
        data["cases"][0]["path"] = "legacy-generator"
    else:
        data["cases"].pop()
    with pytest.raises(ValueError):
        ev.check_dataset(data)


@pytest.mark.parametrize("only", [[], ["unknown"], ["tutor/positive/explore/en"] * 2])
def test_empty_unknown_duplicate_filters_rejected(only):
    with pytest.raises(ValueError):
        ev.run(dataset(), {}, only=only)


def test_offline_report_has_null_accounting_and_no_network(monkeypatch, tmp_path):
    client = MagicMock()
    report = ev.run(dataset(), {}, http=client)
    assert len(report["rows"]) == 208
    assert all(r["status"] == "NOT_VALIDATED" and r["input_tokens"] is None and r["http_calls"] is None for r in report["rows"])
    client.stream.assert_not_called()
    assert ev.gate(report, dataset(), {})["release_status"] == "NOT_VALIDATED"
    path = tmp_path / "report.json"
    assert ev.main(["--report", str(path), "--review-template", str(tmp_path / "review.json")]) == 2
    assert ev.load(path)["mode"] == "offline"


@pytest.mark.parametrize("url", ["http://remote.example", "https://u:p@example.org", "https://example.org?token=secret",
                              "https://example.org#secret", "https://example.org/path", "https://example.org\\@other.org", "https://example.org:"])
def test_endpoint_restrictions(url):
    with pytest.raises(ValueError):
        ev.safe_base(url)


@pytest.mark.parametrize("url", ["https://example.org/", "http://127.0.0.1:8000", "http://[::1]:8000", "http://localhost"])
def test_https_and_loopback_allowed(url):
    assert ev.safe_base(url)


@pytest.mark.parametrize("path", PATHS)
def test_payload_uses_actual_route_contract(path):
    c = next(c for c in dataset()["cases"] if c["path"] == path)
    fixture = ev.fixture_for(config(), c)
    body = ev.payload(c, fixture)
    assert body["track"] == "explore"
    if path == "standalone-lesson":
        assert body["language"] == "en" and "resourceIds" in body and "topic" in body and "lang" not in body
    elif path == "course":
        assert set(body) == {"prompt", "lang", "track"}
    elif path == "explain":
        assert set(body) == {"transcript", "lang", "track", "lesson_id"}
    elif path == "standalone-ask":
        assert body["sources"] == [{"id": "fixture:one"}] and body["tier"] == "B"
    else:
        assert set(body) == {"question", "lang", "track", "history"}


def test_live_missing_prerequisites_and_probe_drivers_do_not_make_calls(monkeypatch):
    client = MagicMock()
    report = ev.run(dataset(), config(), mode="live", http=client)
    assert all(r["status"] == "NOT_VALIDATED" for r in report["rows"])
    assert "controlled_staging_probe_required" in {r["error"] for r in report["rows"]}
    client.stream.assert_not_called()


def test_filtered_live_plumbing_success_is_not_release(monkeypatch):
    monkeypatch.setenv("YAQIN_EVAL_ACCESS_TOKEN", "controlled-private-token")
    c = dataset()["cases"][0]
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=tutor_output()))
    with httpx.Client(transport=transport) as client:
        report = ev.run(dataset(), config(), mode="live", only=[c["id"]], http=client)
    assert report["rows"][0]["status"] == "PLUMBING_PASS"
    assert report["rows"][0]["model_calls"] is None
    assert ev.gate(report, dataset(), config())["release_status"] == "NOT_VALIDATED"
    assert "controlled-private-token" not in json.dumps(report)


@pytest.mark.parametrize("response", [httpx.Response(302, headers={"Location": "https://other.invalid"}),
                                     httpx.Response(500, text="JWT provider-secret"), httpx.Response(200, text="invalid-json"),
                                     httpx.Response(200, content=b"a" * (ev.MAX_BYTES + 1))])
def test_http_error_bodies_redirects_and_oversized_payloads_not_logged(monkeypatch, response):
    monkeypatch.setenv("YAQIN_EVAL_ACCESS_TOKEN", "private-token")
    with httpx.Client(transport=httpx.MockTransport(lambda request: response)) as client:
        report = ev.run(dataset(), config(), mode="live", only=[dataset()["cases"][0]["id"]], http=client)
    assert report["rows"][0]["error"] == "request_unavailable_or_invalid"
    assert "provider-secret" not in json.dumps(report)


@pytest.mark.parametrize("path,key", [("course", "job_id"), ("standalone-lesson", "jobId")])
def test_async_routes_poll_correct_contract_bounded(path, key, monkeypatch):
    c = next(c for c in dataset()["cases"] if c["path"] == path)
    seen = []
    def handler(request):
        seen.append(request)
        if request.method == "POST":
            return httpx.Response(202, json={key: "a" * 32, "status": "running"})
        return httpx.Response(200, json={"status": "done", "lesson": {"cards": [{"body": "controlled"}]}})
    monkeypatch.setattr(ev.time, "sleep", lambda seconds: None)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        status, output, count = ev.execute(client, "https://staging.invalid", c, {}, "private")
    assert status == 200 and count == 2 and output["status"] == "done"
    assert seen[1].url.path == ev.ROUTES[path][1] + "/" + "a" * 32
    assert ("Idempotency-Key" in seen[0].headers) == (path == "standalone-lesson")


def test_polling_limit_and_job_url_injection_rejected(monkeypatch):
    c = next(c for c in dataset()["cases"] if c["path"] == "course")
    monkeypatch.setattr(ev.time, "sleep", lambda seconds: None)
    for job in ("../../evil", "a" * 32):
        with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(202 if request.method == "POST" else 200,
                         json={"job_id": job, "status": "running"}))) as client:
            with pytest.raises(ValueError):
                ev.execute(client, "https://staging.invalid", c, {}, "private")


def test_job_completing_after_twenty_polls_and_whole_run_deadline(monkeypatch):
    c = next(c for c in dataset()["cases"] if c["path"] == "standalone-lesson")
    now = [100.0]
    polls = [0]
    monkeypatch.setattr(ev.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(ev.time, "sleep", lambda seconds: now.__setitem__(0, now[0] + seconds))
    def handler(request):
        if request.method == "POST":
            return httpx.Response(202, json={"jobId": "a" * 32})
        polls[0] += 1
        return httpx.Response(200, json={"status": "done" if polls[0] == 25 else "running"})
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        status, output, calls = ev.execute(client, "https://staging.invalid", c, {}, "private", run_deadline=500)
        assert status == 200 and output["status"] == "done" and calls == 26 and now[0] == 175
        with pytest.raises(ValueError, match="poll_deadline"):
            ev.execute(client, "https://staging.invalid", c, {}, "private", run_deadline=176)


@pytest.mark.parametrize("budget", [0, -1, 21601, True])
def test_unbounded_or_invalid_run_budget_rejected(budget):
    with pytest.raises(ValueError):
        ev.run(dataset(), {}, run_seconds=budget)


def test_all_abstaining_fails_mandatory_positive():
    for c in dataset()["cases"]:
        if c["outcome"] == "useful":
            result = ev.outcome_checks(c, 200, {"tier": "NONE", "lesson": None, "ai_generated": False, "safety_outcome": "allowed"})
            assert not result["contract"] and not result["positive_usefulness"]


@pytest.mark.parametrize("mutation", ["report", "row", "missing", "duplicate", "unknown", "synthetic", "labels", "dataset", "config"])
def test_gate_fails_evidence_and_completeness_changes(mutation):
    data, cfg = dataset(), config()
    report = ev.run(data, cfg)
    review = ev.review_template(report, data)
    if mutation == "report":
        report["mode"] = "live"
    elif mutation == "row":
        report["rows"][0]["output"] = {"answer": "changed"}
    elif mutation == "missing":
        report["rows"].pop()
    elif mutation == "duplicate":
        report["rows"].append(report["rows"][0])
    elif mutation == "unknown":
        report["rows"][0]["id"] = "unknown"
    elif mutation == "synthetic":
        report["rows"][0]["provenance"] = "synthetic"
    elif mutation == "labels":
        review["cases"] = []
    elif mutation == "dataset":
        data["version"] = "changed"
    else:
        cfg["snapshots"]["tutor"]["model"] = "changed-model"
    result = ev.gate(report, data, cfg, review)
    assert result["release_status"] == "NOT_VALIDATED"


def test_duplicate_json_keys_are_rejected(tmp_path):
    path = tmp_path / "bad.json"
    path.write_text('{"label":"pass","label":"fail"}')
    with pytest.raises(ValueError):
        ev.load(path)


def test_complete_schema_requires_every_live_and_review_artifact_then_detects_tampering():
    # These are simulated operator records for gate logic, NOT real human/live evidence.
    data, cfg = dataset(), config()
    for p in PATHS:
        cfg["fixtures"][p]["qibla"]["original_sources"][0]["language"] = "ar"
    report = ev.run(data, cfg)
    report["mode"] = "live"
    for c, r in zip(data["cases"], report["rows"], strict=True):
        output, status = {}, 200
        if c["outcome"] in {"useful", "safe-history"}:
            if c["path"] == "tutor":
                output = tutor_output()
            elif c["path"] == "standalone-ask":
                output = {"answer": "Useful [[fixture:one]]", "safetyOutcome": "allowed"}
            elif c["path"] == "explain":
                output = {"feedback": "Useful feedback", "ai_generated": True, "safety_outcome": "allowed"}
            else:
                output = {"status": "done", "lesson": {"cards": [{}], "quiz": [{}], "quick_check": [{}], "language": c["lang"],
                          "audience_track": c["track"], "title": {"en": "Title", "ar": "عنوان"}, "summary": {"en": "Summary", "ar": "ملخص"}}}
        elif c["outcome"] == "blocked":
            if c["path"] == "standalone-ask":
                status, output = 422, {"errorCode": "safety_blocked"}
            elif c["path"] == "standalone-lesson":
                output = {"status": "NEEDS_REVIEW", "guardrailReport": {"reason": "safety_blocked"}}
            elif c["path"] == "course":
                output = {"status": "no_sources", "reason": "safety_blocked"}
            else:
                output = {"safety_outcome": "safety_blocked", "ai_generated": False}
        r.update(output=output, http_status=status, checks=ev.outcome_checks(c, status, output), status="PLUMBING_PASS",
                 provenance="controlled_staging" if c["probe"] else "staging_http",
                 evidence={"observed": ev.fixture_for(cfg, c)["original_sources"]})
    ev.seal(report)
    review = ev.review_template(report, data)
    preflight = {group: {"status": "CONFIGURATION_VALIDATED", "policy_sha256": "a" * 64, "identity_sha256": "b" * 64,
                        "guardrail_id": "abc", "version": "1"} for group in ("yaqin", "agents")}
    review.update(decision="approve", reviewer="simulated-human", reviewed_at="test-time", preflight_sha256=ev.digest(preflight),
                  live_runtime_iam_and_benign_probes=True)
    for label in review["cases"]:
        label.update(human_label="pass", human_reviewer="human", editor="editor", qualified_religious_reviewer="qualified")
        label["dimensions"] = {d: {"label": "pass", "notes": "Simulated concrete review for gate unit test"} for d in ev.DIMENSIONS}
    for p in PATHS:
        review["runtime_checks"][p].update(snapshot_sha256=ev.digest(cfg["snapshots"][p]), operator="operator", procedure="test-only",
                                          invocation_identity_sha256="a" * 64, model_invocation=True,
                                          apply_guardrail_intervention=True, benign_acceptance=True)
        cal = review["judge_calibration"][p]
        cal.update(model="judge", prompt_sha256="a" * 64, thresholds_approved_by="human", judge_procedure="test-only",
                   min_supported_recall=1, max_false_accept_rate=0)
        for label in ("supported", "unsupported"):
            cal["rows"].append({"id": "human-" + label, "input": {"candidate": "human example", "sources": [{"id": "fixture:one", "original_text": "Controlled original passage"}]}, "origin": "human_authored", "split": "heldout"})
        for i, row in enumerate(cal["rows"]):
            label = "supported" if i < 3 or row["id"] == "human-supported" else "unsupported"
            raw = raw_verdict(label, row["input"]["candidate"], row["input"]["sources"][0])
            row.update(human_label=label, judge_label=label, human_reviewer="human", input_sha256=ev.digest(row["input"]),
                       judge_output=raw, judge_output_sha256=ev.digest(raw), judge_completed=True, judge_model="judge",
                       judge_prompt_sha256="a" * 64, provenance="live_independent_judge", label_hidden_from_judge=True)
    assert ev.gate(report, data, cfg, review, preflight)["errors"] == []
    assert ev.gate(report, data, cfg, review, preflight)["release_status"] == "PASS"
    report["rows"][0]["output"]["model"] = "changed-runtime-model"
    assert ev.gate(report, data, cfg, review, preflight)["release_status"] == "FAIL"
    del report["rows"][0]["output"]["model"]
    report["rows"][0]["evidence"]["observed"][0]["original_text"] = "Changed after review"
    assert ev.gate(report, data, cfg, review, preflight)["release_status"] == "NOT_VALIDATED"


def test_judge_label_is_derived_and_false_non_claim_counts_as_acceptance():
    assert ev.judge_label(raw_verdict("non_claim", "candidate")) == "supported"
    assert ev.judge_label({"grounded": True, "on_topic": True, "concise": True, "unsupported_claims": [], "notes": "", "editorial_issues": []}) == "supported"
    assert ev.judge_label({"_fail": True, "grounded": False, "unsupported_claims": []}) is None
    assert ev.judge_label({**raw_verdict("supported", "candidate"), "personal_ruling": True}) == "unsupported"


def test_calibration_requires_human_labels_independent_live_judge_and_both_classes():
    draft = {"rows": calibration_dataset()}
    result = ev.calibration(draft, {})
    assert result["errors"] and result["supported_recall"] is None and result["false_accept_rate"] is None
    rows = []
    for i, row in enumerate(calibration_dataset()):
        label = "supported" if i < 3 else "unsupported"
        rows.append({**row, "human_label": label, "judge_label": "supported", "human_reviewer": "human",
                     "judge_completed": True, "judge_output": raw_verdict("supported", row["input"]["candidate"], row["input"]["sources"][0]),
                     "judge_output_sha256": ev.digest(raw_verdict("supported", row["input"]["candidate"], row["input"]["sources"][0])),
                     "input_sha256": ev.digest(row["input"]), "judge_prompt_sha256": "a" * 64,
                     "judge_model": "judge", "provenance": "live_independent_judge", "label_hidden_from_judge": True})
    cal = {"rows": rows, "model": "judge", "prompt_sha256": "a" * 64, "thresholds_approved_by": "human",
           "judge_procedure": "Controlled heldout runtime support calls", "min_supported_recall": 1, "max_false_accept_rate": 0}
    result = ev.calibration(cal, {"tutor": config()["snapshots"]["tutor"]})
    assert result["fp"] == 5 and result["tp"] == 3 and "judge_calibration_failed" in result["errors"]
    assert "non_synthetic_human_authored_calibration_examples_missing" in result["errors"]


def test_guardrail_standard_schema_and_output_only_profanity():
    assert gp.validate_policy(policy(), "1") == []
    value = policy()
    value["contentPolicy"]["tier"] = {"type": "STANDARD"}
    assert "standard_content_tier_required" in gp.validate_policy(value, "1")


@pytest.mark.parametrize("kind", sorted(gp.REQUIRED))
@pytest.mark.parametrize("side", ["input", "output"])
@pytest.mark.parametrize("field,value", [("Enabled", False), ("Action", "NONE"), ("Strength", "NONE")])
def test_policy_disabled_detect_only_or_no_strength_fails(kind, side, field, value):
    doc = policy()
    next(f for f in doc["contentPolicy"]["filters"] if f["type"] == kind)[side + field] = value
    failures = gp.validate_policy(doc, "1")
    assert bool(failures) == (kind != "PROMPT_ATTACK" or side == "input")


@pytest.mark.parametrize("mutation", ["draft", "not-ready", "classic", "missing", "duplicate", "profanity", "malformed"])
def test_guardrail_policy_other_invalid_shapes(mutation):
    doc = policy()
    if mutation == "draft":
        doc["version"] = "DRAFT"
    elif mutation == "not-ready":
        doc["status"] = "CREATING"
    elif mutation == "classic":
        doc["contentPolicy"]["tier"]["tierName"] = "CLASSIC"
    elif mutation == "missing":
        doc["contentPolicy"]["filters"].pop()
    elif mutation == "duplicate":
        doc["contentPolicy"]["filters"].append(doc["contentPolicy"]["filters"][0])
    elif mutation == "profanity":
        doc["wordPolicy"]["managedWordLists"][0]["outputEnabled"] = False
    else:
        doc["contentPolicy"] = "invalid"
    assert gp.validate_policy(doc, "1")


def test_preflight_missing_or_unrelated_identity_never_calls_aws():
    with patch("boto3.Session") as session:
        assert gp.inspect()["status"] == "NOT_VALIDATED"
        result = gp.inspect(profile="aws-unrelated", region="us-east-1", account="123", principal="principal", guardrail_id="abc", version="1")
        assert result["failures"] == ["unrelated_aws_profile_denied"]
        session.assert_not_called()


def test_preflight_uses_explicit_identity_get_only_and_sanitizes_outage():
    kwargs = dict(profile="yaqin-app", region="us-east-1", account="123", principal="principal", guardrail_id="abc", version="1")
    with patch("boto3.Session") as session:
        client = session.return_value.client.return_value
        client.get_caller_identity.return_value = {"Account": "123", "Arn": "principal"}
        client.get_guardrail.return_value = policy()
        result = gp.inspect(**kwargs)
        assert result["status"] == "CONFIGURATION_VALIDATED" and result["scope"] == "configuration_only"
        session.assert_called_once_with(profile_name="yaqin-app", region_name="us-east-1")
        client.get_guardrail.assert_called_once_with(guardrailIdentifier="abc", guardrailVersion="1")
        client.create_guardrail.assert_not_called()
        client.get_guardrail.side_effect = RuntimeError("secret credentials")
        assert gp.inspect(**kwargs)["failures"] == ["inspection_unavailable"]


def test_safety_cli_rejects_unknown_empty_filters_and_sanitizes_errors(monkeypatch):
    monkeypatch.setenv("YAQIN_EVAL_ACCESS_TOKEN", "private-token")
    for only in (["--only"], ["--only", "unknown"]):
        with pytest.raises(SystemExit):
            eval_safety.main(only)
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(503, text="secret provider details"))) as client:
        result = eval_safety.run_case(client, "https://staging.invalid", eval_safety.CASES[0])
    assert not result["pass"] and result["failures"] == ["request unavailable or invalid"] and "secret" not in json.dumps(result)


def test_standalone_owned_original_audit_evidence_is_not_a_generated_candidate():
    case = {"path":"standalone-lesson","outcome":"withheld"}
    output = {"status":"NEEDS_REVIEW","lesson":None,"result":None,
              "sources":[{"id":"P1"}],"evidence":[{"text":"original source"}],
              "guardrailReport":{"reason":"source_support_rejected"}}
    assert ev.outcome_checks(case,200,output)["contract"]
    for field in ("lesson","result"):
        assert not ev.outcome_checks(case,200,{**output,field:{"cards":[{"body":"unsupported"}]}})["contract"]
    assert not ev.outcome_checks(case,200,{**output,"guardrailReport":{"authoringNotes":{"claim":"unsupported"}}})["contract"]
    assert not ev.outcome_checks(case,200,{**output,"previousRuns":[{"result":{"cards":[{}]}}]})["contract"]
    learner = {"path":"tutor","outcome":"withheld"}
    assert not ev.outcome_checks(learner,200,{"sources":{"id":{}}})["contract"]
