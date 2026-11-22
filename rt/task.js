import { VPS_PROXY } from "@microspec/core/runtime/feed.js";
import { Effect } from "@microspec/core/runtime/fx.js";
import { TASK } from "./task.config.js";

/** A key for one tap: the same key re-sent is the same task on the edge. */
export const taskKey = () => crypto.randomUUID().replaceAll("-", "").slice(0, 24);

/** An HTTP answer that retrying cannot change (4xx but 408/429): the caller words it, nobody re-sends it. */
export class TaskError extends Error {
  constructor(status, msg) { super(msg || `http ${status}`); this.status = status; }
}
const final = (s) => s >= 400 && s < 500 && s !== 408 && s !== 429;
const AGAIN = Symbol("again");
const fetchNow = (...a) => fetch(...a);

export const tried = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e });

export const abortAfter = (ms, use) => Effect.acquireUseRelease(
  Effect.sync(() => { const ctrl = new AbortController(); return { ctrl, timer: setTimeout(() => ctrl.abort(), ms) }; }),
  ({ ctrl }) => use(ctrl.signal),
  ({ timer }) => Effect.sync(() => clearTimeout(timer)),
);

export const readAll = (reader, onChunk) => tried(() => reader.read()).pipe(
  Effect.flatMap(({ done, value }) => done ? Effect.void : Effect.try({ try: () => onChunk(value), catch: (e) => e }).pipe(
    Effect.andThen(Effect.suspend(() => readAll(reader, onChunk))),
  )),
);

const paced = (n, signal, win = globalThis) => Effect.callback((resume) => {
  if (signal?.aborted) { resume(Effect.fail(signal.reason)); return; }
  const done = () => { clearTimeout(t); win.removeEventListener?.("online", done); signal?.removeEventListener("abort", stop); resume(Effect.void); };
  const stop = () => { clearTimeout(t); win.removeEventListener?.("online", done); resume(Effect.fail(signal.reason)); };
  const t = setTimeout(done, Math.min(TASK.pace.cap, TASK.pace.base * 2 ** n));
  win.addEventListener?.("online", done, { once: true });
  signal?.addEventListener("abort", stop, { once: true });
});

const untilAnswer = (attempt, signal, tick = (n) => n, n = 0) => attempt(n).pipe(
  Effect.catchIf((e) => !(e instanceof TaskError) && !signal?.aborted, () => Effect.succeed(AGAIN)),
  Effect.flatMap((r) => r !== AGAIN ? Effect.succeed(r) : Effect.suspend(() => {
    const k = tick(n);
    return paced(k, signal).pipe(Effect.andThen(Effect.suspend(() => untilAnswer(attempt, signal, tick, k + 1))));
  })),
);

/** The pause before retry n: 1, 2, 4 … 15 s, ended early by the network coming back; rejects on abort. */
export function pace(n, signal, win = globalThis) {
  return Effect.runPromise(paced(n, signal, win));
}

const started = (route, body, { signal, fetchFn = fetchNow } = {}) => untilAnswer(() => tried(async () => {
  const r = await fetchFn(`${VPS_PROXY}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (r.ok) return await r.json();
  if (final(r.status)) throw new TaskError(r.status, (await r.json().catch(() => null))?.error);
  return AGAIN;
}), signal);

/** POST `body` (with its `k`) to a /feed route until an answer comes back; → the parsed JSON. */
export async function startTask(route, body, { signal, fetchFn = (...a) => fetch(...a) } = {}) {
  return await Effect.runPromise(started(route, body, { signal, fetchFn }));
}

const batch = (id, at, { signal, fetchFn }) => untilAnswer(() => tried(async () => {
  const q = new URLSearchParams({ offset: at.offset });
  if (at.offset !== "-1") { q.set("live", "long-poll"); if (at.cursor) q.set("cursor", at.cursor); }
  const r = await fetchFn(`${VPS_PROXY}${TASK.stream}/${id}?${q}`, { signal });
  if (r.status === 404 || r.status === 410) throw new TaskError(404, "task gone");
  if (!r.ok) { if (final(r.status)) throw new TaskError(r.status); throw new Error(`http ${r.status}`); }
  if (r.status === 204) return { r, items: null };
  const items = await r.json();
  if (!Array.isArray(items)) throw new Error("not a batch");
  return { r, items };
}), signal);

const streamed = (id, onEvent, { signal, fetchFn = fetchNow } = {}, at = { offset: "-1", cursor: "" }) => batch(id, at, { signal, fetchFn }).pipe(
  Effect.tap(({ items }) => Effect.forEach(items || [], (ev) => Effect.sync(() => onEvent(ev)), { discard: true })),
  Effect.map(({ r }) => ({
    offset: r.headers.get("stream-next-offset") || at.offset,
    cursor: r.headers.get("stream-cursor") || at.cursor,
    closed: r.headers.get("stream-closed") === "true",
  })),
  Effect.flatMap((next) => next.closed ? Effect.void : streamed(id, onEvent, { signal, fetchFn }, next)),
);

/** Every event of task `id`, in order, to `onEvent`; resolves at the stream's EOF. A gone task rejects (404). */
export async function followTask(id, onEvent, { signal, fetchFn = (...a) => fetch(...a) } = {}) {
  return await Effect.runPromise(streamed(id, onEvent, { signal, fetchFn }));
}

function liveMirror(onLive) {
  const t0 = Date.now();
  let last = { got: 0 };
  const emit = (ev) => { if (ev) last = { ...last, ...ev }; onLive?.({ ...last, elapsed: Math.round((Date.now() - t0) / 1000) }); };
  const clock = onLive ? setInterval(() => emit(), TASK.liveEvery) : 0;
  return { emit, stop: () => clearInterval(clock) };
}

const mirrored = (onLive, use) => Effect.acquireUseRelease(Effect.sync(() => liveMirror(onLive)), use, (live) => Effect.sync(live.stop));

const opened = (route, body, { signal, onStart }) => started(route, body, { signal }).pipe(
  Effect.tap((reply) => Effect.sync(() => onStart?.(reply.id, reply))),
);

const outcome = (id, hit, { signal, onLive }) => mirrored(onLive, (live) => {
  const seen = { hit: null, fail: null };
  return streamed(id, (ev) => {
    if (hit(ev)) seen.hit = ev;
    else if (ev.t === "fail") seen.fail = ev;
    else live.emit(ev);
  }, { signal }).pipe(Effect.as(seen));
});

const recorded = (id, { signal, onLive } = {}) => outcome(id, (ev) => ev.t === "result", { signal, onLive }).pipe(
  Effect.flatMap(({ hit, fail }) => {
    const result = hit ? hit.row ?? hit.body : null;
    return result ? Effect.succeed(result) : Effect.fail(new TaskError(fail?.status || 502, fail?.error || "no result"));
  }),
);

const fetched = (url, { signal, onProgress, size = 0, fetchFn = fetchNow } = {}) => Effect.suspend(() => {
  let parts = [], got = 0, total = size, type = "", fresh = false;
  const answered = (r) => tried(async () => {
    if (got && r.status === 200) { parts = []; got = 0; }
    else if (!r.ok) { if (final(r.status)) throw new TaskError(r.status); throw new Error(`http ${r.status}`); }
    type ||= r.headers.get("content-type") || "";
    const whole = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
    total = whole ? Number(whole[1]) : total || Number(r.headers.get("content-length")) || 0;
    return r.body.getReader();
  });
  const attempt = () => Effect.suspend(() => {
    fresh = false;
    return tried(() => fetchFn(url, { headers: got ? { range: `bytes=${got}-` } : {}, signal }));
  }).pipe(
    Effect.flatMap(answered),
    Effect.flatMap((reader) => readAll(reader, (value) => { parts.push(value); got += value.length; fresh = true; onProgress?.(got, total); })),
    Effect.map(() => !total || got >= total ? new Blob(parts, { type: type || TASK.fallbackType }) : AGAIN),
  );
  return untilAnswer(attempt, signal, (n) => fresh ? 0 : n);
});

const slid = (id, { signal, onLive, onSlide }) => mirrored(onLive, (live) => {
  let fail = null, order = Promise.resolve(), got = 0;
  return streamed(id, (ev) => {
    if (ev.t === "slide") {
      const file = fetchResumable(`${VPS_PROXY}${TASK.stream}/${id}/${ev.name}`, { signal, size: ev.bytes });
      order = order.then(async () => {
        const blob = await file.catch(() => null);
        if (blob) onSlide?.({ url: URL.createObjectURL(blob), blob, w: ev.w, h: ev.h, by: ev.by, soft: ev.soft, n: ev.n });
        live.emit({ got: ++got });
      });
    } else if (ev.t === "fail") fail = ev;
    else if (ev.t !== "done") live.emit(ev);
  }, { signal }).pipe(
    Effect.andThen(Effect.promise(() => order)),
    Effect.map(() => fail ? (fail.error === "busy" ? "busy" : "error") : "done"),
  );
});

/**
 * A task whose answer is a RECORD (the library keep's row, a character's row): start → events → `{t:"result"}`.
 * → the record. A refused start or a `fail` event throws a TaskError (its `status`, the edge's words as message).
 * `onStart(id, reply)` and `onLive(ev)` as in taskOne.
 */
export async function taskCall(route, body, { signal, onStart, onLive } = {}) {
  return await Effect.runPromise(opened(route, { ...body, k: taskKey() }, { signal, onStart }).pipe(
    Effect.flatMap((reply) => recorded(reply.id, { signal, onLive })),
  ));
}

/** Follow an already-started record task `id` (also after a reload) to its `result` → the record. */
export async function followCall(id, { signal, onLive } = {}) {
  return await Effect.runPromise(recorded(id, { signal, onLive }));
}

/** The i18n code a refused start deserves — the words imagejob.js's startJob used, so the screens keep theirs. */
export const jobCode = (e) => ({ 429: "eRate", 413: "eBig", 401: "eSignIn" })[e?.status] || "eFailed";

/**
 * One task with ONE result file (a generated clip, an export): start → events → the file by Range. The shape of
 * imagejob's followOne — `{ status: "done" | "busy" | "error", blob?, url?, …the ready event }` — so a caller swaps
 * one call; but no poll count and no timeout: it ends when the task does. `onStart(id, reply)` hands out the id
 * and the start's reply (`reply.job` cancels a /feed/task job through its route's /cancel), `onLive(ev)` every
 * other event (stage, progress), `onProgress(got, total)` the download. A refused start throws a TaskError (see
 * jobCode). Any pod job route rides it as `taskOne("/task", { route: "/feed/voice", body })`.
 */
export async function taskOne(route, body, { signal, onStart, onLive, onProgress } = {}) {
  const delivered = (id, ready) => fetched(`${VPS_PROXY}${TASK.stream}/${id}/${ready.name}`, { signal, size: ready.bytes, onProgress }).pipe(
    Effect.map((blob) => ({ status: "done", blob, url: URL.createObjectURL(blob), ...ready })),
  );
  return await Effect.runPromise(opened(route, { ...body, k: taskKey() }, { signal, onStart }).pipe(
    Effect.flatMap(({ id }) => outcome(id, (ev) => ev.t === "ready", { signal, onLive }).pipe(
      Effect.flatMap(({ hit: ready, fail }) => ready
        ? delivered(id, ready)
        : Effect.succeed({ status: fail?.error === "busy" ? "busy" : "error", error: fail?.error || null })),
    )),
  ));
}

/**
 * A file UP to the edge, resumable (tus 1.0 — tus-js-client against edge library.js): 4 MB chunks (under nginx's
 * 16 MB body cap, and a drop costs at most one chunk's progress); after any drop it asks the edge where it stands
 * and goes on from there; a reload finds the unfinished upload again (keyed by the file, not by the sealed URL,
 * which is new every time). `route` + `fields` make the sealed creation URL (the session rides inside).
 * → the upload's id (the last segment of its URL). A refusal throws a TaskError with the HTTP status.
 */
export async function uploadResumable(route, fields, file, { onProgress, signal } = {}) {
  const { tus } = TASK;
  const loaded = Effect.all([tried(() => import(tus.client)), tried(() => import("@microspec/core/runtime/sealedfetch.js"))], { concurrency: "unbounded" });
  const pushed = (Upload, endpoint) => Effect.callback((resume) => {
    const up = new Upload(file, {
      endpoint, chunkSize: tus.chunkSize, removeFingerprintOnSuccess: true,
      fingerprint: (f) => Promise.resolve([tus.fingerprint, route, f.name, f.type, f.size, f.lastModified].join("|")),
      metadata: { filename: file.name, filetype: file.type },
      retryDelays: [...tus.retryDelays, ...Array(tus.retryTail.count).fill(tus.retryTail.delay)],
      onShouldRetry: (err) => { const s = err?.originalResponse?.getStatus?.(); return !s || tus.retryOn.includes(s) || s >= tus.retryFrom; },
      onProgress: (sent, total) => onProgress?.(sent, total),
      onSuccess: () => resume(Effect.succeed(String(up.url || "").split("/").pop())),
      onError: (err) => resume(Effect.fail(new TaskError(err?.originalResponse?.getStatus?.() || 0, String(err?.originalResponse?.getBody?.() || err?.message || err).slice(0, tus.errorCap)))),
    });
    signal?.addEventListener("abort", () => { up.abort(); resume(Effect.fail(signal.reason)); }, { once: true });
    up.findPreviousUploads().then((prev) => { if (prev.length) up.resumeFromPreviousUpload(prev[0]); up.start(); });
  });
  return await Effect.runPromise(loaded.pipe(
    Effect.flatMap(([{ Upload }, { sealedUrl }]) => tried(() => sealedUrl(route, fields)).pipe(
      Effect.flatMap((endpoint) => pushed(Upload, endpoint)),
    )),
  ));
}

/**
 * A several-picture pod job (`/feed/image` and its edits with `k > 1`) as a task: every picture downloads the
 * moment it lands, all in parallel, and reaches `onSlide({ url, blob, w, h, by, soft, n })` in order — imagejob's
 * follow() contract, minus its poll count and timeout. → `"done" | "busy" | "error"`. `onStart(id, reply)` and
 * `onLive(ev)` as in taskOne; a refused start throws a TaskError.
 */
export async function taskSlides(route, body, { signal, onStart, onLive, onSlide } = {}) {
  return await Effect.runPromise(opened(TASK.stream, { route, body, k: taskKey() }, { signal, onStart }).pipe(
    Effect.flatMap((reply) => slid(reply.id, { signal, onLive, onSlide })),
  ));
}

/** Follow an already-started several-picture task `id` — also after a reload: the stream replays from its start
 *  and every picture is still a task file (2 h). → `"done" | "busy" | "error"`; a forgotten task rejects. */
export async function followSlides(id, { signal, onLive, onSlide } = {}) {
  return await Effect.runPromise(slid(id, { signal, onLive, onSlide }));
}

/** GET a file whole, resuming with Range from the bytes already in hand after any drop; → a Blob. `size` is the
 *  length when the caller already knows it (a task's `ready` event does): the edge's forward drops
 *  content-length, and without a length a body that ends early but cleanly would pass for the whole file. */
export async function fetchResumable(url, { signal, onProgress, size = 0, fetchFn = (...a) => fetch(...a) } = {}) {
  return await Effect.runPromise(fetched(url, { signal, onProgress, size, fetchFn }));
}
