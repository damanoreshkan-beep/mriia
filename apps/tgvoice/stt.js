import { detect } from "/_rt/langid.js";
import { gate } from "/_rt/gate.js";
import { log, mark } from "./log.js";
import { Effect } from "/_rt/fx.js";
import { sum, fromEntries } from "/_rt/remeda.js";
import { CONFIG } from "./config.js";

const assetURL = (f) => new URL(`./assets/${f}`, import.meta.url).href;

export const LID_HEAD_SEC = 8;
export const MODEL_ROOT_FS = "/models";

export const MODELS = CONFIG.models;

export const LANGS = Object.keys(MODELS);

const resolveUrl = (u) => u;
const tried = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e });
const MISS = { miss: true };

export async function decodePcm16k(arrayBuffer, headSeconds = 0) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) throw new Error("no AudioContext");
  const decoded = Effect.acquireUseRelease(
    Effect.sync(() => new AC({ sampleRate: CONFIG.rate })),
    (ctx) => tried(() => ctx.decodeAudioData(arrayBuffer.slice(0))),
    (ctx) => Effect.sync(() => { ctx.close?.(); }),
  );
  const resampled = (buf) => {
    const mono = downmix(buf);
    return buf.sampleRate !== CONFIG.rate ? tried(() => resampleTo16k(mono, buf.sampleRate)).pipe(Effect.map((pcm) => ({ pcm, rate: CONFIG.rate })))
      : Effect.succeed({ pcm: mono, rate: buf.sampleRate });
  };
  return await Effect.runPromise(decoded.pipe(
    Effect.flatMap((buf) => resampled(buf).pipe(Effect.map(({ pcm, rate }) => ({
      pcm: headSeconds > 0 && pcm.length > headSeconds * CONFIG.rate ? pcm.subarray(0, Math.round(headSeconds * CONFIG.rate)) : pcm,
      sampleRate: rate,
      durationSec: buf.duration,
    })))),
  ));
}

function downmix(buf) {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const n = buf.length, out = new Float32Array(n), chs = buf.numberOfChannels;
  for (let c = 0; c < chs; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / chs; }
  return out;
}

async function resampleTo16k(mono, srcRate) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const frames = Math.ceil(mono.length * 16000 / srcRate);
  const oac = new OAC(1, frames, 16000);
  const src = oac.createBufferSource();
  const b = oac.createBuffer(1, mono.length, srcRate);
  b.getChannelData(0).set(mono);
  src.buffer = b; src.connect(oac.destination); src.start();
  const rendered = await oac.startRendering();
  return rendered.getChannelData(0);
}

const CACHE = CONFIG.cache;

const drain = (reader, onProgress, total, chunks, got) => tried(() => reader.read()).pipe(
  Effect.flatMap(({ done, value }) => {
    if (done) return Effect.succeed({ chunks, got });
    chunks.push(value); got += value.length;
    onProgress?.(got, total);
    return Effect.suspend(() => drain(reader, onProgress, total, chunks, got));
  }),
);
const download = (abs, onProgress) => tried(() => fetch(abs)).pipe(
  Effect.flatMap((res) => !res.ok ? Effect.fail(new Error(`fetch ${res.status}`)) : Effect.suspend(() => drain(res.body.getReader(), onProgress, Number(res.headers.get("content-length")) || 0, [], 0))),
  Effect.map(({ chunks, got }) => {
    const bytes = new Uint8Array(got); let off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.length; }
    return bytes;
  }),
);
const cached = (url, onProgress) => {
  const abs = resolveUrl(url);
  return tried(() => caches.open(CACHE)).pipe(
    Effect.flatMap((cache) => tried(() => cache.match(abs)).pipe(
      Effect.flatMap((hit) => hit ? tried(async () => new Uint8Array(await hit.arrayBuffer()))
        : download(abs, onProgress).pipe(Effect.tap((bytes) => tried(() => cache.put(abs, new Response(bytes, { headers: { "content-type": "application/octet-stream" } })))))),
    )),
  );
};

/** Is a language's whole model already in the cache (so it works offline right now)? */
export async function isModelCached(lang) {
  if (gate) return lang === "uk";
  return await Effect.runPromise(tried(() => caches.open(CACHE)).pipe(
    Effect.flatMap((cache) => Effect.try({ try: () => Object.values(MODELS[lang].files), catch: (e) => e }).pipe(
      Effect.flatMap((urls) => Effect.forEach(urls, (u) => tried(() => cache.match(resolveUrl(u))).pipe(
        Effect.flatMap((hit) => hit ? Effect.void : Effect.fail(MISS)),
      ), { discard: true })),
    )),
    Effect.as(true),
    Effect.catch(() => Effect.succeed(false)),
  ));
}

/** Download every file of a language's model, reporting fraction [0,1]. Idempotent (cache hits are instant). */
export async function ensureModel(lang, onFraction) {
  const files = Object.entries(MODELS[lang].files);
  const done = new Array(files.length).fill(0);
  const totalGuess = MODELS[lang].approxMB * 1024 * 1024;
  return await Effect.runPromise(Effect.forEach(files, ([key, url], i) => cached(url, (got) => {
    done[i] = got;
    onFraction?.(Math.min(CONFIG.progressCap, sum(done) / totalGuess));
  }).pipe(Effect.map((bytes) => [key, bytes]))).pipe(
    Effect.map(fromEntries),
    Effect.tap(() => Effect.sync(() => { onFraction?.(1); })),
  ));
}

let enginePromise = null;

/** Has the vendored WASM engine been built and committed? False until CI produces it. */
export async function engineAvailable() {
  if (gate) return true;
  try { const r = await fetch(assetURL(CONFIG.engine.wasm), { method: "HEAD" }); return r.ok; }
  catch { return false; }
}

const loadScript = (src) => Effect.callback((resume) => {
  const s = document.createElement("script");
  s.src = src; s.onload = (ev) => resume(Effect.succeed(ev)); s.onerror = () => resume(Effect.fail(new Error(`script failed: ${src}`)));
  document.head.appendChild(s);
});

function loadEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = Effect.runPromise(Effect.sync(() => log("engine: loading scripts")).pipe(
    Effect.andThen(Effect.forEach(CONFIG.engine.scripts, (f) => loadScript(assetURL(f)), { discard: true })),
    Effect.tap(() => Effect.sync(() => { mark("engine"); log("engine: instantiating wasm"); })),
    Effect.andThen(tried(() => globalThis.SherpaOnnx({
      locateFile: (p) => assetURL(p),
      print: (s) => log(`wasm: ${s}`),
      printErr: (s) => log(`wasm! ${s}`),
    }))),
    Effect.tap(() => Effect.sync(() => { mark(null); log("engine: ready"); })),
  ));
  enginePromise.catch((e) => { log(`engine: FAILED ${e && e.message || e}`); enginePromise = null; });
  return enginePromise;
}

async function buildRecognizer(Module, lang, files) {
  const dir = `${MODEL_ROOT_FS}/${lang}`;
  try { Module.FS.mkdirTree(dir); } catch { }
  const paths = {};
  for (const [key, bytes] of Object.entries(files)) {
    const p = `${dir}/${key}.bin`;
    Module.FS.writeFile(p, bytes);
    paths[key] = p;
  }
  const m = MODELS[lang];
  const R = CONFIG.recognizer;
  const modelConfig = { tokens: paths.tokens, numThreads: R.numThreads, debug: R.debug, provider: R.provider };
  if (m.type === "nemo_ctc") { modelConfig.nemoCtc = { model: paths.model }; modelConfig.modelType = "nemo_ctc"; }
  else if (m.type === "transducer") { modelConfig.transducer = { encoder: paths.encoder, decoder: paths.decoder, joiner: paths.joiner }; }
  else if (m.type === "moonshine") { modelConfig.moonshine = { preprocessor: paths.preprocessor, encoder: paths.encoder, uncachedDecoder: paths.uncachedDecoder, cachedDecoder: paths.cachedDecoder }; }
  else if (m.type === "moonshine2") { modelConfig.moonshine = { encoder: paths.encoder, mergedDecoder: paths.mergedDecoder }; }
  const rec = new globalThis.OfflineRecognizer({
    featConfig: { sampleRate: CONFIG.rate, featureDim: R.featureDim },
    modelConfig, decodingMethod: R.decodingMethod,
  }, Module);
  if (!rec.handle) { try { rec.free(); } catch { } throw new Error(`modelInit:${lang}`); }
  return rec;
}

const withRecognizer = (lang, files, use) => Effect.acquireUseRelease(
  tried(() => loadEngine()).pipe(
    Effect.tap(() => Effect.sync(() => { mark(`recognizer-${lang}`); log(`recognizer ${lang}: creating session`); })),
    Effect.flatMap((Module) => tried(() => buildRecognizer(Module, lang, files)).pipe(Effect.map((rec) => ({ Module, rec })))),
  ),
  ({ rec }) => Effect.sync(() => mark(`run-${lang}`)).pipe(
    Effect.andThen(use(rec)),
    Effect.tap(() => Effect.sync(() => mark(null))),
  ),
  ({ Module, rec }) => Effect.sync(() => {
    try { rec.free(); } catch { }
    try {
      const dir = `${MODEL_ROOT_FS}/${lang}`;
      for (const f of Module.FS.readdir(dir)) if (f !== "." && f !== "..") Module.FS.unlink(`${dir}/${f}`);
    } catch { }
    log(`recognizer ${lang}: freed`);
  }),
);
const recognize = (lang, files, pcm, onChunk) => withRecognizer(lang, files, (rec) => tried(() => runOne(rec, pcm, onChunk)));
const decoded = (arrayBuffer) => Effect.sync(() => mark("decode")).pipe(
  Effect.andThen(tried(() => decodePcm16k(arrayBuffer))),
  Effect.tap(({ pcm, durationSec }) => Effect.sync(() => { mark(null); log(`decode: ${durationSec.toFixed(1)}s → ${pcm.length} samples`); })),
);
const model = (lang, onFraction) => tried(() => ensureModel(lang, onFraction));

export const CHUNK_SEC = 45;
async function runOne(rec, pcm, onChunk) {
  const win = CHUNK_SEC * 16000;
  const parts = [];
  for (let off = 0; off < pcm.length; off += win) {
    const stream = rec.createStream();
    stream.acceptWaveform(16000, pcm.subarray(off, Math.min(off + win, pcm.length)));
    rec.decode(stream);
    const out = rec.getResult(stream);
    stream.free();
    const text = (out && out.text ? out.text : "").trim();
    if (text) parts.push(text);
    const done = Math.min(off + win, pcm.length);
    onChunk?.(done / pcm.length);
    if (done < pcm.length) {
      log(`chunk ${(done / 16000) | 0}/${(pcm.length / 16000) | 0}s`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return parts.join(" ").trim();
}

const FIXTURE = {
  uk: "привіт це тестове голосове повідомлення з телеграму все працює офлайн",
  ru: "привет это тестовое голосовое сообщение из телеграма всё работает офлайн",
  en: "hi this is a test voice message from telegram it all works offline",
};

/**
 * Transcribe one clip. `lang` is "uk"|"ru"|"en" for a fixed language, or "auto" to detect. Reports coarse
 * progress through `onStage({stage, fraction?, lang?})`. Resolves { text, lang, ambiguous }.
 */
export async function transcribe(arrayBuffer, lang, onStage) {
  if (gate) {
    const chosen = lang === "auto" ? "uk" : lang;
    return { text: FIXTURE[chosen], lang: chosen, ambiguous: false };
  }
  const stage = (s) => Effect.sync(() => onStage?.(s));
  const full = (l, files, pcm, ambiguous) => stage({ stage: "transcribe", lang: l }).pipe(
    Effect.andThen(files),
    Effect.flatMap((fs) => recognize(l, fs, pcm, (fr) => onStage?.({ stage: "transcribe", lang: l, fraction: fr }))),
    Effect.tap((text) => Effect.sync(() => log(`transcribe ${l}: done (${text.length} chars)`))),
    Effect.map((text) => ({ text, lang: l, ambiguous })),
  );
  const fixed = Effect.sync(() => log(`transcribe ${lang}: start (${arrayBuffer.byteLength}b)`)).pipe(
    Effect.andThen(stage({ stage: "model", lang })),
    Effect.andThen(model(lang, (f) => onStage?.({ stage: "model", fraction: f, lang }))),
    Effect.flatMap((files) => stage({ stage: "decode" }).pipe(
      Effect.andThen(decoded(arrayBuffer)),
      Effect.flatMap(({ pcm }) => full(lang, Effect.succeed(files), pcm, false)),
    )),
  );
  const cachedLangs = Effect.forEach(LANGS, (l) => tried(() => isModelCached(l)).pipe(Effect.map((ok) => (ok ? [l] : [])))).pipe(
    Effect.map((ls) => ls.flat()),
    Effect.flatMap((avail) => avail.length ? Effect.succeed(avail) : Effect.fail(new Error("noModels"))),
  );
  const candidatesOf = (avail, head) => Effect.reduce(avail, () => ({}), (candidates, l) => stage({ stage: "detect", lang: l }).pipe(
    Effect.andThen(model(l)),
    Effect.flatMap((files) => recognize(l, files, head)),
    Effect.map((text) => ({ ...candidates, [l]: text })),
    Effect.tap((next) => Effect.sync(() => log(`detect ${l}: ${(next[l] || "").length} chars`))),
  ));
  const auto = cachedLangs.pipe(
    Effect.tap((avail) => Effect.sync(() => log(`transcribe auto: start (${arrayBuffer.byteLength}b, models: ${avail.join(" ")})`))),
    Effect.flatMap((avail) => stage({ stage: "decodeHead" }).pipe(
      Effect.andThen(decoded(arrayBuffer)),
      Effect.flatMap(({ pcm }) => {
        const head = pcm.length > LID_HEAD_SEC * CONFIG.rate ? pcm.subarray(0, LID_HEAD_SEC * CONFIG.rate) : pcm;
        const wholeClip = head.length === pcm.length;
        return candidatesOf(avail, head).pipe(Effect.flatMap((candidates) => {
          const picked = detect(candidates);
          log(`detect: picked ${picked.lang} (conf ${picked.confidence.toFixed(2)}${picked.ambiguous ? ", ambiguous" : ""})`);
          if (wholeClip) return Effect.succeed({ text: candidates[picked.lang], lang: picked.lang, ambiguous: picked.ambiguous });
          return full(picked.lang, model(picked.lang), pcm, picked.ambiguous);
        }));
      }),
    )),
  );
  return await Effect.runPromise(tried(() => engineAvailable()).pipe(
    Effect.flatMap((ok) => !ok ? Effect.fail(new Error("engineUnavailable")) : lang !== "auto" ? fixed : auto),
  ));
}
