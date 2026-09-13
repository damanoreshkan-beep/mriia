import { makeGenerator } from "/_rt/genchar.js";
import { $genCharLoading, $genCharPct, $genCharError, $newChar, addMyChar, toggleChar } from "./state.js";

const gen = makeGenerator({
  jobKey: "afterdark:genJob",
  $loading: $genCharLoading, $pct: $genCharPct, $error: $genCharError,
  onDone: (c) => { addMyChar(c); toggleChar(c.id); $newChar.set(c.id); },
});
export const { generateCharacter, resumeGeneration, cancelGenerate, genElapsed } = gen;

setTimeout(resumeGeneration, 0);   
