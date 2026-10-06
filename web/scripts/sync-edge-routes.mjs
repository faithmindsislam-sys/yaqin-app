import { readFileSync, writeFileSync } from "node:fs";
const routes = JSON.parse(readFileSync(new URL("../src/lib/routes.json", import.meta.url), "utf8"));
const file = new URL("../../infra/cloudfront/index-rewrite.js", import.meta.url);
const source = readFileSync(file, "utf8");
const table = Object.fromEntries(Object.entries(routes).map(([path, route]) => [path, [route.surface, route.path]]));
const next = source.replace(/\/\/ BEGIN ROUTES\n[\s\S]*?\/\/ END ROUTES/, `// BEGIN ROUTES\nvar ROUTES = ${JSON.stringify(table)};\n// END ROUTES`);
if (process.argv.includes("--check")) {
  if (source !== next) throw new Error("Edge route table is stale. Run node scripts/sync-edge-routes.mjs.");
} else writeFileSync(file, next);
