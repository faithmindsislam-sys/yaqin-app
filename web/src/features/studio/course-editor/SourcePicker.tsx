"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { quranSource } from "@/features/studio/api";
import { useContent } from "@/features/courses/ContentProvider";
import { useI18n } from "@/lib/i18n";
import { ARABIC, EDITIONS, fold, loadIndex, loadSearch, type SearchData, type Surah } from "@/features/quran/data";
import { S } from "@/lib/strings";
import type { Source } from "@/lib/types";

const LIMIT = 40;
const FATIHA = [0, 1, 2, 3, 4, 5, 6]; // shown before anything is typed

/** Modal list of Quran verses. Revealed text is always picked here, never typed. */
export function SourcePicker({ exclude, onPick, onClose }: {
  exclude: string[]; onPick: (id: string, source?: Source) => void; onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const { refresh } = useContent();
  const dialog = useRef<HTMLDialogElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  // The reader's search text: every verse in order, and the surah and ayah of each position.
  const [quran, setQuran] = useState<{ surahs: Surah[]; where: [number, number][]; data: SearchData } | "error" | null>(null);
  const [adding, setAdding] = useState(false);
  const [failed, setFailed] = useState(false);
  // A modal focuses its first control (Close); typing should search straight away.
  useEffect(() => { dialog.current?.showModal(); searchBox.current?.focus(); }, []);
  useEffect(() => {
    let open = true;
    Promise.all([loadIndex(), loadSearch(EDITIONS[0].key, ARABIC)]).then(([index, data]) => {
      if (open) setQuran({ surahs: index.surahs, data, where: index.surahs.flatMap((s) => Array.from({ length: s.ayahs }, (_, i): [number, number] => [s.number, i + 1])) });
    }, () => { if (open) setQuran("error"); });
    return () => { open = false; };
  }, []);

  // Verses found by number ("6:20", "6 20") or by words, in English or Arabic.
  const verses = useMemo(() => {
    if (!quran || quran === "error") return [];
    const q = query.trim().replace(/\s+/g, " ");
    let hits: number[] = [];
    const ref = /^(\d{1,3})\s*[:.\s]\s*(\d{1,3})$/.exec(q);
    if (!q) hits = FATIHA;
    else if (ref) hits = [quran.where.findIndex(([s, a]) => s === Number(ref[1]) && a === Number(ref[2]))];
    else if (q.length >= 2) {
      const en = fold(q), ar = fold(q, true);
      // ponytail: scans all 6236 verses on each keystroke and keeps the first ones; fine at this size.
      for (let i = 0; i < quran.where.length && hits.length <= LIMIT; i++) {
        if (quran.data.translationKey[i].includes(en) || quran.data.arKey?.[i].includes(ar)) hits.push(i);
      }
    }
    return hits.filter((i) => i >= 0 && !exclude.includes(`quran:${quran.where[i].join(":")}`));
  }, [quran, query, exclude]);

  // The API puts the verse in the source library (word for word, or the entry already there) before it is cited.
  async function addVerse(surah: number, ayah: number) {
    setAdding(true); setFailed(false);
    try {
      const source = await quranSource(surah, ayah);
      await refresh();
      onPick(source.id, source);
      onClose();
    } catch { setFailed(true); setAdding(false); }
  }

  return (
    <dialog ref={dialog} className="card studio-dialog source-picker" aria-labelledby="source-picker-title" onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <header className="flex items-center justify-between gap-3 border-b border-line p-5">
        <h2 id="source-picker-title" className="font-serif text-2xl">{t(S.editor.pickerTitle)}</h2>
        <button type="button" className="btn btn-ghost btn-close !p-2" aria-label={t(S.instructor.closeModal)} onClick={onClose}><X className="h-5 w-5" aria-hidden /></button>
      </header>
      <div className="space-y-3 p-5">
        <label className="studio-search relative block">
          <Search className="studio-search-icon h-4 w-4 text-muted" aria-hidden />
          <input ref={searchBox} type="search" className="input" aria-label={t(S.editor.pickerSearch)} placeholder={t(S.editor.pickerSearch)}
            value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <ul className="source-picker-list">
          {quran && quran !== "error" && verses.slice(0, LIMIT).map((i) => {
            const [surah, ayah] = quran.where[i];
            return <li key={i}>
              <button type="button" className="source-picker-item" disabled={adding} onClick={() => void addVerse(surah, ayah)}>
                <span className="text-sm font-semibold text-brand-800">{lang === "ar" ? quran.surahs[surah - 1].name_ar : quran.surahs[surah - 1].name_latin} {surah}:{ayah}</span>
                {quran.data.ar && <span dir="rtl" lang="ar" className="mt-1 line-clamp-2 text-sm text-ink">{quran.data.ar[i]}</span>}
                <span dir="ltr" className="mt-1 line-clamp-2 text-xs text-ink-soft">{quran.data.translation[i]}</span>
              </button>
            </li>;
          })}
        </ul>
        {failed && <p role="alert" className="editor-notice is-error">{t(S.editor.pickerAddError)}</p>}
        {!quran && <p role="status" className="py-6 text-center text-sm text-muted">{t(S.common.loading)}</p>}
        {quran === "error" && <p role="alert" className="editor-notice is-error">{t(S.editor.pickerLoadError)}</p>}
        {quran && quran !== "error" && !verses.length && <p className="py-6 text-center text-sm text-muted">{t(S.editor.pickerEmpty)}</p>}
        {verses.length > LIMIT && <p className="text-center text-xs text-muted">{t(S.editor.pickerMore)}</p>}
      </div>
    </dialog>
  );
}
