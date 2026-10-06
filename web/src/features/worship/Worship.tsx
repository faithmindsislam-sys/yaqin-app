"use client";

import Link from "@/components/RouteLink";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Brain, Check, ClipboardCheck, Heart, Minus, Moon, MoonStar, PencilLine, Plus, Save, ShieldCheck, Sparkles, Sun, Sunrise, Sunset, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageBanner } from "@/components/Scenery";
import { useSession } from "@/features/auth/SessionProvider";
import { useI18n } from "@/lib/i18n";
import { readStored, useStored, writeStored } from "@/lib/store";
import { COUNTERS, DAILY_HABITS, PRAYERS, PRAYER_STATES, REFLECTIONS, STEPS, W, boundedCount, dayDate, localDay, parseDay, recentDays, worshipKey, type CounterId, type HabitId, type WorshipDay } from "./data";
import "./worship.css";
import { loadWorship, saveWorship } from "./api";

const ICONS = { sunrise: Sunrise, sunset: Sunset, sun: Sun, moon: Moon, book: BookOpen, hifz: Brain, sparkles: Sparkles, heart: Heart };
const STEP_ICONS = [MoonStar, Sparkles, Heart, ClipboardCheck];
function subscribeDay(notify: () => void) {
  const timer = window.setInterval(notify, 30000);
  window.addEventListener("focus", notify);
  return () => { window.clearInterval(timer); window.removeEventListener("focus", notify); };
}
const getToday = () => localDay();
const serverToday = () => "";

export default function WorshipPage() {
  const { t } = useI18n();
  const { ready, user } = useSession();
  return <AppShell title={t(W.title)} sub={t(W.sub)}>
    <PageBanner title={t(W.title)} sub={t(W.sub)} />
    {ready && user && <Planner key={user.id} uid={user.id} />}
  </AppShell>;
}

function Planner({ uid }: { uid: string }) {
  const { t, lang } = useI18n();
  const today = useSyncExternalStore(subscribeDay, getToday, serverToday);
  const [picked, setPicked] = useState<string | null>(null);
  const [navigation, setNavigation] = useState({ day: "", step: 0, viewSaved: false });
  const [remote, setRemote] = useState<{ today: string; entries: Record<string, WorshipDay>; error: boolean }>({ today: "", entries: {}, error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!today) return;
    let active = true;
    loadWorship(uid, recentDays(today)).then(entries => {
      if (active) setRemote({ today, entries, error: false });
    }).catch(() => { if (active) setRemote({ today, entries: {}, error: true }); });
    return () => { active = false; };
  }, [uid, today, attempt]);
  if (!today) return <p role="status">{t(W.loading)}</p>;
  if (remote.today !== today) return <p role="status">{t(W.loading)}</p>;
  if (remote.error) return <div role="alert" className="card p-6"><p className="mb-4 text-sm">{t(W.loadError)}</p><button className="btn btn-primary" onClick={() => { setRemote({ today: "", entries: {}, error: false }); setAttempt(value => value + 1); }}>{t(W.retry)}</button></div>;
  const days = recentDays(today);
  const selected = picked && days.includes(picked) ? picked : today;
  const step = navigation.day === selected ? navigation.step : 0;
  const viewSaved = navigation.day === selected && navigation.viewSaved;
  function pick(day: string) {
    const saved = !!remote.entries[day];
    setPicked(day === today ? null : day); setNavigation({ day, step: saved ? 3 : 0, viewSaved: saved });
  }
  return <div className="worship space-y-5">
    <section className="worship-hero" aria-labelledby="worship-hero-title">
      <div className="relative z-1"><p className="worship-eyebrow"><MoonStar className="h-4 w-4" aria-hidden />{t(W.eyebrow)}</p>
        <h2 id="worship-hero-title" className="mt-2 font-serif text-2xl">{t(W.hero)}</h2>
        <p className="mt-2 text-xs text-brand-100"><time dateTime={selected}>{dayDate(selected).toLocaleDateString(lang === "ar" ? "ar" : "en", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</time></p>
      </div>
      <div className="relative z-1"><p className="mb-2 text-xs text-brand-100">{t(W.week)}</p><div className="worship-days" role="group" aria-label={t(W.week)}>
        {days.map(day => <DayButton key={day} uid={uid} day={day} today={today} selected={selected} saved={!!remote.entries[day]} onPick={() => pick(day)} />)}
      </div></div>
      <MoonStar className="worship-hero-moon" aria-hidden />
    </section>
    <DailyPlan key={selected} uid={uid} day={selected} saved={remote.entries[selected] ?? null} step={step} viewSaved={viewSaved} onStep={next => setNavigation({ day: selected, step: next, viewSaved: false })} onSave={entry => setRemote(current => ({ ...current, entries: { ...current.entries, [selected]: entry } }))} />
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />{t(W.local)}</p>
  </div>;
}

function DayButton({ uid, day, today, selected, saved, onPick }: { uid: string; day: string; today: string; selected: string; saved: boolean; onPick: () => void }) {
  const { t, lang } = useI18n();
  const draft = useStored(`${worshipKey(uid, day)}.draft`);
  const date = dayDate(day), locale = lang === "ar" ? "ar" : "en";
  const state = draft !== null ? "draft" : saved ? "saved" : "empty";
  return <button type="button" className="worship-day" aria-label={date.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })} aria-pressed={selected === day} onClick={onPick}>
    <span>{day === today ? t(W.today) : date.toLocaleDateString(locale, { weekday: "short" })}</span><strong>{date.toLocaleDateString(locale, { day: "numeric" })}</strong>
    <span aria-hidden className={`worship-day-dot is-${state}`} />
  </button>;
}

function DailyPlan({ uid, day, saved, step, viewSaved, onStep, onSave }: { uid: string; day: string; saved: WorshipDay | null; step: number; viewSaved: boolean; onStep: (next: number) => void; onSave: (entry: WorshipDay) => void }) {
  const { t, lang } = useI18n();
  const key = worshipKey(uid, day), draftKey = `${key}.draft`;
  const rawSaved = saved ? JSON.stringify(saved) : null, rawDraft = useStored(draftKey);
  const [pending, setPending] = useState<WorshipDay | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const showingSaved = viewSaved && rawSaved !== null;
  const entry = showingSaved ? parseDay(rawSaved) : pending ?? parseDay(rawDraft ?? rawSaved);
  const hasDraft = !showingSaved && (pending !== null || rawDraft !== null);
  const num = (n: number) => n.toLocaleString(lang === "ar" ? "ar" : "en");
  const StepIcon = showingSaved ? BookOpen : STEP_ICONS[step];
  function go(next: number, focusId = "worship-step-title") {
    onStep(next);
    requestAnimationFrame(() => {
      document.getElementById(focusId)?.focus({ preventScroll: true });
      document.getElementById(focusId === "worship-step-title" ? "worship-checkin" : focusId)?.scrollIntoView({ block: focusId === "worship-step-title" ? "start" : "center", behavior: "instant" });
    });
  }
  function update(change: (current: WorshipDay) => WorshipDay) {
    let next = change(entry);
    try {
      next = change(pending ?? parseDay(readStored(draftKey) ?? rawSaved));
      writeStored(draftKey, JSON.stringify(next));
      setPending(null); setSaveError(false);
    } catch { setPending(next); setSaveError(true); }
  }
  function toggle(id: HabitId, checked: boolean) {
    update(current => ({ ...current, checked: checked ? [...new Set([...current.checked, id])] : current.checked.filter(value => value !== id),
      counts: !checked && COUNTERS.some(counter => counter.id === id) ? { ...current.counts, [id]: 0 } : current.counts }));
  }
  function count(id: CounterId, value: number, increment = false) {
    update(current => { const amount = boundedCount(increment ? current.counts[id] + value : value); return { ...current, counts: { ...current.counts, [id]: amount }, checked: amount > 0 && !current.checked.includes(id) ? [...current.checked, id] : current.checked }; });
  }
  async function save() {
    if (saving) return;
    setSaving(true); setSaveError(false);
    try {
      const latest = pending ?? parseDay(rawDraft ?? rawSaved);
      const confirmed = await saveWorship(uid, day, latest);
      onSave(confirmed);
      try {
        // Switching dates during a save can create a newer draft. Keep those edits.
        if (readStored(draftKey) === rawDraft) writeStored(draftKey, null);
      } catch { /* The database still has the saved entry. */ }
      setPending(null); setSaveError(false);
    } catch { setSaveError(true); }
    finally { setSaving(false); }
  }
  return <section id="worship-checkin" className={`card worship-checkin ${showingSaved ? "is-saved-view" : ""}`} aria-label={t(showingSaved ? W.results : W.steps)}>
    {!showingSaved && <nav aria-label={t(W.steps)} className="worship-step-nav"><ol>{STEPS.map((title, i) => <li key={title.en}><button type="button" disabled={saving} aria-current={step === i ? "step" : undefined} onClick={() => go(i)}>
      <span className="worship-step-number" aria-hidden>{num(i + 1)}</span><span>{t(title)}</span>
    </button></li>)}</ol></nav>}
    <fieldset disabled={saving} className="worship-step-body min-w-0" aria-label={t(showingSaved ? W.results : STEPS[step])}>
      <div className="worship-checkin-heading mb-5"><div className="flex items-start gap-3"><span className={`worship-step-icon ${step === 2 ? "is-gratitude" : ""}`}><StepIcon className="h-5 w-5" aria-hidden /></span><div>
        {showingSaved && <p className="worship-journal-label">{t(W.journal)}</p>}
        {!showingSaved && <p className="text-xs text-muted">{t({ en: `Step ${step + 1} of 4`, ar: `الخطوة ${num(step + 1)} من ${num(4)}` })}</p>}
        <h2 id="worship-step-title" tabIndex={-1} className="mt-1 font-serif text-2xl text-ink">{t(showingSaved ? W.results : STEPS[step])}</h2>
        {showingSaved && entry.savedAt && <p className="worship-saved-time">{t(W.lastSaved)} · <time dateTime={entry.savedAt}>{new Date(entry.savedAt).toLocaleString(lang === "ar" ? "ar" : "en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></p>}
      </div></div><div className="worship-heading-actions"><span className={`worship-status ${!showingSaved && (hasDraft || !entry.savedAt) ? "is-draft" : "is-saved"}`}>{showingSaved && <Check className="h-3 w-3" aria-hidden />}{t(!showingSaved && (hasDraft || !entry.savedAt) ? W.draft : W.saved)}</span>
        {showingSaved && <button type="button" className="btn btn-tint-brand" onClick={() => go(0)}><PencilLine className="h-4 w-4" aria-hidden />{t(W.editDay)}</button>}
      </div></div>
      {!showingSaved && <p className="mb-6 text-sm leading-relaxed text-ink-soft">{t([W.prayersSub, W.checklistSub, W.reflectionSub, W.reviewSub][step])}</p>}
      {saveError && !showingSaved && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(W.saveError)}</p>}

      {step === 0 && <div className="space-y-3">
        {PRAYERS.map(prayer => { const Icon = ICONS[prayer.icon]; return <fieldset key={prayer.id} className="worship-prayer"><legend className="sr-only">{t(prayer.title)}</legend><div className="worship-prayer-row">
          <div className="flex items-center gap-3"><span className="worship-habit-icon"><Icon className="h-5 w-5" aria-hidden /></span><span className="text-sm font-medium">{t(prayer.title)}</span></div>
          <div className="worship-choices">{PRAYER_STATES.map(state => <label key={state.id} className={`worship-choice state-${state.id}`}>
            <input type="radio" className="worship-radio" name={`prayer-${prayer.id}`} value={state.id} checked={entry.prayers[prayer.id] === state.id} onChange={() => update(current => ({ ...current, prayers: { ...current.prayers, [prayer.id]: state.id } }))} /><span>{t(state.label)}</span>
          </label>)}</div>
        </div></fieldset>; })}
        <section className="worship-prayer" aria-label={t(W.nawafil)}><div className="worship-prayer-row">
          <div><h3 className="text-sm font-medium">{t(W.nawafil)}</h3><label htmlFor="nawafil-count" className="mt-1 block text-xs text-ink-soft">{t(W.nawafilCount)}</label><p className="mt-1 text-xs text-muted">{t(W.nawafilHint)}</p></div>
          <div className="worship-nawafil-controls">
            <button type="button" className="btn btn-ghost" disabled={entry.nawafil === 0} aria-label={`${t(W.fewer)} · ${t(W.nawafil)}`} onClick={() => update(current => ({ ...current, nawafil: boundedCount(current.nawafil - 1) }))}><Minus className="h-4 w-4" aria-hidden /></button>
            <input id="nawafil-count" className="input text-center text-sm" type="number" inputMode="numeric" min={0} max={99999} step={1} value={entry.nawafil} onChange={event => update(current => ({ ...current, nawafil: boundedCount(Number(event.target.value)) }))} />
            <button type="button" className="btn btn-tint-brand" disabled={entry.nawafil === 99999} aria-label={`+${num(1)} · ${t(W.nawafil)}`} onClick={() => update(current => ({ ...current, nawafil: boundedCount(current.nawafil + 1) }))}><Plus className="h-4 w-4" aria-hidden /></button>
          </div>
        </div></section>
        <div className="pt-3"><label htmlFor="worship-intention" className="mb-2 block text-xs font-medium text-ink-soft">{t(W.intention)}</label><input id="worship-intention" className="input text-sm" maxLength={240} value={entry.intention} placeholder={t(W.intentionHint)} onChange={event => update(current => ({ ...current, intention: event.target.value }))} /></div>
      </div>}

      {step === 1 && <>
        <div className="worship-habits">{DAILY_HABITS.map(habit => { const Icon = ICONS[habit.icon]; return <label key={habit.id} className={`worship-habit ${entry.checked.includes(habit.id) ? "is-checked" : ""}`}>
          <Icon className="h-5 w-5 shrink-0 text-brand-700" aria-hidden /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t(habit.title)}</span><span className="mt-1 block text-xs leading-relaxed text-muted">{t(habit.question)}</span></span>
          <input type="checkbox" aria-label={t(habit.title)} checked={entry.checked.includes(habit.id)} onChange={event => toggle(habit.id, event.target.checked)} />
        </label>; })}</div>
        <div className="mt-3 flex justify-end"><Link href="/quran/" className="inline-flex items-center gap-2 text-xs font-medium text-brand-700"><BookOpen className="h-4 w-4" aria-hidden />{t(W.openQuran)}<ArrowRight className="h-3 w-3 rtl:rotate-180" aria-hidden /></Link></div>
        <h3 className="mt-6 font-serif text-xl">{t(W.counters)}</h3><p className="mt-1 text-xs text-muted">{t(W.countOptional)}</p>
        <div className="worship-counters mt-4">{COUNTERS.map(counter => <section key={counter.id} className="worship-counter" aria-label={t(counter.title)}>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={entry.checked.includes(counter.id)} onChange={event => toggle(counter.id, event.target.checked)} aria-label={t(counter.title)} />{t(counter.title)}</label>
          <label htmlFor={`count-${counter.id}`} className="mt-3 block text-xs leading-relaxed text-muted">{t(counter.question)}</label>
          <input id={`count-${counter.id}`} className="worship-count" type="number" inputMode="numeric" min={0} max={99999} step={1} value={entry.counts[counter.id]} onChange={event => count(counter.id, Number(event.target.value))} />
          <div className="worship-counter-buttons"><button type="button" className="btn btn-ghost" disabled={entry.counts[counter.id] === 0} aria-label={`${t(W.fewer)} · ${t(counter.title)}`} onClick={() => count(counter.id, -1, true)}><Minus className="h-4 w-4" aria-hidden /></button>
            {[1, 10, 100].map(amount => <button type="button" key={amount} className="btn btn-tint-brand" disabled={entry.counts[counter.id] === 99999} onClick={() => count(counter.id, amount, true)}>+{num(amount)}</button>)}
          </div>
        </section>)}</div>
        <fieldset className="worship-sadaqah mt-5"><legend className="px-1 text-sm font-medium">{t(W.sadaqah)}</legend><div className="worship-choices mt-2 max-w-64">{[true, false].map(value => <label key={String(value)} className="worship-choice"><input type="radio" className="worship-radio" name="sadaqah" checked={entry.sadaqah === value} onChange={() => update(current => ({ ...current, sadaqah: value }))} /><span>{t(value ? W.yes : W.no)}</span></label>)}</div></fieldset>
      </>}

      {step === 2 && <div className="worship-reflections"><p className="mb-4 text-sm font-medium text-salmon-700">{t(W.reflection)}</p><div className="grid gap-4 lg:grid-cols-3">{REFLECTIONS.map((prompt, i) => <div key={prompt.id} className="worship-reflection-card">
        <p className="text-[0.65rem] font-semibold tracking-wider text-salmon-700">{num(i + 1)} · {t(prompt.label)}</p><label htmlFor={`reflection-${prompt.id}`} className="mt-3 block font-serif text-xl leading-snug">{t(prompt.title)}</label>
        <p id={`hint-${prompt.id}`} className="mt-2 text-xs leading-relaxed text-muted">{t(prompt.hint)}</p><textarea id={`reflection-${prompt.id}`} aria-describedby={`hint-${prompt.id}`} className="input mt-4 min-h-32 resize-y text-sm leading-relaxed" maxLength={1200} rows={5} placeholder={t(W.reflectionHint)} value={entry.reflections[prompt.id]} onChange={event => update(current => ({ ...current, reflections: { ...current.reflections, [prompt.id]: event.target.value } }))} />
      </div>)}</div></div>}

      {step === 3 && <>
        <DaySummary entry={entry} onEdit={go} />
        {!showingSaved ? <><label htmlFor="worship-note" className="mb-2 mt-5 block text-xs font-medium text-ink-soft">{t(W.note)}</label><textarea id="worship-note" className="input resize-y text-sm" rows={3} maxLength={1200} placeholder={t(W.noteHint)} value={entry.note} onChange={event => update(current => ({ ...current, note: event.target.value }))} /></> : <section className="worship-saved-note"><ReviewHeading title={t(W.noteLabel)} icon={PencilLine} onEdit={() => go(3, "worship-note")} /><p>{entry.note || t(W.noteHint)}</p></section>}
        {!showingSaved && !hasDraft && entry.savedAt && <p role="status" className="mt-4 flex items-start gap-2 rounded-xl bg-brand-50 p-4 text-sm text-brand-700"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t(W.savedMessage)}</p>}
      </>}
    </fieldset>
    <footer className="worship-step-footer"><p className="text-xs leading-relaxed text-muted">{t(showingSaved || (!hasDraft && entry.savedAt) ? W.savedHint : W.draftHint)}</p><div className="flex gap-2">
      {!showingSaved && <>{step > 0 && <button type="button" disabled={saving} className="btn btn-ghost" onClick={() => go(step - 1)}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{t(W.back)}</button>}
      {step < 3 ? <button type="button" className="btn btn-primary" onClick={() => go(step + 1)}>{t(W.next)}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button> : <button type="button" disabled={saving} className="btn btn-primary" onClick={save}><Save className="h-4 w-4" aria-hidden />{t(saving ? W.saving : W.save)}</button>}</>}
    </div></footer>
  </section>;
}

function DaySummary({ entry, onEdit }: { entry: WorshipDay; onEdit: (step: number) => void }) {
  const { t, lang } = useI18n();
  const num = (value: number) => value.toLocaleString(lang === "ar" ? "ar" : "en");
  const prayed = PRAYERS.filter(prayer => entry.prayers[prayer.id] === "prayed").length;
  return <div className="worship-summary">
    <div className="worship-review-grid">
      <section className="worship-review-card"><ReviewHeading title={t(W.prayers)} icon={MoonStar} onEdit={() => onEdit(0)} />
        <p className="worship-card-caption">{num(prayed)} / {num(5)} {t(W.prayedCount)}</p>
        <dl className="worship-prayer-results">{PRAYERS.map(prayer => { const Icon = ICONS[prayer.icon], state = entry.prayers[prayer.id]; return <div key={prayer.id}>
          <dt><Icon className="h-4 w-4" aria-hidden />{t(prayer.title)}</dt><dd className={`worship-prayer-badge state-${state ?? "empty"}`}>{state === "prayed" && <Check className="h-3 w-3" aria-hidden />}{t(PRAYER_STATES.find(option => option.id === state)?.label ?? W.unanswered)}</dd>
        </div>; })}</dl>
        <dl className="worship-summary-extra"><div><dt><Moon className="h-4 w-4" aria-hidden />{t(W.nawafil)}</dt><dd>{num(entry.nawafil)}</dd></div></dl>
        {entry.intention && <div className="worship-saved-intention"><p>{t(W.intentionLabel)}</p><p>{entry.intention}</p></div>}
      </section>
      <section className="worship-review-card"><ReviewHeading title={t(W.checklist)} icon={Sparkles} onEdit={() => onEdit(1)} />
        <div className="worship-saved-habits">{DAILY_HABITS.map(habit => { const done = entry.checked.includes(habit.id), Icon = ICONS[habit.icon]; return <span key={habit.id} className={`worship-review-chip ${done ? "is-done" : "is-empty"}`}><Icon className="h-3.5 w-3.5" aria-hidden />{t(habit.title)}{done ? <Check className="h-3 w-3" aria-label={t(W.done)} /> : <Minus className="h-3 w-3" aria-label={t(W.notChecked)} />}</span>; })}</div>
        <dl className="worship-dhikr-results">{COUNTERS.map(counter => <div key={counter.id}><dt>{t(counter.title)}</dt><dd><strong>{num(entry.counts[counter.id])}</strong>{entry.checked.includes(counter.id) && <span className="worship-dhikr-done"><Check className="h-3 w-3" aria-hidden />{t(W.done)}</span>}</dd></div>)}</dl>
        <dl className="worship-summary-extra"><div><dt><Heart className="h-4 w-4" aria-hidden />{t(W.charity)}</dt><dd className={entry.sadaqah ? "worship-charity-yes" : ""}>{entry.sadaqah && <Check className="h-3 w-3" aria-hidden />}{t(entry.sadaqah === null ? W.unanswered : entry.sadaqah ? W.yes : W.no)}</dd></div></dl>
      </section>
    </div>
    <section className="worship-review-card worship-gratitude-summary"><ReviewHeading title={t(W.gratitude)} icon={Heart} onEdit={() => onEdit(2)} />
      <dl className="worship-reflection-results">{REFLECTIONS.map((prompt, index) => <div key={prompt.id}><dt><span className="worship-reflection-label">{num(index + 1)} · {t(prompt.label)}</span>{t(prompt.title)}</dt><dd className={entry.reflections[prompt.id] ? "" : "is-empty"}>{entry.reflections[prompt.id] || t(W.emptyReflection)}</dd></div>)}</dl>
    </section>
  </div>;
}

function ReviewHeading({ title, icon: Icon, onEdit }: { title: string; icon: LucideIcon; onEdit: () => void }) {
  const { t } = useI18n();
  return <div className="worship-review-heading"><div><span className="worship-review-icon"><Icon className="h-4 w-4" aria-hidden /></span><h3>{title}</h3></div><button type="button" className="worship-edit" aria-label={`${t(W.edit)} · ${title}`} onClick={onEdit}><PencilLine className="h-3.5 w-3.5" aria-hidden /><span>{t(W.edit)}</span></button></div>;
}
