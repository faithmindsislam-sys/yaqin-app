# Frontend audit implementation

Baseline: `4c07fa4f30f7c92f3cba7c5fa716801aad84ba14`
(`chore: checkpoint current hackathon implementation`). Existing intended frontend,
backend, and documentation work was committed before any audit changes.

## Implemented behavior

- Editor drafts survive sidebar navigation, reload, and tab navigation in the same
  browser session. Recovery is keyed by account and course. Dirty documents warn
  before browser unload; the explicit Studio back link confirms an exit.
- A save captures the submitted revision. Responses preserve later typing and leave
  newer changes open and unsaved. Successful unchanged saves clear recovery data.
- Editor load requests and AI generation are invalidated when their owner leaves or
  switches. A late generation result cannot replace a manual draft.
- Content loading, an empty catalog, and failure are distinct. The app keeps its
  children and navigation mounted; Settings and unrelated features remain usable.
  Retry restores content, and refresh failures retain previously loaded live data.
- Course preview renders formatted HTML and legacy plain text. Course, quiz,
  companion, and notes state follow the current course and account; late companion
  responses cannot appear under another course.
- Invalid Ask track parameters and malformed persisted preferences, chat, and
  progress are rejected or normalized before rendering.
- Mobile and desktop sign-out controls are accessible and localized. Failed
  sign-out retains the current route/account and displays an error; navigation
  follows successful sign-out. The installed Supabase SDK also removes local
  sessions on certain server failures, so the previous session is restored on error.
- Dictation detaches callbacks and stops recognition on navigation/unmount.
- Companion/notes inputs, branding, and password visibility have translated labels.
  Landing copy accurately describes account requirements. Sign-in uses a styled
  fallback instead of Pinterest. Unfinished comparison sections have a clear
  bilingual empty state without fabricated material.

## Organization and cleanup

`app/` has thin route entry points and shared layouts. Domain components live in
`features/auth`, `courses`, `learning`, `studio`, `quran`, `ask`, `compare`, and
`onboarding`. Studio has course-editor, curriculum, users, and knowledge-base
folders. The editor separates content, activities, details, document load/save,
recovery storage, and model helpers. Feature APIs, wording, and substantial
editor/onboarding/curriculum styles are colocated. Shared HTTP, Supabase, storage,
i18n, types, branding, layout, and reusable controls remain shared.

Removed after reference checks: `clsx`, `StarPattern`, `Strings`, and the old
`src/generated/content.json` test dependency. Onboarding checks use the bundler's
`public/data/content.json`. Removed the unreachable questionnaire, its memory-only
provider, topic suggestions/preferences helpers, and exclusive styles. The visible
introduction, four topic previews, declaration, and continuation logic remain.
Hidden lesson actions carry explicit restoration comments and are retained as
deferred functionality.

Preserved: static export and trailing slashes, API contracts, course IDs and legacy
normalization, account-scoped progress keys, shared-track progress, and `/lesson`,
`/studio/lesson`, and `/instructor` compatibility routes.

## Verification

From `web/`:

```sh
rtk npm run verify:frontend
# An installed Chrome can replace Playwright's downloaded Chromium:
rtk proxy env COURSE_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run verify:frontend
```

Use `npm ci` and, if needed, `npx playwright install chromium` first. Playwright is
pinned as a dev dependency. The runner executes types, lint, course/progress/
onboarding/track/auth/knowledge-base/Quran focused checks, builds the configured
production export with Webpack in a temporary copy, asserts legacy/current route
outputs, and serves it to credential-free browser tests. Environment files are
excluded; external application requests are mocked or aborted. Existing local
development build output is untouched. The root layout uses an explicit children
type so fresh-checkout typechecking does not require prior Next generated types. No CI workflow existed to extend.

Browser regressions exercise actual React lifecycles with held responses:
recovery through sidebar and Back/Forward, typing during a save, obsolete course
loads, generation/manual-draft races, formatted preview, quiz/companion boundaries,
notes and completion, account switching, dictation cleanup, malformed stored data,
failed/successful sign-out, content outage/empty/retry, signed-out and role guards.
English/Arabic and desktop/mobile cases also assert direction, horizontal layout,
and absence of page/React errors. Screenshots: `/tmp/yaqin-frontend-audit`.

The additional real FastAPI browser suites are documented in
[COURSE_STRUCTURE.md](COURSE_STRUCTURE.md#local-verification). They run sequentially
against an isolated in-memory API with deterministic AI and checked-in Quran
references. The browser uses local bundled Quran data; Supabase identity/profile/
progress is mocked. These suites cover manual/AI save, preview, review/publish,
Library uniqueness, completion, track switching, compatibility URLs, and
curriculum editing/concurrency. Screenshots: `/tmp/yaqin-course-ui` and
`/tmp/yaqin-curriculum-ui`.

Results: TypeScript, ESLint, all eight focused checks, the 28-route production
static export, four lifecycle/browser layouts plus outage/role cases, all four real
course workflow layouts, and all four curriculum layouts passed. Screenshots were
inspected for desktop English and mobile Arabic. The committed audit snapshot is
also checked separately from concurrent uncommitted Knowledge Base/content work.

## Scope and remaining decisions

No push, deployment, migration, production AI call, or production data mutation was
performed. Production identity/storage and real Postgres transactions are outside
these local frontend checks. Draft recovery lasts for the browser session and
requires available session storage. Retained hidden lesson controls and unfinished
comparison material remain product/content decisions, with no fabricated content.
Concurrent changes to `content/tracks.json`, `content/validate.py`, the new
Why believe in God course/provenance/source files, and Knowledge Base pagination
in the API/frontend were preserved and excluded from audit commits.

## Commits

- `fa9d313` — repair current course/account focused checks.
- `6842f59` — draft preservation, async boundaries, outage access and lifecycle fixes.
- `b2c8960` — account copy, translated labels, comparison empty state and sign-in fallback.
- `27d22f4` — isolated production export and browser regression command.
- `735ffac` — feature organization and editor responsibility split.
- `9c9b99f` — verified deletions and unreachable questionnaire cleanup.
- `2e95777` — thin public route entry points.

- `a8bd96e` — current authoring controls, local Quran fixture and Quran verification.
