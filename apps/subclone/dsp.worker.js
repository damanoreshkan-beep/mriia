import { HackRF } from "/_rt/hackrf.js";
import { capture, isolateFrame, renderOOK } from "/_rt/ook.js";
import { Effect } from "/_rt/fx.js";
import { range } from "/_rt/remeda.js";
import { CONFIG } from "./config.js";

const SR = CONFIG.sampleRate, TX_OFFSET = CONFIG.txOffset, MAX_XFER = CONFIG.maxTransfer;
const MAX_BYTES = CONFIG.maxBytes;
const post = (m, transfer) => self.postMessage(m, transfer || []);
const call = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e });
const steps = (...fxs) => Effect.forEach(fxs, call, { discard: true });
const report = (e) => Effect.sync(() => post({ type: "error", message: String(e && e.message || e) }));

let rx = null, recording = false;

async function open() {
  await Effect.runPromise(Effect.promise(() => HackRF.fromGranted()).pipe(
    Effect.tap((dev) => Effect.sync(() => { rx = dev; })),
    Effect.flatMap((dev) => !dev ? Effect.sync(() => post({ type: "error", message: "device-gone" })) : steps(
      () => dev.open(), () => dev.setSampleRate(SR), () => dev.setBasebandFilter(CONFIG.basebandFilter),
    ).pipe(Effect.matchEffect({ onFailure: report, onSuccess: () => Effect.sync(() => post({ type: "ready" })) }))),
  ));
}

const drain = (chunks, total) => !recording ? Effect.succeed({ chunks, total }) : call(() => rx.read()).pipe(Effect.matchEffect({
  onFailure: () => Effect.succeed({ chunks, total }),
  onSuccess: (bytes) => {
    if (!recording) return Effect.succeed({ chunks, total });
    if (bytes.length) { chunks.push(bytes); total += bytes.length; while (total > MAX_BYTES && chunks.length > 1) total -= chunks.shift().length; }
    return Effect.suspend(() => drain(chunks, total));
  },
}));

async function record(freq) {
  post({ type: "recording" });
  const tune = steps(() => rx.setFreq(freq), () => rx.setAmp(CONFIG.rx.amp), () => rx.setLnaGain(CONFIG.rx.lnaGain), () => rx.setVgaGain(CONFIG.rx.vgaGain));
  const listen = Effect.acquireUseRelease(
    call(() => rx.startRx()).pipe(Effect.tap(() => Effect.sync(() => { recording = true; }))),
    () => drain([], 0),
    () => call(() => rx.setMode(CONFIG.rx.idleMode)).pipe(Effect.ignore),
  );
  const isolate = ({ chunks, total }) => Effect.try({ try: () => {
    const all = new Uint8Array(total); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    const iso = isolateFrame(capture(all, { fs: SR }), { gapUs: CONFIG.rx.frameGapUs });
    post({ type: "captured", freq, frame: iso.frame, repeats: iso.repeats, count: iso.count, entries: iso.frame.length });
  }, catch: (e) => e });
  await Effect.runPromise(tune.pipe(Effect.andThen(listen), Effect.flatMap(isolate), Effect.catch(report)));
}

async function transmit(m) {
  post({ type: "transmitting", id: m.id });
  const tune = steps(() => rx.setFreq(m.freq - TX_OFFSET), () => rx.setTxVgaGain(m.txGain ?? CONFIG.tx.vgaGain), () => rx.setAmp(CONFIG.tx.amp), () => rx.startTx());
  const render = Effect.try({ try: () => renderOOK(m.frame, { fs: SR, freqOffset: TX_OFFSET, repeats: m.repeats || CONFIG.tx.repeats, gapUs: CONFIG.tx.gapUs }), catch: (e) => e });
  const send = (iq) => {
    const buf = new Uint8Array(iq.buffer);
    return Effect.forEach(range(0, Math.ceil(buf.length / MAX_XFER)), (k) => call(() => rx.write(buf.slice(k * MAX_XFER, Math.min(buf.length, k * MAX_XFER + MAX_XFER)))), { discard: true }).pipe(
      Effect.andThen(Effect.sleep(Math.ceil((iq.length / 2) / SR * 1000) + CONFIG.tx.tailMs)),
    );
  };
  await Effect.runPromise(tune.pipe(
    Effect.andThen(render),
    Effect.flatMap(send),
    Effect.andThen(call(() => rx.stopTx())),
    Effect.flatMap(() => Effect.sync(() => post({ type: "sent", id: m.id }))),
    Effect.catch(report),
  ));
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "open") open();
  else if (m.type === "record") record(m.freq);
  else if (m.type === "stopRecord") recording = false;
  else if (m.type === "transmit") transmit(m);
  else if (m.type === "stop") { try { if (rx) await rx.stop(); } catch { } post({ type: "stopped" }); }
};
