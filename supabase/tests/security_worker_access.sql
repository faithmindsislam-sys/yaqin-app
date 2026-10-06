-- Run as the database owner after the security migration, on the shared RAG DB.
-- All fixtures and writes roll back; a failed assertion aborts the transaction.
begin;
select set_config('yaqin.test.owner', gen_random_uuid()::text, true);
select set_config('yaqin.test.job', 'security-' || gen_random_uuid()::text, true);
select set_config('yaqin.test.kb', 'security-' || gen_random_uuid()::text, true);

-- Exercise the auth.users INSERT trigger as the database owner (the managed
-- Auth role cannot be assumed by postgres). Metadata must never grant staff.
insert into auth.users (id, email, raw_user_meta_data) values
  (current_setting('yaqin.test.owner')::uuid,
   current_setting('yaqin.test.owner') || '@example.invalid',
   '{"full_name":"Security fixture","lang":"ar","role":"super_admin"}');
do $$ begin
  if not exists (select 1 from public.profiles
      where id = current_setting('yaqin.test.owner')::uuid
      and role = 'learner' and lang = 'ar' and display_name = 'Security fixture') then
    raise exception 'Auth signup/profile creation failed';
  end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('yaqin.test.owner'), true);
set local role authenticated;
do $$ begin
  if public.current_role_name() is distinct from 'learner' then
    raise exception 'Authenticated role lookup failed'; end if;
  update public.profiles set lang = 'en' where id = auth.uid();
  if not found then raise exception 'Own language update failed'; end if;
end $$;
reset role;
do $$ begin
  if (select raw_user_meta_data ->> 'lang' from auth.users
      where id = current_setting('yaqin.test.owner')::uuid) is distinct from 'en' then
    raise exception 'Profile language did not synchronize to Auth'; end if;
end $$;

-- Verify function ACLs, including PUBLIC inheritance and trigger-only callers.
do $$
declare db_role text; func text;
begin
  if has_function_privilege('anon', 'public.current_role_name()', 'EXECUTE') then
    raise exception 'Anonymous role lookup remains executable'; end if;
  foreach db_role in array array['anon', 'authenticated', 'service_role', 'supabase_auth_admin'] loop
    foreach func in array array['handle_new_user', 'sync_auth_email_language'] loop
      if has_function_privilege(db_role, 'public.' || func || '()', 'EXECUTE') then
        raise exception 'Trigger function % directly executable by %', func, db_role;
      end if;
    end loop;
  end loop;
end $$;

-- Test anonymous and every signed-in app role. Restrict statements to fixture
-- IDs so even a regressed permission cannot touch an existing worker's rows.
do $$
declare app_role text; relation text; key_column text; fixture text; statement text;
begin
  foreach app_role in array array['anonymous', 'learner', 'teacher', 'admin', 'super_admin'] loop
    if app_role = 'anonymous' then
      perform set_config('request.jwt.claim.sub', '', true);
      execute 'set local role anon';
    else
      update public.profiles set role = app_role where id = current_setting('yaqin.test.owner')::uuid;
      perform set_config('request.jwt.claim.sub', current_setting('yaqin.test.owner'), true);
      execute 'set local role authenticated';
    end if;
    foreach relation in array array['gen_jobs', 'kb_leases'] loop
      key_column := case relation when 'gen_jobs' then 'job_id' else 'kb_id' end;
      fixture := current_setting(case relation when 'gen_jobs' then 'yaqin.test.job' else 'yaqin.test.kb' end);
      if has_table_privilege(current_user, 'public.' || relation,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'Worker table privilege remains for % on %', app_role, relation;
      end if;
      foreach statement in array array[
        format('select * from public.%I where %I = %L', relation, key_column, fixture),
        case relation when 'gen_jobs' then format('insert into public.gen_jobs (job_id, params) values (%L, %L)', fixture, '{}')
          else format('insert into public.kb_leases (kb_id) values (%L)', fixture) end,
        format('update public.%I set %I = %L where %I = %L', relation, key_column, fixture, key_column, fixture),
        format('delete from public.%I where %I = %L', relation, key_column, fixture)
      ] loop
        begin
          execute statement;
          raise exception 'Worker table operation allowed for %: %', app_role, statement;
        exception when insufficient_privilege then null;
        end;
      end loop;
    end loop;
    execute 'reset role';
  end loop;
end $$;

-- Real workers connect as postgres (table owner/BYPASSRLS); service_role access
-- is also retained. Exercise generation lifecycle and the atomic lease pattern.
do $$
declare db_role text; changed int;
begin
  foreach db_role in array array['postgres', 'service_role'] loop
    execute format('set local role %I', db_role);
    insert into public.gen_jobs (job_id, params)
      values (current_setting('yaqin.test.job'), '{"topic":"security fixture"}');
    if not exists (select 1 from public.gen_jobs where job_id = current_setting('yaqin.test.job')) then
      raise exception 'Worker cannot read generation job'; end if;
    update public.gen_jobs set status = 'running', attempts = attempts + 1
      where job_id = current_setting('yaqin.test.job');
    if not found then raise exception 'Worker cannot update generation job'; end if;
    delete from public.gen_jobs where job_id = current_setting('yaqin.test.job');
    if not found then raise exception 'Worker cannot delete fixture job'; end if;

    insert into public.kb_leases (kb_id) values (current_setting('yaqin.test.kb'));
    update public.kb_leases set state = 'held', holder = 'fixture-a',
      acquired_at = now(), expires_at = now() + interval '5 minutes'
      where kb_id = current_setting('yaqin.test.kb') and (state = 'free' or expires_at < now() or holder = 'fixture-a');
    get diagnostics changed = row_count;
    if changed <> 1 then raise exception 'Worker cannot acquire lease'; end if;
    update public.kb_leases set holder = 'fixture-b'
      where kb_id = current_setting('yaqin.test.kb') and (state = 'free' or expires_at < now() or holder = 'fixture-b');
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'Concurrent holder acquired active lease'; end if;
    update public.kb_leases set state = 'free', holder = null, job_id = null
      where kb_id = current_setting('yaqin.test.kb') and holder = 'fixture-a';
    if not found then raise exception 'Worker cannot release lease'; end if;
    delete from public.kb_leases where kb_id = current_setting('yaqin.test.kb');
    if not found then raise exception 'Worker cannot delete fixture lease'; end if;
    execute 'reset role';
  end loop;
end $$;

-- Server-only tables intentionally have no browser policies, including the
-- existing four tables. Never add policies just to silence the INFO advisor.
do $$
declare relation text; visible_rows int;
begin
  foreach relation in array array['gen_jobs', 'kb_leases', 'admin_events', 'draft_jobs', 'rag_resources', 'tutor_logs'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || relation)::regclass)
        or exists (select 1 from pg_policies where schemaname = 'public' and tablename = relation) then
      raise exception 'Server-only RLS restriction changed on %', relation;
    end if;
    execute 'set local role authenticated';
    begin
      execute format('select 1 from public.%I limit 1', relation);
      get diagnostics visible_rows = row_count;
      if visible_rows <> 0 then raise exception 'Browser read server-only table %', relation; end if;
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
  end loop;
end $$;
rollback;
