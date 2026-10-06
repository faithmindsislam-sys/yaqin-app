import assert from "node:assert/strict";
import { loadSource } from "./load-source.mjs";

const { FAITH_STAGES, WHY, faithHref } = loadSource(new URL("../src/features/compare/why-islam-data.ts", import.meta.url));
assert.deepEqual(Array.from(FAITH_STAGES, (s) => s.id), ["creator", "oneness", "revelation", "prophet", "quran", "islam"]);
for (const stage of FAITH_STAGES) {
  const url = new URL(faithHref(stage.id), "https://local.test");
  assert.equal(url.searchParams.get("tab"), "why");
  assert.equal(url.searchParams.get("stage"), stage.id);
  assert(stage.evidence.length >= 2 && stage.objections.length >= 1);
  for (const item of [...stage.evidence, ...stage.objections]) {
    assert(item.sources.length, `${stage.id}: arguments and answers require sources`);
    for (const ref of item.sources) {
      assert(ref.id && ref.title.en && ref.title.ar);
      const link = new URL(ref.url, "https://local.test");
      assert(["local.test", "d1.islamhouse.com", "hadeethenc.com"].includes(link.hostname), "Sources stay within the Quran reader and selected publishers");
      if (link.hostname === "d1.islamhouse.com") assert(/\.pdf$/.test(link.pathname) && /^#page=\d+$/.test(link.hash), "PDF sources require page locators");
      if (link.hostname === "local.test") assert(link.pathname === "/quran/" && Number(link.searchParams.get("s")) >= 1 && Number(link.searchParams.get("v")) >= 1);
    }
  }
}
function bilingual(value) {
  if (!value || typeof value !== "object") return;
  if ("en" in value || "ar" in value) {
    assert(typeof value.en === "string" && value.en.trim() && typeof value.ar === "string" && value.ar.trim(), "Every reader-facing string is bilingual");
  } else for (const child of Object.values(value)) bilingual(child);
}
bilingual(FAITH_STAGES); bilingual(WHY);
console.log(`Faith journey: ${FAITH_STAGES.length} questions, ${FAITH_STAGES.reduce((n, s) => n + s.evidence.length, 0)} arguments; bilingual copy, routes and source locators verified.`);
