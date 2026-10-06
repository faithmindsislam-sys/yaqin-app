-- Run after the course/security migrations as the database owner.
begin;
select set_config('yaqin.test.owner', gen_random_uuid()::text, true);
select set_config('yaqin.test.other', gen_random_uuid()::text, true);
select set_config('yaqin.test.lesson', 'role-' || gen_random_uuid()::text, true);

insert into auth.users (id, email, raw_user_meta_data) values
  (current_setting('yaqin.test.owner')::uuid, 'role-owner@example.invalid', '{"role":"super_admin","lang":"ar"}'),
  (current_setting('yaqin.test.other')::uuid, 'role-other@example.invalid', '{}');
do $$ begin
  if exists (select 1 from public.profiles where id in (
      current_setting('yaqin.test.owner')::uuid, current_setting('yaqin.test.other')::uuid
    ) and role <> 'learner') then raise exception 'Signup metadata granted staff access'; end if;
  if (select lang from public.profiles where id = current_setting('yaqin.test.owner')::uuid) <> 'ar' then
    raise exception 'Signup language was lost';
  end if;
end $$;

insert into public.lessons (id, track, module, status, data, author_id) values
  (current_setting('yaqin.test.lesson'), 'explore', 'test', 'draft', '{"cards":[],"subject":"islam","tracks":["explore"]}', current_setting('yaqin.test.owner')::uuid);
insert into public.review_events (lesson_id, actor_id, kind) values
  (current_setting('yaqin.test.lesson'), current_setting('yaqin.test.owner')::uuid, 'submit');

-- Even an owner loses direct access to an unpublished lesson when demoted.
select set_config('request.jwt.claim.sub', current_setting('yaqin.test.owner'), true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.lessons where id = current_setting('yaqin.test.lesson')) then
    raise exception 'Learner read a draft'; end if;
end $$;
reset role;

-- Exercise the same browser restrictions for every app role.
do $$
declare app_role text;
begin
  foreach app_role in array array['learner', 'teacher', 'admin', 'super_admin'] loop
    update public.profiles set role = app_role where id = current_setting('yaqin.test.owner')::uuid;
    execute 'set local role authenticated';
    if public.current_role_name() <> app_role then raise exception 'Role lookup failed'; end if;
    if exists (select 1 from public.lessons where id = current_setting('yaqin.test.lesson')) <> (app_role <> 'learner') then
      raise exception 'Owner draft visibility failed for %', app_role; end if;
    begin
      update public.profiles set role = 'super_admin' where id = auth.uid();
      raise exception 'Browser changed a role for %', app_role;
    exception when insufficient_privilege then null; end;
    begin
      update public.lessons set status = 'published' where id = current_setting('yaqin.test.lesson');
      raise exception 'Browser published for %', app_role;
    exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;
end $$;

-- Teachers see their own draft/audit only; admins and super admins see all.
select set_config('request.jwt.claim.sub', current_setting('yaqin.test.other'), true);
do $$
declare app_role text;
begin
  foreach app_role in array array['teacher', 'admin', 'super_admin'] loop
    update public.profiles set role = app_role where id = current_setting('yaqin.test.other')::uuid;
    execute 'set local role authenticated';
    if exists (select 1 from public.lessons where id = current_setting('yaqin.test.lesson')) <> (app_role <> 'teacher') then
      raise exception 'Other draft visibility failed for %', app_role; end if;
    if exists (select 1 from public.review_events where lesson_id = current_setting('yaqin.test.lesson')) <> (app_role <> 'teacher') then
      raise exception 'Other audit visibility failed for %', app_role; end if;
    execute 'reset role';
  end loop;
end $$;

select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ begin
  if exists (select 1 from public.lessons where id = current_setting('yaqin.test.lesson')) then
    raise exception 'Guest read a draft'; end if;
end $$;
reset role;
rollback;
