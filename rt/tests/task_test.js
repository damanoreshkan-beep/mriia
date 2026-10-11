import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { fetchResumable, startTask, followTask, taskKey, pace, TaskError } from "../task.js";

// the edge's stream answers (edge streams.js): a JSON batch or a 204, with the protocol headers
const answer = (items, { next, closed = false, cursor = "" } = {}) => new Response(items ? JSON.stringify(items) : null, {
  status: items ? 200 : 204,
  headers: { "content-type": "application/json", "stream-next-offset": next, ...(cursor ? { "stream-cursor": cursor } : {}), ...(closed ? { "stream-closed": "true" } : {}) },
});

Deno.test("task: events and EOF in ONE answer still reach the caller — the finished voice that read «Нічого не повернулось»", async () => {
  const seen = [], urls = [];
  await followTask("t1", (ev) => seen.push(ev.t), { fetchFn: async (u) => { urls.push(u); return answer([{ t: "progress" }, { t: "ready", name: "result" }], { next: "2", closed: true }); } });
  assertEquals(seen, ["progress", "ready"]);
  assertEquals(urls.length, 1);
  assert(urls[0].endsWith("/task/t1?offset=-1"));
});

Deno.test("task: long-polls resume from the next offset with the cursor, a 204 is an empty poll, closed is EOF", async () => {
  const seen = [], urls = [];
  const replies = [answer([{ t: "progress" }], { next: "1" }), answer(null, { next: "1", cursor: "c9" }), answer([{ t: "ready" }], { next: "2", cursor: "c10" }), answer(null, { next: "2", closed: true })];
  await followTask("t2", (ev) => seen.push(ev.t), { fetchFn: async (u) => { urls.push(u); return replies.shift(); } });
  assertEquals(seen, ["progress", "ready"]);
  assert(urls[1].includes("offset=1&live=long-poll") && !urls[1].includes("cursor"));
  assert(urls[2].includes("offset=1&live=long-poll&cursor=c9"));
  assert(urls[3].includes("offset=2&live=long-poll&cursor=c10"));
});

Deno.test("task: a forgotten task (404) rejects; a poll cut mid-body is read again from the same offset, nothing doubled", async () => {
  await assertRejects(() => followTask("t3", () => {}, { fetchFn: async () => new Response("gone", { status: 404 }) }), TaskError);
  const seen = [], urls = [];
  const replies = [
    () => new Response("[{\"t\":\"progress\"", { status: 200, headers: { "stream-next-offset": "1" } }),   // cut mid-body
    () => answer([{ t: "ready" }], { next: "1", closed: true }),
  ];
  const ac = new AbortController();
  globalThis.dispatchEvent?.(new Event("online"));
  const run = followTask("t4", (ev) => seen.push(ev.t), { signal: ac.signal, fetchFn: async (u) => { urls.push(u); return replies.shift()(); } });
  await run;
  assertEquals(seen, ["ready"]);
  assertEquals(urls.length, 2);
  assert(urls[1].endsWith("offset=-1"), "the cut answer is read again from the same offset");
});

const bytes = (n, from = 0) => Uint8Array.from({ length: n }, (_, i) => (from + i) % 251);
// a body that delivers `chunk` and then dies the way a dead zone kills a socket (error() in start() would
// discard the queued chunk, so the death comes on the second pull)
const dying = (chunk) => {
  let pulls = 0;
  return new ReadableStream({ pull(c) { if (pulls++ === 0) c.enqueue(chunk); else c.error(new TypeError("Failed to fetch")); } });
};

Deno.test("task: a download cut mid-body resumes with Range from the bytes in hand — the file comes out whole", async () => {
  const file = bytes(1000), seen = [];
  const fetchFn = async (_u, init) => {
    const range = init.headers.range || "";
    seen.push(range);
    if (!range) return new Response(dying(file.slice(0, 400)), { status: 200, headers: { "content-length": "1000", "content-type": "audio/mpeg" } });
    const from = Number(/bytes=(\d+)-/.exec(range)[1]);
    return new Response(file.slice(from), { status: 206, headers: { "content-range": `bytes ${from}-999/1000`, "content-length": String(1000 - from) } });
  };
  const blob = await fetchResumable("x", { fetchFn });
  assertEquals(seen, ["", "bytes=400-"], "the second request asks only for what is missing");
  assertEquals(new Uint8Array(await blob.arrayBuffer()), file);
  assertEquals(blob.type, "audio/mpeg");
});

Deno.test("task: a server that ignores Range sends the whole body again — the partial bytes are dropped, not doubled", async () => {
  const file = bytes(300);
  let calls = 0;
  const fetchFn = async () => ++calls === 1
    ? new Response(dying(file.slice(0, 100)), { status: 200, headers: { "content-length": "300" } })
    : new Response(file, { status: 200, headers: { "content-length": "300" } });
  const blob = await fetchResumable("x", { fetchFn });
  assertEquals(new Uint8Array(await blob.arrayBuffer()), file);
});

Deno.test("task: with the size known, a body that ends early WITHOUT an error is resumed, not taken as whole", async () => {
  const file = bytes(500), seen = [];
  const fetchFn = async (_u, init) => {
    const range = init.headers.range || "";
    seen.push(range);
    if (!range) return new Response(file.slice(0, 200), { status: 200 });   // no length header: the edge's forward strips it
    return new Response(file.slice(200), { status: 206, headers: { "content-range": "bytes 200-499/500" } });
  };
  const progress = [];
  const blob = await fetchResumable("x", { fetchFn, size: 500, onProgress: (g, t) => progress.push([g, t]) });
  assertEquals(seen, ["", "bytes=200-"]);
  assertEquals(new Uint8Array(await blob.arrayBuffer()), file);
  assertEquals(progress.at(-1), [500, 500], "progress reads against the known size from the first byte");
});

Deno.test("task: a 404 is final — no retry; an abort stops the wait", async () => {
  let calls = 0;
  const e = await assertRejects(() => fetchResumable("x", { fetchFn: async () => { calls++; return new Response("", { status: 404 }); } }), TaskError);
  assertEquals(e.status, 404); assertEquals(calls, 1);
  const ac = new AbortController();
  const p = pace(5, ac.signal);
  ac.abort(new Error("left"));
  await assertRejects(() => p);
});

Deno.test("task: the start POST is re-sent after a network error with the SAME key; a 401 is final", async () => {
  const bodies = [];
  let calls = 0;
  const fetchFn = async (_u, init) => {
    bodies.push(JSON.parse(init.body));
    if (++calls === 1) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ id: "abc" }), { status: 200 });
  };
  const k = taskKey();
  assert(/^[a-f0-9]{24}$/.test(k));
  assertEquals(await startTask("/music/task", { url: "u", k }, { fetchFn }), { id: "abc" });
  assertEquals(bodies.map((b) => b.k), [k, k]);
  const e = await assertRejects(() => startTask("/music/task", { k }, { fetchFn: async () => new Response('{"error":"sign in"}', { status: 401 }) }), TaskError);
  assertEquals(e.status, 401);
});

Deno.test("task: the retry pace ends early when the network comes back", async () => {
  const win = new EventTarget();
  const t0 = Date.now();
  const p = pace(4, undefined, win);   // 16 s → capped 15 s, unless `online` fires
  win.dispatchEvent(new Event("online"));
  await p;
  assert(Date.now() - t0 < 1000);
});
