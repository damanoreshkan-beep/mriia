import { VPS_PROXY } from "@microspec/core/runtime/feed.js";
import { gate } from "@microspec/core/runtime/gate.js";
import { Effect } from "@microspec/core/runtime/fx.js";
import { tried } from "./task.js";
import { COINS } from "./coins.config.js";

const tg = () => { try { return (typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp) || null; } catch { return null; } };

/** The packs the sheet lists, in the edge's order (mirrored here so the sheet renders before any call). */
export const PACKS = [
  { sku: "c500", coins: 500, stars: 25 },
  { sku: "c1500", coins: 1500, stars: 60 },
  { sku: "c5000", coins: 5000, stars: 150 },
];
/** A pack by sku, or null. Pure. */
export const packOf = (sku) => PACKS.find((p) => p.sku === sku) || null;
/** Stars per coin, for the sheet's "best value" mark: the pack with the lowest ratio. Pure. */
export const bestValue = (packs = PACKS) => packs.reduce((b, p) => (!b || p.stars / p.coins < b.stars / b.coins ? p : b), null)?.sku || "";

const H = { "content-type": "application/json" };

/**
 * Start a purchase. Resolves "paid" (Mini App: Telegram's own callback) | "opened" (the link went to Telegram; the wallet
 * sees the coins when it lands) | "cancelled" | "failed" | "eSignIn" | "error".
 */
export async function buyCoins(sku) {
  if (gate || !packOf(sku)) return "error";
  const invoiced = tried(async () => {
    const r = await fetch(`${VPS_PROXY}${COINS.invoice}`, { method: "POST", headers: H, body: JSON.stringify({ sku }) });
    if (r.status === 401) return { code: "eSignIn" };
    const j = await r.json().catch(() => ({}));
    return { link: j.link };
  }).pipe(Effect.catch(() => Effect.succeed({ code: "error" })));
  const settled = (w, link) => Effect.callback((resume) => {
    try { w.openInvoice(link, (s) => resume(Effect.succeed(s || "failed"))); } catch { resume(Effect.succeed("error")); }
  });
  const opened = (link) => Effect.sync(() => {
    try { const win = window.open(link, "_blank", "noopener"); if (!win) location.href = link; } catch { location.href = link; }
    return "opened";
  });
  const paid = (link) => Effect.suspend(() => {
    const w = tg();
    return w && w.initData && w.openInvoice ? settled(w, link) : opened(link);
  });
  return await Effect.runPromise(invoiced.pipe(
    Effect.flatMap(({ code, link }) => code ? Effect.succeed(code) : !link ? Effect.succeed("error") : paid(link)),
  ));
}
