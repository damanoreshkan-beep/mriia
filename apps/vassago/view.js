import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { persistentAtom } from "@nanostores/persistent";
import { Sheet, Segmented, Panel } from "/_rt/ui.js";
import { Calendar, monthKey } from "/_rt/calendar.js";
import { T, intlLocale } from "/_rt/i18n.js";
import { Scramble } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";
import { VECTORS, REGION_IDS, vassagoUrl, byDay, nextBig, labelOf, fixtureEvents, dayKeyOf, isAllDay, startOf } from "/_rt/vassago.js";

// VASSAGO — the face of /feed/vassago. Everything on screen is what the edge returned, arranged by rt/vassago.js: the
// day an event belongs to, which events lead a day, the next big one. The app computes nothing about the sky or the
// markets. Two tabs share ONE answer per region (module cache below) — switching tabs never refetches.
const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const VKEY = { sky: "vSky", macro: "vMacro", markets: "vMarkets", politics: "vPolitics", holidays: "vHolidays", crypto: "vCrypto" };
const VICON = Object.fromEntries(VECTORS.map((v) => [v.id, v.icon]));

const $region = persistentAtom("vassago.region", "mine");
const $vector = persistentAtom("vassago.vector", "all");

// ── the answer: memory → localStorage (the last good one, with its age) → the edge ─────────────────────────────────
const mem = new Map();
const ck = (r) => `vassago:v1:${r}`;
const readCache = (r) => { try { return JSON.parse(localStorage.getItem(ck(r)) || "null"); } catch { return null; } };
const writeCache = (r, v) => { try { localStorage.setItem(ck(r), JSON.stringify(v)); } catch { } };
const FRESH = 10 * 60_000;

function useVassago(region) {
  const [st, setSt] = useState(() => mem.get(region) || (gate ? { events: fixtureEvents(Date.now()), at: Date.now() } : readCache(region)) || null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (gate) { const v = { events: fixtureEvents(Date.now()), at: Date.now() }; mem.set(region, v); setSt(v); return; }
    const have = mem.get(region) || readCache(region);
    setSt(have || null); setErr(false);
    if (have && Date.now() - have.at < FRESH && mem.has(region)) return;
    let live = true;
    fetch(vassagoUrl(region))
      .then((r) => { if (!r.ok) throw new Error("status " + r.status); return r.json(); })
      .then((j) => {
        if (!live) return;
        if (!Array.isArray(j?.events)) throw new Error("shape");
        const v = { events: j.events, at: Date.now() };
        mem.set(region, v); writeCache(region, v); setSt(v); setErr(false);
      })
      .catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [region]);
  return { data: st, err };
}

// ── formatting (Intl only — the dates are the edge's instants, shown in the reader's zone) ───────────────────────────
const dateOf = (key) => new Date(`${key}T12:00:00`);
const fmt = (loc, opts) => new Intl.DateTimeFormat(intlLocale(loc), opts);
// "неділя, 25 жовтня": ICU's uk pattern for weekday+day+month puts the weekday in the accusative ("неділю, 25 жовтня" —
// the first live shot), so the weekday is formatted alone (nominative) and joined to the day.
const longDay = (d, loc) => `${fmt(loc, { weekday: "long" }).format(d)}, ${fmt(loc, { day: "numeric", month: "long" }).format(d)}`;
const timeOf = (e, loc) => (isAllDay(e) ? null : fmt(loc, { hour: "2-digit", minute: "2-digit" }).format(new Date(e.at)));
// "in 5 hours" up to a day and a half, then days ("in 2 days", not "in 47 hours" — the first live shot said the latter)
function untilLabel(ms, loc) {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(loc), { numeric: "auto" });
  const h = ms / 3600000;
  if (h < 1) return rtf.format(Math.max(1, Math.round(ms / 60000)), "minute");
  if (h < 36) return rtf.format(Math.round(h), "hour");
  return rtf.format(Math.round(h / 24), "day");
}
const ago = (ms, loc) => {
  const m = Math.round(ms / 60000);
  const nf = new Intl.NumberFormat(intlLocale(loc), { style: "unit", unitDisplay: "short", unit: m < 60 ? "minute" : m < 2880 ? "hour" : "day" });
  return nf.format(m < 60 ? m : m < 2880 ? Math.round(m / 60) : Math.round(m / 1440));
};

const Dot = ({ v }) => html`<span class=${`vg-dot vg-${v}`} aria-hidden="true"></span>`;
const Country = ({ cc }) => cc ? html`<span class="vg-cc font-mono text-[0.68rem] tracking-wider">${cc}</span>` : null;

// One event as a line: time · label · country · its numbers · its certainty and source.
function EventRow({ e, t, loc }) {
  const time = timeOf(e, loc);
  const nums = [e.data?.forecast != null && e.data.forecast !== "" ? T(t, "forecast", { v: e.data.forecast }) : "",
    e.data?.previous != null && e.data.previous !== "" ? T(t, "previous", { v: e.data.previous }) : ""].filter(Boolean).join(" · ");
  return html`<div class="flex items-start gap-2.5 py-2 min-w-0" data-event=${e.kind} data-vector=${e.vector}>
    <span class="w-12 shrink-0 pt-0.5 font-mono tabular-nums text-sm text-base-content/80">${time || html`<span class="text-muted">${T(t, "allDay")}</span>`}</span>
    <span class="min-w-0 flex-1">
      <span class="flex items-center gap-1.5 min-w-0"><${Dot} v=${e.vector} /><span class="font-medium break-words">${labelOf(e, loc, t)}</span></span>
      <span class="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-sm text-muted">
        <${Country} cc=${e.country} />
        ${nums ? html`<span class="font-mono tabular-nums">${nums}</span>` : null}
        ${e.certainty === "estimated" ? html`<span data-estimated class="text-warning">≈ ${T(t, "estimated")}</span>` : null}
        <span class="truncate">${e.source}</span>
      </span>
    </span>
  </div>`;
}

// All events of one day, grouped by vector in the VECTORS order; inside a group, by the clock (all-day ones first) — the
// rank that picks a day row's lead is not an order to read a day in (the first live sheet jumped 18:00 → 10:00 → 14:30).
const byClock = (a, b) => (isAllDay(b) - isAllDay(a)) || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
function DayEvents({ events, t, loc }) {
  if (!events.length) return html`<p class="text-sm text-muted py-4 text-center">${T(t, "dayEmpty")}</p>`;
  return html`<div class="flex flex-col gap-[var(--ms-gap)]">${VECTORS.filter((v) => events.some((e) => e.vector === v.id)).map((v) => html`
    <section key=${v.id} data-group=${v.id}>
      <h3 class=${`flex items-center gap-1.5 ${LABEL}`}>${Icon(v.icon, "text-base")}${T(t, VKEY[v.id])}</h3>
      <div class="divide-y divide-base-300/40">${events.filter((e) => e.vector === v.id).sort(byClock).map((e, i) => html`<${EventRow} key=${i} e=${e} t=${t} loc=${loc} />`)}</div>
    </section>`)}</div>`;
}

const Pickers = ({ t, region, vector }) => html`<div class="flex flex-col gap-2 min-w-0">
  <${Segmented} attr="data-region" label=${T(t, "region")} variant="outline" size="sm" scroll
    items=${REGION_IDS.map((id) => ({ id, label: T(t, "reg" + (id === "mine" ? "Mine" : id === "all" ? "All" : id)) }))}
    value=${region} onChange=${(id) => $region.set(id)} />
  <${Segmented} attr="data-vec" label=${T(t, "vectors")} size="sm" scroll
    items=${[{ id: "all", label: T(t, "vAll") }, ...VECTORS.map((v) => ({ id: v.id, label: T(t, VKEY[v.id]), icon: v.icon }))]}
    value=${vector} onChange=${(id) => $vector.set(id)} />
</div>`;

const Skeleton = () => html`<div class="flex flex-col gap-2" data-skeleton>${[0, 1, 2, 3, 4, 5].map((i) => html`
  <div key=${i} class="flex items-center gap-3 py-2"><span class="w-11 h-11 rounded-[var(--ms-r)] sf-inset shrink-0"></span>
    <span class="flex-1 flex flex-col gap-1"><${Scramble} len=${22 - i} /><span class="text-muted text-sm"><${Scramble} len=${12} /></span></span></div>`)}</div>`;

const Offline = ({ t }) => html`<div class="flex flex-col items-center text-muted py-16 gap-3 text-center px-6" data-offline>
  ${Icon("lucide:cloud-off", "text-3xl")}<span class="text-sm">${T(t, "noConnection")}</span></div>`;

// ── tab 1: the days ahead ──────────────────────────────────────────────────────────────────────────────────────────
export function days({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), loc = useStore(S.locale), region = useStore($region), vector = useStore($vector);
  const { data, err } = useVassago(region);
  const all = data?.events || [];
  const only = vector === "all" ? null : vector;
  const grouped = useMemo(() => byDay(all, { only }), [all, only]);
  const now = Date.now(), todayKey = dayKeyOf(now);
  const next = useMemo(() => nextBig(all, now), [all]);
  const today = grouped.days.find((d) => d.day === todayKey);
  const ahead = grouped.days.filter((d) => d.day >= todayKey);
  const open = typeof screen === "string" && screen.startsWith("day:") ? screen.slice(4) : null;
  const openDay = open ? (grouped.days.find((d) => d.day === open) || { day: open, events: [] }) : null;
  const state = !data ? (err ? "error" : "loading") : "ready";

  return html`<${Fragment}>
    <div class="flex flex-col gap-[var(--ms-gap)] min-w-0" data-state=${state} data-region-sel=${region} data-vec-sel=${vector}>
      <div data-hero class="vg-hero rounded-[var(--ms-r)] sf-raised sf-e2 p-[var(--ms-pad)] flex flex-col gap-2 min-w-0">
        <div class="flex items-baseline justify-between gap-2 min-w-0">
          <span class=${LABEL}>${T(t, "today")}</span>
          <span class="font-mono text-sm text-base-content/80 truncate">${longDay(new Date(), loc)}</span>
        </div>
        ${data ? html`<${Fragment}>
          <div class="flex items-center gap-1.5 flex-wrap" data-today-count=${today?.events.length || 0}>
            ${VECTORS.filter((v) => today?.counts[v.id]).map((v) => html`<span key=${v.id} class="flex items-center gap-1 text-sm"><${Dot} v=${v.id} /><span class="font-mono tabular-nums">${today.counts[v.id]}</span></span>`)}
            ${today ? html`<span class="text-sm text-muted truncate min-w-0 flex-1">${labelOf(today.events[0], loc, t)}</span>` : html`<span class="text-sm text-muted">${T(t, "dayEmpty")}</span>`}
          </div>
          <div class="flex flex-col gap-0.5 pt-2 border-t border-base-content/10 min-w-0" data-next=${next ? next.kind : ""}>
            <span class=${LABEL}>${T(t, "next")}</span>
            ${next ? html`<button type="button" class="text-left min-w-0 ms-press" onClick=${() => openScreen("day:" + (next.date && next.date.length === 10 ? next.date : dayKeyOf(Date.parse(next.at))))}>
              <span class="block font-bold text-lg leading-tight break-words"><${Dot} v=${next.vector} /> ${labelOf(next, loc, t)}</span>
              <span class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-base-content/80 mt-0.5">
                <span class="font-mono tabular-nums" data-countdown>${untilLabel(startOf(next) - now, loc)}</span>
                <span class="text-muted">${isAllDay(next)
                  ? fmt(loc, { weekday: "short", day: "numeric", month: "short" }).format(dateOf(next.date))
                  : fmt(loc, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(next.at))}</span>
                <${Country} cc=${next.country} />
                ${next.certainty === "estimated" ? html`<span class="text-warning">≈ ${T(t, "estimated")}</span>` : null}
              </span>
            </button>` : html`<span class="text-sm text-muted">${T(t, "nothingNext")}</span>`}
          </div>` : html`<${Scramble} len=${24} />`}
      </div>

      <${Pickers} t=${t} region=${region} vector=${vector} />
      ${data && err ? html`<span data-stale class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-warning">${T(t, "stale", { t: ago(now - data.at, loc) })}</span>` : null}

      ${!data ? (err ? html`<${Offline} t=${t} />` : html`<${Skeleton} />`)
      : !ahead.length && !grouped.undated.length ? html`<p class="text-sm text-muted py-10 text-center" data-empty>${T(t, "empty")}</p>`
      : html`<div class="flex flex-col min-w-0 divide-y divide-base-300/40" data-days=${ahead.length}>
          ${ahead.map((d, i) => html`<${DayRow} key=${d.day} d=${d} t=${t} loc=${loc} i=${i} isToday=${d.day === todayKey} onOpen=${() => openScreen("day:" + d.day)} />`)}
        </div>`}
      ${data && grouped.undated.length ? html`<${Panel} title=${T(t, "undated")} data-undated=${grouped.undated.length}>
        <div class="divide-y divide-base-300/40">${grouped.undated.map((e, i) => html`<div key=${i} class="flex items-center gap-2.5 py-2 min-w-0">
          <span class="w-16 shrink-0 font-mono text-sm text-base-content/80">${e.date.length === 7 ? fmt(loc, { month: "short", year: "numeric" }).format(dateOf(e.date + "-15")) : e.date}</span>
          <span class="min-w-0 flex-1 flex items-center gap-1.5"><${Dot} v=${e.vector} /><span class="truncate">${labelOf(e, loc, t)}</span></span><${Country} cc=${e.country} /></div>`)}</div>
      <//>` : null}
      <p class="text-xs text-muted text-center px-4 pb-2">${T(t, "certainty")}</p>
    </div>

    <${Sheet} id="daysheet" open=${!!openDay} onClose=${closeScreen} icon="lucide:calendar"
      title=${openDay ? longDay(dateOf(openDay.day), loc) : ""}
      subtitle=${openDay ? T(t, "events", { n: openDay.events.length }) : ""}>
      ${openDay ? html`<div data-day-sheet=${openDay.day}><${DayEvents} events=${openDay.events} t=${t} loc=${loc} /></div>` : null}
    <//>
  </${Fragment}>`;
}

function DayRow({ d, t, loc, i, isToday, onOpen }) {
  const date = dateOf(d.day), lead = d.events.slice(0, 2), rest = d.events.length - lead.length;
  return html`<button type="button" data-day-row=${d.day} style=${`--i:${Math.min(i, 12)}`}
    class=${`flex items-center gap-3 py-2.5 w-full text-left min-w-0 ms-press ${isToday ? "vg-today" : ""}`} onClick=${onOpen}>
    <span class="vg-date w-11 shrink-0 flex flex-col items-center rounded-[var(--ms-r)] sf-inset py-1">
      <span class="font-mono font-semibold tabular-nums text-lg leading-none">${date.getDate()}</span>
      <span class="font-mono text-[0.62rem] uppercase tracking-wider text-muted">${fmt(loc, { weekday: "short" }).format(date)}</span>
    </span>
    <span class="min-w-0 flex-1 flex flex-col gap-0.5">
      ${lead.map((e, k) => html`<span key=${k} class=${`flex items-center gap-1.5 min-w-0 ${k ? "text-sm text-muted" : "font-medium"}`}>
        <${Dot} v=${e.vector} /><span class="truncate">${labelOf(e, loc, t)}</span><${Country} cc=${e.country} /></span>`)}
    </span>
    <span class="flex flex-col items-end gap-1 shrink-0">
      <span class="flex gap-0.5">${VECTORS.filter((v) => d.counts[v.id]).map((v) => html`<${Dot} key=${v.id} v=${v.id} />`)}</span>
      ${rest > 0 ? html`<span class="font-mono tabular-nums text-xs text-muted">${T(t, "more", { n: rest })}</span>` : null}
    </span>
  </button>`;
}

// ── tab 2: the month ───────────────────────────────────────────────────────────────────────────────────────────────
export function month({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale), region = useStore($region), vector = useStore($vector);
  const { data, err } = useVassago(region);
  const all = data?.events || [];
  const grouped = useMemo(() => byDay(all, { only: vector === "all" ? null : vector }), [all, vector]);
  const here = monthKey(Date.now());
  const [ym, setYm] = useState(here);
  const [day, setDay] = useState(dayKeyOf(Date.now()));
  const marks = useMemo(() => Object.fromEntries(grouped.days.map((d) => [d.day, d.events.length])), [grouped]);
  const last = grouped.days.length ? grouped.days[grouped.days.length - 1].day.slice(0, 7) : here;
  const picked = grouped.days.find((d) => d.day === day);

  return html`<div class="flex flex-col gap-[var(--ms-gap)] min-w-0" data-month=${ym} data-day=${day}>
    <${Pickers} t=${t} region=${region} vector=${vector} />
    <${Panel}>
      <${Calendar} month=${ym} onMonth=${(m) => setYm(m)} marks=${marks} value=${day} pick="all" min=${here} max=${last < here ? here : last}
        locale=${loc} onPick=${(k) => setDay(k)} />
    <//>
    ${!data ? (err ? html`<${Offline} t=${t} />` : html`<${Skeleton} />`)
      : html`<${Panel} title=${longDay(dateOf(day), loc)} data-month-list=${picked?.events.length || 0}>
          <${DayEvents} events=${picked?.events || []} t=${t} loc=${loc} />
        <//>`}
  </div>`;
}
