# Knowledge-base platforms

## Current hadith source policy — 3 October 2026

HadeethEnc is now the application's primary canonical source of truth for hadith
text, its published English translations and associated explanations. Persisted
fields are `provider: hadeethenc`, `canonical_for: hadith`, `source_of_truth: true`,
`priority: primary`. See [`source_registry.json`](source_registry.json) and the
complete Arabic/English resource snapshot at
[`resources/hadeethenc/`](../../../resources/hadeethenc/README.md). Its manifest
and validation report define verified inventory coverage, paired/unpaired records
and explicit missing translations; the table below describes the earlier curated
survey, not complete provider inventory.

Delivered against 945 category/language inventories and 1,253 list pages:
3,574 Arabic full-detail records, 2,328 English records/pairs and 1,246 Arabic-only
records, with zero acquisition failures, duplicate dataset IDs or category-count
discrepancies. Exact raw bodies and all available provider fields are preserved.
Offline rebuild and completed restart each made zero HTTP requests and produced
identical datasets. Provider revision information is not supplied in this API
snapshot and is explicitly null; no revision was invented.

The official API documentation was rendered and real responses were checked.
The API offers full detail batches through `/api/v1/hadeeths/multiple/`, verified
against single-record responses and official pages in a bilingual pilot. Exact
raw bytes, provenance, vocabulary, original references, introductions, provider
grades, commentary and revision fields are retained. The official API terms
permit use with unchanged content and source attribution; the homepage additionally
specifies revision and transcript retention and freshness requirements. Absent
API revisions are explicitly reported rather than invented.

`content/tools/fetch_hadeethenc.py` now projects the saved corpus into the app's
curated source registry without network requests or stripping published wording.
Existing collection references stay secondary; Dorar and hadith quotations inside
books cannot replace canonical HadeethEnc text. Quran sources remain independent.
No translations, grades or embeddings are generated. Canonical status does not
promote a source's scholarly review status.

Survey of the platforms named in the challenge's updated scientific package
(`kb.pdf`, «المرجعية والحزمة العلمية والبيانات — محدث», pages 8–15), probed
2026-10-02. All requests were made with a curl-style User-Agent; none needed a key
unless noted.

| Platform | Status | Used for | Endpoint(s) | Auth | Reuse terms |
|---|---|---|---|---|---|
| **QuranEnc** موسوعة القرآن الكريم | ✅ works | Qur'an Arabic + English (`english_saheeh`, Noor International Center = Saheeh International, v1.1.2) | `/api/v1/translations/list/{lang}`, `/api/v1/translation/aya/{key}/{sura}/{aya}` → `{result:{arabic_text, translation, footnotes}}`; also `/sura/{key}/{n}`; SQLite/PDF downloads | none | Published on quranenc.com/en/home/api: republish allowed with **no modification, addition or deletion**, credit QuranEnc.com, state the version, keep translator info, update to latest version, no inappropriate ads. Other English keys: `english_rwwad`, `english_hilali_khan`. |
| **HadeethEnc** موسوعة الأحاديث النبوية | ✅ works | 152 hadith (ar+en) with grade, attribution, explanation, benefits, references | `/api/v1/languages`, `/api/v1/categories/list/?language=`, `/api/v1/hadeeths/list/?language=&category_id=&page=&per_page=`, `/api/v1/hadeeths/one/?language=&id=` | none | No terms text returned by the API or docs page (docs page renders client-side). Treated like QuranEnc: verbatim, credited, linked. |
| **TerminologyEnc** موسوعة المصطلحات الإسلامية | ✅ works (same API shape as HadeethEnc) | 38 glossary terms (ar+en) | `/api/v1/terms/list/?language=&category_id=&page=&per_page=`, `/api/v1/terms/one/?language=&id=` → `term, idio_def, brief_expl, brief_ling_def` | none | None published in the API. Verbatim, credited, linked. |
| **ICADB** القاعدة المركزية للمحتوى الإسلامي باللغات | ✅ works (Swagger at `/api/docs/`, "Public read-only API") | 37 approved Q&A cards (encyclopedias 110 لغير المسلمين and 102 للمسلمين) | `/api/encyclopedias/list/`, `/api/encyclopedias/{external_id}/cards/latest/?approved_only=true`, `/api/encyclopedias/cards/{id}/translations/{iso}/`; also Qur'an, books, lookup tables | none for reads (Basic auth defined for others) | Licence field "ICADB", no further text. **Q&A and terminology encyclopedias have no English yet** (translations endpoint 404 for all 202 non-Muslim Q&A cards); the hadith encyclopedia (101) has English. |
| **islamenc.com** موسوعة المحتوى الإسلامي باللغات | ⚠️ no documented public REST found | — | Site is client-rendered; `/api/*` paths tried return NestJS 404. Its cards come from ICADB, which we use directly. | — | — |
| **byenah.com** بيان الإسلام | ❌ 403 Forbidden on `/ar/api` and `/api` | — | — | — | — |
| **IslamHouse** دار الإسلام | ✅ works (public key from the Postman docs) | Not ingested | `api3.islamhouse.com/v3/<public-key>/main/{section}/{lang}/{lang}/{page}/{per}/json`; 494 English articles, 808 books | public key in URL | Items are mostly PDF/DOC attachments, not inline text — ingesting means PDF extraction (decision needed). |
| **mp3quran.net** | ✅ works | Recitation URL + ayah timings (Alafasy, Hafs, read 123) on every Qur'an source | `/api/v3/reciters?language=eng`, `/api/v3/ayat_timing/reads`, `/api/v3/ayat_timing?surah=&read=` | none | No terms text in API. Surah-level MP3s (`server8.mp3quran.net/afs/005.mp3`) with per-ayah `start_ms`/`end_ms`. |
| **dorar.net** الدرر السنية | ❌ Cloudflare challenge (403) for `article/389` and `dorar_api.json` from scripts | — | — | — | Would need a browser or an arrangement with dorar. |
| **mcp.islamiccontent.org** | ✅ works (Streamable HTTP at `/mcp`, no auth) | Not used (recorded only) | 11 read-only tools: `search`, `fetch`, `get_quran_verses`, `list_quran_translations`, `get_quran_audio` (per-verse MP3), `get_hadith`, `browse_hadith_categories`, `browse_library`, `get_library_item`, `list_library_categories`, `list_languages` | none | Site states: free, read-only, no tracking; "no fatwas — retrieves published text only". |

## What changed in the knowledge base

| Kind | Before | After |
|---|---|---|
| Qur'an (`quran`) | 29 ayat from quran.com (footnote markers stripped) | Same 29 ids re-sourced from QuranEnc, translation verbatim with markers + `footnotes_en`, version recorded, each with an Alafasy `recitation` |
| Hadith (`hadith`) | 9 (Bukhari/Muslim via hadith-api) | 9 + 152 HadeethEnc (`hadith:henc:*`), cross-linked via `see_also` where they are the same hadith |
| Q&A (`faq`) | 0 | 37 ICADB cards (Arabic) |
| Glossary (`dictionary`) | 0 | 38 TerminologyEnc terms (ar+en) |

Re-run: `python3 content/tools/fetch_quranenc.py && python3 content/tools/fetch_hadeethenc.py && python3 content/tools/fetch_terms.py && python3 content/tools/fetch_icadb_faq.py && python3 content/validate.py`.

## Quran reader recitation delivery — 3 October 2026

The separate reader now uses the already acquired **human recording** of
Mishary Alafasy (مشاري العفاسي), Hafs from Asim, mp3quran read **123**. This
does not modify or approve the 29 KB records above. Dataset/URL/future S3 key:
`quran/audio/alafasy-hafs-mp3quran-123`, relative to resources or the existing
`NEXT_PUBLIC_QURAN_BASE` (default `/data`). The reader credits the reciter,
riwaya and [mp3quran.net](https://mp3quran.net) under each available surah.

Delivered: surah Listen/Pause and Restart, verse play/pause with end stopping,
verse highlighting, Mushaf page crossing, buffering and retry, English/Arabic
RTL controls. Download was removed at the user's request. Only surahs listed
in the bundled recitation index get controls. Playback/navigation, missing-file
retry and 375 px layout were checked locally; full results and file provenance
are in [the resource inventory](../../../resources/README.md#human-quran-recitation-local-reader-delivery-3-october-2026).

All 114 surahs have structurally valid timing coverage; the 230 files listed in
metadata matched saved sizes and SHA-256. This is **not a listening check of
timing accuracy** or a review of reuse rights. The API snapshot has no published
terms text; permission for this reuse remains unresolved. No audio was generated
by AI. No source review statuses were promoted.

The local MP3 symlink supports HTTP Range 206. Static export was checked and
copies the full **1,718,021,595 bytes** into `out/`; it is not a lightweight audio
deployment. Proposed next step: omit MP3s during production export and supply
them separately under the same existing data base/key. The deployed audio
delivery, listening spot-check, reuse terms and S3 upload remain open; no upload
or infrastructure changes were made.


## Quran reader tafsir delivery — 3 October 2026

The reader now imports one published commentary book, **Al-Mukhtasar fi Tafsir
al-Quran al-Karim**, Tafsir Center for Quranic Studies, from **Quranpedia.net**:
Arabic 2003; English 27824; French 2005; Indonesian 2006; Russian 27825; Chinese
27827. Dataset/URL/future S3 prefixes are
`quran/tafsir/{lang}/mukhtasar-{book_id}`. Exact official download bytes, license,
manifest, acquisition time, SHA-256, metadata, verse records and validation
reports are preserved separately for every edition. Downloads total 14,818,006
bytes. Book 503 and Al-Muyassar were not used; the existing Mouaser archive stays
unused. No verse API crawl or AI-authored tafsir was involved.

All editions match 114 surahs and 6,236 ordered KFGQPC Hafs v30 verse keys with
unique IDs. **French commentary is incomplete:** 2,827 empty entries, all of
surahs 30–114; the reader says the source snapshot has no tafsir for those verses.
Other five editions have zero empty entries. All six have zero grouped passages.
Grouped handling was checked only with temporary nonreligious structural
fixtures, restored afterward. Urdu and Spanish have no specified edition and
show a language-unavailable message, preserving Arabic commentary when visible.

Delivered: per-verse expansion, lazy surah fetches, language/display matching,
plain text with lang/dir, loading/error/retry and accessible English/Arabic
controls. Footer credits the book, Tafsir Center and
[Quranpedia.net](https://quranpedia.net), with Arabic dump version 2026-08-10 and
translation catalogue observation 2026-10-02 (translations declare no release
version). Existing recitation remains functional.

Typecheck, lint, every web check script, content validation, offline corpus
checks and Webpack static export passed. Browser tests cover short/long text
in all six languages, display modes, missing languages/entries, 375 px and Arabic
interface, keyboard focus, retry, search/pickers/pagination and audio continuity.
Full schemas, per-file inventory and test scope are in
[the resource inventory](../../../resources/README.md#al-mukhtasar-tafsir-local-reader-delivery-3-october-2026).

Every edition remains `not_scholarly_reviewed`. Quranpedia redistribution requires
its link and dump version; the saved license retains third-party ownership of
contemporary works/translations. Scholarly review, French gaps, Urdu/Spanish
availability in these sources, and author/publisher reuse terms remain open.
No existing KB record was changed or approved. No S3 upload or live deployment
verification was performed by this tafsir task.
