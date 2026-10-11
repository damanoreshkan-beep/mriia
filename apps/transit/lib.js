import { html } from "htm/preact";
import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { shapeOf, pathOf, scalePath, shaper } from "/_rt/shape.js";
import { Sign } from "/_rt/zodiac.js";
import { BODIES, BODY_KEYS, eclipticPositions, natalHouses } from "/_rt/astro.js";
import { transits, norm360, wrap180, TRANSIT_ORB } from "/_rt/natal.js";
import { resolve, BIRTH_CODEC } from "/_rt/birth.js";
import { gate } from "/_rt/gate.js";

export const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
export const DAY = 86400000;
export const LBL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
export const META = "font-mono text-[length:var(--ms-label)] text-base-content/70";
export const wheelAngle = (lon) => norm360(270 - lon);
export const signOf = (lon) => Math.floor(norm360(lon) / 30);
const degIn = (lon) => norm360(lon) % 30;
export const bodyLabel = (t, k) => T(t, k === "asc" || k === "mc" ? (k === "asc" ? "angAsc" : "angMc") : "b" + k[0].toUpperCase() + k.slice(1));
export const pt = (deg, r) => { const a = deg * Math.PI / 180; return [(50 + r * Math.sin(a)).toFixed(2), (50 - r * Math.cos(a)).toFixed(2)]; };
export const dm = (lon) => { const d = degIn(lon), g = Math.floor(d); return `${g}°${String(Math.floor((d - g) * 60)).padStart(2, "0")}'`; };

export const ASPECT_HUE = { soft: "var(--color-success)", hard: "var(--color-error)", neutral: "var(--color-base-content)" };
export const ASPECT_DASH = { soft: "", hard: "2 2.4", neutral: "0.6 2" };
export const ASPECT_KEY = { conjunction: "aspConjunction", sextile: "aspSextile", square: "aspSquare", trine: "aspTrine", opposition: "aspOpposition" };
export const CHIPS = [[0, "today"], [1, "tomorrow"]];
export const SCRUB = 365;
const pad2 = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const dayOffset = (s, now) => { const [y, m, d] = s.split("-").map(Number); return Math.round((midnight(new Date(y, m - 1, d)) - midnight(now)) / DAY); };
export const clampScrub = (n) => Math.max(-SCRUB, Math.min(SCRUB, n));

const GATE_BIRTH = { date: "1990-07-15", time: "14:32:00", zoneMode: "place", offset: "",
  place: { id: 703448, name: "Kyiv", country: "Ukraine", countryCode: "UA", region: "Kyiv", lat: 50.45466, lng: 30.5238, zone: "Europe/Kyiv" } };
export const NOW = () => (gate ? new Date("2026-07-25T12:00:00Z") : new Date());

export const $birth = persistentAtom("transit:birth", gate ? GATE_BIRTH : null, BIRTH_CODEC);
export const $offset = atom(0);

export function useChart(S) {
  const rec = useStore($birth), offset = useStore($offset), filters = useStore(S.filters);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 60000); return () => clearInterval(id); }, []);
  const shownKey = String(filters.bodies || "");
  const system = filters.houseSystem || "placidus";
  return useMemo(() => {
    const shown = Array.isArray(filters.bodies) && filters.bodies.length ? filters.bodies : BODY_KEYS;
    const b = rec ? resolve(rec) : { ok: false, reason: "date" };
    const when = new Date(NOW().getTime() + offset * DAY);
    const sky = eclipticPositions(when, shown);
    const prevSky = eclipticPositions(new Date(when.getTime() - DAY), shown);
    const prevMap = Object.fromEntries(prevSky.map((p) => [p.key, p.lon]));
    const retro = (k, lon) => (k === "sun" || k === "moon" || prevMap[k] == null) ? false : wrap180(lon - prevMap[k]) < 0;
    if (!b.ok) return { rec, b, when, sky, prevMap, retro, shown, ready: false };

    const H = natalHouses(b.date, b.lat, b.lng, system);
    const natal = eclipticPositions(b.date, shown);
    const natalRetro = Object.fromEntries(eclipticPositions(new Date(b.ms - DAY), shown).map((p) => [p.key, p.lon]));
    const targets = [...natal, { key: "asc", lon: H.asc }, { key: "mc", lon: H.mc }];
    const hits = transits(sky, targets, { prev: prevMap, orb: TRANSIT_ORB.range });
    // the Sun's sign for the person's orb, apart from `natal`: the bodies filter may have hidden the Sun
    const sunSign = signOf(eclipticPositions(b.date, ["sun"])[0]?.lon ?? 0);
    return { rec, b, when, sky, prevMap, retro, shown, ready: true, H, natal, targets, hits, sunSign, system: H.system,
      natalRetroFor: (k, lon) => (k === "sun" || k === "moon" || natalRetro[k] == null) ? false : wrap180(lon - natalRetro[k]) < 0 };
  }, [rec, offset, shownKey, system, Math.floor(Date.now() / 60000)]);
}

export const READ_TRANSIT = "tr:", READ_PLACEMENT = "pl:", READ_CUSP = "cu:", READ_PORTRAIT = "portrait", READ_ASK = "ask";
export const readScreen = (screen, pfx) => (typeof screen === "string" && screen.startsWith(pfx)) ? screen.slice(pfx.length) : null;

export const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const signName = (t, i) => T(t, "s" + i);
export const digKey = (d) => "dig" + cap1(d);

export function fmtHitAt(ms, prec, locale) {
  const loc = locale === "en" ? "en-GB" : locale || "uk";
  const d = new Date(ms);
  const date = d.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
  if (prec === "day") return date;
  const time = d.toLocaleTimeString(loc, prec === "second"
    ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

export const hitKey = (a) => `${a.t}|${a.n}|${a.type}`;

// a transiting planet's own form (core shape.js organic set), filled with the planet's own colour. shapeOf(key)
// seeded it, but ten bodies on thirteen forms collide (sun/jupiter both land on Cookie12Sided, venus/neptune on
// VerySunny), so the ten are pinned: the hash's pick where it was free, the two colliders on free forms. The same planet is the same form on the wheel's contacts and on the moments.
const BODY_FORM = { sun: "Cookie12Sided", moon: "Clover4Leaf", mercury: "PuffyDiamond", venus: "VerySunny", mars: "Clover8Leaf",
  jupiter: "Cookie9Sided", saturn: "Cookie4Sided", uranus: "Sunny", neptune: "Flower", pluto: "Cookie6Sided" };
export const bodyForm = (p, cls = "") => html`<svg data-body=${p} data-form=${BODY_FORM[p]} viewBox="0 0 1 1" aria-hidden="true"
  class=${`tr-body ${cls}`} style=${`--body:${BODIES[p].color}`}><path d=${pathOf(BODY_FORM[p])} /></svg>`;

// THE ORB — whose chart this is. The person's own form, seeded by the birth DATE so the same person is the same
// form on the wheel, in the chart and in the match; the theme's texture through it, a rim of light, the Sun's sign
// on it. A new date flows it into the new form (one-shot; instant under reduced motion and in the gate). Layout
// effects, so the first paint already has the form, never an unclipped square; the clip follows the measured size.
export function PersonOrb({ seed, sign, big }) {
  const orb = useRef(), fill = useRef(), rim = useRef(), form = useRef();
  const name = shapeOf(seed);
  useLayoutEffect(() => {
    let w = orb.current.offsetWidth, last = "";
    const lay = (d) => {
      last = d;
      if (w) fill.current.style.clipPath = `path("${scalePath(d, w)}")`;
      for (const p of rim.current.children) p.setAttribute("d", d);
    };
    form.current = shaper(name, lay);
    const ro = new ResizeObserver(() => { const nw = orb.current?.offsetWidth || 0; if (nw !== w) { w = nw; if (last) lay(last); } });
    ro.observe(orb.current);
    return () => { ro.disconnect(); form.current.stop(); };
  }, []);
  useLayoutEffect(() => { form.current?.to(name); }, [name]);
  return html`<span ref=${orb} data-orb data-form=${name} class=${`tr-orb ${big ? "tr-orb-lg" : ""}`} aria-hidden="true">
    <span ref=${fill} class="tr-fill"></span>
    <svg ref=${rim} class="tr-rim" viewBox="0 0 1 1"><path class="b" /><path class="e" /></svg>
    <${Sign} i=${sign} cls="tr-sign" />
  </span>`;
}
