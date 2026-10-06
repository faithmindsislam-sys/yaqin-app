-- Profile pictures for the Settings page. Apply after 0007_draft_jobs.sql.
begin;

alter table public.profiles add column avatar_url text;
-- Column grants add up: this joins the list from 0004_account_roles.sql. Role stays server-managed.
grant update (avatar_url) on public.profiles to authenticated;

-- Public bucket: pictures are read by URL without a policy. The limits repeat the browser checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A user may only write inside their own folder: {uid}/...
-- Replacing a file (upsert) needs select and update as well as insert, so one policy covers all.
create policy "avatars: own folder" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
