# Source integrity and independent support checks

Implemented locally on 5 October 2026 in active `YAQIN` and `faithminds-agents`.
This is not production sign-off. Nothing was committed, pushed, deployed, ingested,
published, or granted in a live database. Prior runtime moderation and audience changes
were preserved. Deprecated `faithminds-course-generator` and concurrent Compare edits
were not edited in this session.

## Authority and ownership

1. Standalone Ask authenticates the active Supabase account before generation, as before.
   Request `sources` may carry canonical IDs; caller text, kind, snapshot and approval
   fields are ignored. `source_store.approved_sources` reads original `public.sources`
   core columns plus `extra` using parameterized pg8000 SELECT in a read-only transaction.
   Core columns override conflicting `extra` keys. All requested IDs must resolve to
   approved records. Missing, pending/withdrawn, permission-denied or unavailable records
   stop the request. Canonical sources are global reference data under YAQIN's existing
   schema; no caller ownership/approval flag grants access.
2. The reader matches `supabase/migrations/0001_init.sql` and `0002_source_extra.sql`.
   It retains original translations, grading, explanations, benefits and other metadata.
   Both initial resolution and the final exact-snapshot comparison use deadline-aware
   connection/statement timeouts (at most three seconds each) with rollback and close.
3. Library passages are request-scoped evidence owned by the authenticated agents/RAG
   path, retrieved using the learner's own JWT. They are not persisted canonical
   scholarly-approved sources. `review_status=unreviewed` and
   `eligibility=rag_access_eligible` describe the actual authority. Citation identity is
   a stable SHA-256 prefix over resource ID, document ID and original passage ID; list
   order does not change it. Full `original_text`, resource/document/passage identity
   and URI are retained. Display normalization does not truncate exceptions or conditions.
4. Before standalone release, cited library evidence is retrieved again with the same
   JWT and restricted resource IDs. Missing/changed evidence, revoked access or a failed
   recheck withholds the answer. A top-k recheck may conservatively withhold when a
   passage leaves the returned set; it never substitutes different evidence silently.
5. YAQIN validates library identity, metadata and display/original correspondence at both
   its HTTP gateway and TutorAgent boundary. It rechecks canonical snapshots against
   its repository; library snapshots remain owned by the configured authenticated service.
   This fixes the baseline library citation failure without inventing canonical rows
   or bypassing provenance checks. YAQIN sends canonical IDs only to standalone Ask.
6. Standalone source/history framing is structured JSON under an explicit untrusted-data
   instruction. Client assistant history is data inside a user message, never a trusted
   assistant role. Library prompts no longer assert teacher/scholarly approval.

## Translation and terminology update (item 2)

Source records and approval flags remain unchanged. Generated prompts, support evidence and
learner API projections now use a translation-safe view: exact English scripture is available
only for the stored QuranEnc edition, the existing Saheeh International/quran.com edition,
the existing Sahih International/Quranpedia book 13638 catalog, and HadeethEnc hadith records.
Publisher URL/record identity and exact edition metadata must agree. The Quranpedia catalog
uses chapter-level URLs; its edition is distinct from QuranEnc's Noor International Center.
This publisher policy does not confer scholarly approval or verify a newly added text itself.

Legacy/unknown English scripture translations are withheld from evidence and rendering;
Arabic originals, IDs, grades and full stored snapshots remain intact. English UI quotes
show the exact existing translator/edition label or an unavailable-translation notice.
New quote cards using an unsupported English provider receive a blocking review issue.
A single explicit hadith relation may add an approved HadeethEnc candidate under its own ID;
it never substitutes wording or transfers approval. Ambiguous relations are not resolved.
Scripture evidence uses designated `text_ar`/authorized `text_en` fields; an extra `original_text`
cannot restore a withheld translation. Library `original_text` remains available as original book evidence.

Course creators, tutors, explain-back feedback and reviewers use the ten preferred teaching
labels in [the supplied scholarly guide](../content/kb/kb.pdf), page 7. Labels guide generated
prose; they are not definitions, scripture replacements or permission to use pending dictionary
records. Relevant approved dictionary meaning takes priority over literal translation.
Exact quotations are untouched, and beginner glosses remain appropriate to the journey.
Local tests cover these boundaries; live bilingual quality checks remain deferred until deployment.
Final local checks: YAQIN API 561 passed / 4 database tests skipped; standalone agents 100 passed /
28 database tests skipped; frontend typecheck, focused ESLint and source rendering checks passed.
Both backend projections agree across all 194 local scripture records: 33 Quran and 152 HadeethEnc
records retain their publisher English; nine legacy hadith records withhold it. Approval flags stay unchanged.

## Independent support review

`EVIDENCE_SUPPORT_REVIEW_V1` is a separate bounded inference call after writing.
It reviews complete answer/follow-up strings, explain-back feedback and corrections,
and every displayed bilingual course field and quiz option/explanation against the
original sources. The rubric rejects valid-but-irrelevant citations, unsupported
assertions, lost qualifications, scripture/commentary confusion and personal fatwa
conclusions regardless of the request/router tier or writer's religious-claim flag.

The judge returns exact unit IDs and full candidate strings, verdicts and structured
source/exact-original-excerpt mappings. Code requires complete, unique coverage;
valid source IDs; exact original excerpts (Arabic or English, without translating the
excerpt); an evidence mapping for every cited/required source; and no personal ruling.
`non_claim` has no evidence and cannot authorize citation-bearing or required-source
units. Boolean-only approvals, malformed output, unknown IDs, excerpt mismatches,
unsupported verdicts, incomplete/truncated calls and judge outages fail closed.

Review input is capped at 100,000 JSON characters and 200 units, without truncating
evidence. Each independent check calls the existing model gateway once (standalone
uses `ASK_MODEL`; YAQIN uses its configured gateway) with at most 8,000 output tokens.
No new dependency or public debug/claim-map field was added. Judge diagnostic content
is not logged or exposed; failures return fixed safe content/issues. Runtime moderation
continues to check decoded input/output independently.

A rejected support candidate is withheld, without local fallback or repair around the
rejection. Ask already rejected candidates that require scripture stripping;
explain-back now also withholds such candidates and displays the exact checked strings.
Deterministic source-only/offline keyword fallbacks remain explicitly labelled and are
not represented as a machine-supported generated answer.

**Exact excerpts and coverage prove plumbing, not entailment or completeness.**
The writer and judge can share a model and correlated errors. An exact but irrelevant
excerpt can still be falsely labelled supported by a bad judge. This machine check is a
mitigation requiring live bilingual human/scholarly calibration, adversarial evaluation
and measured false-accept rates before production use. Local permissive fakes explicitly
stub independent calls; none of their passing outcomes establish real answer quality.
[Langfuse's current judge guidance](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge)
also calls for checking judges against human-labelled examples.

## Course finalization and publication

Course generation snapshots original retrieval evidence before any await can mutate
it. Finalization compares approval AND exact original records after generation/review.
Changed/withdrawn/unavailable sources withhold the whole course, prose and quiz,
with `lesson=null` and `grounded=false`; citations are never removed to launder old prose.
Unknown generated course citations and independent support rejection also stop release.

Manual submission, human approval and live edits always run source support review,
even with `ai=False` (that switch now controls only the optional clarity pass).
A passing support result is cached for at most 30 minutes/256 keys, keyed by identical
content and full original source records. Changed content, source evidence, approval or
audience context receives a fresh review. Source snapshots and runtime safety are
rechecked on cache hits. Explicit authenticated admin/scholarly workflow approval
remains required; the judge does not publish or approve sources.

Publication carries the reviewed source snapshots into the existing repository
transaction. PostgreSQL loads full source rows under `FOR SHARE`, flattens the same
core+extra record shape and rejects any mismatch before writes. Memory repository
mirrors this check and returns independent source snapshots.
[PostgreSQL's SELECT documentation](https://www.postgresql.org/docs/current/sql-select.html)
explains the lock and SELECT/UPDATE privilege requirements.

## Configuration/prerequisites to review, not applied

- Standalone API `DATABASE_URL` must reach the existing YAQIN approved-source store
  with verified TLS and its `extra` migration applied. Keep current jobs/identity
  permissions. Add only `USAGE` on `public` (if missing) and column SELECT for
  `id, kind, ref_en, ref_ar, text_ar, text_en, translation, origin, url, grading,
  review_status, extra` on `public.sources` to the dedicated API database role.
  Do not grant source INSERT/UPDATE/DELETE, RLS bypass or broader resource access.
  The lesson worker and dispatcher do not need this new source SELECT grant.
- If that dedicated database role lacks a matching existing SELECT RLS policy, a
  separately reviewed policy limited to `review_status='approved'` is needed.
  Existing public-source policy/grants must be inspected first, rather than changed
  based on caller JWT metadata. No live policy or grant was created here.
- YAQIN publication needs its existing source SELECT and scholarly UPDATE privileges
  for `FOR SHARE`; the standalone read-only reader never takes that lock or needs
  UPDATE. No additional live schema change is required by this implementation.
- Existing Bedrock model invocation permissions must cover the extra judge calls
  through `ASK_MODEL`/YAQIN's configured model and inference profile, plus existing
  `bedrock:ApplyGuardrail` permissions for the published bilingual policy. No new AWS
  service or broad IAM grant is needed; actual profile/model/guardrail access is unverified.
- Deploy the updated agents and YAQIN gateway together in a reviewed staging rollout.
  The new request-scoped library identity/provenance contract intentionally fails closed
  against older payloads that fabricated approval. Existing canonical citation IDs and
  public tutor/course response contracts remain intact.

## Changed paths in this session

- FaithMinds runtime: `src/faithminds_agents/{ask,db,source_store,support}.py`.
  Verification/docs: `scripts/check_postgres.py`, `tests/{test_ask,test_audience,
  test_runtime_safety,test_support,test_source_store_postgres}.py`, `README.md`,
  `docs/AGENT_SAFETY_READINESS.md`.
- YAQIN runtime: `api/app/domain/{sources,support}.py`, `api/app/agents/support.py`,
  `api/app/agents/{tutor,review,course}/agent.py`, `api/app/gateways/http_agent_gateway.py`,
  `api/app/repositories/{repository,memory_repository,postgres_repository}.py`, and
  `api/app/services/lesson_service.py`.
- YAQIN verification: new `api/tests/domain/test_support.py`,
  `api/tests/api/test_source_support.py`, `api/tests/agents/test_source_publication.py`,
  and `api/tests/support_fake.py`; existing offline fakes and relevant tutor,
  course/review-cache, publication/workflow and runtime-safety tests were updated
  explicitly for the independent checks.
- YAQIN renderer: `web/src/lib/types.ts`, `web/src/features/courses/content.tsx`, and
  new `web/scripts/check-source-quotes.mjs`. This document is the source-integrity report.

## Local verification

- `faithminds-agents`: full disposable TLS Postgres runner, **106 passed, zero skipped**,
  including 23 existing job integration tests and two real read-only source-store/RLS/
  denied-permission tests. Ordinary offline discovery: 81 passed, 25 explicitly skipped
  database tests. The runner's database changes/grants exist only in its disposable
  localhost cluster and are removed when the runner exits.
- YAQIN full Python suite: **391 passed**. New adversarial coverage includes irrelevant
  valid citations; forged caller-approved records; incorrect-tier personal rulings;
  original Arabic-to-English and English-to-Arabic evidence; unknown/excerpt mismatch/
  unsupported/invalid/outage judge responses; complete candidate withdrawal; cached
  review invalidation; manual publication; scripture stripping; and locked final source
  comparison. Baseline correct library citations pass; unknown library citations withhold.
- Changed Python paths pass focused Ruff checks. Full YAQIN Ruff still reports 17
  pre-existing errors outside this session's changes (curriculum, knowledge-base/tutor
  controller imports, legacy tests). FaithMinds full E4/E7/E9/F lint still reports 37
  pre-existing errors in `test_agents.py` and `test_jobs_postgres.py`; changed source
  boundary files and tests pass the same checks. No unrelated lint repair was applied.
- YAQIN TypeScript typecheck, focused ESLint, and actual SourceQuote English/Arabic
  rendering checks pass. Original English-only evidence now remains visible in the
  Arabic UI, and unreviewed library evidence displays the pending-review label alongside
  the library label, never the revealed-text label.
- Broader `npm run check:courses` passes catalogue/migration/journey assertions but
  fails in its existing player navigation section at `scripts/check-courses.mjs:119`
  (`press` cannot find a button; invocation at line 127). That frontend flow and unrelated
  concurrent Compare edits were left unchanged.
- Both repository diff whitespace checks pass. No credential values were read or logged.

## Remaining blockers

Live app AWS profile and staging credentials paths are still required by the coordinating
session. Live model/guardrail English/Arabic calibration, API-to-approved-store grants,
Supabase authorization/revocation, real RAG eligibility rechecks, cross-service contract
compatibility and staging publication locks remain unverified. Extra synchronous judge,
moderation and source-recheck calls must be latency/load tested within the existing
25-second Ask / HTTP gateway budgets; conservative timeouts can safely withhold useful
answers. The operations session owns broader call-budget changes. Exact snapshots only
establish evidence state at recheck time, not perpetual availability after delivery.
