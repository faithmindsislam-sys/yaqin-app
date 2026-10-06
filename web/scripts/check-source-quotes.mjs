import assert from "node:assert/strict";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSource } from "./load-source.mjs";

const S = loadSource(new URL("../src/lib/strings.ts", import.meta.url)).S;
const text = (node) => Array.isArray(node) ? node.map(text).join("")
  : node && typeof node === "object" ? text(node.props?.children) : String(node ?? "");
const { scriptureEnglishStatus } = loadSource(new URL("../src/lib/source-translation.ts", import.meta.url), {}, { URL });
const quran = { id: "quran:106:3", kind: "quran", ref_en: "Qur’an 106:3", ref_ar: "سورة قريش: ٣",
  text_ar: "فَلْيَعْبُدُوا رَبَّ هَٰذَا الْبَيْتِ", text_en: "So let them worship the Lord of this House.",
  url: "https://quranenc.com/en/browse/english_saheeh/106#3", review_status: "approved",
  translation: "English Translation - Noor International Center (QuranEnc english_saheeh v1.1.2)" };
const hadith = { id: "hadith:henc:10025", kind: "hadith", ref_en: "Hadith 10025", ref_ar: "حديث ١٠٠٢٥",
  text_ar: "نص الحديث الأصلي دون تغيير", text_en: "The published English hadith, with its exact punctuation.",
  url: "https://hadeethenc.com/en/browse/hadith/10025", review_status: "pending", provider: "hadeethenc",
  translation: "HadeethEnc published English translation", grading: "Authentic hadith · صحيح" };
const legacyQuran = { ...quran, url: "https://quran.com/106/3", translation: "Saheeh International" };
const catalogQuran = { ...quran, url: "https://quranpedia.net/surah/1/106/book/13638", origin: "Quranpedia.net",
  translation: "Sahih International - English translation (Quranpedia.net)" };
const curatedQuran = { ...catalogQuran, translation: "Sahih International (Quranpedia.net)",
  origin: "Quranpedia.net / King Fahd Glorious Quran Printing Complex" };
const rejected = [
  ...["http://quranenc.com/en/browse/english_saheeh/106#3", "https://quranenc.com.evil.test/en/browse/english_saheeh/106#3",
    "https://www.quranenc.com/en/browse/english_saheeh/106#3", "https://reader@quranenc.com/en/browse/english_saheeh/106#3",
    "https://quranenc.com:444/en/browse/english_saheeh/106#3", "https://quranenc.com/en/browse/english_saheeh/107#3",
    "https://quranenc.com/en/browse/english_saheeh/106#4", "https://quranenc.com/en/browse/english_saheeh/106",
    "https://quranenc.com/en/browse/english_saheeh/106?translation=other#3", "not a URL",
    "https://quranenc.com/en/browse/english_saheeh/106?#3", "https://quranenc.com/en/browse/english_saheeh/106/../106#3",
    "https://quranenc.com/en/browse/english_saheeh/106/%2e%2e/106#3", "https://quranenc.com\\en\\browse\\english_saheeh\\106#3",
    "https://quranenc.com/en/browse/english.saheeh/106#3", "https://quranenc.com/en/browse/english%2fsaheeh/106#3",
    " https://quranenc.com/en/browse/english_saheeh/106#3"].map((url) => ({ ...quran, url })),
  { ...quran, id: "quran:0106:3" }, { ...quran, translation: "Unknown English edition" },
  { ...quran, url: "https://quranpedia.net/surah/1/106/book/13638", translation: "Sahih International (Quranpedia.net)" },
  { ...legacyQuran, url: "https://quran.com/106:3" }, { ...legacyQuran, url: "https://quran.com/106/4" },
  { ...legacyQuran, url: "https://quran.com/106/3#3" }, { ...legacyQuran, url: "https://quran.com/106/3?edition=other" },
  { ...legacyQuran, url: "https://quran.com/106/3#" },
  { ...legacyQuran, translation: "Saheeh International (unverified edition)" },
  { ...catalogQuran, url: "https://quranpedia.net/surah/1/107/book/13638" },
  { ...catalogQuran, url: "https://quranpedia.net/surah/106/1/book/13638" },
  { ...curatedQuran, url: "https://quranpedia.net/surah/1/107/book/13638" },
  { ...catalogQuran, translation: "Sahih International (Quranpedia.net)" }, { ...catalogQuran, origin: "QuranEnc" },
  { ...curatedQuran, origin: "Quranpedia.net" },
  ...["https://hadeethenc.com.evil.test/en/browse/hadith/10025", "https://hadeethenc.com/en/browse/hadith/10026",
    "https://%68adeethenc.com/en/browse/hadith/10025", "https://@hadeethenc.com/en/browse/hadith/10025",
    "https://hadeethenc.com/en/browse/hadith/10025#1", "https://hadeethenc.com/en/browse/hadith/10025?lang=en",
    "https://hadeethenc.com/en/browse/hadith/010025"].map((url) => ({ ...hadith, url })),
  { ...hadith, provider: "another-provider" }, { ...hadith, provider: null }, { ...hadith, translation: "HadeethEnc translation" },
  { ...hadith, id: "hadith:bukhari:1", see_also: [hadith.id] },
  { ...hadith, id: "hadith:bukhari:1", url: "https://sunnah.com/bukhari:1", provider: "fawazahmed0/hadith-api",
    translation: "fawazahmed0/hadith-api eng-bukhari", see_also: [hadith.id], grading: "Sahih (al-Bukhari)" },
];
for (const source of [quran, hadith, legacyQuran, catalogQuran, curatedQuran, { ...hadith, provider: undefined },
  { ...quran, url: quran.url.replace(".com/", ".com:443/") }]) {
  assert.equal(scriptureEnglishStatus(source), "published", source.url);
}
for (const source of rejected) {
  assert.equal(scriptureEnglishStatus({ ...source, translation_status_en: "published" }), "unsupported_provider",
    `A status flag cannot approve ${source.id}: ${source.url}`);
}
for (const lang of ["en", "ar"]) {
  const t = (value) => value?.[lang] ?? "";
  const { SourceQuote, SourceReference } = loadSource(new URL("../src/features/courses/content.tsx", import.meta.url), {
    "react/jsx-runtime": jsx, "lucide-react": new Proxy({}, { get: () => () => null }),
    "./ContentProvider": { useContent: () => ({ sources: { [hadith.id]: hadith } }) },
    "@/lib/i18n": { useI18n: () => ({ t, lang }) }, "@/lib/strings": { S },
  }, { URL });
  const source = { id: "library:fixture", kind: "library", ref_en: "Book", ref_ar: "كتاب",
    text_en: "Original English evidence, except under the stated condition.", text_ar: "",
    review_status: "unreviewed", eligibility: "rag_access_eligible" };
  const reference = SourceReference({ id: source.id, source });
  assert.equal(reference.type, "details");
  assert.equal(reference.props.open, undefined, "Evidence is collapsed by default");
  const summary = text(reference.props.children[0]);
  assert(summary.includes(lang === "ar" ? source.ref_ar : source.ref_en));
  assert(summary.includes(t(S.lesson.pendingReview)), "Library review status stays visible in the short reference");
  assert(!summary.includes(source.text_en) && !summary.includes(source.id));
  const { AnswerView } = loadSource(new URL("../src/features/ask/Answer.tsx", import.meta.url), {
    "react/jsx-runtime": jsx, "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/lib/i18n": { useI18n: () => ({ t, lang }) }, "@/lib/strings": { S },
    "@/features/courses/content": { SourceReference },
  });
  const answer = AnswerView({ data: { tier: "B", answer: [{ type: "source", id: source.id }, { type: "text", text: "Answer text" },
    { type: "source", id: source.id }, { type: "source", id: "missing" }], sources: { [source.id]: source }, ai_generated: true, follow_ups: [], referral: null } });
  const footer = answer.props.children.find((child) => child?.type === "footer");
  assert.equal(footer.props.children[1].length, 1, "Only cited, known sources appear once in the footer");
  const formatted = renderToStaticMarkup(jsx.jsx(AnswerView, { showSources: false, data: {
    tier: "A", answer: [{ type: "text", text: "## A clear heading\n\n**Another heading**\nA **bold** and *italic* explanation.\n\n- First point\n- Second point\n\n3. Third step\n4. Fourth step\n\n<script>alert('unsafe')</script>" },
      { type: "source", id: source.id }], sources: { [source.id]: source }, ai_generated: true, follow_ups: [], referral: null } }));
  assert(formatted.includes("<h3") && formatted.includes("<ul") && formatted.includes('<ol start="3"') && formatted.includes("<strong") && formatted.includes("<em>"), "Headings, lists and emphasis render as readable HTML");
  assert(!formatted.includes("<footer") && !formatted.includes(t(S.ask.tier.A)), "Hidden sources and the settled badge stay out of the answer");
  assert(formatted.includes("&lt;script&gt;") && !formatted.includes("<script>"), "Model HTML stays escaped");
  const rendered = text(SourceQuote({ id: source.id, source }));
  assert(rendered.includes(source.text_en), "Original English evidence remains visible in Arabic UI");
  assert(rendered.includes(t(S.lesson.fromLibrary)));
  assert(rendered.includes(t(S.lesson.pendingReview)), "Retrieval eligibility cannot look like scholarly approval");
  assert(!rendered.includes(t(S.lesson.revealed)), "Library commentary is not revealed text");
  const arabic = { ...source, text_en: "", text_ar: "نص عربي أصلي مع شروطه" };
  assert(text(SourceQuote({ id: arabic.id, source: arabic })).includes(arabic.text_ar));
  for (const scripture of [quran, hadith, legacyQuran, catalogQuran, curatedQuran]) {
    const node = SourceQuote({ id: scripture.id, source: scripture });
    const rendered = text(node);
    const footer = text(node.props.children.find((child) => child?.type === "figcaption"));
    assert(rendered.includes(scripture.text_ar), "Keep the exact Arabic original");
    assert(rendered.includes(lang === "ar" ? scripture.ref_ar : scripture.ref_en));
    assert(rendered.includes(t(S.lesson.revealed)) && !rendered.includes(t(S.lesson.fromLibrary)));
    assert.equal(rendered.includes(`“${scripture.text_en}”`), lang === "en", "Do not rewrite published translations");
    assert.equal(footer.includes(scripture.translation), lang === "en", "Show the edition verbatim only with its English text");
    if (scripture.grading) assert(footer.includes(scripture.grading), "Keep the grading verbatim");
    if (scripture.review_status === "pending") assert(footer.includes(t(S.lesson.pendingReview)));
    assert(!rendered.includes(t(S.lesson.translationUnavailable)));
  }
  const fallback = { ...quran, text_ar: "" };
  assert(text(SourceQuote({ id: fallback.id, source: fallback })).includes(fallback.text_en));
  for (const scripture of [...rejected, { ...quran, text_en: "" }, { ...hadith, text_en: "   " }]) {
    const rendered = text(SourceQuote({ id: scripture.id, source: scripture }));
    assert(rendered.includes(scripture.text_ar), "Unavailable English must not hide the original Arabic");
    if (scripture.text_en.trim()) assert(!rendered.includes(scripture.text_en), "Withhold unsupported English");
    assert(!rendered.includes(scripture.translation), "Do not label withheld text as a published translation");
    assert.equal(rendered.includes(t(S.lesson.translationUnavailable)), lang === "en");
    if (scripture.grading) assert(rendered.includes(scripture.grading));
  }
  const legacy = { ...rejected.at(-1), text_en: "Legacy English must not replace the canonical record." };
  const renderedLegacy = text(SourceQuote({ id: legacy.id, source: legacy }));
  assert(!renderedLegacy.includes(hadith.text_en) && !renderedLegacy.includes(legacy.text_en), "Aliases cannot replace evidence");
  assert(renderedLegacy.includes(legacy.ref_en) || renderedLegacy.includes(legacy.ref_ar));
  assert.equal(scriptureEnglishStatus({ ...quran, text_en: "" }), "unavailable");
}
console.log("Approved scripture provenance, exact translations/editions/grades, unavailable English, aliases and bilingual library labels passed.");
