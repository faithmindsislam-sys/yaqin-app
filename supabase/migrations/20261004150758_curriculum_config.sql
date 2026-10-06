-- Dynamic catalogue configuration. No course or progress rows are rewritten.
begin;

insert into public.app_config (key, data) values ('subjects', $catalog$
[
  {
    "id": "islam",
    "title": {
      "en": "Islam essentials",
      "ar": "أساسيات الإسلام"
    },
    "levels": [
      1,
      2,
      3,
      4
    ]
  },
  {
    "id": "aqidah",
    "title": {
      "en": "Aqidah",
      "ar": "العقيدة"
    },
    "levels": [
      1,
      2,
      3,
      4
    ]
  },
  {
    "id": "fiqh",
    "title": {
      "en": "Fiqh",
      "ar": "الفقه"
    },
    "levels": [
      1,
      2,
      3,
      4
    ]
  },
  {
    "id": "quran",
    "title": {
      "en": "Quran",
      "ar": "القرآن"
    },
    "levels": [
      1,
      2,
      3,
      4
    ]
  },
  {
    "id": "seerah",
    "title": {
      "en": "Seerah",
      "ar": "السيرة"
    },
    "levels": [
      1,
      2,
      3,
      4
    ]
  },
  {
    "id": "hadith",
    "title": {
      "en": "Hadith",
      "ar": "الحديث"
    },
    "levels": [
      1,
      2,
      3,
      4
    ]
  },
  {
    "id": "history",
    "title": {
      "en": "History",
      "ar": "التاريخ"
    },
    "levels": [
      1,
      2,
      3,
      4
    ]
  },
  {
    "id": "ethics",
    "title": {
      "en": "Ethics",
      "ar": "الأخلاق"
    },
    "levels": [
      1,
      2,
      3,
      4
    ]
  }
]
$catalog$::jsonb) on conflict (key) do nothing;

insert into public.app_config (key, data) values ('levels', $catalog$
[
  {
    "id": 1,
    "title": {
      "en": "Level 1 — Foundations",
      "ar": "المستوى ١ — الأساسيات"
    }
  },
  {
    "id": 2,
    "title": {
      "en": "Level 2",
      "ar": "المستوى ٢"
    }
  },
  {
    "id": 3,
    "title": {
      "en": "Level 3",
      "ar": "المستوى ٣"
    }
  },
  {
    "id": 4,
    "title": {
      "en": "Level 4",
      "ar": "المستوى ٤"
    }
  }
]
$catalog$::jsonb) on conflict (key) do nothing;

-- Cross-row subject/level/offered-level rules are enforced inside API transactions.
alter table public.lessons drop constraint if exists courses_classification;
alter table public.lessons add constraint courses_classification check (
  data ? 'subject' and jsonb_typeof(data->'subject') = 'string'
  and length(btrim(data->>'subject')) > 0
  and data ? 'tracks' and jsonb_typeof(data->'tracks') = 'array'
  and jsonb_array_length(data->'tracks') between 1 and 3
  and data->'tracks' <@ '["explore", "first-steps", "deepen"]'::jsonb
  and (jsonb_array_length(data->'tracks') < 2 or data->'tracks'->0 <> data->'tracks'->1)
  and (jsonb_array_length(data->'tracks') < 3 or (data->'tracks'->0 <> data->'tracks'->2 and data->'tracks'->1 <> data->'tracks'->2))
  and not (data ?| array['track', 'module', 'tags'])
);

commit;
