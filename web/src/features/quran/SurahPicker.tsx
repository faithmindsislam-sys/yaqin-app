"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { few, fold, type Surah } from "@/features/quran/data";
import { S } from "@/lib/strings";

// Letters, digits and spaces only, so "al fatiha" finds "Al-Fātiḥah" and "anam" finds "Al-An‘ām".
const clean = (text: string) => fold(text).replace(/[^\p{L}\p{N} ]/gu, "");

/** Searchable surah dropdown: filter by number or by Arabic, transliterated or selected translation name. */
export function SurahPicker({ surahs, value, onChange, lang }: { lang: string; surahs: Surah[]; value: number; onChange: (surah: number) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const keyed = useMemo(() => surahs.map((s) => ({ s, key: clean(`${s.number} ${s.name_latin ?? ""} ${s.names[lang] ?? ""} ${s.name_ar ?? ""}`) })), [surahs, lang]);
  const q = clean(filter.trim());
  const list = q ? keyed.filter(({ key }) => key.includes(q)) : keyed;
  const current = surahs[value - 1];
  const title = (s: Surah | undefined, n: number) => s?.name_latin ?? `${t(S.quran.surah)} ${n}`;

  const choose = (surah: number) => {
    setOpen(false);
    button.current?.focus();
    onChange(surah);
  };

  return (
    // Static on phones, so the panel spans the whole (positioned) toolbar instead of this narrow column.
    <div className="min-w-0 sm:relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t(S.quran.surah)}: ${title(current, value)}`}
        onClick={() => { setFilter(""); setActive(value - 1); setOpen((o) => !o); }}
        className="input flex items-center gap-3 py-2 text-start text-sm"
      >
        <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-lg bg-brand-50 px-1 text-xs font-semibold tabular-nums text-brand-700">{value}</span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-ink">{title(current, value)}</span>
          {current?.names[lang] && <span className="text-muted"> · {current.names[lang]}</span>}
        </span>
        {current?.name_ar && <span lang="ar" className="hidden font-quran text-base text-ink-soft sm:inline">{current.name_ar}</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="rise absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-lift)] sm:min-w-[24rem]">
          <div className="relative border-b border-line p-2">
            <Search className="pointer-events-none absolute start-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              dir="auto"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={list[active] ? `${listId}-${list[active].s.number}` : undefined}
              aria-label={t(S.quran.findSurah)}
              placeholder={t(S.quran.findSurah)}
              className="input py-2 ps-9 text-sm"
              value={filter}
              onChange={(e) => { setFilter(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(0, Math.min(list.length - 1, a + (e.key === "ArrowDown" ? 1 : -1))));
                } else if (e.key === "Enter" && list[active]) {
                  e.preventDefault();
                  choose(list[active].s.number);
                } else if (e.key === "Escape") {
                  setOpen(false);
                  button.current?.focus();
                }
              }}
            />
          </div>
          {/* Keeping focus in the filter while clicking an option stops the panel closing first (Safari). */}
          <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto p-1.5" onMouseDown={(e) => e.preventDefault()}>
            {list.map(({ s }, i) => (
              <li
                key={s.number}
                id={`${listId}-${s.number}`}
                role="option"
                aria-selected={s.number === value}
                ref={i === active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                onClick={() => choose(s.number)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 ${i === active ? "bg-brand-50" : "hover:bg-sky-50"}`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular-nums ${s.number === value ? "bg-brand-700 text-white" : "bg-sky-100 text-brand-700"}`}>{s.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{title(s, s.number)}</span>
                  <span className="block truncate text-xs text-muted">{s.names[lang] && `${s.names[lang]} · `}{s.ayahs} {t(few(s.ayahs) ? S.quran.versesFew : S.quran.verses)}</span>
                </span>
                {s.name_ar && <span lang="ar" className="font-quran text-lg text-ink">{s.name_ar}</span>}
                <Check className={`h-4 w-4 shrink-0 text-brand-600 ${s.number === value ? "" : "invisible"}`} />
              </li>
            ))}
            {!list.length && <li className="px-3 py-6 text-center text-sm text-muted">{t(S.quran.noSurah)}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
