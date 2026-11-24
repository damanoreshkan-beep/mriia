import { assert, assertEquals } from "jsr:@std/assert@1";
import { DIRECTIONS, checkField, checkInput, catalogOf, liveCountries, startCountry, outcomeOf, elapsedOf, labelOf, excerptOf, readout, combOrder, fixtureRun, FIXTURE_CATALOG, FIXTURE_RESULT, TEXT_MAX, LIST_MAX } from "../posol.js";

Deno.test("posol: a URL gains its scheme, keeps its path, refuses what is not a web address", () => {
  assertEquals(checkField("url", "example.com/a?b=1"), { value: "https://example.com/a?b=1", error: "" });
  assertEquals(checkField("url", "  http://Example.com  "), { value: "http://example.com/", error: "" });
  assertEquals(checkField("url", "ftp://example.com").error, "url");
  assertEquals(checkField("url", "localhost").error, "url");
  assertEquals(checkField("url", "https://user:pw@example.com").error, "url");
  assertEquals(checkField("url", "not a url").error, "url");
  assertEquals(checkField("url", "").error, "empty");
  assertEquals(checkField("url", "", false), { value: "", error: "" });
});

Deno.test("posol: a domain loses scheme, path, port and case; an IDN becomes punycode", () => {
  assertEquals(checkField("domain", "https://WWW.Example.com/path"), { value: "www.example.com", error: "" });
  assertEquals(checkField("domain", "example.com:8443"), { value: "example.com", error: "" });
  assertEquals(checkField("domain", "приклад.укр").value, "xn--80aikifvh.xn--j1amh");
  assertEquals(checkField("domain", "nodot").error, "domain");
  assertEquals(checkField("domain", "bad_host.com").error, "domain");
});

Deno.test("posol: free text is squashed and capped", () => {
  assertEquals(checkField("text", "  best\n running   shoes "), { value: "best running shoes", error: "" });
  assertEquals(checkField("text", "x".repeat(TEXT_MAX + 1)).error, "long");
});

Deno.test("posol: a service's inputs are checked in order and the first failure is named", () => {
  const svc = { inputs: [{ name: "url", type: "url", required: true }, { name: "lang", type: "text", required: false }] };
  assertEquals(checkInput(svc, { url: "example.com" }), { ok: true, field: "", error: "", input: { url: "https://example.com/" } });
  assertEquals(checkInput(svc, { url: "", lang: "de" }), { ok: false, field: "url", error: "empty", input: {} });
  assertEquals(checkInput(svc, { url: "example.com", lang: "de" }).input, { url: "https://example.com/", lang: "de" });
});

Deno.test("posol: the catalog drops unknown directions, repeats and bad inputs, and groups services by direction", () => {
  const c = catalogOf({
    directions: [{ id: "tech", title: { uk: "Т", en: "T" } }, { id: "ads", title: { en: "A" } }, { id: "media", title: "M" }],
    services: [
      { id: "page", direction: "tech", title: { uk: "С", en: "P" }, inputs: [{ name: "url", type: "url" }, { name: "x", type: "file" }] },
      { id: "search", direction: "ads", title: { en: "S" } },
      { id: "page", direction: "ads" },
      { id: "ghost", direction: "nowhere" },
      { id: "tls", direction: "tech", inputs: [{ name: "domain", type: "domain", required: false, example: "a.b" }] },
    ],
    countries: [{ code: "de", name: { uk: "Німеччина", en: "Germany" }, slots: "3" }, { code: "XYZ", slots: 2 }, { code: "ZA", slots: -1 }],
  });
  assertEquals(c.services.map((s) => s.id), ["page", "tls", "search"]);
  assertEquals(c.directions.map((d) => d.id), ["tech", "ads"]);
  assertEquals(c.directions[1].title, { uk: "A", en: "A" });
  assertEquals(c.services[0].inputs, [{ name: "url", type: "url", required: true, example: "" }]);
  assertEquals(c.services[1].inputs[0].required, false);
  assertEquals(c.countries, [{ code: "DE", name: { uk: "Німеччина", en: "Germany" }, slots: 3 }, { code: "ZA", name: { uk: "", en: "" }, slots: 0 }]);
  assertEquals(catalogOf(null), { directions: [], services: [], countries: [] });
});

Deno.test("posol: live countries are the ones with an exit; the start country is remembered while it lives", () => {
  const c = catalogOf(FIXTURE_CATALOG);
  assertEquals(liveCountries(c).map((x) => x.code), ["US", "DE", "JP", "BR"]);
  assertEquals(startCountry(c, "JP").code, "JP");
  assertEquals(startCountry(c, "ZA").code, "US");
  assertEquals(startCountry({ countries: [] }, "DE"), null);
});

Deno.test("posol: every answer maps to one screen state", () => {
  assertEquals(outcomeOf(200, { ok: true, data: {} }), "ok");
  assertEquals(outcomeOf(200, { ok: false, failed: "blocked" }), "failed");
  assertEquals(outcomeOf(200, null), "failed");
  assertEquals([400, 401, 422, 429, 502, 0, 500].map((s) => outcomeOf(s, {})), ["input", "auth", "noexit", "busy", "failed", "offline", "failed"]);
});

Deno.test("posol: durations and labels read like words", () => {
  assertEquals(elapsedOf(840), "0.8 s");
  assertEquals(elapsedOf(12_400), "12 s");
  assertEquals(elapsedOf(undefined), "");
  assertEquals(labelOf("final_url"), "final url");
  assertEquals(labelOf("exitCountry"), "exit country");
});

Deno.test("posol: markdown becomes a plain excerpt with links as their words", () => {
  assertEquals(excerptOf("# Title\n\nSome **bold** [link](https://x.y) text.\n\n- one\n- two"), "Title\n\nSome bold link text.\n\n· one\n· two");
  const long = excerptOf("word ".repeat(400), 50);
  assert(long.endsWith("…") && long.length <= 51);
});

Deno.test("posol: the readout folds a page into title, excerpt, rows and lists", () => {
  const r = readout(FIXTURE_RESULT.data);
  assertEquals(r.title, "Example Domain — Deutschland");
  assert(r.excerpt.startsWith("Example Domain\n\nDiese Domain"));
  assertEquals(r.rows.map((x) => x.key), ["url", "final url", "http status", "lang", "meta description", "meta canonical"]);
  assertEquals(r.rows[2], { key: "http status", kind: "num", value: "200" });
  assertEquals(r.rows[1].kind, "url");
  assertEquals(r.lists, [{ key: "links", items: ["Mehr erfahren · https://www.iana.org/domains/example", "Impressum · https://example.com/de/impressum"], total: 2 }]);
  assertEquals(r.perCountry, []);
});

Deno.test("posol: the readout gives one block per country and a summary line", () => {
  const r = readout({ per_country: { de: { status: 200, blocked: false, country: "DE" }, US: { status: 451, blocked: true } }, summary: { differ: 1 } });
  assertEquals(r.summary, "differ: 1");
  assertEquals(r.perCountry.map((x) => x.code), ["DE", "US"]);
  assertEquals(r.perCountry[1].rows, [{ key: "status", kind: "num", value: "451" }, { key: "blocked", kind: "bool", value: true }]);
  const arr = readout({ per_country: [{ country: "jp", price: "¥1200" }] });
  assertEquals(arr.perCountry, [{ code: "JP", rows: [{ key: "price", kind: "text", value: "¥1200" }], lists: [] }]);
});

Deno.test("posol: the readout keeps lists short, empty values as none, deep objects in one row", () => {
  const r = readout({ hops: Array.from({ length: 20 }, (_, i) => `https://h${i}.example`), note: null, deep: { a: { b: 1, c: "x" } } });
  assertEquals(r.lists[0].items.length, LIST_MAX);
  assertEquals(r.lists[0].total, 20);
  assertEquals(r.rows[0], { key: "note", kind: "none", value: "" });
  assertEquals(r.rows[1], { key: "deep a", kind: "text", value: "b: 1 · c: x" });
  assertEquals(readout("plain").rows, [{ key: "value", kind: "text", value: "plain" }]);
  assertEquals(readout(null).rows, []);
});

Deno.test("posol: the comb lays services direction by direction", () => {
  const c = catalogOf(FIXTURE_CATALOG);
  const order = combOrder(c);
  assertEquals(order.length, c.services.length);
  assertEquals(order[0].s.id, "price");
  assertEquals(order.map((x) => x.g), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assertEquals(c.directions.map((d) => d.id), [...DIRECTIONS]);
});

Deno.test("posol: the gate answers a dead country with 422, a blocked URL with a failed run, else the page", () => {
  assertEquals(fixtureRun("page", "ZA", { url: "https://example.com/" }).status, 422);
  const f = fixtureRun("reach", "DE", { url: "https://blocked.example/" });
  assertEquals([f.status, outcomeOf(f.status, f.body), f.body.failed], [200, "failed", "blocked"]);
  const ok = fixtureRun("reach", "JP", { url: "https://example.com/" });
  assertEquals([outcomeOf(ok.status, ok.body), ok.body.service, ok.body.exit_country], ["ok", "reach", "JP"]);
});
