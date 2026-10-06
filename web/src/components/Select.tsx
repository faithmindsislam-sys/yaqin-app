"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown } from "lucide-react";

// Same focus-on-trigger pattern as the Quran edition picker.
// `compact` is the toolbar look: the button always shows the label, and each choice can preview its own style.
export function Select({ label, value, options, onChange, name, compact = false, disabled = false, placeholder }: {
  label: string; value: string; options: { value: string; label: string; className?: string; style?: CSSProperties }[];
  onChange: (value: string) => void; name?: string; compact?: boolean; disabled?: boolean; placeholder?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const found = options.findIndex((option) => option.value === value);
  const selected = Math.max(0, found);
  const empty = found < 0 && !!placeholder;
  const show = () => { setActive(selected); setOpen(true); };
  const choose = (index: number) => { onChange(options[index].value); setOpen(false); };

  return <div className={`studio-select ${compact ? "is-compact" : ""}`}>
    <span id={`${id}-label`} className={compact ? "sr-only" : "studio-field-label"}>{label}</span>
    {name && <input type="hidden" name={name} value={value} />}
    <button type="button" role="combobox" disabled={disabled} aria-labelledby={compact ? `${id}-label` : `${id}-label ${id}-value`}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`}
      aria-activedescendant={open ? `${id}-${active}` : undefined}
      className={`${compact ? "" : "input"} studio-select-trigger`} onClick={() => open ? setOpen(false) : show()}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        let next = active;
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          if (!open) { show(); return; }
          next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
            : Math.max(0, Math.min(options.length - 1, active + (event.key === "ArrowDown" ? 1 : -1)));
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (open) choose(active); else show();
          return;
        } else if (event.key === "Escape") {
          if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          return;
        } else if (event.key.length === 1 && open) {
          const match = options.findIndex((option, i) => i > active && option.label.toLowerCase().startsWith(event.key.toLowerCase()));
          next = match >= 0 ? match : options.findIndex((option) => option.label.toLowerCase().startsWith(event.key.toLowerCase()));
          if (next < 0) return;
        } else return;
        setActive(next);
        list.current?.children[next]?.scrollIntoView({ block: "nearest" });
      }} onKeyUp={(event) => { if (event.key === " ") event.preventDefault(); }}>
      <span id={`${id}-value`} className={`min-w-0 flex-1 truncate ${empty ? "text-muted" : ""}`}>{compact ? label : empty ? placeholder : options[selected]?.label}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-muted ${open ? "rotate-180" : ""}`} aria-hidden />
    </button>
    {open && <ul ref={list} id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`}
      className="studio-select-menu" onMouseDown={(event) => event.preventDefault()}>
      {options.map((option, index) => <li key={option.value} id={`${id}-${index}`} role="option"
        aria-selected={option.value === value} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}
        className={`studio-select-option ${active === index ? "is-active" : ""}`}>
        <span className={`min-w-0 flex-1 ${option.className ?? ""}`} style={option.style}>{option.label}</span>
        {!compact && <Check className={`h-4 w-4 shrink-0 text-brand-700 ${option.value === value ? "" : "invisible"}`} aria-hidden />}
      </li>)}
    </ul>}
  </div>;
}
