# Yaqeen Public API v1

Read published courses and approved sources, or ask the tutor in English and Arabic.
Every request requires a signed-in Yaqeen account.

**Version: 1.0.0.** Deployed in production. All four operations passed a live test
with a newly registered learner account on 2026-10-06. Email confirmation is
enabled; password login and token refresh passed.

## Get started

1. Create a Yaqeen account through Supabase Auth if you do not have one.
2. Confirm your email, then log in to get an **access token**.
3. Send `Authorization: Bearer YOUR_ACCESS_TOKEN` with every Yaqeen request.
4. Refresh the token when it expires.

Base URL: `https://public-api.yaqeenguide.com/api/v1`

Use the [developer guide](/api/v1/docs) for a guided introduction,
[schema reference](/api/v1/reference) for complete nested types,
[Swagger](/api/v1/swagger) to try requests and
[OpenAPI JSON](/api/v1/openapi.json) to generate a client.
The schema reference includes all request and response schemas.

## Login without a browser

**There is no Yaqeen `/login` endpoint.** Login uses the existing Supabase Auth API.
A script can log in with an email/password account without opening a browser.

Use these public connection details. You do **not** need to contact us, create a
Supabase dashboard account or create your own Supabase project:

```text
Supabase URL: https://okcctzpfpreziuxnyepk.supabase.co
Publishable key: YOUR_SUPABASE_PUBLISHABLE_KEY
```

These values identify Yaqeen's project; they do not grant account access. They are
safe to include in client code. Your password and session tokens remain private.
Never use a Supabase secret or service-role key in an integration.
In the examples, replace `YOUR_SUPABASE_PUBLISHABLE_KEY` with the key above.

### First time: create an account

If you have no Yaqeen account, send this request from your script or Postman:

```http
POST https://okcctzpfpreziuxnyepk.supabase.co/auth/v1/signup
apikey: YOUR_SUPABASE_PUBLISHABLE_KEY
Content-Type: application/json

{"email":"your-account@example.com","password":"YOUR_ACCOUNT_PASSWORD"}
```

This creates the same account that the Yaqeen website would create. Signups must be
enabled by the operator. With email confirmation enabled, check your inbox and
click the confirmation link once. It may open a browser, but you do not need to
use the website's signup or login form. Then log in using the request below.

### Every session: log in

```http
POST https://okcctzpfpreziuxnyepk.supabase.co/auth/v1/token?grant_type=password
apikey: YOUR_SUPABASE_PUBLISHABLE_KEY
Content-Type: application/json

{"email":"your-account@example.com","password":"YOUR_ACCOUNT_PASSWORD"}
```

The response includes `access_token`, `refresh_token` and `expires_in`.
Use **only `access_token`** in Yaqeen requests:

```bash
# Set YAQIN_ACCESS_TOKEN privately to the access_token returned by login.
curl "https://public-api.yaqeenguide.com/api/v1/courses?limit=25" \
  -H "Authorization: Bearer $YAQIN_ACCESS_TOKEN"
```

The account must already exist, be active and meet the project's email-confirmation
requirements. Password login is suitable for your own account/script. Partner apps
should use a user-authorized sign-in flow rather than collect users' passwords.
API keys and machine credentials are not available in this release.

### Refresh and Google accounts

To refresh, send the following request to the **same Supabase project**:

```http
POST https://okcctzpfpreziuxnyepk.supabase.co/auth/v1/token?grant_type=refresh_token
apikey: YOUR_SUPABASE_PUBLISHABLE_KEY
Content-Type: application/json

{"refresh_token":"YOUR_CURRENT_REFRESH_TOKEN"}
```

Save both replacement tokens securely. If refresh fails, sign in again.
The Supabase SDK can handle refresh automatically. Supabase login errors use
Supabase's error format, rather than the Yaqeen error format below.

Google sign-in also works for the HTTP API through the existing interactive
Supabase flow. Send the resulting **Supabase access token**, not a Google token.
A Google-only account needs a configured password to use password login.
MCP is anonymous and rate-limited; see [MCP v1](MCP.md). HTTP API requests still require an app access token.

Keep passwords and tokens out of URLs, logs, source code and prompts.
Never use a refresh token or Supabase key as the Yaqeen bearer token.

## Endpoints

| Method and path | Use |
|---|---|
| `GET /courses` | List published courses |
| `GET /courses/{course_id}` | Read a course, quizzes and approved citations |
| `GET /sources/{source_id}` | Read an approved canonical source |
| `POST /tutor/ask` | Ask a question and receive a cited answer |

Successful requests return JSON with HTTP 200. There are no public corpus-search,
publishing, administration, course-generation or progress-writing endpoints.
External browser apps need their origin approved by the integration owner.

### Courses and sources

`GET /courses` accepts `offset` (default 0, minimum 0), `limit` (default 25,
range 1–100) and optional `track`: `explore`, `first-steps` or `deepen`.
It returns `items`, `total`, `offset` and `limit`, ordered by course ID.
`total` counts all matching courses; an offset past the end returns no items.
Publication changes can shift pages. Titles and summaries contain `en` and `ar`.

Drafts, archives and Coming soon courses are unavailable. A listed course can
return 409 on detail if its citations are no longer approved. Source reads return
404 unless the source has an approved canonical record.

### Ask the tutor

```bash
curl "https://public-api.yaqeenguide.com/api/v1/tutor/ask" \
  -H "Authorization: Bearer $YAQIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is wudu?","lang":"en"}'
```

Only `question` is required (1–1,500 characters). `lang` defaults to `en` and
also accepts `ar`. Optional fields provide course/page context (`course_id`,
`card_id`, `track`), conversation history (`history`) or temporary exercises
(`practice`, `practice_avoid`). See the endpoint schema for their limits.
`lesson_id` is a legacy alias for `course_id`; send only one of them.
Unknown top-level fields are rejected. Maximum request body: **64 KiB**.

### Display answers responsibly

- Render `answer` blocks in order; source-block IDs resolve in the response's `sources` map.
- Keep attribution, grading, review/translation status and referrals visible. Do not invent missing translations.
- Show that tutoring and temporary practice exercises are AI-generated. Exercises are not approved course material.
- Check `tier`, `ai_generated` and `safety_outcome`: HTTP 200 can contain a refusal, referral or unsupported answer.

The HTTP tutor may cite eligible library passages marked `unreviewed`; eligibility
is not scholarly approval. Those passages are included in the answer and may not
be available through `/sources/{source_id}`. MCP currently uses approved sources
only. Confirm redistribution rights before offering bulk content reuse.

## Limits and retries

These are configurable defaults, not a pricing plan:

| Allowance | Per account | Across the service |
|---|---:|---:|
| Public HTTP requests / minute | 60 | 500 |
| Model operations / minute, shared with the app | 12 | 500 |
| Model token reservations / UTC day, shared with the app | 10,000,000 | 100,000,000 |

Each tutor call reserves **200,000 model tokens** as a conservative upper bound,
not measured usage. Reads reserve no model tokens. Failed operations are not
refunded. Limits use fixed UTC minute/day windows and are shared across an
account's tokens, clients and IPs. Anonymous MCP shares the service ceilings;
its per-guest ceilings use the viewer IP (IPv6 /64). Every MCP HTTP request,
including initialization and tool listing, spends the request allowance.

HTTP errors use this format; check `code` rather than the message text:

```json
{"error":{"code":"rate_limited","message":"Public API request limit exceeded."}}
```

| Status | Meaning / action |
|---|---|
| 400 | Invalid input; correct the request |
| 401 | Missing, invalid or expired token; refresh or sign in |
| 403 | Account unavailable or access denied |
| 404 | Course/source unavailable |
| 409 | Course citations awaiting approval |
| 413 | Body exceeds 64 KiB |
| 429 | Request allowance or model budget exhausted |
| 500 / 503 | Temporary server, authentication, quota or model failure |

For `rate_limited`, wait the `Retry-After` seconds before retrying. For
`quota_exceeded`, a daily budget may remain exhausted until the next UTC day.
Use bounded backoff for temporary failures; do not loop on invalid input or
permission errors. Tutor retries can spend quota again: there is no idempotency
key. Responses use `Cache-Control: no-store`.

## Versioning

HTTP uses `/api/v1`; MCP uses `/api/v1/mcp/`. Both product contracts are `1.0.0`.
The MCP protocol version is negotiated separately.

- **Patch** (`1.0.1`): compatible fixes and documentation corrections.
- **Minor** (`1.1.0`): optional additions. Clients must tolerate new output fields and safely handle unknown free-form status/code strings.
- **Major** (`2.0.0`): incompatible inputs, outputs, authentication or meaning. Release under `/api/v2` and `/api/v2/mcp/`, with a migration guide and announced retirement date.

Closed enums and documented input limits remain compatible within a major
version. Quota/policy changes are announced separately. No v1 retirement date is set.
