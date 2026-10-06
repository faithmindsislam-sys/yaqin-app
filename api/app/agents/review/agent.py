"""AI-assisted pre-review of lesson drafts. Deterministic checks run first and
always; the model adds clarity and overreach notes when it is available."""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any
from collections.abc import Awaitable, Callable

from app.agents.policy import POLICY_VERSION, source_data
from app.agents.support import check_support, source_snapshot
from app.domain.audience import audience_instructions, course_audience
from app.domain.lessons import lesson_source_ids
from app.domain.operations import bounded
from app.domain.safety import SafetyFailure
from app.domain.source_policy import source_view
from app.domain.structured_output import strict_schema
from app.domain.support import SupportFailure, text_units
from app.domain.text import looks_like_scripture, normalize_ar
from app.gateways.llm_gateway import LLMGateway, LLMUnavailable
from app.repositories.repository import Repository

from . import prompts

log = logging.getLogger(__name__)

LOCALIZED_FIELDS = ("title", "body", "takeaway")


def _issue(card: str | None, severity: str, issue: str, suggestion: str) -> dict:
    return {"card": card or "", "severity": severity, "issue": issue, "suggestion": suggestion, "origin": "rule"}


def _card_for(draft: dict, sid: str) -> str | None:
    for card in draft.get("cards", []):
        if sid in card.get("sources", []):
            return card.get("id")
    return None


# The AI pass takes ~30-40 s. Its result is reused while the lesson content and its cited
# sources are unchanged.
# Workflow fields (status, owner, credits) do not change what the model reviews.
AI_CACHE_TTL = 30 * 60  # seconds
AI_CACHE_MAX = 256
NOT_CONTENT = {"status", "author_id", "contributors", "updated_at", "sources_by_id"}


def review_key(draft: dict, known: dict) -> str:
    content = {k: v for k, v in draft.items() if k not in NOT_CONTENT}
    blob = json.dumps([POLICY_VERSION, content, known], ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()


class ReviewAgent:
    def __init__(self, repository: Repository, llm: LLMGateway):
        self.repository = repository
        self.llm = llm
        self._ai_cache: dict[str, tuple[float, list[dict]]] = {}
        self._support_cache: dict[str, float] = {}

    def _cached_ai(self, key: str) -> list[dict] | None:
        hit = self._ai_cache.get(key)
        if hit is None:
            return None
        if hit[0] < time.monotonic():
            self._ai_cache.pop(key, None)
            return None
        return hit[1]

    def _remember_ai(self, key: str, issues: list[dict]) -> None:
        if len(self._ai_cache) >= AI_CACHE_MAX:
            self._ai_cache.pop(next(iter(self._ai_cache)))  # oldest entry first
        self._ai_cache[key] = (time.monotonic() + AI_CACHE_TTL, issues)

    @bounded("review")
    async def check(self, draft: dict[str, Any], *, ai: bool = True,
                    support_checkpoint: dict | None = None,
                    support_verified: Callable[[dict], Awaitable[None]] | None = None) -> dict:
        """Safety always runs, including manual publication and cached AI review."""
        try:
            await self.llm.assess(draft, "OUTPUT")
            result = await self._check(draft, ai=ai, support_checkpoint=support_checkpoint, support_verified=support_verified)
            await self.llm.assess(result, "OUTPUT")
            return result
        except SupportFailure:
            return {"lesson_id": draft.get("id"), "ready_for_reviewer": False,
                    "checks": {"source_support": False}, "ai_generated": False, "support_rejected": True,
                    "issues": [_issue(None, "high", "Source support could not be established.", "Retry scholarly review.")]}
        except SafetyFailure as exc:
            return {"lesson_id": draft.get("id"), "ready_for_reviewer": False,
                    "checks": {"ai_review": False}, "ai_generated": False,
                    "safety_outcome": exc.code,
                    "issues": [_issue(None, "high", "Content safety approval was not established.",
                                      "Content cannot be published. Contact the administrator.")]}

    async def _check(self, draft: dict[str, Any], *, ai: bool = True, support_checkpoint: dict | None = None,
                     support_verified: Callable[[dict], Awaitable[None]] | None = None) -> dict:
        cited = lesson_source_ids(draft)
        known = await source_snapshot(self.repository, cited)
        # Quote cards render stored source text at publication time.
        await self.llm.assess(known, "OUTPUT")
        issues: list[dict] = []

        for sid in cited:
            if sid not in known:
                issues.append(
                    _issue(
                        _card_for(draft, sid),
                        "high",
                        f"Cites '{sid}', which is not in the approved source library.",
                        "Add the source through the source fetcher, or remove the citation.",
                    )
                )
            elif known[sid].get("review_status") != "approved":
                issues.append(
                    _issue(
                        _card_for(draft, sid),
                        "high",
                        f"Source '{sid}' has not been approved by a reviewer yet.",
                        "Ask the scholarly reviewer to verify the text and translation.",
                    )
                )

        stored_ar = [normalize_ar(s.get("text_ar", "")) for s in known.values()]
        seen_bodies: dict[tuple[str, str], int] = {}
        for page, card in enumerate(draft.get("cards", []), 1):
            # Compare prose, not titles or IDs: different headings can hide the same page.
            if card.get("kind") != "quote":
                duplicates = []
                for lang in ("en", "ar"):
                    body = " ".join(((card.get("body") or {}).get(lang) or "").split()).casefold()
                    if not body:
                        continue
                    key = (lang, body)
                    if key in seen_bodies:
                        duplicates.append(f"{lang} repeats page {seen_bodies[key]}")
                    else:
                        seen_bodies[key] = page
                if duplicates:
                    issues.append(_issue(card.get("id"), "high", "Duplicate page content: " + "; ".join(duplicates) + ".",
                                         "Give this page a distinct supported purpose and body, or remove the duplicate; changing only its title is insufficient."))
            if card.get("kind") == "quote":
                for sid in card.get("sources", []):
                    if sid in known and source_view(known[sid]).get("translation_status_en") == "unsupported_provider":
                        issues.append(_issue(card.get("id"), "high",
                                             f"Source '{sid}' has no English translation from an allowed publisher.",
                                             "Use a separately approved canonical source, or explain its supported meaning without a quote card."))
            if card.get("kind") == "quote" and not card.get("sources"):
                issues.append(
                    _issue(
                        card.get("id"),
                        "high",
                        "Quote card has no source; its text would have no provenance.",
                        "Attach the source id; quote cards render the stored text.",
                    )
                )
            for field in LOCALIZED_FIELDS:
                for lang, text in (card.get(field) or {}).items():
                    if not isinstance(text, str) or not looks_like_scripture(text):
                        continue
                    norm = normalize_ar(text)
                    if not any(norm and norm in s for s in stored_ar):
                        issues.append(
                            _issue(
                                card.get("id"),
                                "high",
                                f"{field}.{lang} contains vowelled Arabic that does not match any cited source "
                                "(possible unsourced or misquoted scripture).",
                                "Move scripture into a quote card that references a stored source.",
                            )
                        )
            if (
                card.get("kind") in ("concept", "practice")
                and not card.get("sources")
                and card.get("label") == "obligatory"
            ):
                issues.append(
                    _issue(
                        card.get("id"),
                        "high",
                        "Marked obligatory without any supporting source.",
                        "Cite the evidence for the obligation, or relabel it.",
                    )
                )

        ai_ran = False
        ai_cached = False
        key = review_key(draft, known)
        # Only CourseAgent supplies this server-owned checkpoint. The key binds policy,
        # complete draft and current evidence; persisted verdicts expire like memory cache.
        persisted_support = bool(support_checkpoint and support_checkpoint.get("key") == key
                                 and support_checkpoint.get("expires_at", 0) > time.time())
        support_cached = persisted_support or self._support_cache.get(key, 0) > time.monotonic()
        try:
            if any(known.get(sid, {}).get("review_status") != "approved" for sid in cited):
                raise SupportFailure()
            if not support_cached:
                units = text_units(draft)
                # Quote cards display authoritative text rather than model-written bodies.
                for card in draft.get("cards", []):
                    if card.get("kind") == "quote":
                        for sid in card.get("sources", []):
                            units.update(text_units({k: v for k, v in source_view(known[sid]).items() if k in {"text_en", "text_ar"}},
                                                    f"rendered.{sid}"))
                await check_support(self.llm, {"course": draft}, units, known, cited)
                if len(self._support_cache) >= AI_CACHE_MAX:
                    self._support_cache.pop(next(iter(self._support_cache)))
                self._support_cache[key] = time.monotonic() + AI_CACHE_TTL
            latest = await source_snapshot(self.repository, cited)
            if latest != known:
                raise SupportFailure()
        except SupportFailure:
            return {"lesson_id": draft.get("id"), "ready_for_reviewer": False,
                    "checks": {"ai_review": False, "source_support": False}, "ai_generated": False,
                    "support_rejected": True,
                    "issues": [*issues, _issue(None, "high", "Source support review was not completed or rejected the content.",
                                               "Content cannot be published. Request scholarly review.")]}
        if support_verified is not None:
            expires_at = (support_checkpoint["expires_at"] if persisted_support else
                          time.time() + max(0, self._support_cache.get(key, 0) - time.monotonic()))
            await support_verified({"key": key, "expires_at": expires_at})
        cached = self._cached_ai(key) if ai else None
        if cached is not None:
            issues += [dict(i) for i in cached]
            ai_ran = ai_cached = True
        elif ai:
            try:
                draft_json = json.dumps(draft, ensure_ascii=False)
                sources_json = source_data(known)
                if len(draft_json) > 60000 or len(sources_json) > 40000:
                    raise LLMUnavailable("complete review evidence exceeds the review budget")
                out = await self.llm.structured(
                    system=prompts.REVIEW + "\n" + audience_instructions(course_audience(draft)),
                    messages=[
                        {
                            "role": "user",
                            "content": f"DRAFT COURSE (JSON):\n{draft_json}\n\n"
                            f"CITED SOURCES:\n{sources_json}",
                        }
                    ],
                    schema=strict_schema(prompts.REVIEW_SCHEMA_PROPS),
                    effort="medium",
                    max_tokens=6000,
                    safety_input=[draft, known],
                )
                ai_issues = [{**i, "origin": "ai"} for i in out.get("issues", [])]
                issues += ai_issues
                ai_ran = True
                # Reuse only passing reviews: that is the submit -> approve path. A blocking
                # result makes the teacher edit (new key) and should not stick if retried.
                if not any(i.get("severity") == "high" for i in ai_issues):
                    self._remember_ai(key, ai_issues)
            except LLMUnavailable:
                log.info("review_model_unavailable")
                issues.append(_issue(None, "high", "AI pre-review was not completed.",
                                     "Retry the complete review; no automatic pass was established."))

        if await source_snapshot(self.repository, cited) != known:
            return {"lesson_id": draft.get("id"), "ready_for_reviewer": False,
                    "checks": {"source_support": False}, "ai_generated": False, "support_rejected": True,
                    "issues": [_issue(None, "high", "Source evidence changed during review.", "Repeat scholarly review.")]}
        high = sum(1 for i in issues if i["severity"] == "high")
        return {
            "lesson_id": draft.get("id"),
            "ready_for_reviewer": high == 0,
            "checks": {
                "source_support": True,
                "source_support_reused": support_cached,
                "sources_found": f"{len(known)}/{len(cited)}",
                "sources_approved": sum(1 for s in known.values() if s.get("review_status") == "approved"),
                "ai_review": ai_ran,
                "ai_review_reused": ai_cached,
            },
            "issues": issues,
            "ai_generated": ai_ran,
        }
