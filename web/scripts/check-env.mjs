import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { googleConfig, main, project } from "./google-auth.mjs";

// Exercise the real Next config loader on a fresh checkout, including stale web env files.
const fixture = mkdtempSync(join(tmpdir(), "yaqin-env-"));
const web = join(fixture, "web");
try {
  mkdirSync(join(web, "scripts"), { recursive: true });
  symlinkSync(fileURLToPath(new URL("../node_modules", import.meta.url)), join(web, "node_modules"));
  copyFileSync(fileURLToPath(new URL("./load-env.mjs", import.meta.url)), join(web, "scripts/load-env.mjs"));
  writeFileSync(join(web, "next.config.ts"), 'import "./scripts/load-env.mjs"; export default {};');
  writeFileSync(join(web, ".env.local"), "NEXT_PUBLIC_SUPABASE_URL=stale-web-config\n");
  writeFileSync(join(fixture, ".env"), "NEXT_PUBLIC_SUPABASE_URL=root-config\n");
  writeFileSync(join(fixture, ".env.production.local"), "NEXT_PUBLIC_SUPABASE_URL=production-config\n");
  const code = `const assert = require('node:assert/strict');
    const loadConfig = require(${JSON.stringify(join(web, "node_modules/next/dist/server/config"))}).default;
    loadConfig(process.env.TEST_PHASE, ${JSON.stringify(web)}).then(() => {
      assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.TEST_EXPECTED);
    }).catch((error) => { console.error(error.message); process.exitCode = 1; });`;
  for (const [mode, expected, override] of [["development", "root-config"], ["production", "production-config"], ["development", "shell-config", "shell-config"]]) {
    const childEnv = { ...process.env, NODE_ENV: mode, TEST_EXPECTED: expected,
      TEST_PHASE: mode === "production" ? "phase-production-build" : "phase-development-server" };
    delete childEnv.NEXT_PUBLIC_SUPABASE_URL;
    if (override) childEnv.NEXT_PUBLIC_SUPABASE_URL = override;
    execFileSync(process.execPath, ["-e", code], { cwd: web, env: childEnv, stdio: "pipe" });
  }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

const env = { NEXT_PUBLIC_SUPABASE_URL: "https://fixtureproject.supabase.co", SUPABASE_URL: "https://fixtureproject.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public-key", GOOGLE_CLIENT_ID: "fixture-client", GOOGLE_CLIENT_SECRET: "fixture-secret",
  SUPABASE_ACCESS_TOKEN: "fixture-token", AUTH_SITE_URL: "http://localhost:3100", AUTH_REDIRECT_URLS: "http://localhost:3100/auth/callback/" };
assert.throws(() => project({}), /NEXT_PUBLIC_SUPABASE_URL/);
assert.throws(() => project({ ...env, SUPABASE_URL: "https://different.supabase.co" }), /same project/);
assert.throws(() => project({ ...env, NEXT_PUBLIC_SUPABASE_URL: "https://supabase.co.attacker.example" }), /hosted/);
assert.throws(() => googleConfig({ ...env, GOOGLE_CLIENT_SECRET: "" }), /GOOGLE_CLIENT_SECRET/);
assert.throws(() => googleConfig({ ...env, AUTH_SITE_URL: "http://public.example" }), /HTTPS/);

const oldRedirect = "https://existing.example/auth/callback/";
const payload = googleConfig(env, { uri_allow_list: oldRedirect });
assert.equal(payload.external_google_enabled, true);
assert.equal(payload.uri_allow_list, `${oldRedirect},${env.AUTH_REDIRECT_URLS}`);

const originalFetch = globalThis.fetch;
const originalLog = console.log;
const logs = [];
console.log = (message) => logs.push(message);
try {
  globalThis.fetch = async () => { throw new Error("Dry run must not access the network"); };
  await main(["--plan"], env);
  let google = false;
  let email = true;
  let mailer_autoconfirm = false;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ external: { google, email }, disable_signup: false, mailer_autoconfirm }) });
  await assert.rejects(main([], env), /Google is disabled/);
  google = true;
  await main([], env);
  email = false;
  await assert.rejects(main([], env), /Email signup is disabled/);
  email = true;
  mailer_autoconfirm = true;
  await assert.rejects(main([], env), /Email confirmation is disabled/);
  mailer_autoconfirm = undefined;
  await assert.rejects(main([], env), /Email confirmation is disabled/);
  mailer_autoconfirm = false;
  await assert.rejects(main([], { ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private" }), /secret\/service-role/);
  const serviceKey = `eyJ.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
  await assert.rejects(main([], { ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: serviceKey }), /secret\/service-role/);
  let saved = { uri_allow_list: oldRedirect };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers.Authorization, `Bearer ${env.SUPABASE_ACCESS_TOKEN}`);
    if (options.method === "PATCH") saved = JSON.parse(options.body);
    return { ok: true, json: async () => saved };
  };
  await main(["--plan", "--apply"], env);
  assert.deepEqual(calls.map((call) => call.options.method), ["GET", "PATCH", "GET"]);
  assert.equal(saved.uri_allow_list, `${oldRedirect},${env.AUTH_REDIRECT_URLS}`);
  assert(!calls.some((call) => call.url.includes(env.GOOGLE_CLIENT_SECRET)));
  assert(!logs.join("\n").includes(env.GOOGLE_CLIENT_SECRET));
  assert(!logs.join("\n").includes(env.SUPABASE_ACCESS_TOKEN));
} finally {
  globalThis.fetch = originalFetch;
  console.log = originalLog;
}
console.log("Environment: root/production/shell loading, stale web config, project/key validation, dry run, provider checks and verified apply with preserved redirects passed.");
