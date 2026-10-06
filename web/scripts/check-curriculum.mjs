import assert from "node:assert/strict";
import * as jsx from "react/jsx-runtime";
import { loadSource } from "./load-source.mjs";

const { S } = loadSource(new URL("../src/lib/strings.ts", import.meta.url));
const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== "object" ? []
  : typeof node.type === "function" ? nodes(node.type(node.props)) : [node, ...nodes(node.props?.children)];
const text = (node) => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : String(node ?? "");

for (const lang of ["en", "ar"]) {
  const t = (value) => value?.[lang] ?? "";
  const title = (value) => ({ en: value, ar: value });
  const ordered = ["archived-a", "active", "archived-b", "draft", "review"];
  const data = { subjects: [], levels: [], updated_at: { tracks: null },
    courses: [...ordered, "archived-c"].map((id) => ({ id, title: title(id), status: id.startsWith("archived") ? "archived" : id === "active" ? "published" : id === "review" ? "in_review" : "draft" })),
    tracks: [{ id: "first-steps", title: title("First Steps"), modules: [
      { id: "mixed", title: title("Mixed module"), lessons: ordered },
      { id: "archived-only", title: title("Archived module"), lessons: ["archived-c"] },
      { id: "empty", title: title("Empty module"), lessons: [] },
    ] }],
  };
  const states = [data, false, null, null, null];
  let cursor = 0;
  const writes = [];
  const { default: Page } = loadSource(new URL("../src/features/studio/curriculum/Curriculum.tsx", import.meta.url), {
    "react/jsx-runtime": jsx,
    react: { Suspense: ({ children }) => children, useEffect() {}, useCallback: (fn) => fn, useRef: (value) => ({ current: value }),
      useState: () => { const index = cursor++; return [states[index], (value) => { states[index] = value; }]; } },
    "next/navigation": { useSearchParams: () => ({ get: (key) => key === "track" ? "first-steps" : "modules" }) },
    "@/lib/navigation": { useRouter: () => ({}) }, "@/components/RouteLink": { default: "a" },
    "@/components/AppShell": { AppShell: ({ children }) => children }, "@/components/Scenery": { PageBanner: () => null },
    "@/components/Select": { Select: () => null }, "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/lib/http": { apiEnabled: true, ApiError: class extends Error {} },
    "@/features/studio/curriculum/api": { saveTrackModules: async (track, modules) => { writes.push({ track, modules }); return data; } },
    "@/features/courses/ContentProvider": { useContent: () => ({ refresh: async () => {} }) },
    "@/features/auth/SessionProvider": { useSession: () => ({ user: { id: "admin" }, role: "admin" }) },
    "@/lib/i18n": { useI18n: () => ({ lang, t }) },
  });
  const draw = () => { cursor = 0; return nodes(Page()); };
  const section = (name) => draw().find((node) => node.type === "section" && nodes(node).some((child) => child.type === "h3" && text(child) === name));
  const rows = () => nodes(section("Mixed module")).filter((node) => node.type === "li");
  assert.deepEqual(rows().map((node) => nodes(node).find((child) => child.type === "a").props.children), ["active", "draft", "review"]);
  assert(nodes(section("Mixed module")).some((node) => node.type === "p" && text(node).endsWith(`${t(S.curriculum.count)}: 3`)));
  assert.deepEqual(rows().map((node) => nodes(node).find((child) => child.type === "select").props.value), [0, 1, 2]);
  assert.equal(nodes(section("Archived module")).filter((node) => node.type === "li").length, 0);
  for (const name of ["Mixed module", "Archived module"]) {
    const tip = nodes(section(name)).find((node) => node.props?.["data-tip"]);
    assert.equal(tip.props["data-tip"], t(S.curriculum.archivedSection));
    assert.equal(tip.props.tabIndex, 0);
    assert.equal(nodes(tip).find((node) => node.type === "button").props.disabled, true);
  }
  assert.equal(nodes(section("Empty module")).find((node) => node.type === "button" && text(node) === t(S.curriculum.delete)).props.disabled, false);
  nodes(rows()[2]).find((node) => node.type === "select").props.onChange({ target: { value: "0" } });
  await new Promise(setImmediate);
  assert.deepEqual(Array.from(writes[0].modules[0].lessons), ["archived-a", "review", "active", "archived-b", "draft"]);
  assert.deepEqual(ordered, ["archived-a", "active", "archived-b", "draft", "review"], "Rendering and reordering never mutate the original assignment list");
}
console.log("English/Arabic curriculum passed: archived rows hidden, counts/positions correct, reorder preserves archived assignments, accessible delete reasons.");
