"use client";

import Link from "@/components/RouteLink";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/navigation";
import { Fragment, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, LoaderCircle, Pause, Play, Search, Square, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageBanner } from "@/components/Scenery";
import { EditionPicker } from "@/features/quran/EditionPicker";
import { SurahPicker } from "@/features/quran/SurahPicker";
import { VersePicker } from "@/features/quran/VersePicker";
import { Tafsir, VERSE_ACTION } from "@/features/quran/Tafsir";
import { useRecitation } from "@/features/quran/useRecitation";
import { useI18n } from "@/lib/i18n";
import { ARABIC, EDITIONS, RECITATION, audioUrl, few, fold, loadIndex, loadSearch, loadSurah, splitMatch, type Edition, type QuranIndex, type SearchData, type Surah, type Verse } from "@/features/quran/data";
import { useIsClient, useStored, writeStored } from "@/lib/store";
import { S } from "@/lib/strings";

const SURAHS = 114;
const PER_PAGE = 20;
const SHOW_KEY = "yaqin.quran.show";
// Renamed when the default became English: the old key held the former French default, saved on every visit.
const EDITION_KEY = "yaqin.quran.translation";
const href = (surah: number, at?: { v?: number; p?: number }, edition: string = EDITIONS[0].code) => `/quran/?s=${surah}&e=${edition}${at?.v ? `&v=${at.v}` : ""}${at?.p ? `&p=${at.p}` : ""}`;

export default function QuranPage() {
  const { t } = useI18n();
  return (
    <AppShell title={t(S.nav.quran)} sub={t(S.quran.sub)}>
      <Suspense><Reader /></Suspense>
    </AppShell>
  );
}

function Reader() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const savedEdition = useStored(EDITION_KEY);
  const isClient = useIsClient();
  // The link decides, then the saved preference, then the default (English).
  const code = params.get("e") ?? savedEdition;
  const edition = EDITIONS.find((e) => e.code === code) ?? EDITIONS[0];
  const link = (s: number, at?: { v?: number; p?: number }) => href(s, at, edition.code);
  const s = Number(params.get("s"));
  const surah = Number.isInteger(s) && s >= 1 && s <= SURAHS ? s : 1;
  const verse = Number(params.get("v")) || 0;
  const wantedPage = Number(params.get("p")) || 0;

  const [index, setIndex] = useState<QuranIndex | "error" | null>(null);
  const [loaded, setLoaded] = useState<{ edition: string; surah: number; fr: Verse[] | null; ar: Verse[] | null } | null>(null);
  const [search, setSearch] = useState<{ edition: string; data: SearchData | "error" } | null>(null);
  const arabicCache = useRef(new Map<number, Verse[]>());
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [openTafsir, setOpenTafsir] = useState<Set<string>>(() => new Set());
  const [scope, setScope] = useState<"translation" | "ar">("translation");
  const stored = useStored(SHOW_KEY);

  const meta = index && index !== "error" ? index : null;
  const ready = !!meta;
  // Arabic and the display switch exist only when the Arabic edition was actually published.
  const hasArabic = !!meta?.editions[ARABIC];
  const show = !hasArabic ? "translation" : stored === "fr" ? "translation" : stored === "ar" || stored === "translation" ? stored : "both";
  const searchData = search?.edition === edition.key ? search.data : null;
  const searching = query.trim().length > 0;

  useEffect(() => {
    if (!isClient) return;
    if (params.get("e")) writeStored(EDITION_KEY, edition.code);
    else router.replace(href(surah, { v: verse, p: wantedPage }, edition.code), { scroll: false });
    if (stored === "fr") writeStored(SHOW_KEY, "translation");
  }, [isClient, params, router, edition.code, surah, verse, wantedPage, stored]);

  useEffect(() => {
    let active = true;
    loadIndex().then((d) => { if (active) setIndex(d); }, () => { if (active) setIndex("error"); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    if (!ready || !isClient) return;
    let active = true;
    Promise.all([loadSurah(edition.key, surah), hasArabic ? arabicCache.current.has(surah) ? Promise.resolve(arabicCache.current.get(surah)!) : loadSurah(ARABIC, surah).then((ar) => { arabicCache.current.set(surah, ar); return ar; }) : null]).then(
      ([fr, ar]) => { if (active) setLoaded({ edition: edition.key, surah, fr, ar }); },
      () => { if (active) setLoaded({ edition: edition.key, surah, fr: null, ar: null }); },
    );
    return () => { active = false; };
  }, [ready, isClient, hasArabic, edition.key, surah, attempt]);

  useEffect(() => {
    if (!searching || !ready || searchData) return;
    let active = true;
    loadSearch(edition.key, hasArabic ? ARABIC : null).then((d) => { if (active) setSearch({ edition: edition.key, data: d }); }, () => { if (active) setSearch({ edition: edition.key, data: "error" }); });
    return () => { active = false; };
  }, [searching, ready, searchData, hasArabic, edition.key]);

  // `current` is undefined while loading; its `fr` is null when the fetch failed.
  const current = loaded?.surah === surah && loaded.edition === edition.key ? loaded : undefined;
  const failed = index === "error" || current?.fr === null;
  const rows = useMemo(() => current?.fr?.map((fr, i) => {
    const ar = current.ar?.[i];
    return { fr, ar, page: ar?.page ?? fr.page ?? 1, juz: ar?.juz };
  }), [current]);
  // Pages are the Mushaf pages this surah covers.
  const first = rows?.[0].page ?? 0;
  const last = rows?.at(-1)?.page ?? 0;
  const page = wantedPage >= first && wantedPage <= last ? wantedPage : rows?.[verse - 1]?.page ?? first;
  const visible = rows?.filter((r) => r.page === page);
  const info = meta?.surahs[surah - 1];
  const name = (x: Surah | undefined, n: number) => x?.name_latin ?? `${t(S.quran.surah)} ${n}`;
  const credit = meta?.recitations?.[RECITATION];
  const hasAudio = !!credit?.surahs.includes(surah);
  const { audio: audioRef, ...recitation } = useRecitation(surah, hasAudio, info?.ayahs ?? 0);
  const recitedPage = useRef({ surah, page: 0 });
  const playbackScroll = useRef(0);
  const lastNavigation = useRef("");

  useEffect(() => {
    if (!rows || searching) return;
    if (recitedPage.current.surah !== surah) playbackScroll.current = 0;
    const navigation = `${surah}:${verse}:${page}`;
    if (playbackScroll.current) {
      const target = document.getElementById(`v-${playbackScroll.current}`);
      if (target) { target.scrollIntoView({ block: "nearest" }); playbackScroll.current = 0; }
      lastNavigation.current = navigation;
      return;
    }
    if (lastNavigation.current === navigation && audioRef.current && !audioRef.current.paused) return;
    lastNavigation.current = navigation;
    const target = verse ? document.getElementById(`v-${verse}`) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 0 });
  }, [rows, verse, page, surah, searching, audioRef]);

  useEffect(() => {
    if (!recitation.playing || !recitation.ayah || !rows || searching) return;
    const nextPage = rows[recitation.ayah - 1]?.page;
    if (!nextPage) return;
    const previous = recitedPage.current;
    recitedPage.current = { surah, page: nextPage };
    // Follow only a new recited page. Browsing elsewhere stays put between boundaries.
    if (previous.surah !== surah || previous.page !== nextPage) {
      if (page !== nextPage) {
        playbackScroll.current = recitation.ayah;
        router.replace(href(surah, { v: verse, p: nextPage }, edition.code), { scroll: false });
      } else document.getElementById(`v-${recitation.ayah}`)?.scrollIntoView({ block: "nearest" });
    } else if (page === nextPage) document.getElementById(`v-${recitation.ayah}`)?.scrollIntoView({ block: "nearest" });
  }, [recitation.ayah, recitation.playing, rows, page, surah, verse, edition.code, router, searching]);

  return (
    <div className="space-y-5">
      {hasAudio && <audio key={surah} ref={audioRef} src={audioUrl(surah)} preload="none" {...recitation.events} />}
      <PageBanner title={t(S.nav.quran)} sub={t(S.quran.sub)} />

      {/* The title lives in the AppShell header, so the translation picker sits next to the search box. */}
      <div className="flex flex-wrap items-end gap-4">
      <div className="w-full text-xs text-muted sm:order-last sm:w-80">
        {t(S.quran.translation)}
        <EditionPicker label={t(S.quran.translation)} value={edition} available={meta?.editions ?? null} onChange={(code) => {
          writeStored(EDITION_KEY, code);
          router.replace(href(surah, { v: verse, p: wantedPage }, code), { scroll: false });
        }} />
      </div>

      <div className="relative min-w-0 flex-1 basis-64">
        <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          dir="auto"
          enterKeyHint="search"
          className="input !rounded-full ps-11 pe-11"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Warm the search text as soon as the box is focused, so results are instant.
          onFocus={() => { if (ready) loadSearch(edition.key, hasArabic ? ARABIC : null).catch(() => {}); }}
          placeholder={t(hasArabic ? S.quran.search : S.quran.searchFr)}
          aria-label={t(hasArabic ? S.quran.search : S.quran.searchFr)}
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label={t(S.quran.clear)} className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted hover:bg-sky-100 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      </div>

      {hasArabic && searching && <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span id="search-scope">{t(S.quran.searchScope)}</span>
        <div role="group" aria-labelledby="search-scope" className="inline-flex rounded-full border border-line bg-white p-0.5">
          {(["translation", "ar"] as const).map((value) => <button key={value} aria-pressed={scope === value} className={`rounded-full px-3 py-1 transition ${scope === value ? "bg-brand-50 font-semibold text-brand-700" : "text-muted hover:text-ink"}`} onClick={() => setScope(value)}>{value === "ar" ? "العربية" : edition.name}</button>)}
        </div>
      </div>}

      {searching ? (
        <section className="card p-5 sm:p-8">
          {searchData === "error" || index === "error" ? (
            <Failure onRetry={() => { setSearch(null); if (index === "error") { setIndex(null); setAttempt((n) => n + 1); } }} />
          ) : !searchData || !meta ? (
            <p role="status" className="py-14 text-center text-ink-soft">{t(S.common.loading)}</p>
          ) : (
            <Results key={`${edition.code}:${scope}`} edition={edition} scope={hasArabic ? scope : "translation"} query={query} data={searchData} surahs={meta.surahs} onOpen={() => setQuery("")} />
          )}
        </section>
      ) : (
        <>
          {/* Stays under the AppShell header (71px with the mobile logo, 113px on desktop with the page title). */}
          <div className="card sticky top-[71px] z-20 grid grid-cols-[1fr_6.5rem] gap-3 p-3 sm:grid-cols-[1fr_8.5rem_auto] lg:top-[113px]">
            <SurahPicker lang={edition.lang} surahs={meta?.surahs ?? []} value={surah} onChange={(n) => router.push(link(n), { scroll: false })} />
            <VersePicker label={t(S.quran.verse)} count={rows?.length ?? 0} value={verse} onChange={(v) => router.replace(link(surah, { v }), { scroll: false })} />
            {hasAudio ? <div className="col-span-2 flex items-center gap-2 border-t border-line pt-2 sm:col-span-1 sm:border-0 sm:pt-0">
                <button type="button" onClick={() => void recitation.start(0, verse)} aria-label={t(recitation.playing || recitation.buffering ? S.quran.pause : S.quran.listen)} className="btn btn-primary !min-h-10 !px-3 !py-2 text-sm">
                  {recitation.buffering ? <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" /> : recitation.playing ? <Pause aria-hidden className="h-4 w-4" /> : <Play aria-hidden className="h-4 w-4" />}
                  {/* Short labels once the player is open: the stop button beside it gives the context. */}
                  {t(recitation.playing || recitation.buffering ? recitation.open ? S.lesson.pause : S.quran.pause : recitation.open ? S.lesson.listen : S.quran.listen)}
                </button>
                {recitation.open && <button type="button" onClick={recitation.stop} aria-label={t(S.lesson.stop)} title={t(S.lesson.stop)} className="chip grid min-h-10 min-w-10 place-items-center hover:border-brand-300"><Square aria-hidden className="h-4 w-4" /></button>}
                {recitation.buffering && <span role="status" className="sr-only">{t(S.common.loading)}</span>}
            </div> : meta && <p className="col-span-full text-sm text-muted">{t(S.quran.noAudio)}</p>}
            {hasAudio && recitation.error && <div role="alert" className="col-span-full text-sm text-ink-soft">{t(S.quran.audioError)} <button type="button" className="underline underline-offset-2" onClick={() => recitation.retry(verse)}>{t(S.quran.retry)}</button></div>}
          </div>

          <article className="card p-5 sm:p-8">
            <header className="border-b border-line pb-4">
              {/* The surah bar above already shows the number and both names: this heading is for screen readers only. */}
              <h2 className="sr-only">{t(S.quran.surah)} {surah}: {name(info, surah)}</h2>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  {[info?.names[edition.lang], info && `${info.ayahs} ${t(few(info.ayahs) ? S.quran.versesFew : S.quran.verses)}`, page > 0 && `${t(S.quran.page)} ${page}`, visible?.[0]?.juz && `${t(S.quran.juz)} ${visible[0].juz}`].filter(Boolean).join(" · ")}
                </p>
                {hasArabic && (
                  <div role="group" aria-label={t(S.quran.display)} className="inline-flex rounded-full border border-line bg-white p-0.5 text-sm">
                    {(["both", "ar", "translation"] as const).map((m) => (
                      <button key={m} onClick={() => writeStored(SHOW_KEY, m)} aria-pressed={show === m} className={`rounded-full px-3 py-1 transition ${show === m ? "bg-brand-50 font-semibold text-brand-700" : "text-muted hover:text-ink"}`}>
                        {t(m === "both" ? S.quran.both : m === "ar" ? S.quran.arabic : S.quran.translation)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </header>

            {failed ? (
              <Failure onRetry={() => { setIndex(null); setLoaded(null); setAttempt((n) => n + 1); }} />
            ) : !visible ? (
              <p role="status" className="py-14 text-center text-ink-soft">{t(S.common.loading)}</p>
            ) : (
              <ol className="divide-y divide-line">
                {visible.map(({ fr, ar }) => (
                  <li key={fr.verse_key} id={`v-${fr.ayah_number}`} aria-current={recitation.ayah === fr.ayah_number ? "true" : undefined} className={`scroll-mt-52 py-5 lg:scroll-mt-36 sm:flex sm:gap-3 ${recitation.ayah === fr.ayah_number ? "-mx-3 rounded-xl bg-brand-50 px-3 ring-2 ring-inset ring-brand-300" : fr.ayah_number === verse ? "-mx-3 rounded-xl bg-brand-50 px-3" : ""}`}>
                    {/* Fixed width, so the text starts at the same edge for "2:2" and "2:286". */}
                    <div className="shrink-0 sm:w-[5.5rem]">
                      <a href={fr.source_url} target="_blank" rel="noreferrer" title={t(S.quran.openSource)} className="chip tabular-nums hover:border-brand-300">{fr.verse_key} <ExternalLink aria-hidden className="h-3 w-3" /></a>
                    </div>
                    <div className="mt-3 min-w-0 flex-1 space-y-3 sm:mt-0">
                      {/* Verbatim record text, rendered as text nodes; line breaks kept as stored. */}
                      {ar && show !== "translation" && <p lang="ar" className="quran text-2xl text-ink sm:text-[1.75rem]">{ar.text}</p>}
                      {show !== "ar" && <p lang={edition.lang} dir={edition.dir} className={`whitespace-pre-line text-lg leading-8 ${show === "both" ? "text-ink-soft" : "text-ink"}`}>{fr.text}</p>}
                      <Tafsir verseKey={fr.verse_key} surah={surah} ayah={fr.ayah_number} edition={edition} editions={meta?.tafsir} open={openTafsir.has(fr.verse_key)} onToggle={() => setOpenTafsir((previous) => {
                        const next = new Set(previous);
                        if (next.has(fr.verse_key)) next.delete(fr.verse_key); else next.add(fr.verse_key);
                        return next;
                      })}>
                        {hasAudio && <button type="button" aria-label={`${t(recitation.playing && recitation.oneVerse === fr.ayah_number ? S.quran.pause : S.quran.playVerse)} ${fr.verse_key}`} onClick={() => void recitation.start(fr.ayah_number, verse)} className={VERSE_ACTION}>
                          {recitation.playing && recitation.oneVerse === fr.ayah_number ? <Pause aria-hidden className="h-4 w-4" /> : <Play aria-hidden className="h-4 w-4" />}
                          {t(recitation.playing && recitation.oneVerse === fr.ayah_number ? S.lesson.pause : S.lesson.listen)}
                        </button>}
                      </Tafsir>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {meta?.editions[edition.key] && (
              <footer className="space-y-1 border-t border-line pt-4 text-xs leading-relaxed text-muted">
                {hasArabic && <p>{t(S.quran.arabicText)} <Credit name={meta.editions[ARABIC].title} edition={meta.editions[ARABIC]} /></p>}
                <p>
                  {t(S.quran.attribution)} <Credit lang={edition.lang} dir={edition.dir} name={meta.editions[edition.key].translator} edition={meta.editions[edition.key]} />
                  {" "}({t(S.quran.version)} {meta.editions[edition.key].catalogue_version_observed})
                </p>
                {hasAudio && credit && <p>{t(S.quran.recitation)} <Credit lang={lang} name={lang === "ar" ? credit.reciter_ar : credit.reciter} edition={credit} />{" · "}{t(S.quran.hafs)}</p>}
                {[meta.tafsir?.[edition.lang]].map((tafsir) => tafsir && <p key={tafsir.key}>
                  {t(S.quran.tafsir)}: <Credit name={tafsir.title} edition={tafsir} />{" · "}{tafsir.author ?? tafsir.publisher}{" · "}<bdi>{tafsir.language}</bdi>{" · "}{t(S.quran.dumpVersion)} {tafsir.dump_version}
                  {tafsir.supplement && <>{" · "}{t(S.quran.surah)} <bdi>{tafsir.supplement.surahs}</bdi>: <a href={tafsir.supplement.provider_url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-brand-700">{tafsir.supplement.provider}</a></>}
                </p>)}
              </footer>
            )}
          </article>

          {visible && (
            <Pager page={page} first={first} last={last} label={t(S.quran.pages)} onPage={(p) => router.push(link(surah, { p }), { scroll: false })} />
          )}
          <nav className="flex justify-between gap-3">
            {surah > 1 ? (
              <Link href={link(surah - 1)} scroll={false} className="btn btn-ghost min-w-0 !justify-start text-start">
                <ChevronLeft className="h-4 w-4 shrink-0 rtl:rotate-180" />
                <span className="min-w-0"><span className="block text-xs text-muted">{t(S.quran.prev)}</span><span className="block truncate text-sm">{name(meta?.surahs[surah - 2], surah - 1)}</span></span>
              </Link>
            ) : <span />}
            {surah < SURAHS && (
              <Link href={link(surah + 1)} scroll={false} className="btn btn-ghost min-w-0 !justify-end text-end">
                <span className="min-w-0"><span className="block text-xs text-muted">{t(S.quran.next)}</span><span className="block truncate text-sm">{name(meta?.surahs[surah], surah + 1)}</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 rtl:rotate-180" />
              </Link>
            )}
          </nav>
        </>
      )}
    </div>
  );
}

/** Whole-Quran search in the explicit scope, with the selected translation as the preview. */
function Results({ query, data, surahs, onOpen, edition, scope }: { edition: Edition; scope: "translation" | "ar"; query: string; data: SearchData; surahs: Surah[]; onOpen: () => void }) {
  const { t } = useI18n();
  // Typing stays smooth: the list re-filters just after the keystroke is painted.
  const q = useDeferredValue(query).trim().replace(/\s+/g, " ");
  const [at, setAt] = useState({ q, page: 1 });
  const page = at.q === q ? at.page : 1;
  // Position in the search arrays → surah and ayah.
  const where = useMemo(() => surahs.flatMap((s) => Array.from({ length: s.ayahs }, (_, i) => [s.number, i + 1] as const)), [surahs]);

  const { hits, needle, arabic } = useMemo(() => {
    const ref = /^(\d{1,3})\s*[:.\s]\s*(\d{1,3})$/.exec(q);
    if (ref) {
      const i = where.findIndex(([s, a]) => s === Number(ref[1]) && a === Number(ref[2]));
      return { hits: i < 0 ? [] : [i], needle: "", arabic: false };
    }
    const arabic = scope === "ar";
    const needle = fold(q, arabic);
    const keys = arabic ? data.arKey : data.translationKey;
    const hits: number[] = [];
    if (keys && needle.length >= (edition.lang === "zh" && !arabic ? 1 : 2)) for (let i = 0; i < keys.length; i++) if (keys[i].includes(needle)) hits.push(i);
    return { hits, needle, arabic };
  }, [q, data, where, scope, edition.lang]);

  return (
    <>
      <p role="status" className="border-b border-line pb-4 text-sm text-ink-soft">
        {hits.length ? `${hits.length} ${t(hits.length === 1 ? S.quran.foundOne : few(hits.length) ? S.quran.foundFew : S.quran.found)}` : t(needle.length === 1 && (edition.lang !== "zh" || scope === "ar") ? S.quran.tooShort : S.quran.none)}
      </p>
      <ol className="divide-y divide-line">
        {hits.slice((page - 1) * PER_PAGE, page * PER_PAGE).map((i) => {
          const [s, a] = where[i];
          const info = surahs[s - 1];
          return (
            <li key={i}>
              <Link href={href(s, { v: a }, edition.code)} scroll={false} onClick={onOpen} className="-mx-3 block rounded-xl px-3 py-4 transition hover:bg-brand-50">
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="chip tabular-nums">{s}:{a}</span>
                  {[info.name_latin, info.names[edition.lang]].filter(Boolean).join(" · ")}
                </span>
                <span lang={edition.lang} dir={edition.dir} className="mt-2 block whitespace-pre-line leading-7 text-ink-soft"><Marked text={data.translation[i]} needle={arabic ? "" : needle} /></span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="pt-4">
        <Pager page={page} first={1} last={Math.ceil(hits.length / PER_PAGE)} label={t(S.quran.pages)} onPage={(p) => { setAt({ q, page: p }); window.scrollTo({ top: 0 }); }} />
      </div>
    </>
  );
}

function Marked({ text, needle, arabic = false }: { text: string; needle: string; arabic?: boolean }) {
  const parts = splitMatch(text, needle, arabic);
  return parts ? <>{parts[0]}<mark className="rounded bg-gold/40 text-inherit">{parts[1]}</mark>{parts[2]}</> : text;
}

/** Numbered pagination: first, last and the pages around the current one. */
function Pager({ page, first, last, label, onPage }: { page: number; first: number; last: number; label: string; onPage: (page: number) => void }) {
  const { t } = useI18n();
  if (last <= first) return null;
  const pages = [...new Set([first, page - 1, page, page + 1, last])].filter((p) => p >= first && p <= last).sort((a, b) => a - b);
  const cell = "grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm tabular-nums transition";
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-center gap-1">
      <button disabled={page <= first} onClick={() => onPage(page - 1)} aria-label={t(S.quran.prevPage)} className={`${cell} text-ink-soft hover:bg-white disabled:opacity-40`}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></button>
      {pages.map((p, i) => (
        <Fragment key={p}>
          {i > 0 && p - pages[i - 1] > 1 && <span aria-hidden className="px-0.5 text-muted">…</span>}
          <button onClick={() => onPage(p)} aria-current={p === page ? "page" : undefined} className={`${cell} ${p === page ? "bg-brand-700 font-semibold text-white" : "border border-line bg-white text-ink-soft hover:border-brand-300"}`}>{p}</button>
        </Fragment>
      ))}
      <button disabled={page >= last} onClick={() => onPage(page + 1)} aria-label={t(S.quran.nextPage)} className={`${cell} text-ink-soft hover:bg-white disabled:opacity-40`}><ChevronRight className="h-4 w-4 rtl:rotate-180" /></button>
    </nav>
  );
}

function Credit({ name, edition, lang, dir }: { name?: string; lang?: string; dir?: "ltr" | "rtl"; edition: { provider: string; provider_url: string } }) {
  return (
    <>
      <bdi lang={lang} dir={dir} className="font-medium text-ink-soft">{name}</bdi>{" · "}
      <a href={edition.provider_url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-brand-700">{edition.provider}</a>
    </>
  );
}

function Failure({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="py-14 text-center">
      <p className="text-ink-soft">{t(S.quran.error)}</p>
      <button className="btn btn-ghost mt-4" onClick={onRetry}>{t(S.quran.retry)}</button>
    </div>
  );
}
