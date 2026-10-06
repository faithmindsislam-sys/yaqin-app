"""Lesson authoring, scholarly review and curriculum use cases."""

import asyncio
import logging
import re
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from app.agents.course.agent import MAX_ATTEMPTS, CourseAgent
from app.agents.review.agent import ReviewAgent
from app.contracts.lesson import LessonDraft
from app.domain.audience import Track, audience_instructions
from app.domain.courses import validate_classification
from app.domain.errors import ApiError
from app.domain.lessons import ensure_known_sources, lesson_source_ids
from app.domain.operations import CURRENT, bounded, caps
from app.domain.users import User, has_role
from app.gateways.quran_gateway import QuranGateway
from app.repositories.repository import Repository

log = logging.getLogger(__name__)


# Running draft jobs. Held so asyncio does not garbage-collect a task before it finishes.
_BACKGROUND: set[asyncio.Task] = set()
# A running job that has not reported progress for this long was lost to a restart.
STALE_AFTER = timedelta(seconds=570)
MAX_EXECUTIONS = 3
RESUMABLE_ERRORS = {"generation_interrupted", "generation_failed", "operation_budget_exceeded", "review_unavailable"}
# Crash-safe upper bounds per stage; the live Budget enforces these reservations.
STAGE_ALLOWANCE = {"sources": (1, 200000), "writing": (2, 800000)}


def _is_stale(updated_at: str | None) -> bool:
    if not updated_at:
        return False
    try:
        ts = datetime.fromisoformat(updated_at)
    except ValueError:
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - ts > STALE_AFTER


def _reason_code(code):
    return code if code in {"no_sources", "safety_blocked", "safety_unavailable", "source_support_rejected",
                           "source_changed", "generation_interrupted", "generation_failed", "operation_budget_exceeded", "review_unavailable"} else "generation_failed" if code else None


def _safe_reason(code, lang):
    messages = {
        "no_sources": ("No approved sources matched this topic.", "لم تُوجد مصادر معتمدة تناسب هذا الموضوع."),
        "safety_blocked": ("This course cannot be generated safely.", "لا يمكن إنشاء هذه الدورة بأمان."),
        "source_support_rejected": ("Source support could not be established.", "تعذّر التحقق من دعم المصادر."),
        "source_changed": ("Source evidence changed. Please try again.", "تغيّرت أدلة المصادر. يُرجى المحاولة مجددًا."),
        "generation_interrupted": ("Generation was interrupted. Please try again.", "انقطع الإنشاء. يُرجى المحاولة مجددًا."),
    }
    if not code:
        return None
    return messages.get(code, ("Generation could not complete. Please try again.", "تعذّر إكمال الإنشاء. يُرجى المحاولة مجددًا."))[lang == "ar"]


class LessonService:
    def __init__(self, repository: Repository, reviewer: ReviewAgent, quran: QuranGateway, author: CourseAgent, *, course_seconds: int = 480):
        self.repository = repository
        self.reviewer = reviewer
        self.quran = quran
        self.author = author
        self.course_seconds = course_seconds

    async def _sources(self, ids):
        try:
            return deepcopy(await self.repository.get_sources(ids))
        except Exception:
            raise ApiError(503, "source_support_unavailable", "Source support is temporarily unavailable.") from None

    # ---- Studio "Generate with AI": background job with live status ----------------
    async def start_draft(self, prompt: str, lang: str, user: User, *, track: Track | None = None) -> dict:
        """Register a job and return its id at once; the work runs in the background so the
        request never waits on the model (the CDN would time it out)."""
        if not isinstance(prompt, str) or not prompt.strip():
            raise ApiError(400, "bad_request", "A prompt describing the course is required.")
        audience_instructions(track)
        job = await self.repository.create_draft_job(user.id, prompt.strip(), lang, track=track, seconds=self.course_seconds)
        result = {**(job.get("result") or {}), "_execution": 1, "_execution_token": uuid4().hex,
                  "_started_at": datetime.now(timezone.utc).isoformat()}
        await self.repository.update_draft_job(job["id"], result=result)
        self._launch_draft(job["id"], prompt.strip(), lang, user, result["_execution_token"])
        return {"job_id": job["id"], "status": "running", "stage": "queued"}

    def _launch_draft(self, job_id: str, prompt: str, lang: str, user: User, execution_token: str) -> None:
        task = asyncio.create_task(self._run_draft_job(job_id, prompt, lang, user, execution_token=execution_token))
        _BACKGROUND.add(task)  # keep a reference so the task is not garbage-collected mid-run
        def finished(task):
            _BACKGROUND.discard(task)
            if not task.cancelled() and task.exception():
                log.warning("draft_job_terminal_failure")
        task.add_done_callback(finished)

    def _resumable(self, job: dict) -> bool:
        result = job.get("result") or {}
        _, tokens, calls = caps("course")
        budget = result.get("_budget") or {}
        return bool(job["status"] == "failed" and job.get("error") in RESUMABLE_ERRORS
                    and result.get("_checkpoint") and result.get("_execution", 1) < MAX_EXECUTIONS
                    and budget.get("calls", 0) < calls and budget.get("tokens", 0) < tokens)

    async def resume_draft(self, job_id: str, user: User) -> dict:
        await self.repository.expire_draft_jobs(self.course_seconds + 30)
        job = await self.repository.get_draft_job(job_id)
        # Admin read access does not allow resuming another author's generation/spend.
        if not job or job.get("author_id") != user.id:
            raise ApiError(404, "not_found", "Draft job not found.")
        if job["status"] in {"running", "done"}:
            return {"job_id": job_id, "status": job["status"], "stage": job["stage"]}
        if not self._resumable(job):
            raise ApiError(409, "generation_not_resumable", "This generation cannot be resumed. Start a new draft.")
        result = deepcopy(job["result"])
        result.update(_execution=result.get("_execution", 1) + 1, _execution_token=uuid4().hex,
                      _started_at=datetime.now(timezone.utc).isoformat())
        claimed = await self.repository.claim_draft_job(job_id, user.id, job["updated_at"], result)
        if claimed:
            self._launch_draft(job_id, job["prompt"], job["lang"], user, result["_execution_token"])
        latest = await self.repository.get_draft_job(job_id)
        return {"job_id": job_id, "status": latest["status"], "stage": latest["stage"]}

    async def get_draft_job(self, job_id: str, user: User) -> dict:
        job = await self.repository.get_draft_job(job_id)
        if not job or (job.get("author_id") != user.id and not has_role(user, "admin")):
            raise ApiError(404, "not_found", "Draft job not found.")
        await self.repository.expire_draft_jobs(self.course_seconds + 30)
        job = await self.repository.get_draft_job(job_id)
        result = job.get("result") or {}
        return {
            "job_id": job["id"], "status": job["status"], "stage": job["stage"], "attempt": job["attempt"],
            "max_attempts": MAX_ATTEMPTS, "resumable": self._resumable(job),
            "execution": result.get("_execution", 1), "max_executions": MAX_EXECUTIONS, "created_at": job["created_at"], "updated_at": job["updated_at"],
            "lesson_id": job.get("lesson_id"), "lesson": result.get("lesson"), "review": result.get("review"),
            "reason": _safe_reason(result.get("reason") or job.get("error"), job.get("lang", "en")),
            "reason_code": _reason_code(result.get("reason") or job.get("error")), "track": result.get("track"),
        }

    @bounded("course")
    async def _run_draft_job(self, job_id: str, prompt: str, lang: str, user: User, *, execution_token: str | None = None) -> None:
        job = await self.repository.get_draft_job(job_id)
        if not job or job["status"] != "running" or (execution_token is not None and (job.get("result") or {}).get("_execution_token") != execution_token):
            return
        result = deepcopy(job.get("result") or {})
        token = result.get("_execution_token")
        track = result.get("track")
        budget = CURRENT.get()
        _, total_tokens, total_calls = caps("course")
        saved_budget = result.get("_budget") or {}
        budget.reserved_tokens = saved_budget.get("tokens", 0)
        budget.model_calls = saved_budget.get("calls", 0)
        budget.track = track

        async def write(**fields):
            if not await self.repository.update_draft_job(job_id, expected_token=token, **fields):
                raise ApiError(409, "generation_interrupted", "Generation was interrupted.")

        def usage():
            return {"tokens": budget.reserved_tokens, "calls": budget.model_calls}

        async def progress(stage: str, attempt: int) -> None:
            allowance_calls, allowance_tokens = STAGE_ALLOWANCE.get(stage, (0, 0))
            budget.call_limit = min(total_calls, budget.model_calls + allowance_calls)
            budget.token_limit = min(total_tokens, budget.reserved_tokens + allowance_tokens)
            # Persist potential in-flight spend before the provider call. A killed process
            # cannot return its actual usage, so resumption retains this conservative charge.
            result["_budget"] = {"calls": budget.call_limit, "tokens": budget.token_limit}
            await write(stage=stage, attempt=attempt, result=deepcopy(result))

        async def checkpoint(state: dict):
            result["_checkpoint"] = state
            result["_budget"] = usage()
            await write(result=deepcopy(result))

        try:
            out = await self.author.draft(prompt, lang=lang, track=track, progress=progress,
                                          resume=result.get("_checkpoint"), checkpoint=checkpoint)
            lesson = out.get("lesson")
            if not lesson:
                code = out.get("reason_code", "generation_failed")
                status = "no_sources" if code == "no_sources" else "failed"
                # Safety/evidence rejection is terminal and clears private generated prose.
                await write(status=status, stage=status,
                            result={"track": track, "lesson": None, "review": out.get("review"), "reason": code,
                                    "_execution": result.get("_execution", 1)}, error=code)
                return
            budget.call_limit, budget.token_limit = total_calls, total_tokens
            await write(stage="saving")
            await self._save_generated(lesson, prompt, user, job_id=job_id, track=track,
                                       job_token=token)
        except asyncio.CancelledError:
            result["_budget"] = usage()
            await write(status="failed", stage="failed", result=result, error="generation_interrupted")
            raise
        except Exception as exc:
            log.warning("draft_job_failed")
            result["_budget"] = usage()
            code = exc.code if isinstance(exc, ApiError) and exc.code == "operation_budget_exceeded" else "generation_failed"
            await write(status="failed", stage="failed", result=result, error=code)

    async def _save_generated(self, lesson: dict, prompt: str, user: User, *, job_id: str, track, job_token: str | None = None) -> dict:
        """Save the generated lesson as a draft owned by the teacher, so it appears in their
        Studio list. Placement defaults are editable in the editor."""
        # The lesson schema requires every card to cite a source.
        cards = [c for c in lesson.get("cards", []) if c.get("sources")]
        if not cards:
            raise ApiError(422, "no_sourced_cards", "The draft had no cards backed by approved sources.")
        title = lesson.get("title") or {"en": prompt[:120], "ar": ""}
        base = re.sub(r"[^a-z0-9]+", "-", (title.get("en") or prompt).lower()).strip("-")[:60] or "ai-draft"
        tracks = await self.repository.list_tracks()
        draft = {
            **{k: v for k, v in lesson.items() if k in ("title", "summary", "quiz", "audience_track")},
            "id": f"{base}-{job_id}",
            "tracks": [track] if track else (lesson.get("tracks") or [t["id"] for t in tracks])[:1], "subject": lesson.get("subject", "islam"), "level": lesson.get("level", 1), "minutes": 10,
            "status": "draft", "cards": cards,
        }
        draft = LessonDraft.model_validate(draft).model_dump(exclude_none=True)
        job = await self.repository.get_draft_job(job_id)
        execution = (job.get("result") or {}).get("_execution", 1)
        await self.save_draft(draft, user, job_id=job_id,
                              job_result={"track": track, "lesson": draft, "review": None, "reason": None, "_execution": execution},
                              job_token=job_token)
        return draft

    @bounded("review")
    async def check(self, draft: dict[str, Any], user: User | None = None) -> dict:
        if not isinstance(draft.get("cards"), list) or not all(isinstance(c, dict) for c in draft["cards"]):
            raise ApiError(400, "bad_request", "A course draft needs a 'cards' list of objects.")
        # Unsaved drafts have no lesson row to attach a foreign-key review event to.
        # Manual and edited candidates receive the same complete source support review.
        return await self.reviewer.check(draft, ai=False)

    async def staff_lessons(self, user: User) -> list[dict]:
        return await self.repository.staff_lessons(user.id, has_role(user, "admin"))

    async def history(self, lesson_id: str, user: User) -> list[dict]:
        if not any(lesson["id"] == lesson_id for lesson in await self.staff_lessons(user)):
            raise ApiError(404, "not_found", "Course not found.")
        return await self.repository.lesson_history(lesson_id)

    @bounded("review")
    async def save_draft(self, draft: dict, user: User, *, live: bool = False, job_id: str | None = None, job_result: dict | None = None, job_token: str | None = None) -> dict:
        """Saves an unpublished draft. With `live`, an admin replaces a published course in place:
        the course stays published the whole time."""
        config = await self.repository.curriculum()
        validate_classification(draft, config["tracks"], config["subjects"], config["levels"])
        ids = lesson_source_ids(draft)
        sources = await self._sources(ids)
        if any(sid not in sources for sid in ids):
            raise ApiError(400, "bad_request", "The draft cites an unknown source.")
        # Preserve existing credits and add the saving account's email, ignoring editor-supplied credits.
        old = await self.repository.get_lesson(draft["id"], include_unpublished=True)
        if live and (old or {}).get("status") != "published":
            raise ApiError(409, "conflict", "Only published courses can be updated in place.")
        account = (await self.repository.get_account(user.id) if user.id else None) or {}
        names = [name for name in (old or {}).get("contributors") or [] if name != account.get("display_name")]
        email = account.get("email")
        if email and email not in names and len(names) < 20:
            names.append(email)
        draft.pop("contributors", None)
        if names:
            draft["contributors"] = names
        # Coming soon is a course setting only an admin changes; any other save keeps the stored choice.
        was_soon = bool((old or {}).get("coming_soon"))
        soon = draft.pop("coming_soon", None)
        if soon is None or not has_role(user, "admin"):
            soon = was_soon
        if soon:
            draft["coming_soon"] = True
        if live:
            await self.repository.update_published(draft, user.id, expected_sources=sources)
        else:
            await self.repository.save_draft(draft, user.id, has_role(user, "admin"), job_id=job_id, job_result=job_result, job_token=job_token)
        if soon != was_soon:
            await self.repository.add_review_event(
                draft["id"], user.id, "coming_soon" if soon else "coming_soon_removed", {}
            )
        return {"lesson_id": draft["id"], "status": "published" if live else "draft", "contributors": names, "issues": []}

    @bounded("review")
    async def submit(self, lesson_id: str, user: User) -> dict:
        reviewer = has_role(user, "admin")
        draft = next((lesson for lesson in await self.staff_lessons(user) if lesson["id"] == lesson_id), None)
        if draft is None:
            raise ApiError(403, "forbidden", "Only the author or an admin can submit a draft.")
        ensure_known_sources(draft, await self._sources(lesson_source_ids(draft)))
        status = await self.repository.transition_lesson(
            lesson_id, user.id, "submit", reviewer=reviewer, expected=draft
        )
        return {"lesson_id": lesson_id, "status": status}

    async def queue(self, user: User) -> list[dict]:
        return [lesson for lesson in await self.staff_lessons(user) if lesson["status"] == "in_review"]

    async def quran_source(self, surah: int, ayah: int) -> dict:
        source = await asyncio.to_thread(self.quran.ayah_source, surah, ayah)
        if source is None:
            raise ApiError(404, "not_found", "The Quran has no such verse.")
        return await self.repository.add_source(source)

    @bounded("review")
    async def decide(self, lesson_id: str, decision: str, note: str, user: User) -> dict:
        if not has_role(user, "admin"):
            raise ApiError(403, "forbidden", "An admin must review this course.")
        draft = None
        reviewed_sources = None
        if decision == "approve":
            draft = await self.repository.get_lesson(lesson_id, include_unpublished=True)
            if draft is None:
                raise ApiError(404, "not_found", "Course not found.")
            reviewed_sources = await self._sources(lesson_source_ids(draft))
        status = await self.repository.transition_lesson(
            lesson_id, user.id, decision, note, reviewer=True, expected=draft, expected_sources=reviewed_sources
        )
        return {"lesson_id": lesson_id, "status": status}

    async def archive(self, lesson_id: str, user: User) -> dict:
        await self.repository.archive_lesson(lesson_id, user.id, has_role(user, "admin"))
        return {"lesson_id": lesson_id, "status": "archived"}

    async def unpublish(self, lesson_id: str, user: User) -> dict:
        await self.repository.unpublish_lesson(lesson_id, user.id, has_role(user, "admin"))
        return {"lesson_id": lesson_id, "status": "draft"}

    async def delete(self, lesson_id: str, user: User) -> dict:
        await self.repository.delete_lesson(lesson_id, user.id, has_role(user, "admin"))
        return {"lesson_id": lesson_id, "deleted": True}

    async def pending_sources(self) -> list[dict]:
        return await self.repository.pending_sources()

    async def approve_source(self, source_id: str, user: User) -> dict:
        await self.repository.approve_source(source_id, user.id)
        return {"source_id": source_id, "review_status": "approved"}
