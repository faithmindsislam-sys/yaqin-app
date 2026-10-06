from app.domain.support import excerpt_found


def test_quotation_marks_do_not_break_an_otherwise_exact_excerpt():
    source = '"Tawh\u012bd" (monotheism) is the greatest thing that Allah Almighty has made obligatory.'
    assert excerpt_found("Tawh\u012bd (monotheism) is the greatest thing", [source])
    assert excerpt_found("\u201cTawh\u012bd\u201d (monotheism) is the greatest", [source])


def test_changed_words_still_fail():
    source = '"Tawh\u012bd" (monotheism) is the greatest thing that Allah Almighty has made obligatory.'
    assert not excerpt_found("Tawh\u012bd is the smallest thing", [source])


def test_ellipsis_fragments_must_each_match_in_order():
    source = "He is the Creator and Provider of everything. Indeed, to Allah belongs the whole matter."
    assert excerpt_found("He is the Creator and Provider of everything... to Allah belongs the whole matter", [source])
    assert not excerpt_found("to Allah belongs the whole matter... He is the Creator", [source])
    assert not excerpt_found("He is the Creator... of nothing at all", [source])


def test_non_claim_follow_up_with_evidence_is_accepted_without_using_it():
    from app.domain.support import validate_support
    units = {"candidate.answer": "Allah is One [[ref:icadb:1]].", "candidate.follow_ups.0": "What else should I read?"}
    sources = {"ref:icadb:1": {"id": "ref:icadb:1", "kind": "faq", "text_en": "Allah is One and has no partner."}}
    result = {"personal_ruling": False, "units": [
        {"id": "candidate.answer", "verdict": "supported", "evidence": [{"source": "ref:icadb:1", "excerpt": "Allah is One"}]},
        {"id": "candidate.follow_ups.0", "verdict": "non_claim", "evidence": [{"source": "ref:icadb:1", "excerpt": "Allah is One"}]}]}
    validate_support(result, units, sources, ["ref:icadb:1"])
