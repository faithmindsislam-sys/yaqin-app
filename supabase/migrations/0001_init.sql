-- Yaqin initial schema. See docs/CONTRACT.md.

create extension if not exists vector with schema extensions;

-- Profiles -------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'learner' check (role in ('learner', 'instructor', 'reviewer')),
  preferred_track text check (preferred_track in ('explore', 'first-steps', 'deepen')),
  lang text not null default 'en' check (lang in ('en', 'ar')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role lookup used by policies; security definer avoids recursive RLS on profiles.
create or replace function public.current_role_name()
returns text
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'anonymous');
$$;

-- Content --------------------------------------------------------------------

create table public.app_config (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.sources (
  id text primary key,
  kind text not null check (kind in ('quran', 'hadith', 'tafsir', 'fiqh', 'aqidah', 'faq', 'dictionary')),
  ref_en text not null,
  ref_ar text,
  text_ar text,
  text_en text,
  translation text,
  origin text,
  url text,
  grading text,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved')),
  updated_at timestamptz not null default now()
);

create table public.source_chunks (
  id text primary key,                       -- "<source_id>#<lang>" or "lesson:<lesson>:<card>#<lang>"
  source_id text references public.sources (id) on delete cascade,
  lesson_id text,
  lang text not null check (lang in ('en', 'ar', 'mixed')),
  content text not null,
  embedding extensions.vector(1024),
  tsv tsvector generated always as (to_tsvector('simple', content)) stored
);

create index source_chunks_embedding_idx on public.source_chunks
  using hnsw (embedding extensions.vector_cosine_ops);
create index source_chunks_tsv_idx on public.source_chunks using gin (tsv);
create index source_chunks_source_idx on public.source_chunks (source_id);

create table public.lessons (
  id text primary key,
  track text not null check (track in ('explore', 'first-steps', 'deepen')),
  module text not null,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'published')),
  data jsonb not null,
  author_id uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index lessons_status_idx on public.lessons (status);

-- Learner data -----------------------------------------------------------------

create table public.progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null references public.lessons (id) on delete cascade,
  card_index int not null default 0,
  completed_at timestamptz,
  quiz_score numeric,
  explain_back_score numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- Review and telemetry ------------------------------------------------------------

create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  lesson_id text not null references public.lessons (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  kind text not null,                          -- ai_check | approve | request_changes | submit
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index review_events_lesson_idx on public.review_events (lesson_id, created_at);

-- No question text and no user id: tier, citations and latency only.
create table public.tutor_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  tier text not null,
  citation_ids text[] not null default '{}',
  latency_ms int,
  track text
);

-- Row level security ----------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.app_config enable row level security;
alter table public.sources enable row level security;
alter table public.source_chunks enable row level security;
alter table public.lessons enable row level security;
alter table public.progress enable row level security;
alter table public.review_events enable row level security;
alter table public.tutor_logs enable row level security;

-- profiles: own row; role changes only through the service role.
create policy "profiles: read own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- app_config and sources are public reference data.
create policy "app_config: public read" on public.app_config for select using (true);
create policy "sources: public read" on public.sources for select using (true);
create policy "source_chunks: public read" on public.source_chunks for select using (true);

-- lessons: everyone reads published; authors manage their drafts; reviewers read all.
create policy "lessons: read published" on public.lessons
  for select using (status = 'published');
create policy "lessons: authors read own" on public.lessons
  for select using (author_id = auth.uid());
create policy "lessons: reviewers read all" on public.lessons
  for select using (public.current_role_name() = 'reviewer');
create policy "lessons: instructors create drafts" on public.lessons
  for insert with check (author_id = auth.uid() and status in ('draft', 'in_review')
                         and public.current_role_name() in ('instructor', 'reviewer'));
create policy "lessons: authors edit unpublished" on public.lessons
  for update using (author_id = auth.uid() and status <> 'published')
  with check (author_id = auth.uid() and status in ('draft', 'in_review'));
create policy "lessons: reviewers update" on public.lessons
  for update using (public.current_role_name() = 'reviewer');

-- progress: strictly own rows.
create policy "progress: own rows" on public.progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- review_events: staff read; reviewers write decisions, authors log submissions.
create policy "review_events: staff read" on public.review_events
  for select using (public.current_role_name() in ('instructor', 'reviewer'));
create policy "review_events: staff insert" on public.review_events
  for insert with check (actor_id = auth.uid() and public.current_role_name() in ('instructor', 'reviewer'));

-- tutor_logs: no client policies at all; only the API's service connection writes.
