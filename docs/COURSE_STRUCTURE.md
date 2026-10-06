# Courses, pages and track progress

A course contains pages and a course knowledge check.
There is no lesson layer between a course and its pages. Each course has one
subject, one difficulty level and exactly one of the three existing journeys.

Example: **Tahara basics**, subject **Fiqh**, level **1 — Foundations**, in
**First Steps**. Its pages cover introduction to
purification, how to perform wudu and what breaks wudu, followed by the knowledge
check. Subjects describe content. Levels describe difficulty within a subject.
Modules group the recommended journey; steps describe course order within it. Course tags are removed.

Studio uses the existing manual/AI authoring and page editor, with subject, level
and one journey dropdown with one module dropdown scoped to that journey.
Changing the journey selects its first module; the course's writing audience follows
its journey. Sources, questions, preview, review and
publication remain available. Library filters by subject, level and track without
adding extra classification screens. All courses lists each stable ID once;
course completion stays attached to its stable ID when its journey changes. Recommendations follow
the selected track's order and skip completed courses.

Course JSON owns content and track membership. Existing track `modules` serve
journey ordering, so their order is retained independently of
subjects and difficulty. Their legacy `lessons` arrays contain ordered course IDs.
Compatibility table/FK/storage names remain to preserve progress and history.
Legacy explain-back content and scores remain readable for compatibility, but the
activity is removed from the player, progress checklist, daily plan and Studio.
Old `step=explain` links open the knowledge check when available, otherwise the pages.
Old learner and Studio lesson URLs use the same player/editor with query parameters
intact. See [the contract](CONTRACT.md#content-model).

## Local verification

From `web/`, the repeatable frontend audit command is:

```sh
rtk npm run verify:frontend
# Optional: use an installed browser instead of Playwright's Chromium.
rtk proxy env COURSE_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run verify:frontend
```

Install dependencies with `npm ci` and Chromium with `npx playwright install chromium`
when an installed Chrome executable is not supplied. The command runs TypeScript,
ESLint, focused checks, a Webpack production static export in a temporary copy,
and isolated browser lifecycle regressions in English/Arabic on desktop/mobile.
It excludes environment files from the temporary build, uses fixture service
endpoints, and leaves any active development build alone. There is no existing CI
workflow in this repository to extend. See [the audit report](FRONTEND_AUDIT.md).

From `api/`, run `rtk proxy .venv/bin/python -m pytest -q`. From `web/`, run
`rtk npm run check:courses`, `rtk npm run check:auth`, `rtk npm run check:progress`,
`rtk npm run check:onboarding`, `rtk npm run typecheck` and `rtk npm run lint`.
From the repository root, run `rtk proxy python3 content/validate.py`.

Production export: `rtk proxy npm run build -- --webpack` from `web/`.
Use a clean checkout/copy when a development server is already running. Verification
passed in a clean temporary copy; building in the active workspace encountered a
Webpack filesystem-hash error. The default Turbopack build also encountered a local
worker port-bind restriction. Neither required changing application code or dependencies.

The PostgreSQL regression check creates and drops a disposable database on an
explicit **local** server and rejects remote hosts:

```sh
# From api/, with a disposable local PostgreSQL instance already running:
rtk proxy .venv/bin/python -m scripts.check_course_migration postgresql://USER@127.0.0.1:PORT/postgres
```

It applies the migration twice, verifies metadata-only changes, exact levels,
stable IDs, drafts/jobs, progress, reviews and existing RLS, then exercises the real
Postgres repository's authoring and publishing transactions.

For real UI checks, start the isolated FastAPI fixture from `api/`:

```sh
rtk proxy .venv/bin/python -m scripts.course_browser_fixture
```

In another terminal from `web/`:

```sh
rtk proxy env YAQIN_CHECK_DIST_DIR=.next-course-check NEXT_PUBLIC_QURAN_BASE=/data NEXT_PUBLIC_API_BASE=http://127.0.0.1:8797 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8798 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=fixture-public-key npm run dev -- --port 3107 --webpack
# Playwright is a pinned dev dependency; COURSE_CHROME_PATH may select installed Chrome.
rtk proxy node scripts/check-course-browser.mjs
```

The fixture uses actual FastAPI validation, sources, authoring jobs, review and
publishing with a deterministic model and temporary in-memory content. Quran source
registration reads exact checked-in references and disables the production S3
source. The frontend picker uses existing local bundled Quran assets (`/data`). The browser
mocks Supabase identity/profile/progress only; no deployed service is contacted.
It verifies manual and AI creation, page edits, classification, save, preview,
review/publication, unique Library entries, knowledge-check completion, shared
progress after switching tracks, and old URLs on desktop/mobile in English/Arabic.
Screenshots go to `/tmp/yaqin-course-ui`.

## Deployment

The course migration was applied to the configured **Yaqin** Supabase project
(`okcctzpfpreziuxnyepk`) on **2026-10-04**. Migration history records
`20261004133649_course_structure`, matching the repository filename. Do not apply
it again to this project. For a new database, apply it after the existing migrations.

Live verification passed: 10 courses (8 published, 2 drafts), with unchanged IDs,
religious content, quotations and difficulty levels. Fingerprints confirmed that
6 progress rows, 19 review events, 268 sources, 3 AI draft jobs and profiles were
preserved. All courses pass the API draft schema; the real Postgres repository
loads the published catalogue and sources, keeps drafts private, and returns three
tracks without duplicate ordering entries or missing published memberships.
Existing RLS and policies were unchanged.

Deploy the API, then rebuild/deploy the frontend and retain both old and new route
directories. Deployment has not been performed. Seeding never overwrites existing
database edits. See [database setup](SUPABASE_SETUP.md#database).
Local deterministic AI verification does not call the production Bedrock model.


## Studio Curriculum

Admins and super_admins manage `/studio/curriculum/?tab=modules|subjects|levels`.
The three tracks remain fixed. Modules support bilingual naming, up/down order,
empty-module deletion and ordered course placement/movement.
Each module lists all its courses, including drafts, with positions from 1 to N.
Selecting a position shifts the intervening courses and saves immediately; the
learner journey uses this sequence. Orders are independent in each journey.
Each course belongs to one journey. Curriculum saves cannot add it to a second
journey or remove its sole placement. Change its journey in the course editor,
which owns subject, difficulty, journey and module selection.

Subjects have immutable slug IDs, bilingual titles and offered numbered levels.
Levels have integer IDs and bilingual titles; a new level uses the next number.
Both tables show counts across all course statuses. Used subjects/levels cannot be
deleted, and used subject-level links cannot be removed. Removing an unused level
also removes it from subjects. The editor only offers the chosen subject's levels;
the Library, Studio list and course player use the dynamic labels from `useContent()`.
Bundled snapshots include default subjects and levels for offline browsing.

The admin API uses three whole-list endpoints, following the existing controller,
service and Repository layers: `/api/curriculum/subjects`, `/api/curriculum/levels`,
and `/api/curriculum/tracks/{track_id}`. `GET /api/curriculum` includes version
stamps. The page saves each operation immediately, with confirmation for removals;
409 stale saves require an explicit reload. Both memory and Postgres repositories
share the invariant checks. Postgres config/course changes and admin audit events
are atomic. Course IDs, prose, source references and learner progress are preserved.
See [the contract](CONTRACT.md#curriculum-configuration-and-concurrency).

### Apply the curriculum migration manually

`20261004150758_curriculum_config.sql` has **not been run**. The Supabase CLI is
unavailable in this workspace, so the SQL file was authored directly. It seeds the
two config keys with `ON CONFLICT DO NOTHING` and replaces `courses_classification`
with a nonempty-string subject check while retaining all fixed-track checks.
It does not alter course content or progress, and keeps existing RLS/grants.

Copy it on macOS:

```sh
rtk proxy pbcopy < /Users/aymen/Desktop/Hackathon/YAQIN/supabase/migrations/20261004150758_curriculum_config.sql
```

In the Yaqin Supabase project, open **SQL Editor → New query**, paste the complete
file (including `begin`/`commit`), review it, and click **Run**. Confirm the query
succeeded, then check the two rows with:

```sql
select key, data, updated_at from public.app_config where key in ('subjects', 'levels');
```

Apply this migration after `20261004133649_course_structure` and before deploying
the API and rebuilt static web export. API fallbacks allow reads before the new
config rows exist; the old subject constraint must be replaced before new subject
IDs can be saved.


### Curriculum verification

The full API suite passes (214 tests), including the curriculum guards, dynamic AI
schema/fallback, and mocked Postgres locking/membership-only writes. Web typecheck,
lint, `check:courses`, `check:auth`, `check:progress`, and content validation pass.
The new route exports successfully in a clean temporary copy with Webpack.

With the isolated memory API and web fixture above running, use an already
the pinned Playwright dev dependency:

```sh
# From web/. Run these suites sequentially: they share the same memory API.
# COURSE_CHROME_PATH optionally selects an installed Chrome executable.
rtk proxy node scripts/check-curriculum-browser.mjs
```

The check covers all three tabs, bilingual desktop/mobile layouts, title edits,
immutable slugs, counts/deletion guards, offered-level cleanup, confirmation and
cancel, course membership and movement, same-module selection, module ordering,
and stale-save recovery. Screenshots are written to
`/tmp/yaqin-curriculum-ui`. The script only accepts a localhost web fixture;
Supabase identity/progress are mocked and all content writes use memory storage.

The new migration and real Postgres transactions have not been executed. Production
Bedrock generation and deployment have not been verified or performed.

## Guided modules across all tracks

The learning hierarchy is Track → Modules → Courses → Pages. Subjects and difficulty
levels classify each course independently of its position in the journey. Modules
may include courses from several subjects. Existing `modules`/`lessons` storage
keys remain compatibility names for modules and ordered course IDs. `goal` is an
optional bilingual module objective, editable in Studio Curriculum.

Every track offers My journey and All courses in the Library. Journey
modules are suggestions: all published courses stay accessible. A Coming soon
entry is a real course whose Coming soon setting an admin turned on (Studio: Course
details), published or not. Learners see its title locked, in its module position; it
cannot be opened and does not count in completed-course denominators. Subject
and difficulty labels appear separately from module and step numbers. Explore Islam
uses plain-language labels for the default technical subjects; custom admin labels
remain authoritative. The Studio course editor links to its module placement, and
the Studio course list and Library can filter by module within a selected track.

The three default journeys are:

- Explore Islam: Getting to Know Islam → Exploring My Questions → Understanding
  Islam in Everyday Life.
- First Steps: Begin with the Essentials → Build My Daily Worship → Continue with
  Confidence.
- Deepen My Knowledge: Strengthen My Foundations → Understand My Worship → Broaden
  My Understanding.

`api/scripts/configure_journey_modules.py` previews a metadata-only upgrade by
default; `--apply` saves all three journeys and relevant shared course memberships
in one database transaction, with an audit event. It retains custom modules,
existing memberships, and preserves subsequent
module edits on repeated runs. It was applied to the configured Yaqin database on
2026-10-04. All 10 course IDs/content/statuses/difficulty values and all 6 progress
rows retained matching fingerprints. No course prose or source text was generated
by this change. The static Coming soon titles it added were removed later:
Coming soon is now a flag on a real unpublished course.
