# Learner audience context

Implemented locally on 5 October 2026 as the second production-readiness step. Runtime moderation and source checks remain in place. No commits, deployments, live database writes or live model calls were made.

Each independently packaged repo has a small server-owned audience helper. Validated `explore`, `first-steps` or `deepen` selects exactly one set of system instructions. It changes explanation, vocabulary and depth only; safety, source requirements and output schemas remain the same. Explore assumes no Islamic vocabulary or accepted belief; First Steps offers patient, manageable teaching; Deepen answers directly with depth and skips familiar basics unless explicitly requested. Relevant advanced terms still get a short explanation. All audiences receive honest, gentle prose, respect for other religions, no pressure/guilt/stereotypes and natural English/Modern Standard Arabic composed from original-language evidence.

YAQIN Ask now sends the explicit `track` to remote Ask, alongside its existing free-text context. Local answers and remote answers both select server instructions from that validated field. Context strings, course membership and difficulty cannot override it. Remote failures retain the same field during local fallback. Standalone Ask also shares the existing evidence/trust and safety instructions used by lesson jobs; the tutor keeps its citation-marker/tool contract.

`ExplainRequest.track` is optional and validated. Explain-back feedback gets the actual supplied track in its system prompt. Missing/null track is non-assuming, even when a course has one track. The frontend `explainBack` client forwards a supplied selected track and explicitly sends null for legacy callers. **There is no active explain-back UI/call site in the current course player**: it was removed before this task, and legacy explain links go to the quiz. This change preserves that product decision; it does not restore the activity or make new recording/privacy promises. An eventual restored activity must call this client with the selected learner track.

Studio's generation form requires an explicit track choice with no preselected religious identity. The existing request accepts optional `track` for legacy callers. Job creation atomically stores it in the existing `draft_jobs.result` JSON; the runner reads that stored value rather than deriving it from topic or level, and completion/empty-result updates retain it. **No database migration is needed.** Generated courses retain `audience_track` (`explore`, `first-steps`, `deepen`, or `mixed`) through save, retrieval and the course editor. The editor shows it separately from classification. Changing this metadata does not rewrite existing course prose; staff must adapt the content before publication.

For a generated multi-track course, the explicitly chosen writing audience governs drafting and review, while appropriate model-proposed membership is preserved and includes that audience. Membership is independent of subject/difficulty. Legacy calls without an audience use non-assuming mixed instructions; an absent/invalid generated membership falls back to all tracks rather than silently selecting Explore. Older manually authored courses with no `audience_track` use their sole classification track for staff review, or mixed context if they have multiple/no tracks. Explicit `mixed` takes precedence. Review caches include audience metadata, so changing audience cannot reuse the prior AI review.

Standalone lesson jobs keep their existing validated optional track in durable request params and worker claims. Both drafting and judging append the selected audience instructions to their distinct system roles. Missing track uses mixed context; it is never inferred from level. These lessons remain single-language and retain the existing staff-notes/lesson envelope. Studio courses remain bilingual.

## Validation

Focused offline regressions exercise English/Arabic local tutor and explain-back requests, remote payloads and local fallback, missing/invalid track, Studio generation/review/cache, request-to-job-to-saved-course propagation, real standalone Bedrock call arguments for both roles, and standalone persisted Postgres job/worker propagation. Tests use supplied fake model outputs; they establish plumbing, not live response quality. YAQIN's Postgres repository was additionally tested in a disposable local cluster using the existing migration: all three tracks and null survived pool reconnection and final job updates.

Local results: YAQIN **333 passed, one reserved pre-existing citation failure**; FaithMinds **93 passed**, including **23 isolated TLS Postgres cases**. Touched Python/TypeScript/test lint and whitespace checks pass. Studio/auth/client-forwarding checks pass. The added actual-browser regression passes desktop/mobile English/Arabic with explicit audience selection, request-body checks and retained saved metadata, plus the existing lifecycle/outage cases.

The reserved `test_agent_answer_forwards_the_learner_jwt_and_cites_library_passages` source-revalidation failure remains unchanged. No source checks or review labels were weakened. Current workspace TypeScript verification is blocked by concurrent edits to `web/src/features/compare/{model,strings}.ts` and related Compare types outside this patch. A temporary copy of the audience frontend using Compare files from `HEAD` passes TypeScript, full ESLint, production static build and the Chrome browser suite. The aggregate verifier also stops at the unrelated `check:courses` back-to-pages lookup (`scripts/check-courses.mjs:127`); the identical failure was reproduced in a separate unmodified `HEAD` checkout after bundling its content. These limitations are reported rather than changing unrelated course/Compare behavior.

Before release, collect live model outputs in English and Arabic for each audience across tutor, explain-back, Studio and standalone lessons. Have reviewers assess directness, useful depth, first-use explanations, honorific handling, honest disagreement, religious respect and absence of pressure. Include a Deepen question explicitly requesting basics, null/mixed audiences, beginner worship overviews, hostile-but-educational questions and Arabic evidence used to compose English (and vice versa). Confirm source entailment and runtime moderation independently; audience fit never relaxes them.

## Paths changed for this step

YAQIN:

- `api/app/domain/audience.py`
- `api/app/agents/policy.py`
- `api/app/agents/{course,review,tutor}/{agent,prompts}.py`
- `api/app/contracts/{lesson,review,tutor}.py`
- `api/app/controllers/review_controller.py`
- `api/app/services/lesson_service.py`
- `api/app/repositories/{repository,memory_repository,postgres_repository}.py`
- `api/tests/api/{test_audience_context,test_draft_jobs}.py`
- `web/src/features/ask/api.ts`
- `web/src/features/studio/{api,strings}.ts`
- `web/src/features/studio/course-editor/{CourseEditor,CourseDetails}.tsx`
- `web/src/lib/types.ts`
- `web/scripts/{check-auth,check-frontend-browser}.mjs`
- `docs/AUDIENCE_CONTEXT.md`

FaithMinds agents:

- `src/faithminds_agents/{audience,ask,lesson,prompts}.py`
- `tests/{test_audience,test_agents,test_jobs_postgres}.py`
- `docs/LESSON_GENERATION.md`
