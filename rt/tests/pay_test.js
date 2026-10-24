// rt/pay.js — the farm's ways to pay, driven with a fake edge (globalThis.fetch) and a fake wallet. What the core's
// pay sheet receives from each method is the contract: paid / cancelled / await (+ a wait() that ends on the edge's
// answer) / held / expired / error.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { sheetPacks, tonMethod, farmMethods } from "../pay.js";

// the three calls pay.js makes on a nanostores atom (the page gets the real one through its import map)
const atom = (v) => { const subs = new Set(); return { get: () => v, set: (n) => { v = n; for (const f of subs) f(v); }, listen: (f) => { subs.add(f); return () => subs.delete(f); } }; };

const fakeWallet = (ton = null) => {
  let refreshed = 0;
  return { app: "blackout", $wallet: atom({ balance: 0, ton }), $bought: atom(0), refresh: () => { refreshed++; }, purchasing: () => {}, get refreshed() { return refreshed; } };
};
const withFetch = async (routes, fn) => {
  const real = globalThis.fetch, seen = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url).replace(/^.*\/wallet\//, "");
    seen.push([path, JSON.parse(init?.body || "{}")]);
    const next = routes[path]?.shift?.() ?? routes[path];
    return { ok: next.status === 200, status: next.status, json: async () => next.body };
  };
  try { return await fn(seen); } finally { globalThis.fetch = real; }
};

Deno.test("pay: the packs are the edge's, in its order", () => {
  assertEquals(sheetPacks().map((p) => [p.id, p.amount]), [["c500", 500], ["c1500", 1500], ["c5000", 5000]]);
});

Deno.test("pay: TON is offered only when the edge offers it, at the edge's Gram prices", () => {
  assertEquals(farmMethods(fakeWallet(), "en").find((m) => m.id === "ton").available, false);
  const ton = tonMethod(fakeWallet({ prices: { c500: "0.27", c1500: "0.63", c5000: "1.57" } }), "uk");
  assertEquals(ton.available, true);
  assertEquals(ton.price({ id: "c1500" }), "0.63 TON");
});

Deno.test("pay: TON — an invoice becomes a ton:// link, a QR and three fields; the wait ends on the edge's paid", async () => {
  const w = fakeWallet({ prices: { c500: "0.27" } });
  const inv = { id: "abc", link: "ton://transfer/UQX?amount=270000000&text=mriia-abc&exp=99", exp: 99, grams: "0.27", address: "UQX", comment: "mriia-abc" };
  await withFetch({ ton: { status: 200, body: inv }, "ton/wait": [{ status: 200, body: { pending: true } }, { status: 200, body: { paid: true, coins: 500, balance: 1500 } }] }, async (seen) => {
    const o = await tonMethod(w, "uk").pay({ id: "c500", amount: 500 }, { signal: new AbortController().signal });
    assertEquals([o.status, o.link, o.qr, o.exp], ["await", inv.link, inv.link, 99]);
    assertEquals(o.fields.map((f) => [f.key, f.value]), [["amount", "0.27 TON"], ["address", "UQX"], ["comment", "mriia-abc"]]);
    assertEquals(o.fields[2].label, "Коментар — не змінюй");
    const done = await o.wait(new AbortController().signal);
    assertEquals(done, { status: "paid", coins: 500, balance: 1500 });
    assertEquals(seen.filter(([p]) => p === "ton/wait").length, 2, "a pending answer is asked again at once");
    assertEquals(seen[0][1], { app: "blackout", sku: "c500" });
    assert(w.refreshed >= 1, "the wallet re-reads itself once the coins are in");
  });
});

Deno.test("pay: TON — held and expired come back as what they are; a refused invoice is an error", async () => {
  const w = fakeWallet({ prices: { c500: "0.27" } });
  const inv = { id: "x", link: "ton://t", exp: 1, grams: "0.27", address: "A", comment: "mriia-x" };
  await withFetch({ ton: { status: 200, body: inv }, "ton/wait": { status: 200, body: { held: true, why: "short" } } }, async () => {
    const o = await tonMethod(w, "en").pay({ id: "c500" }, { signal: new AbortController().signal });
    assertEquals(await o.wait(new AbortController().signal), { status: "held", why: "short" });
  });
  await withFetch({ ton: { status: 200, body: inv }, "ton/wait": { status: 200, body: { expired: true } } }, async () => {
    const o = await tonMethod(w, "en").pay({ id: "c500" }, { signal: new AbortController().signal });
    assertEquals(await o.wait(new AbortController().signal), { status: "expired" });
  });
  await withFetch({ ton: { status: 403, body: { error: "soon" } } }, async () => {
    assertEquals((await tonMethod(w, "en").pay({ id: "c500" }, { signal: new AbortController().signal })).status, "error");
  });
});

Deno.test("pay: closing the sheet aborts the TON wait — it answers null, never a late outcome", async () => {
  const w = fakeWallet({ prices: { c500: "0.27" } });
  await withFetch({ ton: { status: 200, body: { id: "z", link: "l", exp: 1, grams: "1", address: "A", comment: "c" } }, "ton/wait": { status: 200, body: { pending: true } } }, async () => {
    const o = await tonMethod(w, "en").pay({ id: "c500" }, { signal: new AbortController().signal });
    const c = new AbortController(); c.abort();
    assertEquals(await o.wait(c.signal), null);
  });
});
