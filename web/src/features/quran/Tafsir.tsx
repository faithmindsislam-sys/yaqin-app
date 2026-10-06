"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { loadTafsir, type Edition, type TafsirMeta, type TafsirVerse } from "@/features/quran/data";
import { S } from "@/lib/strings";

/** Shared look for the per-verse actions (listen, tafsir). */
export const VERSE_ACTION = "inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-brand-700 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700";

/** Keep the open verse when reading language changes; fetch only on expansion. `children` are the other verse actions, shown before the tafsir button. */
export function Tafsir({ verseKey, surah, ayah, edition, editions, open, onToggle, children }: { verseKey: string; surah: number; ayah: number; edition: Edition; editions?: Record<string, TafsirMeta>; open: boolean; onToggle: () => void; children?: ReactNode }) {
  const { t } = useI18n();
  const id = useId();
  return <div>
    {/* One quiet action row per verse; -ms-3 lines the first icon up with the text edge. */}
    <div className="-ms-3 flex flex-wrap items-center gap-1">
      {children}
      <button type="button" aria-expanded={open} aria-controls={id} aria-label={`${t(S.quran.tafsir)} ${verseKey}`} onClick={onToggle} className={`${VERSE_ACTION} ${open ? "bg-brand-50" : ""}`}>
        <BookOpen aria-hidden className="h-4 w-4" />{t(S.quran.tafsir)}<ChevronDown aria-hidden className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
    <div id={id} hidden={!open}>
      {open && <div className="mt-2 space-y-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-4 sm:p-5">
        {/* Only the reading language; the source is credited in the page footer. */}
        <Passage key={editions?.[edition.lang]?.key ?? edition.lang} meta={editions?.[edition.lang]} book={editions?.ar?.title} surah={surah} ayah={ayah} language={edition.name} />
      </div>}
    </div>
  </div>;
}

/** `book` is the title of the Arabic tafsir: a language that has a different book says which one. */
function Passage({ meta, book, surah, ayah, language }: { meta?: TafsirMeta; book?: string; surah: number; ayah: number; language: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<TafsirVerse[] | "error" | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!meta) return;
    let active = true;
    loadTafsir(meta.key, surah).then((rows) => { if (active) setData(rows); }, () => { if (active) setData("error"); });
    return () => { active = false; };
  }, [meta, surah, attempt]);
  if (!meta) return <p className="text-sm text-ink-soft">{t(S.quran.noTafsir)} <bdi>{language}</bdi>.</p>;
  const record = Array.isArray(data) ? data[ayah - 1] : null;
  const passages = record?.verse_key === `${surah}:${ayah}` ? record.passages.filter((p) => p.text.trim()) : [];
  return <section className="space-y-2">
    {meta.title !== book && <p className="text-xs font-medium text-brand-700">{meta.title}</p>}
    {data === null ? <p role="status" className="text-sm text-ink-soft">{t(S.common.loading)}</p>
      : data === "error" ? <div role="alert" className="text-sm text-ink-soft">{t(S.quran.tafsirError)} <button type="button" className="rounded px-1 font-medium text-brand-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700" onClick={() => { setData(null); setAttempt((n) => n + 1); }}>{t(S.quran.retry)}</button></div>
      : !passages.length ? <p className="text-sm text-ink-soft">{t(S.quran.noVerseTafsir)}</p>
      : passages.map((passage, i) => <div key={i} className="space-y-1">
        {passage.verse_range.length > 1 && <p className="text-xs font-medium text-brand-700">{t(S.quran.coversVerses)} <bdi>{passage.verse_range[0]}–{passage.verse_range.at(-1)}</bdi></p>}
        <p lang={meta.language} dir={meta.direction} className="whitespace-pre-wrap break-words text-base leading-8 text-ink-soft [overflow-wrap:anywhere]">{passage.text}</p>
      </div>)}
  </section>;
}
