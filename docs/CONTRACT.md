# Yaqeen — shared contract

Single source of truth for the content model and the HTTP API. `web/`, `api/` and
`content/` all build against this file. Change it here first.

External integrations use the separate versioned [Public API v1](PUBLIC_API.md)
and [MCP v1](MCP.md) contracts. See the [AWS release guide](PUBLIC_API_RELEASE.md)
for rollout, OAuth prerequisites and generated schema checks.

## Architecture

```
Browser ──► CloudFront ──┬─► S3            (Next.js static export, narration MP3s, images)
                         └─► /api/* ─► ALB ─► ECS Fargate (FastAPI)
                                               ├─► Supabase Postgres (+pgvector)
                                               └─► Amazon Bedrock (Claude, Titan embeddings)
Supabase Auth issues JWTs; the browser sends them as `Authorization: Bearer <jwt>`.
All application users must sign in; guest and anonymous sessions are not supported.
```

## Accounts and access

Supabase Auth owns `id`, email, password/provider credentials and email verification.
`profiles` owns `display_name`, `avatar_url`, `role`, `created_at` and the existing learning preferences
(`preferred_track`, `lang`, `daily_minutes`, `onboarded`, `known_lessons`). Do not duplicate
passwords or authentication tokens in profiles. Every signup is a `learner`; signup
metadata cannot grant a staff role.

| Role | Allowed work |
|---|---|
| `learner` | Published content and their own profile/progress |
| `teacher` | Learner access, create/edit their own unpublished courses, submit for review |
| `admin` | Teacher access, all course drafts, source approval and publication |
| `super_admin` | Admin access; search/filter/page users, view account history, change other users' roles and disable/enable their accounts in Studio |

All content and tutor endpoints require a non-anonymous Supabase user JWT.
The API verifies the JWT and reads the role from `profiles`; missing, invalid, expired,
and anonymous-session tokens receive 401. There is no local role bypass.
Application screens and onboarding redirect signed-out users to `/signin/`.
The landing page, privacy, sign-in/recovery pages, health endpoint and published static
assets remain public; the static content snapshot is not a confidential data store.
Old guest progress can still be imported when its owner signs in.
Staff sign up as normal learners, then a super admin promotes them at `/studio/users/`.
No invitation emails are sent. Staff roles are assigned through trusted server/SQL access; browser clients
cannot change roles or write content directly. Only the author or an admin can submit a draft;
admins approve sources and publish after validation; a teacher never publishes alone. Unknown roles cannot access staff
endpoints. Legacy `instructor`/`reviewer` profiles resolve to `teacher`/`admin` until
migration `0004_account_roles.sql` is applied. `/studio/` is the shared staff entrance;
`/instructor/` remains accessible for existing links. Subdomain routing is a hosting step.

Before hosting the API, set `NEXT_PUBLIC_API_ENABLED=false` at frontend build time.
The site reads its published `/data/content.json` snapshot from the static host/CDN
without calling FastAPI. Supabase login and profile/progress sync still work independently
when configured. Studio mutations and AI requests are unavailable in this mode.
After hosting, set it to `true` and configure `NEXT_PUBLIC_API_BASE` (or same-origin `/api`).
If the live content service fails, the saved snapshot remains available.
Refreshes retain the latest successful live courses. Invalid snapshots are rejected;
sign-in, auth callbacks and password recovery render even if content is unavailable.

Apply `0004_account_roles.sql` before `0005_admin_users.sql`; the latter checks the
role constraint and staff policy prerequisite. The API database connection must be
able to read `auth.users` for email, last sign-in and ban status, and update
`auth.users.banned_until`. Disable sets it to `now() + interval '100 years'`;
enable clears it to `null`. A future ban disables the account. Supabase rejects
sign-in with `user_banned`; the API rejects authenticated requests immediately
with 403 `account_disabled`, including tokens issued before the ban.
`admin_events` records each role/status change in the same transaction as the
update, with no browser access. No new column or migration is needed.

After those migrations, bootstrap the first super admin through trusted SQL using
the UUID of an existing, normally registered account:

```sql
update public.profiles set role = 'super_admin'
where id = 'YOUR_AUTH_USER_UUID';
```

Further promotions go through Studio. Self-role/status changes are refused. Quota tools,
admin MFA enrollment/enforcement, and the `app`/`studio` subdomain routes and exact
auth redirects remain deferred.

## Safety invariants (enforced in code, not only in prompts)

1. **Revealed text is never model-generated.** Quran and hadith text shown to the
   user always comes verbatim from the `sources` table. The model only refers to
   sources by id (`[[quran:2:256]]`); the server swaps the id for the stored text.
2. **Citations are validated.** Any source id in a model answer that was not in the
   retrieved set is dropped. An answer with zero valid citations for a religious
   claim is converted to an abstention.
3. **Tiering before answering** (scientific package levels):
   - `A` settled core information → direct answer, cited
   - `B` explanation/reasoning → answer from approved material, cited
   - `C` scholarly disagreement → state that scholars differ, no ruling
   - `D` personal fatwa / individual case → general info + referral, never a ruling
   - `OUT` outside scope (non-Islamic, harmful) → polite decline
4. **Abstain when evidence is weak.** If retrieval returns nothing above the
   similarity floor, the tutor says it could not find an approved source.
5. **Privacy.** No religious trait is inferred or stored. The chosen track is a UI
   preference, not a label. Tutor logs store tier + citation ids + latency only,
   never the question text unless the user opts in.
6. **Transparency.** Every AI answer is labelled as AI-generated.
7. **Recitation is never synthesized.** Narration audio skips ayah text; recitation
   uses licensed human recordings.

## Content model

### Source (`content/sources/*.json`, table `sources`)

The provider registry is `content/kb/source_registry.json` (outside the source
record directory because that directory contains arrays of citable records).
HadeethEnc is primary and canonical for hadith text, its published English
translations and associated explanations. HadeethEnc source records and the
corpus manifest carry `provider: "hadeethenc"`, `canonical_for: "hadith"`,
`source_of_truth: true`, `priority: "primary"`. These optional fields persist in
the existing `sources.extra` JSONB column without a database migration.

Dorar, other collection editions and hadith quotations inside books are secondary
attributed references. They cannot silently replace canonical wording. Preserve
collection numbering and provider-attributed grades; never infer or upgrade a
grade. Quran resources and their provenance are independent of this hadith policy.
Canonical designation does not grant scholarly approval (`review_status` stays
pending until review). The complete corpus lives in `resources/hadeethenc/`; the
app's `hadith.json` remains its curated projection, linked by provider ID.

```jsonc
{
  "id": "quran:5:6",              // quran:<surah>:<ayah> | hadith:(bukhari|muslim):<number> | hadith:henc:<id>
                                  // | ref:icadb:<card> (faq) | ref:terminologyenc:<term> (dictionary)
                                  // Bukhari/Muslim numbers are the standard ones (Muslim: Fu'ad 'Abd al-Baqi)
  "kind": "quran",                // quran | hadith | tafsir | fiqh | aqidah | faq | dictionary
  "ref_en": "Al-Ma'idah 5:6",
  "ref_ar": "المائدة: ٦",          // Arabic-Indic digits
  "text_ar": "…verbatim…",
  "text_en": "…approved translation…", // "" when languages == ["ar"]
  "translation": "English Translation - Noor International Center (QuranEnc english_saheeh v1.1.2)",
  "origin": "QuranEnc.com — موسوعة القرآن الكريم",
  "url": "https://quranenc.com/en/browse/english_saheeh/5#6",
  "grading": null,                // hadith only, verbatim from the platform, e.g. "Authentic · صحيح"
  "review_status": "pending",     // pending | approved — set by a scholarly reviewer

  // Optional, by kind (stored in the `extra` jsonb column):
  "languages": ["ar"],            // only when a source exists in Arabic only
  "footnotes_en": "[104] …",      // quran: translator's footnotes, verbatim
  "recitation": {                 // quran: human recitation, never synthesized
    "reciter_en": "Mishary Alafasy", "reciter_ar": "مشاري العفاسي", "rewaya": "Hafs 'an 'Asim",
    "url": "https://server8.mp3quran.net/afs/005.mp3", "start_ms": 1234, "end_ms": 56789, "origin": "mp3quran.net"
  },
  "title_en": "…", "title_ar": "…",                    // hadith:henc
  "attribution_en": "Agreed upon", "attribution_ar": "متفق عليه",
  "explanation_en": "…", "explanation_ar": "…",        // scholarly commentary — never shown as hadith text
  "benefits_en": ["…"], "benefits_ar": ["…"],
  "reference_ar": "صحيح البخاري (…) (164)…",
  "collection_refs": ["hadith:bukhari:164"],          // standard numbers named by the platform
  "see_also": ["hadith:bukhari:164"],                 // other sources in this KB that are the same hadith
  "question_ar": "…", "question_en": null,             // faq
  "source_note_ar": "…", "version": "1.0",
  "term_en": "Monotheism", "term_ar": "توحيد",          // dictionary
  "linguistic_en": "…", "linguistic_ar": "…"
}
```

Retrieval chunks (`source_chunks`) are built by `app.domain.sources.source_passages`: one per
language with the reference (and the question/term/title) prepended, plus a
separate, labelled chunk for a hadith's explanation and benefits. Every chunk
resolves to its source id, so a commentary hit cites the hadith it explains.

### Course (`content/lessons/<id>.json`, compatibility table `lessons`)

The learner structure is **Course → Pages → course knowledge check**, with optional
tutor support. Legacy `explain_back` metadata and the grading endpoint remain for
compatibility; the activity is no longer shown or authored in the web app.
There is no separate lesson layer. Each course has
one independent subject, one difficulty level and at least one track. The bilingual
subject registry is `app_config.subjects` (fallback: `content/subjects.json`).
`app_config.levels` supplies numbered, bilingual difficulty labels (fallback:
`content/levels.json`). Subjects store the level IDs they offer. All courses is unique by stable course ID;
progress uses that same ID and counts in every selected track.

```jsonc
{
  "id": "wudu-order",
  "subject": "fiqh",             // one id from app_config.subjects
  "tracks": ["first-steps", "deepen"], // unique nonempty subset of explore | first-steps | deepen
  "level": 1,                     // positive integer from the subject's offered levels
                                  // historical foundation/deeper values remain stored unchanged, displayed as 1/2
  "minutes": 4,
  "title": { "en": "The order of wudu", "ar": "ترتيب أعضاء الوضوء" },   // one language may be "" (see below)
  "summary": { "en": "…", "ar": "…" },
  "cover": "/img/lessons/wudu.webp",          // optional; shown on the first card. Site path, https URL,
                                               // or a png/jpeg/webp data URL picked in the Studio editor
  "contributors": ["Amina", "Yusuf"],          // course credits (max 20). Kept by the API: saves add the account email; editor-supplied credits are ignored. Staff-only, excluded from public course responses
  "status": "published",          // draft | in_review | published | archived
  "coming_soon": true,            // optional course setting: learners see the title locked and cannot open the course, whatever its status. Only an admin's save changes it
  "cards": [
    {
      "id": "c1",
      "kind": "concept",          // concept | quote | practice | check
      "title":    { "en": "…", "ar": "…" },
      "body":     { "en": "…", "ar": "…" },   // plain prose: search, narration and review checks read this
      "html":     { "en": "<p>…</p>", "ar": "" }, // optional formatted body from the Studio editor
      "takeaway": { "en": "…", "ar": "…" },
      "image": "/img/cards/wudu-1.webp",       // optional, reviewed illustration
      "visual": "steps",                       // optional built-in SVG visual key
      "sources": ["quran:5:6"],                // ids shown under "Sources"
      "references": ["Discover Islam, pp. 10, 28–29"], // optional author-entered text citations (max 30, 1–600 characters each); not source-library evidence
      "label": "obligatory",                   // optional: obligatory | recommended | suggestion
      "audio": { "en": "/audio/wudu-order/c1.en.mp3", "ar": "/audio/wudu-order/c1.ar.mp3" }
    }
  ],
  "explain_back": {
    "prompt": { "en": "Explain the order of wudu in your own words", "ar": "…" },
    "key_ideas": [                             // checklist the learner's explanation is graded against
      { "id": "k1", "en": "Wash the face first", "ar": "…", "source": "quran:5:6" }
    ]
  },
  "quiz": [
    {
      "id": "q1",
      "question": { "en": "…", "ar": "…" },
      "options":  [{ "en": "…", "ar": "…" }],
      "answer": 0,
      "explanation": { "en": "…", "ar": "…" },
      "source": "quran:5:6"
    }
  ]
}
```

`card.kind = "quote"` renders `sources[0]` as the card body (verbatim text), so
quote cards never carry their own `body` text for scripture.

**Languages.** Every `{en, ar}` text needs at least one language. A course can be written
in English, Arabic, or both; learner pages show the language that exists.

**Formatted text.** `card.html` is written in the Studio editor (`/studio/course/`). On save the
API keeps only an allowlist of formatting tags (`api/app/richtext.py`: paragraphs, headings,
lists, highlight box, bold/italic/underline, and `<font>` colour, face and size; no styles,
links, images or scripts) and rebuilds `card.body` from it. Clients never send their own
`body` for a card that has `html`. Every card still cites at least one source.

**Course editor.** `/studio/course/` creates a course manually or through an AI prompt;
`/studio/course/?id=…` edits it using the existing page editor. Authors choose a subject,
difficulty level, one journey and one module within it, edit sources and questions, preview,
save and submit for review. AI authoring uses `POST /api/review/draft` with
`{prompt, lang, track}`, then polls `GET /api/review/draft/{id}` until the generated draft
is saved, without an automated review pass. AI output uses the same classification. The tutor receives the
course subject, difficulty and selected tracks. There is no tags field in new drafts.

Old `/studio/lesson/?id=…` and `/lesson/?id=…&step=…` URLs render the same editor/player
with their query parameters intact. New links use `/studio/course/` and `/course/`.

### Track (`content/tracks.json`)

```jsonc
[{ "id": "explore", "title": {"en": "Explore Islam", "ar": "اكتشف الإسلام"},
   "tagline": {...}, "audience": {...}, "modules": [{ "id": "...", "title": {...}, "lessons": ["course-id", ...] }] }]
```

The existing `modules` are journey modules with an optional bilingual `goal`. They
remain because they serve ordering, independently of subjects and difficulty. The
legacy `lessons` key contains ordered **course IDs**, not child lessons. Membership
has one source of truth: the course's `tracks` array, containing exactly one journey. Order has one source of truth:
`tracks[].modules[].lessons` (files locally, `app_config.tracks` in Postgres).
Publishing retains existing positions, removes stale memberships and duplicate IDs,
and appends new memberships to the first group. Module and course order are not
derived from difficulty. All three tracks offer guided modules and free subject browsing. Learner journey groups are labelled **Module**, and course position is labelled **Step**;
**Level** only means course difficulty. Completion follows the stable course ID when its journey changes.

## HTTP API (FastAPI, prefix `/api`)

All bodies are JSON. `lang` is `"en" | "ar"`. Auth header optional unless noted.

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health` | `{ "ok": true, "model": "..." \| null, "db": true, "store": "postgres" \| "memory" }` |
| GET  | `/api/content` | Published `{tracks, subjects, levels, courses, coming_soon, sources}`; deprecated `lessons` alias for older clients. `coming_soon` maps course id → `{id, title, subject, level, tracks}` for courses locked by the Coming soon setting; it never carries course content, and such a course is not in `courses` |
| GET  | `/api/tracks` | Tracks with ordering groups and course summaries |
| GET  | `/api/courses/{id}` | Full course with `sources` resolved into a `sources_by_id` map; old `/api/lessons/{id}` remains compatible |
| GET  | `/api/review/courses` | Staff course list; old `/api/review/lessons` remains compatible |
| GET  | `/api/sources/{id}` | One source |
| POST | `/api/tutor/ask` | Ask Yaqeen tutor (below) |
| POST | `/api/speech` | Learner; narrate page/answer text. `{text (1..4000), lang: "en"\|"ar", voice: "male"\|"female"}` → `{url: "/resources/speech/<key>.mp3", cached: boolean, duration_ms: number\|null}`. Audio is cached in the private resources bucket under `speech/` and served by CloudFront. 400 on scripture markers (`[[`/`]]`) or over-length text; 503 `speech_unavailable` when disabled or synthesis fails. |
| POST | `/api/tutor/explain-back` | Grade a learner's explanation (below) |
| POST | `/api/review/check` | Optional pre-review of a course draft (teacher or higher): `{ready_for_reviewer, checks, issues: [{card, severity, issue, suggestion, origin: "rule"\|"ai"}]}`. Runs rule and source-support checks when explicitly requested; course generation, saving, submission and publication do not invoke it automatically. |
| GET  | `/api/review/queue` | Own courses in review for teachers; all for admins |
| POST | `/api/review/{lesson_id}/decision` | `{decision: "approve"|"request_changes", note}` (admin or super admin only) |
| POST | `/api/review/sources/quran` | Teacher or above; `{surah, ayah}` → the source library entry `quran:<surah>:<ayah>`. A verse that is not in the library yet is added as `pending`, word for word from `content/quran/ayat.json` (built by `content/tools/bundle_quran.py` from the reader's Arabic and Sahih International files). An existing entry is returned unchanged. Unknown verse: 404. |
| GET | `/api/admin/users` | Super admin only; `q` is a case-insensitive email/display-name substring (`strpos`, no wildcards), optional `role`, `status=active` or `disabled`, `page>=1` (default 1), `page_size=1..50` (default 10). Ordered by `created_at desc, id desc`. Returns `{items: [{id, email, display_name, role, created_at, last_sign_in_at, disabled}], total, counts: {total, learner, teacher, admin, super_admin, disabled}}`. `total` follows filters; `counts` ignores them. Invalid query: 400. |
| POST | `/api/admin/users/{id}/status` | Super admin only; `{disabled: boolean}` → `{id, disabled}`. Real session required (401), self-change 403, invalid body/id 400, unknown user 404, already in that state 409. Locks the profile row, updates `auth.users.banned_until`, and records `user_disabled` or `user_enabled` in one transaction. |
| GET | `/api/admin/users/{id}/events` | Super admin only; newest first (`created_at desc, id desc`), max 50 events for `target_id=id`. Returns `[{id, kind, payload, actor_id, actor_name, actor_email, created_at}]`; kinds `role_changed` (payload `{from_role, to_role}`), `user_disabled`, `user_enabled`. Unknown user 404. |
| POST | `/api/admin/users/{id}/role` | Super admin only; `{role: "learner"|"teacher"|"admin"|"super_admin"}` → `{id, role}`. Self-change: 403; invalid role/id: 400; missing profile: 404. Requires a real session; updates role and audit atomically. |

### Studio course management

The author submits; admins/super admins publish. Manual saves, submission, publication
and live updates do not call AI or external content safety checks, reserve AI budget,
or require cited sources to be approved. Permissions, schema/classification validation,
citation existence and conditional repository writes remain enforced.
AI-generated drafts also skip automated
source-support and editorial review; they retain source retrieval, citation/schema
validation and content safety assessment. Only admins change a course's Coming soon setting.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/review/published` | Admin or super admin; validated course JSON for a published course. Replaces the content in place without AI or external safety checks: the status stays `published`, lesson retrieval chunks are rebuilt, and one `updated` review event is recorded. Returns `{lesson_id, status, contributors, issues: []}`. 409 if the course is not published or cited evidence changed before the write. |
| POST | `/api/review/{id}/unpublish` | Author or admin/super admin; published → draft, preserving curriculum position. Deletes lesson retrieval chunks and records a review event. |
| POST | `/api/review/{id}/delete` | Author or admin/super admin; any course status. Returns 409 if any progress exists: archive it instead. Permanently removes the course, its review history, curriculum references and lesson chunks; records `admin_events.kind=lesson_deleted`, payload `{id, title}`. |
| GET | `/api/curriculum` | Admin or super_admin; `{tracks, subjects, levels, courses, updated_at}`. Courses include all statuses with only catalogue metadata. `updated_at` maps each config key to its ISO timestamp, or `null` for a fallback. No-store. |
| POST | `/api/curriculum/subjects` | Admin; `{subjects: [{id, title: {en, ar}, levels: number[]}], updated_at}` replaces the subject list. New IDs are English-title slugs; existing IDs stay fixed when editing titles. |
| POST | `/api/curriculum/levels` | Admin; `{levels: [{id: number, title: {en, ar}}], updated_at}` replaces levels. New levels use the next number. Deletion also removes the number from every subject. |
| POST | `/api/curriculum/tracks/{track_id}` | Admin; `{modules: [{id, title: {en, ar}, goal?: {en, ar}, lessons: [course IDs]}], updated_at}` replaces one fixed track's sections/order. A legacy `planned` key is accepted and dropped. Submitted course IDs are authoritative membership for that track. Track titles and IDs cannot be edited. |

Coming soon is a setting of the course, not a list of static titles and not a
status: the boolean `coming_soon` in the course JSON, saved with the draft through
`POST /api/review/drafts`. Only an admin's save changes it; a teacher's save, or a
save without the field, keeps the stored value. A change records a `coming_soon`
or `coming_soon_removed` review event. While it is on, the course is locked for
learners at any status (draft, in review or published): they see its title in its
module position and cannot open it. They receive the title and classification only
(`coming_soon` in `GET /api/content`); the course is left out of `courses`,
`GET /api/tracks`, `GET /api/courses/{id}` (404 for learners), Ask and search.
Publishing does not turn it off: an admin does. An archived course is hidden
whatever the setting. The old static module `planned` titles and the
`/api/review/planned` endpoints are removed.

Course responses carry contract fields only. A course written to the database by
another tool may hold fields the draft contract refuses (`extra="forbid"`);
`GET /api/courses/{id}` and `GET /api/content` leave them out, so the editor can
save what it loaded, and that save removes them from the stored course.
The Studio shows status totals, lists published courses first, and offers
title search and track/subject/level/status filters. The footer provides filter reset
and 5/10/20 courses per page; the list count reports the visible range of matches.
Course titles open the existing preview modal; new/edit links open the page editor. Publish/Submit, Hide, Edit
and Delete remain available. Archive, Hide and Delete use centered confirmation
modals, with success/error toasts after actions. Admins turn Coming soon on or off with
a switch at the top of the editor's Course details, for published courses too; it is
saved with the course. A course with the setting on shows a small badge with a
tooltip next to its title in the list.
Review notes and manual AI pre-check are hidden in this UI. Automatic checks still
run when publishing.
The Sources page and API remain available, but the Studio nav has no Sources link.

### `POST /api/tutor/ask`

Request:
```json
{ "question": "Did Islam spread by the sword?", "lang": "en",
  "course_id": null, "track": "explore",
  "history": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }] }
```

Response:
```jsonc
{
  "tier": "B",                    // A | B | C | D | OUT | NONE (no approved source found)
  "answer": [                     // ordered blocks; the UI renders them in sequence
    { "type": "text", "text": "Conquest and belief are two different things…" },
    { "type": "source", "id": "quran:2:256" },   // UI renders verbatim text from `sources`
    { "type": "text", "text": "…" }
  ],
  "sources": { "quran:2:256": { /* Source */ } },
  "referral": null,               // set for tier D: { "en": "...", "ar": "..." }
  "follow_ups": ["Why do Muslims pray five times a day?"],
  "ai_generated": true
}
```

### `POST /api/tutor/explain-back`

Request: `{ "course_id": "wudu-order", "transcript": "I wash my face…", "lang": "en" }`

Both tutor endpoints still accept `lesson_id` as a compatibility alias.

Response:
```jsonc
{
  "covered": ["k1", "k2"],
  "missed": ["k3"],
  "misconceptions": [{ "text": "...", "correction": "...", "source": "quran:5:6" }],
  "feedback": "You started with the face and included the arms…",
  "sources": { "quran:5:6": { /* Source */ } },
  "ai_generated": true
}
```

### Errors

`{ "error": { "code": "rate_limited" | "bad_request" | "upstream" | "unauthorized", "message": "..." } }`
with the matching HTTP status. The tutor never returns a 500 to the UI for a
model failure; it returns `tier: "NONE"` with an apology block instead.

## Database (Supabase Postgres)

Migration `0002_source_extra.sql` adds `sources.extra jsonb` for the kind-specific source fields above;
the API reads it when present and `scripts/seed.py` refuses to run until it is applied.

`20261004133649_course_structure.sql` migrates metadata in existing rows and completed
AI draft jobs. It preserves IDs, page/source text, exact levels, publication status,
ownership, quiz results, progress and review events. `legacy_classification` archives
old metadata; active JSON forbids `track`, `module` and `tags`. Historical table/FK
names and progress/localStorage keys are retained, so no learner progress migration
or content duplication is needed. Apply it before deploying the new API and web.

Tables: `profiles(id uuid pk → auth.users, display_name, role: learner|teacher|admin|super_admin, preferred_track, lang, created_at, daily_minutes, onboarded, known_lessons, avatar_url)`,
`app_config(key, data jsonb, updated_at timestamptz)` (holds `tracks`, `subjects`, `levels`),
`sources`, `source_chunks(id, source_id, lesson_id, lang, content, embedding vector(1024), tsv)`,
`lessons(id, track nullable historical, module nullable historical, legacy_classification jsonb, status, data jsonb, author_id, updated_at)`,
`progress(user_id, lesson_id, card_index, completed_at, quiz_score, explain_back_score)`,
`review_events(id, lesson_id, actor_id, kind, payload jsonb, created_at)`,
`admin_events(id uuid pk, actor_id uuid → auth.users, target_id uuid → auth.users, kind, payload jsonb, created_at)`
(kind `role_changed`, payload `{from_role, to_role}`; deleting an auth user nulls its audit reference),
`tutor_logs(id, created_at, tier, citation_ids text[], latency_ms, track)`.

RLS: learners read published lessons and approved/pending sources, and read/write
only their own `progress` and `profiles`. Teachers manage their own drafts through the API.
Admins and super admins read all lessons and write review decisions through the API. `tutor_logs` is insert-only
from the API service role.
`admin_events` has RLS enabled and no client policies or client grants; only trusted
server/SQL access can read or write it.

## Environment

Root `.env` backend settings: `ENV`, `ALLOWED_ORIGINS`, `AWS_REGION`, `YAQIN_AWS_PROFILE` (local only; the shell's
`AWS_PROFILE` is deliberately ignored, and work-account profiles are refused),
`BEDROCK_MODEL_ID=anthropic.claude-opus-5-5`, `EMBED_MODEL_ID=amazon.titan-embed-text-v2:0`,
`DATABASE_URL`, `SUPABASE_URL`, optional `SUPABASE_JWT_SECRET` (legacy HS256 only).

Auth: Supabase signs user JWTs with ES256. The API verifies them against
`{SUPABASE_URL}/auth/v1/.well-known/jwks.json` (cached), audience `authenticated`,
issuer `{SUPABASE_URL}/auth/v1`. Shared project settings live in the tracked root `.env`; production injects deployment secrets through ECS and Secrets Manager.

Root `.env` browser settings: `NEXT_PUBLIC_API_ENABLED` (`false` = CDN-only; defaults to enabled), `NEXT_PUBLIC_API_BASE` (empty = same origin `/api`),
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

Google provisioning settings in the same file: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`SUPABASE_ACCESS_TOKEN`, `AUTH_SITE_URL`, `AUTH_REDIRECT_URLS`. These private values are
used only by the explicit `web` `auth:configure -- --apply` command. Hosted Auth settings
do not change during app startup. Shell variables take precedence; Next can additionally
load root `.env.production.local` for frontend production overrides. Only `NEXT_PUBLIC_*`
values are bundled for the browser.

## Completed workflows

See `SUPABASE_SETUP.md`; apply the missing migrations in the documented order.

- `GET /api/content`: live `{tracks, subjects, levels, courses, coming_soon, sources}`; published courses that are not locked, plus title-only Coming soon entries; no-store; `lessons` remains a compatibility alias.
- `GET /api/review/courses`: own courses for teachers, all for admins and super admins.
- `POST /api/review/drafts`: validated course JSON; saves an unpublished draft with ownership checks.
- `POST /api/review/{id}/submit`: the author, or an admin, submits a saved draft after checks.
- `GET /api/review/sources`: pending sources for staff.
- `POST /api/review/sources/{id}/approve`: admin or super-admin approval with an audit record.
- Publishing requires an in-review course and an admin. Resources are optional on ordinary pages; cited resources must exist but do not need prior approval. Quote pages require a resource to render their stored text.
- Progress uses the `save_learning_progress` Supabase RPC with RLS and an atomic merge.
  Notes/card completion are in `progress`; streak dates are in `learning_days`.
  Daily minutes, onboarding and known lesson preferences are in `profiles`.
- Browser content writes are revoked; staff changes go through the validated API.
- Tutor retrieval and explain-back exclude unapproved sources in online and offline modes.


### Curriculum configuration and concurrency

`subjects` is `[{id: string, title: {en, ar}, levels: number[]}]`; `levels` is
`[{id: positive integer, title: {en, ar}}]`. The curriculum migration seeds all
existing subjects with levels 1–4 and the existing bilingual level labels. These
keys reuse `app_config`; no new table or course/progress migration is needed.
When keys are absent, the API uses the bundled defaults. Empty lists remain empty
(they do not trigger fallback). The three track IDs remain fixed forever.

All curriculum saves return the new curriculum snapshot and require the matching
key's `updated_at` from the last read. A mismatch returns **409 stale_curriculum**;
reload before retrying. Track saves share the `tracks` config timestamp, so edits
to any track, course placement or course deletion
invalidate stale track saves. Removing a level also advances the subjects timestamp.

Each save validates and writes in one transaction: lock config rows with
`SELECT … FOR UPDATE` in tracks/levels/subjects order, then lock course rows,
apply membership changes to `lessons.data.tracks` only, update config timestamps,
and append a `curriculum_saved` admin event with `{key, track, items}`. Course
save/publish/delete paths use the same lock order. For older drafts whose ordering
entries were missing, curriculum reads append them to the first section without
changing membership; the next track save persists this order.

Deleting a subject or level used by any course (including drafts/archived courses),
removing a subject's used offered level, deleting a section before emptying it,
or removing a course's only track returns **409 in_use**. Unknown/duplicate IDs,
invalid slugs or offered levels and nonsequential new level IDs return **400**;
an unknown track returns **404**; signed-in non-admins receive **403**.
Titles written here require both English and Arabic. Course classification is
validated against the current config when saving and publishing. Legacy
`foundation`/`deeper` values still map to numbered levels 1/2 without rewriting
persisted course JSON. AI drafting constructs the enums and offered-level context
from the current config at call time.
