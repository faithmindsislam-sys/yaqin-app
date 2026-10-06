-- Run after 0008_profile_avatar.sql as the SQL-editor/service database owner.
-- Everything runs in one transaction and is rolled back.
begin;
select set_config('yaqin.test.owner', gen_random_uuid()::text, true);
select set_config('yaqin.test.other', gen_random_uuid()::text, true);

insert into auth.users (id, email, raw_user_meta_data) values
  (current_setting('yaqin.test.owner')::uuid, 'settings-owner@example.invalid', '{"full_name":"Owner"}'),
  (current_setting('yaqin.test.other')::uuid, 'settings-other@example.invalid', '{"full_name":"Other"}');

select set_config('request.jwt.claim.sub', current_setting('yaqin.test.owner'), true);
set local role authenticated;
do $$
declare changed int;
begin
  -- The Settings page saves a name and a picture on the user's own row.
  update public.profiles set display_name = 'New name', avatar_url = 'https://example.invalid/avatar'
    where id = auth.uid();
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'User could not update their own profile'; end if;

  -- Another user's row is hidden by row level security, so the update matches nothing.
  update public.profiles set display_name = 'Hacked', avatar_url = 'https://example.invalid/hacked'
    where id = current_setting('yaqin.test.other')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'User updated another profile'; end if;

  -- Role has no column grant for browsers.
  begin
    update public.profiles set role = 'super_admin' where id = auth.uid();
    raise exception 'User changed their own role';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Read back as the owner of the database, where row level security does not hide anything.
do $$ begin
  if (select display_name from public.profiles where id = current_setting('yaqin.test.owner')::uuid) <> 'New name' then
    raise exception 'Own profile update was lost'; end if;
  if exists (select 1 from public.profiles where id = current_setting('yaqin.test.other')::uuid
      and (display_name <> 'Other' or avatar_url is not null)) then
    raise exception 'Another profile was changed'; end if;
  if (select role from public.profiles where id = current_setting('yaqin.test.owner')::uuid) <> 'learner' then
    raise exception 'Own role was changed'; end if;
end $$;
rollback;
