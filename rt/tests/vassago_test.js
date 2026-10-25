// rt/vassago.js — the arrangement of the edge's answer: the region URL, the day an event belongs to, the ranking of a
// day, the next big event. The edge's real shapes (from a live /feed/vassago answer, 2026-10-25) are the inputs.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { vassagoUrl, dayOf, byDay, nextBig, rank, labelOf, startOf, fixtureEvents, REGIONS, VECTOR_IDS } from "../vassago.js";

Deno.test("vassago url: a region's countries, natal ETH, 60 days; all = no country filter", () => {
  assertEquals(vassagoUrl("IL", { base: "https://x/feed" }), "https://x/feed/vassago?days=60&natal=eth&countries=IL");
  assertEquals(vassagoUrl("all", { base: "https://x/feed" }), "https://x/feed/vassago?days=60&natal=eth");
  assert(vassagoUrl("nope", { base: "B" }).endsWith("countries=" + REGIONS.mine.join(",")), "an unknown region falls back to mine");
});

Deno.test("dayOf: calendar kinds keep their own date; a timed event is the reader's day; month precision has no day", () => {
  assertEquals(dayOf({ at: "2026-10-27T00:00:00.000Z", date: "2026-10-27", vector: "politics", kind: "election" }), "2026-10-27");
  assertEquals(dayOf({ at: "2026-12-24T13:00:00.000Z", date: "2026-12-25", vector: "holidays", kind: "public" }), "2026-12-25");
  const t = Date.parse("2026-10-28T18:00:00.000Z"), d = new Date(t);
  assertEquals(dayOf({ at: "2026-10-28T18:00:00.000Z", vector: "macro", kind: "central_bank" }), `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  assertEquals(dayOf({ at: "2027-03-01T00:00:00.000Z", date: "2027-03", vector: "politics", kind: "election" }), null);
});

Deno.test("byDay: sorted days, ranked events (a rate decision leads), counts per vector, undated aside, a filter", () => {
  const ev = fixtureEvents(Date.parse("2026-10-25T08:00:00"));
  const { days, undated } = byDay(ev);
  assert(days.every((d, i) => i === 0 || days[i - 1].day < d.day), "days sorted");
  assertEquals(undated.map((e) => e.label), ["Mongolia — President"]);
  const big = days.find((d) => d.events.some((e) => e.label.startsWith("NBU")));
  assertEquals(big.events[0].kind, "central_bank");
  assertEquals(big.counts.macro, 3);
  const sky = byDay(ev, { only: "sky" });
  assert(sky.days.every((d) => d.events.every((e) => e.vector === "sky")) && sky.undated.length === 0);
  assertEquals(new Set(ev.map((e) => e.vector)).size, VECTOR_IDS.length, "the fixture carries every vector");
});

Deno.test("rank + nextBig: a central bank beats a holiday; the next big event is the first rate decision ahead", () => {
  assert(rank({ kind: "central_bank" }) < rank({ vector: "holidays", kind: "public" }));
  assert(rank({ vector: "sky", kind: "ingress", data: { body: "Moon" } }) > rank({ vector: "sky", kind: "ingress", data: { body: "Mars" } }));
  const now = Date.parse("2026-10-25T08:00:00");
  const ev = fixtureEvents(now);
  const n = nextBig(ev, now);
  assert(n && (n.kind === "central_bank" || n.kind === "election" || n.impact === "high"));
  assert(Date.parse(n.at) >= now && ev.filter((e) => Date.parse(e.at) >= now && rank(e) <= 2).every((e) => Date.parse(e.at) >= Date.parse(n.at)));
  assertEquals(nextBig([], now), null);
});

const UK = JSON.parse(Deno.readTextFileSync(new URL("../../apps/vassago/i18n/uk.json", import.meta.url)));
Deno.test("skyLabel: the edge's computed sky in the reader's words; an unknown kind keeps the edge's label", () => {
  const sky = (kind, data, label = "x") => labelOf({ vector: "sky", kind, data, label }, "uk", UK);
  assertEquals(sky("moon_phase", { quarter: 2 }), "Повня");
  assertEquals(sky("ingress", { body: "Venus", sign: "Libra" }), "Венера → Терези");
  assertEquals(sky("aspect", { a: "Sun", b: "Pluto", aspect: "square" }), "Сонце □ Плутон");
  assertEquals(sky("transit", { a: "Mars", natal: "Uranus", aspect: "square", chart: "eth" }), "Марс □ Уран · ETH");
  assertEquals(sky("station", { body: "Mercury", motion: "direct" }), "Меркурій: розворот уперед");
  assertEquals(sky("solar_eclipse", { type: "annular" }), "Кільцеве сонячне затемнення");
  assertEquals(sky("lunar_apsis", {}, "lunar perigee"), "Місяць у перигеї");
  assertEquals(sky("season", {}, "March equinox"), "Весняне рівнодення");
  assertEquals(sky("future_kind", {}, "edge words"), "edge words");
  assertEquals(labelOf({ vector: "macro", kind: "central_bank", label: "Fed" }, "uk", UK), "Fed", "not the sky → the source's words");
});

Deno.test("startOf: an all-day event counts down to the reader's midnight of its date; a timed one to its instant", () => {
  assertEquals(startOf({ at: "2026-10-27T00:00:00.000Z", date: "2026-10-27", vector: "politics", kind: "election" }), new Date("2026-10-27T00:00:00").getTime());
  assertEquals(startOf({ at: "2026-10-28T18:00:00.000Z", vector: "macro", kind: "central_bank" }), Date.parse("2026-10-28T18:00:00.000Z"));
});

Deno.test("labelOf: Ukraine's holidays in Ukrainian for a Ukrainian reader, the source's label otherwise", () => {
  const e = { label: "Independence Day", local: "День незалежності", country: "UA" };
  assertEquals([labelOf(e, "uk"), labelOf(e, "en"), labelOf({ ...e, country: "IL", local: "x" }, "uk")], ["День незалежності", "Independence Day", "Independence Day"]);
});
