# Current release: anonymous MCP

MCP requires no account, OAuth client or token. Set `MCP_RESOURCE_URL` to
`https://public-api.yaqeenguide.com/api/v1/mcp/` to enable all four tools.
The Public HTTP API and application accounts retain their existing login.

Deploy the API through the existing deployment workflow, preserving the deployed
runtime, guardrail, database and quota settings. Deploy the web export and edge
route map to remove obsolete MCP OAuth pages. Then disable Supabase **OAuth
Server** and the **Custom Access Token Hook** only if its URI is
`pg-functions://postgres/public/mcp_access_token_hook`. Preserve Google/password
sign-in, email confirmation, SMTP and private Data API policies. The applied
OAuth migration remains historical defense for old tokens; it is not needed by
anonymous MCP and must not be reapplied.

Guest request/model limits reuse durable database reservations and shared service
caps. Production guest IP parsing assumes the verified origin is CloudFront ->
ALB with X-Forwarded-For append mode: the viewer is the second hop from the right.
Keep origin restrictions and update the parser if proxy topology changes. Local
development uses the direct peer. IPv6 guests share a /64; missing/malformed
addresses share one bounded bucket. See [MCP.md](MCP.md) for limits.

Verify anonymous initialization, tool listing, course/source reads and tutoring.
Request exhaustion returns 429 with Retry-After; model quota exhaustion stops
before calling the model. Quota-storage outages fail closed with 503. Public HTTP
requests without tokens continue returning 401. MCP no longer advertises OAuth
metadata. Connect clients with authentication **None**.

Local checks: MCP and Public API pytest suites, public contract export checks,
frontend typecheck/lint and routing checks. Local anonymous MCP checks passed;
production deployment and provider retirement still need verification.

---

# Historical OAuth release record (superseded)

The material below preserves past deployment evidence. Its OAuth setup and
acceptance instructions no longer apply to the current anonymous MCP release.


This is the operator checklist for the code in this repository. The MCP database
migration was applied and verified on 2026-10-05 in project `okcctzpfpreziuxnyepk`
(recorded migration `20261005210404_mcp_oauth`). The token hook and Supabase OAuth
Server are enabled and verified. Authorization Path is `/oauth/consent/`, Site URL
is `https://app.yaqeenguide.com`, and dynamic registration remains off. ChatGPT is
registered as a public OAuth client and approved in the MCP allowlist. ChatGPT's
production OAuth discovery, Google sign-in, consent and token exchange succeeded.
ChatGPT shows Yaqeen connected and discovers all four tools after the deployment
team's host-check fix. A real ChatGPT course-list/detail test returned published
courses and citation IDs. Hosted Claude also completed consent, discovered all
four tools and passed real course-list/detail reads on 2026-10-06 after the
slashless routing fix. OAuth refresh/revocation acceptance checks remain.
Public users should start with [Public API v1](PUBLIC_API.md) and [MCP v1](MCP.md).

## Production rollout: 2026-10-06

The deployment team reports the AWS rollout is complete: API task definition
`yaqin-api:18`, rollback revision `yaqin-api:16`, CNAME/TLS configured, updated
CloudFront routing/function published and web OAuth pages deployed. Their web and
edge backups are in `/tmp/yq-courses/` on the deployment machine; preserve them in
durable storage before that temporary directory is removed.

**Deployment team's authenticated checks:** all four Public API operations passed
with an ordinary account token: 3 published courses, course detail, source detail,
and a cited tutor response in 26 seconds. Unauthenticated requests returned 401;
app/admin paths on the public host returned 404; the existing app was unaffected.
They also applied the updated `sql/operational_budgets.sql`, including the private
`agent_private.model_usage` accounting table. The first build failed because the
Dockerfile copies `docs/`; the corrected build succeeded. Keep `docs/` in future
backend build contexts. Course IDs must come from the current published list;
Studio changes can make older example IDs return 404.

**Independently checked in this task:** public docs, protected-resource metadata,
consent and connections pages return 200. Metadata names the exact trailing-slash
resource and Supabase issuer; unauthenticated MCP returns 401 with the correct
resource-metadata challenge. ChatGPT discovery succeeds with the existing client
and callback. The real PKCE request uses S256 and scopes `openid email offline_access`.

**Real ChatGPT connection:** an initially revoked browser session returned
`403 session_not_found`. Fresh Google sign-in resolved it. After the user's explicit
approval, consent returned 200 and `/oauth/token` returned 200 at
**2026-10-05 23:09:20 UTC** (2026-10-06 01:09:20 Paris); the token hook ran
successfully. Supabase confirms an active OAuth session and consent with
`openid email offline_access`. ChatGPT shows Yaqeen connected to the chosen account.
Initially, settings and a test chat reported no tools. After the deployment team
reported a host-check fix, refreshing the same connected plugin at approximately
**2026-10-05 23:39 UTC** (2026-10-06 01:39 Paris) succeeded: ChatGPT lists
`list_courses`, `get_course`, `get_source` and `ask_tutor`. No new OAuth client or
user grant was needed. A test chat then requested `list_courses` with `limit=3`
and `get_course` for the first returned ID. ChatGPT returned three published IDs
(`what-does-haram-mean-fe2544`, `why-believe-in-god`, `why-were-we-created`) and
the first course's citation IDs (`ref:terminologyenc:47755`,
`ref:terminologyenc:779`). The read test completed around **23:41 UTC**
(01:41 Paris). No tutor call was requested. The UI result is verified; the
deployment team should confirm the actual HTTP status codes in its logs.

**Claude commissioning (2026-10-06):** the user approved registering and connecting
Claude. `Yaqeen Claude` is registered and enabled in the MCP allowlist as a public
PKCE client with no secret; see its registration below. Claude's connector was
created and its assigned client ID entered. Claude stores the server URL without
the final slash; this previously returned 404 and triggered an incorrect fallback
authorization URL.

**Routing fix verified live:** unauthenticated GET and POST to `/api/v1/mcp`
returned 401 with the correct protected-resource challenge at **2026-10-06
00:41–00:43 UTC** (02:41–02:43 Paris). Retrying the existing Claude connector
reached the Yaqeen consent page with the registered callback and requested scopes
`openid offline_access`. After the user's consent approval, Claude showed
**Connected** and listed `list_courses`, `get_course`, `get_source` and `ask_tutor`.
At approximately **00:43–00:45 UTC** (02:43–02:45 Paris), one-time approvals allowed
real `list_courses` and `get_course` calls. Their visible tool results returned
three published courses and detail for `what-does-haram-mean-fe2544`; the answer
included source IDs `ref:terminologyenc:47755` and `ref:terminologyenc:779`.
Test conversation: `53310ae1-0c81-4e11-a301-d4ff5c82a53e`. No tutor call was made.
The deployment team can correlate authenticated transport status codes in its
logs during this window. The first course's English and Arabic topics differ;
this existing published-content mismatch needs editorial review.

The exact-path rule in `infra/cloudfront/index-rewrite.js` internally rewrites
`/api/v1/mcp` to `/api/v1/mcp/`, preserving the method, headers and query without
a redirect. No backend rebuild, migration, token-audience change or new OAuth
client is needed for this fix. The edge regression check passed all 750 existing
route cases plus slashless GET/POST/HEAD; 18 MCP API checks also passed.
Claude OAuth connection, tool discovery and course-list/detail reads passed.
Token refresh, revocation and MCP tutoring remain unverified in production.

**Independent Public API test (2026-10-06 00:50–00:56 UTC / 02:50–02:56 Paris):**
a separate disposable Yopmail account was created through the documented public
Supabase signup API, with default role `learner`. Signup returned no session;
password login before confirmation returned `400 email_not_confirmed`. Resend
marked the confirmation email Delivered. The Yopmail inbox still appeared empty,
so the actual confirmation link was read from this test email's Resend delivery
record; it returned 303 to the trusted app callback. Password login then succeeded.
No admin impersonation, manual email-confirmation update or shared browser-session
replacement was used.

| Live request | Result |
|---|---|
| `GET /courses?limit=25` | 200, three published courses, response schema valid |
| `GET /courses/what-does-haram-mean-fe2544` | 200, course and citations, response schema valid |
| `GET /sources/ref%3Aterminologyenc%3A47755` | 200, approved source, response schema valid |
| `POST /tutor/ask` (`What is wudu?`, English) | 200 in 13.18 s, tier A / allowed, two resolvable citations, response schema valid |
| `GET /courses?limit=0` | 400 |
| Tutor input with an unknown top-level field | 400 |
| Normal account refresh, then a course read with the replacement token | 200 / 200 |

All tested authenticated responses used `Cache-Control: no-store`. Independent
unauthenticated checks also confirmed 401 on all four data operations, 404 on the
public-host admin path, and 200 on docs/reference/Swagger/OpenAPI. This check does
not verify production rate-limit exhaustion, model-budget exhaustion, every tutor
safety outcome, MCP refresh/revocation or MCP tutoring. The new account and its
private local credentials were retained for further tests; no real accounts were
changed.

**Remaining before public announcement:** confirm MCP request status codes in logs
and verify MCP OAuth token refresh and revocation. Email confirmation is enabled;
normal account signup, confirmation, password login and refresh were tested above.
The deployment team should confirm authenticated `initialize` / `tools/list`
success in ECS/ALB logs around **2026-10-05 23:39–23:42 UTC**, including subsequent
`tools/call` requests. Never include tokens or Authorization headers. Record the
host configuration fix and the resulting task revision/image alongside this test.

**Prepared follow-up, not deployed:** OAuth consent and connected-client pages now
clear only a confirmed missing local session and return to sign-in, preserving the
consent URL. The regression check is `web/scripts/check-mcp-auth.mjs`; deploy the
updated web export to replace the misleading “invalid or expired” message for this
case. Other permission/content errors do not clear the session. Public documentation
status corrections in this repository require a backend rebuild to appear live.

**Documentation refresh, prepared for the next backend deployment:** the developer
guide now includes copyable signup/login/refresh commands, ChatGPT and hosted
Claude setup, troubleshooting and dated verification results. Swagger stays short;
Swagger and ReDoc share navigation and schema-valid response examples with
resolvable citations. Rebuild and deploy the backend from the repository root so
the Docker build includes `docs/`. This documentation release needs no Supabase,
OAuth-client or CloudFront configuration changes. Preserve the live MCP resource
URL and client allowlist. After deployment, check `/api/v1/docs`, `/reference`,
`/swagger`, `/openapi.json` and the HTML download under the public API base; confirm
four operations, production URLs in examples and working guide/MCP navigation.

## Deployment team: production only

Deploy into the existing Yaqeen AWS account **744172873146**, region **eu-west-1**,
and Supabase project **okcctzpfpreziuxnyepk**. There is no staging environment in
this handoff. Preserve the existing production secrets and take the rollback
snapshot described below before changing anything.

### URLs to configure and publish

| Purpose | Production value |
|---|---|
| Existing app backend | `https://app.yaqeenguide.com/api` — keep current same-origin app/Studio routing |
| Public API base URL | `https://public-api.yaqeenguide.com/api/v1` |
| Public developer documentation | `https://public-api.yaqeenguide.com/api/v1/docs` |
| Complete schema reference (ReDoc) | `https://public-api.yaqeenguide.com/api/v1/reference` |
| Downloadable HTML developer guide | `https://public-api.yaqeenguide.com/api/v1/docs?download=true` |
| Swagger request explorer | `https://public-api.yaqeenguide.com/api/v1/swagger` |
| OpenAPI schema | `https://public-api.yaqeenguide.com/api/v1/openapi.json` |
| MCP server and backend `MCP_RESOURCE_URL` | `https://public-api.yaqeenguide.com/api/v1/mcp/` |
| MCP protected-resource discovery | `https://public-api.yaqeenguide.com/.well-known/oauth-protected-resource/api/v1/mcp/` |
| Supabase Site URL | `https://app.yaqeenguide.com` |
| Supabase OAuth Authorization Path | `/oauth/consent/` |
| Resulting Yaqeen consent page | `https://app.yaqeenguide.com/oauth/consent/` |
| Revoke connected clients | `https://app.yaqeenguide.com/oauth/connections/` |
| Supabase Auth issuer | `https://okcctzpfpreziuxnyepk.supabase.co/auth/v1` |
| Existing Google provider callback | `https://okcctzpfpreziuxnyepk.supabase.co/auth/v1/callback` |
| Each MCP client's OAuth redirect URI | The exact callback supplied by that client; register it in Supabase's OAuth client configuration |

**A client callback is not the MCP URL or Yaqeen consent page.** The callback is
where the external client receives its authorization code. Get this URL and the
client's OAuth configuration support from its owner; do not invent a shared
callback. Keep the MCP URL's final slash everywhere, including the token audience.
The public API does not require a new redirect URI for password-based scripts.

| Deployment setting | Value |
|---|---|
| Backend `SUPABASE_URL` / web `NEXT_PUBLIC_SUPABASE_URL` | `https://okcctzpfpreziuxnyepk.supabase.co` |
| Web `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The public publishable key in [the developer guide](PUBLIC_API.md#login-without-a-browser) |
| Web `NEXT_PUBLIC_API_BASE` | Empty, so app/Studio keep same-origin `/api` |
| Web `PROD_API_ENABLED` | `true` |
| Backend `ALLOWED_ORIGINS` | `https://app.yaqeenguide.com,https://studio.yaqeenguide.com` |
| Backend `MCP_RESOURCE_URL` | `https://public-api.yaqeenguide.com/api/v1/mcp/` |

Keep existing database credentials and model/guardrail secrets in the production
secret store. Do not expose them in public documentation or frontend settings.

### Release order (reference for subsequent deployments)

1. Run the checks below. Configure web public Supabase URL/key from the developer
   guide, existing same-origin API access, and exact API CORS origins for app and
   Studio. Keep `https://app.yaqeenguide.com/api/*` and Studio's same-origin API
   access. No internal hostname migration or mobile API-base change is required.
   Email confirmation is enabled and a new learner account completed confirmation,
   password login and refresh in the live check above. Preserve the current SMTP
   sender/domain and confirmation settings; the earlier confirmation-off demo
   configuration is historical. See [live Auth settings](AUTH_LIVE_CONFIG.md).
2. Confirm ownership of `public-api.yaqeenguide.com` (external API/MCP). Add it as an alternate domain
   on the existing CloudFront
   distribution `E2Z664SCKULGHC`. Its ACM certificate in `us-east-1` must cover
   that hostname (an existing `*.yaqeenguide.com` certificate covers it). Add a DNS
   CNAME `public-api` → `d1x2w48x0bzbrs.cloudfront.net`, or Route 53 A/AAAA aliases to the
   distribution. Preserve existing aliases and certificate coverage. See
   [AWS custom-domain requirements](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html).
   Deploy the web export, including both OAuth pages, and publish the updated
   `yaqin-index-rewrite` CloudFront function. Use the existing
   [web/edge handover](AWS_ROUTING_HANDOVER.md#4-upload-the-new-export-and-publish-the-edge-rule).
   Static uploads alone do not update the function. `infra/deploy-web.sh` uses
   the verified webpack export path.

   The updated edge function redirects the public hostname's root to public docs,
   permits `/api/v1/*` and MCP discovery there, and rejects application/admin paths.
   App and Studio retain their existing `/api/*` access. The public API hostname
   does not serve static website pages. The API routing command attaches this
   same LIVE function to API and discovery behaviors; publishing it on the static
   default behavior alone does not enforce the public-host route boundary.
   All existing account/role checks remain required.
3. Supabase setup is already applied: migration
   `supabase/migrations/20261005210404_mcp_oauth.sql`, enabled OAuth Server, the Site
   URL/Authorization Path above, and enabled `public.mcp_access_token_hook` under
   Authentication → Hooks → Custom Access Token. Verify these settings; do not
   reapply the migration or replace the hook. Keep dynamic registration off.
4. ChatGPT is already registered and approved; reuse the client ID/callback in
   [ChatGPT commissioning](#chatgpt-commissioning). Manually register any additional
   intended OAuth client with its exact callback, public
   client authentication, PKCE and `openid`; share its assigned client ID with
   the client owner. Add that UUID to `mcp_private.clients` using the SQL below.
   An empty allowlist authorizes nobody. Confirm that the intended client supports
   a pre-registered client ID before onboarding it. For the selected first client,
   follow [ChatGPT commissioning](#chatgpt-commissioning).
5. Export `MCP_RESOURCE_URL` above, approved runtime/guardrail values and quotas.
   Run backend `build` and `routing` as described below. CloudFront must forward
   `/api/*` and the discovery path to the API without caching, with the host-aware
   viewer-request function attached. Ensure the two web OAuth routes still use
   the static origin. Preserve app/Studio `/api/*` behaviors and existing mobile
   configuration; they are the intended internal application routing.
6. Before announcing access, run the hosted OAuth and public API acceptance checks
   below using an isolated learner account in production. Disable MCP by deploying
   an empty `MCP_RESOURCE_URL` if any auth check fails. Record the release/task/image
   and client validation results.

**Handoff status:** code and consent/revocation UI are supplied, and the MCP
migration is applied. Initial verification confirmed an empty approved-client allowlist,
restrictive OAuth policies on all 16 public RLS tables, preserved ordinary app
claims and rejection of an unapproved OAuth identity. The user activated
`public.mcp_access_token_hook` in the dashboard; enabled status, Auth permissions
and ordinary-claim preservation were verified. Supabase OAuth Server is enabled,
with the exact consent path and dynamic registration off. Public discovery responds
with HTTP 200 and advertises PKCE S256; the signing key uses ES256. The approved
ChatGPT client was then added with its exact callback, public type and token endpoint
authentication `none`. A hook check still denies an approved client without an
active session/consent. AWS is now deployed by the deployment team; the live
unauthenticated checks above passed. ChatGPT and hosted Claude production OAuth
connections succeeded and discovered all four tools. Real course-list/detail
tests returned data in both clients. Token refresh/revocation checks remain
pending; other MCP clients and MCP tutoring have not been verified in production.

The MCP resource and token audience now use `public-api.yaqeenguide.com`; the consent
page and Supabase Site URL stay on `app.yaqeenguide.com`. Do not redirect MCP
requests between hosts or issue tokens for the former app-host resource URL.
The applied MCP migration uses this fixed public-host audience.

## What ships

- Four authenticated HTTP operations under `/api/v1`, a polished HTML developer guide,
  complete ReDoc schema reference and separate Swagger testing/OpenAPI.
- Four equivalent remote MCP tools, enabled in production through `MCP_RESOURCE_URL`.
- Shared account/service request limits and existing conservative model budgets.
- Approved/public content boundaries, 64 KiB request cap and no-store responses.
- Versioned generated HTTP/MCP contract snapshots checked in CI.

The existing ECS backend, PostgreSQL ledger and CloudFront distribution are
reused. No new repository, API Gateway or documentation platform is required.
One private approved-client table is added by the MCP migration. Notion may host
the welcome page and link to the live documentation URL.
Partner API-key management, usage billing/dashboard and anonymous WAF rules are
not added by this release. Corpus search is intentionally excluded.
Invalid and authentication-failed requests are not all covered by the account
ledger; keep edge protection for anonymous traffic. PostgreSQL reservations are
atomic across replicas; ledger outages fail closed with 503.

## 1. Review and verify locally

From `api/`, with dependencies installed from `pyproject.toml`:

```bash
rtk proxy .venv/bin/python -m scripts.export_public_contracts
rtk proxy .venv/bin/python -m scripts.export_public_contracts --check
rtk proxy .venv/bin/python -m pytest -q
rtk proxy .venv/bin/python scripts/check_postgres.py
```

The last command starts a disposable local TLS PostgreSQL cluster, applies the
schema and runs the suite with real storage. It requires local PostgreSQL tools;
it never targets production. CI uses Python 3.12 and the same SQL/storage checks.
Fixtures disable live credentials and model calls. Run a real supported MCP
client/OAuth flow separately; signed local JWT tests do not validate a hosted
consent page or production authorization-server discovery.

From `web/`, also run `npm run typecheck`, `npm run check:mcp-auth`,
`npm run check:routing` and `npm run build -- --webpack`. The focused MCP check
is included in CI and the frontend verification runner.

When a contract changes, regenerate both JSON files and `docs/public-api-v1.html`, inspect the diff, assess
compatibility and update the `1.0.0` values in `app/main.py`,
`app/controllers/mcp_controller.py` and `scripts/export_public_contracts.py`.
Snapshots flag drift, not semantic breaking changes. Preserve a tagged code
release and announce changes with a changelog/migration guide as appropriate.

## 2. Prepare production settings

Confirm the runtime PostgreSQL connection has the permissions from
`sql/operational_budgets.sql`, following [Supabase setup](SUPABASE_SETUP.md).
The public limiter reuses that server-only ledger. Browser roles must never gain
access to its reservation function or rows. Do not grant elevated DB roles to a
partner. Application startup does not apply SQL migrations.

Set request and cost allowances explicitly if the defaults do not match the
launch budget. Values must be positive integers:

```bash
export PUBLIC_API_RATE_PER_MINUTE=60
export PUBLIC_API_SERVICE_RATE_PER_MINUTE=500
export TUTOR_RATE_PER_MINUTE=12
export TUTOR_TOKENS=200000
export USER_DAILY_TOKENS=10000000
export SERVICE_DAILY_TOKENS=100000000
export SERVICE_RATE_PER_MINUTE=500
```

Token reservations are ceilings, not measured invoices. Use existing model
observability/billing to assess costs. The HTTP tutor preserves the selected
local/remote agents runtime. MCP always uses approved-source in-process tutoring,
so verify its Bedrock permissions and published guardrail before enabling it.

To release HTTP first, leave `MCP_RESOURCE_URL` empty. To enable MCP, complete the
OAuth consent, approved-client resource-audience hook and token-family checks in
[MCP setup](#mcp-authorization-setup), then set:

```bash
export MCP_RESOURCE_URL=https://public-api.yaqeenguide.com/api/v1/mcp/
```

Supply that setting on every deployment that should keep MCP enabled; an unset
setting disables the endpoint. Do not override ordinary app token audiences.
Configure exact `ALLOWED_ORIGINS` for approved browser integrations.
`MCP_ALLOWED_HOSTS` accepts additional comma-separated exact hostnames (optional
ports), not a blanket hostname wildcard. The public resource host and actual ALB
DNS are added automatically by the deployment script.

The production secret file remains root `.env`; never paste or publish its
contents. The Docker/source archive excludes environment files and includes
`api/`, `content/` and `docs/` so the HTML guide can load its source
templates/guides. No separate docs hosting service or frontend build is needed.

Use the deployment script's packager rather than a hand-written source ZIP:
`rtk proxy bash infra/deploy-api.sh package /tmp/yaqin-source.zip` requires no AWS
credentials and checks the actual archive against every plain Dockerfile `COPY`
input. Missing source paths stop the upload before CodeBuild starts; new `COPY`
inputs must be added to the packager. CI exercises this same packaging path.

### MCP authorization setup

The adapter uses the official Python MCP SDK (`mcp==2.3.0`), stateless Streamable
HTTP and JSON responses. Protocol `2025-11-25` is covered by integration checks;
smoke-test every intended client/protocol combination before release. Product
version `1.0.0` is separate from the negotiated protocol version.

1. Build and deploy the web consent page `/oauth/consent/` and grant-management page
   `/oauth/connections/`. They reuse existing sign-in and preserve the OAuth request
   across password/Google sign-in. Classify both routes in the edge route table.
2. Already applied: `supabase/migrations/20261005210404_mcp_oauth.sql`. Verify the
   existing migration record instead of reapplying it. It creates the
   server-only approved-client list and `public.mcp_access_token_hook`, and adds
   restrictive policies preventing OAuth clients from using private Data API tables.
   Keep this OAuth restriction on any new public RLS tables too. The hook preserves
   ordinary app sessions; OAuth token issuance is denied without live approved consent.
3. Already configured in Supabase Authentication → OAuth Server: enabled, Authorization
   Path `/oauth/consent/`, Site URL `https://app.yaqeenguide.com`, dynamic registration
   **off**. Register intended clients manually with exact
   callback URLs, public client authentication and Authorization Code + PKCE.
   Use the callback supplied by the intended production client. Scope must include
   `openid`; the client must support its assigned pre-registered client ID.
4. Approve each registered UUID through the server-only allowlist:

   ```sql
   insert into mcp_private.clients(client_id) values ('APPROVED_OAUTH_CLIENT_UUID');
   -- Operator disable/re-enable:
   update mcp_private.clients set enabled=false where client_id='APPROVED_OAUTH_CLIENT_UUID';
   ```

   Select `public.mcp_access_token_hook` as the Custom Access Token Hook. Do not
   replace an existing hook without incorporating its behavior; this project had
   no existing hook at inspection. The hook derives scopes from the Auth session
   and live consent, and sets only the fixed MCP audience. It never trusts user
   metadata or arbitrary resource URLs. The backend independently rechecks session,
   consent and client approval/deletion for every MCP request, plus account status
   on every tool call.
5. Verify a real hosted Authorization Code/PKCE exchange, refresh and denial flow;
   then revoke the grant and confirm that the existing access token is rejected.
   Confirm ordinary password/Google sessions still work, MCP tokens are rejected
   by HTTP v1 and private Data API tables, and no tokens appear in logs.
6. Set `MCP_RESOURCE_URL` and deploy the backend/metadata routing for commissioning.
   Do not announce it until the real client smoke test succeeds; disable MCP if
   the checks fail. Enabling OAuth or installing the migration alone does not
   complete deployment.

Current state: consent/grant UI is deployed. The MCP
migration is applied and verified in production, with **two approved clients: ChatGPT and Claude**.
The token hook and OAuth Server are enabled, and AWS discovery/routing is live.
The real production OAuth connection and discovery of all four tools succeeded;
the ChatGPT and hosted Claude course list/detail tests returned data. Token refresh and revocation
still need verification. The browser-session
recovery fix is prepared for web deployment.

Protected-resource metadata is served at:
`https://public-api.yaqeenguide.com/.well-known/oauth-protected-resource/api/v1/mcp/`.
It names the exact resource, the `openid` scope and `SUPABASE_URL/auth/v1` issuer.
The backend verifies tokens and never issues them. Valid MCP tokens require a
verified signature/issuer, unexpired `exp`, UUID `sub`, non-anonymous identity,
OAuth `client_id`, `openid` in the space-delimited `scope`, and `aud` matching the
exact MCP URL. Current account permissions are checked on every tool call.

`openid` is not a granular read/tutor permission. This release requires an active
learner account for all tools. Supabase's documented OAuth server does not support
arbitrary custom scopes. Partner keys, granular scopes and service accounts are not implemented.
The server-only `mcp_private.clients` allowlist restricts token issuance and requests
to explicitly approved clients. Grant revocation is checked on every request.

MCP OAuth tokens are never forwarded to agents/RAG with a different audience.
The adapter uses in-process approved-source tutoring. The HTTP tutor may use
eligible unreviewed library passages through its configured agents runtime.

References: [SDK authorization](https://py.sdk.modelcontextprotocol.io/run/authorization/),
[MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
[Supabase MCP setup](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication),
[token audience hooks](https://supabase.com/docs/guides/auth/oauth-server/token-security),
[OAuth flows/scopes](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows),
[password login](https://supabase.com/docs/guides/auth/passwords),
[REST token endpoint](https://github.com/supabase/auth#post-token), and
[Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google).

### ChatGPT commissioning

Use a pre-registered **public OAuth client**, Authorization Code + PKCE, token
endpoint authentication `none`, and no client secret. ChatGPT supports this setup;
automatic registration does not need to be enabled.

1. Open [ChatGPT Plugins](https://chatgpt.com/plugins) → Add → Create custom MCP
   server. Name it **Yaqeen**; enter
   `https://public-api.yaqeenguide.com/api/v1/mcp/`, select OAuth, and expand Advanced
   OAuth settings. Choose **User-defined OAuth client**.
2. Resume the existing ChatGPT draft and reuse the registered client below. Confirm
   its callback still matches. If a new draft generates a different callback,
   update this client's redirect URI in Supabase Authentication → OAuth Apps;
   do not create duplicate registrations or add wildcard callbacks. Enter the
   registered client ID in ChatGPT. Keep the client secret empty and token endpoint
   authentication `none`.
3. Use `openid` as the base scope and `offline_access` for refresh access. Prefer
   discovered settings after the public endpoint is deployed. If entering them
   manually, use the verified values below; leave the registration URL empty.
4. Create the personal MCP plugin, complete Yaqeen sign-in and explicit consent,
   and test tool discovery, a course read, refresh and revocation. Record the
   resulting client ID/callback and acceptance results here. Publishing to a public
   plugin directory is a separate action.

| ChatGPT OAuth field | Verified value |
|---|---|
| Authorization server / issuer | `https://okcctzpfpreziuxnyepk.supabase.co/auth/v1` |
| Authorization URL | `https://okcctzpfpreziuxnyepk.supabase.co/auth/v1/oauth/authorize` |
| Token URL | `https://okcctzpfpreziuxnyepk.supabase.co/auth/v1/oauth/token` |
| Resource | `https://public-api.yaqeenguide.com/api/v1/mcp/` |
| OIDC configuration | `https://okcctzpfpreziuxnyepk.supabase.co/auth/v1/.well-known/openid-configuration` |
| OIDC userinfo | `https://okcctzpfpreziuxnyepk.supabase.co/auth/v1/oauth/userinfo` |

**Registered and verified (2026-10-05), after user approval:**

| Registration | Value |
|---|---|
| Supabase OAuth app | `Yaqeen ChatGPT` |
| Client ID (public identifier) | `33c75d25-dd62-4fc2-9853-c10dae096cd4` |
| Exact redirect URI | `https://chatgpt.com/connector/oauth/_ZDdybktyMYC` |
| Client type / token authentication | `public` / `none`, no client secret |
| `mcp_private.clients.enabled` | `true` |

Database verification confirmed the registration values and allowlist row. The
token hook still returns 403 without a live authorized user session/consent.
Before deployment, discovery/creation failed. On 2026-10-06, discovery succeeded
and ChatGPT accepted the configuration, showing its Connect screen and initiating
the real authorization request after user approval. The callback is unchanged.
Fresh Google sign-in resolved the initial `403 session_not_found` browser error.
After user approval, live consent and the PKCE token exchange succeeded, and
ChatGPT shows Yaqeen connected. The personal plugin ID is
`plugin_asdk_app_6ac42bfeb0cc819192676cbf417af4d0`. Supabase confirms active consent
and a live OAuth session. After the deployment team's host-check fix, refreshing
the same plugin lists all four tools, and the ChatGPT course-list/detail test
returned published courses and citation IDs.
Inspect the authenticated MCP request logs as described above. Inspect the
callback again if recreating the connection.
This registration is for this ChatGPT connection;
additional connections may supply different callbacks and must be reviewed separately.

Do not substitute `https://chatgpt.com/connector_platform_oauth_redirect`: that
shared callback requires advertised RFC 9207 issuer-response support. Current
Supabase metadata does not advertise it, so this setup uses the callback supplied
by ChatGPT for this connection. See [OpenAI OAuth registration and callbacks](https://developers.openai.com/plugins/build/auth)
and [custom MCP setup](https://developers.openai.com/api/docs/guides/custom-mcp-server).

### Claude commissioning

| Registration | Verified value |
|---|---|
| Supabase OAuth app | `Yaqeen Claude` |
| Client ID (public identifier) | `2a6e97ec-c18c-4f7f-858d-d2c161875e65` |
| Exact hosted-Claude redirect URI | `https://claude.ai/api/mcp/auth_callback` |
| Client type / token authentication | `public` / `none`, no secret |
| `mcp_private.clients.enabled` | `true` |
| Claude custom connector ID | `a6889ac2-41dd-4a5f-b9d8-9c266ee268b6` |

Registration and allowlist were verified after the user's approval. Claude's
**Customize → Connectors → Add custom connector** form uses the production MCP
URL, **Sign in now**, **Use your own OAuth client**, the client ID above, an empty
secret and **Streamable HTTP**. No fixed request-header credentials are needed.
The existing connector is saved; do not recreate it or reuse ChatGPT's client ID.
The edge fix is verified live and connection reaches Yaqeen consent requesting
`openid offline_access`. The user approved consent; Claude showed Connected,
discovered all four tools and passed course-list/detail reads with one-time tool
approvals. Token refresh, revocation and MCP tutoring checks remain. This
registration covers hosted Claude; Claude Code's separate loopback flow is not
commissioned here.

The exact callback, optional secret and PKCE S256 behavior are documented in
[Anthropic's OAuth requirements](https://claude.com/docs/connectors/building/authentication).
Dynamic registration and CIMD remain off; the manually registered public client
uses the existing account consent and resource-audience protections.

## 3. Deploy to the existing AWS application account

Select the existing application profile and independently verify its account.
The deployment script refuses denied work profiles and a mismatching expected
account. Existing explicit tutor and published guardrail settings remain mandatory.

```bash
export YAQIN_AWS_PROFILE=<approved-application-profile>
export EXPECTED_AWS_ACCOUNT_ID=<approved-12-digit-account-id>
export GUARDRAIL_ID=<published-standard-tier-guardrail-id>
export GUARDRAIL_VERSION=<published-numeric-version>
# Preserve the currently approved runtime:
export TUTOR_RUNTIME=local
# For remote instead: TUTOR_RUNTIME=remote and AGENTS_SERVICE_URL=<actual-https-origin>

rtk proxy bash infra/deploy-api.sh build
rtk proxy bash infra/deploy-api.sh routing
```

Run these from the repository root after substituting real approved values;
angle-bracket placeholders are not executable commands. `build` rebuilds through
CodeBuild and registers/updates ECS with the public quota/MCP settings. It also
refreshes the selected runtime IAM configuration. It requires existing AWS
infrastructure. `all` is the existing full provisioning path and is unnecessary
for a routine release.

Keep the printed CodeBuild build ID and poll that build if a local wait is
interrupted; do not start a replacement while it is still running. Likewise,
inspect the existing ECS rollout or CloudFront invalidation before retrying a
deployment. A stopped local command does not cancel work already submitted to AWS.

Each invocation creates a unique image tag by default; optionally set a unique
`IMAGE_TAG` for a named release. Never reuse it. `latest` is refused so new task
revisions can reference a stable release artifact. Existing ECR retention keeps
only ten images; preserve required rollback images before they expire.

`routing` updates CloudFront routing without building or updating ECS tasks.
It uses the same approved account/runtime configuration. This update is needed
once for MCP metadata discovery, not on every HTTP-only code change. It keeps
unrelated behaviors and sends these paths to the existing verified ALB origin:

| Path | Origin/cache behavior |
|---|---|
| `/api/*` | Existing API origin; caching disabled |
| `/.well-known/oauth-protected-resource/*` | Same API origin; caching disabled |

The behavior forwards authorization, MCP headers and query strings using
AllViewerExceptHostHeader. The SDK must therefore trust the actual ALB Host;
the enabled-MCP task renderer fetches and adds it. Keep `X-Origin-Verify` and the
existing origin network restrictions in place. All public paths require HTTPS
through CloudFront. Existing non-MCP browser CORS is preserved and MCP protocol
headers/challenges are exposed to permitted origins.

## 4. Smoke-test through the public hostname

Use a test learner and approved OAuth client. Never record raw tokens in logs.
Basic unauthenticated checks:

```bash
rtk proxy curl -fsS https://app.yaqeenguide.com/api/health
rtk proxy curl -fsS https://public-api.yaqeenguide.com/api/v1/openapi.json
rtk proxy curl -fsS -o /dev/null https://public-api.yaqeenguide.com/api/v1/docs
rtk proxy curl -fsS -o /dev/null https://public-api.yaqeenguide.com/api/v1/reference
rtk proxy curl -fsS -o /dev/null https://public-api.yaqeenguide.com/api/v1/swagger
# Optional standalone handoff copy:
rtk proxy curl -fsS 'https://public-api.yaqeenguide.com/api/v1/docs?download=true' -o developer-guide.html
# Expect 401 with WWW-Authenticate: Bearer:
rtk proxy curl -i https://public-api.yaqeenguide.com/api/v1/courses
# Public hostname must not expose app/admin endpoints: expect 404.
rtk proxy curl -i https://public-api.yaqeenguide.com/api/content
rtk proxy curl -i https://public-api.yaqeenguide.com/api/admin/users
```

Then use the developer quick-start commands with a current learner session:
verify listing/detail/source output, bilingual content and no internal metadata.
In browser developer tools, confirm app and Studio retain their same-origin
`/api/*` requests and bearer headers, with no CORS errors. Check that normal
app/mobile sessions and staff workflows still work. Use an
isolated production test account for quota exhaustion; do not
alter shared live source approval just to run a smoke test.

For enabled MCP, fetch its well-known metadata and connect the intended OAuth
client. Confirm the resource exactly matches the trailing-slash URL, sign-in and
consent/refresh work, all four tools appear, and `get_course` returns citations.
Verify ordinary app tokens are rejected at MCP, expired/wrong-resource tokens fail,
missing scope fails, and disabling the test account blocks its next tool call.
Test shared HTTP/MCP limits and one explicit tutor request only when a model call
and its cost are intended. Validate refusals/referrals as well as answer rendering.
Do not publish a claim of Claude/ChatGPT compatibility without testing that client.

Watch existing ECS/ALB errors and Bedrock usage after rollout. Never log tokens
or private learner history in access/debug traces. Announce the documentation URL and
MCP URL only after the corresponding production checks pass.

## Rollback

Before release, record the currently running ECS task definition ARN and resolved
container image digest, plus the relevant non-secret runtime configuration.
After release, record the new task ARN/image tag and contract version.
ECS deployment circuit breaking already handles startup failure. For an
operator rollback, redeploy the recorded known-good task revision and wait for
service stability; keep the same account safeguards. If the old revision used
mutable `latest`, pin its recorded image digest in a rollback task revision first:
redeploying the old `latest` task alone does not identify the old image.

To disable only MCP, deploy with empty `MCP_RESOURCE_URL`; HTTP v1 remains available.
Leave the private MCP table and restrictive policies in place when disabling MCP;
they do not block ordinary app sessions. This release requires no new public-ledger
migration to reverse. CloudFront's
metadata behavior can stay while MCP is disabled; it then returns unavailable.
OAuth changes are separate: preserve existing app audiences and roll back only
the approved-client hook/consent changes if necessary.
