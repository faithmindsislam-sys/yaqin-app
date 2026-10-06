# Handover and evaluation guide

How to review, test and run Yaqeen. Nothing here requires access to the AWS account
that currently hosts it.

Repositories:

| Repository | Contents |
| --- | --- |
| `yaqin` | API (FastAPI), web (Next.js static export), course content, infrastructure scripts |
| `faithminds-rag-pipeline` | Book ingestion and retrieval Lambdas |
| `faithminds-agents` | Standalone agents Lambda |

## 1. Fastest review: use the live app

No credentials needed beyond a Yaqeen account you create yourself.

1. Open <https://www.yaqeenguide.com> and create an account.
2. Confirm the email, then open **Ask** and put a question to a journey guide
   (Rayen for Explore, Khaled for First Steps, Ibrahim for Deepen).
3. Open any course and use **Mariam**: "Explain this page simply",
   "Test my knowledge", "Give me more questions about the course".

Answers stream sentence by sentence; the first sentence normally appears in about
3 to 4 seconds. Each sentence passes a safety check before it is shown. Quran and
hadith text is inserted from the database, never written by the model.

## 2. Public API

Base URL: `https://public-api.yaqeenguide.com/api/v1`
Interactive docs: `/docs`, `/swagger`, `/reference`, `/openapi.json`

Operations: `GET /courses`, `GET /courses/{course_id}`, `GET /sources/{source_id}`,
`POST /tutor/ask`.

Authentication is a Supabase access token for a normal Yaqeen account. Full steps,
including the public project URL and publishable key, are in
[PUBLIC_API.md](PUBLIC_API.md). There are no partner API keys in this release.

## 3. MCP (Claude, ChatGPT)

The MCP endpoint is `https://public-api.yaqeenguide.com/api/v1/mcp/`. It uses OAuth
through Supabase; see [MCP.md](MCP.md). Approved clients are registered by the
operator, so a new client needs to be added before it can connect.

## 4. Running it in your own AWS account

The application never holds long-lived AWS keys. In production it uses the IAM role
attached to the ECS task and to each Lambda. To run it yourself you need your own
AWS account and your own Bedrock model access.

### Required model access (Amazon Bedrock console, Model access)

| Model | Region | Used for |
| --- | --- | --- |
| `anthropic.claude-sonnet-5` | us-east-1 | tutor answers, practice, review |
| `anthropic.claude-haiku-4-5` | us-east-1 | question classification |
| `amazon.titan-embed-text-v2:0` | eu-west-1 | source search embeddings |

### Required IAM permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "ClaudeMessages", "Effect": "Allow",
      "Action": "bedrock-mantle:CreateInference", "Resource": "*" },
    { "Sid": "Embeddings", "Effect": "Allow", "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:eu-west-1::foundation-model/amazon.titan-embed-text-v2:0" },
    { "Sid": "RuntimeSafety", "Effect": "Allow", "Action": "bedrock:ApplyGuardrail",
      "Resource": "arn:aws:bedrock:us-east-1:YOUR_ACCOUNT_ID:guardrail/*" }
  ]
}
```

Claude calls go through `bedrock-mantle:CreateInference`, not
`bedrock:InvokeModel`. A plain Bedrock API key may not grant it; use an IAM role or
user with the statement above.

### Create the safety guardrail first

**The tutor refuses to answer when no guardrail is configured.** This is deliberate:
moderation failures are never treated as a model outage. Create one in your account:

```bash
python api/scripts/create_guardrail.py --region us-east-1
# prints the guardrail id and version; put them in your environment
```

### Configure and run

```bash
cp .env.example .env            # then fill in your own values
# Required: SUPABASE_URL, DATABASE_URL, GUARDRAIL_ID, GUARDRAIL_VERSION,
#           BEDROCK_REGION, AWS_REGION
cd api && pip install -e '.[dev]' && uvicorn app.main:app --reload
cd web && npm install && npm run dev
```

`DATABASE_URL` is a PostgreSQL connection string; the project uses Supabase. Apply
`supabase/migrations/` and `sql/operational_budgets.sql` to a fresh database.

Run the test suite with `cd api && pytest` (about 800 tests, no AWS access needed:
the tests use fakes).

## 5. What is not handed over

These stay with the current operator and must never be committed or shared:

- AWS account credentials and any administrator access keys.
- The `yaqin/api` secret in AWS Secrets Manager: it holds the production database
  connection string and the Gemini key.
- Supabase secret and service-role keys. Only the **publishable** key is public.
- Production data: learner accounts, chat logs, token usage.

Local configuration lives in `.env` for public values only. Put real secrets in
`.env.local`, which git ignores, or in your own secret store.

## 6. Architecture in one page

```
Browser ──► CloudFront (www / app / studio / public-api)
              ├─ static web (S3, private, OAC)
              └─ /api/* ──► ALB ──► ECS Fargate (yaqin-api)
                                     ├─ Bedrock: Claude + guardrail (us-east-1)
                                     ├─ Bedrock: Titan embeddings (eu-west-1)
                                     ├─ Supabase PostgreSQL (courses, sources, users)
                                     └─ rag.yaqeenguide.com ──► Lambda (book retrieval)
```

Safety and grounding rules that the code enforces regardless of model behaviour are
described in [CONTRACT.md](CONTRACT.md) and [RUNTIME_SAFETY.md](RUNTIME_SAFETY.md).
