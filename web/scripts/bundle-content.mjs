// Keep the saved content snapshot outside JavaScript, so lesson scripture is fetched as data.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contentDir = join(here, "..", "..", "content");
const outFile = join(here, "..", "public", "data", "content.json");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const jsonFiles = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f)) : [];

const tracksFile = join(contentDir, "tracks.json");
const tracks = existsSync(tracksFile) ? readJson(tracksFile) : [];

const levels = readJson(join(contentDir, "levels.json"));
const subjects = readJson(join(contentDir, "subjects.json")).map((s) => ({ ...s, levels: levels.map((l) => l.id) }));

const courses = {};
for (const f of jsonFiles(join(contentDir, "lessons"))) {
  const lesson = readJson(f);
  if (lesson.status === "published" && !lesson.coming_soon) courses[lesson.id] = lesson;
}

const sources = {};
for (const f of jsonFiles(join(contentDir, "sources"))) {
  const data = readJson(f);
  for (const s of Array.isArray(data) ? data : Object.values(data)) sources[s.id] = s;
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ tracks, subjects, levels, courses, sources }));
console.log(
  `content: ${tracks.length} tracks, ${Object.keys(courses).length} courses, ${Object.keys(sources).length} sources`,
);

// Labels and legacy metadata only; religious source text remains fetched as data.
writeFileSync(join(here, "..", "src", "lib", "course-catalog.json"), JSON.stringify({ subjects, levels, migration: readJson(join(contentDir, "course-migration.json")) }));
