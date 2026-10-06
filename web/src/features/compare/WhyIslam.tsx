"use client";

import Link from "@/components/RouteLink";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, Compass, HeartHandshake, Lightbulb } from "lucide-react";
import { Refs } from "./ComparisonView";
import { FAITH_STAGES, WHY, faithHref, type FaithStage } from "./why-islam-data";
import { useI18n } from "@/lib/i18n";

export function WhyIslam() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const found = FAITH_STAGES.findIndex((s) => s.id === params.get("stage"));
  const at = found < 0 ? 0 : found;
  const stage = FAITH_STAGES[at];
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(stage.id);
  useEffect(() => {
    if (previous.current === stage.id) return;
    previous.current = stage.id;
    heading.current?.focus();
  }, [stage.id]);
  const num = (n: number) => n.toLocaleString(lang === "ar" ? "ar-EG" : "en");

  return <div className="faith-journey space-y-5">
    <nav aria-label={t(WHY.path)} className="faith-path">
      <ol>{FAITH_STAGES.map((s, i) => <li key={s.id}>
        <Link href={faithHref(s.id)} scroll={false} className="faith-stop" aria-current={i === at ? "step" : undefined}>
          <span className="faith-stop-number" aria-hidden>{num(i + 1)}</span>
          <span>{t(s.title)}</span>
        </Link>
      </li>)}</ol>
    </nav>

    <section className="faith-question" aria-labelledby="faith-question-title">
      <div className="mb-4">
        <p className="eyebrow">{t(WHY.step)} {num(at + 1)} {t(WHY.of)} {num(FAITH_STAGES.length)}</p>
        <h2 id="faith-question-title" ref={heading} tabIndex={-1} className="mt-2 scroll-mt-36 font-serif text-2xl leading-tight text-ink outline-none sm:text-3xl">{t(stage.question)}</h2>
      </div>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-ink-soft sm:text-base">{t(stage.intro)}</p>
      <EvidenceStage key={stage.id} stage={stage} />
    </section>

    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
      {at > 0 && <Link href={faithHref(FAITH_STAGES[at - 1].id)} scroll={false} className="btn btn-ghost"><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{t(WHY.back)}</Link>}
      {at < FAITH_STAGES.length - 1 && <Link href={faithHref(FAITH_STAGES[at + 1].id)} scroll={false} className="btn btn-primary ms-auto">{t(WHY.next)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></Link>}
    </div>

    {at === FAITH_STAGES.length - 1 && <section className="faith-next">
      <HeartHandshake className="mb-3 h-8 w-8 text-brand-700" aria-hidden />
      <h2 className="font-serif text-2xl text-ink">{t(WHY.endTitle)}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{t(WHY.endBody)}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/shahada/" className="btn btn-primary">{t(WHY.embrace)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></Link>
        <Link href="/quran/?s=1&v=1" className="btn btn-ghost">{t(WHY.read)}</Link>
      </div>
    </section>}

    <details className="faith-method">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Compass className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />{t(WHY.method)}<ChevronDown className="ms-auto h-4 w-4 shrink-0" aria-hidden /></summary>
      <div className="mt-4 space-y-4"><p className="text-sm leading-relaxed text-ink-soft">{t(WHY.methodBody)}</p><Refs items={WHY.methodSources} /></div>
    </details>
  </div>;
}

function EvidenceStage({ stage }: { stage: FaithStage }) {
  const { t, lang } = useI18n();
  const [selected, setSelected] = useState(0);
  const evidence = stage.evidence[selected];
  return <>
    <div className="faith-evidence-grid">
      <div>
        <h3 className="eyebrow mb-3">{t(WHY.examine)}</h3>
        <div className="space-y-2">{stage.evidence.map((item, i) => <button key={item.title.en} type="button" aria-pressed={selected === i} aria-controls="faith-evidence-detail" onClick={() => setSelected(i)} className="faith-evidence-choice">
          <span className="faith-evidence-index" aria-hidden>{(i + 1).toLocaleString(lang === "ar" ? "ar-EG" : "en")}</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t(item.title)}</span><span className="mt-1 block text-xs text-muted">{t(item.kind)}</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden />
        </button>)}</div>
      </div>
      <article id="faith-evidence-detail" className="faith-evidence-detail" aria-live="polite" aria-atomic="true">
        <div key={selected} className="rise">
          <p className="faith-evidence-kind"><BookOpen className="h-3.5 w-3.5" aria-hidden />{t(evidence.kind)}</p>
          <h3 className="mt-3 font-serif text-2xl leading-tight text-ink">{t(evidence.title)}</h3>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{t(evidence.summary)}</p>
          <h4 className="eyebrow mb-3 mt-6">{t(WHY.case)}</h4>
          <ol className="faith-reasoning">{evidence.reasoning.map((point, i) => <li key={point.en}><span aria-hidden>{(i + 1).toLocaleString(lang === "ar" ? "ar-EG" : "en")}</span><p>{t(point)}</p></li>)}</ol>
          <div className="faith-takeaway"><Lightbulb className="h-5 w-5 shrink-0 text-salmon-700" aria-hidden /><div><h4 className="text-xs font-semibold text-salmon-700">{t(WHY.takeaway)}</h4><p className="mt-1 text-sm leading-relaxed text-ink-soft">{t(evidence.takeaway)}</p></div></div>
          <details className="faith-source-detail">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-brand-700"><BookOpen className="h-4 w-4" aria-hidden />{t(WHY.sources)}<span className="faith-source-count">{evidence.sources.length.toLocaleString(lang === "ar" ? "ar-EG" : "en")}</span><ChevronDown className="ms-auto h-4 w-4" aria-hidden /></summary>
            <div className="mt-4"><Refs items={evidence.sources} /></div>
          </details>
        </div>
      </article>
    </div>
    <section className="faith-objections" aria-labelledby="faith-objections-title">
      <h3 id="faith-objections-title" className="mb-2 text-sm font-semibold">{t(WHY.objections)}</h3>
      {stage.objections.map((item) => <details key={item.q.en} className="faith-objection">
        <summary className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">{t(item.q)}<ChevronDown className="ms-auto h-4 w-4 shrink-0 text-muted" aria-hidden /></summary>
        <p className="mb-4 mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">{t(item.a)}</p><Refs items={item.sources} />
      </details>)}
    </section>
  </>;
}
