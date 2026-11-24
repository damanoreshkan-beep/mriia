/** The six directions of the Posol dictionary, in the order the catalog lays them. */
export const DIRECTIONS = Object.freeze(["commerce", "ads", "trust", "compliance", "media", "tech"]);

/** Input kinds a service may ask for. */
export const KINDS = Object.freeze(["url", "domain", "text"]);

/** Longest free-text input a run sends. */
export const TEXT_MAX = 300;

/** How many entries of one list the readout keeps. */
export const LIST_MAX = 12;

/** How many characters of a page's Markdown the readout keeps. */
export const EXCERPT_MAX = 700;

const VALUE_MAX = 400;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const squash = (v) => str(v).replace(/\s+/g, " ").trim();
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

const hostOk = (host) => HOST.test(host);
const punycode = (host) => {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return "";
  }
};

/**
 * One input checked by its kind: `{ value, error }`, where `value` is what the run sends (a URL gains `https://`,
 * a domain loses its scheme, path and case) and `error` is "" or one of `empty` · `url` · `domain` · `long`.
 */
export function checkField(type, raw, required = true) {
  const v = squash(raw);
  if (!v) return { value: "", error: required ? "empty" : "" };
  if (type === "url") {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(withScheme);
      if (!/^https?:$/.test(u.protocol) || u.username || u.password || /\s/.test(v)) return { value: "", error: "url" };
      if (!hostOk(u.hostname)) return { value: "", error: "url" };
      return { value: u.href, error: "" };
    } catch {
      return { value: "", error: "url" };
    }
  }
  if (type === "domain") {
    const bare = v.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#:]/)[0].replace(/\.$/, "").toLowerCase();
    const host = punycode(bare);
    if (!host || /\s/.test(bare) || !hostOk(host)) return { value: "", error: "domain" };
    return { value: host, error: "" };
  }
  if (v.length > TEXT_MAX) return { value: "", error: "long" };
  return { value: v, error: "" };
}

/**
 * Every input of a service checked at once: `{ ok, field, error, input }` — `field` and `error` name the FIRST
 * input that fails, `input` holds the values a run sends, by input name.
 */
export function checkInput(service, values = {}) {
  const input = {};
  for (const f of service?.inputs || []) {
    const { value, error } = checkField(f.type, values[f.name], f.required !== false);
    if (error) return { ok: false, field: f.name, error, input: {} };
    if (value) input[f.name] = value;
  }
  return { ok: true, field: "", error: "", input };
}

const word = (w) => (isObj(w) ? { uk: str(w.uk || w.en), en: str(w.en || w.uk) } : { uk: str(w), en: str(w) });

/**
 * The catalog the server sent, made safe to lay: services whose direction is unknown or whose id repeats are
 * dropped, inputs keep only the known kinds, countries keep a code and a slot count; directions with no service are
 * dropped. Order: directions as sent, services grouped by direction.
 */
export function catalogOf(raw) {
  const r = isObj(raw) ? raw : {};
  const dirs = (Array.isArray(r.directions) ? r.directions : []).filter((d) => isObj(d) && d.id).map((d) => ({ id: str(d.id), title: word(d.title) }));
  const known = new Set(dirs.map((d) => d.id));
  const seen = new Set();
  const services = (Array.isArray(r.services) ? r.services : []).filter((s) => {
    if (!isObj(s) || !s.id || !known.has(str(s.direction)) || seen.has(str(s.id))) return false;
    seen.add(str(s.id));
    return true;
  }).map((s) => ({
    id: str(s.id),
    direction: str(s.direction),
    title: word(s.title),
    returns: word(s.returns),
    inputs: (Array.isArray(s.inputs) ? s.inputs : []).filter((f) => isObj(f) && f.name && KINDS.includes(f.type))
      .map((f) => ({ name: str(f.name), type: f.type, required: f.required !== false, example: str(f.example) })),
  }));
  const order = new Map(dirs.map((d, i) => [d.id, i]));
  services.sort((a, b) => order.get(a.direction) - order.get(b.direction));
  const directions = dirs.filter((d) => services.some((s) => s.direction === d.id));
  const countries = (Array.isArray(r.countries) ? r.countries : []).filter((c) => isObj(c) && /^[A-Za-z]{2}$/.test(str(c.code)))
    .map((c) => ({ code: str(c.code).toUpperCase(), name: word(c.name), slots: Math.max(0, Math.floor(Number(c.slots) || 0)) }));
  return { directions, services, countries };
}

/** The countries an envoy can reach now (at least one live exit), the busiest first, then by code. */
export const liveCountries = (catalog) => (catalog?.countries || []).filter((c) => c.slots > 0).sort((a, b) => b.slots - a.slots || a.code.localeCompare(b.code));

/** The country a run starts in: the remembered one while it is still live, else the first live one, else null. */
export function startCountry(catalog, remembered) {
  const live = liveCountries(catalog);
  return live.find((c) => c.code === remembered) || live[0] || null;
}

/** What a run's answer means for the screen: `ok` · `failed` · `input` · `auth` · `noexit` · `busy` · `offline`. */
export function outcomeOf(status, body) {
  if (status === 200) return isObj(body) && body.ok !== false && !body.failed ? "ok" : "failed";
  if (status === 400) return "input";
  if (status === 401) return "auth";
  if (status === 422) return "noexit";
  if (status === 429) return "busy";
  if (!status) return "offline";
  return "failed";
}

/** A run's duration for a person: "0.8 s", "12 s", or "" when unknown. */
export function elapsedOf(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "";
  return n < 10_000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n / 1000)} s`;
}

/** A data key as a label: "final_url" → "final url", "perCountry" → "per country". */
export const labelOf = (key) => str(key).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

const valueOf = (v) => {
  if (v === null || v === undefined || v === "") return { kind: "none", value: "" };
  if (typeof v === "boolean") return { kind: "bool", value: v };
  if (typeof v === "number") return { kind: "num", value: Number.isFinite(v) ? String(v) : "" };
  const s = squash(v);
  if (/^https?:\/\/\S+$/i.test(s)) return { kind: "url", value: s.slice(0, VALUE_MAX) };
  return { kind: "text", value: s.length > VALUE_MAX ? `${s.slice(0, VALUE_MAX - 1)}…` : s };
};

const lineOf = (o) => {
  if (!isObj(o)) return valueOf(o).value === "" ? "" : String(valueOf(o).value);
  const pick = ["title", "text", "name", "label", "url", "href", "value"].map((k) => o[k]).filter((x) => typeof x === "string" && x.trim());
  const words = (pick.length ? pick : Object.values(o).filter((x) => typeof x === "string" || typeof x === "number")).slice(0, 2).map(squash);
  return words.join(" · ").slice(0, VALUE_MAX);
};

const flatten = (key, v, rows, lists, depth) => {
  if (Array.isArray(v)) {
    const items = v.slice(0, LIST_MAX).map(lineOf).filter(Boolean);
    lists.push({ key: labelOf(key), items, total: v.length });
    return;
  }
  if (isObj(v)) {
    if (depth >= 1) {
      rows.push({ key: labelOf(key), kind: "text", value: Object.entries(v).map(([k, x]) => `${labelOf(k)}: ${lineOf(x)}`).join(" · ").slice(0, VALUE_MAX) });
      return;
    }
    for (const [k, x] of Object.entries(v)) flatten(`${key} ${k}`, x, rows, lists, depth + 1);
    return;
  }
  rows.push({ key: labelOf(key), ...valueOf(v) });
};

/** Markdown as a plain excerpt: no markup, links as their words, blank lines kept as paragraph breaks. */
export function excerptOf(md, max = EXCERPT_MAX) {
  const text = str(md)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "· ")
    .replace(/[*_`|>]+/g, "")
    .split(/\n{2,}/).map((p) => {
      const lines = p.split("\n").map(squash).filter(Boolean);
      return lines.join(lines.some((l) => l.startsWith("· ")) ? "\n" : " ");
    }).filter(Boolean).join("\n\n");
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, "")}…` : text;
}

const SKIP = new Set(["title", "markdown", "per_country", "summary"]);

const perCountryOf = (pc) => {
  const entries = Array.isArray(pc)
    ? pc.filter(isObj).map((x) => [str(x.country || x.code), x])
    : isObj(pc) ? Object.entries(pc) : [];
  return entries.filter(([code]) => code).map(([code, v]) => {
    const rows = [], lists = [];
    if (isObj(v)) for (const [k, x] of Object.entries(v)) { if (k !== "country" && k !== "code") flatten(k, x, rows, lists, 1); }
    else rows.push({ key: "", ...valueOf(v) });
    return { code: code.toUpperCase(), rows, lists };
  });
};

/**
 * A service's `data` as a readout a person reads: `{ title, excerpt, summary, perCountry, rows, lists }` — the
 * page's title and a Markdown excerpt when present, a summary line, one block per country when the answer compares
 * countries, scalar fields as key/value rows (one level of nesting folded into the key), arrays as short lists.
 */
export function readout(data) {
  const d = isObj(data) ? data : data == null ? {} : { value: data };
  const rows = [], lists = [];
  for (const [k, v] of Object.entries(d)) if (!SKIP.has(k)) flatten(k, v, rows, lists, 0);
  const summary = isObj(d.summary) ? Object.entries(d.summary).map(([k, v]) => `${labelOf(k)}: ${lineOf(v)}`).join(" · ") : squash(d.summary);
  const title = squash(d.title);
  const paras = d.markdown ? excerptOf(d.markdown).split("\n\n") : [];
  if (title && paras.length > 1 && title.toLowerCase().startsWith(paras[0].toLowerCase())) paras.shift();
  return { title, excerpt: paras.join("\n\n"), summary, perCountry: perCountryOf(d.per_country), rows, lists };
}

/** The comb's order: services grouped by direction, the first direction's first service at the centre. */
export function combOrder(catalog) {
  const dirs = catalog?.directions || [];
  return dirs.flatMap((d, g) => (catalog.services || []).filter((s) => s.direction === d.id).map((s) => ({ s, g })));
}

/** The catalog the gate and a first offline open show: six directions, a dozen services, five countries. */
export const FIXTURE_CATALOG = Object.freeze({
  directions: [
    { id: "commerce", title: { uk: "Ціни і комерція", en: "Prices and commerce" } },
    { id: "ads", title: { uk: "Реклама, пошук і ШІ", en: "Ads, search and AI" } },
    { id: "trust", title: { uk: "Безпека і довіра", en: "Security and trust" } },
    { id: "compliance", title: { uk: "Доступ і правила", en: "Access and compliance" } },
    { id: "media", title: { uk: "Контент і медіа", en: "Content and media" } },
    { id: "tech", title: { uk: "Технічна якість", en: "Technical quality" } },
  ],
  services: [
    { id: "price", direction: "commerce", title: { uk: "Ціна товару", en: "Product price" }, returns: { uk: "Ціна, валюта і наявність, якими їх бачить покупець у країні", en: "The price, currency and stock a shopper in the country sees" }, inputs: [{ name: "url", type: "url", required: true, example: "https://shop.example/item/42" }] },
    { id: "checkout", direction: "commerce", title: { uk: "Доставка і оплата", en: "Shipping and payment" }, returns: { uk: "Чи доставляють у країну і якими способами платять", en: "Whether the shop ships there and which payments it takes" }, inputs: [{ name: "url", type: "url", required: true, example: "https://shop.example" }] },
    { id: "search", direction: "ads", title: { uk: "Пошукова видача", en: "Search results" }, returns: { uk: "Перші результати пошуку за запитом, як їх видно з країни", en: "The top search results for a query, as seen from the country" }, inputs: [{ name: "query", type: "text", required: true, example: "best running shoes" }] },
    { id: "ads-seen", direction: "ads", title: { uk: "Реклама на сторінці", en: "Ads on a page" }, returns: { uk: "Рекламні блоки і хто їх показує", en: "The ad slots and who serves them" }, inputs: [{ name: "url", type: "url", required: true, example: "https://news.example" }] },
    { id: "cloak", direction: "trust", title: { uk: "Підміна сторінки", en: "Cloaking check" }, returns: { uk: "Чи показує сайт країні іншу сторінку, ніж решті світу", en: "Whether the site shows this country a different page than the rest" }, inputs: [{ name: "url", type: "url", required: true, example: "https://example.com" }] },
    { id: "tls", direction: "trust", title: { uk: "Сертифікат", en: "Certificate" }, returns: { uk: "Хто видав сертифікат, до якої дати він дійсний і чи збігається ланцюжок", en: "Who issued the certificate, until when it holds, whether the chain matches" }, inputs: [{ name: "domain", type: "domain", required: true, example: "example.com" }] },
    { id: "reach", direction: "compliance", title: { uk: "Доступність", en: "Reachability" }, returns: { uk: "Чи відкривається сайт з країни, код відповіді і час", en: "Whether the site opens from the country, the status code and the time" }, inputs: [{ name: "url", type: "url", required: true, example: "https://example.com" }] },
    { id: "consent", direction: "compliance", title: { uk: "Банер згоди", en: "Consent banner" }, returns: { uk: "Чи питає сайт згоду на куки і що ставить до неї", en: "Whether the site asks for cookie consent and what it sets before it" }, inputs: [{ name: "url", type: "url", required: true, example: "https://example.com" }] },
    { id: "yt-region", direction: "media", title: { uk: "Відео в регіоні", en: "Video by region" }, returns: { uk: "Чи грає відео в країні, або чому заблоковане", en: "Whether a video plays in the country, or why it is blocked" }, inputs: [{ name: "url", type: "url", required: true, example: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }] },
    { id: "news", direction: "media", title: { uk: "Головна новин", en: "News front page" }, returns: { uk: "Заголовки, якими сайт новин зустрічає країну", en: "The headlines a news site greets the country with" }, inputs: [{ name: "domain", type: "domain", required: true, example: "bbc.com" }] },
    { id: "page", direction: "tech", title: { uk: "Сторінка з країни", en: "Page from a country" }, returns: { uk: "Назва, мова, текст і посилання сторінки, якою її бачать у країні", en: "The title, language, text and links of a page as the country sees it" }, inputs: [{ name: "url", type: "url", required: true, example: "https://example.com" }] },
    { id: "geo-redirects", direction: "tech", title: { uk: "Гео-переадресація", en: "Geo redirects" }, returns: { uk: "Куди сайт переадресовує відвідувача з країни, крок за кроком", en: "Where the site sends a visitor from the country, hop by hop" }, inputs: [{ name: "url", type: "url", required: true, example: "https://example.com" }] },
  ],
  countries: [
    { code: "DE", name: { uk: "Німеччина", en: "Germany" }, slots: 3 },
    { code: "US", name: { uk: "США", en: "United States" }, slots: 4 },
    { code: "JP", name: { uk: "Японія", en: "Japan" }, slots: 2 },
    { code: "BR", name: { uk: "Бразилія", en: "Brazil" }, slots: 1 },
    { code: "ZA", name: { uk: "Південна Африка", en: "South Africa" }, slots: 0 },
  ],
});

/** The canned answer of one run under the gate: a page as Germany sees it. */
export const FIXTURE_RESULT = Object.freeze({
  service: "page",
  country: "DE",
  exit_country: "DE",
  ok: true,
  failed: null,
  elapsed_ms: 2840,
  data: {
    url: "https://example.com/",
    final_url: "https://example.com/de/",
    http_status: 200,
    title: "Example Domain — Deutschland",
    lang: "de",
    markdown: "# Example Domain\n\nDiese Domain ist für Beispiele in Dokumenten gedacht. Sie dürfen sie ohne vorherige Absprache verwenden.\n\n- [Mehr erfahren](https://www.iana.org/domains/example)\n- Preise in EUR, Versand innerhalb der EU",
    links: [{ text: "Mehr erfahren", url: "https://www.iana.org/domains/example" }, { text: "Impressum", url: "https://example.com/de/impressum" }],
    meta: { description: "Beispielseite für Dokumentation", canonical: "https://example.com/de/" },
  },
});

/** What the gate answers to a run: 422 for a country with no exit, a failed result for a URL that names "blocked", else the canned page. */
export function fixtureRun(service, country, input) {
  const c = FIXTURE_CATALOG.countries.find((x) => x.code === country);
  if (!c || c.slots < 1) return { status: 422, body: { error: "no exit", country } };
  if (Object.values(input || {}).some((v) => /blocked/i.test(str(v)))) {
    return { status: 200, body: { service, country, exit_country: country, ok: false, data: { http_status: 451 }, failed: "blocked", elapsed_ms: 1210 } };
  }
  return { status: 200, body: { ...FIXTURE_RESULT, service, country, exit_country: country } };
}
