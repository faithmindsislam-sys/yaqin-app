"use client";

import Link from "@/components/RouteLink";
import { ArrowRight, Check } from "lucide-react";
import { ArrowLink } from "@/components/ui";
import { ComparisonView, Refs, Side } from "@/features/compare/ComparisonView";
import { compareHref, useCompare, type BeliefPath, type CompareNode } from "@/features/compare/model";
import { useContent } from "@/features/courses/ContentProvider";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";

/**
 * The page of one belief (or tradition): a list of everything to read on one side, and the chosen item on the other.
 * The list has the six steps of the guided path, when the belief has one, and then its topics in detail. A step is one small card:
 * the question, both views side by side and one Quran verse. A topic is its full comparison. "Next" walks through the whole list.
 * In the steps, the ones before the entry step are ticked (common ground) and the entry step is the first difference.
 */
export function GuidedPath({ holder, guide, step, topic }: { holder: CompareNode; guide?: Required<BeliefPath>; step: number; topic?: CompareNode }) {
  const { t, lang } = useI18n();
  const c = useCompare();
  const { getLesson } = useContent();
  const P = S.compare.path;
  const topics = c.children(holder.id, "topic");
  const at = topic ? topics.indexOf(topic) : -1;
  // After the last step come the topics, in order.
  const next = step ? (step < c.steps.length ? compareHref(holder.id, step + 1) : topics[0] && compareHref(topics[0].id)) : topics[at + 1] && compareHref(topics[at + 1].id);
  // Arabic digits in Arabic, like the verse numbers in the text beside them.
  const num = (n: number) => n.toLocaleString(lang === "ar" ? "ar-EG" : "en");
  const note = (n: number) => (!guide ? "" : n < guide.entry ? t(P.agreed) : n === guide.entry ? t(P.firstDifference) : "");
  const view = guide?.views[step - 1];
  // Lessons come with the content: one that is not published yet is simply not offered.
  const lesson = getLesson(c.steps[step - 1]?.lesson);

  const onward = (
    <div className="flex flex-wrap gap-2">
      {next && <Link href={next} className="btn btn-primary">{t(P.next)} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></Link>}
      {/* ponytail: plain link, /ask has no prefilled question. Pass the step question when it gets one. */}
      <Link href="/ask/" className="btn btn-ghost">{t(P.question)}</Link>
    </div>
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[18rem_1fr] xl:items-start">
      {/* Below `xl` the steps are numbered dots in one row and the topics a row of pills; from `xl` up, beside the content, both are full lists. */}
      <nav aria-label={t(P.steps)} className="card min-w-0 space-y-1 p-2 xl:sticky xl:top-24">
        {guide && (
          <>
            <p className="eyebrow px-3 pt-2">{t(P.stepsTitle)}</p>
            <ol className="flex gap-1 xl:flex-col">
              {c.steps.map((s, i) => {
                const n = i + 1;
                const dot = n < guide.entry ? "bg-brand-600 text-white" : n === step ? "border-2 border-brand-500 text-brand-700" : "border border-line text-muted";
                return (
                  <li key={n} className="flex-1 xl:flex-none">
                    <Link
                      href={compareHref(holder.id, n)}
                      aria-current={n === step ? "step" : undefined}
                      className={`flex min-h-11 items-center justify-center gap-3 rounded-xl p-2 transition xl:justify-start xl:px-3 xl:py-2.5 ${n === step ? "bg-brand-50" : "hover:bg-sky-50"}`}
                    >
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${dot}`}>
                        {n < guide.entry ? <Check className="h-4 w-4" aria-hidden /> : num(n)}
                      </span>
                      <span className="sr-only xl:not-sr-only xl:min-w-0 xl:flex-1">
                        <span className="block text-sm font-medium text-ink">{t(s.question)}</span>
                        {note(n) && <span className={`block text-xs ${n === guide.entry ? "text-salmon-700" : "text-muted"}`}>{note(n)}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </>
        )}
        <p className="eyebrow px-3 pt-2">{t(P.topicsTitle)}</p>
        <ul className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1 xl:mx-0 xl:flex-col xl:gap-0 xl:overflow-visible xl:px-0 xl:pb-0">
          {topics.map((s) => (
            <li key={s.id} className="shrink-0 xl:shrink">
              <Link
                href={compareHref(s.id)}
                aria-current={s === topic ? "page" : undefined}
                className={`flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm transition xl:whitespace-normal xl:rounded-xl xl:border-0 xl:px-3 xl:py-2.5 xl:font-medium ${s === topic ? "border-brand-500 bg-brand-500 text-white xl:bg-brand-50 xl:text-brand-700" : "border-line bg-white text-ink-soft hover:border-brand-300 xl:text-ink xl:hover:bg-sky-50"}`}
              >
                {t(s.title)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {view ? (
        <section key={step} className="card rise min-w-0 space-y-5 p-5 sm:p-7">
          <div>
            <p className="eyebrow">{t(P.step)} {num(step)} {t(P.of)} {num(c.steps.length)}</p>
            <h2 className="mt-1 font-serif text-2xl text-ink sm:text-[1.7rem]">{t(c.steps[step - 1].question)}</h2>
            {note(step) && (
              <span className={`chip mt-3 ${step === guide?.entry ? "!border-salmon-200 !text-salmon-700" : ""}`}>
                {step < (guide?.entry ?? 0) && <Check className="h-3.5 w-3.5" aria-hidden />}
                {note(step)}
              </span>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Side label={t(holder.title)}><p className="leading-relaxed text-ink-soft">{t(view.belief)}</p></Side>
            <Side islam label={t(S.compare.islamic)}><p className="leading-relaxed text-ink-soft">{t(view.islam)}</p></Side>
          </div>
          <Refs items={[view.verse]} />
          {lesson && <p className="text-sm text-ink-soft">{t(P.lesson)} <ArrowLink href={`/course/?id=${lesson.id}`}>{t(lesson.title)}</ArrowLink></p>}
          <div className="border-t border-line pt-5">{onward}</div>
        </section>
      ) : topic && (
        <div key={topic.id} className="rise min-w-0 space-y-5">
          <div className="px-1">
            <p className="eyebrow">{t(P.topic)} {num(at + 1)} {t(P.of)} {num(topics.length)}</p>
            <h2 className="mt-1 font-serif text-2xl text-ink sm:text-[1.7rem]">{t(topic.title)}</h2>
          </div>
          <ComparisonView belief={t(holder.title)} comparison={c.comparison(topic.id)} />
          {onward}
        </div>
      )}
    </div>
  );
}
