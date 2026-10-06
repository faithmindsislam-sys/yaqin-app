import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Next initially loads web/.env*. Reload from the repository root, retaining shell overrides.
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(fileURLToPath(new URL("../../", import.meta.url)), process.env.NODE_ENV !== "production", console, true);
