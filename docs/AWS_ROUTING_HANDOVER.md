# AWS handover: canonical Yaqeen routing

The source fix and Supabase fallback configuration are complete. **AWS deployment
is pending; the live site still has the old routing.** Deploy the web export,
CloudFront function and bridge headers together. This handover contains only the
hosting work; no Google OAuth client change or Supabase Site URL change is needed.

## Required result

| Surface | Canonical URL |
|---|---|
| Public site | `https://yaqeenguide.com/` and `/privacy/` |
| Sign in | `https://app.yaqeenguide.com/signin/` |
| Learner dashboard | `https://app.yaqeenguide.com/learn/` |
| Choose journey / settings | `https://app.yaqeenguide.com/journey/`, `/settings/` |
| Studio | `https://studio.yaqeenguide.com/courses/` (root redirects here) |
| Studio editor | `https://studio.yaqeenguide.com/editor/` |
| Studio administration | `/curriculum/`, `/users/`, `/knowledge-base/`, `/sources/` on the Studio host |

Every classified page on another product hostname redirects directly to its
canonical host and path. The visible URL must contain neither `/app/` nor
`/studio/`. Query parameters survive. `www.yaqeenguide.com` redirects to the bare
domain for public pages. Do not add `www.studio.yaqeenguide.com`.

All routes and compatibility aliases are in `web/src/lib/routes.json`; the full
page inventory and auth behavior are documented in `docs/DOMAIN.md`.

## Existing resources and confirmed problems

- AWS account: `744172873146` (from the existing deployment configuration).
- Distribution: `E2Z664SCKULGHC`, `d1x2w48x0bzbrs.cloudfront.net`.
- Site S3 bucket: `yaqin-web-744172873146`, region `eu-west-1`.
- Quran S3 bucket: `yaqin-resources-744172873146`; preserve its separate behaviors.
- Viewer-request function: `yaqin-index-rewrite`, on the default behavior.
- Aliases should include bare domain, `www`, `app`, `studio`, `public-api`; ACM certificate in
  `us-east-1` must cover `yaqeenguide.com` and `*.yaqeenguide.com`.

The external API/MCP hostname `public-api.yaqeenguide.com` uses the additional deployment steps in
[Public API/MCP handoff](PUBLIC_API_RELEASE.md). API traffic keeps the existing
paths; sign-in and consent remain on the app hostname.
- Verified on 2026-10-05: bare-domain DNS resolves to `217.160.0.230` and HTTPS
  fails. Studio currently redirects to `app.yaqeenguide.com/studio/`. Public
  privacy currently redirects to app. The default response includes
  `X-Frame-Options: SAMEORIGIN`.

## 1. Fix DNS and TLS for the bare domain

Make the bare domain reach the same CloudFront distribution over valid HTTPS.
Use a Route 53 public hosted zone and A/AAAA ALIAS records for `yaqeenguide.com`
to the distribution, or an equivalent apex ALIAS/ANAME supported by the current
DNS provider. A plain apex CNAME or CloudFront IP address is not a substitute.

If moving the zone from IONOS, export and copy the entire current zone before
changing nameservers, including MX, SPF, DKIM, TXT, certificate-validation and
other subdomain records. Preserve mail and the existing API/service domains.
Keep `www`, `app` and `studio` pointing to the distribution. Validate ACM and
CloudFront aliases before making DNS authoritative. The final bare domain must
serve the site directly; forwarding bare-domain traffic to `www` would conflict
with the new canonical redirects.

## 2. Back up the current deployment

Save the current distribution config and LIVE function source before changing
them. Retain the previous web deployment artifact (or an S3 version/snapshot)
for rollback. Example, from the repository root with authenticated AWS CLI:

```bash
ROUTING_BACKUP=$(mktemp -d)
aws cloudfront get-distribution-config --id E2Z664SCKULGHC > "$ROUTING_BACKUP/distribution.json"
aws cloudfront get-function --name yaqin-index-rewrite --stage LIVE "$ROUTING_BACKUP/index-rewrite-live.js"
aws cloudfront describe-function --name yaqin-index-rewrite --stage DEVELOPMENT > "$ROUTING_BACKUP/function-development.json"
```

Keep this directory and the previous web artifact until acceptance passes.

## 3. Add the narrowly scoped session-bridge behavior

Create or update a response-headers policy from
`infra/cloudfront/auth-bridge-headers.json`:

```bash
aws cloudfront create-response-headers-policy \
  --response-headers-policy-config file://infra/cloudfront/auth-bridge-headers.json
```

If the named policy already exists, update it using its current ETag instead of
creating a duplicate. Add a higher-priority behavior with path pattern
`/auth/bridge/*`. Copy the default behavior's S3 origin, OAC, allowed methods,
cache/origin request settings, compression, HTTPS policy and viewer-request
function association. Attach the new response-headers policy to this behavior.
Use minimum cache TTL 0 for HTML/auth documents so the deployment's `no-cache`
metadata can take effect.

The bridge response must have **no `X-Frame-Options` header** and must include:

```text
Content-Security-Policy: frame-ancestors https://studio.yaqeenguide.com https://www.yaqeenguide.com https://yaqeenguide.com
```

The existing `SAMEORIGIN` header must remain on all other pages. Studio and the
public site must be able to load `https://app.yaqeenguide.com/auth/bridge/` in
their hidden iframe. The public site can request only a signed-in boolean;
token exchange and sign-out remain restricted to Studio. Update this policy
alongside the web export so the signed-in public header can work.
The session protocol additionally validates the exact origin, source window and
request ID. Keep TLS enabled. No session tokens are sent in redirect URLs.

## 4. Upload the new export and publish the edge rule

Use the current public Supabase URL and publishable key in the build environment.
The backend must remain available through `/api/*` on app and Studio. Preserve the
existing API and Quran behaviors. The API CORS allowlist must include both
`https://app.yaqeenguide.com` and `https://studio.yaqeenguide.com`.

```bash
cd web
npm ci
npm run typecheck
npm run lint
npm run check:routing
npm run check:auth
npm run check:onboarding
npm run check:tracks
cd ..
bash infra/deploy-web.sh
```

The deployment script sets production API access on by default, builds with
same-origin `/api`, `/data` and `/resources`, uploads the export and invalidates
CloudFront. It preserves old immutable Next chunks for already-open tabs.
`PROD_API_ENABLED=false` would deliberately disable Studio functionality; do not
set it for the production application. Avoid an inherited
`YAQIN_CHECK_DIST_DIR`: the deployment needs the standard `web/out` export.

Then preserve the existing function configuration while updating its code:

```bash
aws cloudfront describe-function --name yaqin-index-rewrite --stage DEVELOPMENT \
  --query FunctionSummary.FunctionConfig --output json > "$ROUTING_BACKUP/function-config.json"
ROUTING_ETAG=$(aws cloudfront describe-function --name yaqin-index-rewrite \
  --stage DEVELOPMENT --query ETag --output text)
ROUTING_ETAG=$(aws cloudfront update-function --name yaqin-index-rewrite \
  --if-match "$ROUTING_ETAG" \
  --function-config "file://$ROUTING_BACKUP/function-config.json" \
  --function-code fileb://infra/cloudfront/index-rewrite.js --query ETag --output text)
aws cloudfront test-function --name yaqin-index-rewrite --stage DEVELOPMENT \
  --if-match "$ROUTING_ETAG" --event-object fileb://infra/cloudfront/smoke-event.json
```

Inspect `TestResult`: there must be no function error. The sample must return
status **308** with Location
`https://app.yaqeenguide.com/learn/?track=explore`. Only then publish:

```bash
aws cloudfront publish-function --name yaqin-index-rewrite --if-match "$ROUTING_ETAG"
aws cloudfront create-invalidation --distribution-id E2Z664SCKULGHC --paths '/*'
aws cloudfront wait distribution-deployed --id E2Z664SCKULGHC
```

Confirm the LIVE function is attached to the default behavior and bridge
behavior. Static uploads alone do not publish the function. Complete upload,
publication and invalidation in the same release window: mixed old/new files
and routing can produce redirect loops.

For the API/MCP release, `infra/deploy-api.sh routing` must also attach this LIVE
function to `/api/*` and MCP discovery behaviors. It preserves the public-host
boundary, so application/admin endpoints return 404 on `public-api`. Verify
app/Studio bearer requests and existing same-origin API routing.

AWS CLI references: [update-function](https://docs.aws.amazon.com/cli/latest/reference/cloudfront/update-function.html),
[test-function](https://docs.aws.amazon.com/cli/latest/reference/cloudfront/test-function.html),
[publish-function](https://docs.aws.amazon.com/cli/latest/reference/cloudfront/publish-function.html).

## 5. Production acceptance

Check with GET document requests (`Accept: text/html`), not only HEAD probes.
Verify DNS and certificate validation without bypassing TLS errors.

| Request | Required response |
|---|---|
| `https://yaqeenguide.com/` | public landing page, 200 |
| `https://www.yaqeenguide.com/` | 308 to bare-domain root |
| `https://app.yaqeenguide.com/` | 308 to `/learn/` on app; first-time learners then choose a journey |
| `https://app.yaqeenguide.com/app/learn/?track=explore` | 308 to `https://app.yaqeenguide.com/learn/?track=explore` |
| `https://yaqeenguide.com/learn/` | 308 to app `/learn/` |
| `https://app.yaqeenguide.com/privacy/` | 308 to bare-domain `/privacy/` |
| `https://www.yaqeenguide.com/studio/` | 308 directly to Studio `/courses/` |
| `https://studio.yaqeenguide.com/` | 308 to Studio `/courses/`, preserving query parameters |
| `https://app.yaqeenguide.com/studio/course/?id=test` | 308 to `https://studio.yaqeenguide.com/editor/?id=test` |
| `https://studio.yaqeenguide.com/learn/` | 308 to app `/learn/` |
| `https://studio.yaqeenguide.com/editor/` | editor document, then the normal auth/role gate |
| `https://app.yaqeenguide.com/auth/bridge/` | bridge document; exact Studio/public-site frame policy, no X-Frame-Options |
| unknown page | real 404, not a cached landing page with status 200 |

In a browser, verify: public Sign in goes to app; password and Google login
return to `/learn/` or the requested page; Studio and Back to app switch hosts
without another login; refresh on Studio root/editor/curriculum works; app and
Studio logout return to the bare-domain site; a signed-out deep Studio link
returns to the same editor and query after login. Confirm no CORS or blocked
iframe errors and that Arabic/mobile navigation uses the same domains.

Check that any CloudFront custom S3 error responses preserve HTTP 404 and do not
turn missing application routes into a status-200 homepage. Keep RSC/prefetch
requests and static assets on their origin; they must not follow cross-origin
document redirects.

## Rollback

Restore the saved web artifact and LIVE function source together, restore the
previous distribution behavior/header config if needed, and invalidate `/*`.
Use fresh ETags for each CloudFront update. Preserve the newly correct apex DNS
unless it caused an independently verified DNS problem. Do not roll back only
one of the edge rule or web export: their route inventories must agree.

## Verification already completed locally

The route inventory and 710 edge cases cover every exported page and legacy alias,
host ownership, case/trailing-slash/HTML normalization, query preservation,
redirect loops, API/assets and background requests. The production export,
types, lint and role/onboarding checks pass. The dedicated browser regression
uses the real exported React app and Supabase SDK with local fixtures; no live
account creation or email delivery is part of that check. It verifies password
failure/success, Google callback and deep-page return, Studio session continuity,
both logout paths and failure recovery, signup/resend destinations, expired
reset links, password updates and safe fallback for an invalid return URL.

To reproduce the isolated browser regression from `web` (all network requests
are fulfilled with local fixtures):

```bash
YAQIN_CHECK_DIST_DIR=.next-routing NEXT_PUBLIC_API_ENABLED=true NEXT_PUBLIC_API_BASE= \
  NEXT_PUBLIC_QURAN_BASE=/data NEXT_PUBLIC_QURAN_AUDIO_BASE=/resources npm run build -- --webpack
npm run check:routing:browser
```

Install Playwright Chromium if it is unavailable, or set `COURSE_CHROME_PATH` to
an existing Chrome executable. The browser uses an isolated profile. This check
does not replace the production acceptance checks after the AWS release.

Supabase Site URL is already `https://app.yaqeenguide.com`. Google callback is
already `https://okcctzpfpreziuxnyepk.supabase.co/auth/v1/callback`.
