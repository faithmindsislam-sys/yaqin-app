# Hassan: generation time and repeated pages

Audited 2026-10-05. This report covers Studio's **Generate with AI** flow. Related chat findings are in [the Mariam, Ibrahim, Khaled and Rayen audit](TUTOR_AGENT_LATENCY_AUDIT.md).

## Findings and changes

Hassan does more work than a chat assistant: it creates a bilingual course, checks its evidence, and reviews teaching quality. Longer execution is expected. There is nevertheless an avoidable retry path and a reproducible duplicate-page validation gap. Both have been fixed locally; nothing has been deployed.

| Problem | Change | Effect |
| --- | --- | --- |
| Editorial review becomes unavailable after evidence verification. The course writer previously treated this as a content defect and generated another whole course. | Stop redrafting on editorial-review unavailability. Studio resumes only the unfinished editorial stage within its three-execution limit; persistent outage leaves a verified draft with an incomplete review. | Avoids repeating writer and source-judge calls merely to recover an unavailable editorial reviewer. Does not mark the draft ready or bypass publication checks. |
| Six identical pages can pass if the AI editorial reviewer returns no issues. | Add a deterministic duplicate-body rule to the shared ReviewAgent. Compare English and Arabic separately, ignoring whitespace and case, regardless of titles or card kinds. | Repeated prose produces a blocking issue even in rule-only review. Adds no model call. Existing generation repair feedback receives the issue. |
| Page and quiz limits existed only in the writer prompt. | Enforce maximum six pages and three quiz questions in the generation schema. | Prevents oversized generated courses from passing structured-output validation. Honest empty output remains possible. |
| Interrupted in-flight writers could resume the same content attempt. | Persist the consumed attempt before inference and durable feedback after unavailable or empty output. | Three interrupted executions permit at most three writer invocations; continuation cannot reset this limit. |
| Repair context sliced JSON at 12,000 characters. | Send complete compact previous-draft JSON within a 60KB bound. If it cannot fit, retain the reviewed draft and blocking issues without another writer call. | Preserves quiz and later-page content rather than handing the model broken or incomplete JSON. |

The writer prompt also explicitly says not to pad a course with repeated pages.

## Repeated pages: what was verified

An offline reproduction supplied six copies of one sourced page and an editorial verdict with no issues. Before the duplicate rule, the output contained **six pages, one distinct body, ready_for_reviewer=true, attempt=1**. Thus the implementation could accept the behavior reported by the user. The original affected course was not provided, so this does not establish precisely what happened in that particular run.

Normalization assigns separate page IDs but previously preserved every repeated body. The editor selects `lesson.cards[shown]`, keys its rich-text editor by page ID and language, and saves each card independently. No obvious page-display or copy bug was found in that path. Distinct IDs alone cannot establish distinct content.

The shared rule now flags duplicates even when the AI misses them or editorial AI is disabled. Generation can repair the pages within its existing limit of **three draft attempts total**. If every attempt repeats the pages, the draft remains available for teacher editing with blocking review issues; it does not pass review or become published. Submission and publication use the same shared reviewer.

This rule detects identical prose after whitespace/case normalization. Semantic repetition with different wording still depends on editorial review. It skips empty bodies and quote cards: quotes display authoritative stored sources, and repeating a quotation in distinct teaching contexts is not automatically a duplicate prose page. It does not silently delete pages or reinterpret Arabic letters.

Implementation: [shared review](../api/app/agents/review/agent.py), [course generation](../api/app/agents/course/agent.py), [writer prompt and schema](../api/app/agents/course/prompts.py), [page editor](../web/src/features/studio/course-editor/CourseContent.tsx).

## Resumable generation implemented

Hassan now saves server-owned checkpoints in the existing private `draft_jobs.result` storage: retrieved evidence, the complete normalized draft, completed independent source verification, and the complete review. The browser submits only the job ID to continue; it cannot supply a draft or verification verdict to trust.

An interrupted job resumes its unfinished stage with a fresh execution deadline. The same job ID and teacher ownership are retained. There are **at most three executions total**, separately from the existing **three content-repair attempts total**. Continuation does not reset content-repair attempts or the cumulative model-call/token ceilings. Before each stage, the server persists and enforces a conservative allowance for possible in-flight work; a killed process retains that charge because its exact usage cannot be recovered. Completed stages store observed reservations rather than consuming their entire allowance.

A timed-out editorial reviewer is retried without rerunning the writer or a still-valid source judge. After three editorial outages, the verified draft is saved for teacher editing with a blocking incomplete review. Evidence rejection, safety rejection/unavailability, changed evidence and invalid checkpoint bindings remain terminal. They do not trigger a new execution to seek a different verdict.

Checkpoint reuse verifies the policy, original prompt/language/audience, exact current approved source snapshots and the verification hash of the complete saved draft plus cited sources. A cached verification retains its original expiry; continuation cannot renew it without another independent judge call. Expired verification requires a fresh review. Safety assessments and final source checks still run.

The resume claim uses a database compare-and-swap update. Each execution carries its own token; delayed workers cannot attach to a new execution, update its checkpoints or save an orphan course. Course saving and final job completion remain one transaction. Private unverified drafts and checkpoint contents are omitted from the status response. No new migration, queue, worker framework or runtime dependency was needed.

The editor automatically requests at most two continuations of the initial execution, using only the saved job ID. It stores that pending ID in the URL before polling, so refreshing or reopening that URL follows the same owner-authorized job. Transient network/5xx status reads allow three attempts; authorization failures stop immediately. Start/resume POST calls are never automatically retried after ambiguous responses. An explicit retry rechecks the existing job. It keeps generation visible, shows a separate editorial-review stage, and carries the completed job's review report into the saved-course editor so an incomplete review or blocking notes remain visible on arrival. The waiting message states that writing/checking can take several minutes and asks the user to keep the editor open for automatic continuation.

This improves recovery, not normal writer speed. A provider call that itself exceeds its timeout still cannot return partial JSON; the last completed stage is the recovery point. Following API process loss, the old execution is declared interrupted after its configured deadline plus the existing 30-second grace period. Continuation requires an authenticated owner request. Pending-job recovery in the editor is included in the second pass; a durable unattended scheduler remains future work if needed.

Validation: **161 relevant offline functional tests passed**. All **nine real PostgreSQL transaction tests passed** on a disposable local database with certificate-verified TLS; two overlapping additions were then removed, leaving the seven checked transaction cases. Checks cover single-owner claims, stale-worker fencing, atomic completion, rollback, execution-aware expiry and retained checkpoint budgets. The editorial-outage regression records one writer call, one support call and three editorial calls across three executions, then saves an incomplete editable draft. No live database, production provider or deployment was used.

## Current execution and timeout limits

Studio starts a background job and returns immediately; the browser polls roughly every two seconds. The generation itself does not hold one long HTTP request open. The task runs inside the API process, so an API restart can still interrupt its current stage; completed checkpoints now survive in PostgreSQL.

An ordinary successful round has three model calls: writer → source-support judge → editorial reviewer. Retrieval also requires an embedding call. There are up to three full draft attempts; each structured model response may itself retry once for invalid output. The overall operation has a default 480-second budget and a 32-call budget. The call/token budgets are cumulative across resumed executions. These are upper limits, not an expected duration. Evidence or safety rejection stops generation; it does not trigger a new attempt to obtain a different safety verdict.

The model client separately has a 60-second timeout and disables SDK retries. A single provider call can therefore fail while the overall eight-minute generation budget still has time remaining. Editorial review shares the parent course operation budget when called inside generation.

Configuration permits `COURSE_SECONDS` up to 540 seconds. Studio uses the Fargate API path, rather than the separate standalone agents worker. The deployment script now forwards `COURSE_SECONDS`; its offline deployment-rendering tests verify this alongside tutor call/deadline settings. Increasing the setting still requires checking the live configuration and job expiry. Increasing a CDN or HTTP timeout will not extend a background generation job. Model requests now use the smaller of 60 seconds and the remaining operation time, without raising either limit. [Anthropic SDK documentation](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/python) supports configuring timeouts and disabling automatic SDK retries; the installed SDK's request signature was checked.

Sources: [job service](../api/app/services/lesson_service.py), [operation limits](../api/app/domain/operations.py), [settings](../api/app/configuration/settings.py), [model client](../api/app/gateways/bedrock/llm_gateway.py), [API deployment](../infra/deploy-api.sh).

## Recommended next steps

1. **Measure the slow stage before changing limits.** Record writer, source judge, editorial review and retrieval durations, attempt counts, and distinguish provider timeout from whole-operation deadline and process interruption. Existing generic job failures obscure this distinction. No live production timing was available in this audit.
2. **Reduce unnecessary evidence and generated text.** Bound relevant source text by size while preserving enough coverage for the course. Prefer three useful pages over six padded ones. Judge and editorial output caps should match actual verdict size; do not lower caps so far that valid JSON or essential qualifications get truncated. Provider guidance supports shorter inputs/outputs as a latency optimization: [Anthropic latency guidance](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency).
3. **Consider concurrent reviews only if reviews dominate measured time.** Source-support and editorial review could run concurrently over the same immutable draft and evidence snapshot, while requiring both outcomes and a final source recheck. This trades some wasted editorial work on rejected drafts for a shorter critical path. It is not implemented here. Combining both into one call would remove the independent reviewer boundary and needs evaluation first.
4. **Keep the bounded repair loop for real editorial defects.** Three attempts cap it, including interrupted writers. Complete compact repair JSON is now used within a 60KB bound, with no writer call for an impossible oversized repair. Reducing to two is an optional quality/latency tradeoff after measuring repair success; it is not necessary to fix the outage or duplicate-page bugs.
5. **Tune the correct timeout if needed.** If valid jobs hit the overall 480-second deadline, deployment can now forward `COURSE_SECONDS=540` and should align job expiry. If individual writer calls hit 60 seconds, evaluate a generation-specific provider timeout within the remaining operation budget instead. Raising limits alone increases waiting time and does not fix repetitive output. Do not raise the shared client timeout indiscriminately for chat agents.
6. **Defer an unattended durable worker until needed.** Completed work now survives restarts through checkpoints and owner-authorized continuation. A queue is still needed if generation must resume unattended while every browser is closed; it is a larger change than the current Studio flow requires.

Operation-local reuse of complete successful identical safety assessments is now implemented in the shared gateway. It preserves provider/policy/direction boundaries and expiry. Lighter review models remain an option after bilingual quality checks. No independent evidence judge or source-eligibility recheck was removed.

## Validation

The second-pass integrated YAQIN suite passed **766 tests**, with nine optional integration cases skipped. Seven PostgreSQL transaction cases were separately exercised during the first pass on disposable certificate-verified TLS storage (all nine initially ran successfully before two overlapping tests were removed). The remote suite passed **109 tests**, with 28 integration cases skipped. Frontend TypeScript, targeted ESLint and `node scripts/check-draft-resume.mjs` passed. The check exercises same-job continuation, terminal outcomes, two-continuation client limit and unmount cancellation.

Added regression coverage verifies editorial-outage behavior, real editorial repairs, schema limits, duplicate detection in either language, distinct bodies/empty quote handling, recovery from six identical pages, and a persistent duplicate result exhausting three attempts without passing review. Checkpoint regressions cover interruption at each completed stage, unchanged page IDs, policy/source/draft binding, verification expiry, ownership, cumulative limits, execution-aware expiry and stale-worker fences.

The second pass additionally passed 166 relevant backend tests, including interrupted-writer consumption, durable unavailable/empty-output feedback, complete repair JSON beyond the old 12KB cut and oversized repair stopping. The runnable frontend check now also renders the actual editor through the pending-URL handoff and a refreshed-page subscription, verifying that refresh does not issue a new start request. Polling regressions cover bounded transient reads, authorization failures, ambiguous resume POST and cancellation.

These are offline functional checks, not a production performance benchmark. No measured seconds-per-course improvement is claimed. The editorial-outage regression finishes three executions with one writer call, one independent source judge and three editorial calls, rather than rewriting the course each time. Normal successful generation still uses three model calls.
