"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, PenLine, Plus, Quote, Trash2, X } from "lucide-react";
import { SourceQuote } from "@/features/courses/content";
import { CardView } from "@/features/learning/CardView";
import { RichText } from "./RichText";
import { useContent } from "@/features/courses/ContentProvider";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import type { Card, Lang } from "@/lib/types";
import type { StaffLesson } from "@/features/studio/api";
import { cardHtml, empty, gaps, newSection, shortId, withLang } from "./model";
const E = S.editor;
export function CourseContent({ lesson, writing, locked, preview, page, setPage, tried, edit, change, changeCard, setPicker }: {
  lesson: StaffLesson; writing: Lang; locked: boolean; preview: boolean; page: number; setPage: (page: number) => void; tried: boolean;
  edit: (update: (current: StaffLesson) => StaffLesson) => void; change: (patch: Partial<StaffLesson>) => void;
  changeCard: (id: string, update: (card: Card) => Card) => void; setPicker: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  const { sources } = useContent();
  const [addingSource, setAddingSource] = useState<string | null>(null);
  const dir = writing === "ar" ? "rtl" : "ltr";
  const reference = (id: string) => sources[id] ? (lang === "ar" ? sources[id].ref_ar : sources[id].ref_en) : id;
  function addCard(next: Card) {
    setPage(lesson!.cards.length);
    edit((current) => ({ ...current, cards: [...current.cards, next] }));
  }

  // One page of the lesson is open at a time.
  const shown = Math.min(page, lesson.cards.length - 1);
  const card = lesson.cards[shown];
  const quote = card?.kind === "quote";
  const quoted = card?.sources?.[0];

  return <>
          {preview ? <header className="card p-5 sm:p-7">
            <p className="editor-section-tag">{t(E.previewNote)}</p>
            <h2 className="mt-2 font-serif text-3xl text-ink">{t(lesson.title)}</h2>
            <p className="mt-2 text-ink-soft">{t(lesson.summary)}</p>
          </header> : <fieldset disabled={locked} className="card min-w-0 space-y-4 p-5 sm:p-7">
            <label className="block">
              <span className="studio-field-label">{t(E.titlePlaceholder)}</span>
              <span className="editor-field"><input className="editor-title" dir={dir} maxLength={200} aria-label={t(E.titlePlaceholder)} placeholder={t(E.titlePlaceholder)}
                value={lesson.title[writing] ?? ""} onChange={(event) => change({ title: withLang(lesson.title, writing, event.target.value) })} /><PenLine className="h-4 w-4" aria-hidden /></span>
            </label>
            <label className="block">
              <span className="studio-field-label">{t(E.summary)}</span>
              <span className="editor-field"><textarea className="editor-summary" dir={dir} rows={2} maxLength={600} aria-label={t(E.summaryPlaceholder)} placeholder={t(E.summaryPlaceholder)}
                value={lesson.summary[writing] ?? ""} onChange={(event) => change({ summary: withLang(lesson.summary, writing, event.target.value) })} /><PenLine className="h-4 w-4" aria-hidden /></span>
            </label>
          </fieldset>}

          <nav className="editor-pages" aria-label={t(E.pages)}>
            <button type="button" className="rich-tool" title={t(S.instructor.previousPage)} aria-label={t(S.instructor.previousPage)} disabled={shown <= 0} onClick={() => setPage(shown - 1)}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
            {lesson.cards.map((item, index) => <button key={item.id} type="button" className={`editor-page ${tried && gaps(item).length ? "is-missing" : ""}`}
              aria-current={index === shown ? "page" : undefined} aria-label={`${t(E.section)} ${index + 1}`} onClick={() => setPage(index)}>{index + 1}</button>)}
            <button type="button" className="rich-tool" title={t(S.instructor.nextPage)} aria-label={t(S.instructor.nextPage)} disabled={shown >= lesson.cards.length - 1} onClick={() => setPage(shown + 1)}><ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
            <span className="flex-1" />
            {!preview && <button type="button" className="chip chip-add" disabled={locked} onClick={() => addCard(newSection())}><Plus className="h-3.5 w-3.5" aria-hidden />{t(E.addSection)}</button>}
            {!preview && <button type="button" className="chip chip-add" disabled={locked} onClick={() => {
              const next: Card = { id: shortId(), kind: "quote", title: empty(), sources: [] };
              addCard(next);
              setPicker(next.id);
            }}><Quote className="h-3.5 w-3.5" aria-hidden />{t(E.addQuote)}</button>}
          </nav>

          {/* The page as a learner sees it, with the changes that are not saved yet. */}
          {card && preview && <div className="card p-5 sm:p-7"><CardView key={card.id} lesson={lesson} card={quote ? card : { ...card, html: cardHtml(card) }} /></div>}
          {card && !preview && <fieldset key={card.id} disabled={locked} className="card editor-section min-w-0">
            <header className="flex items-center justify-between gap-2">
              <span className="editor-section-tag">{quote && <Quote className="h-3.5 w-3.5" aria-hidden />}{t(E.section)} {shown + 1} / {lesson.cards.length}{quote && ` · ${t(E.quote)}`}</span>
              <span className="flex gap-1">
                <button type="button" className="rich-tool" title={t(E.remove)} aria-label={t(E.remove)} onClick={() => edit((current) => ({ ...current, cards: current.cards.filter((item) => item.id !== card.id) }))}><Trash2 className="h-4 w-4" aria-hidden /></button>
              </span>
            </header>
            <label className="block">
              <span className="studio-field-label">{t(quote ? E.quoteTitle : E.sectionTitle)}</span>
              <span className="editor-field"><input className="editor-section-title" dir={dir} maxLength={200} aria-label={t(quote ? E.quoteTitle : E.sectionTitle)} placeholder={t(quote ? E.quoteTitle : E.sectionTitle)}
              value={card.title[writing] ?? ""} onChange={(event) => changeCard(card.id, (current) => ({ ...current, title: withLang(current.title, writing, event.target.value) }))} /><PenLine className="h-4 w-4" aria-hidden /></span>
            </label>
            {!quote && <RichText key={`${card.id}-${writing}`} dir={dir} readOnly={locked} label={`${t(E.section)} ${shown + 1}`} placeholder={t(E.sectionBody)}
              value={cardHtml(card)[writing]} onChange={(html) => changeCard(card.id, (current) => ({ ...current, html: { ...cardHtml(current), [writing]: html } }))} />}
            {quote && (quoted ? <div className="space-y-2">
              <SourceQuote id={quoted} />
              <button type="button" className="btn btn-ghost !min-h-9 !px-3 !py-1.5 text-xs" onClick={() => setPicker(card.id)}>{t(E.change)}</button>
            </div> : <button type="button" className="editor-quote-empty" onClick={() => setPicker(card.id)}>
              <BookOpen className="h-6 w-6 text-brand-600" aria-hidden />
              <span>{t(E.quoteEmpty)}</span>
              <span className="btn btn-primary !min-h-9 !py-1.5 text-sm">{t(E.chooseQuote)}</span>
            </button>)}
            <label className="block">
              <span className="studio-field-label">{t(quote ? E.quoteNote : E.takeaway)}</span>
              <input className="input" dir={dir} maxLength={400} aria-label={t(quote ? E.quoteNote : E.takeaway)} placeholder={t(quote ? E.quoteNote : E.takeaway)}
              value={card.takeaway?.[writing] ?? ""} onChange={(event) => changeCard(card.id, (current) => ({ ...current, takeaway: withLang(current.takeaway, writing, event.target.value) }))} />
            </label>
            {!quote && <div className="editor-chips editor-sources">
              <span className="studio-field-label !mb-0">{t(S.lesson.sources)}</span>
              {card.sources?.map((sourceId) => <span key={sourceId} className="chip">
                {reference(sourceId)}
                <button type="button" aria-label={`${t(E.remove)} ${reference(sourceId)}`}
                  onClick={() => changeCard(card.id, (current) => ({ ...current, sources: current.sources?.filter((item) => item !== sourceId) }))}><X className="h-3 w-3" aria-hidden /></button>
              </span>)}
              {card.references?.map((source) => <span key={source} className="chip max-w-full">
                <bdi className="min-w-0 break-words">{source}</bdi>
                <button type="button" aria-label={`${t(E.remove)} ${source}`}
                  onClick={() => changeCard(card.id, (current) => ({ ...current, references: current.references?.filter((item) => item !== source) }))}><X className="h-3 w-3" aria-hidden /></button>
              </span>)}
              {addingSource === card.id ? <form className="flex w-full flex-wrap items-center gap-2" onSubmit={(event) => {
                event.preventDefault();
                const source = new FormData(event.currentTarget).get("reference")?.toString().trim();
                if (!source) return;
                changeCard(card.id, (current) => current.references?.includes(source) ? current : { ...current, references: [...(current.references ?? []), source] });
                setAddingSource(null);
              }}>
                <input autoFocus required name="reference" className="input min-w-0 flex-1" dir="auto" maxLength={600}
                  aria-label={t(E.sourceReference)} placeholder={t(E.sourcePlaceholder)} />
                <button type="submit" className="chip chip-add"><Plus className="h-3.5 w-3.5" aria-hidden />{t(E.addSource)}</button>
                <button type="button" className="rich-tool" aria-label={t(S.curriculum.cancel)} onClick={() => setAddingSource(null)}><X className="h-4 w-4" aria-hidden /></button>
              </form> : <button type="button" className="chip chip-add" disabled={(card.references?.length ?? 0) >= 30} onClick={() => setAddingSource(card.id)}><Plus className="h-3.5 w-3.5" aria-hidden />{t(E.addSource)}</button>}
              {!card.sources?.length && !card.references?.length && <span className="text-xs text-muted">{t(E.sourceHint)}</span>}
            </div>}
          </fieldset>}
  </>;
}
