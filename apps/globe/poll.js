import { Effect } from "/_rt/fx.js";

export const fetched = (url) => Effect.tryPromise({
  try: async () => {
    const r = await fetch(url);
    if (!r.ok) throw 0;
    return r.json();
  },
  catch: (e) => e,
});
export const every = (ms, step) => step.pipe(Effect.forkChild, Effect.andThen(Effect.sleep(ms)), Effect.forever);
export const watch = (ms, step) => {
  const fiber = Effect.runFork(every(ms, step.pipe(Effect.catchCause(() => Effect.void))));
  return () => fiber.interruptUnsafe();
};
