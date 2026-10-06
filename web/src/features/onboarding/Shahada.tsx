"use client";

import Link from "@/components/RouteLink";
import { useRouter } from "@/lib/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ExternalLink, Square, Volume2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageBanner } from "@/components/Scenery";
import { Select } from "@/components/Select";
import { SourceQuote } from "@/features/courses/content";
import { Section } from "@/components/ui";
import { useContent } from "@/features/courses/ContentProvider";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/features/auth/SessionProvider";
import { useIsClient } from "@/lib/store";
import { S } from "@/lib/strings";
import { useNarration } from "@/lib/voice";

const T = S.shahada;
const EXTERNAL = { target: "_blank", rel: "noopener noreferrer" };
// ISO 3166-1 codes for the country filter of dawa.center. Names come from the browser (Intl.DisplayNames).
const COUNTRIES = "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(" ");

export default function ShahadaPage() {
  const { t } = useI18n();
  return (
    <AppShell title={t(S.nav.shahada)} sub={t(T.heroTitle)}>
      <Shahada />
    </AppShell>
  );
}

function Shahada() {
  const { t, lang } = useI18n();
  const { setPrefs } = useSession();
  const router = useRouter();
  const { sources } = useContent();
  const isClient = useIsClient();
  const [country, setCountry] = useState("");
  // One screen at a time. ponytail: plain state, so the browser Back button leaves the page; keep the screen in the URL hash if that is needed.
  const [page, setPage] = useState(0);
  const pages = T.pages;
  const last = pages.length - 1;
  const narration = useNarration();
  function go(n: number) {
    narration.stop();
    setPage(n);
    window.scrollTo({ top: 0 });
  }

  // Country names differ between Node and browsers, so the list is built after hydration.
  const countries = useMemo(() => {
    if (!isClient) return [];
    const names = new Intl.DisplayNames([lang], { type: "region" });
    return COUNTRIES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, lang));
  }, [isClient, lang]);

  function startFirstSteps() {
    setPrefs({ track: "first-steps", onboarded: true });
    router.push("/learn/");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageBanner title={t(S.nav.shahada)} sub={t(T.heroTitle)} />
      {/* Every screen stays open: the numbers show where you are, they never lock anything. */}
      <nav aria-label={t(T.pagesLabel)}>
        <ol className="flex items-center gap-2">
          {pages.map((label, i) => (
            <li key={label.en} className="flex flex-1 items-center gap-2 last:flex-none">
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === page ? "step" : undefined}
                aria-label={`${t(S.onboarding.step)} ${i + 1}: ${t(label)}`}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold transition ${
                  i === page ? "bg-brand-700 text-white" : i < page ? "bg-brand-100 text-brand-700" : "border border-line bg-white text-muted"
                }`}
              >
                {i + 1}
              </button>
              {i < last && <span className={`h-0.5 flex-1 rounded-full ${i < page ? "bg-brand-200" : "bg-line"}`} aria-hidden />}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm text-muted">{t(S.onboarding.step)} {page + 1} {t(S.onboarding.of)} {pages.length} · {t(pages[page])}</p>
      </nav>

      {/* One card, so the whole first screen fits without scrolling on a laptop. */}
      {page === 0 && (
        <section className="card grid gap-6 p-5 sm:grid-cols-2 sm:gap-8 sm:p-7">
          <div>
            <h2 className="font-serif text-3xl text-ink">{t(T.heroTitle)}</h2>
            <p className="mt-3 leading-relaxed text-ink-soft">{t(T.heroText)}</p>
            <p className="mt-4 text-sm text-muted">{t(T.heroNote)}</p>
            {/* The verse stays one tap away: closed by default to keep the screen short. */}
            {sources["quran:2:256"] ? (
              <details className="group mt-2">
                <summary className="chip cursor-pointer hover:bg-brand-50">
                  {t(T.ref2_256)} <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="mt-3"><SourceQuote id="quran:2:256" compact /></div>
              </details>
            ) : (
              <Link href="/quran/?s=2&v=256" className="chip mt-2 hover:bg-brand-50">{t(T.ref2_256)}</Link>
            )}
          </div>
          <div className="border-t border-line pt-6 sm:border-s sm:border-t-0 sm:ps-8 sm:pt-0">
            <h2 className="font-serif text-2xl text-ink">{t(T.readyTitle)}</h2>
            <ul className="mt-4 space-y-3">
              {T.ready.map((line) => (
                <li key={line.en} className="flex items-start gap-3 text-ink">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                  {t(line)}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-ink-soft">{t(T.notSure)}</p>
            <div className="mt-3 flex gap-2">
              <Link href="/ask/" className="btn btn-ghost whitespace-nowrap !px-3.5 text-sm">{t(T.askBtn)}</Link>
              <Link href="/learn/" className="btn btn-ghost whitespace-nowrap !px-3.5 text-sm">{t(T.learnBtn)}</Link>
            </div>
          </div>
        </section>
      )}

      {page === 1 && (
        <Section title={t(T.shahadaTitle)}>
          <p className="mb-5 text-ink-soft">
            {t(T.sayIt).split("**").map((part, i) => (i % 2 ? <strong key={i} className="font-semibold text-ink">{part}</strong> : part))}
          </p>
          <p className="quran text-center text-3xl text-ink sm:text-4xl" lang="ar">{T.words}</p>
          <div className="mt-4 text-center">
            <button type="button" className="btn btn-tint-brand" onClick={() => (narration.playing ? narration.stop() : narration.play({ src: T.audio, text: T.words, lang: "ar" }))}>
              {narration.playing ? <Square className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
              {t(S.lesson.listen)}
            </button>
          </div>
          <dl className="mt-5 space-y-3 text-ink-soft">
            {lang === "en" && (
              <div>
                <dt className="text-xs font-semibold text-muted">{t(T.soundLabel)}</dt>
                <dd className="italic">{T.sound}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold text-muted">{t(T.meaningLabel)}</dt>
              <dd>{t(T.meaning)}</dd>
            </div>
          </dl>
        </Section>
      )}

      {page === 2 && (
        <Section title={t(T.congratsTitle)} sub={t(T.congrats)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
              <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                {t(T.withTitle)} <span className="chip !py-0 !text-[0.7rem]">{t(T.recommended)}</span>
              </p>
              <ul className="mt-3 space-y-4 text-sm text-ink-soft">
                <li>
                  {t(T.withCenter)}
                  <div className="mt-2 flex flex-col items-start gap-2">
                    <div className="w-full sm:max-w-xs">
                      <Select label={t(T.country)} value={country} onChange={setCountry}
                        options={[{ value: "", label: t(T.anyCountry) }, ...countries.map(({ code, name }) => ({ value: code, label: name }))]} />
                    </div>
                    <a href={`https://dawa.center/islamic_centers?lang=${lang}${country && `&country=${country}`}`} {...EXTERNAL} className="btn btn-primary">
                      {t(T.centersBtn)} <ExternalLink className="h-4 w-4" aria-hidden />
                    </a>
                  </div>
                </li>
                <li>{t(T.withFriend)}</li>
                <li>
                  {t(T.withUs)}{" "}
                  <a href={`mailto:${T.email}`} className="font-medium text-brand-700 underline decoration-dotted underline-offset-2" dir="ltr">{T.email}</a>
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-line p-4">
              <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                {t(T.trackTitle)} <span className="chip !py-0 !text-[0.7rem]">{t(T.recommended)}</span>
              </p>
              <p className="mt-3 text-sm text-ink-soft">{t(T.trackText)}</p>
              <button type="button" className="btn btn-tint-brand mt-3" onClick={startFirstSteps}>
                {t(T.trackBtn)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </button>
            </div>
          </div>
        </Section>
      )}

      <div className="flex items-center justify-between gap-3">
        {page > 0
          ? <button type="button" className="btn btn-ghost" onClick={() => go(page - 1)}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{t(S.onboarding.back)}</button>
          : <span />}
        {page < last && <button type="button" className="btn btn-primary" onClick={() => go(page + 1)}>{t(S.onboarding.next)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>}
      </div>
    </div>
  );
}
