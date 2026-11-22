import { shell } from "/_rt/shell.js";
import { Effect } from "/_rt/fx.js";

export const tried = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e });
export const call = (action, args = {}) => tried(() => shell.call(action, args));
export const probe = (action, land, lost) => call(action).pipe(
  Effect.flatMap((v) => Effect.try({ try: () => land(v), catch: (e) => e })),
  Effect.catch((e) => Effect.sync(() => lost(e))),
);
export const offered = (action, step) => Effect.suspend(() => shell.has(action) ? step : Effect.void);
