-- Knowledge-base fields that vary by source kind (see docs/CONTRACT.md):
-- hadith explanation/benefits/attribution, Qur'an footnotes and recitation,
-- Q&A questions, glossary terms, cross-links. Core columns stay as they are.
alter table public.sources add column if not exists extra jsonb not null default '{}'::jsonb;
