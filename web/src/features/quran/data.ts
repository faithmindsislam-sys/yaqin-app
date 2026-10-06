// Quran data for the reader: static files prepared by scripts/bundle-quran.mjs.
// The reader only knows this base URL, so the files can move to S3/CloudFront without UI changes.
// Default: same origin. The site's CloudFront distribution serves /data/quran/* and the
// recitation MP3s publicly on every hostname (yaqeenguide.com, www, app, studio).
const BASE = (process.env.NEXT_PUBLIC_QURAN_BASE || "/data").replace(/\/$/, "");
// MP3s stay in the canonical private resources bucket; CloudFront serves them publicly.
const AUDIO_BASE = (process.env.NEXT_PUBLIC_QURAN_AUDIO_BASE || "/resources").replace(/\/$/, "");

/** Translations the reader offers; the first one is the default. `key` is the dataset path under the base URL (and its S3 key prefix). */
export const EDITIONS = [
  { code: "en", name: "English", key: "quran/en/sahih-international-13638", label: "English — Sahih International", lang: "en", dir: "ltr" },
  { key: "quran/fr/hamidullah-13611", code: "fr", name: "Français", label: "Français — Muhammad Hamidullah", lang: "fr", dir: "ltr" },
  { code: "id", name: "Bahasa Indonesia", key: "quran/id/ministry-of-religious-affairs-1962", label: "Bahasa Indonesia — Ministry of Religious Affairs", lang: "id", dir: "ltr" },
  { code: "ur", name: "اردو", key: "quran/ur/junagarhi-13625", label: "اردو — Muhammad Junagarhi", lang: "ur", dir: "rtl" },
  { code: "es", name: "Español", key: "quran/es/isa-garcia-13648", label: "Español — Sheikh Isa Garcia", lang: "es", dir: "ltr" },
  { code: "ru", name: "Русский", key: "quran/ru/kuliev-13620", label: "Русский — Elmir Kuliev", lang: "ru", dir: "ltr" },
  { code: "zh", name: "中文", key: "quran/zh/ma-jian-13626", label: "中文 — Ma Jian", lang: "zh", dir: "ltr" },
] as const;
export type Edition = typeof EDITIONS[number];
/** Arabic text, shown only when the index lists this edition. */
export const ARABIC = "quran/ar/kfgqpc-hafs-v30";
/** Recitation: audio and verse timings live under this key (the dataset path, later its S3 key prefix). */
export const RECITATION = "quran/audio/alafasy-hafs-mp3quran-123";

export type Surah = { number: number; ayahs: number; name_ar?: string; name_latin?: string; names: Partial<Record<string, string>> };
export type EditionMeta = {
  dataset_id: string;
  snapshot_id: string;
  title: string;
  provider: string;
  provider_url: string;
  translator?: string;
  catalogue_version_observed?: string;
  review_status: string;
};
/** `surahs` lists the surahs that have both an audio file and validated timings. */
export type RecitationMeta = { provider: string; provider_url: string; reciter: string; reciter_ar: string; review_status: string; surahs: number[] };
export type TafsirMeta = EditionMeta & { key: string; language: string; direction: "ltr" | "rtl"; publisher: string | null; author?: string; dump_version: string; empty_verse_count: number; grouped_verse_count: number; supplement?: { provider: string; provider_url: string; surahs: string } };
export type TafsirVerse = { id: string; verse_key: string; surah_number: number; ayah_number: number; passages: { text: string; verse_range: string[] }[] };
export type QuranIndex = { surahs: Surah[]; editions: Record<string, EditionMeta>; recitations?: Record<string, RecitationMeta>; tafsir?: Record<string, TafsirMeta> };
/** Start and end of each verse in the surah's audio, in milliseconds, in verse order. */
export type Timings = [number, number][];
export type Verse = {
  id: string;
  verse_key: string;
  surah_number: number;
  ayah_number: number;
  text: string;
  source_url?: string;
  /** Mushaf page and juz, when the edition records them. */
  page?: number;
  juz?: number;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`Quran data ${res.status}`);
  return res.json();
}

export const loadIndex = () => get<QuranIndex>("quran/index.json");
export const loadSurah = (edition: string, surah: number) => get<Verse[]>(`${edition}/surahs/${surah}.json`);
const tafsirs = new Map<string, Promise<TafsirVerse[]>>();
/** On-demand, edition/surah cache. A failed request is evicted so retry works. */
export function loadTafsir(key: string, surah: number) {
  const path = `${key}/surahs/${surah}.json`;
  let result = tafsirs.get(path);
  if (!result) {
    result = get<TafsirVerse[]>(path).then((rows) => {
      if (!Array.isArray(rows) || !rows.length || rows.length > 286 || rows.some((v, i) => !v || v.surah_number !== surah || v.ayah_number !== i + 1 || v.verse_key !== `${surah}:${i + 1}` || typeof v.id !== "string" || !Array.isArray(v.passages) || v.passages.some((p) => !p || typeof p.text !== "string" || !Array.isArray(p.verse_range) || !p.verse_range.every((key) => typeof key === "string") || !p.verse_range.includes(v.verse_key)))) throw new Error("Invalid tafsir data");
      return rows;
    }).catch((error) => { tafsirs.delete(path); throw error; });
    tafsirs.set(path, result);
  }
  return result;
}
export const loadTimings = (surah: number) => get<Timings>(`${RECITATION}/timings/${surah}.json`);
export const audioUrl = (surah: number) => `${AUDIO_BASE}/${RECITATION}/mp3/${String(surah).padStart(3, "0")}.mp3`;

/** Verse recited at `ms` (1-based); 0 before the first verse starts and after the last one ends. */
export function ayahAt(timings: Timings, ms: number) {
  // ponytail: linear scan, a surah has 286 verses at most; binary search if it ever shows in a profile.
  let ayah = 0;
  while (ayah < timings.length && ms >= timings[ayah][0]) ayah++;
  return ayah && ms < timings[ayah - 1][1] ? ayah : 0;
}

/** Search key: lower case, no accents or Arabic diacritics, one form for alef, ya and ta marbuta. */
export function fold(text: string, arabic = false) {
  const key = text.normalize("NFD").replace(/(\p{Script=Latin})[\u0300-\u036f]+/gu, "$1").normalize("NFC").replace(/[ً-ٰٟۖ-ۭـ‎]/g, "").toLowerCase()
    .replace(/ٱ/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/œ/g, "oe").replace(/[’ʼ]/g, "'");
  // The plain Arabic text joins some words ("ياأيها"), so Arabic is matched without spaces.
  return arabic ? key.replace(/\s+/g, "") : key;
}

/** Cuts `text` around the first part whose search key equals `needle` (already folded), to highlight it. */
export function splitMatch(text: string, needle: string, arabic = false): [string, string, string] | null {
  let key = "";
  // For each character of the key: where its source character starts and ends in `text`.
  const at: [number, number][] = [];
  let i = 0;
  for (const ch of text) {
    const k = fold(ch, arabic);
    for (let n = 0; n < k.length; n++) at.push([i, i + ch.length]);
    key += k;
    i += ch.length;
  }
  const start = key.indexOf(needle);
  if (!needle || start < 0) return null;
  const from = at[start][0];
  const to = at[start + needle.length - 1][1];
  return [text.slice(0, from), text.slice(from, to), text.slice(to)];
}

/** Every verse as one string, in verse order: `ar` is the provider's plain spelling, kept for search. */
export type SearchData = { translation: string[]; ar: string[] | null; translationKey: string[]; arKey: string[] | null };
const searches = new Map<string, Promise<SearchData>>();
const arabicSearches = new Map<string, Promise<string[]>>();

export function loadSearch(translation: string, arabic: string | null) {
  const cacheKey = `${translation}:${arabic ?? ""}`;
  let cached = searches.get(cacheKey);
  if (!cached) {
    let ar = arabic ? arabicSearches.get(arabic) ?? null : null;
    if (arabic && !ar) {
      ar = get<string[]>(`${arabic}/search.json`).catch((e) => { arabicSearches.delete(arabic); throw e; });
      arabicSearches.set(arabic, ar);
    }
    cached = Promise.all([get<string[]>(`${translation}/search.json`), ar]).then(([text, ar]) => ({
      translation: text, ar, translationKey: text.map((s) => fold(s)), arKey: ar && ar.map((s) => fold(s, true)),
    })).catch((e) => { searches.delete(cacheKey); throw e; });
    searches.set(cacheKey, cached);
  }
  return cached;
}

/** Arabic counts 3–10 take the plural noun ("7 آيات"); every other count takes the singular ("11 آية"). */
export const few = (n: number) => n % 100 >= 3 && n % 100 <= 10;
