import type { Bi } from "@/lib/types";
import { DATA } from "@/features/compare/data";

// Religion & Belief Comparison: types and data access. The content itself lives in data.ts.

export type NodeType = "reference" | "group" | "belief" | "tradition" | "topic";

/**
 * One point on the map. `parent` builds the tree: groups inside groups, then a belief → (tradition →) topic.
 * The one `reference` node is Islam: it stands among the beliefs, and every comparison is made with it. `note` says what a group shares.
 */
export interface CompareNode {
  id: string;
  type: NodeType;
  parent: string | null;
  title: Bi;
  note?: Bi;
}

/** `id` may be a source id from the content bundle (shown verbatim); otherwise `title` and `url` are shown. */
export interface CompareRef {
  id: string;
  title?: Bi;
  url?: string;
}

export interface Sides<T> {
  belief?: T;
  islam?: T;
}

/**
 * The comparison for one topic node, keyed by that node's id. Every field is optional: missing parts show a placeholder.
 * `sources` lists every reference the text cites in brackets. The page does not show the list; it is kept for review.
 */
export interface Comparison {
  overview?: Sides<Bi[]>;
  beliefs?: Sides<Bi[]>;
  common?: Bi[];
  differences?: Sides<Bi[]>;
  faq?: { id: string; q: Bi; a: Bi }[];
  sources?: Sides<CompareRef[]>;
}

/** One question of the guided path. The questions are the same for every belief. `lesson` is a course id for readers who want more. */
export interface PathStep {
  question: Bi;
  lesson?: string;
}

/** One step as one belief sees it, beside the Islamic view, with one Quran verse. */
export interface PathView {
  belief: Bi;
  islam: Bi;
  verse: CompareRef;
}

/** `entry` is the first step (counted from 1) where the belief differs from Islam. Without `views` the belief only has its topics. */
export interface BeliefPath {
  entry: number;
  views?: PathView[];
}

export interface CompareData {
  nodes: CompareNode[];
  comparisons: Record<string, Comparison>;
  path: { steps: PathStep[]; beliefs: Record<string, BeliefPath> };
}

const byId = new Map(DATA.nodes.map((n) => [n.id, n]));
const { steps, beliefs } = DATA.path;
const filled = (b?: Bi) => !!(b?.en.trim() && b.ar.trim());

// Data check: runs on load, so a bad edit fails the dev server and the build instead of drawing a broken map.
if (byId.size !== DATA.nodes.length) throw new Error("compare: duplicate node id");
if (DATA.nodes.filter((n) => !n.parent).length !== 1 || DATA.nodes.filter((n) => n.type === "reference").length !== 1) throw new Error("compare: the map needs one root and one reference");
for (const n of DATA.nodes) if (n.parent && !byId.has(n.parent)) throw new Error(`compare: ${n.id} has unknown parent ${n.parent}`);
for (const n of DATA.nodes) if ((n.type === "belief" || n.type === "tradition") && !DATA.nodes.some((m) => m.parent === n.id && m.type === "topic")) throw new Error(`compare: ${n.id} has no topic to open`);
for (const id of Object.keys(DATA.comparisons)) if (byId.get(id)?.type !== "topic") throw new Error(`compare: comparison ${id} is not a topic node`);
if (steps.some((s) => !filled(s.question))) throw new Error("compare: every path step needs a question in both languages");
for (const [id, p] of Object.entries(beliefs)) {
  if (byId.get(id)?.type !== "belief") throw new Error(`compare: path ${id} is not a belief node`);
  if (!Number.isInteger(p.entry) || p.entry < 1 || p.entry > steps.length) throw new Error(`compare: path ${id} enters at an unknown step`);
  if (!p.views) continue;
  if (p.views.length !== steps.length) throw new Error(`compare: path ${id} needs one view for each of the ${steps.length} steps`);
  p.views.forEach((v, i) => {
    if (!filled(v.belief) || !filled(v.islam) || !v.verse?.id || !filled(v.verse.title)) throw new Error(`compare: path ${id} step ${i + 1} needs both views in both languages and a titled verse`);
  });
}

const api = {
  root: DATA.nodes.find((n) => !n.parent)!,
  /** Islam, the reference of every comparison. */
  reference: DATA.nodes.find((n) => n.type === "reference")!,
  beliefs: DATA.nodes.filter((n) => n.type === "belief"),
  get: (id: string | null | undefined) => byId.get(id ?? ""),
  children: (id: string, type?: NodeType) => DATA.nodes.filter((n) => n.parent === id && (!type || n.type === type)),
  /** Ancestors then the node itself, root first. */
  path: (id: string) => {
    const out: CompareNode[] = [];
    for (let n = byId.get(id); n; n = byId.get(n.parent ?? "")) out.unshift(n);
    return out;
  },
  comparison: (id: string): Comparison | undefined => DATA.comparisons[id],
  steps,
  /** The guided path of a belief, only when its text is written. */
  guide: (id: string) => {
    const p = beliefs[id];
    return p?.views ? { entry: p.entry, views: p.views } : undefined;
  },
};

/** `step` (counted from 1) opens the guided path of a belief at that step. */
export const compareHref = (id?: string, step?: number) => (id && id !== api.root.id ? `/compare/?n=${id}${step ? `&step=${step}` : ""}` : "/compare/");

// ponytail: local data. For a CMS or API, load CompareData here (see useContent); components only use this hook.
export function useCompare() {
  return api;
}
