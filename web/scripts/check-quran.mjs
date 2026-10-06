// Small regression check for language matching and edition-keyed downloads.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/features/quran/data.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
process.env.NEXT_PUBLIC_QURAN_BASE = "https://quran.test/data/";
process.env.NEXT_PUBLIC_QURAN_AUDIO_BASE = "https://quran.test/resources/";
const quran = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
assert.equal(quran.fold("Miséricordieux"), "misericordieux");
assert.notEqual(quran.fold("й"), quran.fold("и"));
assert.notEqual(quran.fold("ё"), quran.fold("е"));
assert.equal(quran.fold("真主"), "真主");
assert.deepEqual(quran.splitMatch("abc اللہ xyz", quran.fold("اللہ")), ["abc ", "اللہ", " xyz"]);
assert.deepEqual(quran.splitMatch("Été", quran.fold("ete")), ["", "Été", ""]);
const timings = [[1000, 2000], [2000, 3000], [3500, 5000]];
for (const [ms, verse] of [[0, 0], [999, 0], [1000, 1], [1999, 1], [2000, 2], [2999, 2], [3000, 0], [3499, 0], [3500, 3], [4999, 3], [5000, 0], [6000, 0]]) {
  assert.equal(quran.ayahAt(timings, ms), verse, `ayahAt at ${ms}ms`);
}
assert.equal(quran.ayahAt([], 0), 0);
assert.equal(quran.audioUrl(2), "https://quran.test/resources/quran/audio/alafasy-hafs-mp3quran-123/mp3/002.mp3");
const originalFetch = globalThis.fetch;
const requests = [];
let fail = true;
globalThis.fetch = async (url) => {
  requests.push(url);
  if (url.includes("retry") && fail) { fail = false; return { ok: false, status: 503 }; }
  if (url.includes("/tafsir/") || url.includes("tafsir-retry")) {
    const surah = Number(/\/(\d+)\.json$/.exec(url)[1]);
    return { ok: true, json: async () => [{ id: `${url}:1`, verse_key: `${surah}:1`, surah_number: surah, ayah_number: 1, passages: [{ text: "Published fixture", verse_range: [`${surah}:1`] }] }] };
  }
  return { ok: true, json: async () => [url.includes("english") ? "English sample" : "Other sample"] };
};
try {
  const french = await quran.loadSearch("french", "arabic");
  assert.ok(requests.every((url) => url.startsWith("https://quran.test/data/")));
  const english = await quran.loadSearch("english", "arabic");
  assert.notDeepEqual(french.translation, english.translation);
  assert.equal(await quran.loadSearch("english", "arabic"), english);
  assert.equal(requests.filter((url) => url.includes("arabic")).length, 1);
  assert.equal(requests.length, 3);
  await assert.rejects(quran.loadSearch("retry", null));
  await quran.loadSearch("retry", null);
  assert.equal(requests.filter((url) => url.includes("retry")).length, 2);
  const tafsir = quran.loadTafsir("quran/tafsir/en/mukhtasar-27824", 2);
  assert.equal(quran.loadTafsir("quran/tafsir/en/mukhtasar-27824", 2), tafsir);
  await tafsir;
  await quran.loadTafsir("quran/tafsir/fr/mukhtasar-2005", 2);
  await quran.loadTafsir("quran/tafsir/en/mukhtasar-27824", 1);
  assert.equal(requests.filter((url) => url.includes("/tafsir/")).length, 3);
  fail = true;
  await assert.rejects(quran.loadTafsir("tafsir-retry", 1));
  await quran.loadTafsir("tafsir-retry", 1);
  assert.equal(requests.filter((url) => url.includes("tafsir-retry")).length, 2);
  await assert.rejects(quran.loadTafsir("invalid-data", 1), /Invalid tafsir data/);
} finally { globalThis.fetch = originalFetch; }
console.log("Quran: verse timing boundaries/gaps, audio URL, accents, Cyrillic distinctions, Chinese, Urdu highlight, selected-edition caching and retry passed.");
console.log("Tafsir: edition/surah caching and failed-request retry passed.");
