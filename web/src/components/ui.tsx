"use client";

import Link from "@/components/RouteLink";
import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Account avatar: the first letter of the saved display name. */
export function Avatar({ name, className = "h-9 w-9 text-sm" }: { name?: string | null; className?: string }) {
  const initial = (Array.from((name ?? "").trim())[0] ?? "?").toUpperCase();
  return <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700 ${className}`}>{initial}</span>;
}

export function LangToggle({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={`inline-flex items-center rounded-full border border-line bg-white p-0.5 text-sm ${className}`}>
      <Languages className={`${compact ? "hidden" : "mx-1.5"} h-4 w-4 text-muted`} aria-hidden />
      {(["en", "ar"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          aria-label={l === "en" ? "EN" : "العربية"}
          className={`rounded-full ${compact ? "px-2 text-xs" : "px-2.5"} py-1 transition ${lang === l ? "bg-brand-50 font-semibold text-brand-700" : "text-muted"}`}
        >
          {l === "en" ? "EN" : compact ? "ع" : "العربية"}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, sub, action, children, className = "" }: {
  title: string;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 sm:p-7 ${className}`}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-ink sm:text-[1.7rem]">{title}</h2>
          {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ArrowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
      {children}
      <span aria-hidden className="rtl:rotate-180">→</span>
    </Link>
  );
}
