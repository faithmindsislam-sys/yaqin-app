# Studio Knowledge Base and RAG integration

The Yaqin frontend and backend integration lives in this repository. The separate
RAG implementation lives in `faithmindsislam-sys/faithminds-course-generator`.
Publishing these changes to Git does not deploy either service.

## Request flow

The browser uses its existing Supabase session to call Yaqin's FastAPI backend.
The backend requires the `admin` permission, including `super_admin` and legacy
`reviewer`, then uses `RagGateway` to call the separate RAG service. It forwards the
caller's `Authorization: Bearer <access_token>` per request, without storing it on
the shared HTTP client. RAG verifies the signature against the same Supabase project's
JWKS and independently checks the current database role and account ban status.
The browser uploads file bytes directly to the returned presigned S3 URL with
the matching Content-Type; it does not send its session or service token to S3.

| Browser/backend route | Upstream RAG route |
| --- | --- |
| `POST /api/admin/rag/documents` | `POST /rag/documents` |
| `GET /api/admin/rag/documents/{id}/status` | `GET /rag/documents/{id}/status` |
| `GET /api/admin/rag/resources` | `GET /rag/resources` |
| `POST /api/admin/rag/resources/toggle` | `POST /rag/resources/toggle` |
| `POST /api/admin/rag/retrieval/test` | `POST /rag/retrieval/test` |

The backend validates filenames, MIME types, document IDs, strict boolean
toggles, JSON field selections, and retrieval queries. Retrieval is rate limited.
Missing service URL returns 503; missing user tokens return 401 before contacting
RAG. Upstream 401/403 responses reach the caller with the same status. Transport
failures return a safe 502. No separate RAG service token is used by Yaqin.

## Deployment settings

The shared root `.env` contains the project settings. For a different project, merge the settings from root `.env.example` into its root `.env`
or the hosted FastAPI environment:

```dotenv
RAG_SERVICE_URL=https://4h0ertfiu6.execute-api.us-east-1.amazonaws.com
```

The URL is public configuration. Actual tokens, database passwords, and existing
private env files are ignored by Git. Keep the backend's existing Supabase config.
Restart or redeploy FastAPI after updating code or settings; its OpenAPI schema
must include the five routes above. Use a real signed-in admin session: local
`DEV_ROLE` does not create a Supabase token and cannot authenticate upstream.

Deploy the updated RAG API first with
`SUPABASE_URL=https://okcctzpfpreziuxnyepk.supabase.co`, then deploy this Yaqin backend.
The RAG API temporarily accepts its old `RAG_SERVICE_TOKEN` for existing clients.
After verifying the user JWT flow, remove that legacy env variable from the Lambda
and any obsolete Yaqin env copy so all requests require a user identity. The exact
Lambda package, rollout, and acceptance instructions are in the RAG repository's
`deploy/SUPABASE_AUTH.md`. Only its API Lambda needs deploying for auth; the worker
PDF changes remain unchanged. No Supabase schema migration is needed.

Before building the frontend, set `NEXT_PUBLIC_API_ENABLED=true` and configure
the existing public Supabase URL and publishable key. For local development,
`NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000`. In production, use the hosted backend
base or leave it empty when the host routes `/api/*` to FastAPI. Next.js embeds
these public settings at build time, so rebuilding and deploying the frontend
is required. The existing CDN-only setting `false` disables API requests.

## Frontend behavior

`/studio/knowledge-base/` is available to admin and super-admin accounts in both
Studio navigation layouts, in English and Arabic. It provides:

- Resource list, filename/status/enabled filters, status polling, and details.
- File upload, pasted text, and JSON with selected text/title fields and preview.
- Matching Content-Type uploads with progress, cancellation, expiry/error handling,
  and a 20 MiB client limit. JSON extraction also occurs in the RAG worker.
- Individual and batch toggles, including partial-update feedback.
- Retrieval tests scoped to ready, enabled resources, with passages and scores.
- Statistics for the entire active library, independent of list pages and filters.
  Status counts open the full matching resource list and clear any search text.
  Pending totals refresh while Statistics is open. If the upstream deployment
  does not yet return statistics, the UI shows an unavailable message instead of
  presenting page counts as library totals.

Deploy the RAG API with the `statistics` field in `GET /rag/resources`, then rebuild
and deploy the web client. The existing FastAPI gateway passes this field through;
no database migration or re-embedding is required for the statistics fix.

Failed upload registration is preserved. Retrying or replacing a resource creates
a new registration; it does not delete the old row or its cloud artifacts.
Unknown chunk counts display as unavailable. The UI never fabricates ingestion
completion or retrieval results.

## Verification

Run the backend tests from `api/`:

```sh
rtk proxy .venv/bin/python -m pytest -q
```

Run frontend checks from `web/`:

```sh
rtk proxy npm run typecheck
rtk proxy npm run lint
rtk proxy npm run check:auth
rtk proxy npm run check:onboarding
rtk proxy npm run check:progress
rtk proxy npm run check:knowledge-base
rtk proxy npm run build
```

API tests mock the upstream HTTP service and disable live infrastructure. Browser
checks in `web/scripts/check-knowledge-base-browser.mjs` use isolated auth/API/S3
fixtures against a dev server configured for ports 8798/8797/8799, with an installed
Playwright module. They do not establish that the cloud deployment is working.

The original combined source was verified on 2026-10-04: 172 backend tests, frontend
type checking and lint, all four frontend check scripts above, and the production
static export passed. The subsequent JWT-forwarding change passed all 175 backend
tests, including token propagation on all five routes, concurrent caller isolation,
missing tokens, and upstream 401/403 handling. It changes no frontend code.
The production build used Node 24.19.0 with fresh build caches.
The auth check also covers the team's newer async drafting workflow: missing
sources produce feedback, and completed jobs open their already-saved draft.

After both services are deployed, verify anonymous and teacher requests are
rejected, an admin can list/register/toggle, a real upload completes, and retrieval
returns its known phrase while enabled and excludes it after disabling.

## Work still owned by the deployment team

Deploy RAG's new API auth code and this Yaqin backend in the order above, then run
live acceptance tests with a real Supabase session. Supabase MCP verified the shared
project's ES256 signing keys and required role/ban/resource schema. AWS deployment
cannot be performed through Supabase MCP; the deployment owner needs AWS access.
Source publication and offline tests do not establish that the auth rollout is live.

Follow the remaining cleanup steps in the RAG repository's `deploy/KNOWLEDGE_BASE.md`:
quarantine the two failed test source objects and their sidecars, synchronize the KB,
and verify the full usable corpus load. Confirm the existing IAM and SQS settings.

Scanned Arabic still needs an Arabic-capable OCR engine and quality validation.
True vector chunk counts, list pagination, and delete/edit/reprocess endpoints
remain unavailable upstream. Old chunks missing resource metadata need controlled
re-ingestion. The original ten test records are disabled, but that does not remove
their S3 artifacts.
