"use client";

import Link from "@/components/RouteLink";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/navigation";
import { Suspense, useEffect, useRef, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Network, Scale, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/features/auth/SessionProvider";
import { PageBanner } from "@/components/Scenery";
import { BeliefTree } from "@/features/compare/BeliefTree";
import { GuidedPath } from "@/features/compare/GuidedPath";
import { compareHref, useCompare, type CompareNode } from "@/features/compare/model";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import { WhyIslam } from "./WhyIslam";
import { WHY } from "./why-islam-data";
import "./why-islam.css";

export default function ComparePage() {
  const { t } = useI18n();
  const { ready, user, prefs } = useSession();
  const router = useRouter();
  const firstSteps = prefs.track === "first-steps";
  useEffect(() => {
    if (ready && user && firstSteps) router.replace("/first-steps/");
  }, [ready, user, firstSteps, router]);
  if (firstSteps) return <AppShell title={t(S.nav.firstSteps)}><p role="status">{t(S.common.loading)}</p></AppShell>;
  return (
    <AppShell title={t(S.nav.compare)} sub={t(S.compare.intro)}>
      <Suspense><Experiences /></Suspense>
    </AppShell>
  );
}

function Experiences() {
  const { t, dir } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const active = params.get("tab") === "why" ? "why" : "compare";
  const tabs = ["compare", "why"] as const;
  const change = (tab: typeof tabs[number]) => {
    const query = new URLSearchParams(params.toString());
    if (tab === "compare") query.delete("tab"); else query.set("tab", "why");
    router.push(`/compare/${query.size ? `?${query}` : ""}`, { scroll: false });
  };
  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const offset = (event.key === "ArrowRight" ? 1 : -1) * (dir === "rtl" ? -1 : 1);
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : (tabs.indexOf(active) + offset + tabs.length) % tabs.length;
    change(tabs[next]);
    document.getElementById(`faith-tab-${tabs[next]}`)?.focus();
  }
  return <div className="space-y-6">
    <PageBanner title={t(S.nav.compare)} sub={t(S.compare.intro)} />
    <div className="faith-tabs" role="tablist" aria-label={t(S.nav.compare)}>
      {tabs.map((tab) => {
        const Icon = tab === "compare" ? Scale : Sparkles;
        return <button key={tab} type="button" role="tab" id={`faith-tab-${tab}`} aria-controls={`faith-panel-${tab}`} aria-selected={active === tab} tabIndex={active === tab ? 0 : -1} onClick={() => change(tab)} onKeyDown={tabKey}>
          <Icon className="h-4 w-4" aria-hidden />{t(WHY.tabs[tab])}
        </button>;
      })}
    </div>
    {tabs.map((tab) => <section key={tab} role="tabpanel" id={`faith-panel-${tab}`} aria-labelledby={`faith-tab-${tab}`} hidden={active !== tab} tabIndex={0}>
      {active === tab && (tab === "why" ? <WhyIslam /> : <Explorer />)}
    </section>)}
  </div>;
}

/**
 * The place is kept in the page address, so links, the browser Back button and reloads all keep it:
 * `n` is the place in the map (a group is the overview with that group in focus), and `step` is a step of a belief's guided path.
 */
function Explorer() {
  const { t } = useI18n();
  const c = useCompare();
  const params = useSearchParams();
  const found = c.get(params.get("n"));
  // Islam has no page of its own, so its id shows its group. An unknown id shows the plain overview.
  const landed = !found ? c.root : found.type === "reference" ? c.get(found.parent) ?? c.root : found;
  const isOverview = landed.type === "group";
  // The belief or tradition whose page this is. Its topics and, for a belief with path text, its guided path are read on that one page.
  const holder = landed.type === "topic" ? c.get(landed.parent) ?? c.root : landed;
  const belief = c.path(holder.id).find((n) => n.type === "belief");
  const guide = holder === belief ? c.guide(holder.id) : undefined;
  const wanted = Number(params.get("step"));
  // A belief opens on its path, at the first difference, unless the address names a step or a topic. Without a path it opens on its first topic.
  const step = !guide || landed.type === "topic" ? 0 : Number.isInteger(wanted) && wanted >= 1 && wanted <= c.steps.length ? wanted : guide.entry;
  const topic = isOverview || step ? undefined : landed.type === "topic" ? landed : c.children(holder.id, "topic")[0];
  const trail = c.path((topic ?? holder).id).filter((n) => n === c.root || n.type !== "group");
  // Back leaves a belief for the overview, with its group in focus; from a tradition it returns to the belief.
  const back = c.get(holder.parent) ?? c.root;
  const label = (n: CompareNode) => (n === c.root ? t(S.compare.overview) : t(n.title));
  const traditions = isOverview ? [] : c.children(holder.id, "tradition");

  // After moving to another step or topic, keyboard and screen-reader users continue from the heading.
  // Putting a group of the overview in focus is not such a move: focus stays on the group.
  const place = isOverview ? "overview" : `${holder.id}:${step}:${topic?.id}`;
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef(place);
  useEffect(() => {
    if (shown.current === place) return;
    shown.current = place;
    heading.current?.focus();
  }, [place]);

  return (
    <div className="space-y-6">
      {!isOverview && (
        <header className="space-y-3">
          <nav aria-label={t(S.compare.breadcrumb)}>
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
              {trail.map((n, i) => (
                <li key={n.id} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />}
                  {i === trail.length - 1 ? <span aria-current="page" className="font-medium text-ink">{label(n)}</span> : (
                    <Link href={compareHref(n.id)} className="hover:text-brand-700 hover:underline">{label(n)}</Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">{[holder !== belief && belief && t(belief.title), t(S.compare.comparedWith)].filter(Boolean).join(" · ")}</p>
              <h2 ref={heading} tabIndex={-1} className="scroll-mt-24 font-serif text-3xl text-ink outline-none sm:text-4xl">{t(holder.title)}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={compareHref(back.id)} className="btn btn-ghost"><ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /> {t(S.compare.back)}</Link>
              {back.type !== "group" && <Link href={compareHref()} className="btn btn-ghost"><Network className="h-4 w-4" aria-hidden /> {t(S.compare.overview)}</Link>}
            </div>
          </div>
        </header>
      )}

      {isOverview ? (
        <>
          <section className="card rise p-4 sm:p-6">
            <BeliefTree open={landed.id} />
            <p className="mt-4 text-center text-sm text-muted">
              {t(S.compare.referenceNote)} <a href="https://dawa.center/religions" target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-brand-700">{t(S.compare.tree.source)}</a>
            </p>
          </section>
        </>
      ) : (
        <>
          <GuidedPath holder={holder} guide={guide} step={step} topic={topic} />
          {traditions.length > 0 && (
            <section className="card p-5">
              <h2 className="eyebrow">{t(S.compare.traditions)}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {traditions.map((tr) => (
                  <Link key={tr.id} href={compareHref(tr.id)} className="inline-flex min-h-11 items-center rounded-full border border-dashed border-brand-300 bg-white px-4 text-sm text-ink transition hover:bg-brand-50">
                    {t(tr.title)}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
