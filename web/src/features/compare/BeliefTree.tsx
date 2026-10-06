"use client";

import Link from "@/components/RouteLink";
import { useState } from "react";
import { compareHref, useCompare, type CompareNode } from "@/features/compare/model";
import { useI18n } from "@/lib/i18n";
import { S } from "@/lib/strings";

// One look for each cluster, taken in turn.
const TONES = [
  { circle: "border-brand-200 from-brand-100/80", chip: "bg-brand-600 text-white", member: "hover:border-brand-400" },
  { circle: "border-gold/50 from-gold/20", chip: "bg-gold text-ink", member: "hover:border-gold" },
  { circle: "border-salmon-200 from-salmon-100/80", chip: "bg-salmon-600 text-white", member: "hover:border-salmon-400" },
];

/**
 * Where the members of a cluster sit: on a ring inside its circle, as large as they can be without touching.
 * Returns the centre of each member and their width, all in % of the circle. Two members stand side by side.
 */
function ring(count: number) {
  if (count === 1) return { size: 56, at: [[50, 50]] };
  const s = Math.sin(Math.PI / count);
  const radius = (0.9 * s) / (1 + s);
  const turn = count === 2 ? Math.PI : -Math.PI / 2;
  return {
    size: radius * 90,
    at: Array.from({ length: count }, (_, i) => {
      const angle = turn + (2 * Math.PI * i) / count;
      return [50 + 50 * (0.9 - radius) * Math.cos(angle), 50 + 50 * (0.9 - radius) * Math.sin(angle)];
    }),
  };
}

const MEMBER = "rise absolute grid aspect-square -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border p-1 text-center text-[0.8rem] font-medium leading-tight transition duration-200 rtl:translate-x-1/2 xl:text-sm";

/**
 * The classification of beliefs as clusters: a group is a soft circle, and the beliefs in it are the circles inside.
 * A group that holds other groups is drawn around them. Pointing at a group, or choosing its name, says what its members share;
 * the chosen group (`open`) comes from the page address, so Back and reload keep it.
 */
export function BeliefTree({ open }: { open: string }) {
  const { t } = useI18n();
  const c = useCompare();
  const [hot, setHot] = useState<string | null>(null);
  const active = hot ?? (open === c.root.id ? null : open);
  const shown = c.get(active);
  const members = (id: string) => c.children(id).filter((n) => n.type === "group" || n.type === "belief" || n.type === "reference");
  const holdsGroups = (id: string) => members(id).some((n) => n.type === "group");
  // The clusters in the order they are drawn, to give each its look.
  const clusters = c.children(c.root.id, "group").flatMap(function leaves(g: CompareNode): string[] {
    return holdsGroups(g.id) ? c.children(g.id, "group").flatMap(leaves) : [g.id];
  });
  // While one group is in focus, the groups outside its branch step back.
  const lit = (id: string) => !active || c.path(active).some((n) => n.id === id) || c.path(id).some((n) => n.id === active);
  const focus = (node: CompareNode) => ({
    onMouseEnter: () => setHot(node.id),
    onMouseLeave: () => setHot(node.parent === c.root.id ? null : node.parent),
    onFocus: (e: React.FocusEvent) => { e.stopPropagation(); setHot(node.id); },
    onBlur: (e: React.FocusEvent) => { e.stopPropagation(); setHot(null); },
  });
  // The name of a group chooses it; choosing it again lets go.
  const name = (node: CompareNode, className: string) => (
    <Link href={compareHref(open === node.id ? undefined : node.id)} scroll={false} aria-current={open === node.id ? "true" : undefined} className={className}>
      {t(node.title)}
      {node.note && <span className="sr-only">. {t(node.note)}</span>}
    </Link>
  );

  const draw = (node: CompareNode) => {
    const shell = `relative transition duration-300 ${lit(node.id) ? "" : "opacity-40"}`;
    if (holdsGroups(node.id)) return (
      <div key={node.id} role="group" aria-label={t(node.title)} className={`${shell} rounded-[2.75rem] border border-dashed bg-sky-50/70 px-3 pb-4 pt-2 sm:px-4 ${active === node.id ? "border-brand-400" : "border-sky-200"}`} {...focus(node)}>
        {name(node, "mx-auto mb-5 block w-fit rounded-full px-3 py-1 text-sm font-semibold text-brand-700 transition hover:bg-brand-100")}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-7">{members(node.id).map(draw)}</div>
      </div>
    );
    const tone = TONES[clusters.indexOf(node.id) % TONES.length];
    const inside = members(node.id);
    const { size, at } = ring(inside.length);
    return (
      <div key={node.id} role="group" aria-label={t(node.title)} className={`${shell} shrink-0`} {...focus(node)}>
        <div className={`relative aspect-square w-64 rounded-full border bg-gradient-to-b to-white transition duration-300 xl:w-72 ${tone.circle} ${active === node.id ? "scale-[1.03] shadow-[var(--shadow-lift)]" : ""}`}>
          {inside.map((member, i) => {
            const place = { insetInlineStart: `${at[i][0]}%`, top: `${at[i][1]}%`, width: `${size}%`, animationDelay: `${i * 70}ms` };
            return member.type === "reference" ? (
              <div key={member.id} style={place} className={`${MEMBER} border-brand-700 bg-brand-700 text-white shadow-[var(--shadow-card)]`}>
                <span>{t(member.title)}<span className="block text-[0.65rem] font-normal opacity-80">{t(S.compare.reference)}</span></span>
              </div>
            ) : (
              <Link key={member.id} href={compareHref(member.id)} style={place} className={`${MEMBER} border-white bg-white text-ink shadow-[var(--shadow-card)] hover:z-10 hover:scale-110 hover:shadow-[var(--shadow-lift)] focus-visible:z-10 focus-visible:scale-110 active:scale-95 ${tone.member}`}>
                {t(member.title)}
              </Link>
            );
          })}
        </div>
        {name(node, `absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold shadow-[var(--shadow-card)] transition hover:scale-105 ${tone.chip}`)}
      </div>
    );
  };

  return (
    <nav aria-label={t(S.compare.tree.label)}>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-8 pt-3">{members(c.root.id).map(draw)}</div>
      <p className="mx-auto mt-5 min-h-10 max-w-xl text-center text-sm text-ink-soft">
        {shown?.note ? <><span className="font-semibold text-ink">{t(shown.title)}.</span> {t(shown.note)}</> : t(S.compare.tree.hint)}
      </p>
    </nav>
  );
}
