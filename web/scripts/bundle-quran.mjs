// Splits the prepared Quran editions from the canonical S3 source into small static files
// under public/data, so the reader fetches one surah at a time and the search text only when the
// learner searches. Records keep their stable ids and provenance for later RAG.
import "./load-env.mjs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
// An explicit local directory is only for offline checks/authoring. Normal dev/build uses S3.
const resources = process.env.YAQIN_RESOURCES_DIR || mkdtempSync(join(tmpdir(), "yaqin-quran-"));
const fromS3 = !process.env.YAQIN_RESOURCES_DIR;
if (fromS3) {
  process.on("exit", () => rmSync(resources, { recursive: true, force: true }));
  const venvPython = join(here, "..", "..", "api", ".venv", "bin", "python");
  execFileSync(process.env.QURAN_PYTHON || (existsSync(venvPython) ? venvPython : "python3"), [
    join(here, "sync-quran.py"), process.env.QURAN_S3_URI || "s3://yaqin-resources-744172873146/resources/quran/", resources,
  ], { stdio: "inherit" });
}
const remoteObjects = fromS3 ? JSON.parse(readFileSync(join(resources, "s3-objects.json"), "utf8")) : null;
const outRoot = join(here, "..", "public", "data");
// Keys relative to the resources root; the same keys are used as URL paths and S3 object prefixes.
const TRANSLATIONS = ["quran/fr/hamidullah-13611", "quran/en/sahih-international-13638",
  "quran/id/ministry-of-religious-affairs-1962", "quran/ur/junagarhi-13625",
  "quran/es/isa-garcia-13648", "quran/ru/kuliev-13620", "quran/zh/ma-jian-13626"];
const ARABIC = "quran/ar/kfgqpc-hafs-v30";
const RECITATION = "quran/audio/alafasy-hafs-mp3quran-123";
// Folder of each language's tafsir. Urdu has no Al-Mukhtasar: it gets Tafsir as-Sa'di, a different book.
const TAFSIR = { ar: "mukhtasar-2003", en: "mukhtasar-27824", fr: "mukhtasar-2005", id: "mukhtasar-2006", ru: "mukhtasar-27825", zh: "mukhtasar-27827", es: "mukhtasar-spanish_mokhtasar", ur: "saadi-urdu_saadi" };
const NAME_LANGUAGES = { fr: "french", en: "english", id: "indonesian", ur: "urdu", es: "spanish", ru: "russian", zh: "chinese" };

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** One prepared edition as { key, meta, surahs: verses[][] }, or null when it is not in resources. */
function readEdition(key) {
  const src = join(resources, key);
  if (!existsSync(join(src, "verses.jsonl"))) { console.warn(`quran: missing ${key}, skipped`); return null; }
  const meta = readJson(join(src, "metadata.json"));
  for (const [name, info] of Object.entries(meta.files)) {
    const bytes = readFileSync(join(src, name));
    if (bytes.length !== info.bytes || createHash("sha256").update(bytes).digest("hex") !== info.sha256) throw new Error(`quran: ${key}/${name} integrity failed`);
  }
  const surahs = [];
  let total = 0;
  let previousSurah = 1;
  const ids = new Set();
  for (const line of readFileSync(join(src, "verses.jsonl"), "utf8").split("\n")) {
    if (!line) continue;
    const verse = JSON.parse(line);
    if (verse.surah_number < previousSurah || verse.surah_number > previousSurah + 1 || ids.has(verse.id) || !verse.text.trim()) throw new Error(`quran: invalid record ${verse.id}`);
    previousSurah = verse.surah_number;
    ids.add(verse.id);
    const verses = (surahs[verse.surah_number - 1] ??= []);
    // The source file is ordered; refuse to publish anything that is not.
    if (verse.ayah_number !== verses.length + 1) throw new Error(`quran: ${key} verse out of order at ${verse.verse_key}`);
    verses.push(verse);
    total++;
  }
  if (surahs.includes(undefined) || surahs.length !== meta.expected_surah_count || total !== meta.expected_verse_count) {
    throw new Error(`quran: ${key} has ${surahs.length} surahs / ${total} verses, expected ${meta.expected_surah_count} / ${meta.expected_verse_count}`);
  }
  return { key, meta, surahs };
}

function writeEdition({ key, surahs }) {
  const out = join(outRoot, key);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "surahs"), { recursive: true });
  surahs.forEach((verses, i) => writeFileSync(join(out, "surahs", `${i + 1}.json`), JSON.stringify(verses.map((v) => ({
    id: v.id, verse_key: v.verse_key, surah_number: v.surah_number, ayah_number: v.ayah_number,
    text: v.text, source_url: v.source_url, page: v.page ?? v.source_page_number, juz: v.juz,
  })))));
  // One string per verse, in verse order: the search text the reader loads on the first search.
  writeFileSync(join(out, "search.json"), JSON.stringify(surahs.flat().map((v) => v.text_simple ?? v.text)));
}

/** Verify prepared tafsir before publishing; empty commentary remains explicit. */
function writeTafsir(arabic) {
  const result = {};
  for (const [lang, folder] of Object.entries(TAFSIR)) {
    const key = `quran/tafsir/${lang}/${folder}`;
    const src = join(resources, key);
    const out = join(outRoot, key);
    rmSync(out, { recursive: true, force: true });
    if (!existsSync(join(src, "tafsir.jsonl"))) { console.warn(`tafsir: missing ${key}, skipped`); continue; }
    if (!arabic) throw new Error("tafsir requires the Arabic reference edition");
    const meta = readJson(join(src, "metadata.json"));
    const validation = readJson(join(src, "validation.json"));
    for (const [name, info] of Object.entries(meta.files)) {
      const bytes = readFileSync(join(src, name));
      if (bytes.length !== info.bytes || createHash("sha256").update(bytes).digest("hex") !== info.sha256) throw new Error(`tafsir: ${key}/${name} integrity failed`);
    }
    const records = readFileSync(join(src, "tafsir.jsonl"), "utf8").trimEnd().split("\n").map(JSON.parse);
    const reference = arabic.surahs.flat();
    const ids = new Set(records.map((v) => v.id));
    if (validation.status !== "passed" || meta.dataset_key !== key || meta.language !== lang || records.length !== 6236 || ids.size !== 6236 || records.some((v, i) => v.verse_key !== reference[i].verse_key || v.surah_number !== reference[i].surah_number || v.ayah_number !== reference[i].ayah_number || !Array.isArray(v.passages) || v.passages.some((p) => typeof p.text !== "string" || typeof p.source_text !== "string" || !p.verse_range.includes(v.verse_key)))) throw new Error(`tafsir: ${key} failed coverage/identity validation`);
    mkdirSync(join(out, "surahs"), { recursive: true });
    for (let s = 1; s <= 114; s++) {
      writeFileSync(join(out, "surahs", `${s}.json`), JSON.stringify(records.filter((v) => v.surah_number === s).map(({ id, verse_key, surah_number, ayah_number, passages }) => ({ id, verse_key, surah_number, ayah_number, passages: passages.map(({ text, verse_range }) => ({ text, verse_range })) }))));
    }
    writeFileSync(join(out, "metadata.json"), JSON.stringify(meta));
    writeFileSync(join(out, "LICENSE.md"), readFileSync(join(src, "source/LICENSE.md")));
    result[lang] = { ...meta, key, empty_verse_count: validation.empty_verse_count, grouped_verse_count: validation.grouped_verse_count };
  }
  return result;
}

/** Publishes timings for MP3s verified in the S3 inventory; audio is never copied into the site. */
function writeRecitation(ayahCounts) {
  const src = join(resources, RECITATION);
  const out = join(outRoot, RECITATION);
  rmSync(out, { recursive: true, force: true });
  if (!existsSync(join(src, "timings.jsonl"))) { console.warn(`quran: missing ${RECITATION}, skipped (no listening)`); return null; }
  const meta = readJson(join(src, "metadata.json"));
  for (const [name, info] of Object.entries(meta.files)) {
    if (name.startsWith("mp3/")) continue;
    const bytes = readFileSync(join(src, name));
    if (bytes.length !== info.bytes || createHash("sha256").update(bytes).digest("hex") !== info.sha256) throw new Error(`quran: ${RECITATION}/${name} integrity failed`);
  }
  mkdirSync(join(out, "timings"), { recursive: true });
  const surahs = [];
  for (const line of readFileSync(join(src, "timings.jsonl"), "utf8").split("\n")) {
    if (!line) continue;
    const { surah, ayahs } = JSON.parse(line);
    if (!Number.isInteger(surah) || surah < 1 || surah > ayahCounts.length || surahs.includes(surah) || !Array.isArray(ayahs) || !ayahs.every((t, i) => Array.isArray(t) && t.length === 2 && t.every(Number.isFinite) && t[0] >= 0 && t[1] > t[0] && (!i || t[0] >= ayahs[i - 1][0]))) throw new Error(`quran: invalid timings for surah ${surah}`);
    const name = `mp3/${String(surah).padStart(3, "0")}.mp3`;
    const expected = meta.files[name];
    // Offline authoring checks use metadata; normal builds require the actual S3 object size.
    if (ayahs.length !== ayahCounts[surah - 1] || !expected?.bytes || (remoteObjects && remoteObjects[`${RECITATION}/${name}`] !== expected.bytes)) throw new Error(`quran: missing or incomplete S3 audio for surah ${surah}`);
    writeFileSync(join(out, "timings", `${surah}.json`), JSON.stringify(ayahs));
    surahs.push(surah);
  }
  if (surahs.length !== 114) throw new Error(`quran: incomplete recitation (${surahs.length}/114 surahs)`);
  return { provider: meta.provider, provider_url: meta.provider_url, reciter: meta.reciter, reciter_ar: meta.reciter_ar, review_status: meta.review_status, surahs };
}

const translations = TRANSLATIONS.map(readEdition).filter(Boolean);
if (!translations.length) {
  throw new Error("quran: no S3 translations found; refusing an incomplete build");
} else {
  const arabic = readEdition(ARABIC);
  if (fromS3 && (translations.length !== TRANSLATIONS.length || !arabic)) throw new Error("quran: incomplete S3 text editions");
  const base = translations[0];
  // Arabic is only published next to a translation when both have the same verses.
  for (const edition of arabic ? translations : []) {
    const at = edition.surahs.findIndex((verses, i) => verses.length !== arabic.surahs[i].length);
    if (at >= 0) throw new Error(`quran: ${ARABIC} and ${edition.key} differ in surah ${at + 1}`);
  }
  const editions = [...translations, ...(arabic ? [arabic] : [])];
  editions.forEach(writeEdition);
  const recitation = writeRecitation(base.surahs.map((verses) => verses.length));
  const tafsir = writeTafsir(arabic);
  if (fromS3 && Object.keys(tafsir).length !== Object.keys(TAFSIR).length) throw new Error("quran: incomplete S3 tafsir editions");

  const names = {};
  for (const [lang, language] of Object.entries(NAME_LANGUAGES)) {
    const file = join(resources, `quran/surah-names/quran-com-v4-chapters-${lang}.json`);
    const chapters = existsSync(file) ? readJson(file).chapters : [];
    if (chapters.length === 114 && chapters.every((c) => c.translated_name.language_name.toLowerCase() === language)) names[lang] = chapters;
    else console.warn(`quran: no verified ${lang} surah names; using transliteration`);
  }
  writeFileSync(join(outRoot, "quran", "index.json"), JSON.stringify({
    // Chapter names are metadata from the providers, not verse text.
    surahs: base.surahs.map((verses, i) => {
      const chapter = names.en?.find((c) => c.id === i + 1);
      const first = arabic?.surahs[i][0];
      return { number: i + 1, ayahs: verses.length, name_ar: first?.surah_name_ar, name_latin: first?.surah_name_latin ?? chapter?.name_simple, names: Object.fromEntries(Object.entries(names).map(([lang, chapters]) => [lang, chapters.find((c) => c.id === i + 1)?.translated_name.name])) };
    }),
    editions: Object.fromEntries(editions.map(({ key, meta }) => [key, {
      dataset_id: meta.dataset_id, snapshot_id: meta.snapshot_id, source_type: meta.source_type, title: meta.title,
      provider: meta.provider, provider_url: meta.provider_url, translator: meta.translator, language: meta.language,
      catalogue_version_observed: meta.catalogue_version_observed, review_status: meta.review_status,
    }])),
    recitations: recitation ? { [RECITATION]: recitation } : {},
    tafsir,
  }));
  console.log(`quran: ${editions.map((e) => e.key).join(" + ")} → ${base.surahs.length} surahs, ${base.surahs.flat().length} verses`);
}
