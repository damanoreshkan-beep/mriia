const NBSP = " ";
import { Effect } from "@microspec/core/runtime/fx.js";
import { filter, find, groupBy, map, pipe, reduce } from "@microspec/core/runtime/remeda.js";
import { abortAfter, tried } from "./task.js";
import { WISH } from "./wish.config.js";

const CUR = {
  "$": "USD", "us$": "USD", "usd": "USD",
  "€": "EUR", "eur": "EUR",
  "£": "GBP", "gbp": "GBP",
  "₴": "UAH", "uah": "UAH", "грн": "UAH", "грн.": "UAH",
  "zł": "PLN", "zl": "PLN", "pln": "PLN",
};
export const CURRENCIES = ["UAH", "USD", "EUR", "GBP", "PLN"];
const SYMBOL = { UAH: "₴", USD: "$", EUR: "€", GBP: "£", PLN: "zł" };
const SUFFIX = { UAH: true, PLN: true };

const curOf = (tok) => CUR[String(tok || "").toLowerCase()] || null;

export function toNumber(raw) {
  let s = String(raw || "").replace(/\s/g, "");
  if (!s) return null;
  const hasDot = s.includes("."), hasComma = s.includes(",");
  if (hasDot && hasComma) s = s.replace(/,/g, "");
  else if (hasComma) s = /,\d{2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const CUR_RE = "\\$|€|£|₴|zł|zl|us\\$|usd|eur|gbp|uah|pln|грн\\.?";
const NUM_RE = "\\d[\\d.,\\u00a0\\u202f ]*\\d|\\d";
const PRICE_RE = new RegExp(`(?:(${CUR_RE})\\s*)?(${NUM_RE})(?:\\s*(${CUR_RE}))?`, "gi");

export function parsePrice(text) {
  return pipe(
    [...String(text || "").matchAll(PRICE_RE)],
    map((m) => ({ cur: curOf(m[1]) || curOf(m[3]), m })),
    filter(({ cur }) => !!cur),
    map(({ cur, m }) => ({ price: toNumber(m[2]), currency: cur })),
    find(({ price }) => price != null && price > 0),
  ) ?? null;
}

function pickImage(data) {
  const imgs = data && data.images;
  if (imgs && typeof imgs === "object") {
    for (const v of Object.values(imgs)) if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  }
  const m = String(data && data.content || "").match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
  return m ? m[1] : "";
}

export function parseWishMeta(data, url) {
  data = data || {};
  const title = String(data.title || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const body = `${data.title || ""} ${data.description || ""} ${String(data.content || "").slice(0, 4000)}`;
  const p = parsePrice(body);
  return { title, image: pickImage(data), price: p ? p.price : null, currency: p ? p.currency : null };
}

export async function fetchWishMeta(url) {
  const read = (signal) => tried(async () => {
    const r = await fetch(WISH.reader + url, { signal, headers: { Accept: "application/json", "X-Timeout": WISH.readerTimeout } });
    if (!r.ok) throw new Error("status " + r.status);
    return (await r.json())?.data || {};
  });
  return await Effect.runPromise(abortAfter(WISH.timeout, read).pipe(Effect.map((data) => parseWishMeta(data, url))));
}

export function sortWishes(list) {
  return [...(list || [])].sort((a, b) => (b.want || 0) - (a.want || 0) || (b.createdAt || 0) - (a.createdAt || 0));
}

export function wishTotals(list) {
  const by = pipe(
    list || [],
    filter((w) => !w.granted && w.price != null && w.price > 0),
    groupBy((w) => w.currency || "UAH"),
  );
  return pipe(
    CURRENCIES,
    filter((c) => !!by[c]),
    map((c) => ({ currency: c, sum: reduce(by[c], (s, w) => s + w.price, 0), count: by[c].length })),
  );
}

export function fmtMoney(n, currency) {
  if (n == null || !Number.isFinite(n)) return "";
  const sym = SYMBOL[currency] || "";
  const int = Math.trunc(Math.abs(n));
  const grouped = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const frac = Math.round((Math.abs(n) - int) * 100);
  const num = (n < 0 ? "-" : "") + grouped + (frac ? "," + String(frac).padStart(2, "0") : "");
  return SUFFIX[currency] ? num + NBSP + sym : sym + num;
}
