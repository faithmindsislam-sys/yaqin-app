# yaqeenguide.com

The web app, its `/api/*` backend, the Quran reader data (`/data/quran/*`) and the
recitation MP3s (`/resources/quran/audio/...`) are all served by one CloudFront
distribution, `E2Z664SCKULGHC` (`d1x2w48x0bzbrs.cloudfront.net`). Its aliases are
`yaqeenguide.com`, `www.yaqeenguide.com`, `app.yaqeenguide.com` and
`studio.yaqeenguide.com`, with the ACM certificate for `yaqeenguide.com` and
`*.yaqeenguide.com` (us-east-1, `1d648aa3-…`). Everything under those paths is readable
without an AWS account: S3 stays private and CloudFront reads it through origin access.

The web bundle requests Quran data and audio from the same origin (`/data`,
`/resources`), so the reader works on every hostname. The API allows CORS from all
four hostnames and the CloudFront name (`ALLOWED_ORIGINS`, task definition
`yaqin-api:8`).

## Server-to-server services

App/Studio/mobile keep their existing backend routing, including
`https://app.yaqeenguide.com/api/*` and same-origin Studio requests. External developer API
and MCP access use `https://public-api.yaqeenguide.com/api/v1` and
`https://public-api.yaqeenguide.com/api/v1/mcp/`. Both reuse the existing
CloudFront/API backend. Add DNS and the CloudFront alias for `public-api`, keep
the production web `NEXT_PUBLIC_API_BASE` empty for same-origin API requests, and
retain exact app/Studio CORS origins. The public hostname has not been deployed by this task.
Sign-in/consent stay on the app hostname. See the [production handoff](PUBLIC_API_RELEASE.md).

| Service | Custom domain | API Gateway target (CNAME value) | Current caller URL |
|---|---|---|---|
| RAG (`rag-http-api`, `4h0ertfiu6`) | `rag.yaqeenguide.com` | `d-8ig8mcgscd.execute-api.us-east-1.amazonaws.com` | `https://4h0ertfiu6.execute-api.us-east-1.amazonaws.com` |
| Agents (`faithminds-agents`, `qaei5iavui`) | `agents.yaqeenguide.com` | `d-4236aydfud.execute-api.us-east-1.amazonaws.com` | `https://qaei5iavui.execute-api.us-east-1.amazonaws.com` |

Both custom domains exist, use the wildcard certificate, map the `$default` stage
with an empty path, and answer exactly like the execute-api URLs (verified with
`curl --connect-to`). After the CNAMEs below resolve, set `RAG_SERVICE_URL` and
`AGENTS_SERVICE_URL` in the API task definition (and the defaults in
`infra/deploy-api.sh`) to the custom domains, then redeploy.

## DNS records to set at IONOS (the domain's DNS host)

| Host | Type | Value | Status on 2026-10-05 |
|---|---|---|---|
| `www` | CNAME | `d1x2w48x0bzbrs.cloudfront.net` | done |
| `app` | CNAME | `d1x2w48x0bzbrs.cloudfront.net` | done |
| `studio` | CNAME | `d1x2w48x0bzbrs.cloudfront.net` | done |
| `rag` | CNAME | `d-8ig8mcgscd.execute-api.us-east-1.amazonaws.com` | to add |
| `agents` | CNAME | `d-4236aydfud.execute-api.us-east-1.amazonaws.com` | to add |
| `@` (apex) | — | must reach CloudFront | **wrong**: A `217.160.0.230` (an IONOS server) |

The apex currently serves an IONOS page over HTTP and fails over HTTPS. A DNS host
cannot point a bare domain at CloudFront with a CNAME, and CloudFront has no fixed IP
for an A record. Host the zone in Route 53 with an ALIAS record for the apex to
the distribution, or use equivalent apex ALIAS/ANAME support from the DNS provider.
For a zone move, copy every existing record (including MX `mx00/mx01.ionos.fr`,
SPF/DKIM TXT, the CNAMEs above and certificate validation) before changing the
nameservers at IONOS. Export the full IONOS zone first so no record is lost.
The bare domain must serve the public site directly over HTTPS; forwarding it to
`www` would conflict with the canonical redirects. See the AWS handover below.

## Authentication and canonical domains

Supabase's **Site URL was set and verified on 2026-10-05** as
`https://app.yaqeenguide.com`. The existing `https://app.yaqeenguide.com/**`
redirect entry allows callback queries containing the validated `next` path.
Local development and the existing legacy callback entries remain accepted.

Google's authorized redirect URI remains
`https://okcctzpfpreziuxnyepk.supabase.co/auth/v1/callback` (verified in Google Cloud).
The frontend sends Google, signup and resend callbacks to
`https://app.yaqeenguide.com/auth/callback/`, and recovery links to
`https://app.yaqeenguide.com/reset-password/`. Password login and OAuth return to
an allowlisted requested page, or `/learn/` for an onboarded learner and
`/journey/` for a new learner. Logout returns to `https://yaqeenguide.com/`.
Errors retain the current screen; an auth connection failure shows Retry.

Studio restores the app session through an iframe at
`https://app.yaqeenguide.com/auth/bridge/`. Messages require the exact origin,
parent/frame window, protocol channel, and request ID. For the Studio exchange, access/refresh tokens are never included in navigation
URLs, domain-wide cookies, or public pages. Only
app and Studio can exchange the session. Studio logout clears both origins;
Studio startup/focus checks the authoritative app session, so stale cached
Studio credentials cannot sign the user back in after app logout.

The public site uses the same bridge's read-only `status` action to show
Dashboard for signed-in learners. It receives only a boolean, never tokens or
profile data, and refreshes on page return/focus. Both the apex and `www` site
origins are allowed; session exchange and sign-out remain restricted to Studio.

CloudFront currently sends `X-Frame-Options: SAMEORIGIN`. The AWS engineer must
attach `infra/cloudfront/auth-bridge-headers.json` to a dedicated `/auth/bridge/*`
behavior; it removes that header **only for the bridge** and sets CSP
`frame-ancestors https://studio.yaqeenguide.com https://www.yaqeenguide.com https://yaqeenguide.com`.
Retain the existing protection on every other behavior. Update this policy
alongside the web export for Studio session continuity and the public header.

Email delivery is separate from redirect correctness: custom SMTP is enabled
with `smtp.resend.com:465`. On 2026-10-05, `yaqeenguide.com` was verified in
Resend after its three DNS records were published at IONOS. Supabase now uses
`noreply@yaqeenguide.com`, and email confirmation is enabled. A fresh Yopmail
signup, confirmation callback, subsequent password login, Arabic recovery
delivery and recovery callback passed against the production app. The older
`yaqin.org` entry remains unused and unverified. DNS records, quotas and test
details are in [AUTH_LIVE_CONFIG.md](AUTH_LIVE_CONFIG.md).

## Host routing

The shared manifest is `web/src/lib/routes.json`. Both frontend navigation and
CloudFront use it; `web/scripts/sync-edge-routes.mjs` regenerates the embedded
edge table and `npm run check:routing` checks they agree. Every new exported page
must be classified, or the inventory check fails.

| Surface | Canonical host | Pages |
|---|---|---|
| Public site | `yaqeenguide.com` | `/`, `/privacy/` (home sections use `/#sources` and `/#method`) |
| Learner app | `app.yaqeenguide.com` | `/learn/`, `/journey/`, `/settings/`, `/library/`, `/course/`, `/lesson/`, `/quran/`, `/compare/`, `/ask/`, `/shahada/`, `/first-steps/`, `/worship/`, `/start/`, `/start/explore/` |
| Authentication | `app.yaqeenguide.com` | `/signin/`, `/auth/callback/`, `/reset-password/`, `/auth/bridge/` |
| Studio | `studio.yaqeenguide.com` | `/courses/`, `/editor/`, `/curriculum/`, `/users/`, `/knowledge-base/`, `/sources/` |

A document request for a classified page on another hostname receives a 308
redirect directly to the canonical hostname and path, preserving query
parameters. `www` redirects to the bare domain for public pages. Visiting the
app root sends the user to `/learn/`, whose onboarding gate chooses `/journey/` when needed. Studio's root redirects to `/courses/`,
keeping its course list distinct from the public homepage in the static export. Studio uses `/editor/` so its
editor cannot be confused with the learner's `/course/` route in one static export.

| Old URL path (on any managed domain) | Canonical destination |
|---|---|
| `/app/` | `https://app.yaqeenguide.com/journey/` |
| `/app/learn/` | `https://app.yaqeenguide.com/learn/` |
| `/app/settings/` | `https://app.yaqeenguide.com/settings/` |
| `/studio/`, `/instructor/` | `https://studio.yaqeenguide.com/courses/` |
| `/studio/course/`, `/studio/lesson/` | `https://studio.yaqeenguide.com/editor/` |
| `/studio/curriculum/`, `/studio/users/`, `/studio/knowledge-base/`, `/studio/sources/` | corresponding clean path on `studio.yaqeenguide.com` |

Known pages also normalize case, trailing slashes, `.html` and `/index.html`
aliases. Unknown pages remain 404 candidates rather than being sent to the login
page. Authentication and staff authorization still apply independently of routing.

Assets and `/api/*` stay on the requesting origin. Background RSC/prefetch/HEAD
requests receive no cross-origin redirect, avoiding the previous browser CORS
failure. Frontend links and programmatic navigation apply the same host policy,
and the root route guard covers already-open bundles after client navigation.
Localhost keeps the logical `/studio/...` paths for development. Classified
document requests on the raw CloudFront hostname redirect to the same canonical
product URLs.

**Publication is pending AWS work.** Uploading static files does not publish a
CloudFront function. See `docs/AWS_ROUTING_HANDOVER.md` for the exact sequence,
DNS/TLS work, bridge policy, rollback and production acceptance checks.

## Public Quran files

CloudFront serves everything under `/data/quran/*` and `/resources/quran/*` from
`yaqin-resources-744172873146` to anyone. The bucket itself stays private: Block Public Access is
on, and its policy allows `s3:GetObject` only to the CloudFront service principal for this
distribution (`AWS:SourceArn`) on those two prefixes. Direct S3 URLs return 403.
