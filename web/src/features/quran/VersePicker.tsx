"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const COLS = 6;
// Arabic-Indic digits typed on an Arabic keyboard count as numbers too.
const digits = (text: string) => text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/\D/g, "");

/** Verse dropdown in the SurahPicker look: type a number or pick one from the grid. `count` is 0 while the surah loads. */
export function VersePicker({ label, count, value, onChange }: { label: string; count: number; value: number; onChange: (verse: number) => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [active, setActive] = useState(1);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const move = (n: number) => setActive(Math.max(1, Math.min(count, n)));
  const close = () => { setOpen(false); button.current?.focus(); };

  return (
    // Static on phones, so the panel spans the whole (positioned) toolbar instead of this narrow column.
    <div className="min-w-0 sm:relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button
        ref={button}
        type="button"
        disabled={!count}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={value ? `${label} ${value}` : label}
        onClick={() => { setTyped(""); setActive(value || 1); setOpen((o) => !o); }}
        className="input flex h-full items-center justify-between gap-2 py-2 text-start text-sm disabled:opacity-60"
      >
        <span className={`truncate tabular-nums ${value ? "font-medium text-ink" : ""}`}>{/* Small screens keep the narrow column: number only. */}
          {value ? <><span className="max-sm:hidden">{label} </span>{value}</> : label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="rise absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-lift)] sm:start-auto sm:w-80">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              inputMode="numeric"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={`${listId}-${active}`}
              aria-label={label}
              placeholder={`${label} 1–${count}`}
              className="input py-2 text-sm"
              value={typed}
              onChange={(e) => { const n = digits(e.target.value); setTyped(n); if (n) move(Number(n)); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(active + (e.key === "ArrowDown" ? COLS : -COLS));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  close();
                  onChange(active);
                } else if (e.key === "Escape") {
                  close();
                }
              }}
            />
          </div>
          {/* Keeping focus in the number box while clicking a verse stops the panel closing first (Safari). */}
          <ul id={listId} role="listbox" aria-label={label} className="grid max-h-64 grid-cols-6 gap-1 overflow-y-auto p-2" onMouseDown={(e) => e.preventDefault()}>
            {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
              <li
                key={n}
                id={`${listId}-${n}`}
                role="option"
                aria-selected={n === value}
                ref={n === active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                onClick={() => { close(); onChange(n); }}
                className={`grid h-9 cursor-pointer place-items-center rounded-lg text-sm tabular-nums ${n === value ? "bg-brand-700 font-semibold text-white" : "text-ink-soft hover:bg-sky-50"} ${n === active ? "ring-2 ring-brand-300" : ""}`}
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
