# Deploy runbook — "Generate with AI" (Studio course drafting)

This feature adds `POST /api/review/draft` (backend) and the `generateLesson()` call
(web). **Merging to `main` does not deploy.** Production runs a prebuilt image on ECS
Fargate and a static web bundle on S3/CloudFront; both must be deployed explicitly.

## Prerequisites

- You are on `main` with this feature merged (`git checkout main && git pull`).
- AWS credentials for the **Yaqin production account** (region `eu-west-1`). Confirm:
  ```bash
  AWS_PROFILE=<yaqin-prod> aws sts get-caller-identity   # must NOT be a sandbox account
  ```
- Shared root `.env` present with at least:
  ```
  DATABASE_URL=postgresql://…         # prod Supabase pooler
  SUPABASE_URL=https://<ref>.supabase.co
  ```
  `infra/deploy-api.sh` reads these; `ORIGIN_VERIFY` is generated on first run.

## 1. Deploy the API (adds the /review/draft route)

```bash
cd api && . .venv/bin/activate && python -m pytest -q   # expect: all pass (incl. tests/agents/test_course_agent.py)
cd ..
AWS_PROFILE=<yaqin-prod> infra/deploy-api.sh build
```
`build` rebuilds the image in CodeBuild, pushes to ECR, and rolls the ECS service.
The service has a deployment circuit breaker with **automatic rollback**, so a failed
rollout reverts to the previous task definition.

## 2. Deploy the web (ships the generateLesson() call)

The web is a static Next.js export behind CloudFront. Build and publish it the same way
the site is normally released (CI or the team's web deploy step):
```bash
cd web && npm ci && npm run build        # static export
# upload the export to the web S3 bucket, then invalidate the CloudFront distribution
```
> The editor already called `generateLesson()`; only its implementation changed. The
> backend route must be live (step 1) before the web change is useful.

## 3. Post-deploy verification

```bash
BASE=https://d1x2w48x0bzbrs.cloudfront.net   # prod origin

# API is healthy
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/health"            # 200

# the NEW route exists (401 = present & auth-gated; 404 = OLD image still live)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/review/draft" \
  -H "Content-Type: application/json" -d '{"prompt":"test"}'           # expect 401, NOT 404
```
Then, signed in as a **teacher**, open `/studio/course/` → **Generate with AI**, enter a
topic that has approved sources, and confirm a draft opens in the editor with cited sources.

## Behaviour notes (so results aren't surprising)

- Generation grounds on the **approved source library** via the app's own retrieval. A
  topic with **no approved sources returns no draft** (with a reason) — this is intended,
  not a failure. Seed/approve sources first.
- The agent self-reviews (bounded ≤3 attempts). If it cannot pass, it returns the best
  draft flagged `ready_for_reviewer: false` with the issues — never a false "ready".
- If a cited source is unapproved mid-generation, its citations are stripped and the draft
  is flagged not-ready.

## Rollback

- **API:** `AWS_PROFILE=<yaqin-prod> aws ecs update-service --cluster yaqin --service yaqin-api \
  --task-definition <previous-taskdef-arn> --force-new-deployment` (or let the circuit
  breaker auto-roll back on a failed deploy).
- **Web:** re-publish the previous static bundle and invalidate CloudFront.
- The feature is additive (a new route + a new agent); reverting the deploy fully removes it.
