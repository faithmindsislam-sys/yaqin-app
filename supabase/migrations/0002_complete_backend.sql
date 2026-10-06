-- Apply after 0001_init.sql. All browser writes remain scoped to auth.uid().
begin;

-- Backfill accounts created before the signup trigger existed.
insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', split_part(email, '@', 1))
from auth.users on conflict (id) do nothing;

alter table public.profiles add column daily_minutes int not null default 10 check (daily_minutes in (5, 10, 15, 20));
alter table public.profiles add column onboarded boolean not null default false;
alter table public.profiles add column known_lessons text[] not null default '{}';

-- Avoid a self-referencing role check in the update policy. Role is server-managed.
drop policy "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (display_name, preferred_track, lang, daily_minutes, onboarded, known_lessons) on public.profiles to authenticated;

-- Staff mutations go through the API's validated, audited workflow.
revoke insert, update, delete on public.lessons, public.sources, public.source_chunks,
  public.app_config, public.review_events from anon, authenticated;

drop policy "source_chunks: public read" on public.source_chunks;
create policy "source_chunks: published read" on public.source_chunks for select
  using (lesson_id is null or exists (select 1 from public.lessons l where l.id = lesson_id and l.status = 'published'));

create table public.source_review_events (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.source_review_events enable row level security;
create policy "source review: reviewers read" on public.source_review_events for select to authenticated
  using (public.current_role_name() = 'reviewer');
grant select on public.source_review_events to authenticated;
grant all on public.source_review_events to service_role;

alter table public.progress add column cards_done boolean not null default false;
alter table public.progress add column note text not null default '' check (length(note) <= 10000);
update public.progress set cards_done = true where completed_at is not null;
alter table public.progress add constraint progress_card_nonnegative check (card_index >= 0);
alter table public.progress add constraint progress_quiz_range check (quiz_score between 0 and 1);
alter table public.progress add constraint progress_explain_range check (explain_back_score between 0 and 1);

create table public.learning_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
alter table public.learning_days enable row level security;
create policy "learning days: own rows" on public.learning_days for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.learning_days to authenticated;
grant all on public.learning_days to service_role;

-- An atomic merge prevents a slower device/write from resetting completed work.
-- SECURITY INVOKER keeps the existing progress and learning_days RLS in force.
create function public.save_learning_progress(
  p_user uuid, p_lesson text, p_card int, p_cards_done boolean, p_explained boolean,
  p_quiz_score numeric, p_completed_at timestamptz, p_note text default null,
  p_day date default current_date
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or p_user is null or auth.uid() <> p_user then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.lessons where id = p_lesson and status = 'published'
                 and p_card >= 0 and p_card < jsonb_array_length(data -> 'cards')) then
    raise exception 'Invalid lesson or card index';
  end if;
  if p_day not between current_date - 1 and current_date + 1 then
    raise exception 'Invalid learning day';
  end if;
  insert into public.progress (user_id, lesson_id, card_index, cards_done, explain_back_score, quiz_score, completed_at, note)
  values (auth.uid(), p_lesson, p_card, p_cards_done, case when p_explained then 1 else null end,
          p_quiz_score, p_completed_at, coalesce(p_note, ''))
  on conflict (user_id, lesson_id) do update set
    card_index = greatest(public.progress.card_index, excluded.card_index),
    cards_done = public.progress.cards_done or excluded.cards_done,
    explain_back_score = greatest(public.progress.explain_back_score, excluded.explain_back_score),
    quiz_score = greatest(public.progress.quiz_score, excluded.quiz_score),
    completed_at = coalesce(public.progress.completed_at, excluded.completed_at),
    note = case when p_note is null then public.progress.note else p_note end,
    updated_at = now();
  insert into public.learning_days (user_id, day) values (auth.uid(), p_day) on conflict do nothing;
end;
$$;
revoke all on function public.save_learning_progress(uuid, text, int, boolean, boolean, numeric, timestamptz, text, date) from public;
grant execute on function public.save_learning_progress(uuid, text, int, boolean, boolean, numeric, timestamptz, text, date) to authenticated;
commit;
