-- Studio "Generate with AI" runs as a background job so long generations never hit the
-- CDN request timeout. The editor polls a job's stage until it ends; a finished draft is
-- also saved as a draft lesson owned by the teacher who asked for it.
begin;

create table public.draft_jobs (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users (id) on delete cascade,
  prompt text not null,
  lang text not null default 'en' check (lang in ('en', 'ar')),
  status text not null default 'running' check (status in ('running', 'done', 'no_sources', 'failed')),
  stage text not null default 'queued',      -- queued | sources | writing | checking | saving | done
  attempt int not null default 0,
  result jsonb,                              -- {lesson, review, reason}
  lesson_id text references public.lessons (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index draft_jobs_author_idx on public.draft_jobs (author_id, created_at desc);

-- Only the API (service role) reads and writes jobs; no browser access.
alter table public.draft_jobs enable row level security;

commit;
