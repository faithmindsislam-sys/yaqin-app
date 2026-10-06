# Supabase setup for Yaqin

## Values needed

- Supabase Project URL and **publishable key** (or legacy anon key).
- Postgres connection string from **Connect → Transaction pooler**, including the database password. Our shared root `.env` already contains the backend connection settings.
- Exact frontend origin: local port and production domain.
- For Google login: Google OAuth web client ID and secret, entered into the Supabase Google provider settings.
- For confirmation/reset emails to real users: SMTP host, port, username/password and verified sender, entered into Supabase SMTP settings.

Never put database passwords, Supabase secret/service-role keys, Google secrets or SMTP passwords in `NEXT_PUBLIC_*` variables.

## Database

On a new project apply `supabase/migrations/0001_init.sql`, `0002_complete_backend.sql`, `0002_source_extra.sql`, `0003_auth_language.sql`, and `0004_account_roles.sql` in order. On an existing project apply only missing migrations, once each. `0002_complete_backend.sql` backfills account profiles and protects role changes; `0002_source_extra.sql` preserves source metadata such as scholarly explanations and recitation details; `0003_auth_language.sql` preserves signup language and synchronizes profile language to auth email metadata; `0004_account_roles.sql` migrates `instructor` to `teacher` and `reviewer` to `admin`, adds `super_admin`, and updates staff read policies without allowing browser role/content writes.

After configuring the API environment, seed from `api/`:

For a new database, before deploying the course API, apply missing migrations through
`0008_profile_avatar.sql`, then `20261004133649_course_structure.sql`. The latter
migrates existing course metadata in place and completed AI draft results, preserving
IDs, content, exact difficulty values, sources, progress and review history. It backs up
old classification metadata in `lessons.legacy_classification`, keeps the existing
table/FK names and RLS, and makes historical `track`/`module` columns nullable.
The active classification is `data.subject`, `data.level`, `data.tracks`; there are
no active course tags. Existing track group order is retained.

**Live project status (2026-10-04):** prerequisites were already present in Yaqin
(`okcctzpfpreziuxnyepk`), and `20261004133649_course_structure.sql` has now been
applied and recorded under its repository version. No further course migration is
required on this project. Live API repository reads and content/progress/history
preservation checks passed; see [verification details](COURSE_STRUCTURE.md#deployment).

`20261004144921_security_worker_access.sql` is also applied and recorded under
its exact repository version. Its recorded SQL matches the file. The course
migration and all prior history entries were left unchanged. On another existing
project, apply this security migration once after the account/profile migrations.
It skips absent external-service tables in a standalone Yaqin database; if those
tables are provisioned later, enable RLS and remove browser grants at creation.
Older numbered repository files have legacy live history names/versions: inspect
both before any bulk migration push and never replay them solely because their
filenames differ. Do not reapply the recorded course or security migrations.

Deploy the new API after the migration, then rebuild and deploy the web export.
Keep both `/course/` and `/lesson/` and both Studio editor paths on the static host.
The old API course endpoints remain compatibility aliases. Seeding does not update
existing database rows; the migration performs those updates.

```sh
rtk proxy .venv/bin/python -m scripts.seed --no-embed
```

Seeding inserts new records without reverting database review decisions or instructor edits. Remove `--no-embed` when Bedrock embedding access is configured. Sources stay pending until a scholarly reviewer approves them; the tutor abstains until then.

## Frontend environment

Our tracked root `.env` already configures the shared Supabase project. No copying or
credentials setup is needed after cloning. Use port 3100, which has allowed Auth callbacks.
For a different project only, copy `.env.example` over `.env` and fill these settings:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
NEXT_PUBLIC_API_ENABLED=true
```

A legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works. Restart development after changes. Static production builds require these variables at **build time**; rebuild and redeploy. Leave API_BASE empty when the host routes `/api/*` to FastAPI; otherwise set the backend origin, without `/api`.

Before the backend is hosted, set `NEXT_PUBLIC_API_ENABLED=false` and build the static
site. It uses the published `/data/content.json` CDN snapshot without API requests or
a live-content warning. Supabase signup/login and learner sync work independently.
Course editing and AI requests remain unavailable until the API is enabled. The existing
snapshot fallback also handles a live API outage. Set the flag to `true` after hosting.
Login, auth callbacks and password recovery remain accessible during content outages.

## API environment

In the same root `.env` or deployment secrets:

```dotenv
ENV=local
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:URL_ENCODED_DB_PASSWORD@YOUR_POOLER_HOST:6543/postgres?sslmode=require
ALLOWED_ORIGINS=http://localhost:3100
DEV_ROLE=
```

Copy the actual pooler details from Supabase; hosts vary by project. URL-encode special characters in the password. Set `ENV=prod` and the exact HTTPS frontend origin in production. Multiple CORS origins are comma-separated. Keep DEV_ROLE empty.

Asymmetric JWT signing (ES256/RS256) needs no JWT secret: the API verifies Supabase JWKS. Only legacy HS256 projects require `SUPABASE_JWT_SECRET` on the backend. AWS access is needed for the AI tutor, not login.

## Supabase Auth

Enable **Email** and allow new signups. Keep email confirmation enabled for real users and set the password minimum to at least 8 characters.

In **Authentication → URL Configuration**, set Site URL to the production frontend origin (or `http://localhost:3100` for local testing). Add the exact redirect URLs:

```text
http://localhost:3100/auth/callback/
http://localhost:3100/reset-password/
https://YOUR_FRONTEND_DOMAIN/auth/callback/
https://YOUR_FRONTEND_DOMAIN/reset-password/
```

Replace 3100 everywhere if using another port. Keep trailing slashes. Email confirmation and Google login return to `/auth/callback/`; recovery returns to `/reset-password/`. The static host must serve both exported directories and their `index.html` files. Default email templates using `{{ .ConfirmationURL }}` work; customized templates must preserve the requested redirect.

References: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [password recovery](https://supabase.com/docs/guides/auth/passwords).

## Google and SMTP

Create a Google OAuth **Web application** client. Add frontend origins to Authorized JavaScript origins and this URI to Authorized redirect URIs:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

Enable Google in Supabase providers and enter the client ID/secret there.
[Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).
Our recorded Google setup requests only `openid`, `userinfo.email` and `userinfo.profile`.
Google exempts these basic identity scopes from the Testing user allowlist, so Testing
status alone does not explain another account failing. Internal audiences, additional
scopes and Google Workspace administrator policies can restrict access.
[Google audience rules](https://support.google.com/cloud/answer/15549945?hl=en).

For a repeatable setup on another hosted Supabase project, store `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `AUTH_SITE_URL`, `AUTH_REDIRECT_URLS` and `SUPABASE_ACCESS_TOKEN`
in root `.env`. The access token is a Supabase account Management API token with
Auth configuration access to the target project; it is not its publishable or service-role key.
The Google client must authorize the target project's Supabase callback URI above.
The script derives the project ref from `NEXT_PUBLIC_SUPABASE_URL` and rejects a different
backend `SUPABASE_URL`. From `web/`:

```bash
npm run auth:check                  # Read public settings; diagnose missing config/disabled Google
npm run auth:configure              # Preview project, Site URL and redirects; no remote changes
npm run auth:configure -- --apply    # Enable Google and apply the reviewed settings, then verify
```

Applying updates Google credentials and Site URL, and adds redirects while preserving
existing ones. Review the Site URL before applying to a shared/production project.
The command does not create Google Cloud clients, change Google's consent audience or
configure SMTP. Sharing an already-configured Supabase project requires only its public
URL/key for browser login, not Google secrets or a Management API token. Backend access
still needs its database settings, which are included in our shared root `.env`.
That file is intentionally tracked for teammates using the same project; `.env.example`
is only a template for a different project. Do not replace our working `.env` with it.

### Troubleshooting a teammate's checkout

| Symptom | Cause and fix |
|---|---|
| Google and email buttons are disabled | Missing frontend Supabase URL/public key at build time. The old README created an env file with only the API URL. Fill root `.env`, restart development or rebuild/redeploy. |
| `Unsupported provider: provider is not enabled` | Google is disabled on the Supabase project selected by the URL. Enable it there or use the configure command. GitHub does not transfer hosted provider settings. |
| Google rejects the account | Check Google Cloud audience, actual requested scopes and Workspace administrator policies. Testing alone does not restrict our recorded basic identity scopes; additional scopes may require test users. |
| `redirect_uri_mismatch` | The Google client needs the target Supabase `/auth/v1/callback` URI, rather than the frontend callback. |
| Returns to our hosted site instead of the teammate's localhost | Add the teammate's exact frontend `/auth/callback/` URL, including port and trailing slash, to Supabase's redirect allowlist. |
| Works locally but deployed buttons stay disabled | `NEXT_PUBLIC_*` values are frozen in the exported JavaScript. Rebuild with the correct values and redeploy. |

The API and web app load root `.env` independently of the current working directory.
Merge old `api/.env` and `web/.env.local` values there; the old files are no longer loaded.
Optional frontend production overrides belong in root `.env.production.local`; shell
variables override files. Never put secrets in Next's `env` configuration object, which
would expose them to clients regardless of prefix.

Configure custom SMTP before testing confirmation/reset delivery to non-team users; the default mail service restricts recipients and delivery rates. [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).

Signup offers English or Arabic and saves `user_metadata.lang`. The localized native Supabase templates in `supabase/templates/localized/supabase-auth.json` use that metadata to send one language, with English as the fallback. Changing the account language updates future email language. Configure SMTP first, then paste each subject/body into its corresponding Supabase email template. Keep the Supabase template variables intact.

The actual live configuration and future `yaqin.org` DNS records are recorded in [AUTH_LIVE_CONFIG.md](AUTH_LIVE_CONFIG.md).

## Staff roles

New profiles default to learner. Promote a trusted account through the Supabase SQL editor:

```sql
update public.profiles set role = 'teacher' where id = 'YOUR_TEACHER_AUTH_USER_UUID';
-- Content reviewers/publishers: role = 'admin'.
-- Platform owner: role = 'super_admin' (future user/role/quota tools).
```

Browser clients cannot change their role, and signup metadata never grants staff access.
Teachers create and submit their own drafts in `/studio/`. Admins and super admins
approve verified sources and publish submitted lessons. `/instructor/` remains available
for existing links. Authentication fields stay in Supabase Auth; profiles hold the role,
display name and learner preferences. See [the account contract](CONTRACT.md#accounts-and-access)
for the fields, permissions and work deferred until backend hosting. Subdomains are not
configured by this migration. A future role-management endpoint must require
`super_admin` server-side and record every change; admins cannot grant themselves access.

## Verify the real project

`GET /api/health` must show `store: "postgres"` and `db: true`.

Check signup → confirmation → login; Google login; logout/login; forgot password → recovery form → login with the new password. Complete a lesson as a guest, sign up, and verify progress on another device. Check two users cannot access each other's progress or change roles. Save and submit a teacher draft, approve sources as an admin, publish it, and verify it appears without a frontend rebuild.

`supabase/tests/backend_rls.sql` provides transactional checks of ownership, role protection and progress merging; its test data is rolled back.
`supabase/tests/account_roles.sql` checks signup defaults, staff draft visibility and
browser write protection for all four roles after the role migration; it also rolls back.
`supabase/tests/profile_settings.sql` (after `0008_profile_avatar.sql`) checks that a user can save their own name and picture but cannot edit another profile or their own role; it also rolls back.
The role/progress fixtures now include the classification required by the course
migration. Run these tests against the current schema, not a pre-course database.
`supabase/tests/security_worker_access.sql` verifies browser denial for the external
worker tables, owner/service-role generation operations, atomic lease acquisition
and release, signup profile defaults, language synchronization and trigger-function
ACLs. Run each SQL file as the database owner in the SQL editor or with
`rtk proxy psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/FILE.sql`
from the repository root. Keep the connection value private. All fixtures roll back.

Local checks do not verify live credentials, Google consent settings, redirect URLs or SMTP delivery.

## Security verification and remaining advisories (2026-10-04)

The new security migration enables RLS on `public.gen_jobs` and `public.kb_leases`
and revokes all table privileges from PUBLIC, `anon` and `authenticated`, including
TRUNCATE. It adds no browser policies. Existing `postgres` ownership/BYPASSRLS and
explicit `service_role` grants remain. It removes anonymous/PUBLIC execution of
`current_role_name()` and all direct browser/service-role execution of the two
trigger functions. Function bodies, owners, SECURITY DEFINER, fixed empty search
paths, triggers and existing access policies are unchanged.

Caller inspection found no direct Yaqin/browser use of either external worker
table or these trigger functions. Yaqin's `PostgresRepository` uses private
`DATABASE_URL` connections for its own draft jobs and account operations; its
configured connection was verified as `postgres` with BYPASSRLS. In
`faithminds-course-generator`, `deploy/gen_service.py` inserts/reads `gen_jobs`,
`deploy/gen_worker.py` reads parameters and updates generation results, and
`deploy/rag_worker.py` atomically acquires/releases `kb_leases`. These use pg8000
with private `DATABASE_URL`, not the browser user's database role. Live login roles
and active connections showed no custom worker role; existing deployment instructions
require a privileged connection. Keep that connection for existing workers. A future
dedicated worker role needs explicit grants and a reviewed RLS bypass/access model.

The migration was rehearsed and rolled back, then applied in one transaction with
its exact version/SQL history record after all four SQL test files passed. Tests
were rerun against the committed live state and rolled back. Anonymous users and
all four signed-in app roles were denied SELECT/INSERT/UPDATE/DELETE on both tables.
`postgres` and `service_role` passed generation CRUD and competing-holder lease
checks. Signup-trigger profile creation, metadata role protection, authenticated
language updates synchronized to Auth, role-based draft/audit access, profile
ownership, progress ownership and atomic progress merge passed.

Row counts and full-row fingerprints for every public table plus Auth users,
identities and sessions matched before/after within the locked transaction; fixtures
were rolled back, and existing policies/function definitions/history were unchanged.
The existing seven generation jobs and one KB lease were retained. No content,
sources, users, roles, drafts, progress or history were removed. SQL signup testing
exercises the `auth.users` INSERT trigger as the database owner; the managed Auth
role cannot be assumed by `postgres`. It does not verify HTTP signup/email delivery.

Afterward the live security advisor reported **zero ERROR findings**, no anonymous
SECURITY DEFINER warnings, and no trigger-function execution warnings. Remaining:

| Advisory | Reason / action |
| --- | --- |
| [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), six INFO findings | `admin_events`, `draft_jobs`, `gen_jobs`, `kb_leases`, `rag_resources`, `tutor_logs` are intentionally server-only. No browser policies should be added. |
| [Authenticated SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), one WARN | `current_role_name()` only reads the caller's profile via `auth.uid()`. Authenticated staff SELECT policies require execution; preserve this intentional access. |
| [Leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), one WARN | The project's organization is on Free (`tier_free`); this feature requires Pro or above. Billing was not changed. Enable it in Auth password settings if an eligible plan is independently approved later. |

Repository validation passed: **185 backend tests**, frontend auth/progress checks,
type checking, lint and production static export. The first webpack build hit a
local cache/hash error; an isolated fresh output directory passed with all 27 pages.
No app or Lambda deployment was performed. Before production, complete the existing
Google/SMTP/redirect and real-session acceptance checklist above, and the external
RAG authentication rollout/legacy-token removal in [KNOWLEDGE_BASE.md](KNOWLEDGE_BASE.md).
These database tests establish worker SQL access; they do not claim a live S3/SQS/
Bedrock ingestion run. The external generation API's local handler also has no
user-auth check: review its gateway/API authorization before exposing it in production,
since database RLS does not authorize calls made through a privileged backend.

Local validation: `rtk proxy .venv/bin/python -m pytest -q` in api; `rtk npm run check:auth`, `rtk npm run check:progress`, `rtk npm run lint`, and `rtk proxy npm run build -- --webpack` in web.
