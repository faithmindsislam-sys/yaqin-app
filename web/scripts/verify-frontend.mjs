// Credential-free verification of the production export. Build in a temporary copy
// so an active development server and its generated types remain untouched.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: web, stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} failed (${code})`)));
  });
}

for (const script of ["typecheck", "lint", "check:courses", "check:source-quotes", "check:progress", "check:onboarding", "check:tracks", "check:auth", "check:routing", "check:knowledge-base", "check:quran", "check:first-steps", "check:worship"]) {
  await run("npm", ["run", script]);
}

const temporary = mkdtempSync(join(tmpdir(), "yaqin-frontend-"));
const isolated = join(temporary, "web");
let server;
try {
  cpSync(web, isolated, { recursive: true, filter: (path) => {
    const relative = path.slice(web.length + 1);
    return !relative.split(sep).some((part) => part === "node_modules" || part.startsWith(".next") || part === "out" || part.startsWith(".env") || part.endsWith(".tsbuildinfo"));
  } });
  cpSync(join(web, "..", "infra", "cloudfront"), join(temporary, "infra", "cloudfront"), { recursive: true });
  cpSync(join(web, "..", "content"), join(temporary, "content"), { recursive: true });
  symlinkSync(join(web, "node_modules"), join(isolated, "node_modules"), "dir");
  const env = { ...process.env, YAQIN_CHECK_DIST_DIR: ".next", NEXT_PUBLIC_API_ENABLED: "true", NEXT_PUBLIC_API_BASE: "http://127.0.0.1:8797",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:8798", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public-key", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" };
  await run("npm", ["run", "build", "--", "--webpack"], { cwd: isolated, env });
  const exported = join(isolated, "out");
  for (const path of ["course", "lesson", "studio/course", "studio/lesson", "instructor", "settings", "learn", "journey", "editor", "curriculum", "users", "knowledge-base", "sources", "auth/bridge", "ask", "quran", "compare", "first-steps", "worship"]) {
    if (!existsSync(join(exported, path, "index.html"))) throw new Error(`Missing exported route: ${path}`);
  }
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2" };
  server = createServer((request, response) => {
    let file = resolve(exported, `.${decodeURIComponent(new URL(request.url, "http://localhost").pathname)}`);
    if (file !== exported && !file.startsWith(exported + sep)) { response.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  await run(process.execPath, ["scripts/check-frontend-browser.mjs"], { env: { ...env, FRONTEND_TEST_URL: `http://127.0.0.1:${server.address().port}` } });
  console.log("Frontend verification passed: types, lint, focused checks, static export and browser lifecycle regressions.");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(temporary, { recursive: true, force: true });
}
