-- Prepare shared learner/Studio roles. Apply after 0003_auth_language.sql.
begin;

alter table public.profiles drop constraint profiles_role_check;
update public.profiles set role = case role
  when 'instructor' then 'teacher'
  when 'reviewer' then 'admin'
  else role end;
alter table public.profiles alter column role set default 'learner';
alter table public.profiles add constraint profiles_role_check
  check (role in ('learner', 'teacher', 'admin', 'super_admin'));

-- Auth's signup trigger inserts profiles. A browser may only edit preferences.
-- Role metadata supplied during signup is deliberately ignored by that trigger.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, preferred_track, lang, daily_minutes, onboarded, known_lessons)
  on public.profiles to authenticated;

drop policy "lessons: authors read own" on public.lessons;
create policy "lessons: teachers read own" on public.lessons for select to authenticated
  using (author_id = auth.uid() and public.current_role_name() in ('teacher', 'admin', 'super_admin'));
drop policy "lessons: reviewers read all" on public.lessons;
create policy "lessons: admins read all" on public.lessons for select to authenticated
  using (public.current_role_name() in ('admin', 'super_admin'));

-- Staff writes continue through FastAPI's validation, ownership and audit checks.
drop policy "lessons: instructors create drafts" on public.lessons;
drop policy "lessons: authors edit unpublished" on public.lessons;
drop policy "lessons: reviewers update" on public.lessons;
drop policy "review_events: staff insert" on public.review_events;
revoke insert, update, delete on public.lessons, public.sources, public.source_chunks,
  public.app_config, public.review_events from anon, authenticated;

drop policy "review_events: staff read" on public.review_events;
create policy "review_events: staff read" on public.review_events for select to authenticated
  using (public.current_role_name() in ('admin', 'super_admin') or
    (public.current_role_name() = 'teacher' and exists (
      select 1 from public.lessons l where l.id = lesson_id and l.author_id = auth.uid()
    )));

drop policy "source review: reviewers read" on public.source_review_events;
create policy "source review: admins read" on public.source_review_events for select to authenticated
  using (public.current_role_name() in ('admin', 'super_admin'));

commit;
