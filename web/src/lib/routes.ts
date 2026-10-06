import manifest from "./routes.json";

export const ORIGINS = { site: "https://www.yaqeenguide.com", app: "https://app.yaqeenguide.com", studio: "https://studio.yaqeenguide.com" };
const routes: Record<string, { surface: keyof typeof ORIGINS; path: string }> = manifest as Record<string, { surface: keyof typeof ORIGINS; path: string }>;
export const productionHost = (host: string) => ["yaqeenguide.com", "www.yaqeenguide.com", "app.yaqeenguide.com", "studio.yaqeenguide.com", "d1x2w48x0bzbrs.cloudfront.net"].includes(host);
export const routePath = (path: string) => path.toLowerCase().replace(/\/+/g, "/").replace(/\/index\.html$/, "/").replace(/\.html$/, "/").replace(/\/?$/, "/");

/** Logical Studio routes stay distinct from the learner's course route on localhost. */
export function routeUrl(href: string, host: string): string {
  if (!productionHost(host) || href.startsWith("//")) return href;
  const url = new URL(href, ORIGINS.site);
  if (!href.startsWith("/") && (!/^https?:\/\//.test(href) || !productionHost(url.hostname))) return href;
  const route = routes[routePath(url.pathname)];
  if (!route) return href;
  return ORIGINS[route.surface] + route.path + url.search + url.hash;
}

export function isStudioRoute(path: string, host = ""): boolean {
  return host === "studio.yaqeenguide.com" || routes[routePath(path)]?.surface === "studio";
}

/** No user-controlled origins, protocol-relative URLs, or auth redirect loops. */
export function returnPath(value: string | null): string | null {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return null;
  const url = new URL(value, ORIGINS.site);
  const route = routes[routePath(url.pathname)];
  if (!route || route.surface === "site" || ["/signin/", "/reset-password/"].includes(route.path) || route.path.startsWith("/auth/")) return null;
  return url.pathname + url.search + url.hash;
}

export function signInPath(path: string, host: string): string {
  // Studio's clean /editor/ path is represented by a logical Studio route on the app.
  const url = new URL(path, ORIGINS.site);
  const next = host === "studio.yaqeenguide.com" && routePath(url.pathname) === "/" ? "/studio/" + url.search + url.hash : path;
  return "/signin/?next=" + encodeURIComponent(returnPath(next) ?? "/learn/");
}

export function currentSignInPath(): string {
  if (typeof window === "undefined" || !productionHost(window.location.hostname)) return "/signin/";
  return signInPath(window.location.pathname + window.location.search, window.location.hostname);
}

export function postLoginPath(fallback: string): string {
  return typeof window === "undefined" ? fallback : returnPath(new URLSearchParams(window.location.search).get("next")) ?? fallback;
}

export function authCallbackUrl(): string {
  const next = returnPath(new URLSearchParams(window.location.search).get("next"));
  return new URL(routeUrl("/auth/callback/" + (next ? "?next=" + encodeURIComponent(next) : ""), window.location.hostname), window.location.origin).href;
}
