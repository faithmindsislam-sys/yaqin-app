-- Archived lessons stay available to staff and retain learner progress and history.
begin;
alter table public.lessons drop constraint lessons_status_check;
alter table public.lessons add constraint lessons_status_check
  check (status in ('draft', 'in_review', 'published', 'archived'));
commit;
