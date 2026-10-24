// rt/pay.js — the farm's ways to pay, in the shape the core's pay sheet takes (`@microspec/core/runtime/paysheet.js`).
// The sheet is systemic and knows no network; this module is the product's half: Telegram Stars (the Mini App's own
// invoice, or Telegram opened from the browser) and TON (an invoice from the edge, paid in any TON wallet, credited
// by the edge's watcher). Every amount and price is the EDGE's: the packs mirror the edge's COIN_PACKS for the first
// paint, and the TON prices arrive with the wallet (`/feed/wallet/me` → `ton.prices`), never computed here.
import { VPS_PROXY } from "@microspec/core/runtime/feed.js";
import { sys } from "@microspec/core/runtime/i18n.js";
import { PACKS, buyCoins, packOf } from "./coins.js";

const H = { "content-type": "application/json" };

/** The packs for the sheet: `{ id, amount }` in the edge's order. Pure. */
export const sheetPacks = () => PACKS.map((p) => ({ id: p.sku, amount: p.coins }));

// resolves when the wallet sees coins arrive — the event an "opened elsewhere" payment ends on
const boughtSignal = (wallet, signal) => new Promise((ok) => {
  const off = wallet.$bought.listen((v) => { if (v > 0) { off(); ok({ status: "paid", coins: v, balance: wallet.$wallet.get().balance }); } });
  signal.addEventListener("abort", () => { off(); ok(null); }, { once: true });
});

/**
 * Stars: inside Telegram the invoice settles in place; from a browser it opens in Telegram and the sheet waits for
 * the wallet to see the coins (the wallet already re-reads itself on `purchasing()`).
 */
export function starsMethod(wallet) {
  return {
    id: "stars", label: "Stars", icon: "lucide:star",
    price: (pack) => `${packOf(pack.id)?.stars ?? "?"} ★`,
    pay: async (pack) => {
      const r = await buyCoins(pack.id);
      if (r === "paid") { wallet.purchasing(); return { status: "paid", coins: pack.amount }; }
      if (r === "opened") { wallet.purchasing(); return { status: "await", link: "", qr: "", fields: [], exp: 0, wait: (signal) => boughtSignal(wallet, signal) }; }
      // eSignIn: the runtime's sign-in wall is already up over the sheet — back to the packs, not an error screen
      if (r === "cancelled" || r === "eSignIn") return { status: "cancelled" };
      return { status: "error", message: "" };
    },
  };
}

/**
 * TON: an invoice from the edge (the pack priced at the quote of the moment, locked 30 min), shown as a ton:// link,
 * its QR and the three fields a wallet needs; then the edge's long poll — it answers when the watcher has judged a
 * transfer naming this invoice, so the sheet waits on an event, not on a timer of its own.
 */
export function tonMethod(wallet, loc) {
  const offer = () => wallet.$wallet.get().ton;
  const call = (route, body) => fetch(`${VPS_PROXY}/wallet/${route}`, { method: "POST", headers: H, body: JSON.stringify({ app: wallet.app, ...body }) });
  return {
    id: "ton", label: "TON", icon: "token-branded:ton",
    available: !!offer(),
    price: (pack) => `${offer()?.prices?.[pack.id] ?? "…"} TON`,
    pay: async (pack) => {
      let inv;
      try {
        const r = await call("ton", { sku: pack.id });
        if (!r.ok) return { status: "error", message: "" };
        inv = await r.json();
      } catch { return { status: "error", message: "" }; }
      return {
        status: "await", link: inv.link, qr: inv.link, exp: inv.exp,
        fields: [
          { key: "amount", label: sys("payAmount", loc), value: `${inv.grams} TON` },
          { key: "address", label: sys("payAddress", loc), value: inv.address },
          { key: "comment", label: sys("payComment", loc), value: inv.comment },
        ],
        wait: async (signal) => {
          for (let miss = 0; !signal.aborted;) {
            let st;
            try {
              const r = await fetch(`${VPS_PROXY}/wallet/ton/wait`, { method: "POST", headers: H, body: JSON.stringify({ app: wallet.app, id: inv.id }), signal });
              st = r.ok ? await r.json() : null;
            } catch { st = null; }
            if (signal.aborted) return null;
            if (!st) { if (++miss > 6) return { status: "error", message: "" }; await new Promise((ok) => setTimeout(ok, 1500 * miss)); continue; }
            miss = 0;
            if (st.paid) { wallet.refresh(); return { status: "paid", coins: st.coins, balance: st.balance }; }
            if (st.held) return { status: "held", why: st.why };
            if (st.expired) return { status: "expired" };
            // pending: the edge held the request until its cap — ask again at once (the event is on the edge)
          }
          return null;
        },
      };
    },
  };
}

/** The farm's methods for a wallet, in the order the sheet shows them; TON only once the edge offers it. */
export const farmMethods = (wallet, loc) => [starsMethod(wallet), tonMethod(wallet, loc)];
