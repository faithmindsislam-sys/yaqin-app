# Yaqeen · يقين

**Knowledge that brings you closer.** An AI learning companion that turns Islamic knowledge into
short visual courses you can listen to and talk to, in Arabic and English, with every claim
traceable to an approved source.

Built for the *AI Challenge in Service of Islamic Content* — Track 03, Interactive Experiences and
the Learning Journey.

## Three tracks

| Track | For | Journey examples |
|---|---|---|
| **Explore Islam** · اكتشف الإسلام | Anyone curious about Islam, or holding an objection | Common questions: who Muslims worship, the Kaaba, “spread by the sword?” |
| **First Steps** · خطواتي الأولى | Someone who has just become Muslim | Purification: the order of wudu, what breaks wudu |
| **Deepen My Knowledge** · أعمّق معرفتي | A Muslim who wants to go deeper | Understand what you recite: Al-Fatiha, why we face the qibla |

Learners choose their own track and can switch any time. The system never infers or stores
anything about a learner's beliefs.

Courses contain pages, followed by a course knowledge check.
Each course has one subject (for example Fiqh or Quran), one difficulty level, and one
or more tracks. A shared course appears once in All courses; its saved progress counts
in every selected track. Journey order is called Step, independently of difficulty Level.

## What a course does

1. **Pages** — one idea per page, an illustration, a takeaway; read or listen.
2. **Sources beside the explanation** — Quran and hadith shown verbatim from stored sources,
   labelled apart from AI-assisted explanation.
3. **Quick check** — a short quiz, each answer tied to a source.
4. **Ask Yaqeen tutor** — questions answered only from approved material.

## Scholarly safety, enforced in code

- **Revealed text is never generated.** The model refers to sources by id (`[[quran:2:256]]`); the
  server substitutes the stored text. Scripture-like text written by the model is stripped.
- **Citations are validated.** Ids not in the retrieved set are dropped; a religious claim with no
  valid citation becomes an abstention.
- **Answer tiers** from the challenge's scientific package: (A) settled → cited answer,
  (B) explanation → answer with reference, (C) disagreement → states that scholars differ,
  (D) personal case → general information and referral, never a ruling.
- **Human review.** Every source ships as `pending` until a scholar approves it;
  `content/README.md` lists every claim that needs sign-off.
- **Privacy.** Tutor logs store tier, cited ids and latency only — never the question text.

See [`docs/CONTRACT.md`](docs/CONTRACT.md) for the full contract.
Reviewing or taking over this project: [`docs/HANDOVER.md`](docs/HANDOVER.md) covers
testing the live app, the public API, and running it in your own AWS account.
Course migration, deployment and local flow checks: [`docs/COURSE_STRUCTURE.md`](docs/COURSE_STRUCTURE.md).
External integrations: [Public API v1](docs/PUBLIC_API.md), [MCP v1](docs/MCP.md),
and [AWS release instructions](docs/PUBLIC_API_RELEASE.md). Documentation: `/api/v1/docs`; Swagger testing: `/api/v1/swagger`.

## Architecture

```
Browser ─► CloudFront ─┬─► S3              Next.js static export
                       └─► /api/* ─► ALB ─► ECS Fargate · FastAPI
                                             ├─► Supabase Postgres + pgvector (auth, progress, content)
                                             └─► Amazon Bedrock (Claude, Titan embeddings)
```

| Path | What |
|---|---|
| `web/` | Next.js 16 app (static export), bilingual with full RTL |
| `api/` | FastAPI: tutor, content review, safety tests |
| `content/` | Courses, subjects, ordered tracks and sources (fetched verbatim), validator, safety eval cases |
| `supabase/migrations/` | Schema and row-level security |
| `docs/` | Contract between the three |

## Run locally

```bash
# Create a local environment file and configure your own Supabase project.
cp .env.example .env

# API (runs offline with an in-memory store over content/ when no DB or AWS is configured)
cd api
python3 -m venv .venv
.venv/bin/python -m pip install -e ".[dev]"
.venv/bin/python run.py --reload

# Web (a second terminal, from the repository root)
cd web
npm ci
npm run auth:check
npm run dev -- --port 3100
```

The API, web development/build and Google setup commands read the root `.env`.
Set both Supabase URLs and its publishable key in your local `.env`.
Use the documented port 3100 and allow its callback URL in your Supabase Auth redirects.
Shell/deployment variables take precedence. Only `NEXT_PUBLIC_*` values reach the browser.
The configured root `.env` is ignored by Git; only `.env.example` is included.

Google is enabled separately in each hosted Supabase project. Sharing our configured
project needs its URL/public key and an allowed frontend callback URL. A new project
also needs Google OAuth credentials and provider setup; see
[Google setup and troubleshooting](docs/SUPABASE_SETUP.md#google-and-smtp).
`npm run auth:configure` previews settings from `.env`; adding `-- --apply` applies them
using `SUPABASE_ACCESS_TOKEN`. It does not create Google Cloud OAuth credentials.
Restart after local changes; rebuild static exports after public-variable changes.
Optional frontend production overrides belong in root `.env.production.local`.

Backend structure and PyCharm setup: [`api/README.md`](api/README.md).

Quran text, translations, tafsir and recitation now use
`s3://yaqin-resources-744172873146/resources/quran/` as their canonical source.
Local web development/builds need no AWS credentials. The deployment asset step,
`npm run quran:bundle`, needs S3 read access and the existing API Python dependencies;
the original local Quran folder is no longer used by default. Audio stays in S3,
and Studio reads exact verses from S3. Deployment steps and current live status:
[`docs/QURAN_S3.md`](docs/QURAN_S3.md).

Tests: `cd api && .venv/bin/python -m pytest -q` · content check: `python3 content/validate.py`.

## Sources and licences

- Quran text: Uthmani script via the quran.com API v4. English: Saheeh International.
- Hadith: Sahih al-Bukhari and Sahih Muslim (standard numbering), via the open hadith-api dataset;
  links point to sunnah.com.
- Reference framework: the challenge's scientific package (dorar.net, King Fahd Complex,
  dawa.center, islamic-content.com).
- Fonts: Readex Pro, DM Serif Display, Amiri Quran (SIL Open Font Licence).
- Code: MIT (see `LICENSE`).
