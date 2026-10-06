begin;

create table public.worship_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  fajr text check (fajr in ('prayed', 'not-yet', 'missed')),
  dhuhr text check (dhuhr in ('prayed', 'not-yet', 'missed')),
  asr text check (asr in ('prayed', 'not-yet', 'missed')),
  maghrib text check (maghrib in ('prayed', 'not-yet', 'missed')),
  isha text check (isha in ('prayed', 'not-yet', 'missed')),
  nawafil integer not null default 0 check (nawafil between 0 and 99999),
  checked text[] not null default '{}' check (
    checked <@ array['morning', 'evening', 'quran', 'hifz', 'dua', 'istighfar', 'tasbih', 'salawat']::text[]
    and array_position(checked, null) is null and cardinality(checked) <= 8
  ),
  istighfar integer not null default 0 check (istighfar between 0 and 99999),
  tasbih integer not null default 0 check (tasbih between 0 and 99999),
  salawat integer not null default 0 check (salawat between 0 and 99999),
  sadaqah boolean,
  intention text not null default '' check (char_length(intention) <= 240),
  gratitude text not null default '' check (char_length(gratitude) <= 1200),
  care text not null default '' check (char_length(care) <= 1200),
  tomorrow text not null default '' check (char_length(tomorrow) <= 1200),
  note text not null default '' check (char_length(note) <= 1200),
  saved_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.worship_entries enable row level security;
revoke all on public.worship_entries from anon, authenticated;
grant select, insert, update on public.worship_entries to authenticated;

create policy worship_select_own on public.worship_entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy worship_insert_own on public.worship_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy worship_update_own on public.worship_entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

commit;
