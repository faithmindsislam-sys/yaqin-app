-- Run as database owner after the worship_entries migration. No test data survives.
begin;
select set_config('yaqin.test.owner', gen_random_uuid()::text, true);
select set_config('yaqin.test.other', gen_random_uuid()::text, true);
insert into auth.users (id, email, raw_user_meta_data) values
  (current_setting('yaqin.test.owner')::uuid, 'worship-owner@example.invalid', '{}'),
  (current_setting('yaqin.test.other')::uuid, 'worship-other@example.invalid', '{}');
insert into public.worship_entries (user_id, day, note) values
  (current_setting('yaqin.test.other')::uuid, '2026-10-01', 'Private');

select set_config('request.jwt.claim.sub', current_setting('yaqin.test.owner'), true);
set local role authenticated;
do $$
declare changed int;
begin
  insert into public.worship_entries (user_id, day, fajr, nawafil, checked, istighfar, tasbih, salawat, sadaqah, gratitude, care, tomorrow, note)
    values (auth.uid(), '2026-10-01', 'prayed', 2, array['morning', 'quran'], 100, 33, 10, true, 'Family', 'Support', 'Give charity', 'First');
  insert into public.worship_entries (user_id, day, note) values (auth.uid(), '2026-10-01', 'Updated')
    on conflict (user_id, day) do update set note = excluded.note;
  if (select count(*) from public.worship_entries) <> 1 then raise exception 'Other account visible or duplicate day'; end if;
  if not exists (select 1 from public.worship_entries where note = 'Updated' and nawafil = 2 and istighfar = 100 and gratitude = 'Family') then
    raise exception 'Daily save/read/update lost values'; end if;
  update public.worship_entries set note = 'Hacked' where user_id = current_setting('yaqin.test.other')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Other account updated'; end if;
  begin
    insert into public.worship_entries (user_id, day) values (current_setting('yaqin.test.other')::uuid, '2026-10-02');
    raise exception 'Other account insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.worship_entries set user_id = current_setting('yaqin.test.other')::uuid where user_id = auth.uid();
    raise exception 'Ownership transfer allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.worship_entries set nawafil = -1 where user_id = auth.uid();
    raise exception 'Negative count accepted';
  exception when check_violation then null; end;
  begin
    update public.worship_entries set salawat = 100000 where user_id = auth.uid();
    raise exception 'Excess count accepted';
  exception when check_violation then null; end;
  begin
    update public.worship_entries set fajr = 'not-applicable' where user_id = auth.uid();
    raise exception 'Invalid prayer accepted';
  exception when check_violation then null; end;
  begin
    update public.worship_entries set checked = array['unknown'] where user_id = auth.uid();
    raise exception 'Invalid practice accepted';
  exception when check_violation then null; end;
  begin
    update public.worship_entries set note = repeat('x', 1201) where user_id = auth.uid();
    raise exception 'Oversized note accepted';
  exception when check_violation then null; end;
  begin
    delete from public.worship_entries where user_id = auth.uid();
    raise exception 'Unrequested delete allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.worship_entries;
    raise exception 'Signed-out read allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.worship_entries (user_id, day) values (current_setting('yaqin.test.owner')::uuid, '2026-10-03');
    raise exception 'Signed-out insert allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
