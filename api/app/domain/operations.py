"""One operation deadline and conservative reservations; estimates never masquerade as usage."""
import asyncio
import inspect
import json
import logging
import time
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from functools import wraps
from uuid import uuid4

from app.domain.errors import ApiError

log = logging.getLogger(__name__)
SETTINGS = None


def configure(settings):
    global SETTINGS
    SETTINGS = settings


CURRENT = ContextVar("operation_budget", default=None)
STAGE = ContextVar("operation_stage", default=None)


def caps(kind):
    s = SETTINGS
    if s is None:
        return {"tutor": (55, 200000, 4), "review": (180, 800000, 12), "course": (480, 3000000, 32)}[kind]
    if kind == "course":
        return s.course_seconds, s.course_tokens, s.course_model_calls
    if kind == "review":
        return s.review_seconds, s.review_tokens, s.review_model_calls
    return s.tutor_seconds, s.tutor_tokens, s.tutor_model_calls


def exceeded():
    return ApiError(503, "operation_budget_exceeded", "The operation could not complete within its limits.")


@dataclass
class Budget:
    deadline: float
    token_limit: int
    call_limit: int
    reserved_tokens: int = 0
    model_calls: int = 0
    assessments: int = 0
    assessment_cache: set[tuple] = field(default_factory=set)
    actual_tokens: int = 0
    usage_calls: int = 0
    track: str | None = None
    kind: str | None = None
    embedding_calls: int = 0
    remote_calls: int = 0
    operation_id: str = field(default_factory=lambda: uuid4().hex)
    limit_reason: str | None = None
    repository: object | None = None
    user_id: str | None = None
    agent: str | None = None
    mode: str | None = None

    def remaining(self):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            self.limit_reason = "deadline"
            raise exceeded()
        return remaining

    def reserve(self, value, output_tokens, *, calls=1, kind="model"):
        self.remaining()
        estimate = len(json.dumps(value, ensure_ascii=False, default=str).encode()) + output_tokens + 2048
        # Tutor's cap covers LLM work; retain the existing cumulative course/review ceiling.
        charged = 0 if kind == "embedding" and self.kind == "tutor" else calls
        if self.model_calls + charged > self.call_limit or self.reserved_tokens + estimate > self.token_limit:
            self.limit_reason = "calls" if self.model_calls + charged > self.call_limit else "tokens"
            raise exceeded()
        self.model_calls += charged
        if kind == "embedding":
            self.embedding_calls += calls
        elif kind == "remote":
            self.remote_calls += calls
        self.reserved_tokens += estimate

    def usage(self, input_tokens, output_tokens, cache_read=0, cache_write=0):
        """Returns the provider-reported counts, or None when any count is missing."""
        values = (input_tokens, output_tokens, 0 if cache_read is None else cache_read,
                  0 if cache_write is None else cache_write)
        if all(type(v) is int and v >= 0 for v in values):
            self.actual_tokens += sum(values)
            self.usage_calls += 1
            return {"tokens": sum(values), "input_tokens": values[0], "output_tokens": values[1],
                    "cache_read_tokens": values[2], "cache_write_tokens": values[3]}
        return None

    async def begin_usage(self):
        if self.repository is not None and self.user_id:
            call_id = uuid4().hex
            with stage("usage_start"):
                await self.repository.begin_model_usage(self.user_id, call_id, int(time.time()) // 86400)
            return call_id

    async def finish_usage(self, call_id, tokens):
        if call_id and tokens is not None:
            counts = tokens if isinstance(tokens, dict) else {"tokens": tokens}
            with stage("usage_finish"):
                await self.repository.finish_model_usage(call_id, counts["tokens"], counts)


_RELEASES: set = set()


def _release(repository, user_id, tokens):
    """Detached: an operation must never fail or wait because a refund is slow."""
    async def run():
        try:
            await repository.release_budget(user_id, tokens)
        except Exception as exc:  # noqa: BLE001  accounting must not break a reply
            log.warning("budget release failed: %s", type(exc).__name__)
    try:
        task = asyncio.ensure_future(run())
    except RuntimeError:
        return
    _RELEASES.add(task)
    task.add_done_callback(_RELEASES.discard)


def diagnostic(event, **fields):
    """Metadata only: never pass prompts, answers, tokens/credentials or user identities."""
    budget = CURRENT.get()
    log.info("diagnostic %s", json.dumps({"event": event, "service": "yaqin", "version": 1,
        "operation_id": budget.operation_id if budget else None,
        "agent": budget.agent if budget else None, "kind": budget.kind if budget else None,
        "track": budget.track if budget else None, "mode": budget.mode if budget else None,
        "stage": STAGE.get(), **fields}))


@contextmanager
def stage(name, **fields):
    started = time.monotonic()
    status = "failed"
    parent = STAGE.get()
    token = STAGE.set(name)
    diagnostic("stage_started", parent_stage=parent, **fields)
    try:
        yield fields
        status = "completed"
    except BaseException as exc:
        fields["error_type"] = type(exc).__name__
        fields["reason"] = getattr(exc, "reason", None) if type(exc).__name__ == "SupportFailure" else None
        raise
    finally:
        diagnostic("operation_stage", parent_stage=parent, status=status,
                   latency_ms=round((time.monotonic() - started) * 1000), **fields)
        STAGE.reset(token)


def bounded(kind):
    def decorate(fn):
        signature = inspect.signature(fn)
        @wraps(fn)
        async def run(*args, **kwargs):
            if CURRENT.get() is not None:
                return await fn(*args, **kwargs)
            seconds, tokens, calls = caps(kind)
            started = time.monotonic()
            budget = Budget(started + seconds, tokens, calls)
            budget.kind = kind
            bound = signature.bind(*args, **kwargs).arguments
            budget.repository = getattr(args[0], "repository", None) if args else None
            budget.user_id = bound.get("user_id") or getattr(bound.get("user"), "id", None)
            track = getattr(args[1], "track", kwargs.get("track")) if len(args) > 1 else kwargs.get("track")
            budget.track = track if track in ("explore", "first-steps", "deepen", "mixed") else None
            req = bound.get("req")
            budget.agent = ("Mariam" if getattr(req, "lesson_id", None) else {
                "explore": "Rayen", "first-steps": "Khaled", "deepen": "Ibrahim",
            }.get(budget.track, "Yaqin")) if kind == "tutor" else "Hassan" if kind == "course" else "reviewer"
            budget.mode = fn.__name__
            token = CURRENT.set(budget)
            status = "failed"
            diagnostic("operation_started", seconds_limit=seconds, token_limit=tokens, call_limit=calls)
            try:
                async with asyncio.timeout(seconds):
                    result = await fn(*args, **kwargs)
                    status = "completed"
                    return result
            except TimeoutError:
                budget.limit_reason = "deadline"
                raise exceeded() from None
            finally:
                # An operation holds its whole token cap up front. Give back what it did not
                # use, so a day's allowance tracks real consumption instead of the worst case.
                measured = budget.usage_calls == budget.model_calls + (
                    budget.embedding_calls if kind == "tutor" else 0)
                unused = tokens - budget.actual_tokens if measured else 0
                if unused > 0 and budget.repository is not None and budget.user_id:
                    _release(budget.repository, budget.user_id, unused)
                diagnostic("operation", status=status, limit_reason=budget.limit_reason,
                    released_tokens=unused if unused > 0 else None,
                    latency_ms=round((time.monotonic() - started) * 1000),
                    model_calls=budget.model_calls, embedding_calls=budget.embedding_calls,
                    remote_calls=budget.remote_calls, reserved_tokens=budget.reserved_tokens,
                    actual_tokens=budget.actual_tokens if budget.usage_calls == budget.model_calls + (
                        budget.embedding_calls if kind == "tutor" else 0) else None,
                    assessments=budget.assessments)
                CURRENT.reset(token)
        return run
    return decorate
