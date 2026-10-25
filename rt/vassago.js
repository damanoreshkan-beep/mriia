// rt/vassago.js — the product's half of Vassago (apps/vassago), the face of the edge's /feed/vassago: everything known
// IN ADVANCE — the sky computed, every country's holidays, central banks and releases, exchange closures, elections,
// token unlocks. The edge computes and pools (microspec-edge/edge/vassago.js); this module only arranges what came back:
// which local day an event belongs to, which events lead a day, which one is the next big thing. No astronomy, no
// prices, no forecast here — the farm rule is that math lives on the edge.
import { VPS_PROXY } from "@microspec/core/runtime/feed.js";

export const VECTORS = [
  { id: "sky", icon: "lucide:moon-star" },
  { id: "macro", icon: "lucide:landmark" },
  { id: "markets", icon: "lucide:candlestick-chart" },
  { id: "politics", icon: "lucide:vote" },
  { id: "holidays", icon: "lucide:party-popper" },
  { id: "crypto", icon: "lucide:bitcoin" },
];
export const VECTOR_IDS = VECTORS.map((v) => v.id);

// Regions the reader picks (persisted in the view). "mine" = the economies that move the markets the owner trades, plus
// Ukraine and Israel (owner 2026-10-25: «особливо цікавлять цифри майбутнього ізраїлю»). "all" = every country.
export const REGIONS = {
  mine: ["UA", "US", "EU", "GB", "DE", "IL", "JP", "CN"],
  UA: ["UA"],
  IL: ["IL"],
  US: ["US"],
  EU: ["EU", "DE", "FR", "IT", "ES", "NL"],
  all: null,
};
export const REGION_IDS = Object.keys(REGIONS);
export const DAYS = 60;

/** The edge URL for a region. `base` = the farm's /feed (VPS_PROXY by default). Pure. */
export function vassagoUrl(region = "mine", { days = DAYS, base = VPS_PROXY } = {}) {
  const cs = REGIONS[region] === undefined ? REGIONS.mine : REGIONS[region];
  return `${base}/vassago?days=${days}&natal=eth${cs ? `&countries=${cs.join(",")}` : ""}`;
}

const pad = (n) => String(n).padStart(2, "0");
/** A LOCAL day key "YYYY-MM-DD" for an instant (the reader's time zone). */
export const dayKeyOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// A holiday, an election or an exchange closure is a CALENDAR day where it happens — its `date` is the day, whatever the
// reader's zone (Christmas in Sydney is still the 25th). A timed event (a rate decision at 18:00 UTC) is the reader's day.
const CALENDAR_KINDS = new Set(["public", "bank", "observance", "optional", "school", "election", "exchange_closed"]);
/** The local day an event belongs to; null for a month/year-precision event (it has no day). */
export function dayOf(e) {
  if (e.date && e.date.length < 10) return null;
  if (e.date && (CALENDAR_KINDS.has(e.kind) || e.vector === "holidays")) return e.date;
  return dayKeyOf(Date.parse(e.at));
}

// What leads a day row. Lower = stronger. A rate decision outranks everything: it is the number the market waits for.
const SKY_LEAD = new Set(["solar_eclipse", "lunar_eclipse", "moon_phase", "station", "season"]);
export function rank(e) {
  if (e.kind === "central_bank") return 0;
  if (e.kind === "election") return 1;
  if (e.kind === "solar_eclipse" || e.kind === "lunar_eclipse") return 1;
  if (e.impact === "high") return 2;
  if (e.kind === "exchange_closed") return 3;
  if (e.vector === "sky" && SKY_LEAD.has(e.kind)) return 3;
  if (e.kind === "token_unlock" || e.kind === "upgrade") return 4;
  if (e.vector === "holidays" && e.kind === "public") return 5;
  if (e.impact === "medium") return 6;
  if (e.vector === "sky" && e.kind === "ingress" && e.data?.body !== "Moon") return 7;
  return 9;
}
/** Is this event big enough to count down to? (the hero's "next") */
export const isBig = (e) => rank(e) <= 2;

/** Events → [{ day, events (ranked), counts: {vector: n} }] for the days in [fromKey, …), sorted; plus the undated
 *  (month/year precision) list. `only` = a vector id to keep, or null. Pure. */
export function byDay(events, { only = null } = {}) {
  const days = new Map(), undated = [];
  for (const e of events || []) {
    if (only && e.vector !== only) continue;
    const k = dayOf(e);
    if (!k) { undated.push(e); continue; }
    let d = days.get(k);
    if (!d) days.set(k, (d = { day: k, events: [], counts: {} }));
    d.events.push(e);
    d.counts[e.vector] = (d.counts[e.vector] || 0) + 1;
  }
  const out = [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  for (const d of out) d.events.sort((a, b) => rank(a) - rank(b) || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return { days: out, undated };
}

/** The next big event at or after `now` (ms), or null. */
export function nextBig(events, now) {
  let best = null, bt = 0;
  for (const e of events || []) {
    if (!isBig(e) || (e.date && e.date.length < 10)) continue;
    const t = startOf(e);
    if (t < now) continue;
    if (!best || t < bt || (t === bt && rank(e) < rank(best))) { best = e; bt = t; }
  }
  return best;
}

// The sky's events are OURS (the edge computes them), so they are said in the reader's language from their `data`, not
// the edge's English label: "Венера → Терези", "Сонце □ Плутон", "Марс □ Уран · ETH". The dictionary is the app's
// (planets/signs/phases/seasons as "|" lists, one template per kind); a kind or a name it does not know keeps the
// edge's label — never a blank.
const BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const SEASONS = ["March equinox", "June solstice", "September equinox", "December solstice"];
const ASPECT_SYM = { conjunction: "☌", sextile: "⚹", square: "□", trine: "△", opposition: "☍" };
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ""));
export function skyLabel(e, d) {
  if (!d || e.vector !== "sky") return null;
  const list = (k) => String(d[k] || "").split("|");
  const body = (b) => list("planets")[BODIES.indexOf(b)] || null;
  const x = e.data || {};
  switch (e.kind) {
    case "moon_phase": return list("phases")[x.quarter] || null;
    case "lunar_apsis": return d[/perigee/.test(e.label) ? "skyPerigee" : "skyApogee"] || null;
    case "season": return list("seasons")[SEASONS.indexOf(e.label)] || null;
    case "ingress": { const b = body(x.body), s = list("signs")[SIGNS.indexOf(x.sign)]; return b && s ? `${b} → ${s}` : null; }
    case "station": { const b = body(x.body); return b && d.skyStation ? fill(d.skyStation, { body: b, motion: d[x.motion === "retrograde" ? "motionR" : "motionD"] || x.motion }) : null; }
    case "aspect": { const a = body(x.a), b = body(x.b); return a && b && ASPECT_SYM[x.aspect] ? `${a} ${ASPECT_SYM[x.aspect]} ${b}` : null; }
    case "transit": { const a = body(x.a), b = body(x.natal); return a && b && ASPECT_SYM[x.aspect] ? `${a} ${ASPECT_SYM[x.aspect]} ${b} · ${String(x.chart || "").toUpperCase()}` : null; }
    case "solar_eclipse": case "lunar_eclipse": return d[e.kind === "solar_eclipse" ? "skySolar" : "skyLunar"] ? fill(d[e.kind === "solar_eclipse" ? "skySolar" : "skyLunar"], { type: d["ecl_" + x.type] || x.type || "" }).trim() : null;
    case "meteor_shower": return d.skyMeteor && x.name ? fill(d.skyMeteor, { name: x.name }) : null;
    default: return null;
  }
}

/** The label a reader sees: the sky in the reader's words (dictionary `d`), Ukraine's holidays in Ukrainian for a Ukrainian
 *  reader (the edge carries the native name), and every other source's own words. */
export const labelOf = (e, locale, d = null) =>
  skyLabel(e, d) || (locale === "uk" && e.country === "UA" && e.local ? e.local : e.label);

/** Does this event happen on a calendar DAY rather than at an instant? (a holiday, an election, a closed exchange) */
export const isAllDay = (e) => !!(e.date && e.date.length === 10 && (CALENDAR_KINDS.has(e.kind) || e.vector === "holidays"));
/** The instant to count down to: an all-day event starts at the reader's local midnight of its date. */
export const startOf = (e) => (isAllDay(e) ? new Date(`${e.date}T00:00:00`).getTime() : Date.parse(e.at));

/** The gate's world: a believable fortnight from `now`, every vector and certainty present. Pure. */
export function fixtureEvents(now) {
  const D = 86400000, H = 3600000, base = new Date(now); base.setHours(0, 0, 0, 0);
  const at = (d, h) => new Date(base.getTime() + d * D + h * H).toISOString();
  const day = (d) => dayKeyOf(base.getTime() + d * D + 12 * H);
  return [
    { at: at(0, 6), vector: "sky", kind: "moon_phase", label: "full moon", certainty: "exact", source: "astronomy-engine", data: { quarter: 2, dist_km: 361200 } },
    { at: at(0, 15), vector: "macro", kind: "indicator", label: "Inflation Expectations", country: "IL", certainty: "scheduled", impact: "low", source: "biquote", data: { forecast: 1.4, previous: 1.3 } },
    { at: at(1, 0), date: day(1), vector: "politics", kind: "election", label: "Israel — Knesset", country: "IL", certainty: "estimated", source: "elections-cal" },
    { at: at(1, 0), date: day(1), vector: "markets", kind: "exchange_closed", label: "TASE closed — Knesset Election Day", country: "IL", certainty: "scheduled", source: "tase.co.il" },
    { at: at(2, 20), vector: "macro", kind: "central_bank", label: "Fed Interest Rate Decision", country: "US", certainty: "scheduled", impact: "high", source: "biquote" },
    { at: at(2, 22), vector: "sky", kind: "lunar_apsis", label: "lunar perigee", certainty: "exact", source: "astronomy-engine", data: { dist_km: 364397 } },
    { at: at(3, 13), vector: "macro", kind: "central_bank", label: "NBU Interest Rate Decision", country: "UA", certainty: "scheduled", impact: "high", source: "biquote" },
    { at: at(3, 15), vector: "macro", kind: "central_bank", label: "ECB Interest Rate Decision", country: "EU", certainty: "scheduled", impact: "high", source: "biquote" },
    { at: at(3, 14), vector: "macro", kind: "indicator", label: "GDP q/q", country: "US", certainty: "scheduled", impact: "high", source: "biquote", data: { forecast: 1.8, previous: 2.1 } },
    { at: at(4, 0), date: day(4), vector: "holidays", kind: "public", label: "Independence Day", local: "День незалежності", country: "UA", certainty: "scheduled", source: "date-holidays" },
    { at: at(5, 9), vector: "crypto", kind: "token_unlock", label: "EigenLayer investor and contributor monthly vesting window", certainty: "scheduled", source: "financecalendar" },
    { at: at(6, 18), vector: "sky", kind: "station", label: "Mercury stations direct", certainty: "exact", source: "astronomy-engine", data: { body: "Mercury", motion: "direct" } },
    { at: at(8, 14), vector: "macro", kind: "central_bank", label: "Bank of Israel interest rate decision", country: "IL", certainty: "scheduled", impact: "high", source: "boi.org.il" },
    { at: at(9, 0), date: day(9), vector: "holidays", kind: "observance", label: "Hanukkah", country: "IL", certainty: "scheduled", source: "date-holidays" },
    { at: at(11, 4), vector: "sky", kind: "transit", label: "Mars square natal Uranus (eth)", certainty: "exact", source: "astronomy-engine", data: { a: "Mars", natal: "Uranus", aspect: "square", chart: "eth" } },
    { at: at(13, 7), vector: "sky", kind: "moon_phase", label: "new moon", certainty: "exact", source: "astronomy-engine", data: { quarter: 0, dist_km: 405100 } },
    { at: new Date(base.getFullYear(), base.getMonth() + 2, 1).toISOString(), date: `${base.getFullYear() + (base.getMonth() + 2 > 11 ? 1 : 0)}-${pad(((base.getMonth() + 2) % 12) + 1)}`, vector: "politics", kind: "election", label: "Mongolia — President", country: "MN", certainty: "estimated", source: "wikipedia" },
  ];
}
