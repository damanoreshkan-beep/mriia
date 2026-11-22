import { VPS_PROXY } from "@microspec/core/runtime/feed.js";
import { sys } from "@microspec/core/runtime/i18n.js";
import { Effect } from "@microspec/core/runtime/fx.js";
import { PACKS, buyCoins, packOf } from "./coins.js";
import { tried } from "./task.js";
import { PAY } from "./pay.config.js";
import { WALLET } from "./wallet.config.js";

const H = { "content-type": "application/json" };

const WALT = "https://telegram.me/walt/start?startapp=ref-3-jB2y07Soqjw";
const WALT_COPY = {
  uk: { label: "Немає TON? Купи у Walt", note: "Обміняй від $50 і тримай 7 днів — Walt додасть до $50 бонусу в Золоті." },
  en: { label: "No TON? Get it in Walt", note: "Exchange $50+ and hold it 7 days — Walt adds up to a $50 bonus in Gold." },
};

/** The packs for the sheet: `{ id, amount }` in the edge's order. Pure. */
export const sheetPacks = () => PACKS.map((p) => ({ id: p.sku, amount: p.coins }));

const boughtSignal = (wallet, signal) => Effect.runPromise(Effect.callback((resume) => {
  const off = wallet.$bought.listen((v) => { if (v > 0) { off(); resume(Effect.succeed({ status: "paid", coins: v, balance: wallet.$wallet.get().balance })); } });
  signal.addEventListener("abort", () => { off(); resume(Effect.succeed(null)); }, { once: true });
}));

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
  const { ton } = PAY;
  const call = (route, body, signal) => fetch(`${VPS_PROXY}${WALLET.route}${route}`, { method: "POST", headers: H, body: JSON.stringify({ app: wallet.app, ...body }), ...(signal ? { signal } : {}) });
  const failed = { status: "error", message: "" };
  const invoiced = (pack) => tried(async () => {
    const r = await call(ton.invoice, { sku: pack.id });
    return r.ok ? { inv: await r.json() } : null;
  }).pipe(Effect.catch(() => Effect.succeed(null)));
  const asked = (inv, signal) => tried(async () => {
    const r = await call(ton.wait, { id: inv.id }, signal);
    return r.ok ? await r.json() : null;
  }).pipe(Effect.catch(() => Effect.succeed(null)));
  const judged = (st) => Effect.sync(() => {
    if (st.paid) { wallet.refresh(); return { status: "paid", coins: st.coins, balance: st.balance }; }
    if (st.held) return { status: "held", why: st.why };
    if (st.expired) return { status: "expired" };
    return undefined;
  });
  const waited = (inv, signal, miss = 0) => signal.aborted ? Effect.succeed(null) : asked(inv, signal).pipe(
    Effect.flatMap((st) => {
      if (signal.aborted) return Effect.succeed(null);
      if (!st) return miss + 1 > ton.misses
        ? Effect.succeed({ ...failed })
        : Effect.sleep(ton.backoff * (miss + 1)).pipe(Effect.andThen(Effect.suspend(() => waited(inv, signal, miss + 1))));
      return judged(st).pipe(Effect.flatMap((out) => out ? Effect.succeed(out) : waited(inv, signal, 0)));
    }),
  );
  const offered = (inv) => ({
    status: "await", link: inv.link, qr: inv.link, exp: inv.exp,
    fields: [
      { key: "amount", label: sys("payAmount", loc), value: `${inv.grams} TON` },
      { key: "address", label: sys("payAddress", loc), value: inv.address },
      { key: "comment", label: sys("payComment", loc), value: inv.comment },
    ],
    wait: async (signal) => await Effect.runPromise(waited(inv, signal)),
  });
  return {
    id: "ton", label: "TON", icon: "token-branded:ton",
    available: !!offer(),
    aside: { ...(WALT_COPY[loc] || WALT_COPY.en), href: WALT },
    price: (pack) => `${offer()?.prices?.[pack.id] ?? "…"} TON`,
    pay: async (pack) => await Effect.runPromise(invoiced(pack).pipe(Effect.map((got) => got ? offered(got.inv) : { ...failed }))),
  };
}

/** The farm's methods for a wallet, in the order the sheet shows them; TON only once the edge offers it. */
export const farmMethods = (wallet, loc) => [starsMethod(wallet), tonMethod(wallet, loc)];
