# Yaqin web

Requires Node.js 22+. The tracked root `.env` already contains our shared Supabase credentials.
Do not copy `.env.example` over it; that template is for a different project.
See [local setup](../README.md#run-locally) and [Supabase/Google setup](../docs/SUPABASE_SETUP.md).

From `web/`:

```bash
npm ci
npm run auth:check
npm run dev -- --port 3100
```

`auth:check` reads the configured project's public Auth settings and diagnoses missing
values or a disabled Google provider. `auth:configure` previews provider/redirect settings
from root `.env`; `auth:configure -- --apply` explicitly updates that hosted project.
Google Cloud OAuth credentials, consent audience and authorized callback must also be configured.

`npm run build` exports to `out/`. Public environment variables are frozen at build time.
Restart development or rebuild/redeploy after changing them. Shell variables override files;
optional production frontend overrides live in root `.env.production.local`.
Previous `web/.env*` files are no longer loaded. All private values stay outside browser bundles.

Checks: `npm run check:env`, `npm run check:auth`, `npm run typecheck`, `npm run lint`.
