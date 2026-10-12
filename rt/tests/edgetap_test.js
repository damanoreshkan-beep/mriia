import { assertEquals } from "jsr:@std/assert@1";
import { edgeStep } from "../edgetap.js";

Deno.test("edgeStep: left third back, right third forward, the middle is the surface's own tap", () => {
  assertEquals(edgeStep(10, 384), -1);
  assertEquals(edgeStep(115, 384), -1);
  assertEquals(edgeStep(192, 384), 0);
  assertEquals(edgeStep(260, 384), 0);
  assertEquals(edgeStep(270, 384), 1);
  assertEquals(edgeStep(370, 384), 1);
});

Deno.test("edgeStep: a synthetic click (no position) and a zero-width surface are the middle", () => {
  assertEquals(edgeStep(null, 384), 0);
  assertEquals(edgeStep(5, 0), 0);
});
