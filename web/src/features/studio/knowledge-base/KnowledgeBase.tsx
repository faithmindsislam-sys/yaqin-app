"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { BarChart3, CheckCircle2, ChevronRight, CircleAlert, Eye, FileText, Info, LibraryBig, LoaderCircle, Plus, Power, RefreshCw, Search, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageBanner } from "@/components/Scenery";
import { Select } from "@/components/Select";
import { AddResource } from "@/features/studio/knowledge-base/AddResource";
import { apiEnabled } from "@/lib/http";
import { deleteResource, knowledgeResources, knowledgeStatus, saveResourceMetadata, testKnowledgeRetrieval, toggleResources } from "@/features/studio/knowledge-base/api";
import { eligibleResource, fileType, KB_STATUSES, pendingResource, STATUS_COUNT, resourceLabel, type Passage, type Resource, type ResourceStatistics } from "@/features/studio/knowledge-base/model";
import { K } from "@/features/studio/knowledge-base/strings";
import { useI18n } from "@/lib/i18n";
import { canReview } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import "./knowledge-base.css";

const STATUS_STYLE = { WAITING_UPLOAD: "archived", PENDING: "draft", IN_PROGRESS: "in_review", COMPLETED: "published", FAILED: "failed" };
const TABS = ["resources", "retrieval", "statistics"] as const;
const TAB_ICONS = { resources: LibraryBig, retrieval: Search, statistics: BarChart3 };
type Tab = typeof TABS[number];

export default function KnowledgeBasePage() {
  const { t } = useI18n();
  return <AppShell title={t(K.title)} sub={t(K.description)}><Access /></AppShell>;
}

function Access() {
  const { t } = useI18n();
  const { user, role } = useSession();
  if (!user || !canReview(role)) return <p className="card p-6">{t(K.restricted)}</p>;
  if (!apiEnabled) return <p className="card p-6">{t(K.unavailable)}</p>;
  return <KnowledgeBase key={user.id} />;
}

function KnowledgeBase() {
  const { t, lang, dir } = useI18n();
  const [tab, setTab] = useState<Tab>("resources");
  const [rows, setRows] = useState<Resource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<ResourceStatistics | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ replacement?: string } | null>(null);
  const [detail, setDetail] = useState<Resource | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [metadataDraft, setMetadataDraft] = useState({ title: "", description: "" });
  const [deleting, setDeleting] = useState<Resource | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("");
  const [scopeResource, setScopeResource] = useState<Resource | null>(null);
  const [retrieving, setRetrieving] = useState(false);
  const [result, setResult] = useState<{ passages: Passage[]; eligibleResourceCount: number } | null>(null);
  const [retrievalError, setRetrievalError] = useState<string | null>(null);
  const listRequest = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const retrievalRequest = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    if (search.trim() === searchQuery) return;
    const timer = setTimeout(() => { setSearchQuery(search.trim()); setPage(1); setSelected([]); setScope(""); }, 300);
    return () => clearTimeout(timer);
  }, [search, searchQuery]);

  const load = useCallback(async () => {
    listRequest.current?.abort();
    retrievalRequest.current?.abort(); setRetrieving(false); setResult(null); setRetrievalError(null);
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true); setLoaded(false); setRows([]); setCounts(null); setError(null);
    try {
      const data = await knowledgeResources({ page, page_size: pageSize, q: searchQuery, ...(status !== "all" ? { status } : {}) }, controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      const lastPage = Math.max(1, Math.ceil(data.total / pageSize));
      if (page > lastPage) { setPage(lastPage); return; }
      setRows(data.resources); setTotal(data.total); setCounts(data.statistics ?? null); setLoaded(true);
      setSelected((ids) => ids.filter((id) => data.resources.some((row) => row.documentId === id)));
    } catch (e) { if (!controller.signal.aborted && mounted.current) setError(e instanceof Error ? e.message : t(K.unavailable)); }
    finally { if (!controller.signal.aborted && mounted.current) setLoading(false); }
  }, [page, pageSize, searchQuery, status, t]);

  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetches the selected page and server filters.
    void load();
    return () => { mounted.current = false; listRequest.current?.abort(); detailRequest.current?.abort(); retrievalRequest.current?.abort(); };
  }, [load]);

  const pendingIds = rows.filter(pendingResource).map((row) => row.documentId).join(",");
  const pendingDetailId = detail && pendingResource(detail) ? detail.documentId : "";
  const pendingStatistics = tab === "statistics" && !!counts && counts.waiting + counts.queued + counts.processing > 0;
  useEffect(() => {
    if ((!pendingIds && !pendingDetailId && !pendingStatistics) || busy || loading) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      // Poll only the current page and an open pending resource.
      const updates = await Promise.allSettled([
        knowledgeResources({ page, page_size: pageSize, q: searchQuery, ...(status !== "all" ? { status } : {}) }, controller.signal),
        pendingDetailId ? knowledgeStatus(pendingDetailId, controller.signal) : Promise.resolve(null),
      ]);
      if (controller.signal.aborted) return;
      const resourceUpdate = updates[0].status === "fulfilled" ? updates[0].value.resources : null;
      const detailUpdate = updates[1].status === "fulfilled" ? updates[1].value : null;
      if (resourceUpdate) {
        const data = updates[0].status === "fulfilled" ? updates[0].value : null;
        if (data) {
          setTotal(data.total);
          setCounts(data.statistics ?? null);
          const lastPage = Math.max(1, Math.ceil(data.total / pageSize));
          if (page > lastPage) { setPage(lastPage); return; }
        }
        setRows((current) => resourceUpdate.map((row) => ({ ...current.find((item) => item.documentId === row.documentId), ...row })));
        setSelected((current) => current.filter((id) => resourceUpdate.some((row) => row.documentId === id)));
      }
      if (detailUpdate) {
        setDetail((current) => current?.documentId === detailUpdate.documentId ? detailUpdate : current);
        setRows((current) => current.map((row) => row.documentId === detailUpdate.documentId ? detailUpdate : row));
      }
      if (updates.some((update) => update.status === "rejected")) setError(t(K.unavailable));
      const health = updates[0].status === "fulfilled" ? updates[0].value.statistics : null;
      if (!resourceUpdate || resourceUpdate.some(pendingResource) || (pendingStatistics && (!health || health.waiting + health.queued + health.processing > 0)) || (pendingDetailId && (!detailUpdate || pendingResource(detailUpdate)))) timer = setTimeout(() => void poll(), 8000);
    }
    timer = setTimeout(() => void poll(), 8000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [pendingIds, pendingDetailId, pendingStatistics, busy, loading, page, pageSize, searchQuery, status, t]);

  async function openDetails(row: Resource) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setDetail(row); setDetailLoading(true); setDetailError(null); dialog.current?.showModal();
    setMetadataDraft({ title: row.title ?? "", description: row.description ?? "" });
    try {
      const current = await knowledgeStatus(row.documentId, controller.signal);
      if (!controller.signal.aborted && mounted.current) {
        setDetail(current); setRows((list) => list.map((item) => item.documentId === current.documentId ? current : item));
        setMetadataDraft({ title: current.title ?? "", description: current.description ?? "" });
      }
    } catch (e) { if (!controller.signal.aborted && mounted.current) setDetailError(e instanceof Error ? e.message : t(K.unavailable)); }
    finally { if (!controller.signal.aborted && mounted.current) setDetailLoading(false); }
  }

  async function toggle(ids: string[], enabled: boolean) {
    if (busy || !ids.length) return;
    setBusy(true); setError(null); setMessage(null);
    listRequest.current?.abort(); detailRequest.current?.abort();
    retrievalRequest.current?.abort(); setRetrieving(false); setResult(null); setDetailLoading(false);
    try {
      const result = await toggleResources(ids, enabled);
      if (!mounted.current) return;
      const confirmed = result.documentIds.filter((id) => ids.includes(id));
      const partial = result.updated !== new Set(ids).size || result.enabled !== enabled || confirmed.length !== new Set(ids).size;
      if (!partial) {
        setRows((current) => current.map((row) => ids.includes(row.documentId) ? { ...row, enabled } : row));
        setDetail((current) => current && ids.includes(current.documentId) ? { ...current, enabled } : current);
        setScopeResource((current) => current && ids.includes(current.documentId) ? { ...current, enabled } : current);
      }
      // Read the server after every toggle; legacy APIs echo requested IDs even on partial updates.
      await load();
      if (!mounted.current) return;
      if (detail && ids.includes(detail.documentId)) await openDetails(detail);
      if (partial) setError(t(K.partial));
      else { setSelected((current) => current.filter((id) => !ids.includes(id))); setMessage(t(K.updated)); }
      setResult(null);
    } catch (e) {
      if (mounted.current) { await load(); setError(e instanceof Error ? e.message : t(K.unavailable)); }
    } finally { if (mounted.current) setBusy(false); }
  }

  function confirmDelete(row: Resource) {
    if (busy) return;
    dialog.current?.close();
    setDeleting(row); setDeleteError(null); deleteDialog.current?.showModal();
  }

  async function removeResource() {
    if (!deleting || busy) return;
    const id = deleting.documentId;
    setBusy(true); setDeleteError(null); setMessage(null);
    listRequest.current?.abort(); detailRequest.current?.abort(); retrievalRequest.current?.abort();
    setRetrieving(false); setResult(null);
    try {
      const result = await deleteResource(id);
      if (!mounted.current) return;
      if (result.documentId !== id || result.deleted !== true) throw new Error(t(K.unavailable));
      setRows((current) => current.filter((row) => row.documentId !== id));
      setSelected((current) => current.filter((selectedId) => selectedId !== id));
      if (scope === id) { setScope(""); setScopeResource(null); }
      setDetail((current) => current?.documentId === id ? null : current);
      deleteDialog.current?.close();
      await load();
      if (mounted.current) setMessage(t(K.deleted));
    } catch (e) {
      if (mounted.current) { await load(); setDeleteError(e instanceof Error ? e.message : t(K.unavailable)); }
    } finally { if (mounted.current) setBusy(false); }
  }

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!detail || busy || detailLoading) return;
    const id = detail.documentId;
    setBusy(true); setDetailError(null);
    try {
      const updated = await saveResourceMetadata(id, metadataDraft);
      if (!mounted.current) return;
      setDetail((current) => current?.documentId === id ? updated : current);
      setScopeResource((current) => current?.documentId === id ? updated : current);
      setMetadataDraft({ title: updated.title ?? "", description: updated.description ?? "" });
      setMessage(t(K.metadataSaved));
      await load();
    } catch (e) { if (mounted.current) setDetailError(e instanceof Error ? e.message : t(K.unavailable)); }
    finally { if (mounted.current) setBusy(false); }
  }

  function tabKey(event: KeyboardEvent<HTMLButtonElement>, current: Tab) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = TABS.indexOf(current);
    const step = (event.key === "ArrowRight" ? 1 : -1) * (dir === "rtl" ? -1 : 1);
    const next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + step + TABS.length) % TABS.length;
    setTab(TABS[next]);
    if (TABS[next] === "statistics") void load();
    document.getElementById(`kb-tab-${TABS[next]}`)?.focus();
    if (TABS[next] !== "retrieval") { retrievalRequest.current?.abort(); setRetrieving(false); }
  }

  function changeRetrievalInput(change: () => void) {
    retrievalRequest.current?.abort(); setRetrieving(false); setResult(null); setRetrievalError(null); change();
  }

  async function retrieve() {
    retrievalRequest.current?.abort();
    const controller = new AbortController();
    retrievalRequest.current = controller;
    setRetrieving(true); setResult(null); setRetrievalError(null);
    try {
      const result = await testKnowledgeRetrieval(query.trim(), scope || undefined, controller.signal);
      if (!controller.signal.aborted && mounted.current) setResult(result);
    } catch (e) { if (!controller.signal.aborted && mounted.current) setRetrievalError(e instanceof Error ? e.message : t(K.unavailable)); }
    finally { if (!controller.signal.aborted && mounted.current) setRetrieving(false); }
  }

  const filtered = rows;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const eligible = rows.filter(eligibleResource);
  if (scopeResource?.documentId === scope && eligibleResource(scopeResource) && !rows.some((row) => row.documentId === scope)) eligible.push(scopeResource);
  const allSelected = !!filtered.length && filtered.every((row) => selected.includes(row.documentId));
  const unavailable = t(K.unavailableMetric);
  const date = (value?: string | null) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" }) : unavailable;
  const statusChip = (row: Resource) => <span className={`chip studio-status status-${STATUS_STYLE[row.status] ?? "archived"}`}>{t(K.statuses[row.status]) || row.status}</span>;
  const closeDetail = () => { detailRequest.current?.abort(); setDetail(null); setDetailLoading(false); setDetailError(null); };

  return <div className="studio-workspace kb-workspace space-y-6">
    <PageBanner title={t(K.title)} sub={t(K.description)} />
    {error && <div role="alert" className="kb-notice is-error"><CircleAlert className="h-5 w-5 shrink-0" aria-hidden /><p className="min-w-0 flex-1 break-words">{error}</p>
      <button className="underline" disabled={busy || loading} onClick={() => void load()}>{t(K.refresh)}</button></div>}
    {message && <div role="status" className="kb-notice"><CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /><p className="flex-1">{message}</p>
      <button aria-label={t(K.close)} onClick={() => setMessage(null)}><X className="h-4 w-4" aria-hidden /></button></div>}
    <div className="kb-toolbar">
    <div role="tablist" aria-label={t(K.title)} className="kb-tabs">{TABS.map((value) => { const Icon = TAB_ICONS[value]; return <button key={value} type="button" role="tab" id={`kb-tab-${value}`} aria-controls={`kb-panel-${value}`}
      aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onKeyDown={(event) => tabKey(event, value)}
      onClick={() => { setTab(value); if (value === "statistics") void load(); if (value !== "retrieval") { retrievalRequest.current?.abort(); setRetrieving(false); } }}><Icon className="h-4 w-4" aria-hidden />{t(K.tabs[value])}</button>; })}</div>
      <button className="btn btn-primary" onClick={() => setAdding({})}><Plus className="h-4 w-4" aria-hidden />{t(K.add)}</button>
    </div>

    <section role="tabpanel" id="kb-panel-resources" aria-labelledby="kb-tab-resources" hidden={tab !== "resources"} className="card kb-resource-panel p-4 sm:p-6" aria-busy={loading || busy}>
      <div className="kb-panel-heading"><div><h2>{t(K.tabs.resources)} {loaded && <span className="kb-count">{total.toLocaleString(lang)}</span>}</h2><p>{t(K.libraryHint)}</p></div>
        <button className="btn btn-ghost kb-refresh" aria-label={t(K.refresh)} title={t(K.refresh)} disabled={loading || busy} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden /><span>{t(K.refresh)}</span></button></div>
      <div className="studio-filters kb-filters mt-5">
        <label className="studio-search"><span className="studio-field-label">{t(K.search)}</span><span className="relative block"><Search className="studio-search-icon h-4 w-4 text-muted" aria-hidden />
          <input type="search" className="input" placeholder={t(K.searchPlaceholder)} maxLength={200} disabled={busy} value={search} onChange={(event) => setSearch(event.target.value)} /></span></label>
        <Select label={t(K.status)} value={status} disabled={busy} options={[{ value: "all", label: t(K.allStatuses) }, ...KB_STATUSES.map((value) => ({ value, label: t(K.statuses[value]) }))]}
          onChange={(value) => { setStatus(value); setPage(1); setSelected([]); setScope(""); }} />
      </div>
      {(search || status !== "all") && <button className="kb-clear-filters" disabled={busy} onClick={() => { setSearch(""); setSearchQuery(""); setStatus("all"); setPage(1); setSelected([]); setScope(""); }}><X className="h-3.5 w-3.5" aria-hidden />{t(K.resetFilters)}</button>}
      {!loading && !!selected.length && <div className="kb-batch mt-4"><span className="text-sm">{selected.length} {t(K.selected)}</span>
        <button className="btn btn-tint-brand" disabled={busy} onClick={() => void toggle(selected, true)}>{t(K.enableSelected)}</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => void toggle(selected, false)}>{t(K.disableSelected)}</button>
        <button className="text-sm underline" disabled={busy} onClick={() => setSelected([])}>{t(K.clearSelection)}</button></div>}
      {loading && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{t(K.loading)}</p>}
      {!loading && !!filtered.length && <table className="studio-table kb-table mt-4">
        <colgroup><col className="kb-col-check" /><col /><col className="kb-col-status" /><col className="kb-col-retrieval" /><col className="kb-col-actions" /></colgroup>
        <thead><tr><th><input type="checkbox" aria-label={t(K.selectAll)} checked={allSelected} disabled={busy}
          ref={(input) => { if (input) input.indeterminate = !allSelected && filtered.some((row) => selected.includes(row.documentId)); }}
          onChange={(event) => setSelected((current) => event.target.checked ? Array.from(new Set([...current, ...filtered.map((row) => row.documentId)])) : current.filter((id) => !filtered.some((row) => row.documentId === id)))} /></th>
          <th>{t(K.filename)}</th><th>{t(K.status)}</th><th>{t(K.retrievalState)}</th><th>{t(K.actions)}</th></tr></thead>
        <tbody>{filtered.map((row) => <tr key={row.documentId} className={`studio-lesson-row ${selected.includes(row.documentId) ? "is-selected" : ""}`}>
          <td><input type="checkbox" aria-label={`${t(K.select)}: ${row.filename}`} checked={selected.includes(row.documentId)} disabled={busy}
            onChange={(event) => setSelected((current) => event.target.checked ? [...current, row.documentId] : current.filter((id) => id !== row.documentId))} /></td>
          <td><div className="flex min-w-0 items-center gap-3"><span className="studio-lesson-thumb bg-brand-50 text-brand-700"><FileText className="h-5 w-5" aria-hidden /></span>
            <div className="min-w-0"><button className="studio-lesson-title block max-w-full truncate text-start" aria-haspopup="dialog" disabled={busy} title={resourceLabel(row)} onClick={() => void openDetails(row)}><bdi>{resourceLabel(row)}</bdi></button>
              {row.description && row.description !== resourceLabel(row) && <p dir="auto" className="mt-1 truncate text-xs text-muted" title={row.description}>{row.description}</p>}
              <span className="studio-lang mt-1 inline-block">{fileType(row.filename).toUpperCase()}{row.pages != null && row.pages > 0 && ` · ${row.pages.toLocaleString(lang)} ${t(K.pagesUnit)}`}</span></div></div></td>
          <td>{statusChip(row)}</td><td><span className={`chip studio-status status-${row.enabled ? "active" : "disabled"}`}>{t(row.enabled ? K.enabled : K.disabled)}</span></td>
          <td><div className="kb-row-actions"><button className="btn btn-ghost tip" data-tip={t(K.details)} aria-label={`${t(K.details)}: ${resourceLabel(row)}`} aria-haspopup="dialog" disabled={busy} onClick={() => void openDetails(row)}><Eye className="h-4 w-4" aria-hidden /><span className="kb-action-label">{t(K.details)}</span></button>
            <button className="btn btn-tint-brand tip" data-tip={t(row.enabled ? K.disable : K.enable)} aria-label={`${t(row.enabled ? K.disable : K.enable)}: ${row.filename}`} disabled={busy} onClick={() => void toggle([row.documentId], !row.enabled)}><Power className="h-4 w-4" aria-hidden /><span className="kb-action-label">{t(busy ? K.updating : row.enabled ? K.disable : K.enable)}</span></button>
            <button className="btn btn-tint-danger tip" data-tip={t(K.delete)} aria-label={`${t(K.delete)}: ${resourceLabel(row)}`} aria-haspopup="dialog" disabled={busy} onClick={() => confirmDelete(row)}><Trash2 className="h-4 w-4" aria-hidden /><span className="kb-action-label">{t(K.delete)}</span></button></div></td>
        </tr>)}</tbody>
      </table>}
      {!loading && loaded && !filtered.length && <div className="studio-empty"><LibraryBig className="mx-auto h-8 w-8 text-brand-400" aria-hidden />
        <p className="mt-3 font-medium">{t(searchQuery || status !== "all" ? K.noResults : K.empty)}</p><p className="mt-1 text-sm text-muted">{t(searchQuery || status !== "all" ? K.noResultsHint : K.emptyHint)}</p>
        {!searchQuery && status === "all" && <button className="btn btn-ghost mt-4" onClick={() => setAdding({})}>{t(K.add)}</button>}</div>}
      {loaded && <footer className="studio-pagination mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
        <Select label={t(K.pageSize)} value={String(pageSize)} disabled={loading || busy} options={[25, 50, 100].map((value) => ({ value: String(value), label: value.toLocaleString(lang) }))}
          onChange={(value) => { setPageSize(Number(value)); setPage(1); setSelected([]); setScope(""); }} />
        <nav aria-label={t(K.pagination)} className="flex flex-wrap items-center gap-3">
          <button className="btn btn-ghost" disabled={loading || busy || page <= 1} onClick={() => { setPage((value) => value - 1); setSelected([]); setScope(""); }}>{t(K.previous)}</button>
          <span aria-live="polite" className="text-sm text-muted">{t(K.page)} {page.toLocaleString(lang)} {t(K.of)} {totalPages.toLocaleString(lang)}</span>
          <button className="btn btn-ghost" disabled={loading || busy || page >= totalPages} onClick={() => { setPage((value) => value + 1); setSelected([]); setScope(""); }}>{t(K.next)}</button>
        </nav>
      </footer>}
      <p className="mt-5 border-t border-line pt-4 text-xs text-muted">{t(K.loadedHint)}</p>
    </section>

    <section role="tabpanel" id="kb-panel-retrieval" aria-labelledby="kb-tab-retrieval" hidden={tab !== "retrieval"} className="kb-retrieval-panel">
      <div className="kb-panel-heading"><div><h2>{t(K.tabs.retrieval)}</h2><p>{t(K.retrievalIntro)}</p></div></div>
      {loading && !loaded ? <p role="status">{t(K.loading)}</p> : !loaded ? <p role="alert">{t(K.unavailable)}</p> : <>
        <div className="kb-retrieval-grid"><form className="card kb-query-form space-y-4" onSubmit={(event) => { event.preventDefault(); void retrieve(); }}>
          <label className="block"><span className="studio-field-label">{t(K.query)}</span><textarea className="input" placeholder={t(K.queryPlaceholder)} dir="auto" required maxLength={1000} value={query} onChange={(event) => changeRetrievalInput(() => setQuery(event.target.value))} /></label>
          <Select label={t(K.scope)} value={scope} options={[{ value: "", label: t(K.allEligible) }, ...eligible.map((row) => ({ value: row.documentId, label: resourceLabel(row) }))]}
            onChange={(value) => changeRetrievalInput(() => { setScope(value); setScopeResource(eligible.find((row) => row.documentId === value) ?? null); })} />
          <p className="text-xs text-muted">{t(K.scopeHint)}</p>
          {scope && !eligible.some((row) => row.documentId === scope) && <p role="alert" className="text-sm text-rose">{t(K.noEligibleHint)}</p>}
          <button className="btn btn-primary" disabled={retrieving || !query.trim() || (!!scope && !eligible.some((row) => row.documentId === scope))}>
            {retrieving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}{t(retrieving ? K.searching : K.run)}</button>
        </form>
        <div className="card kb-results" aria-busy={retrieving}>
        <div className="kb-results-heading"><h3>{t(K.passages)}</h3>{result && <span className="kb-count">{result.passages.length.toLocaleString(lang)}</span>}</div>
        <p className="kb-relevance-hint"><Info className="h-4 w-4 shrink-0" aria-hidden />{t(K.relevanceHint)}</p>
        {retrieving && <p role="status" className="text-sm text-muted">{t(K.searching)}</p>}
        {retrievalError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-rose">{retrievalError}</p>}
        {!result && !retrieving && !retrievalError && <div className="kb-retrieval-empty"><span className="kb-empty-icon"><Search className="h-7 w-7" aria-hidden /></span><p>{t(K.retrievalStart)}</p></div>}
        {result && !result.passages.length && <p role="status" className="rounded-xl bg-sky-50 p-4 text-sm">{t(result.eligibleResourceCount ? K.noMatches : K.noEligibleHint)}</p>}
        {result?.passages.map((passage) => <article key={passage.id} className="kb-passage">
          <div className="flex flex-wrap items-start justify-between gap-3"><button className="studio-lesson-title text-start" aria-haspopup="dialog" onClick={() => {
            const row = rows.find((item) => item.documentId === passage.documentId);
            void openDetails(row ?? { documentId: passage.documentId, resourceId: passage.resourceId, filename: passage.filename, status: "COMPLETED", enabled: true });
          }}><bdi>{resourceLabel(passage)}</bdi></button><span className="chip text-xs">{t(K.relevance)}: <bdi>{passage.score.toFixed(3)}</bdi></span></div>
          {passage.pageStart != null && passage.pageEnd != null && <p className="mt-2 text-xs text-muted">{t(K.pdfPage)} {passage.pageStart === passage.pageEnd ? passage.pageStart : `${passage.pageStart}–${passage.pageEnd}`}</p>}
          <p dir="auto" className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">{passage.text}</p>
        </article>)}
        </div></div>
      </>}
    </section>

    <section role="tabpanel" id="kb-panel-statistics" aria-labelledby="kb-tab-statistics" hidden={tab !== "statistics"} className="space-y-5 kb-statistics-panel">
      <div className="kb-panel-heading"><div><h2>{t(K.statisticsIntro)}</h2><p>{t(K.statisticsHint)}</p></div>
        <button className="btn btn-ghost kb-refresh" disabled={loading || busy} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />{t(K.refresh)}</button></div>
      {loading && !loaded ? <p role="status">{t(K.loading)}</p> : !loaded || !counts ? <p role="alert">{t(K.statisticsUnavailable)}</p> : <>
      <div className="kb-metrics">{(["loaded", "completed", "eligible"] as const).map((key) => <div key={key} className={`card kb-metric kb-metric-${key}`}>
        {key === "loaded" ? <LibraryBig className="h-5 w-5" aria-hidden /> : <CheckCircle2 className="h-5 w-5" aria-hidden />}
        <span className="studio-metric-label">{t(K.counts[key])}</span><span className="studio-metric-count mt-2">{counts[key].toLocaleString(lang)}</span>
      </div>)}</div>
      <div className="card kb-breakdown"><h3>{t(K.ingestionBreakdown)}</h3>{KB_STATUSES.map((value) => {
        const count = counts[STATUS_COUNT[value]];
        return <button key={value} className="kb-breakdown-row" title={t(K.viewResources)} disabled={busy} onClick={() => { setSearch(""); setSearchQuery(""); setStatus(value); setPage(1); setSelected([]); setScope(""); setTab("resources"); document.getElementById("kb-tab-resources")?.focus(); }}>
          <span className={`kb-breakdown-label status-${STATUS_STYLE[value]}`}>{t(K.statuses[value])}</span>
          <span className="kb-bar" aria-hidden><span className={`status-${STATUS_STYLE[value]}`} style={{ width: `${counts.loaded ? count / counts.loaded * 100 : 0}%` }} /></span>
          <span className="kb-breakdown-count">{count.toLocaleString(lang)}</span><ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </button>;
      })}</div></>}
    </section>

    <dialog ref={dialog} className="card studio-dialog kb-dialog kb-detail-dialog" aria-labelledby="kb-detail-title" onClose={closeDetail}
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <header className="flex items-start justify-between gap-4 border-b border-line p-6"><div className="min-w-0">
        <p className="kb-eyebrow">{t(K.details)}</p><h2 id="kb-detail-title" className="break-words font-serif text-2xl"><bdi>{detail ? resourceLabel(detail) : t(K.details)}</bdi></h2>
        <p className="mt-2 text-xs text-muted">{t(K.eligibleHint)}</p></div>
        <button className="btn btn-ghost !p-2" aria-label={t(K.close)} onClick={() => dialog.current?.close()}><X className="h-5 w-5" aria-hidden /></button></header>
      {detail && <div className="kb-detail-body space-y-5 p-6">
        {detailLoading && <p role="status" className="text-sm text-muted">{t(K.loading)}</p>}
        {detailError && <div role="alert" className="text-sm text-rose"><p>{detailError}</p><button className="mt-2 underline" onClick={() => void openDetails(detail)}>{t(K.retry)}</button></div>}
        <div className="flex flex-wrap gap-2">{statusChip(detail)}<span className={`chip studio-status status-${detail.enabled ? "active" : "disabled"}`}>{t(detail.enabled ? K.enabled : K.disabled)}</span></div>
        <form className="space-y-3" onSubmit={(event) => void saveDetails(event)}>
          <fieldset className="space-y-3" disabled={busy || detailLoading}>
            <label className="block"><span className="studio-field-label">{t(K.bookTitle)}</span><input className="input" dir="auto" maxLength={200} value={metadataDraft.title} onChange={(event) => setMetadataDraft((current) => ({ ...current, title: event.target.value }))} /></label>
            <div><label className="block"><span className="studio-field-label">{t(K.summary)}</span><input className="input" dir="auto" aria-describedby="kb-detail-summary-hint" maxLength={160} value={metadataDraft.description} onChange={(event) => setMetadataDraft((current) => ({ ...current, description: event.target.value }))} /></label><p id="kb-detail-summary-hint" className="mt-1 text-xs text-muted">{t(K.summaryHint)}</p></div>
            <button className="btn btn-primary" disabled={metadataDraft.title.trim() === (detail.title ?? "") && metadataDraft.description.trim() === (detail.description ?? "")}>{t(busy ? K.updating : K.saveMetadata)}</button>
          </fieldset>
        </form>
        <dl className="kb-detail-grid">{[
          [K.originalFilename, detail.filename],
          [K.ocr, detail.ocrUsed == null ? unavailable : t(detail.ocrUsed ? K.yes : K.no)],
          [K.pages, detail.pages == null ? unavailable : detail.pages.toLocaleString(lang)],
          [K.created, date(detail.createdAt)], [K.updatedAt, date(detail.updatedAt)],
        ].map(([label, value], index) => <div key={index} className="rounded-2xl bg-sky-50 p-4"><dt className="text-xs text-muted">{t(label as typeof K.documentId)}</dt><dd className="mt-2 break-all"><bdi>{value as string}</bdi></dd></div>)}</dl>
        <details className="kb-technical"><summary>{t(K.technicalDetails)}</summary><dl className="kb-detail-grid mt-4">{[[K.documentId, detail.documentId], [K.resourceId, detail.resourceId || unavailable], [K.job, detail.ingestionJobId || unavailable]].map(([label, value], index) => <div key={index}><dt>{t(label as typeof K.documentId)}</dt><dd><bdi>{value as string}</bdi></dd></div>)}</dl></details>
        {detail.error && <div role="alert" className="kb-notice is-error"><CircleAlert className="h-4 w-4 shrink-0" aria-hidden /><div><p className="font-medium">{t(K.errors)}</p><p dir="auto" className="mt-1 whitespace-pre-wrap break-words">{detail.error}</p></div></div>}
        <div className="kb-detail-actions flex flex-wrap gap-3 border-t border-line pt-4">
          <button className="btn btn-ghost" disabled={busy || detailLoading} onClick={() => void openDetails(detail)}><RefreshCw className="h-4 w-4" aria-hidden />{t(K.refresh)}</button>
          {eligibleResource(detail) && <button className="btn btn-primary" disabled={detailLoading || !!detailError} onClick={() => {
            changeRetrievalInput(() => { setScope(detail.documentId); setScopeResource(detail); }); dialog.current?.close(); setTab("retrieval"); document.getElementById("kb-tab-retrieval")?.focus();
          }}>{t(K.tabs.retrieval)}</button>}
          {detail.status === "FAILED" && <button className="btn btn-tint-brand" onClick={() => { const replacement = detail.filename; dialog.current?.close(); setAdding({ replacement }); }}>{t(K.replacement)}</button>}
          <button className="btn btn-tint-danger" disabled={busy || detailLoading} onClick={() => confirmDelete(detail)}><Trash2 className="h-4 w-4" aria-hidden />{t(K.delete)}</button>
        </div>
      </div>}
    </dialog>
    <dialog ref={deleteDialog} className="card studio-dialog studio-confirm kb-dialog kb-delete-dialog" aria-labelledby="kb-delete-title" aria-describedby="kb-delete-description"
      onClose={() => { setDeleting(null); setDeleteError(null); }} onCancel={(event) => { if (busy) event.preventDefault(); }}
      onClick={(event) => { if (!busy && event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="p-6 sm:p-8">
        <span className="kb-delete-icon"><Trash2 className="h-6 w-6" aria-hidden /></span>
        <h2 id="kb-delete-title" className="font-serif text-2xl">{t(K.deleteTitle)}</h2>
        <p dir="auto" className="mt-4 break-words font-medium">{deleting && resourceLabel(deleting)}</p>
        <p id="kb-delete-description" className="mt-3 text-sm text-ink-soft">{t(K.deleteConfirm)}</p>
        {deleteError && <p role="alert" className="mt-4 text-sm text-rose-700">{deleteError}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" autoFocus className="btn btn-ghost" disabled={busy} onClick={() => deleteDialog.current?.close()}>{t(K.cancel)}</button>
          <button type="button" className="btn btn-tint-danger" disabled={busy || !deleting} onClick={() => void removeResource()}>{t(busy ? K.updating : K.delete)}</button>
        </div>
      </div>
    </dialog>
    {adding && <AddResource replacement={adding.replacement} onClose={() => setAdding(null)} onRegistered={() => void load()}
      onComplete={() => { setAdding(null); setMessage(t(K.uploaded)); setTab("resources"); void load(); }} />}
  </div>;
}
