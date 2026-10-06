"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import type { Lesson } from "@/lib/types";

// The page owns the question index: its header shows "Question 1 of 3", apart from the page count.
export function Quiz({ lesson, index: i, onIndex, onFinish, onBack }: { lesson: Lesson; index: number; onIndex: (i: number) => void; onFinish: (score: number) => void; onBack: () => void }) {
  const { t } = useI18n();
  const items = lesson.quiz ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const q = items[i];
  if (!q) return null;

  const answered = picked !== null;
  const right = picked === q.answer;

  function next() {
    const score = correct + (right ? 1 : 0);
    if (i + 1 < items.length) {
      setCorrect(score);
      onIndex(i + 1);
      setPicked(null);
    } else {
      onFinish(score / items.length);
    }
  }

  return (
    <section className="rise" key={q.id}>
      <p className="eyebrow">{t(S.lesson.quizTitle)}</p>
      <h2 className="mt-3 font-serif text-3xl text-ink">{t(q.question)}</h2>
      <div className="mt-6 space-y-2.5">
        {q.options.map((opt, idx) => {
          const state = !answered ? "idle" : idx === q.answer ? "right" : idx === picked ? "wrong" : "idle";
          return (
            <button
              key={idx}
              disabled={answered}
              onClick={() => setPicked(idx)}
              className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-start transition ${
                state === "right" ? "border-brand-400 bg-brand-50 font-medium" : state === "wrong" ? "border-rose/50 bg-rose/5" : "border-line bg-white hover:border-brand-300"
              }`}
            >
              <span>{t(opt)}</span>
              {state === "right" && <Check className="h-5 w-5 text-brand-600" />}
              {state === "wrong" && <X className="h-5 w-5 text-rose" />}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="mt-5 space-y-3">
          <p className={`font-semibold ${right ? "text-brand-700" : "text-rose"}`}>{t(right ? S.lesson.correct : S.lesson.notQuite)}</p>
          {q.explanation && <p className="text-ink-soft">{t(q.explanation)}</p>}
        </div>
      )}
      {/* Same footer row as the pages: back at the start, continue at the end. */}
      <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
        <button className="btn btn-ghost" onClick={onBack}>
          <span aria-hidden className="rtl:rotate-180">←</span> {t(S.lesson.backToPages)}
        </button>
        {answered && (
          <button className="btn btn-primary" onClick={next}>
            {t(S.lesson.continue)} <span aria-hidden className="rtl:rotate-180">→</span>
          </button>
        )}
      </div>
    </section>
  );
}
