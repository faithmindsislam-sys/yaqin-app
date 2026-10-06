-- Run after the course/security migrations, using the Supabase SQL editor or psql.
-- Test records and all writes are rolled back; exceptions indicate failed checks.
begin;
select set_config('yaqin.test.user_a', gen_random_uuid()::text, true);
select set_config('yaqin.test.user_b', gen_random_uuid()::text, true);
select set_config('yaqin.test.lesson', 'rls-test-' || gen_random_uuid()::text, true);
insert into auth.users (id, email, raw_user_meta_data) values
  (current_setting('yaqin.test.user_a')::uuid, 'rls-a@example.invalid', '{}'::jsonb),
  (current_setting('yaqin.test.user_b')::uuid, 'rls-b@example.invalid', '{}'::jsonb);
insert into public.lessons (id, track, module, status, data) values
  (current_setting('yaqin.test.lesson'), 'explore', 'test', 'published', '{"cards": [{}, {}],"subject":"islam","tracks":["explore"]}'::jsonb);
select set_config('request.jwt.claim.sub', current_setting('yaqin.test.user_a'), true);
set local role authenticated;

do $$
declare
  me uuid := current_setting('yaqin.test.user_a')::uuid;
  other_user uuid := current_setting('yaqin.test.user_b')::uuid;
  lid text := current_setting('yaqin.test.lesson');
  row public.progress;
begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'Profile ownership failed'; end if;
  update public.profiles set preferred_track = 'explore', daily_minutes = 15 where id = me;
  if not found then raise exception 'Own profile update failed'; end if;
  begin
    update public.profiles set role = 'super_admin' where id = me;
    raise exception 'Role escalation was permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.lessons (id, track, module, data) values ('forbidden-test', 'explore', 'test', '{}');
    raise exception 'Direct content write was permitted';
  exception when insufficient_privilege then null;
  end;
  perform public.save_learning_progress(me, lid, 1, true, true, 0.75, now(), 'My note', current_date);
  perform public.save_learning_progress(me, lid, 0, false, false, 0.25, null, null, current_date);
  select * into row from public.progress where user_id = me and lesson_id = lid;
  if row.card_index <> 1 or not row.cards_done or row.explain_back_score <> 1 or row.quiz_score <> 0.75
     or row.completed_at is null or row.note <> 'My note' then
    raise exception 'Atomic progress merge failed';
  end if;
  if not exists (select 1 from public.learning_days where user_id = me and day = current_date) then
    raise exception 'Learning day was not stored';
  end if;
  begin
    insert into public.progress (user_id, lesson_id) values (other_user, lid);
    raise exception 'Cross-account progress write was permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_learning_progress(other_user, lid, 0, false, false, null, null, null, current_date);
    raise exception 'RPC account mismatch was permitted';
  exception when raise_exception then
    if sqlerrm <> 'Sign in required' then raise; end if;
  end;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('yaqin.test.user_b'), true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.progress where user_id = current_setting('yaqin.test.user_a')::uuid) then
    raise exception 'Cross-account progress read was permitted';
  end if;
end $$;
reset role;
rollback;
