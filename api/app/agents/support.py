"""One independent, bounded check. Never retry or repair a rejected candidate."""
from copy import deepcopy

from app.domain.operations import diagnostic
from app.domain.support import PROMPT, SCHEMA, SupportFailure, review_payload, validate_support
from app.gateways.llm_gateway import LLMUnavailable


async def check_support(llm, context, units, sources, required_sources=(), *, moderate=True, model=None):
    payload = review_payload(context, units, sources)
    diagnostic("support_input", unit_count=len(units), source_ids=list(sources), required_source_ids=list(required_sources))
    try:
        result = await llm.structured(system=PROMPT,
            messages=[{"role": "user", "content": payload}], schema=SCHEMA,
            effort="low", max_tokens=8000, safety_input=[context, units, sources], moderate=moderate, model=model)
        validate_support(result, units, sources, required_sources)
        diagnostic("support_result", outcome="supported", unit_count=len(units))
    except LLMUnavailable:
        raise SupportFailure("review_model_unavailable") from None
    except SupportFailure as exc:
        diagnostic("support_result", outcome="rejected", reason=exc.reason, unit_count=len(units))
        raise


async def source_snapshot(repository, ids):
    try:
        return deepcopy(await repository.get_sources(ids))
    except Exception:
        raise SupportFailure() from None
