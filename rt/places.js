import { gate } from "@microspec/core/runtime/gate.js";
import { Effect } from "@microspec/core/runtime/fx.js";
import { filter, flat, isTruthy, map, pipe, take, uniqueBy } from "@microspec/core/runtime/remeda.js";
import { tried } from "./task.js";
import { PLACES } from "./places.config.js";

const DIGRAPHS = [["зг", "zgh"], ["ЗГ", "ZGh"], ["Зг", "Zgh"]];
const MAP = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i",
  ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", ъ: "", ы: "y", э: "e", ё: "e",
};
const INITIAL = { є: "ye", ї: "yi", й: "y", ю: "yu", я: "ya" };

export const isCyrillic = (s) => /[Ѐ-ӿ]/.test(String(s || ""));

export function translit(input) {
  let s = String(input || "");
  for (const [from, to] of DIGRAPHS) s = s.split(from).join(to);
  let out = "", atWordStart = true;
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const table = atWordStart && INITIAL[lower] ? INITIAL : MAP;
    const mapped = table[lower];
    if (mapped == null) { out += ch; atWordStart = !/[\p{L}\p{N}']/u.test(ch); continue; }
    out += ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    atWordStart = false;
  }
  return out;
}

export function toPlace(r) {
  if (!r || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude) || !r.timezone) return null;
  return {
    id: r.id, name: r.name, country: r.country || "", countryCode: r.country_code || "",
    region: r.admin1 || "",
    lat: r.latitude, lng: r.longitude, zone: r.timezone,
  };
}

export function placeLabel(p) {
  if (!p) return "";
  const region = p.region && p.region !== p.name ? p.region : "";
  return [p.name, [region, p.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}

export function formatCoords(lat, lng) {
  const one = (v, pos, neg) => {
    const a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 60);
    const carry = m === 60;
    return `${d + (carry ? 1 : 0)}°${String(carry ? 0 : m).padStart(2, "0")}'${v < 0 ? neg : pos}`;
  };
  return `${one(lat, "N", "S")} ${one(lng, "E", "W")}`;
}

export async function searchPlaces(query, { count = PLACES.count, signal } = {}) {
  const q = String(query || "").trim();
  if (q.length < PLACES.minQuery || gate) return [];
  const queries = isCyrillic(q) ? [translit(q), q] : [q];
  const named = (name) => tried(async () => {
    const res = await fetch(`${PLACES.endpoint}?name=${encodeURIComponent(name)}&count=${count}&language=${PLACES.language}&format=json`, { signal });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.results) ? json.results : [];
  }).pipe(Effect.catch(() => Effect.succeed([])));
  const runs = await Effect.runPromise(Effect.forEach(queries, named, { concurrency: "unbounded" }));
  return pipe(runs, flat(), map((row) => toPlace(row)), filter(isTruthy), uniqueBy((p) => p.id), take(count));
}
