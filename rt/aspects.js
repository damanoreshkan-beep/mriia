import { filter, flatMap, isTruthy, map, pipe } from "@microspec/core/runtime/remeda.js";

export const ASPECTS = [
  { type: "conjunction", angle: 0, orb: 8, nature: "neutral" },
  { type: "sextile", angle: 60, orb: 4, nature: "soft" },
  { type: "square", angle: 90, orb: 6, nature: "hard" },
  { type: "trine", angle: 120, orb: 6, nature: "soft" },
  { type: "opposition", angle: 180, orb: 8, nature: "hard" },
];

const norm360 = (d) => (((d % 360) + 360) % 360);
const sep = (a, b) => { const d = Math.abs(norm360(a) - norm360(b)); return d > 180 ? 360 - d : d; };

const aspectOf = ([a, b], prevLon) => {
  const s = sep(a.lon, b.lon);
  const lum = a.key === "sun" || a.key === "moon" || b.key === "sun" || b.key === "moon";
  const asp = ASPECTS.find((x) => !(Math.abs(s - x.angle) > x.orb + (lum ? 2 : 0)));
  if (!asp) return null;
  const delta = Math.abs(s - asp.angle);
  const pa = prevLon && prevLon[a.key], pb = prevLon && prevLon[b.key];
  const applying = pa != null && pb != null ? Math.abs(sep(pa, pb) - asp.angle) > delta : null;
  return { a: a.key, b: b.key, type: asp.type, nature: asp.nature, angle: asp.angle, orb: +delta.toFixed(2), applying };
};

export function aspects(positions, prevLon = null) {
  return pipe(
    positions,
    flatMap((a, i) => positions.slice(i + 1).map((b) => [a, b])),
    filter(([a, b]) => a.lon != null && b.lon != null),
    map((pair) => aspectOf(pair, prevLon)),
    filter(isTruthy),
  ).sort((x, y) => x.orb - y.orb);
}
