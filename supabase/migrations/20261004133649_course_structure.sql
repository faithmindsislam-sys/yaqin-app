-- Metadata-only migration. Existing lesson rows and every progress/review FK keep their IDs.
-- Module lists remain the single source of journey order, never subject or difficulty.
begin;

alter table public.lessons alter column track drop not null;
alter table public.lessons alter column module drop not null;
alter table public.lessons add column if not exists legacy_classification jsonb;

-- Retain legacy classification for rollback/audit; it is not part of the active course API.
update public.lessons set legacy_classification = jsonb_build_object(
  'track', coalesce(data->'track', to_jsonb(track)), 'module', coalesce(data->'module', to_jsonb(module)), 'tags', data->'tags'
) where legacy_classification is null and not data ? 'tracks';

update public.lessons l set data = (data - 'track' - 'module' - 'tags') || jsonb_build_object(
  'subject', coalesce(data->>'subject', case data->>'id'
      when 'who-is-god' then 'aqidah'
      when 'kaaba-qibla' then 'fiqh'
      when 'spread-by-sword' then 'history'
      when 'spread' then 'history'
      when 'wudu-order' then 'fiqh'
      when 'what-breaks-wudu' then 'fiqh'
      when 'al-fatiha-meaning' then 'quran'
      when 'why-face-qibla' then 'fiqh'
      else case data->>'module'
        when 'purification' then 'fiqh'
        when 'prayer' then 'fiqh'
        when 'fasting' then 'fiqh'
        when 'fiqh-of-worship' then 'fiqh'
        when 'the-quran' then 'quran'
        when 'understand-what-you-recite' then 'quran'
        when 'prophet-muhammad' then 'seerah'
        when 'understanding-hadith' then 'hadith'
        else 'islam' end
    end),
  'tracks', coalesce(data->'tracks', (
    select coalesce(jsonb_agg(member order by position), '[]'::jsonb)
    from (
      select member, min(position) as position from (
        select coalesce(l.data->>'track', l.track) as member, 0 as position
        union all
        select t->>'id', ordinality::int from public.app_config cfg,
          jsonb_array_elements(cfg.data) with ordinality as track(t, ordinality)
        where cfg.key = 'tracks' and exists (
          select 1 from jsonb_array_elements(t->'modules') m,
            jsonb_array_elements_text(coalesce(m->'lessons', '[]'::jsonb)) cid
          where cid = l.id
        )
      ) memberships where member in ('explore', 'first-steps', 'deepen') group by member
    ) unique_memberships
  ))
);

-- No separate columns mirror active subject or membership; course JSON is authoritative.
-- Old columns remain historical compatibility metadata, and new writes leave them null.
comment on column public.lessons.data is 'Course content: one subject, difficulty level, tracks, pages in cards, explain_back and knowledge check in quiz';
comment on column public.lessons.track is 'Deprecated historical classification; active membership is data.tracks';
comment on column public.lessons.module is 'Deprecated historical classification; journey ordering is app_config.tracks.modules[].lessons';

alter table public.lessons drop constraint if exists courses_classification;
alter table public.lessons add constraint courses_classification check (
  data ? 'subject' and data->>'subject' in ('islam', 'aqidah', 'fiqh', 'quran', 'seerah', 'hadith', 'history', 'ethics')
  and data ? 'tracks' and jsonb_typeof(data->'tracks') = 'array'
  and jsonb_array_length(data->'tracks') between 1 and 3
  and data->'tracks' <@ '["explore", "first-steps", "deepen"]'::jsonb
  and (jsonb_array_length(data->'tracks') < 2 or data->'tracks'->0 <> data->'tracks'->1)
  and (jsonb_array_length(data->'tracks') < 3 or (data->'tracks'->0 <> data->'tracks'->2 and data->'tracks'->1 <> data->'tracks'->2))
  and not (data ?| array['track', 'module', 'tags'])
);

-- Preserve ordered sections and planned titles. Deduplicate course references and append
-- any published course whose old declared membership did not have an ordering entry.
do $$
declare
  config jsonb; new_config jsonb := '[]'; t jsonb; m jsonb; sections jsonb;
  ordered jsonb; seen text[]; cid text; row_course record;
begin
  select data into config from public.app_config where key = 'tracks' for update;
  if config is not null then
    for t in select value from jsonb_array_elements(config) loop
      sections := '[]'; seen := '{}';
      for m in select value from jsonb_array_elements(coalesce(t->'modules', '[]')) loop
        ordered := '[]';
        for cid in select value from jsonb_array_elements_text(coalesce(m->'lessons', '[]')) loop
          if not cid = any(seen) and (not exists(select 1 from public.lessons where id = cid)
            or exists(select 1 from public.lessons where id = cid and data->'tracks' ? (t->>'id'))) then
            ordered := ordered || to_jsonb(cid); seen := array_append(seen, cid);
          end if;
        end loop;
        sections := sections || jsonb_build_array(jsonb_set(m, '{lessons}', ordered));
      end loop;
      for row_course in select id from public.lessons where status = 'published' and data->'tracks' ? (t->>'id') order by id loop
        if not row_course.id = any(seen) then
          if jsonb_array_length(sections) = 0 then
            sections := jsonb_build_array(jsonb_build_object('id', 'courses', 'title', t->'title', 'lessons', '[]'::jsonb));
          end if;
          sections := jsonb_set(sections, '{0,lessons}', (sections->0->'lessons') || to_jsonb(row_course.id));
          seen := array_append(seen, row_course.id);
        end if;
      end loop;
      new_config := new_config || jsonb_build_array(jsonb_set(t, '{modules}', sections));
    end loop;
    update public.app_config set data = new_config where key = 'tracks';
  end if;
end $$;

-- Finished AI jobs remain reopenable using the same stable row IDs and classification.
update public.draft_jobs j set result = jsonb_set(result, '{lesson}',
  ((result->'lesson') - 'track' - 'module' - 'tags') || jsonb_build_object('subject', l.data->'subject', 'tracks', l.data->'tracks')
) from public.lessons l where j.lesson_id = l.id and jsonb_typeof(result->'lesson') = 'object';

commit;
