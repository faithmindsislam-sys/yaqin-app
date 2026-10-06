// Public pages render without live content; exercise their actual preview handlers.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as jsx from "react/jsx-runtime";
import { loadSource } from "./load-source.mjs";

let lang = "en", cursor = 0, user = null;
const state = [];
const imports = {
  "react/jsx-runtime": jsx,
  react: { useEffect: () => {}, useState: (initial) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (value) => { state[i] = value; }]; } },
  "lucide-react": new Proxy({}, { get: () => "svg" }),
  "@/components/RouteLink": { default: "a" },
  "@/components/Logo": { Logo: () => jsx.jsx("a", { href: "/", children: "Yaqeen" }) },
  "@/components/ui": { LangToggle: () => null },
  "@/lib/i18n": { useI18n: () => ({ lang, t: (label) => label?.[lang] ?? "" }) },
  "@/features/auth/SessionProvider": { useSession: () => ({ user }) },
};
const load = (path) => loadSource(new URL(path, import.meta.url), imports);
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node.type === "function") return nodes(node.type(node.props));
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props?.children);
}
const render = (component, props) => { cursor = 0; return nodes(component(props)); };
const { ExperiencePreview } = load("../src/features/site/ExperiencePreview.tsx");
const { default: Landing } = load("../src/features/onboarding/Landing.tsx");
const { default: Teachers } = load("../src/features/site/Teachers.tsx");
const { default: Articles, Article } = load("../src/features/site/Articles.tsx");
const { ARTICLES, JOURNEYS, SITE_LINKS } = load("../src/features/site/data.ts");
const { SiteHeader } = load("../src/components/SiteChrome.tsx");
for (lang of ["en", "ar"]) {
  for (user of [null, {id:"fixture"}]) {
    state.length = 0;
    const header = render(SiteHeader);
    const cta = header.find((node) => node.props.className?.includes("site-header-cta"));
    assert.equal(cta.props.href,user ? "/learn/" : "/start/");
    assert.equal(text(cta),user ? (lang === "en" ? "Dashboard" : "لوحتي") : (lang === "en" ? "Start your journey" : "ابدأ رحلتك"));
    assert.equal(header.filter((node) => node.type === "a" && node.props.href === "/signin/").length,user ? 0 : 2,"Desktop and mobile agree on sign-in links");
  }
  user = null;
  state.length = 0;
  const preview = () => render(ExperiencePreview);
  const mode = (label) => preview().find((node) => node.type === "button" && text(node) === label);
  mode(lang === "en" ? "Practise" : "تدرّب").props.onClick();
  assert(preview().some((node) => node.props["aria-live"] === "polite"));
  const answer = (n) => preview().filter((node) => node.type === "button" && node.props.className !== undefined)[n];
  answer(0).props.onClick();
  assert.match(text(preview().find((node) => node.props["aria-live"])), lang === "en" ? /Try again/ : /حاول مجددًا/);
  answer(1).props.onClick();
  assert.match(text(preview().find((node) => node.props["aria-live"])), lang === "en" ? /That’s right/ : /صحيح/);
  mode(lang === "en" ? "Ask" : "اسأل").props.onClick();
  assert(preview().some((node) => node.props.className === "site-chat-answer"));
  mode(lang === "en" ? "Learn" : "تعلّم").props.onClick();
  assert.equal(state[1], null, "Changing preview modes resets the sample answer");
  const landing = render(Landing);
  assert.equal(landing.filter((node) => node.type === "h1").length, 1);
  for (const journey of JOURNEYS) assert(landing.some((node) => node.type === "a" && node.props.href === journey.href));
  assert.equal(landing.filter((node) => node.props.className === "site-persona-card").length, 5);
  const sections = landing.filter((node) => node.type === "section").map((node) => node.props.id);
  assert(sections.indexOf("companions") < sections.indexOf("experience"), "Companions appear before learning features");
  for (const card of landing.filter((node) => node.props.className === "site-persona-card")) {
    assert.equal(card.type, "details", "Companions support native click, tap and keyboard disclosure");
    assert.equal(nodes(card).filter((node) => node.type === "summary").length, 1);
    assert(nodes(card).some((node) => node.type === "a"), "Every companion offers a relevant next step");
  }
  for (const card of landing.filter((node) => node.props.className?.startsWith("site-journey-card "))) {
    assert.equal(card.type, "a", "The whole journey card opens its journey");
    assert.equal(nodes(card).filter((node) => node.type === "a").length, 1, "Journey links never nest");
  }
  for (const key of ["instagram", "facebook", "x", "youtube", "docs", "mcp", "mcpGuide"]) assert(landing.some((node) => node.type === "a" && node.props.href === SITE_LINKS[key]));
  const navLinks = landing.filter((node) => node.type === "nav").flatMap(nodes).filter((node) => node.type === "a");
  assert(!navLinks.some((node) => ["/library/", "/ask/", "/#sources"].includes(node.props.href)));
  const headerLinks = nodes(landing.find((node) => node.type === "nav")).filter((node) => node.type === "a").map((node) => node.props.href);
  assert.deepEqual(headerLinks.slice(-2), [SITE_LINKS.docs, "/teachers/"], "Developers link directly to documentation before educators");
  assert(sections.includes("developers"), "Developer navigation target exists");
  assert(!sections.includes("business") && !navLinks.some((node) => node.props.href === "/#business"), "Business content is removed");
  let closed = false;
  landing.find((node) => node.type === "nav" && node.props.onClick).props.onClick({ target: { closest: () => ({}) }, currentTarget: { closest: () => ({ removeAttribute: (attribute) => { closed = attribute === "open"; } }) } });
  assert(closed, "A mobile navigation link closes its menu");
  for (const [component, props] of [[Teachers], [Articles], ...ARTICLES.map((article) => [Article, { slug: article.slug }])]) {
    const page = render(component, props);
    assert.equal(page.filter((node) => node.type === "h1").length, 1);
    assert(page.some((node) => node.type === "main" && node.props.id === "main-content"));
    assert(page.some((node) => node.type === "a" && node.props.href.startsWith("mailto:" + SITE_LINKS.email)));
    for (const image of page.filter((node) => node.type === "img")) assert(existsSync(new URL("../public" + image.props.src, import.meta.url)), image.props.src);
  }
}
// Marketing pages skip course fetching; entering the learning app still loads it.
let pathname = "/", fetched = 0, focusListeners = 0;
const { ContentProvider } = loadSource(new URL("../src/features/courses/ContentProvider.tsx", import.meta.url), {
  ...imports,
  react: { createContext: () => ({ Provider: "provider" }), useState: (value) => [value, () => {}], useRef: () => ({ current: 0 }), useCallback: (fn) => fn, useMemo: (fn) => fn(), useEffect: (fn) => fn() },
  "next/navigation": { usePathname: () => pathname },
  "@/lib/http": { apiEnabled: false },
  "@/features/courses/api": { contentBundle: () => {} },
  "@/features/courses/catalog": { normalizeBundle: (bundle) => bundle },
}, {
  fetch: () => { fetched++; return Promise.resolve({ ok: true, json: async () => ({ tracks: [], courses: {}, sources: {} }) }); },
  window: { addEventListener: () => { focusListeners++; }, removeEventListener: () => {} },
});
const routes = JSON.parse(readFileSync(new URL("../src/lib/routes.json", import.meta.url)));
for (pathname of Object.keys(routes).filter((path) => routes[path].surface === "site")) {
  assert(!nodes(ContentProvider({ children: "site" })).some((node) => node.props.role === "status"));
}
assert.equal(fetched, 0, "Public pages never depend on course APIs");
assert.equal(focusListeners, 0);
pathname = "/learn/";
ContentProvider({ children: "app" });
assert.equal(fetched, 1, "The learning app still loads its courses");
assert.equal(focusListeners, 1);
console.log("PASS public site EN/AR: independent static pages, three journeys, five AI personas, social/API/MCP/contact links, preview modes and correct/incorrect answers, mobile menu, image assets.");
