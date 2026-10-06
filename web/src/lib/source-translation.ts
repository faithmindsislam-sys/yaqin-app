import type { Source } from "./types";

/** Validate raw static records too; a status flag cannot authorize a translation. */
export function scriptureEnglishStatus(source: Source): "published" | "unavailable" | "unsupported_provider" {
  if (typeof source.text_en !== "string" || !source.text_en.trim()) return "unavailable";
  if (typeof source.url !== "string" || source.url.includes("\\") || /[\s\u0000-\u001f\u007f]/.test(source.url)) return "unsupported_provider";
  const authority = /^https:\/\/([^/?#]+)/i.exec(source.url)?.[1];
  if (!authority || !/^[A-Za-z0-9.:-]+$/.test(authority)) return "unsupported_provider";
  try {
    const url = new URL(source.url);
    const rawPath = /^https:\/\/[^/?#]+(\/[^?#]*)/i.exec(source.url)?.[1];
    if (url.protocol !== "https:" || url.username || url.password || url.port || source.url.includes("?")
      || rawPath !== url.pathname) return "unsupported_provider";
    if (source.kind === "quran") {
      const verse = /^quran:([1-9][0-9]*):([1-9][0-9]*)$/.exec(source.id);
      if (!verse) return "unsupported_provider";
      const chapter = /^\/en\/browse\/[a-z0-9_]+\/([1-9][0-9]*)$/.exec(url.pathname);
      if (url.hostname === "quranenc.com" && chapter?.[1] === verse[1] && url.hash === `#${verse[2]}`
        && typeof source.translation === "string" && source.translation.includes("QuranEnc")) return "published";
      if (url.hostname === "quran.com" && url.pathname === `/${verse[1]}/${verse[2]}` && !source.url.includes("#")
        && source.translation === "Saheeh International") return "published";
      if (url.hostname === "quranpedia.net" && url.pathname === `/surah/1/${verse[1]}/book/13638` && !source.url.includes("#")
        && ((source.translation === "Sahih International - English translation (Quranpedia.net)" && source.origin === "Quranpedia.net")
          || (source.translation === "Sahih International (Quranpedia.net)"
            && source.origin === "Quranpedia.net / King Fahd Glorious Quran Printing Complex"))) return "published";
    }
    if (source.kind === "hadith") {
      const hadith = /^\/en\/browse\/hadith\/([1-9][0-9]*)$/.exec(url.pathname);
      if (url.hostname === "hadeethenc.com" && hadith && !source.url.includes("#") && source.id === `hadith:henc:${hadith[1]}`
        && source.translation === "HadeethEnc published English translation"
        && (source.provider === undefined || source.provider === "hadeethenc")) return "published";
    }
  } catch { /* Malformed URLs have no approved translation provenance. */ }
  return "unsupported_provider";
}
