import "./load-env.mjs";
import { pathToFileURL } from "node:url";

function required(env, name) {
  if (!env[name]?.trim()) throw new Error(`Set ${name} in the repository root .env, then restart/rebuild the web app.`);
  return env[name].trim();
}

export function project(env) {
  const url = required(env, "NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname) || parsed.pathname !== "/" || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be your hosted https://PROJECT_REF.supabase.co URL.");
  }
  if (env.SUPABASE_URL && env.SUPABASE_URL.replace(/\/$/, "") !== url) {
    throw new Error("SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL must identify the same project.");
  }
  return { url, ref: parsed.hostname.split(".")[0] };
}

export function googleConfig(env, existing = {}) {
  const site = required(env, "AUTH_SITE_URL");
  const redirects = required(env, "AUTH_REDIRECT_URLS").split(",").map((v) => v.trim()).filter(Boolean);
  for (const value of [site, ...redirects]) {
    const url = new URL(value);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) || url.username || url.password || url.hash || url.search) {
      throw new Error("Auth URLs must use HTTPS (or local HTTP), without credentials, queries or fragments.");
    }
  }
  return {
    external_google_enabled: true,
    external_google_client_id: required(env, "GOOGLE_CLIENT_ID"),
    external_google_secret: required(env, "GOOGLE_CLIENT_SECRET"),
    site_url: site,
    uri_allow_list: [...new Set([...(existing.uri_allow_list || "").split(",").filter(Boolean), ...redirects])].join(","),
  };
}

async function request(url, headers, body) {
  const response = await fetch(url, { method: body ? "PATCH" : "GET", headers,
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  // API errors can contain submitted credentials. Report status without echoing their body.
  if (!response.ok) throw new Error(`Supabase request failed (HTTP ${response.status}); check the project, key/token and token permissions.`);
  return response.json();
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (!["", "--plan", "--apply", "--plan --apply"].includes(args.join(" "))) {
    throw new Error("Usage: npm run auth:check | npm run auth:configure [-- --apply]");
  }
  const { url, ref } = project(env);
  console.log(`Supabase project: ${ref}`);
  console.log(`Google Cloud authorized redirect URI: ${url}/auth/v1/callback`);
  if (args.includes("--plan") || args.includes("--apply")) {
    let payload = googleConfig(env);
    console.log(`Site URL: ${payload.site_url}`);
    console.log(`Redirects to add: ${payload.uri_allow_list}`);
    console.log("Google provider: enable; client ID and secret: configured (hidden). Existing redirects will be retained.");
    if (!args.includes("--apply")) return;
    const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
    const headers = { Authorization: `Bearer ${required(env, "SUPABASE_ACCESS_TOKEN")}`, "Content-Type": "application/json" };
    payload = googleConfig(env, await request(endpoint, headers));
    await request(endpoint, headers, payload);
    const saved = await request(endpoint, headers);
    if (!saved.external_google_enabled || saved.site_url !== payload.site_url || saved.external_google_client_id !== payload.external_google_client_id || !payload.uri_allow_list.split(",").every((v) => saved.uri_allow_list?.split(",").includes(v))) {
      throw new Error("Supabase did not retain the requested Google provider/redirect settings.");
    }
    console.log("Google provider and redirects applied and verified.");
    return;
  }
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || required(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  let role;
  try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role; } catch { /* Publishable keys are not JWTs. */ }
  if (key.startsWith("sb_secret_") || role === "service_role") throw new Error("Use a publishable/anon key; secret/service-role keys must never go into NEXT_PUBLIC_*.");
  const settings = await request(`${url}/auth/v1/settings`, { apikey: key });
  if (!settings.external?.google) throw new Error("Google is disabled in this Supabase project. Configure its Google provider in the dashboard or run auth:configure -- --apply.");
  if (settings.disable_signup) throw new Error("Google is enabled, but new signups are disabled in this Supabase project.");
  if (!settings.external?.email) throw new Error("Email signup is disabled in this Supabase project.");
  if (settings.mailer_autoconfirm !== false) throw new Error("Email confirmation is disabled. Verify the sending domain and SMTP sender, then enable Confirm email in Supabase.");
  console.log("Google, email signup and email confirmation are enabled. Verify SMTP delivery, Google consent and callback redirects with a real test account.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
