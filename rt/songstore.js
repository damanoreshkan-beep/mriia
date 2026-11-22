import { Effect } from "@microspec/core/runtime/fx.js";
import { fetchResumable, TaskError, tried } from "./task.js";

export const BUCKET = "fonoteka-songs";
const BASE = "https://fonoteka.invalid/";   
const SONG = `${BASE}song/`;
const SHELF = `${BASE}shelf.json`;

/** What the phone must pull (shelf order) and drop (no longer on the shelf). */
export function plan(songs, held) {
  const want = new Set(songs.map((s) => s.id));
  return { get: songs.filter((s) => !held.has(s.id)).map((s) => s.id), drop: [...held].filter((id) => !want.has(id)) };
}

/** The bucket, in the window's CacheStorage (the unit test hands in its own — Deno's Cache has no keys()). */
export function songStore(bucket = BUCKET, storage = globalThis.caches) {
  const open = () => storage.open(bucket);
  return {
    async held() { return new Set((await (await open()).keys()).map((r) => r.url).filter((u) => u.startsWith(SONG)).map((u) => u.slice(SONG.length))); },
    async blob(id) { const r = await (await open()).match(SONG + id); return r ? r.blob() : null; },
    async put(id, blob) { await (await open()).put(SONG + id, new Response(blob, { headers: { "content-type": blob.type || "audio/mpeg" } })); },
    async drop(id) { await (await open()).delete(SONG + id); },
    async saveShelf(shelf) { await (await open()).put(SHELF, new Response(JSON.stringify(shelf), { headers: { "content-type": "application/json" } })); },
    async readShelf() { const r = await (await open()).match(SHELF); return r ? r.json() : null; },
  };
}

/** Keeps the phone in step with the shelf. `urlOf(id)` → the song's URL; `onHeld(Set)` after every change;
 *  `onFail(err, song)` for a song left behind. A full disk stops the pass — nothing after it would fit either. */
export function keeper({ store, urlOf, onHeld, onFail, fetchFn }) {
  let want = [], running = false, dirty = false, ctl = null, cur = "";
  const skip = new Set();
  const pruned = Effect.suspend(() => { dirty = false; return tried(() => store.held()); }).pipe(
    Effect.map((held) => plan(want, held)),
    Effect.tap(({ drop }) => Effect.forEach(drop, (id) => tried(() => store.drop(id)), { discard: true })),
    Effect.tap(({ drop }) => drop.length ? tried(async () => onHeld(await store.held())) : Effect.void),
  );
  const kept = (s, signal) => tried(async () => fetchResumable(await urlOf(s.id), { signal, size: s.size, ...(fetchFn ? { fetchFn } : {}) })).pipe(
    Effect.flatMap((blob) => want.some((x) => x.id === s.id) ? tried(async () => { await store.put(s.id, blob); onHeld(await store.held()); }) : Effect.void),
  );
  const pulled = (s) => Effect.acquireUseRelease(
    Effect.sync(() => { cur = s.id; ctl = new AbortController(); return ctl; }),
    (c) => kept(s, c.signal).pipe(
      Effect.as(true),
      Effect.catch((e) => Effect.sync(() => {
        if (c.signal.aborted) return true;
        skip.add(s.id); onFail(e, s);
        return e instanceof TaskError;
      })),
    ),
    () => Effect.sync(() => { cur = ""; ctl = null; }),
  );
  const pass = pruned.pipe(
    Effect.flatMap(({ get }) => {
      const s = want.find((x) => x.id === get.find((id) => !skip.has(id)));
      return s ? pulled(s) : Effect.sync(() => dirty);
    }),
    Effect.flatMap((again) => again ? pass : Effect.void),
  );
  async function run() {
    if (running) return;
    running = true;
    return await Effect.runPromise(pass.pipe(Effect.ensuring(Effect.sync(() => { running = false; }))));
  }
  return {
    /** The shelf changed (read, upload, delete): pull what is missing, drop what left, abort a pull that left. */
    set(songs) {
      want = songs; dirty = true;
      if (cur && !songs.some((s) => s.id === cur)) ctl?.abort();
      run();
    },
  };
}
