"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import type { Bi, Course, Lang, QuizItem } from "@/lib/types";

const CHOICE_COUNTS = [2, 3, 4];

/** The course-level quiz, with one question open at a time like the pages. */
export function CourseActivities({ course, writing, disabled, change }: {
  course: Course; writing: Lang; disabled: boolean; change: (patch: Partial<Course>) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(0);
  const empty = (): Bi => ({ en: "", ar: "" });
  const id = () => crypto.randomUUID().slice(0, 8);
  const text = (label: string, value: Bi | undefined, update: (value: Bi) => void) => <label className="block">
    <span className="studio-field-label">{label}</span>
    <input className="input" dir={writing === "ar" ? "rtl" : "ltr"} value={value?.[writing] ?? ""}
      onChange={(event) => update({ ...empty(), ...value, [writing]: event.target.value })} />
  </label>;
  const quiz = course.quiz ?? [];
  const shown = Math.min(open, quiz.length - 1);
  const q = quiz[shown];
  const update = (patch: Partial<QuizItem>) => change({ quiz: quiz.map((item) => item.id === q.id ? { ...item, ...patch } : item) });

  /** Keeps what is written, adds empty choices, and asks before dropping a choice that has text. */
  function resize(count: number) {
    const dropped = q.options.slice(count);
    if (dropped.some((option) => option.en.trim() || option.ar.trim()) && !window.confirm(t(S.editor.dropChoices))) return;
    const options = [...q.options.slice(0, count), ...Array.from({ length: Math.max(0, count - q.options.length) }, empty)];
    update({ options, answer: q.answer < count ? q.answer : 0 });
  }

  return <div className="space-y-5">
    <nav className="editor-pages" aria-label={t(S.editor.questions)}>
      <button type="button" className="rich-tool" title={t(S.instructor.previousPage)} aria-label={t(S.instructor.previousPage)} disabled={shown <= 0} onClick={() => setOpen(shown - 1)}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
      {quiz.map((item, index) => <button key={item.id} type="button" className="editor-page"
        aria-current={index === shown ? "page" : undefined} aria-label={`${t(S.editor.question)} ${index + 1}`} onClick={() => setOpen(index)}>{index + 1}</button>)}
      <button type="button" className="rich-tool" title={t(S.instructor.nextPage)} aria-label={t(S.instructor.nextPage)} disabled={shown >= quiz.length - 1} onClick={() => setOpen(shown + 1)}><ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
      <span className="flex-1" />
      <button type="button" className="chip chip-add" disabled={disabled} onClick={() => {
        setOpen(quiz.length);
        change({ quiz: [...quiz, { id: id(), question: empty(), options: Array.from({ length: 4 }, empty), answer: 0 }] });
      }}><Plus className="h-3.5 w-3.5" aria-hidden />{t(S.editor.addQuestion)}</button>
    </nav>

    {q ? <fieldset key={q.id} disabled={disabled} className="card editor-section min-w-0">
      <header className="flex items-center justify-between gap-2">
        <span className="editor-section-tag">{t(S.editor.question)} {shown + 1} / {quiz.length}</span>
        <button type="button" className="rich-tool" title={t(S.editor.remove)} aria-label={t(S.editor.remove)} onClick={() => change({ quiz: quiz.filter((item) => item.id !== q.id) })}><Trash2 className="h-4 w-4" aria-hidden /></button>
      </header>
      {text(t(S.editor.question), q.question, (question) => update({ question }))}
      <div role="group" aria-label={t(S.editor.choices)} className="editor-pages">
        <span className="studio-field-label !mb-0 me-1">{t(S.editor.choices)}</span>
        {CHOICE_COUNTS.map((count) => <button key={count} type="button" className="editor-page" aria-pressed={q.options.length === count} onClick={() => resize(count)}>{count}</button>)}
      </div>
      {q.options.map((option, i) => <div key={i} className="flex items-end gap-2">
        <div className="min-w-0 flex-1">{text(`${t(S.editor.option)} ${i + 1}`, option, (value) => update({ options: q.options.map((o, n) => n === i ? value : o) }))}</div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={`answer-${q.id}`} checked={q.answer === i} onChange={() => update({ answer: i })} />{t(S.lesson.correct)}</label>
      </div>)}
      {text(t(S.editor.explanation), q.explanation, (explanation) => update({ explanation }))}
    </fieldset> : <p className="card p-6 text-center text-sm text-ink-soft">{t(S.editor.noQuestions)}</p>}
  </div>;
}
