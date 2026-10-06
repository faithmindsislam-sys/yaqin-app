"use client";

import { BookMarked, BookOpen, ScrollText } from "lucide-react";
import { useContent } from "./ContentProvider";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import type { Card, Source } from "@/lib/types";
import { scriptureEnglishStatus } from "@/lib/source-translation";

const SOURCE_ICONS: Partial<Record<Source["kind"], typeof BookOpen>> = { quran: BookOpen, hadith: ScrollText };

/** A short reference, with the exact evidence available on demand. */
export function SourceReference({ id, source }: { id: string; source: Source }) {
  const { t, lang } = useI18n();
  const Icon = SOURCE_ICONS[source.kind] ?? BookMarked;
  const reference = (lang === "ar" ? source.ref_ar || source.ref_en : source.ref_en || source.ref_ar);
  // Older saved library answers may only carry a publisher filename or hash.
  const label = source.kind === "library" && /^(?:publisher[- ]|[a-f0-9]{32,64}(?:\b|,))/.test(reference)
    ? t(S.lesson.fromLibrary) : reference;
  return <details className="rounded-xl border border-line px-3 py-2 text-xs">
    <summary className="cursor-pointer text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600">
      <span className="break-words"><Icon className="me-1.5 inline-block h-3.5 w-3.5 align-text-bottom" aria-hidden />
        {source.kind === "quran" && !/^(?:Qur[’']?an|القرآن)/i.test(label) && <span>{t(S.trust.quran)} ·</span>}
        <bdi>{label}</bdi>
        {source.review_status !== "approved" && <span className="text-muted"> · {t(S.lesson.pendingReview)}</span>}
      </span>
    </summary>
    <div className="pt-3"><SourceQuote id={id} source={source} compact /></div>
  </details>;
}

/** Original evidence; scripture and library commentary retain distinct labels. */
export function SourceQuote({ id, source, compact = false }: { id: string; source?: Source; compact?: boolean }) {
  const { sources: allSources } = useContent();
  const { t, lang } = useI18n();
  const s = source ?? allSources[id];
  if (!s) return null;
  const isScripture = s.kind === "quran" || s.kind === "hadith";
  const englishPublished = !isScripture || scriptureEnglishStatus(s) === "published";
  const showEnglish = (lang === "en" || !s.text_ar) && !!s.text_en && englishPublished;
  const translationLabel = isScripture && showEnglish ? s.translation : null;
  const Icon = SOURCE_ICONS[s.kind] ?? BookMarked;
  return (
    <figure className={`source-quote ${compact ? "is-compact" : ""}`}>
      <div className="source-quote-head">
        <span className="source-quote-icon"><Icon className="h-4 w-4" aria-hidden /></span>
        <span className="source-quote-ref">{lang === "ar" ? s.ref_ar : s.ref_en}</span>
        {isScripture && <span className="chip !py-0 !text-[0.7rem]">{t(S.lesson.revealed)}</span>}
        {s.kind === "library" && <span className="chip !py-0 !text-[0.7rem]">{t(S.lesson.fromLibrary)}</span>}
      </div>
      {s.text_ar && (
        <blockquote
          className={`${s.kind === "quran" ? "quran" : "font-sans"} text-ink ${compact ? "text-lg" : "text-xl sm:text-2xl"}`}
          dir="rtl"
          lang="ar"
        >
          {s.kind === "quran" ? `﴿${s.text_ar}﴾` : s.text_ar}
        </blockquote>
      )}
      {showEnglish && (
        <p className={`mt-2 text-ink-soft ${compact ? "text-sm" : "text-base"}`} dir="ltr" lang="en">
          “{s.text_en}”
        </p>
      )}
      {isScripture && lang === "en" && !englishPublished && <p className="mt-2 text-sm text-muted">{t(S.lesson.translationUnavailable)}</p>}
      {(translationLabel || s.grading || (s.review_status === "pending" || s.review_status === "unreviewed") || s.url) && (
        <figcaption className="mt-3 flex flex-wrap items-center gap-2 border-t border-brand-100 pt-2.5 text-xs text-muted">
          {translationLabel && <span dir="ltr" lang="en">{translationLabel}</span>}
          {s.grading && <span>{s.grading}</span>}
          {(s.review_status === "pending" || s.review_status === "unreviewed") && <span className="text-[0.7rem] opacity-80">{s.grading && "· "}{t(S.lesson.pendingReview)}</span>}
          {s.url && (
            <a href={s.url} target="_blank" rel="noreferrer" className="ms-auto underline decoration-dotted underline-offset-2 hover:text-brand-700">
              {s.origin ?? "link"}
            </a>
          )}
        </figcaption>
      )}
    </figure>
  );
}

/** A section's text: formatted when it was written in the Studio editor, plain otherwise. */
export function CardBody({ card, className = "" }: { card: Card; className?: string }) {
  const { t } = useI18n();
  // The API cleans this HTML when the lesson is saved (api/app/richtext.py).
  return card.html
    ? <div className={`rich ${className}`} dangerouslySetInnerHTML={{ __html: t(card.html) }} />
    : <p className={`whitespace-pre-line ${className}`}>{t(card.body)}</p>;
}
