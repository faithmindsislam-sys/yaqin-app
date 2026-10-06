"use client";

import { AlertTriangle, BadgeCheck, Info, Scale, Sparkles, UserRoundSearch } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";
import type { AskResponse, Tier } from "@/lib/types";
import { SourceReference } from "@/features/courses/content";

const TIER_STYLE: Record<Tier, { cls: string; icon: typeof Info }> = {
  A: { cls: "bg-brand-50 text-brand-800 border-brand-200", icon: BadgeCheck },
  B: { cls: "bg-sky-100 text-ink border-sky-200", icon: Info },
  C: { cls: "bg-amber-50 text-amber-900 border-amber-200", icon: Scale },
  D: { cls: "bg-violet-50 text-violet-900 border-violet-200", icon: UserRoundSearch },
  OUT: { cls: "bg-slate-50 text-slate-700 border-slate-200", icon: Info },
  NONE: { cls: "bg-slate-50 text-slate-700 border-slate-200", icon: AlertTriangle },
};

/** Inline emphasis only; model text is never interpreted as HTML. */
function Rich({ text, reveal }: { text: string; reveal?: { start: number; step: number } }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  let word = reveal?.start ?? 0;
  const words = (value: string) => !reveal ? value : value.split(/(\s+)/).map((part, i) =>
    !part.trim() ? part : <span key={i} className="answer-word" style={{ animationDelay: `${word++ * reveal.step}ms` }}>{part}</span>);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {words(p.slice(2, -2))}
          </strong>
        ) : p.startsWith("*") && p.endsWith("*") ? <em key={i}>{words(p.slice(1, -1))}</em> : (
          <span key={i}>{words(p)}</span>
        ),
      )}
    </>
  );
}

function AnswerText({ text, reveal }: { text: string; reveal?: { start: number; step: number } }) {
  const lines = text.split(/\r?\n/);
  const content: ReactNode[] = [];
  let start = reveal?.start ?? 0;
  const rich = (value: string) => {
    const offset = start;
    start += value.match(/\S+/g)?.length ?? 0;
    return <Rich text={value} reveal={reveal && { start: offset, step: reveal.step }} />;
  };
  const heading = (line: string) => line.trim().match(/^(?:#{1,3}\s+(.+)|\*\*([^*]+)\*\*:?)$/);
  const bullet = (line: string) => line.match(/^\s*(?:([-*•])\s+|(\d+)[.)]\s+)(.+)$/);
  // ponytail: headings, lists and emphasis only; use a Markdown renderer if tables or nested lists are needed.
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const title = heading(lines[i]);
    const item = bullet(lines[i]);
    if (title) {
      content.push(<h3 key={i} className="pt-2 font-serif text-xl font-semibold leading-snug text-ink sm:text-2xl">{rich(title[1] ?? title[2])}</h3>);
    } else if (item) {
      const start = i;
      const ordered = !!item[2];
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const next = bullet(lines[i]);
        if (!next || !!next[2] !== ordered) break;
        items.push(<li key={i} className="ps-1 marker:font-semibold marker:text-brand-600">{rich(next[3])}</li>);
        i++;
      }
      i--;
      const cls = "space-y-2 ps-5";
      content.push(ordered ? <ol key={start} start={Number(item[2])} className={`${cls} list-decimal`}>{items}</ol> : <ul key={start} className={`${cls} list-disc`}>{items}</ul>);
    } else {
      const start = i;
      const paragraph = [lines[i]];
      while (i + 1 < lines.length && lines[i + 1].trim() && !heading(lines[i + 1]) && !bullet(lines[i + 1])) paragraph.push(lines[++i]);
      content.push(<p key={start} className="whitespace-pre-line">{rich(paragraph.join("\n"))}</p>);
    }
  }
  return <div className="space-y-4">{content}</div>;
}

/** `cited` is whether this specific answer referenced at least one real source; tiers A-D
 * normally claim sourcing, so a label implying that must not show when nothing was cited. */
export function TierBadge({ tier, cited = true }: { tier: Tier; cited?: boolean }) {
  const { t } = useI18n();
  const { cls, icon: Icon } = TIER_STYLE[tier] ?? TIER_STYLE.NONE;
  const claimsSources = tier === "A" || tier === "B" || tier === "C" || tier === "D";
  const label = claimsSources && !cited ? S.ask.uncited : S.ask.tier[tier] ?? S.ask.tier.NONE;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {t(label)}
    </span>
  );
}

/** Model text, followed by short references to the exact cited evidence.
 * `listen` is an optional narration control the caller supplies (it owns the voice/persona);
 * it is shown once the answer is settled, i.e. not while verifying. */
export function AnswerView({ data, compact = false, showSources = true, animate = false, listen, author, onFollowUp }: { data: AskResponse; compact?: boolean; showSources?: boolean; animate?: boolean; listen?: ReactNode; author?: string; onFollowUp?: (q: string) => void }) {
  const { t } = useI18n();
  const offsets = [0];
  for (const block of data.answer) offsets.push(offsets[offsets.length - 1] + (block.type === "text" ? block.text.match(/\S+/g)?.length ?? 0 : 0));
  const count = offsets[offsets.length - 1];
  const [step] = useState(() => Math.min(26, 1800 / Math.max(1, count)));
  const [startedAsDraft] = useState(!!data.verifying);
  // Reserve the complete layout; reveal words without moving the reader or replaying verification edits.
  const reveal = animate && (!startedAsDraft || data.verifying);
  const cited = Array.from(new Set(data.answer.flatMap((block) => block.type === "source" && data.sources[block.id] ? [block.id] : [])));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {data.practice_fallback || data.safety_outcome === "safety_unavailable" || data.safety_outcome === "safety_blocked" ? (
          <span role="status" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {t(data.safety_outcome === "safety_blocked" ? S.ask.safetyBlocked : S.ask.unavailable)}
          </span>
        ) : (data.tier !== "A" || cited.length === 0) && <TierBadge tier={data.tier} cited={cited.length > 0} />}
        {data.ai_generated && (author ? <span className="inline-flex items-center gap-2 text-xs text-muted"><Sparkles className="h-3.5 w-3.5 text-brand-500" aria-hidden />{author}</span> : <span className="chip !py-0.5 !text-[0.7rem]">{t(S.common.aiLabel)}</span>)}
        {listen && !data.verifying ? listen : null}
      </div>
      {data.answer.map((b, i) =>
        b.type === "text" ? (
          <div key={i} className={`max-w-[65ch] break-words text-ink ${compact ? "text-sm leading-relaxed" : "text-base leading-[1.85]"}`}>
            <AnswerText text={b.text} reveal={reveal ? { start: offsets[i], step } : undefined} />
          </div>
        ) : null,
      )}
      {data.verifying && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Sparkles className="h-4 w-4 animate-pulse text-brand-500 motion-reduce:animate-none" aria-hidden /> {t(S.ask.verifying)}
        </p>
      )}
      {data.referral && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
          <p className="font-semibold">{t(S.ask.referralTitle)}</p>
          <p className="mt-1">{t(data.referral)}</p>
        </div>
      )}
      {showSources && !!cited.length && <footer className="space-y-2 border-t border-line pt-3" aria-label={t(S.ask.related)}>
        <p className="text-xs text-muted">{t(S.lesson.sources)}</p>
        {cited.map((id) => <SourceReference key={id} id={id} source={data.sources[id]} />)}
      </footer>}
      {onFollowUp && data.follow_ups?.length > 0 && (
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-xs text-muted">{t(S.ask.followUps)}</p>
          <div className="flex flex-wrap gap-2">
            {data.follow_ups.map((q) => (
              <button key={q} onClick={() => onFollowUp(q)} className="rounded-xl border border-line bg-sky-50/60 px-3 py-2 text-start text-sm text-ink-soft transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
