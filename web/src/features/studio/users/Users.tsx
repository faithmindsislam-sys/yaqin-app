"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, CircleAlert, Clock, GraduationCap, History, RefreshCw, RotateCcw, Search, Shield, ShieldCheck, UserRoundX, Users as UsersIcon, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageBanner } from "@/components/Scenery";
import { Select } from "@/components/Select";
import { apiEnabled } from "@/lib/http";
import { changeUserRole, listUsers, setUserDisabled, userEvents, type AdminUser, type AdminUserList } from "@/features/studio/users/api";
import { type LessonEvent } from "@/features/studio/api";
import { useI18n } from "@/lib/i18n";
import { isStaff, type Role } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import { S } from "@/lib/strings";

const ROLES: Role[] = ["learner", "teacher", "admin", "super_admin"];
const METRICS = ["total", "teacher", "admin", "super_admin", "disabled"] as const;
const METRIC_ICONS = { total: UsersIcon, teacher: GraduationCap, admin: Shield, super_admin: ShieldCheck, disabled: UserRoundX };
const METRIC_LABELS = { total: S.users.total, teacher: S.users.teachers, admin: S.users.admins, super_admin: S.users.superAdmins, disabled: S.users.status.disabled };
const nameOf = (row: AdminUser) => row.display_name || row.email || row.id;
const initials = (row: AdminUser) => nameOf(row).split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("").toLocaleUpperCase();

type Confirmation = { row: AdminUser; label: string; description: string; toRole?: Role; operation: () => Promise<unknown>; success: string };

export default function UsersPage() {
  const { t } = useI18n();
  return <AppShell title={t(S.users.title)} sub={t(S.users.sub)}><Users /></AppShell>;
}

function Users() {
  const { t, lang } = useI18n();
  const { user, role } = useSession();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "disabled" | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<AdminUserList>({ items: [], total: 0, counts: { total: 0, learner: 0, teacher: 0, admin: 0, super_admin: 0, disabled: 0 } });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [preview, setPreview] = useState<AdminUser | null>(null);
  const [history, setHistory] = useState<LessonEvent[]>([]);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("ready");
  const requestCounter = useRef(0);
  const historyRequest = useRef(0);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const toast = useRef<HTMLDivElement>(null);
  const userId = user?.id;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() !== query) { setQuery(search.trim()); setPage(1); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, query]);

  const load = useCallback(async () => {
    if (role !== "super_admin" || !userId || !apiEnabled) return;
    const request = ++requestCounter.current;
    setLoading(true); setError(null);
    try {
      const result = await listUsers({ q: query, role: roleFilter === "all" ? undefined : roleFilter,
        status: statusFilter === "all" ? undefined : statusFilter, page, page_size: pageSize });
      if (request !== requestCounter.current) return;
      if (!result.items.length && page > 1) { setPage(page - 1); return; }
      setData(result);
    } catch (e) {
      if (request === requestCounter.current) setError(e instanceof Error ? e.message : t(S.ask.error));
    } finally {
      if (request === requestCounter.current) setLoading(false);
    }
  }, [role, userId, query, roleFilter, statusFilter, page, pageSize, t]);

  useEffect(() => {
    const requests = requestCounter;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Loads server filters and preserves rows until the request resolves.
    void load();
    return () => { requests.current++; };
  }, [load, revision]);

  useEffect(() => {
    const notification = toast.current;
    if (!notification || (!message && !error)) return;
    notification.showPopover();
    const timer = window.setTimeout(() => { setMessage(null); setError(null); }, 6000);
    return () => { window.clearTimeout(timer); if (notification.isConnected) notification.hidePopover(); };
  }, [message, error, preview]);

  async function action(operation: () => Promise<unknown>, success: string) {
    setBusy(true); setError(null); setMessage(null);
    try {
      await operation();
      setRevision((value) => value + 1); setMessage(success);
    } catch (e) { setError(e instanceof Error ? e.message : t(S.ask.error)); }
    finally { setBusy(false); }
  }

  async function loadHistory(id: string) {
    const request = ++historyRequest.current;
    setHistory([]); setHistoryState("loading");
    try {
      const events = await userEvents(id);
      if (request === historyRequest.current) { setHistory(events); setHistoryState("ready"); }
    } catch {
      if (request === historyRequest.current) setHistoryState("error");
    }
  }

  function openUser(row: AdminUser) {
    setPreview(row); void loadHistory(row.id); dialog.current?.showModal();
  }

  function confirm(change: Confirmation) {
    setConfirmation(change); confirmDialog.current?.showModal();
  }

  function resetFilters() {
    setSearch(""); setQuery(""); setRoleFilter("all"); setStatusFilter("all"); setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
  const first = (page - 1) * pageSize;
  const roleOptions = ROLES.map((value) => ({ value, label: t(S.users.roles[value]), className: `chip studio-status status-${value}` }));
  const date = (value: string) => new Date(value).toLocaleDateString(lang, { dateStyle: "medium" });
  const tokenUsage = (row: AdminUser, detailed = false) => <div className={detailed ? "grid gap-3 sm:grid-cols-2" : "users-token-summary"}>
    {[
      { label: S.users.mainTokens, tokens: row.daily_actual_tokens, unknown: row.daily_usage_unknown_calls, reserved: row.daily_reserved_tokens, limit: data.daily_token_limit,
        parts: { calls: row.daily_calls, input: row.daily_input_tokens, output: row.daily_output_tokens, cacheRead: row.daily_cache_read_tokens, cacheWrite: row.daily_cache_write_tokens } },
      { label: S.users.faithmindsTokens, tokens: row.standalone_daily_actual_tokens, unknown: row.standalone_daily_usage_unknown_calls, reserved: row.standalone_daily_reserved_tokens, limit: undefined,
        parts: { calls: row.standalone_daily_calls, input: row.standalone_daily_input_tokens, output: row.standalone_daily_output_tokens, cacheRead: row.standalone_daily_cache_read_tokens, cacheWrite: row.standalone_daily_cache_write_tokens } },
    ].map(({ label, tokens, unknown, reserved, limit, parts }, index) => <div key={index} className={detailed ? "rounded-xl border border-line bg-white p-4" : "users-token-line"}>
      <span className="text-xs text-muted">{t(label)}</span>
      <span className={detailed ? "mt-2 block text-xl font-semibold tabular-nums text-ink" : "font-medium tabular-nums text-ink"} title={tokens == null ? t(S.users.tokensUnavailable) : tokens === 0 ? t(S.users.tokensZero) : t(S.users.actualTokens)}>
        <bdi>{tokens == null ? (detailed ? t(S.users.tokensUnavailable) : "—") : tokens.toLocaleString(lang)}</bdi>
        {!detailed && tokens == null && <span className="sr-only">{t(S.users.tokensUnavailable)}</span>}
        {!!unknown && <span className="users-token-warning" title={`${t(S.users.tokensIncomplete)}: ${unknown.toLocaleString(lang)}`}><CircleAlert className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">{t(S.users.tokensIncomplete)}: {unknown.toLocaleString(lang)}</span></span>}
      </span>
      {detailed && <>
        <p className="mt-1 text-xs text-muted">{t(tokens === 0 ? S.users.tokensZero : S.users.actualTokens)}</p>
        {!!tokens && !!((parts.input ?? 0) + (parts.output ?? 0) + (parts.cacheRead ?? 0) + (parts.cacheWrite ?? 0)) && <dl className="mt-3 space-y-1 text-xs">
          {[{ label: S.users.inputTokens, value: (parts.input ?? 0).toLocaleString(lang) },
            { label: S.users.outputTokens, value: (parts.output ?? 0).toLocaleString(lang) },
            { label: S.users.cacheTokens, value: `${(parts.cacheRead ?? 0).toLocaleString(lang)} / ${(parts.cacheWrite ?? 0).toLocaleString(lang)}` },
            { label: S.users.modelCalls, value: (parts.calls ?? 0).toLocaleString(lang) }].map(({ label, value }, n) => <div key={n} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">{t(label)}</dt>
            <dd className="font-medium tabular-nums text-ink"><bdi>{value}</bdi></dd>
          </div>)}
        </dl>}
        {!!unknown && <p className="mt-2 text-xs text-amber-700">{t(S.users.tokensIncomplete)}: <bdi>{unknown.toLocaleString(lang)}</bdi></p>}
        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">{t(S.users.reservedTokens)}<span className="mt-1 block font-medium tabular-nums text-ink"><bdi>{reserved == null ? t(S.users.tokensUnavailable) : reserved.toLocaleString(lang)}{limit != null && ` / ${limit.toLocaleString(lang)}`}</bdi></span></p>
      </>}
    </div>)}
  </div>;

  if (!isStaff(role) || !user) return <p className="card p-6">{t(S.instructor.restricted)}</p>;
  if (role !== "super_admin" || !user) return <p className="card p-6">{t(S.users.restricted)}</p>;
  if (!apiEnabled) return <p className="card p-6">{t(S.users.unavailable)}</p>;

  const notice = <div ref={toast} popover="manual" role={error ? "alert" : "status"} className={`studio-toast ${error ? "is-error" : "is-success"}`}>
    {error ? <CircleAlert className="h-5 w-5 shrink-0" aria-hidden /> : <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />}
    <div className="min-w-0 flex-1"><p className="font-semibold">{t(error ? S.instructor.actionFailed : S.instructor.actionSuccess)}</p><p className="mt-1 text-sm break-words">{error || message}</p></div>
    <button type="button" className="btn btn-ghost !p-2" aria-label={t(S.instructor.closeModal)} onClick={() => { setError(null); setMessage(null); }}><X className="h-4 w-4" aria-hidden /></button>
  </div>;

  return <div className="studio-workspace space-y-6">
    <PageBanner title={t(S.users.title)} sub={t(S.users.sub)} />
    {!preview && notice}
    <dialog ref={confirmDialog} className="card studio-dialog studio-confirm" aria-labelledby="users-confirm-title" aria-describedby="users-confirm-description"
      onClose={() => setConfirmation(null)} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className={`studio-confirm-icon shrink-0 ${confirmation && !confirmation.toRole ? "is-danger" : ""}`}><CircleAlert className="h-5 w-5" aria-hidden /></span>
          <h2 id="users-confirm-title" className="min-w-0 flex-1 break-words font-serif text-2xl">{confirmation?.label}</h2>
          <button type="button" className="btn btn-ghost btn-close !p-2" aria-label={t(S.instructor.closeModal)} onClick={() => confirmDialog.current?.close()}><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <p id="users-confirm-description" className="mt-4 text-sm leading-relaxed text-ink-soft">{confirmation?.description}</p>
        {confirmation && <div className="mt-5 rounded-2xl bg-sky-50 p-4">
          <div className="flex items-center gap-3">
            <span className="studio-lesson-thumb bg-white font-semibold text-brand-700" aria-hidden>{initials(confirmation.row)}</span>
            <div className="min-w-0"><p className="break-words font-medium text-ink">{nameOf(confirmation.row)}</p>
              <p className="break-all text-sm text-muted"><bdi>{confirmation.row.email}</bdi></p></div>
          </div>
          {confirmation.toRole && <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className={`chip studio-status status-${confirmation.row.role}`}>{t(S.users.roles[confirmation.row.role])}</span>
            <span aria-hidden className="text-muted rtl:-scale-x-100">{" → "}</span>
            <span className={`chip studio-status status-${confirmation.toRole}`}>{t(S.users.roles[confirmation.toRole])}</span>
          </p>}
        </div>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" autoFocus className="btn btn-ghost" onClick={() => confirmDialog.current?.close()}>{t(S.instructor.closeForm)}</button>
          <button type="button" className={`btn ${confirmation?.toRole ? "btn-primary" : "btn-tint-danger"}`} disabled={!confirmation || busy} onClick={() => {
            if (!confirmation) return;
            confirmDialog.current?.close(); void action(confirmation.operation, confirmation.success);
          }}>{confirmation?.label}</button>
        </div>
      </div>
    </dialog>
    <dialog ref={dialog} className="card studio-dialog" aria-labelledby="users-detail-title"
      onClose={() => { historyRequest.current++; setPreview(null); }} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      {preview && notice}
      <header className="flex items-start justify-between gap-4 border-b border-line p-6">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-lg font-semibold text-brand-700" aria-hidden>{preview && initials(preview)}</span>
          <div className="min-w-0">
            <h2 id="users-detail-title" className="break-words font-serif text-2xl leading-tight">{preview && nameOf(preview)}</h2>
            {/* bdi: the address reads left to right, but lines up with the name in Arabic. */}
            <p className="mt-1 break-all text-sm text-muted"><bdi>{preview?.email}</bdi></p>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-close !p-2" aria-label={t(S.instructor.closeModal)} onClick={() => dialog.current?.close()}><X className="h-5 w-5" aria-hidden /></button>
      </header>
      {preview && <>
        <div className="space-y-5 p-6">
          <div className="flex flex-wrap gap-2">
            <span className={`chip studio-status status-${preview.role}`}>{t(S.users.roles[preview.role])}</span>
            <span className={`chip studio-status status-${preview.disabled ? "disabled" : "active"}`}>{t(S.users.status[preview.disabled ? "disabled" : "active"])}</span>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl bg-sky-50 p-4"><dt className="flex items-center gap-2 text-xs text-muted"><CalendarDays className="h-4 w-4 text-brand-500" aria-hidden />{t(S.users.joined)}</dt><dd className="mt-1.5 font-medium text-ink"><time dateTime={preview.created_at}>{date(preview.created_at)}</time></dd></div>
            <div className="rounded-2xl bg-sky-50 p-4"><dt className="flex items-center gap-2 text-xs text-muted"><Clock className="h-4 w-4 text-brand-500" aria-hidden />{t(S.users.lastSignIn)}</dt><dd className="mt-1.5 font-medium text-ink">{preview.last_sign_in_at ? <time dateTime={preview.last_sign_in_at}>{new Date(preview.last_sign_in_at).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" })}</time> : t(S.users.neverSignedIn)}</dd></div>
            <div className="rounded-2xl bg-sky-50 p-4 sm:col-span-2"><dt className="text-xs text-muted">{t(S.users.dailyTokens)}</dt><dd className="mt-3">{tokenUsage(preview, true)}</dd><dd className="mt-3 text-xs leading-relaxed text-muted">{t(S.users.tokensHint)}</dd></div>
          </dl>
        </div>
        <section aria-labelledby="users-history-title" className="studio-history mx-6 mb-6 border-t border-line pt-6">
          <h3 id="users-history-title" className="flex items-center gap-2 font-serif text-xl"><History className="h-5 w-5 text-brand-600" aria-hidden />{t(S.instructor.history)}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t(S.users.historyHint)}</p>
          {historyState === "loading" && <p role="status" className="mt-4 text-sm text-muted">{t(S.instructor.historyLoading)}</p>}
          {historyState === "error" && <div role="alert" className="mt-4 text-sm text-muted"><p>{t(S.instructor.historyError)}</p><button type="button" className="mt-2 underline" onClick={() => void loadHistory(preview.id)}>{t(S.instructor.retry)}</button></div>}
          {historyState === "ready" && (!history.length ? <p className="mt-4 rounded-xl bg-brand-50/50 p-4 text-sm text-muted">{t(S.instructor.historyEmpty)}</p> :
            <ol className="studio-timeline mt-5">{history.map((event) => <li key={event.id}>
              <span className="studio-timeline-dot" aria-hidden />
              <p className="text-sm break-words">{t(S.users.events[event.kind as keyof typeof S.users.events] ?? S.users.events.other)} <span className="font-medium" title={event.actor_id ?? undefined}>{event.actor_name || event.actor_email || t(S.instructor.unknownActor)}</span></p>
              <time dateTime={event.created_at} className="mt-1 block text-xs text-muted">{new Date(event.created_at).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" })}</time>
              {event.payload.from_role && event.payload.to_role && <p className="mt-2 text-sm text-ink-soft">{t(S.users.roles[event.payload.from_role])} <span aria-hidden>→</span> {t(S.users.roles[event.payload.to_role])}</p>}
            </li>)}</ol>)}
        </section>
      </>}
    </dialog>
    <section aria-label={t(S.users.overview)} className="studio-metrics">
      {METRICS.map((metric) => {
        const Icon = METRIC_ICONS[metric];
        const pressed = metric === "total" ? roleFilter === "all" && statusFilter === "all" : metric === "disabled" ? statusFilter === "disabled" : roleFilter === metric;
        return <button type="button" key={metric} className={`card studio-metric metric-${metric}`} aria-pressed={pressed} onClick={() => {
          setRoleFilter(metric === "total" || metric === "disabled" ? "all" : metric);
          setStatusFilter(metric === "disabled" ? "disabled" : "all");
          setPage(1);
        }}>
          <span className="studio-metric-icon"><Icon className="h-5 w-5" aria-hidden /></span>
          <span className="min-w-0"><span className="studio-metric-count">{data.counts[metric]}</span><span className="studio-metric-label">{t(METRIC_LABELS[metric])}</span></span>
        </button>;
      })}
    </section>
    <section className="card studio-lessons p-4 sm:p-6" aria-busy={loading || busy}>
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="font-serif text-2xl">{t(S.users.results)}</h2><p className="mt-2 text-xs leading-relaxed text-muted">{t(S.users.tokensSummaryHint)}</p></div>
        <button type="button" className="btn btn-ghost !p-2" disabled={loading || busy} aria-label={t(S.users.refresh)} title={t(S.users.refresh)} onClick={() => setRevision((value) => value + 1)}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden /></button>
      </div>
      <div className="studio-filters studio-filters-users mt-5">
        <label className="studio-search"><span className="studio-field-label">{t(S.users.searchLabel)}</span><span className="relative block">
          <Search className="studio-search-icon h-4 w-4 text-muted" aria-hidden />
          <input type="search" className="input" placeholder={t(S.users.searchPlaceholder)} value={search} onChange={(event) => setSearch(event.target.value)} />
          {search && <button type="button" className="studio-search-clear" aria-label={t(S.instructor.clearSearch)} onClick={() => setSearch("")}><X className="h-4 w-4" aria-hidden /></button>}
        </span></label>
        <Select label={t(S.users.role)} value={roleFilter} options={[{ value: "all", label: t(S.users.allRoles) }, ...roleOptions]} onChange={(value) => { setRoleFilter(value as typeof roleFilter); setPage(1); }} />
        <Select label={t(S.instructor.statusFilter)} value={statusFilter} options={[{ value: "all", label: t(S.instructor.allStatuses) }, ...(["active", "disabled"] as const).map((value) => ({ value, label: t(S.users.status[value]) }))]} onChange={(value) => { setStatusFilter(value as typeof statusFilter); setPage(1); }} />
        <button type="button" className="btn btn-ghost studio-reset" aria-label={t(S.instructor.resetFilters)} title={t(S.instructor.resetFilters)} onClick={resetFilters}><RotateCcw className="h-4 w-4" aria-hidden /></button>
      </div>
      <p role="status" className="mt-4 text-xs text-muted">{loading ? t(S.users.loading) : `${t(S.users.showing)} ${data.items.length ? first + 1 : 0}${data.items.length > 1 ? `–${first + data.items.length}` : ""} ${t(S.instructor.pageOf)} ${data.total}`}</p>
      {!!data.items.length && <table className="studio-table users-table mt-4">
        <thead><tr><th scope="col">{t(S.users.user)}</th><th scope="col">{t(S.users.role)}</th><th scope="col">{t(S.instructor.statusFilter)}</th><th scope="col">{t(S.users.dailyTokens)}</th><th scope="col">{t(S.users.joined)}</th><th scope="col">{t(S.instructor.colActions)}</th></tr></thead>
        <tbody className="divide-y divide-line">{data.items.map((row) => {
          const self = row.id === user.id;
          return <tr key={row.id} className="studio-lesson-row">
            <td><div className="flex items-center gap-3"><span className="studio-lesson-thumb bg-brand-50 text-brand-700" aria-hidden>{initials(row)}</span>
              <div className="min-w-0"><div className="flex items-center gap-2"><button type="button" className="studio-lesson-title block max-w-full truncate text-start" title={nameOf(row)} aria-haspopup="dialog" onClick={() => openUser(row)}>{nameOf(row)}</button>{self && <span className="studio-lang shrink-0">{t(S.users.you)}</span>}</div>
                <p className="mt-1 truncate text-xs text-muted" dir="ltr" title={row.email ?? undefined}>{row.email}</p></div>
            </div></td>
            <td><Select compact label={t(S.users.roles[row.role])} value={row.role} options={roleOptions} disabled={self || busy || loading} onChange={(value) => {
              if (value === row.role) return;
              confirm({ row, toRole: value as Role, label: t(S.users.changeRole), description: t(S.users.roleConfirm), operation: () => changeUserRole(row.id, value as Role), success: t(S.users.saved) });
            }} /></td>
            <td><span className={`chip studio-status status-${row.disabled ? "disabled" : "active"}`}>{t(S.users.status[row.disabled ? "disabled" : "active"])}</span></td>
            <td className="users-token-cell"><button type="button" className="users-token-button" aria-label={`${t(S.users.usageDetails)}: ${nameOf(row)}`} aria-haspopup="dialog" onClick={() => openUser(row)}>{tokenUsage(row)}</button></td>
            <td><time dateTime={row.created_at}>{date(row.created_at)}</time></td>
            <td><div className="flex justify-end gap-2"><button type="button" className={`btn ${row.disabled ? "btn-tint-brand" : "btn-tint-danger"}`} disabled={self || busy || loading} title={self ? t(S.users.self) : undefined} aria-label={`${t(row.disabled ? S.users.enable : S.users.disable)}: ${nameOf(row)}`} onClick={() => {
              if (row.disabled) void action(() => setUserDisabled(row.id, false), t(S.users.enabled));
              else confirm({ row, label: t(S.users.disable), description: t(S.users.disableConfirm), operation: () => setUserDisabled(row.id, true), success: t(S.users.disabled) });
            }}>{t(row.disabled ? S.users.enable : S.users.disable)}</button></div></td>
          </tr>;
        })}</tbody>
      </table>}
      {!loading && !data.items.length && <div className="studio-empty"><Search className="mx-auto h-7 w-7 text-brand-400" aria-hidden />
        <p className="mt-3 font-medium">{t(S.users.empty)}</p><p className="mt-1 text-sm text-muted">{t(S.users.emptyHint)}</p>
        <button type="button" className="btn btn-ghost mt-4 text-sm" onClick={resetFilters}>{t(S.instructor.resetFilters)}</button>
      </div>}
      <footer className="studio-pagination mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
        <Select label={t(S.users.perPage)} value={String(pageSize)} options={[10, 20, 50].map((size) => ({ value: String(size), label: String(size) }))} onChange={(value) => { setPageSize(Number(value)); setPage(1); }} />
        <nav aria-label={t(S.users.pagination)} className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-ghost" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}>{t(S.instructor.previousPage)}</button>
          <span className="text-sm text-muted">{t(S.instructor.page)} {page} {t(S.instructor.pageOf)} {totalPages}</span>
          <button type="button" className="btn btn-ghost" disabled={page >= totalPages || loading} onClick={() => setPage(page + 1)}>{t(S.instructor.nextPage)}</button>
        </nav>
      </footer>
    </section>
  </div>;
}
