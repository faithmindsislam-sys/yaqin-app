import assert from "node:assert/strict";
import * as jsx from "react/jsx-runtime";
import * as icons from "lucide-react";
import { loadSource } from "./load-source.mjs";

const { S } = loadSource(new URL("../src/lib/strings.ts", import.meta.url));
const base = { role: "learner", disabled: false, created_at: "2026-10-05T12:00:00Z", last_sign_in_at: null };
const rows = [
  { ...base, id: "zero", display_name: "Aymen", email: "aymen@example.test", daily_actual_tokens: 0, standalone_daily_actual_tokens: 0, daily_reserved_tokens: 400000, standalone_daily_reserved_tokens: 0 },
  { ...base, id: "partial", display_name: "Partial usage", email: "partial@example.test", daily_actual_tokens: 2289, daily_usage_unknown_calls: 1, standalone_daily_actual_tokens: 1500000, daily_reserved_tokens: 1600000, standalone_daily_reserved_tokens: 1800000 },
  { ...base, id: "missing", display_name: "Unavailable usage", email: "missing@example.test", daily_actual_tokens: null },
  { ...base, id: "self", role: "super_admin", display_name: "Super admin", email: "admin@example.test", daily_actual_tokens: 10000, standalone_daily_actual_tokens: 100 },
];

for (const lang of ["en", "ar"]) {
  let path = "", hook = 0, modalOpens = 0;
  const slots = new Map(), changes = [];
  const state = (initial) => {
    const index = hook++, key = `${path}:${index}`;
    if (!slots.has(key)) slots.set(key, path.endsWith("/Users") && index === 6
      ? { items: rows, total: 4, counts: { total: 4, learner: 3, teacher: 0, admin: 0, super_admin: 1, disabled: 0 }, daily_token_limit: 10000000 }
      : path.endsWith("/Users") && index === 7 ? false : initial);
    return [slots.get(key), (value) => slots.set(key, typeof value === "function" ? value(slots.get(key)) : value)];
  };
  const Page = loadSource(new URL("../src/features/studio/users/Users.tsx", import.meta.url), {
    "react/jsx-runtime": jsx,
    react: { useState: state, useRef: (current) => state({ current })[0], useId: () => state(`${lang}-${slots.size}`)[0], useEffect() {}, useCallback: (fn) => fn },
    "lucide-react": icons,
    "@/components/AppShell": { AppShell: ({ children, title, sub }) => jsx.jsxs("main", { className: "mx-auto max-w-6xl p-4 sm:p-8", children: [jsx.jsx("h1", { className: "font-serif text-3xl", children: title }), jsx.jsx("p", { className: "mb-6 mt-2 text-muted", children: sub }), children] }) },
    "@/components/Scenery": { PageBanner: () => null },
    "@/lib/http": { apiEnabled: true },
    "@/lib/strings": { S },
    "@/lib/i18n": { useI18n: () => ({ t: (value) => value?.[lang] ?? "", lang }) },
    "@/features/auth/SessionProvider": { useSession: () => ({ user: { id: "self" }, role: "super_admin" }) },
    "@/features/studio/users/api": {
      listUsers: async () => { throw new Error("Unexpected list request"); },
      userEvents: async () => [],
      changeUserRole: async (id, role) => changes.push({ id, role }),
      setUserDisabled: async (id, disabled) => changes.push({ id, disabled }),
    },
  }).default;
  function render(node, at = "root") {
    if (Array.isArray(node)) return node.map((child, i) => render(child, `${at}/${i}`));
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") { path = `${at}/${node.type.name}`; hook = 0; return render(node.type(node.props), path); }
    return { ...node, props: { ...node.props, children: render(node.props.children, `${at}/children`) } };
  }
  const flatten = (node) => Array.isArray(node) ? node.flatMap(flatten) : node && typeof node === "object" ? [node, ...flatten(node.props?.children)] : [];
  const text = (node) => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : typeof node === "boolean" ? "" : node ?? "";
  const tree = () => render(jsx.jsx(Page, {}));
  const draw = () => {
    const nodes = flatten(tree());
    for (const node of nodes.filter((node) => node.type === "dialog")) node.props.ref.current = { showModal: () => modalOpens++, close: () => node.props.onClose?.() };
    return nodes;
  };
  const button = (label) => draw().find((node) => node.type === "button" && text(node).endsWith(label[lang]));
  const combo = (label) => draw().find((node) => node.props.role === "combobox" && text(node) === label[lang]);
  const userState = (index) => slots.get([...slots.keys()].find((key) => key.endsWith(`/Users:${index}`)));
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  const cells = draw().filter((node) => node.props.className === "users-token-cell");
  assert(!cells.some((node) => text(node).includes(S.users.reservedTokens[lang])), "Quota details stay out of the rows");
  assert(text(cells[0]).includes((0).toLocaleString(lang)), `Known zero remains zero: ${text(cells[0])}`);
  assert(text(cells[1]).includes((2289).toLocaleString(lang)));
  assert(text(cells[1]).includes(S.users.tokensIncomplete[lang]), "Unknown calls have an accessible warning");
  assert(text(cells[2]).includes(S.users.tokensUnavailable[lang]), "Missing usage never becomes zero");

  button(S.users.status.disabled).props.onClick();
  assert.equal(userState(3), "disabled");
  button(S.users.teachers).props.onClick();
  assert.equal(userState(2), "teacher"); assert.equal(userState(3), "all", "Role metrics clear the old status filter");
  button(S.users.status.disabled).props.onClick();
  assert.equal(userState(2), "all", "Disabled metric clears the old role filter");
  draw().find((node) => node.props["aria-label"] === S.users.refresh[lang]).props.onClick();
  assert.equal(userState(9), 1, "Refresh triggers the existing reload effect");

  combo(S.users.roles.learner).props.onClick();
  draw().find((node) => node.props.role === "option" && text(node) === S.users.roles.teacher[lang]).props.onClick();
  assert.equal(changes.length, 0, "Role changes require confirmation");
  button(S.users.changeRole).props.onClick(); await settle();
  assert.deepEqual(changes[0], { id: "zero", role: "teacher" });
  draw().find((node) => node.props["aria-label"] === `${S.users.disable[lang]}: Aymen`).props.onClick();
  assert.equal(changes.length, 1, "Disabling also requires confirmation");
  button(S.users.disable).props.onClick(); await settle();
  assert.deepEqual(changes[1], { id: "zero", disabled: true });
  assert(combo(S.users.roles.super_admin).props.disabled, "Own role stays protected");
  assert(draw().find((node) => node.props["aria-label"] === `${S.users.disable[lang]}: Super admin`).props.disabled);

  draw().find((node) => node.props["aria-label"] === `${S.users.usageDetails[lang]}: Aymen`).props.onClick(); await settle();
  const detail = draw().find((node) => node.type === "dialog" && node.props["aria-labelledby"] === "users-detail-title");
  assert(text(detail).includes(S.users.tokensZero[lang]), "Zero is described as no reported tokens");
  assert(text(detail).includes((400000).toLocaleString(lang)) && text(detail).includes((10000000).toLocaleString(lang)), "Detail preserves reservation and daily limit");
  assert(modalOpens >= 2);
  console.log(`PASS users ${lang}: compact totals, zero/unknown/unavailable usage, quota dialog, metric filters, refresh, confirmed role changes and self protection`);
}
