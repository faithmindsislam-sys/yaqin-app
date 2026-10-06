"use client";

import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { EDITIONS, type Edition } from "@/features/quran/data";

const translator = (e: Edition) => e.label.split(" — ")[1];

/** Translation dropdown in the SurahPicker look. Focus stays on the button; arrows move, Enter or Space chooses.
 *  `available` is null until the index has loaded; editions missing from it cannot be chosen. */
export function EditionPicker({ label, value, available, onChange }: { label: string; value: Edition; available: Record<string, unknown> | null; onChange: (code: Edition["code"]) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const off = (e: Edition) => !!available && !available[e.key];
  const show = () => { setActive(EDITIONS.indexOf(value)); setOpen(true); };
  const choose = (e: Edition) => {
    if (off(e)) return;
    setOpen(false);
    if (e.code !== value.code) onChange(e.code);
  };

  return (
    <div className="relative mt-1">
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${EDITIONS[active].code}` : undefined}
        aria-label={`${label}: ${value.label}`}
        onClick={() => open ? setOpen(false) : show()}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) show();
            else setActive((a) => Math.max(0, Math.min(EDITIONS.length - 1, a + (e.key === "ArrowDown" ? 1 : -1))));
          } else if (open && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            choose(EDITIONS[active]);
          } else if (open && e.key === "Escape") {
            setOpen(false);
          }
        }}
        // Firefox clicks a button on Space key-up, which would reopen the list.
        onKeyUp={(e) => { if (e.key === " ") e.preventDefault(); }}
        className="input flex items-center gap-3 py-2 text-start text-sm"
      >
        <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-lg bg-brand-50 px-1 text-xs font-semibold uppercase text-brand-700">{value.code}</span>
        <span className="min-w-0 flex-1 truncate">
          <bdi lang={value.lang} className="font-medium text-ink">{value.name}</bdi>
          <span className="text-muted"> · {translator(value)}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        // Keeping focus on the button while clicking an option stops the list closing first.
        <ul id={listId} role="listbox" aria-label={label} onMouseDown={(e) => e.preventDefault()} className="rise absolute inset-x-0 top-full z-30 mt-2 max-h-[26rem] overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-[var(--shadow-lift)]">
          {EDITIONS.map((e, i) => (
            <li
              key={e.code}
              id={`${listId}-${e.code}`}
              role="option"
              aria-selected={e.code === value.code}
              aria-disabled={off(e) || undefined}
              ref={i === active ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(e)}
              className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${off(e) ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${i === active ? "bg-brand-50" : ""}`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-semibold uppercase ${e.code === value.code ? "bg-brand-700 text-white" : "bg-sky-100 text-brand-700"}`}>{e.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink"><bdi lang={e.lang}>{e.name}</bdi></span>
                <span className="block truncate text-xs text-muted">{translator(e)}</span>
              </span>
              <Check className={`h-4 w-4 shrink-0 text-brand-600 ${e.code === value.code ? "" : "invisible"}`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
