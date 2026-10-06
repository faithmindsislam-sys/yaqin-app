-- Apply after 0004_account_roles.sql.
begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check'
      and pg_get_constraintdef(oid) like '%super_admin%'
  ) or not exists (
    select 1 from pg_policy
    where polrelid = 'public.lessons'::regclass and polname = 'lessons: admins read all'
  ) then
    raise exception 'Apply 0004_account_roles.sql before 0005_admin_users.sql';
  end if;
end;
$$;

create table public.admin_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_events enable row level security;
revoke all on public.admin_events from anon, authenticated;
grant all on public.admin_events to service_role;
-- No client policies: audit records are server-managed.

commit;
