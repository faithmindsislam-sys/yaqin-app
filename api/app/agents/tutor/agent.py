"""Ask Yaqin tutor and explain-back grading.

The safety invariants from docs/CONTRACT.md are enforced here, after the model
responds, so they hold even when the model ignores its instructions."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from copy import deepcopy
from uuid import uuid4

from app.agents.policy import source_data
from app.agents.support import check_support, source_snapshot
from app.contracts.tutor import AskRequest, ExplainRequest
from app.domain.audience import audience_instructions
from app.domain.errors import ApiError
from app.domain.lessons import lesson_source_ids
from app.domain.operations import CURRENT, bounded, diagnostic, stage
from app.domain.safety import SafetyBlocked, SafetyFailure
from app.domain.search import Retrieved
from app.domain.source_policy import source_views
from app.domain.sources import library_sources
from app.domain.structured_output import strict_schema
from app.domain.support import SupportFailure, text_units, validate_remote_review
from app.domain.text import strip_scripture, tokens
from app.gateways.agent_gateway import AgentGateway, AgentUnavailable
from app.gateways.llm_gateway import LLMGateway, LLMUnavailable
from app.repositories.repository import Repository
from app.services.retrieval_service import RetrievalService

from . import practice, prompts
from .learning_context import learning_context, page_action

log = logging.getLogger(__name__)

MARKER = re.compile(r"\[\[\s*([a-z]+:[^\]\s]+)\s*\]\]")
STRAY_BRACKETS = re.compile(r"\[\[[^\]]*\]\]?")
HISTORY_TURNS = 6
LANGUAGE = {"en": "English", "ar": "Modern Standard Arabic"}


def _text(key: str, lang: str) -> dict:
    return {"type": "text", "text": prompts.TEXT[key][lang]}


def parse_answer(raw: str, allowed: set[str]) -> tuple[list[dict], list[str], bool]:
    """Split model text on [[id]] markers. Unknown ids are dropped, and any
    scripture the model wrote itself is removed. Returns (blocks, cited_ids, stripped)."""
    blocks: list[dict] = []
    cited: list[str] = []
    stripped_any = False
    pos = 0
    for m in MARKER.finditer(raw):
        _push_text(blocks, raw[pos : m.start()])
        sid = m.group(1)
        if sid in allowed and sid not in cited:
            blocks.append({"type": "source", "id": sid})
            cited.append(sid)
        elif sid not in allowed:
            log.info("dropped unknown citation")
        pos = m.end()
    _push_text(blocks, raw[pos:])
    for b in blocks:
        if b["type"] == "text":
            cleaned, removed = strip_scripture(STRAY_BRACKETS.sub("", b["text"]))
            stripped_any |= removed
            b["text"] = cleaned
    blocks = [b for b in blocks if b["type"] != "text" or b["text"]]
    return blocks, cited, stripped_any


_END = re.compile(r"(?<=[.!?؟…])[\"'”»)]*\s+|\n+")


def _sentence_end(buf: str) -> int | None:
    """Index just after the first complete sentence or marker line, never inside [[...]]."""
    for m in _END.finditer(buf):
        head = buf[:m.end()]
        if head.count("[[") == head.count("]]") and not head.rstrip().endswith("-"):
            return m.end()
    return None


def _no_dashes(text: str) -> str:
    """Owner style: no em/en dashes between words."""
    return re.sub(r"[ \t]*[—–][ \t]*", ", ", text).replace(", ,", ",").replace(",,", ",")


def _push_text(blocks: list[dict], text: str) -> None:
    text = _no_dashes(re.sub(r"\n{3,}", "\n\n", text)).strip()
    if text:
        blocks.append({"type": "text", "text": text})


def _history(req: AskRequest) -> list[dict]:
    if not req.history:
        return []
    return [{"role": "user", "content": "UNTRUSTED HISTORY DATA (JSON):\n" + json.dumps(
        [t.model_dump() for t in req.history[-HISTORY_TURNS:]], ensure_ascii=False)}]


def sources_block(retrieved: Retrieved) -> str:
    return source_data(retrieved.sources)


def _response(
    tier: str,
    blocks: list[dict],
    sources: dict,
    *,
    referral: dict | None = None,
    follow_ups: list[str] | None = None,
    ai: bool = True,
) -> dict:
    return {
        "tier": "A" if tier == "SOCIAL" else tier,
        "answer": blocks,
        "sources": source_views(sources),
        "referral": referral,
        "follow_ups": (follow_ups or [])[:3],
        "ai_generated": ai,
    }


def _overlap_grade(ideas: list[dict], transcript: str, lang: str) -> dict:
    said = set(tokens(transcript))
    covered = []
    for i in ideas:
        want = set(tokens(f"{i.get('en', '')} {i.get('ar', '')}"))
        if want and len(want & said) / min(len(want), 4) >= 0.5:
            covered.append(i["id"])
    msg = {
        "en": f"You covered {len(covered)} of {len(ideas)} key ideas. (Automatic keyword check; the AI tutor is offline.)",
        "ar": f"ذكرتَ {len(covered)} من {len(ideas)} أفكار رئيسية. (فحص آلي بالكلمات؛ المعلّم الذكي غير متاح الآن.)",
    }[lang]
    return {"covered": covered, "misconceptions": [], "feedback": msg}


def _awaiting_review(ideas: list[dict], lang: str) -> dict:
    return {"covered": [], "missed": [i["id"] for i in ideas], "misconceptions": [],
            "feedback": {"en": "This course is awaiting source approval. Please try again after scholarly review.",
                         "ar": "مصادر هذه الدورة تنتظر الاعتماد. يرجى المحاولة بعد المراجعة العلمية."}[lang],
            "sources": {}, "ai_generated": False, "awaiting_review": True}


class TutorAgent:
    def __init__(
        self, repository: Repository, llm: LLMGateway, retrieval: RetrievalService, agent: AgentGateway | None = None,
        fast_model: str | None = None, review_skip_tiers: str = "",
        tutor_model: str | None = None,
    ):
        self.repository = repository
        self.llm = llm
        # Routing and evidence review are judgement tasks; a smaller model does them in a fraction of the time.
        self.fast_model = fast_model or None
        self.tutor_model = tutor_model or None
        self.review_skip_tiers = {t.strip() for t in review_skip_tiers.split(",") if t.strip()}
        self.retrieval = retrieval
        self.agent = agent

    @bounded("tutor")
    async def ask(self, req: AskRequest, *, authorization: str = "", user_id: str | None = None, on_draft=None) -> dict:
        """on_draft(result): optional async callback with the moderated draft before the evidence review."""
        started = time.monotonic()
        try:
            result = await self._ask(req, authorization, user_id, on_draft=on_draft)
            # Also assess rendered sources and deterministic fallback content.
            await self.llm.assess(result, "OUTPUT")
            result["safety_outcome"] = "allowed"
        except SupportFailure as exc:
            diagnostic("tutor_fallback", reason=exc.reason)
            result = _response("NONE", [_text("unavailable", req.lang)], {}, ai=False)
        except SafetyFailure as exc:
            diagnostic("tutor_fallback", reason=exc.code)
            key = "unavailable"
            if isinstance(exc, SafetyBlocked):
                key = "out_of_scope" if exc.prompt_attack else "soft_safety"
            result = _response("NONE", [_text(key, req.lang)], {}, ai=False)
            result["safety_outcome"] = exc.code
        cited = [b["id"] for b in result["answer"] if b["type"] == "source"]
        diagnostic("tutor_result", tier=result["tier"], cited_source_ids=cited,
                   practice_count=len(result.get("practice", [])), practice_fallback=result.get("practice_fallback", False),
                   ai_generated=result["ai_generated"], safety_outcome=result.get("safety_outcome"))
        try:
            await self.repository.log_tutor(result["tier"], cited, int((time.monotonic() - started) * 1000), req.track)
        except Exception as e:
            log.warning("tutor log failed: %s", type(e).__name__)
        return result

    async def _ask(self, req: AskRequest, authorization: str = "", user_id: str | None = None, on_draft=None) -> dict:
        lang = req.lang
        wants_practice = req.practice or practice.requested(req.question)
        if CURRENT.get():
            CURRENT.get().mode = "practice" if wants_practice else "answer"
        with stage("course_load"):
            lesson = await self.repository.get_lesson(req.lesson_id) if req.lesson_id else None
        if req.lesson_id and lesson is None:
            raise ApiError(404, "not_found", "The current course is unavailable.")
        with stage("learning_context"):
            context = await learning_context(self.repository, req, lesson, user_id)
        # The one INPUT check: the learner's request and its page context. Approved sources are
        # reviewed content; the model's output is covered by the single OUTPUT check in ask().
        # Only prompt-injection attempts stop here; topic filters never block a sincere question.
        async def input_check():
            try:
                await self.llm.assess([req.model_dump(), context] if context else req.model_dump(), "INPUT")
            except SafetyBlocked as exc:
                if exc.prompt_attack:
                    raise
                diagnostic("input_filter_ignored", reason="topic_filter")
        # The check runs alongside classification and search; it must pass before any generation.
        guard = asyncio.create_task(input_check())
        current = context.get("current_page") if context else None
        navigation = {"course": context["course"]["title"], "current_page": current["title"] if current else None} if context else None
        greeting = prompts.smalltalk(req.question) if not wants_practice else None
        if greeting:
            await guard
            diagnostic("smalltalk", retrieval_skipped=True, generation_skipped=True)
            return _response("A", [_text(greeting, lang)], {}, ai=False)
        if wants_practice and not current:
            await guard
            return _response("NONE", [_text("practice_reading", lang)], {}, ai=False)

        early_query = f"{req.question} {current['title'] if current else context['course']['title'] if context else ''}".strip()
        early = None if (wants_practice or page_action(req)) else asyncio.create_task(self.retrieval.retrieve(early_query, lesson=lesson))
        try:
            with stage("classification"):
                route = await self.llm.structured(
                    system=prompts.CLASSIFY,
                    messages=[{"role": "user", "content": "UNTRUSTED REQUEST DATA (JSON):\n" + json.dumps({
                        "journey": req.track, "navigation": navigation, "question": req.question,
                        "history": [t.model_dump() for t in req.history[-HISTORY_TURNS:]]}, ensure_ascii=False)}],
                    schema=strict_schema(prompts.CLASSIFY_SCHEMA_PROPS),
                    effort="low",
                    max_tokens=1000,
                    moderate=False,
                    model=self.fast_model,
                )
        except LLMUnavailable:
            log.warning("classifier unavailable")
            if wants_practice:
                return self._practice_fallback(req, "classifier_unavailable")
            route = {"tier": "B", "search_query": "", "hostile": False, "practice": False}

        await guard
        tier = route.get("tier", "B")
        diagnostic("routing", tier=tier, practice=route.get("practice") is True,
                   runtime="remote" if self.agent and self.agent.enabled else "local")
        if tier == "OUT":
            return _response("OUT", [_text("decline", lang)], {})
        social = tier == "SOCIAL"
        if social:
            wants_practice = False
        wants_practice = wants_practice or route.get("practice") is True
        if CURRENT.get():
            CURRENT.get().mode = "practice" if wants_practice else "answer"
        if wants_practice and (not current or tier == "D"):
            return _response("NONE", [_text("practice_reading" if not current else "personal_general", lang)], {},
                             referral=prompts.TEXT["referral"] if tier == "D" else None, ai=False)

        query = f"{req.question} {route.get('search_query', '')} {current['title'] if current else context['course']['title'] if context else ''}".strip()
        evidence_scope = lesson
        if page_action(req):
            # Prefer complete page evidence; fallback search remains broad.
            evidence_scope = {"cards": [c for c in lesson.get("cards", []) if c["id"] == req.card_id]}
        if social and early is not None:
            early.cancel()
            early = None
        with stage("retrieval"):
            retrieved = await self.retrieval.page_sources(evidence_scope["cards"][0]) if page_action(req) else None
            if retrieved is None:
                # Intro pages often have no citations. Keep the course's approved evidence
                # available instead of searching only the generic "Test my knowledge" text.
                if page_action(req):
                    query = f"{context['course']['title']} {current['title']} {route.get('search_query', '')}".strip()
                    diagnostic("page_evidence_fallback", reason="page_sources_unavailable")
                retrieved = await early if early is not None and not wants_practice else await self.retrieval.retrieve(query, lesson=lesson)
        if early is not None and not early.done():
            early.cancel()
        retrieved = deepcopy(retrieved)
        if social:
            retrieved.sources, retrieved.scores = {}, {}
        # Keep the page's approved evidence ahead of other course/library hits in the remote cap.
        page_sources = next((c.get("sources", []) for c in (lesson or {}).get("cards", [])
                             if c["id"] == req.card_id), [])
        retrieved.sources = {sid: retrieved.sources[sid] for sid in dict.fromkeys([*page_sources, *retrieved.sources])
                             if sid in retrieved.sources}
        if not wants_practice:
            # Answers rely on the one or two best sources only.
            retrieved.sources = dict(list(retrieved.sources.items())[:2])
        referral = prompts.TEXT["referral"] if tier == "D" else None

        await guard
        user_msg = (
            "UNTRUSTED LEARNING CONTEXT (JSON):\n" + json.dumps(context, ensure_ascii=False) + "\n\n"
            + f"SOURCES:\n{sources_block(retrieved)}\n\n"
            f"Learner track: {req.track or 'unknown'}"
            + (f"\nCurrent course: {lesson['title'].get('en')}\nSubject: {lesson.get('subject')}\nDifficulty level: {lesson.get('level')}\nCourse tracks: {lesson.get('tracks')}" if lesson else "")
            + ("\nThe question is phrased in a hostile way." if route.get("hostile") else "")
            + f"\n\nQUESTION:\n{req.question}"
        )
        sources = dict(retrieved.sources)
        if wants_practice:
            return await self._practice(req, tier, route, retrieved, lesson, authorization, context, user_msg)
        out = await self._agent_answer(req, tier, route, retrieved, lesson, authorization, context)
        if out is not None and not retrieved:
            out = None
        if out is not None:
            sources.update({s["id"]: s for s in library_sources(out.pop("library_sources"))})
        else:
            try:
                if on_draft is not None and hasattr(self.llm, "stream_text"):
                    with stage("generation", source_ids=list(sources), streaming=True):
                        out = await self._stream_answer(req, tier, context, user_msg, sources, on_draft)
                else:
                  with stage("generation", source_ids=list(sources)):
                    out = await self.llm.structured(
                        system=prompts.ANSWER.format(tier=tier, language=LANGUAGE[lang]) + "\n" + audience_instructions(req.track) + "\n" + prompts.persona(req.track, bool(context)),
                        messages=[*_history(req), {"role": "user", "content": user_msg}],
                        schema=strict_schema(prompts.ANSWER_SCHEMA_PROPS),
                        effort="low",
                        max_tokens=4000,
                        moderate=False,
                        model=self.tutor_model,
                        think=False,
                    )
            except LLMUnavailable:
                log.warning("answer unavailable")
                diagnostic("tutor_fallback", reason="generation_unavailable")
                return _response("NONE", [_text("unavailable", lang)], {}, ai=False)

        # The app's invariants hold whichever model wrote the answer: unknown citations are
        # dropped and any scripture the model typed itself is removed; the rest is kept.
        blocks, cited, stripped = parse_answer(out.get("answer", ""), set(sources))
        if stripped or set(MARKER.findall(out.get("answer", ""))) - set(sources):
            diagnostic("answer_cleaned", scripture_removed=stripped)
        follow_ups = [f for f in out.get("follow_ups", []) if isinstance(f, str) and f.strip()]
        if not any(b["type"] == "text" for b in blocks):
            diagnostic("tutor_fallback", reason="empty_answer")
            return _response("NONE", [_text("unavailable", lang)], {}, ai=False)
        diagnostic("answer_evidence", source_ids=list(sources), cited_source_ids=cited)
        if tier == "D":
            blocks = [_text("personal_general", lang), *blocks]
        used = {sid: sources[sid] for sid in cited}
        return _response(tier, blocks, used, referral=referral, follow_ups=follow_ups)

    async def _stream_answer(self, req, tier, context, user_msg, sources, on_draft) -> dict:
        """Stream the answer one sentence at a time. Each sentence passes the output guardrail
        before it is shown; checks run in parallel but sentences are shown in order."""
        lang = req.lang
        system = (prompts.ANSWER.format(tier=tier, language=LANGUAGE[lang]) + "\n" + audience_instructions(req.track)
                  + "\n" + prompts.persona(req.track, bool(context)) + "\n\n" + prompts.STREAM_FORMAT)
        allowed = set(sources)
        shown: list[dict] = [_text("personal_general", lang)] if tier == "D" else []
        pending: list[asyncio.Task] = []
        emitted = 0

        async def check(unit: str):
            blocks, _, _ = parse_answer(unit, allowed)
            texts = [b for b in blocks if b["type"] == "text"]
            if texts:
                await self.llm.assess(texts, "OUTPUT")
            return blocks

        async def flush(wait_all: bool):
            nonlocal emitted
            changed = False
            while emitted < len(pending) and (wait_all or pending[emitted].done()):
                shown.extend(await pending[emitted])
                emitted += 1
                changed = True
            if changed:
                cited = [b["id"] for b in shown if b["type"] == "source"]
                await on_draft({**_response(tier, list(shown), {sid: sources[sid] for sid in cited}),
                                "safety_outcome": "allowed", "verifying": True})

        full, buf = "", ""
        try:
            async for delta in self.llm.stream_text(system=system, messages=[*_history(req), {"role": "user", "content": user_msg}],
                                                     max_tokens=1500, model=self.tutor_model):
                full += delta
                if prompts.FOLLOWUPS in full:
                    continue
                buf += delta
                while True:
                    cut = _sentence_end(buf)
                    if cut is None:
                        break
                    unit, buf = buf[:cut], buf[cut:]
                    if unit.strip():
                        pending.append(asyncio.create_task(check(unit)))
                await flush(False)
            answer, _, tail = full.partition(prompts.FOLLOWUPS)
            rest = buf.partition("---")[0] if prompts.FOLLOWUPS in full else buf
            if rest.strip():
                pending.append(asyncio.create_task(check(rest)))
            await flush(True)
        finally:
            for t in pending:
                if not t.done():
                    t.cancel()
        follow_ups = [ln.strip(" -•*0123456789.)\t") for ln in tail.splitlines() if ln.strip()][:3]
        return {"answer": answer, "follow_ups": follow_ups}

    def _practice_fallback(self, req, reason="practice_unavailable"):
        diagnostic("practice_fallback", reason=reason)
        result = _response("NONE", [_text("practice_fallback", req.lang)], {}, ai=False)
        result["practice_fallback"] = True
        return result

    async def _practice(self, req, tier, route, retrieved, lesson, authorization, context, user_msg):
        sources = dict(retrieved.sources)
        avoid = [*req.practice_avoid, *[text for q in lesson.get("quiz", []) for text in q["question"].values()]]
        try:
            out = await self._agent_answer(req, tier, route, retrieved, lesson, authorization, context, mode="practice")
            if out is None:
                with stage("generation", source_ids=list(sources)):
                    out = await self.llm.structured(
                        system=prompts.COMMON_POLICY + "\n" + prompts.EDUCATIONAL_STYLE + "\n" + practice.PROMPT
                               + "\n" + audience_instructions(req.track) + "\n" + prompts.persona(req.track, True),
                        messages=[{"role": "user", "content": user_msg + "\nAvoid these existing course and session questions:\n"
                                  + json.dumps(avoid, ensure_ascii=False)}],
                        schema=strict_schema(practice.PROPS), effort="low", max_tokens=2000,
                        moderate=False, model=self.tutor_model, think=False)
            else:
                sources.update({s["id"]: s for s in library_sources(out.pop("library_sources"))})
            with stage("practice_validation"):
                items = practice.validate(deepcopy(out.get("practice")), sources, avoid)
            if not items:
                diagnostic("practice_retry", reason="no_usable_question")
                with stage("generation", source_ids=list(sources), attempt=2):
                    out = await self.llm.structured(
                        system=prompts.COMMON_POLICY + "\n" + prompts.EDUCATIONAL_STYLE + "\n" + practice.PROMPT
                               + "\n" + audience_instructions(req.track) + "\n" + prompts.persona(req.track, True),
                        messages=[*_history(req), {"role": "user", "content": user_msg + "\nAsk about a different idea from this course than"
                                  " any of these earlier questions:\n" + json.dumps(avoid[-40:], ensure_ascii=False)}],
                        schema=strict_schema(practice.PROPS), effort="low", max_tokens=2000,
                        moderate=False, model=self.tutor_model, think=False)
                items = practice.validate(deepcopy(out.get("practice")), sources, avoid)
            if not items:
                return self._practice_fallback(req, "empty_practice")
            units = practice.units(items)
            if any(strip_scripture(text)[1] for text in units.values()):
                raise SupportFailure()
            for item in items:
                for field in ("question", "hint", "explanation", *range(3)):
                    value = item["options"][field] if isinstance(field, int) else item[field]
                    for k in value:
                        value[k] = _no_dashes(value[k])
            with stage("source_recheck"):
                current = await source_snapshot(self.repository, list(retrieved.sources))
            if any(current.get(sid, {}).get("review_status") != "approved" or current.get(sid) != source
                   for sid, source in retrieved.sources.items()):
                raise SupportFailure("source_changed")
        except (LLMUnavailable, SupportFailure) as exc:
            return self._practice_fallback(req, getattr(exc, "reason", "generation_unavailable"))
        diagnostic("practice_evidence", source_ids=list(sources), cited_source_ids=[item["source"] for item in items],
                   remote_verified=bool(out.get("_support_verified")))
        result = _response(tier, [], {item["source"]: sources[item["source"]] for item in items if item["source"]})
        result["practice"] = [{"id": f"practice:{n}", **item} for n, item in enumerate(items)]
        return result

    async def _agent_answer(self, req, tier, route, retrieved, lesson, authorization, learning=None, mode="answer") -> dict | None:
        """Answer through the agents service, which adds Studio library passages from RAG using the
        learner's own JWT. None means: answer in-process from approved sources (today's behaviour)."""
        if self.agent is None or not self.agent.enabled or not authorization:
            return None
        context = f"Learner track: {req.track or 'unknown'}" + (
            f"\nCurrent course: {lesson['title'].get('en')}\nSubject: {lesson.get('subject')}"
            f"\nDifficulty level: {lesson.get('level')}\nCourse tracks: {lesson.get('tracks')}"
            if lesson else "")
        payload = {
            "supportRequestId": uuid4().hex,
            "question": req.question, "lang": req.lang, "track": req.track, "tier": tier, "hostile": bool(route.get("hostile")),
            "searchQuery": (route.get("search_query") or "")[:500], "context": context[:2000],
            "learningContext": learning,
            "history": [{"role": t.role, "content": t.content} for t in req.history[-HISTORY_TURNS:]],
            "sources": [{"id": sid} for sid in list(retrieved.sources)[:24]],
        }
        if mode == "practice":
            payload.update({"mode": "practice", "practiceAvoid": [*req.practice_avoid,
                            *[q["question"].get(req.lang, "")[:800] for q in lesson.get("quiz", [])[:24]]]})
        if len(json.dumps(payload, ensure_ascii=False).encode("utf-8")) > 131072:
            # Preserve page context/history locally when their encoded request exceeds Lambda's cap.
            return None
        try:
            budget = CURRENT.get()
            if budget:
                evidence = source_views({sid: retrieved.sources[sid] for sid in list(retrieved.sources)[:24]})
                # Two bounded remote calls; optional library views total <=16KiB in each prompt.
                budget.reserve([payload, evidence, evidence], (14000 if mode == "practice" else 10000) + 32000,
                               calls=2, kind="remote")
            with stage("remote_request", support_request_id=payload["supportRequestId"]):
                result = await self.agent.ask(payload, authorization=authorization)
            result.pop("_support_verified", None)
            if "support_review" in result:
                sources = {sid: retrieved.sources[sid] for sid in list(retrieved.sources)[:24]}
                sources.update({s["id"]: s for s in library_sources(result.get("library_sources"))})
                units = text_units({"answer": result.get("answer"), "follow_ups": result.get("follow_ups")})
                required = MARKER.findall(result.get("answer", ""))
                if mode == "practice":
                    items = practice.validate(deepcopy(result.get("practice")), sources, payload["practiceAvoid"])
                    if result.get("answer") or result.get("follow_ups"):
                        raise SupportFailure()
                    units.update(practice.units(items))
                    required += [item["source"] for item in items]
                elif result.get("practice"):
                    raise SupportFailure()
                with stage("remote_verdict_validation"):
                    validate_remote_review(result["support_review"], payload, units, sources, required)
                result["_support_verified"] = True
            if mode == "practice" and result.get("practice_version") != "1":
                if ("support_review" in result
                        or budget and budget.call_limit - budget.model_calls < 2):
                    raise SupportFailure()
                return None
            if learning and result.get("learning_context_version") != "1":
                if ("support_review" in result
                        or budget and budget.call_limit - budget.model_calls < 2):
                    raise SupportFailure()
                # An older deployed service can safely reply but cannot explain the current page.
                return None
            return result
        except AgentUnavailable:
            if budget and budget.call_limit - budget.model_calls < 2:
                raise SupportFailure() from None
            log.warning("agents ask unavailable, answering in-process")
            diagnostic("remote_fallback", reason="agents_unavailable")
            return None

    async def _offline(self, req: AskRequest) -> dict:
        """No model available: show keyword-matched approved sources, clearly labelled."""
        retrieved = await self.retrieval.retrieve(req.question, lesson=None)
        retrieved = deepcopy(retrieved)
        top = [sid for sid in retrieved.ids if retrieved.scores[sid] >= 0.5][:2]
        if not top:
            return _response("NONE", [_text("unavailable", req.lang)], {}, ai=False)
        blocks = [_text("unavailable", req.lang), _text("keyword_matches", req.lang)]
        blocks += [{"type": "source", "id": sid} for sid in top]
        return _response("NONE", blocks, {sid: retrieved.sources[sid] for sid in top}, ai=False)

    @bounded("tutor")
    async def explain_back(self, req: ExplainRequest, *, user_id: str | None = None) -> dict | None:
        try:
            await self.llm.assess(req.model_dump(), "INPUT")
            result = await self._explain_back(req)
            if result is not None:
                await self.llm.assess(result, "OUTPUT")
                result["safety_outcome"] = "allowed"
            return result
        except SupportFailure:
            return {"covered": [], "missed": [], "misconceptions": [],
                    "feedback": prompts.TEXT["unavailable"][req.lang], "sources": {}, "ai_generated": False}
        except SafetyFailure as exc:
            key = "safety_refusal" if isinstance(exc, SafetyBlocked) else "unavailable"
            return {"covered": [], "missed": [], "misconceptions": [],
                    "feedback": prompts.TEXT[key][req.lang], "sources": {}, "ai_generated": False,
                    "safety_outcome": exc.code}

    async def _explain_back(self, req: ExplainRequest) -> dict | None:
        lesson = await self.repository.get_lesson(req.lesson_id)
        if lesson is None:
            return None
        ideas = lesson.get("explain_back", {}).get("key_ideas", [])
        idea_ids = [i["id"] for i in ideas]
        lesson_ids = lesson_source_ids(lesson)
        with stage("source_recheck"):
            sources = await source_snapshot(self.repository, lesson_ids)
        if any(sid not in sources or sources[sid].get("review_status") != "approved" for sid in lesson_ids):
            return _awaiting_review(ideas, req.lang)
        lang = req.lang

        checklist = "\n".join(
            f"- {i['id']}: {i.get('en')} / {i.get('ar')}" + (f" (source {i['source']})" if i.get("source") else "")
            for i in ideas
        )
        srcs = source_data(sources)
        prompt_text = lesson.get("explain_back", {}).get("prompt", {}).get("en", "")
        try:
            with stage("generation"):
                out = await self.llm.structured(
                    system=prompts.EXPLAIN_BACK.format(language=LANGUAGE[lang]) + "\n" + audience_instructions(req.track),
                    messages=[
                        {
                            "role": "user",
                            "content": (
                                f"COURSE: {lesson['title'].get('en')}\nTASK GIVEN TO LEARNER: {prompt_text}\n\n"
                                f"KEY IDEAS (in page order):\n{checklist}\n\nSOURCES:\n{srcs or '(none)'}\n\n"
                                f"LEARNER'S EXPLANATION:\n{req.transcript}"
                            ),
                        }
                    ],
                    schema=strict_schema(prompts.EXPLAIN_SCHEMA_PROPS),
                    effort="low",
                    max_tokens=3000,
                    safety_input=[req.model_dump(), lesson, sources],
                    model=self.tutor_model,
                )
            ai = True
        except LLMUnavailable:
            log.warning("explain-back model unavailable, using keyword overlap")
            out, ai = _overlap_grade(ideas, req.transcript, lang), False

        with stage("source_recheck"):
            current = await source_snapshot(self.repository, lesson_ids)
        if any(current.get(sid, {}).get("review_status") != "approved" or current[sid] != sources[sid]
               for sid in lesson_ids):
            return _awaiting_review(ideas, lang)

        generated_text = [out.get("feedback", ""), *[m.get(k, "") for m in out.get("misconceptions", [])
                                                      for k in ("text", "correction")]]
        if any(strip_scripture(text)[1] for text in generated_text):
            return {"covered": [], "missed": idea_ids, "misconceptions": [],
                    "feedback": prompts.TEXT["unavailable"][lang], "sources": {}, "ai_generated": False}
        covered = [i for i in idea_ids if i in set(out.get("covered", []))]
        missed = [i for i in idea_ids if i not in covered]
        misconceptions = []
        for m in out.get("misconceptions", []):
            sid = m.get("source") or None
            if sid not in sources:
                return {"covered": [], "missed": idea_ids, "misconceptions": [],
                        "feedback": prompts.TEXT["unavailable"][lang], "sources": {}, "ai_generated": False}
            misconceptions.append(
                {
                    "text": m.get("text", ""),
                    "correction": m.get("correction", ""),
                    "source": sid,
                }
            )
        cited = {m["source"] for m in misconceptions if m["source"]} | {
            i["source"] for i in ideas if i["id"] in missed and i.get("source")
        }
        if ai:
            try:
                with stage("verification"):
                    await check_support(self.llm, {"request": req.model_dump(), "lesson": lesson, "grading": out},
                                        text_units({"feedback": out.get("feedback", ""),
                                                    "misconceptions": out.get("misconceptions", [])}), sources, cited,
                                        model=self.tutor_model)
                with stage("source_recheck"):
                    latest = await source_snapshot(self.repository, lesson_ids)
                if any(latest.get(sid) != sources[sid] or latest.get(sid, {}).get("review_status") != "approved"
                       for sid in lesson_ids):
                    raise SupportFailure()
            except SupportFailure:
                return {"covered": [], "missed": idea_ids, "misconceptions": [],
                        "feedback": prompts.TEXT["unavailable"][lang], "sources": {}, "ai_generated": False}
        return {
            "covered": covered,
            "missed": missed,
            "misconceptions": misconceptions,
            "feedback": out.get("feedback", ""),
            "sources": source_views({sid: sources[sid] for sid in cited if sid in sources}),
            "ai_generated": ai,
        }
