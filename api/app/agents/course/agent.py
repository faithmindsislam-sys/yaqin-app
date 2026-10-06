"""AI course drafting for Studio ("Generate with AI").

Grounded generation:
  1. retrieve approved sources for the teacher's prompt (RetrievalService);
  2. draft a bilingual course with the model, constrained to those sources;
  3. save the draft for the teacher to edit, without an automated review pass.
Malformed writer responses retry at most MAX_ATTEMPTS times. Safety blocks/outages
withhold the draft entirely.

Scripture is never model-written: quote cards reference a source id and the app renders
the stored, approved text (empty body enforced here).
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from copy import deepcopy
from uuid import uuid4

from app.agents.policy import POLICY_VERSION, source_data
from app.agents.support import source_snapshot
from app.domain.audience import Track, audience_instructions
from app.domain.courses import SUBJECTS, TRACK_IDS
from app.domain.lessons import lesson_source_ids
from app.domain.operations import bounded
from app.domain.safety import SafetyFailure
from app.domain.search import Retrieved
from app.domain.structured_output import strict_schema
from app.domain.support import SupportFailure
from app.gateways.llm_gateway import LLMGateway, LLMUnavailable
from app.repositories.repository import Repository
from app.services.retrieval_service import RetrievalService

from . import prompts

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 3
CARD_KINDS = {"concept", "quote", "practice", "check"}

# Awaited with (stage, attempt) as generation moves forward; lets callers show live status.
Progress = Callable[[str, int], Awaitable[None]]
Checkpoint = Callable[[dict], Awaitable[None]]


def _short_id() -> str:
    return uuid4().hex[:8]


def sources_block(retrieved: Retrieved) -> str:
    return source_data(retrieved.sources)


def _bi(value) -> dict | None:
    if not isinstance(value, dict):
        return None
    en = (value.get("en") or "").strip()
    ar = (value.get("ar") or "").strip()
    if not en and not ar:
        return None
    return {"en": en, "ar": ar}


def _normalize(draft: dict, allowed: set[str], subjects=None) -> dict:
    """Shape the model output into the app's course draft: assign ids, drop unknown
    citations, enforce empty quote bodies, keep only valid cards/quiz items."""
    cards_out: list[dict] = []
    for raw in draft.get("cards", []) or []:
        kind = raw.get("kind")
        if kind not in CARD_KINDS:
            continue
        title = _bi(raw.get("title"))
        if not title:
            continue
        card: dict = {"id": _short_id(), "kind": kind, "title": title}
        sources = [s for s in (raw.get("sources") or []) if s in allowed]
        if sources:
            card["sources"] = sources
        if kind == "quote":
            # scripture is rendered from the stored source; never model-written
            if not sources:
                continue  # a quote with no citable source has no provenance — drop it
        else:
            body = _bi(raw.get("body"))
            if body:
                card["body"] = body
        takeaway = _bi(raw.get("takeaway"))
        if takeaway:
            card["takeaway"] = takeaway
        cards_out.append(card)

    quiz_out: list[dict] = []
    for raw in draft.get("quiz", []) or []:
        question = _bi(raw.get("question"))
        options = [o for o in (_bi(o) for o in (raw.get("options") or [])) if o]
        answer = raw.get("answer")
        if not question or len(options) < 2 or not isinstance(answer, int) or not (0 <= answer < len(options)):
            continue
        item = {"id": _short_id(), "question": question, "options": options, "answer": answer}
        explanation = _bi(raw.get("explanation"))
        if explanation:
            item["explanation"] = explanation
        if raw.get("source") in allowed:
            item["source"] = raw["source"]
        quiz_out.append(item)

    subjects = SUBJECTS if subjects is None else subjects
    subject = next((s for s in subjects if s["id"] == draft.get("subject")), subjects[0])
    lesson = {
        "subject": subject["id"],
        "level": draft.get("level") if type(draft.get("level")) is int and draft["level"] in subject["levels"] else subject["levels"][0],
        "tracks": [next((t for t in draft.get("tracks", []) if t in TRACK_IDS), "explore")],
        "title": _bi(draft.get("title")) or {"en": "", "ar": ""},
        "summary": _bi(draft.get("summary")) or {"en": "", "ar": ""},
        "cards": cards_out,
    }
    if quiz_out:
        lesson["quiz"] = quiz_out
    return lesson


class CourseAgent:
    def __init__(self, repository: Repository, llm: LLMGateway, retrieval: RetrievalService):
        self.repository = repository
        self.llm = llm
        self.retrieval = retrieval

    @bounded("course")
    async def draft(self, prompt: str, *, lang: str = "en", track: Track | None = None, progress: Progress | None = None,
                    resume: dict | None = None, checkpoint: Checkpoint | None = None) -> dict:
        audience_instructions(track)  # validate direct callers before retrieval/inference
        try:
            await self.llm.assess(prompt, "INPUT")
            result = await self._draft(prompt, lang=lang, track=track, progress=progress, resume=resume, checkpoint=checkpoint)
            await self.llm.assess(result, "OUTPUT")
            return result
        except SupportFailure:
            return {"lesson": None, "review": None, "grounded": False, "reason_code": "source_support_rejected", "reason": "Source support could not be established"}
        except SafetyFailure as exc:
            return {"lesson": None, "review": None, "grounded": False, "reason_code": exc.code, "reason": exc.code}

    async def _draft(self, prompt: str, *, lang: str = "en", track: Track | None = None, progress: Progress | None = None,
                    resume: dict | None = None, checkpoint: Checkpoint | None = None) -> dict:
        """`progress(stage, attempt)` is awaited at each step so a caller can show live status.
        Stages: sources -> writing (per attempt)."""
        async def report(stage: str, attempt: int = 0) -> None:
            if progress is not None:
                await progress(stage, attempt)  # Lost job fences stop work, including further model spend.

        prompt = (prompt or "").strip()
        if not prompt:
            return {"lesson": None, "review": None, "grounded": False, "reason": "empty prompt"}

        state = deepcopy(resume) if resume else {"policy": POLICY_VERSION, "prompt": prompt, "lang": lang, "track": track}
        async def remember(**changes) -> None:
            state.update(changes)
            if checkpoint is not None:
                await checkpoint(deepcopy(state))

        if resume:
            if any(state.get(k) != v for k, v in {"policy": POLICY_VERSION, "prompt": prompt, "lang": lang, "track": track}.items()):
                raise SupportFailure()
            original = state.get("sources") or {}
            current = await source_snapshot(self.repository, list(original))
            if not original or current != original or any(s.get("review_status") != "approved" for s in current.values()):
                return {"lesson": None, "review": None, "grounded": False, "reason_code": "source_changed"}
            retrieved = Retrieved(original, {})
        else:
            await report("sources")
            retrieved = deepcopy(await self.retrieval.retrieve(prompt))
            if retrieved:
                await remember(sources=retrieved.sources, phase="writing", attempt=1)
        if not retrieved:
            # No approved sources to ground on. Be honest: return no draft rather than
            # inventing content. The teacher can add sources and try again.
            return {"lesson": None, "review": None, "grounded": False,
                    "reason_code": "no_sources", "reason": "no approved sources matched this topic"}

        await self.llm.assess(retrieved.sources, "OUTPUT")
        config = await self.repository.curriculum()
        subjects = [s for s in config["subjects"] if s["levels"]]
        if not subjects:
            return {"lesson": None, "review": None, "grounded": True, "reason": "no subject offers a level"}
        allowed = set(retrieved.ids)
        base_user = (
            f"TOPIC FROM THE TEACHER:\n{prompt}\n\n"
            f"SOURCES (cite by id; only these are allowed):\n{sources_block(retrieved)}"
        )

        base_user += "\n\nSUBJECTS AND OFFERED LEVELS:\n" + json.dumps(subjects, ensure_ascii=False)

        # Older jobs may have stopped at the review stage after their writer finished.
        if state.get("lesson") and state.get("phase") in {"written", "checking", "reviewed"}:
            return await self._finalize(state["lesson"], state.get("attempt", 1), retrieved.sources)
        feedback = state.get("feedback", "")
        first_attempt = state.get("attempt", 1)

        for attempt in range(first_attempt, MAX_ATTEMPTS + 1):
            user_msg = base_user
            if feedback:
                user_msg += f"\n\nFIX THESE ISSUES FROM THE LAST DRAFT:\n{feedback}"
            # Consume the attempt before inference so an interrupted writer cannot reset its allowance.
            await remember(phase="writing_inflight", attempt=attempt + 1, feedback=feedback)
            await report("writing", attempt)
            try:
                out = await self.llm.structured(
                    system=prompts.DRAFT + "\n" + audience_instructions(track),
                    messages=[{"role": "user", "content": user_msg}],
                    schema=strict_schema(prompts.draft_schema(subjects, config["levels"])),
                    effort="medium",
                    max_tokens=8000,
                    safety_input=[prompt, retrieved.sources, subjects, feedback],
                )
            except LLMUnavailable:
                log.warning("course_draft_unavailable attempt=%d", attempt)
                feedback = "The previous attempt did not return a valid course. Return one JSON course that matches the schema exactly."
                await remember(phase="writing", attempt=attempt + 1, feedback=feedback)
                continue

            if set(lesson_source_ids(out)) - allowed:
                return {"lesson": None, "review": None, "grounded": False,
                        "reason_code": "source_support_rejected", "reason": "Source support could not be established", "attempts": attempt}
            lesson = _normalize(out, allowed, subjects)
            lesson["audience_track"] = track or "mixed"
            if track:
                lesson["tracks"] = [track]
            if not lesson["cards"]:
                feedback = "The draft had no usable cards. Produce 3-6 cards grounded in the sources."
                await remember(phase="writing", attempt=attempt + 1, feedback=feedback)
                continue
            await remember(phase="written", attempt=attempt, lesson=lesson)
            return await self._finalize(lesson, attempt, retrieved.sources)

        return {"lesson": None, "review": None, "grounded": True,
                "reason": "the model could not produce a valid course", "attempts": MAX_ATTEMPTS}

    async def _finalize(self, lesson: dict, attempts: int, original: dict) -> dict:
        """Never release prose/quiz composed from changed or withdrawn evidence."""
        current = await source_snapshot(self.repository, list(original))
        if any(current.get(sid, {}).get("review_status") != "approved" or current.get(sid) != source
               for sid, source in original.items()):
            return {"lesson": None, "review": None, "grounded": False,
                    "reason_code": "source_changed", "reason": "Source evidence changed during generation", "attempts": attempts}
        return {"lesson": lesson, "review": None, "grounded": True, "attempts": attempts}
