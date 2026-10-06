-- Match the profile language to the signup choice used by auth email templates.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, lang)
  values (new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data ->> 'lang' = 'ar' then 'ar' else 'en' end);
  return new;
end;
$$;

-- Profile preferences are canonical after signup. Keep auth email metadata in
-- sync without a second client request or changing any authorization claims.
create or replace function public.sync_auth_email_language()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('lang', new.lang) where id = new.id;
  return new;
end;
$$;
create trigger on_profile_language_changed after update of lang on public.profiles
  for each row when (old.lang is distinct from new.lang)
  execute function public.sync_auth_email_language();
