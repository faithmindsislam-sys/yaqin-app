"""MemoryRepository storage implementation."""

from __future__ import annotations

import time
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

from app.domain.courses import DEFAULT_LEVELS, SUBJECTS, place_course, validate_classification
from app.domain.curriculum import apply_save, check_revision
from app.domain.errors import ApiError
from app.domain.lessons import (
    card_docs,
    check_owner,
    coming_soon_teasers,
    ensure_known_sources,
    is_live,
    lesson_summary,
    lesson_source_ids,
    tracks_with_lessons,
)
from app.domain.search import Hit
from app.domain.sources import passage_text

from .content_files import load_content
from .keyword_index import BM25


class MemoryRepository:
    kind = "memory"

    def __init__(self, content_dir: Path):
        self.content_dir = content_dir
        self.reload()
        self.subjects = deepcopy(SUBJECTS)
        self.levels = deepcopy(DEFAULT_LEVELS)
        self.config_revisions = {key: None for key in ("tracks", "subjects", "levels")}
        self.events: list[dict] = []
        self.logs: list[dict] = []
        self.roles: dict[str, str] = {}
        self.users: dict[str, dict] = {}
        self.admin_events: list[dict] = []
        self.progress: dict[tuple[str, str], dict] = {}
        self.budget_counters = {}
        self.model_usage = {}
        self.draft_jobs: dict[str, dict] = {}

    def reload(self) -> None:
        self.tracks, self.lessons, self.sources = load_content(self.content_dir)
        self.reload_index()

    async def list_tracks(self) -> list[dict]:
        return tracks_with_lessons(self.tracks, self.lessons)

    async def get_lesson(self, lesson_id: str, *, include_unpublished: bool = False) -> dict | None:
        lesson = self.lessons.get(lesson_id)
        if lesson and (include_unpublished or is_live(lesson)):
            return lesson
        return None

    async def completed_courses(self, user_id: str, track: str, *, exclude: str | None = None, limit: int = 3) -> list[dict]:
        # Persisted own progress only; notes, scores and other learners never enter model context.
        rows = [(progress["completed_at"], cid) for (uid, cid), progress in self.progress.items()
                if uid == user_id and progress.get("completed_at") and cid != exclude]
        return [deepcopy({k: self.lessons[cid].get(k) for k in ("id", "title", "summary")})
                for _, cid in sorted(rows, reverse=True)
                if cid in self.lessons and is_live(self.lessons[cid])
                and track in self.lessons[cid].get("tracks", [])][:min(limit, 3)]

    async def get_sources(self, ids: list[str]) -> dict[str, dict]:
        return deepcopy({i: self.sources[i] for i in ids if i in self.sources})

    async def search(self, query: str, *, k: int, embedding: list[float] | None = None) -> list[Hit]:
        results = self.index.search(query, k * 3)
        if not results:
            return []
        top = results[0][1] or 1.0
        best: dict[str, float] = {}
        # Lesson prose resolves to the sources it teaches from; the first one ranks highest.
        for doc_id, score, _hits in results:
            for rank, sid in enumerate(self.doc_sources[doc_id]):
                norm = round(score / top * (1 - 0.05 * rank), 4)
                best[sid] = max(best.get(sid, 0.0), norm)
        ranked = sorted(best, key=lambda i: -best[i])[:k]
        return [Hit(sid, best[sid], passage_text(self.sources[sid])) for sid in ranked]

    async def _set_lesson_status(self, lesson_id: str, status: str) -> bool:
        if lesson_id not in self.lessons:
            return False
        self.lessons[lesson_id] = {**self.lessons[lesson_id], "status": status}
        return True

    async def add_review_event(self, lesson_id: str, actor_id: str | None, kind: str, payload: dict) -> None:
        self.events.append(
            {
                "id": str(uuid.uuid4()),
                "lesson_id": lesson_id,
                "actor_id": actor_id,
                "kind": kind,
                "payload": payload,
                "created_at": time.time(),
            }
        )

    async def log_tutor(self, tier: str, citation_ids: list[str], latency_ms: int, track: str | None) -> None:
        self.logs.append({"tier": tier, "citation_ids": citation_ids, "latency_ms": latency_ms, "track": track})

    async def reserve_budget(self, user_id: str, tokens: int, settings, *, public: bool = False) -> bool:
        now = int(time.time())
        entries = [("day:service", now // 86400, tokens, settings.service_daily_tokens),
                   ("day:" + user_id, now // 86400, tokens, settings.user_daily_tokens),
                   ("minute:service", now // 60, 1, settings.service_rate_per_minute),
                   ("minute:" + user_id, now // 60, 1, settings.tutor_rate_per_minute)]
        if public:
            entries = [("minute:public:service", now // 60, 1, settings.public_api_service_rate_per_minute),
                       ("minute:public:" + user_id, now // 60, 1, settings.public_api_rate_per_minute)]
        if any(self.budget_counters.get((p, period), 0) + amount > cap for p, period, amount, cap in entries):
            raise ApiError(429, "quota_exceeded", "The model budget is temporarily exhausted.")
        for p, period, amount, _ in entries:
            self.budget_counters[p, period] = self.budget_counters.get((p, period), 0) + amount
        return True

    async def begin_model_usage(self, user_id: str, call_id: str, day: int) -> None:
        self.model_usage.setdefault(call_id, {"user_id": user_id, "period": day, "tokens": None})

    async def release_budget(self, user_id: str, tokens: int) -> None:
        if tokens <= 0:
            return
        now = int(time.time())
        for principal in ("day:service", "day:" + user_id):
            key = (principal, now // 86400)
            if key in self.budget_counters:
                self.budget_counters[key] = max(self.budget_counters[key] - tokens, 0)

    async def finish_model_usage(self, call_id: str, tokens: int, counts: dict | None = None) -> None:
        if self.model_usage[call_id]["tokens"] is None:
            self.model_usage[call_id]["tokens"] = tokens

    async def expire_draft_jobs(self, seconds: int) -> None:
        cutoff = datetime.now(timezone.utc).timestamp() - seconds
        for job in self.draft_jobs.values():
            if job["status"] == "running" and datetime.fromisoformat((job.get("result") or {}).get("_started_at", job["created_at"])).timestamp() < cutoff:
                await self.update_draft_job(job["id"], status="failed", stage="failed", error="generation_interrupted")

    async def get_role(self, user_id: str) -> str | None:
        if self.users.get(user_id, {}).get("disabled", False):
            return "disabled"
        return self.users[user_id]["role"] if user_id in self.users else self.roles.get(user_id)

    async def get_account(self, user_id: str) -> dict | None:
        user = self.users.get(user_id)
        return user and {"email": user.get("email"), "display_name": user.get("display_name")}

    async def search_users(
        self, query: str, *, role: str | None = None, status: str | None = None, page: int = 1, page_size: int = 10
    ) -> dict:
        users = [{"last_sign_in_at": None, "disabled": False, **u} for u in self.users.values()]
        counts = {"total": len(users), "disabled": sum(u["disabled"] for u in users)}
        counts.update({r: sum(u["role"] == r for u in users) for r in ("learner", "teacher", "admin", "super_admin")})
        rows = [
            u
            for u in users
            if (query.lower() in (u.get("email") or "").lower() or query.lower() in (u.get("display_name") or "").lower())
            and (role is None or u["role"] == role)
            and (status is None or u["disabled"] == (status == "disabled"))
        ]
        ordered = sorted(rows, key=lambda u: (u["created_at"], u["id"]), reverse=True)
        first = (page - 1) * page_size
        day = int(time.time()) // 86400
        def measured(user_id):
            calls = [r["tokens"] for r in self.model_usage.values() if r["user_id"] == user_id and r["period"] == day]
            known = [tokens for tokens in calls if tokens is not None]
            return {"daily_actual_tokens": sum(known),
                    "daily_usage_unknown_calls": calls.count(None),
                    "daily_calls": len(calls), "daily_input_tokens": 0, "daily_output_tokens": 0,
                    "daily_cache_read_tokens": 0, "daily_cache_write_tokens": 0,
                    "standalone_daily_actual_tokens": None, "standalone_daily_usage_unknown_calls": None,
                    "standalone_daily_calls": None, "standalone_daily_input_tokens": None,
                    "standalone_daily_output_tokens": None, "standalone_daily_cache_read_tokens": None,
                    "standalone_daily_cache_write_tokens": None}
        return {"items": [{**u, **measured(u["id"]), "daily_reserved_tokens": self.budget_counters.get(("day:" + u["id"], day), 0)}
                          for u in ordered[first : first + page_size]], "total": len(rows), "counts": counts}

    async def set_user_role(self, user_id: str, role: str, actor_id: str) -> None:
        if user_id not in self.users:
            raise ApiError(404, "not_found", "User not found.")
        old = self.users[user_id]["role"]
        # No awaits between the update and audit append: one atomic memory operation.
        self.users[user_id] = {**self.users[user_id], "role": role}
        self.roles[user_id] = role
        self.admin_events.append(
            {
                "id": str(uuid.uuid4()),
                "actor_id": actor_id,
                "target_id": user_id,
                "kind": "role_changed",
                "payload": {"from_role": old, "to_role": role},
                "created_at": time.time(),
            }
        )

    async def set_user_disabled(self, user_id: str, disabled: bool, actor_id: str) -> None:
        if user_id not in self.users:
            raise ApiError(404, "not_found", "User not found.")
        if self.users[user_id].get("disabled", False) == disabled:
            raise ApiError(409, "conflict", "This account is already in that state.")
        # No awaits between the update and audit append: one atomic memory operation.
        self.users[user_id] = {**self.users[user_id], "disabled": disabled}
        self.admin_events.append(
            {
                "id": str(uuid.uuid4()),
                "actor_id": actor_id,
                "target_id": user_id,
                "kind": "user_disabled" if disabled else "user_enabled",
                "payload": {},
                "created_at": time.time(),
            }
        )

    async def user_history(self, user_id: str) -> list[dict]:
        if user_id not in self.users:
            raise ApiError(404, "not_found", "User not found.")
        events = sorted(
            (e for e in self.admin_events if e.get("target_id") == user_id),
            key=lambda e: (e["created_at"], e["id"]),
            reverse=True,
        )
        return [
            {
                "id": e["id"], "kind": e["kind"], "payload": e["payload"], "actor_id": e["actor_id"],
                "actor_name": self.users.get(e["actor_id"], {}).get("display_name"),
                "actor_email": self.users.get(e["actor_id"], {}).get("email"),
                "created_at": datetime.fromtimestamp(e["created_at"], timezone.utc).isoformat(),
            }
            for e in events[:50]
        ]

    async def content_bundle(self) -> dict:
        return {
            "tracks": deepcopy(self.tracks),
            "subjects": deepcopy(self.subjects),
            "levels": deepcopy(self.levels),
            "lessons": {i: lesson for i, lesson in self.lessons.items() if is_live(lesson)},
            "coming_soon": coming_soon_teasers(self.lessons.values()),
            "sources": self.sources,
        }

    async def list_courses(self) -> list[dict]:
        return [lesson_summary(course) for course in self.lessons.values() if is_live(course)]

    def _touch_tracks(self) -> None:
        self.config_revisions["tracks"] = datetime.now(timezone.utc).isoformat()

    async def curriculum(self) -> dict:
        return deepcopy({"tracks": self.tracks, "subjects": self.subjects, "levels": self.levels,
                         "updated_at": self.config_revisions,
                         "courses": [{k: c[k] for k in ("id", "title", "subject", "level", "tracks", "status")}
                                     for c in self.lessons.values()]})

    async def save_curriculum(self, key, items, updated_at, actor_id, track_id=None) -> dict:
        check_revision(self.config_revisions, key, updated_at)
        config = deepcopy({"tracks": self.tracks, "subjects": self.subjects, "levels": self.levels})
        changed = apply_save(config, self.lessons, key, items, track_id)
        # No await during validation, mutation and audit: atomic in the memory store.
        self.tracks, self.subjects, self.levels = config["tracks"], config["subjects"], config["levels"]
        self.lessons.update(changed)
        now = datetime.now(timezone.utc).isoformat()
        self.config_revisions[key] = now
        if key == "levels":
            self.config_revisions["subjects"] = now
        self.admin_events.append({"actor_id": actor_id, "kind": "curriculum_saved",
                                  "payload": {"key": key, "track": track_id, "items": deepcopy(items)}})
        return await self.curriculum()

    async def staff_lessons(self, user_id: str | None, reviewer: bool) -> list[dict]:
        return [lesson for lesson in self.lessons.values() if reviewer or lesson.get("author_id") == user_id]

    async def save_draft(self, draft: dict, actor_id: str | None, reviewer: bool, *, job_id: str | None = None, job_result: dict | None = None, job_token: str | None = None) -> None:
        if job_id and (self.draft_jobs[job_id]["status"] != "running" or self.draft_jobs[job_id]["author_id"] != actor_id
                       or (job_token is not None and self.draft_jobs[job_id]["result"].get("_execution_token") != job_token)):
            raise ApiError(409, "generation_interrupted", "Generation was interrupted. Please try again.")
        old = self.lessons.get(draft["id"])
        if old and (old.get("status") == "published" or (not reviewer and old.get("author_id") != actor_id)):
            raise ApiError(403, "forbidden", "Only your unpublished drafts can be edited.")
        place_course(self.tracks, draft, self.subjects, self.levels)
        self._touch_tracks()
        self.lessons[draft["id"]] = {**draft, "status": "draft", "author_id": old.get("author_id") if old else actor_id}
        await self.add_review_event(draft["id"], actor_id, "updated" if old else "created", {})
        if job_id:
            await self.update_draft_job(job_id, status="done", stage="done", lesson_id=draft["id"], result=job_result)

    async def update_published(self, draft: dict, actor_id: str | None, *, expected_sources: dict | None = None) -> None:
        old = self.lessons.get(draft["id"])
        if not old or old.get("status") != "published":
            raise ApiError(409, "conflict", "Only published courses can be updated in place.")
        if expected_sources is not None and {sid: self.sources.get(sid) for sid in lesson_source_ids(draft)} != expected_sources:
            raise ApiError(409, "conflict", "Source evidence changed during checks. Try again.")
        ensure_known_sources(draft, self.sources)
        place_course(self.tracks, draft, self.subjects, self.levels)
        self._touch_tracks()
        self.lessons[draft["id"]] = {**draft, "status": "published", "author_id": old.get("author_id")}
        await self.add_review_event(draft["id"], actor_id, "updated", {})
        self.reload_index()

    async def lesson_history(self, lesson_id: str) -> list[dict]:
        return [
            {
                "id": e["id"],
                "kind": e["kind"],
                "payload": e["payload"],
                "actor_id": e["actor_id"],
                "actor_name": self.users.get(e["actor_id"], {}).get("display_name"),
                "actor_email": self.users.get(e["actor_id"], {}).get("email"),
                "created_at": datetime.fromtimestamp(e["created_at"], timezone.utc).isoformat(),
            }
            for e in reversed(self.events)
            if e["lesson_id"] == lesson_id
        ]

    async def archive_lesson(self, lesson_id: str, actor_id: str | None, reviewer: bool) -> None:
        lesson = self.lessons.get(lesson_id)
        if not lesson:
            raise ApiError(404, "not_found", "Course not found.")
        check_owner(lesson, actor_id, reviewer)
        if lesson["status"] == "archived":
            raise ApiError(409, "conflict", "This course is already archived.")
        await self._set_lesson_status(lesson_id, "archived")
        await self.add_review_event(lesson_id, actor_id, "archived", {})
        self.reload_index()

    async def transition_lesson(
        self,
        lesson_id: str,
        actor_id: str | None,
        kind: str,
        note: str = "",
        *,
        reviewer: bool = False,
        expected: dict | None = None,
        expected_sources: dict | None = None,
    ) -> str:
        lesson = self.lessons.get(lesson_id)
        if not lesson:
            raise ApiError(404, "not_found", "Course not found.")
        if expected is not None and lesson != expected:
            raise ApiError(409, "conflict", "The course changed during checks. Try again.")
        if kind != "submit" and not reviewer:
            raise ApiError(403, "forbidden", "An admin must review this course.")
        if kind == "submit" and ((not reviewer and lesson.get("author_id") != actor_id) or lesson["status"] != "draft"):
            raise ApiError(403, "forbidden", "Only the author or an admin can submit a draft.")
        if kind != "submit" and lesson["status"] != "in_review":
            raise ApiError(409, "conflict", "The course must be in review first.")
        if kind == "approve":
            if expected_sources is not None and {sid: self.sources.get(sid) for sid in lesson_source_ids(lesson)} != expected_sources:
                raise ApiError(409, "conflict", "Source evidence changed during checks. Try again.")
            ensure_known_sources(lesson, self.sources)
            validate_classification(lesson, self.tracks, self.subjects, self.levels)
        status = {"submit": "in_review", "approve": "published", "request_changes": "draft"}[kind]
        await self._set_lesson_status(lesson_id, status)
        await self.add_review_event(
            lesson_id, actor_id, kind, {"note": note, "reviewed": reviewer} if kind == "approve" else {"note": note}
        )
        if kind == "approve":
            place_course(self.tracks, lesson, self.subjects, self.levels)
            self._touch_tracks()
        self.reload_index()
        return status

    def reload_index(self) -> None:
        lessons, sources = self.lessons, self.sources
        docs = {sid: passage_text(s) for sid, s in sources.items() if s.get("review_status") == "approved"}
        self.doc_sources = {sid: [sid] for sid in docs}
        for lesson in lessons.values():
            if is_live(lesson):
                for doc_id, content, ids in card_docs(lesson):
                    known = [i for i in ids if i in sources and sources[i].get("review_status") == "approved"]
                    if known:
                        docs[doc_id] = content
                        self.doc_sources[doc_id] = known
        self.index = BM25(docs)

    async def unpublish_lesson(self, lesson_id: str, actor_id: str | None, reviewer: bool) -> None:
        lesson = self.lessons.get(lesson_id)
        if not lesson:
            raise ApiError(404, "not_found", "Course not found.")
        check_owner(lesson, actor_id, reviewer)
        if lesson["status"] != "published":
            raise ApiError(409, "conflict", "Only published courses can be hidden.")
        await self._set_lesson_status(lesson_id, "draft")
        await self.add_review_event(lesson_id, actor_id, "unpublish", {})
        self.reload_index()

    async def delete_lesson(self, lesson_id: str, actor_id: str | None, reviewer: bool) -> None:
        lesson = self.lessons.get(lesson_id)
        if not lesson:
            raise ApiError(404, "not_found", "Course not found.")
        check_owner(lesson, actor_id, reviewer)
        if any(key[1] == lesson_id for key in self.progress):
            raise ApiError(
                409, "has_progress", "Learners have progress on this course. Archive it instead of deleting it."
            )
        for track in self.tracks:
            for module in track["modules"]:
                module["lessons"] = [i for i in module["lessons"] if i != lesson_id]
        self._touch_tracks()
        del self.lessons[lesson_id]
        self.events = [e for e in self.events if e["lesson_id"] != lesson_id]
        self.admin_events.append(
            {"actor_id": actor_id, "kind": "lesson_deleted", "payload": {"id": lesson_id, "title": lesson["title"]}}
        )
        self.reload_index()

    async def pending_sources(self) -> list[dict]:
        return [s for s in self.sources.values() if s.get("review_status") == "pending"]

    async def add_source(self, source: dict) -> dict:
        return self.sources.setdefault(source["id"], source)

    async def approve_source(self, source_id: str, actor_id: str | None) -> None:
        if source_id not in self.sources:
            raise ApiError(404, "not_found", "Source not found.")
        self.sources[source_id] = {**self.sources[source_id], "review_status": "approved"}
        self.reload_index()

    # ---- Studio AI draft jobs -------------------------------------------------
    async def create_draft_job(self, author_id: str | None, prompt: str, lang: str, *, track: str | None = None, seconds: int = 480) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        job = {
            "id": str(uuid.uuid4()), "author_id": author_id, "prompt": prompt, "lang": lang,
            "status": "running", "stage": "queued", "attempt": 0, "result": {"track": track, "_seconds": seconds},
            "lesson_id": None, "error": None, "created_at": now, "updated_at": now,
        }
        self.draft_jobs[job["id"]] = job
        return dict(job)

    async def update_draft_job(self, job_id: str, *, expected_token: str | None = None, **fields) -> bool:
        job = self.draft_jobs.get(job_id)
        if job is None or job["status"] != "running" or (expected_token is not None and (job.get("result") or {}).get("_execution_token") != expected_token):
            return False
        allowed = {"status", "stage", "attempt", "result", "lesson_id", "error"}
        job.update({k: v for k, v in fields.items() if k in allowed})
        job["updated_at"] = datetime.now(timezone.utc).isoformat()
        return True

    async def claim_draft_job(self, job_id: str, author_id: str, updated_at: str, result: dict) -> bool:
        job = self.draft_jobs.get(job_id)
        if not job or job["author_id"] != author_id or job["status"] != "failed" or job["updated_at"] != updated_at:
            return False
        job.update(status="running", stage="queued", result=deepcopy(result), error=None,
                   updated_at=datetime.now(timezone.utc).isoformat())
        return True

    async def get_draft_job(self, job_id: str) -> dict | None:
        job = self.draft_jobs.get(job_id)
        return dict(job) if job else None

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        pass
