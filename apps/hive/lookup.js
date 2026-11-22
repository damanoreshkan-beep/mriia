import { VPS_PROXY } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { rotates } from "/_rt/radar.js";
import { parseOui } from "/_rt/oui.js";
import { $look, $oui } from "./store.js";
import { Effect } from "/_rt/fx.js";
import { CONFIG } from "./config.js";

/**
 * What we may honestly ASK about this find. Null is an answer too — it means the transmitter did not say
 * enough to be looked up, and the UI says exactly that instead of sending a query that cannot match.
 * A cell needs its operator's numbers (a CID repeats across networks); Wi-Fi needs the neighbours seen in
 * the same sweep AND their SSIDs (beaconDB matches on MAC+SSID, so a hidden AP is unlookupable); a BLE
 * device needs a real address, which a rotating one is not.
 */
function requestFor(d, field) {
  if (d.kind === "lte") {
    return d.mcc != null && d.mnc != null && d.cid && d.lac
      ? { kind: "cell", cell: { radio: d.radio || "lte", mcc: d.mcc, mnc: d.mnc, lac: d.lac, cid: d.cid } }
      : null;
  }
  if (d.kind === "wifi") {
    const others = field.filter((x) => x.kind === "wifi" && x.addr !== d.addr)
      .sort((a, b) => (b.smooth ?? b.rssi) - (a.smooth ?? a.rssi)).slice(0, 5);
    const aps = [d, ...others].filter((x) => x.name)
      .map((x) => ({ bssid: x.addr, ssid: x.name, rssi: Math.round(x.smooth ?? x.rssi) }));
    return aps.length >= 2 ? { kind: "wifi", wifi: aps } : null;
  }
  if (d.kind === "ble") return rotates(d.addr) ? null : { kind: "ble", ble: { mac: d.addr } };
  return null;
}

const GATE_LOOKUP = {
  wifi: { found: true, lat: 50.4501, lon: 30.5234, accuracy: 96, source: "beacondb" },
  lte: { found: false, reason: "unknown" },
  ble: { found: false, reason: "unknown" },
};

export async function askAbout(d, field, onFound) {
  const req = requestFor(d, field);
  if (!req) { $look.set({ addr: d.addr, state: "done", v: { found: false, reason: "tooLittle" } }); return; }
  $look.set({ addr: d.addr, state: "asking", v: null });
  const settle = (v) => { $look.set({ addr: d.addr, state: "done", v }); if (v.found) onFound?.(); };
  if (gate) { settle(GATE_LOOKUP[d.kind] || { found: false, reason: "unknown" }); return; }
  await Effect.runPromise(asked(req).pipe(
    Effect.tap((v) => Effect.sync(() => settle(v))),
    Effect.catchCause(() => Effect.sync(() => settle({ found: false, reason: "unavailable" }))),
  ));
}
const asked = (req) => Effect.tryPromise({
  try: async () => {
    const r = await fetch(`${VPS_PROXY}${CONFIG.lookupRoute}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req),
    });
    return r.ok ? await r.json() : { found: false, reason: "unavailable" };
  },
  catch: (e) => e,
});
let ouiPending = false;
export function loadOui() {
  if (ouiPending || $oui.get()) return;
  ouiPending = true;
  fetch(new URL("./assets/oui.txt", import.meta.url).href)
    .then((r) => (r.ok ? r.text() : ""))
    .then((txt) => { if (txt) $oui.set(parseOui(txt)); })
    .catch(() => { });
}
