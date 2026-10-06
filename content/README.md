# Yaqin content

Courses, subjects, tracks and approved sources for the three learning tracks. The shape of
every file is defined in [`docs/CONTRACT.md`](../docs/CONTRACT.md).

```
content/
  tracks.json              tracks → modules → ordered course ids
  subjects.json            independent bilingual subject registry
  course-migration.json    legacy id/group → subject mapping for existing content
  lessons/<id>.json        one course: pages (cards), explain-back checklist, quiz
  sources/quran.json       Quran verses (verbatim, fetched)
  sources/hadith.json      hadith (verbatim, fetched)
  eval/safety_cases.json   the 12 scientific-package safety test cases
  tools/fetch_sources.py   regenerates sources/ from the upstream APIs
  validate.py              shape + integrity checks (run before every commit)
```

The `lessons/` directory and `modules[].lessons` ordering keys remain compatible
with existing IDs, narration files and saved progress. They do not add a lesson
layer. Course JSON owns `subject`, difficulty `level`, and the `tracks` membership
array. Track modules own bilingual goals and ordering. Each module may
include several subjects, independently of course difficulty. Publishing keeps existing positions and appends new memberships
to the first group. Course tags are removed. `validate.py` checks membership, ordering,
duplicate references, subjects and the absence of old classification fields.

The course migration only changes metadata. Existing page prose, source quotations,
question text, stable IDs and level values stay intact. The reviewer checklist below
is retained as historical review material.

## Provenance

HadeethEnc is our primary canonical source of truth for hadith text, its published
English translations and associated explanations. This is registered in
[`kb/source_registry.json`](kb/source_registry.json), the HadeethEnc source records
and [`resources/hadeethenc/manifest.json`](../../resources/hadeethenc/manifest.json)
using `provider: hadeethenc`, `canonical_for: hadith`, `source_of_truth: true`,
`priority: primary`. Full ar/en acquisition, exact raw bytes, explicit untranslated
records and coverage evidence live in [`resources/hadeethenc/`](../../resources/hadeethenc/README.md).
Dorar and book quotations are secondary references; Quran provenance remains
independent. Existing collection references and provider grades are preserved.

**Nothing in `sources/` is typed by hand.** Every item is downloaded by a script
in `tools/` and written unchanged. Re-running the scripts reproduces the files
(responses are cached in `kb/cache/`, which is not committed).

The challenge's updated scientific package (`kb/kb.pdf`, pages 8–15) names the
platforms of جمعية خدمة المحتوى الإسلامي باللغات as the reference for approved
translations, so the knowledge base is built on them. See `kb/SOURCES.md` for
what each platform's API offers and its reuse terms.

| File | Kind | Arabic | English | Upstream | Script |
|---|---|---|---|---|---|
| `quran.json` | `quran` | QuranEnc Arabic (King Fahd Madani orthography) | Saheeh International — Noor International Center, QuranEnc `english_saheeh` (version recorded per entry), **unmodified including footnote markers**; footnotes in `footnotes_en` | QuranEnc.com | `tools/fetch_quranenc.py` |
| `quran.json` → `recitation` | — | Mishary Alafasy, Hafs, per-surah MP3 with ayah `start_ms`/`end_ms` | — | mp3quran.net | `tools/fetch_quranenc.py` |
| `hadith.json` (`hadith:henc:*`) | `hadith` | HadeethEnc hadith text | HadeethEnc translation | HadeethEnc.com | `tools/fetch_hadeethenc.py` |
| `hadith.json` (`hadith:bukhari:*`, `hadith:muslim:*`) | `hadith` | Arabic edition | English edition | `fawazahmed0/hadith-api@1` | `api/scripts/fetch_sources.py` |
| `faq.json` | `faq` | Approved Q&A cards (Arabic only as published) | — | ICADB, encyclopedias 110 and 102 | `tools/fetch_icadb_faq.py` |
| `dictionary.json` | `dictionary` | TerminologyEnc definition + explanation | TerminologyEnc translation | TerminologyEnc.com | `tools/fetch_terms.py` |

**Commentary is not revealed text.** HadeethEnc's explanation (شرح) and
benefits (فوائد) are stored in `explanation_*` / `benefits_*`, never in
`text_*`. Their retrieval chunks are labelled "scholarly explanation (not hadith
text)" and resolve to the hadith id. Glossary and Q&A answers are reference
material: they may quote verses and hadith inside them, as published.

QuranEnc's terms allow republishing on condition of no modification, credit to
QuranEnc.com, and the version number — hence the footnote markers stay in the
English text, and each entry's `translation` field carries the version. The
English wording matched the earlier Saheeh International text exactly; the
Arabic changed only in orthographic encoding (King Fahd Madani Mushaf diacritics
instead of Tanzil's), not in wording.

Hadith ids from the two Sahih collections use the standard numbering shown on
sunnah.com (al-Bukhari's number; Fu'ad 'Abd al-Baqi's for Muslim, e.g.
`hadith:muslim:223`, with a letter for a sub-narration). HadeethEnc entries keep
HadeethEnc's own id (`hadith:henc:3313`); the Bukhari/Muslim numbers named in
HadeethEnc's reference list are stored in `collection_refs`, and `see_also`
links entries that are the same hadith. Each of the original nine hadith was
read in full before it was cited in a lesson. HadeethEnc grades are recorded
verbatim; no grade is inferred or independently upgraded. Canonical designation
does not mean that every record has received project scholarly review.

### What is AI-drafted

All lesson prose (`title`, `body`, `takeaway`, quiz text, explain-back key ideas)
was drafted with AI assistance and is labelled as explanation, never as
scripture. Scripture reaches the learner only through `quote` cards and the
*Sources* panel, both rendered from `sources/`. `validate.py` enforces this: it
fails if card prose reproduces four or more consecutive words (Arabic) or six or
more (English) of a cited verse or hadith.

## Review process

1. **Draft.** A lesson is written or edited as JSON, with every claim tied to a
   source id. `python3 content/validate.py --fix` fills the audio paths and must
   report `OK`.
2. **AI pre-review.** In the instructor workspace, `POST /api/review/check`
   checks that every cited id exists and supports the card, and flags strong
   wording on matters of disagreement.
3. **Scholarly review.** A qualified reviewer works through the checklist below,
   approves each source (`review_status: "approved"`), and approves or returns the
   lesson. Decisions are logged in `review_events`.
4. **Publish.** Only `status: "published"` lessons are served to learners. Until a
   reviewer signs off, sources stay `pending` and the UI shows them as
   *awaiting scholarly review*.

All lessons are currently `published` so the demo is complete. **All 38
sources are `pending`.**

## Reviewer checklist

Tick each item, or correct the lesson. Items marked **[C]** are matters of
scholarly disagreement (tier C), where the lesson must present the difference
without picking a side.

### First Steps as a Muslim — `wudu-order`
- [ ] c1: "The Prophet ﷺ described purity as half of faith" fairly reflects Muslim 534 (book 2, hadith 1).
- [ ] c3: the four obligatory parts are per 5:6. "Scholars generally include the elbows/ankles" fairly states the majority view.
- [ ] c4 **[C]**: order is obligatory for the Shafi'i and Hanbali schools, and Sunnah for the Hanafi and Maliki schools. Confirm the attribution.
- [ ] c5 **[C]**: intention is required for the majority, and Sunnah for the Hanafis; it need not be voiced. Confirm, and confirm that citing Bukhari 1 as the general basis is appropriate.
- [ ] c6: the description matches the hadith of Humran ('Uthman's wudu): Muslim 538 (book 2, hadith 5) and Bukhari 164 (book 4, hadith 30). It says once is valid and three times is the fuller Sunnah.
- [ ] c6 **[C]**: the Hanbali school holds rinsing the mouth and nose to be obligatory. Confirm the attribution.
- [ ] Quiz q3 ("once is valid, three is the fuller Sunnah") is accurate.

### First Steps as a Muslim — `what-breaks-wudu`
- [ ] c1: "you do not have to repeat wudu before every prayer if nothing has broken it." Bukhari 135 is cited; a more explicit source could be added.
- [ ] c3: urine, stool and wind as agreed nullifiers; Bukhari 135 and 5:6.
- [ ] c4 **[C]**: sleep. Deep sleep breaks wudu for most scholars; light dozing while seated firmly does not for many. Muslim 835 (Companions slept and prayed without renewing wudu) is cited. Confirm the framing, and the mention of touching the private parts and bleeding as disputed.
- [ ] c5: "certainty is not removed by doubt" as drawn from Bukhari 137 (book 4, hadith 3).

### Explore Islam — `spread-by-sword`
- [ ] c4 (historical, no scripture source): conversion in Egypt, Syria and Iraq was gradual over generations and centuries; protected communities kept their places of worship and paid jizya in exchange for exemption from military service. Check that this is fair and not overstated.
- [ ] c5 (historical): Indonesia, Malaysia and much of East and West Africa embraced Islam mainly through traders and teachers, not armies.
- [ ] c7: "rulers or individuals who coerced anyone acted against that teaching." Check the framing.
- [ ] 60:8 and 16:125 are cited as supporting principles, not as proof of the historical claims.

### Explore Islam — `kaaba-qibla`
- [ ] c4: the reading of 2:115 ("east and west belong to God") avoids any interpretation of "the Face of Allah" beyond what the lesson states.
- [ ] c5: unity and the Abraham connection; 2:127 and 2:150.

### Explore Islam — `who-is-god`
- [ ] c1: "Allah is the Arabic word for God; Arabic-speaking Christians use it too" (factual, uncited).
- [ ] c4: the three aspects of Tawhid (lordship, worship, names and attributes). The challenge glossary says to keep the term with an explanation and not reduce it to numerical oneness.
- [ ] c7: "no intermediaries, no priest needed."

### Deepen — `al-fatiha-meaning`
- [ ] c1: the summary of the hadith qudsi (Muslim 878, book 4, hadith 41).
- [ ] c3: al-Rahman (mercy for all creation) and al-Rahim (special mercy for believers), as commonly explained by classical exegetes.
- [ ] c3 **[C]**: whether the Basmala is a verse of Al-Fatiha. The difference is stated without picking a side.
- [ ] c5: hamd versus shukr; the meanings of Rabb and al-'alamin.
- [ ] c10: placing "Iyyaka" first expresses exclusivity (hasr).
- [ ] c13: the two ways of straying explained generically ("knowing the truth and abandoning it; losing it through ignorance"), without naming groups.

### Deepen — `why-face-qibla`
- [ ] c1: about sixteen or seventeen months facing Jerusalem, and the first prayer toward the Kaaba being 'Asr (Bukhari 40, book 2, hadith 33).
- [ ] c3: 2:143 "God would never let your faith go to waste" understood as referring to the earlier prayers (a common tafsir explanation).
- [ ] c6 **[C]**: what to do if you prayed in the wrong direction after a sincere effort; the lesson defers the details to a teacher.

### Sources
- [ ] Spot-check `text_ar` of every Quran entry against the King Fahd Mushaf (now sourced from QuranEnc).
- [ ] Confirm Saheeh International (QuranEnc `english_saheeh`) as the English translation, or pick `english_rwwad` (Rowwad Translation Center) — both are on QuranEnc.
- [ ] Review the 152 HadeethEnc hadith and their explanations; remove any that should not be used for a given track.
- [ ] Review the 37 ICADB Q&A answers (Arabic only) before they are shown to learners.
- [ ] Set `review_status: "approved"` on each source once checked.
