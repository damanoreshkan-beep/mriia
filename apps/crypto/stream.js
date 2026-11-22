import { Effect } from "/_rt/fx.js";
import { CONFIG } from "./config.js";

const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

const PAIRS = CONFIG.pairs;
const session = (url, onMessage) => Effect.callback((resume) => {
  const ws = new WebSocket(url);
  ws.onmessage = onMessage;
  ws.onclose = () => resume(Effect.void);
  ws.onerror = () => ws.close();
  return Effect.sync(() => ws.close());
});
const META = Object.fromEntries(PAIRS.map(([s, b, n]) => [s, { base: b, name: n }]));

const price = (p) => { p = +p; const d = p >= 1 ? 2 : p >= 0.01 ? 4 : 6; return "$" + p.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); };
const row = (s, p, chg, vol) => ({ id: s, base: META[s].base, name: META[s].name, price: price(p), chg: Math.round(chg * 100) / 100, vol: Math.round(vol / 1e6) });

export function stream(push) {
  const rows = {};
  const emit = () => push(Object.values(rows));

  if (isLocal) {
    const st = {};
    PAIRS.forEach(([s, , , seed]) => (st[s] = { p: seed, chg: Math.random() * 8 - 4 }));
    setInterval(() => {
      for (const [s] of PAIRS) { const o = st[s]; o.p *= 1 + (Math.random() * 0.006 - 0.003); o.chg += Math.random() * 0.4 - 0.2; rows[s] = row(s, o.p, o.chg, Math.random() * 2e9); }
      emit();
    }, 500);
    return;
  }

  const url = CONFIG.socket + PAIRS.map(([s]) => s.toLowerCase() + "@ticker").join("/");
  const tick = (e) => { try { const d = JSON.parse(e.data).data; if (d?.s && META[d.s]) rows[d.s] = row(d.s, d.c, d.P, d.q); } catch { } };
  const fiber = Effect.runFork(session(url, tick).pipe(Effect.andThen(Effect.sleep(CONFIG.reconnectMs)), Effect.forever));
  setInterval(emit, 400);
  addEventListener("pagehide", () => fiber.interruptUnsafe());
}
