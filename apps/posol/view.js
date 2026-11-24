import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { session } from "/_rt/auth.js";
import { authWall } from "/_rt/authwall.js";
import { Comb, MARK } from "/_rt/comb.js";
import { Panel } from "/_rt/ui.js";
import { Scramble } from "/_rt/skeleton.js";
import { catalogOf, checkInput, liveCountries, startCountry, outcomeOf, elapsedOf, readout, combOrder, fixtureRun, FIXTURE_CATALOG } from "/_rt/posol.js";

const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const PILL = "btn rounded-full sf-raised shrink-0 h-[var(--ms-ctl)] min-h-0 gap-2 font-medium ms-press";
const ROUND = "btn rounded-full sf-raised btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ms-press";
const COLORS = ["accent", "secondary", "ink"];
const FIELD_KEY = { url: "fUrl", domain: "fDomain", text: "fText" };
const ERR_KEY = { empty: "errEmpty", url: "errUrl", domain: "errDomain", long: "errLong", bad: "errBad" };
const STATE_KEY = { busy: "errBusy", auth: "errAuth", offline: "errOffline", failed: "errFailed" };
const CATALOG_MS = 20000, RUN_MS = 90000;

const Icon = (icon, cls = "") => html`<iconify-icon icon=${icon} class=${cls} aria-hidden="true"></iconify-icon>`;
const Dot = () => html`<span aria-hidden="true" class="w-1.5 h-1.5 rounded-full shrink-0" style="background:var(--app-accent)"></span>`;
const post = (path, body, ms) => fetch(`${VPS_PROXY}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
const json = { encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s); } catch { return null; } } };

const $kept = persistentAtom("posol:catalog", null, json);
const $country = persistentAtom("posol:country", "");
const kept = gate ? null : catalogOf($kept.get());
const $catalog = atom(gate ? catalogOf(FIXTURE_CATALOG) : kept?.services.length ? kept : null);
const $catErr = atom(false);
const $values = atom({});
const $run = atom(null);
let loading = null, seq = 0;

function loadCatalog() {
  if (gate || loading) return;
  $catErr.set(false);
  loading = post("/posol/catalog", {}, CATALOG_MS)
    .then(async (r) => {
      if (r.status === 401) authWall.set(authWall.get() + 1);
      if (!r.ok) throw new Error(String(r.status));
      const c = catalogOf(await r.json());
      if (!c.services.length) throw new Error("empty");
      $catalog.set(c);
      $kept.set(c);
    })
    .catch(() => $catErr.set(true))
    .finally(() => { loading = null; });
}

async function send(svc, country, values) {
  const mine = ++seq;
  const base = { svc: svc.id, country, seq: mine };
  const chk = checkInput(svc, values);
  if (!chk.ok) { $run.set({ ...base, state: "input", field: chk.field, error: chk.error }); return; }
  if (!gate && !session.get()) { authWall.set(authWall.get() + 1); $run.set({ ...base, state: "auth" }); return; }
  $run.set({ ...base, state: "running" });
  let status = 0, body = null;
  if (gate) ({ status, body } = fixtureRun(svc.id, country, chk.input));
  else {
    try {
      const r = await post("/posol/run", { service: svc.id, country, input: chk.input }, RUN_MS);
      status = r.status;
      body = await r.json().catch(() => null);
    } catch { status = 0; }
  }
  if ($run.get()?.seq !== mine) return;
  const state = outcomeOf(status, body);
  $run.set({ ...base, state, body, field: state === "input" ? String(body?.field || svc.inputs[0]?.name || "") : "", error: state === "input" ? "bad" : "" });
}

export function posol({ S }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const stack = useStore(S.stack);
  const catalog = useStore($catalog), catErr = useStore($catErr);
  const remembered = useStore($country);
  const values = useStore($values), run = useStore($run);
  const [bloom, setBloom] = useState(null);
  const head = useRef(null);
  const [headH, setHeadH] = useState(72);

  useEffect(() => { loadCatalog(); }, []);
  const top = stack.length ? stack[stack.length - 1] : "";
  const svcId = (stack.find((x) => String(x).startsWith("svc:")) || "").slice(4);
  const layer = top === "countries" ? "countries" : svcId ? "service" : "catalog";
  useEffect(() => { setBloom(null); }, [layer]);
  useEffect(() => {
    const el = head.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHeadH(el.offsetHeight || 0)); ro.observe(el); setHeadH(el.offsetHeight || 0);
    return () => ro.disconnect();
  }, [layer]);

  const loc = (w) => (w ? w[locale] || w.en || w.uk || "" : "");
  const all = catalog?.countries || [];
  const live = catalog ? liveCountries(catalog) : [];
  const picked = all.find((c) => c.code === remembered) || (catalog ? startCountry(catalog, remembered) : null);
  const code = picked?.code || remembered || "";
  const dirOf = (id) => catalog?.directions.find((d) => d.id === id);
  const svc = catalog?.services.find((s) => s.id === svcId) || null;
  const push = (v) => S.stack.set([...S.stack.get(), v]);
  const pop = () => { const st = S.stack.get(); if (st.length) S.stack.set(st.slice(0, -1)); };
  const openSvc = (id) => S.stack.set([`svc:${id}`]);
  const pick = (c) => { $country.set(c.code); pop(); };
  const countryName = (c) => (c ? loc(c.name) || c.code : "");

  const countryChip = (cls = "") => html`<button data-country-pick aria-label=${`${T(t, "aCountry")}: ${countryName(picked)}`} onClick=${() => push("countries")} class=${`${PILL} px-3.5 min-w-0 ${cls || "max-w-full"}`}>
    ${Icon("lucide:globe", "text-[length:var(--ms-icon)] shrink-0")}
    <span class="font-mono text-sm tabular-nums shrink-0">${code || "··"}</span>
    <span class="truncate min-w-0">${countryName(picked)}</span>
  </button>`;

  const backRow = (eyebrow, title) => html`<nav data-nav class="flex items-center gap-3">
    <button data-back aria-label=${T(t, "aBack")} onClick=${pop} class=${ROUND}>${Icon("lucide:arrow-left", "text-[length:var(--ms-icon)]")}</button>
    <div class="min-w-0 flex-1 flex flex-col gap-0.5 leading-tight">
      <span class=${LABEL}>${eyebrow}</span>
      <h2 class="font-bold text-[1.35rem] leading-tight tracking-tight truncate">${title}</h2>
    </div>
  </nav>`;

  if (!catalog) {
    return html`<div data-posol data-layer="catalog" data-catalog=${catErr ? "error" : "loading"} class="flex flex-col gap-4">
      <div ref=${head} class="relative z-10 pointer-events-none [&_button]:pointer-events-auto flex items-end justify-between gap-3 px-0.5">
        <h2 class="text-[2rem] font-bold leading-none tracking-tight">${T(t, "catalog")}</h2>
      </div>
      ${catErr ? html`<div data-catalog-error class="relative z-10 flex flex-col items-center text-center gap-3 py-16 px-6">
        ${Icon("lucide:cloud-off", "text-4xl text-base-content/70")}
        <p class="text-sm">${T(t, "errCatalog")}</p>
        <button data-retry onClick=${loadCatalog} class=${`${PILL} px-4`}>${Icon("lucide:rotate-cw", "text-[length:var(--ms-icon)]")}<span>${T(t, "aRetry")}</span></button>
      </div>` : html`<${Comb} items=${[]} loading=${true} top=${headH + 32} />`}
    </div>`;
  }

  if (layer === "service" && svc) {
    const dir = dirOf(svc.direction);
    const mine = run && run.svc === svc.id ? run : null;
    const busy = mine?.state === "running";
    const setVal = (name, v) => { $values.set({ ...values, [svc.id]: { ...(values[svc.id] || {}), [name]: v } }); if (mine?.state === "input") $run.set(null); };
    const submit = (e) => { e.preventDefault(); if (!busy) send(svc, code, values[svc.id] || {}); };
    return html`<div data-posol data-layer="service" data-service=${svc.id} data-run=${mine?.state || null} class="flex flex-col gap-[calc(var(--ms-gap)*1.5)] w-full max-w-[36rem] mx-auto">
      ${backRow(loc(dir?.title), loc(svc.title))}
      <div class="flex flex-col gap-1 px-0.5">
        <span class=${LABEL}>${T(t, "returns")}</span>
        <p data-returns class="text-[0.95rem] leading-snug">${loc(svc.returns)}</p>
      </div>
      <${Panel}>
        <form data-form onSubmit=${submit} class="flex flex-col gap-[var(--ms-gap)]" novalidate>
          <div class="flex items-center justify-between gap-3">
            <span class=${LABEL}>${T(t, "country")}</span>
            ${countryChip()}
          </div>
          ${svc.inputs.map((f) => {
            const err = mine?.state === "input" && mine.field === f.name ? T(t, ERR_KEY[mine.error] || "errBad") : "";
            const id = `ps-in-${f.name}`;
            return html`<label key=${f.name} class="flex flex-col gap-1.5">
              <span class=${LABEL}>${T(t, FIELD_KEY[f.type] || "fText")}</span>
              <textarea id=${id} rows="1" data-line data-input=${f.name} inputmode=${f.type === "text" ? "text" : "url"} enterkeyhint="go" autocomplete="off" autocapitalize="off" spellcheck="false"
                placeholder=${f.example} value=${values[svc.id]?.[f.name] || ""} onInput=${(e) => setVal(f.name, e.target.value)}
                aria-invalid=${err ? "true" : null} aria-describedby=${err ? `${id}-err` : null}
                class=${`textarea w-full rounded-[var(--ms-r-in)] text-base leading-6 ${err ? "textarea-error" : ""}`}></textarea>
              ${err ? html`<span id=${`${id}-err`} data-field-error class="text-sm text-error">${err}</span>` : null}
            </label>`;
          })}
          <button type="submit" data-send aria-busy=${busy ? "true" : null} disabled=${busy}
            class=${`btn btn-primary rounded-full w-full min-h-[var(--ms-ctl)] h-auto text-base font-bold ms-press ${busy ? "animate-pulse" : ""}`}>
            ${Icon(busy ? "lucide:send" : "lucide:send-horizontal", "text-[length:var(--ms-icon)]")}
            <span>${T(t, busy ? "running" : mine && mine.state !== "input" ? "aRunAgain" : "aRun")}</span>
          </button>
        </form>
      </${Panel}>
      ${mine ? Result(mine) : null}
    </div>`;
  }

  function Result(r) {
    if (r.state === "input") return null;
    if (r.state === "running") return html`<section data-result="running" aria-busy="true" class="flex flex-col gap-3 px-0.5">
      <div class=${LABEL}><${Scramble} len=${18} /></div>
      <div class="font-bold text-[1.25rem]"><${Scramble} len=${28} /></div>
      ${[0, 1, 2].map((i) => html`<div key=${i} class="text-sm text-base-content/70"><${Scramble} len=${40 - i * 8} /></div>`)}
    </section>`;
    if (r.state === "noexit") {
      const c = all.find((x) => x.code === r.country);
      return html`<p data-result="noexit" role="alert" class="text-sm text-error px-0.5">${T(t, "errNoExit", { country: countryName(c) || r.country })}</p>`;
    }
    if (r.state !== "ok" && !(r.state === "failed" && r.body && typeof r.body === "object" && "data" in r.body)) {
      return html`<p data-result=${r.state} role="alert" class="text-sm text-error px-0.5">${T(t, STATE_KEY[r.state] || "errFailed")}</p>`;
    }
    const b = r.body || {};
    const out = readout(b.data);
    const exit = all.find((x) => x.code === String(b.exit_country || "").toUpperCase());
    const shown = (row) => row.kind === "bool" ? T(t, row.value ? "yes" : "no") : row.kind === "none" ? "—" : row.value;
    const value = (row) => row.kind === "url"
      ? html`<a href=${row.value} target="_blank" rel="noopener noreferrer" class="link link-hover break-all">${row.value}</a>`
      : html`<span class="break-words">${shown(row)}</span>`;
    const rowsOf = (rows) => rows.length ? html`<dl class="flex flex-col">${rows.map((row, i) => html`<div key=${i} data-row class=${`flex gap-3 py-2 text-sm ${i ? "border-t border-base-content/10" : ""}`}>
      <dt class=${`${LABEL} w-[38%] shrink-0 pt-0.5 break-words`}>${row.key || "·"}</dt><dd class="min-w-0 flex-1">${value(row)}</dd>
    </div>`)}</dl>` : null;
    const listsOf = (lists) => lists.map((l) => html`<div key=${l.key} data-list class="flex flex-col gap-1.5">
      <span class=${LABEL}>${l.key}${l.total ? ` · ${l.total}` : ""}</span>
      <ul class="flex flex-col gap-1 text-sm">${l.items.map((x, i) => html`<li key=${i} class="break-words leading-snug">${x}</li>`)}</ul>
      ${l.total > l.items.length ? html`<span class="text-xs text-base-content/70">${T(t, "more", { n: l.total - l.items.length })}</span>` : null}
    </div>`);
    return html`<section data-result=${r.state} aria-live="polite" class="flex flex-col gap-[var(--ms-gap)] px-0.5 pb-4">
      <div data-exit class=${`${LABEL} flex flex-wrap items-center gap-x-3 gap-y-1`}>
        <span class="inline-flex items-center gap-1.5">${Dot()}${T(t, "exitFrom")} · ${b.exit_country || r.country}${exit ? ` · ${countryName(exit)}` : ""}</span>
        ${elapsedOf(b.elapsed_ms) ? html`<span class="tabular-nums">${T(t, "elapsed")} · <span class="normal-case">${elapsedOf(b.elapsed_ms)}</span></span>` : null}
      </div>
      ${r.state === "failed" ? html`<p data-failed role="alert" class="text-sm text-error">${T(t, "failedWhy", { why: String(b.failed || "—") })}</p>` : null}
      ${out.title ? html`<h3 data-page-title class="font-bold text-[1.25rem] leading-tight tracking-tight break-words">${out.title}</h3>` : null}
      ${out.excerpt ? html`<p data-excerpt class="whitespace-pre-line text-[0.9rem] leading-relaxed text-base-content/80 break-words">${out.excerpt}</p>` : null}
      ${out.summary ? html`<p data-summary class="text-sm font-medium break-words">${out.summary}</p>` : null}
      ${out.perCountry.map((pc) => { const c = all.find((x) => x.code === pc.code); return html`<${Panel} key=${pc.code} title=${`${pc.code}${c ? ` · ${countryName(c)}` : ""}`} data-country-block=${pc.code}>${rowsOf(pc.rows)}${listsOf(pc.lists)}</${Panel}>`; })}
      ${rowsOf(out.rows)}
      ${listsOf(out.lists)}
    </section>`;
  }

  if (layer === "countries") {
    const ordered = [...live, ...all.filter((c) => c.slots < 1)];
    const items = ordered.map((c) => ({ id: `c:${c.code}`, name: countryName(c), subtitle: c.slots ? `${c.code} · ${T(t, "wExits")} ${c.slots}` : `${c.code} · ${T(t, "noExit")}`, icon: null, color: c.slots ? "accent" : "ink", mark: c.code === code ? MARK.lit : MARK.none }));
    const cell = (it) => { const c = all.find((x) => `c:${x.code}` === it.id); if (!c) return null;
      return html`<button key=${it.id} data-country=${c.code} data-exits=${c.slots} aria-pressed=${c.code === code ? "true" : "false"} aria-label=${`${countryName(c)} · ${it.subtitle}`} onClick=${() => pick(c)}>${countryName(c)}</button>`; };
    return html`<div data-posol data-layer="countries" class="flex flex-col gap-4">
      <div ref=${head} class="relative z-10 pointer-events-none [&_button]:pointer-events-auto">${backRow(`${T(t, "country")} · ${live.length}/${all.length}`, T(t, "countryTitle"))}</div>
      <${Comb} items=${items} cell=${cell} focus=${code ? `c:${code}` : null} top=${headH + 32} onOpen=${(it) => { const c = all.find((x) => `c:${x.code}` === it.id); if (c) pick(c); }} />
    </div>`;
  }

  const order = combOrder(catalog);
  const groups = catalog.directions.map((d, i) => ({ id: d.id, name: loc(d.title), color: COLORS[i % COLORS.length] }));
  const items = order.map(({ s, g }) => ({ id: s.id, name: loc(s.title), subtitle: loc(s.returns), icon: null, color: COLORS[g % COLORS.length], mark: MARK.none, group: g }));
  const cell = (it) => { const s = catalog.services.find((x) => x.id === it.id); if (!s) return null;
    return html`<button key=${s.id} data-svc=${s.id} data-direction=${s.direction} aria-label=${`${loc(s.title)} · ${loc(s.returns)}`} onClick=${() => openSvc(s.id)}>${loc(s.title)}</button>`; };
  const open = bloom ? catalog.services.find((s) => s.id === bloom) : null;
  const caption = open ? html`<div data-open-caption data-svc=${open.id} class="ms-stage z-10 pointer-events-none flex flex-col justify-end items-center px-6 pb-3">
    <div class="w-full max-w-[22rem] flex flex-col items-center text-center gap-2">
      <div class=${`${LABEL} flex items-center gap-1.5`}>${Dot()}<span>${loc(dirOf(open.direction)?.title)}</span></div>
      <button data-choose onClick=${() => openSvc(open.id)} class="btn btn-primary rounded-full px-8 min-h-10 text-base font-bold ms-press pointer-events-auto">${T(t, "aChoose")}</button>
    </div>
  </div>` : null;

  return html`<div data-posol data-layer="catalog" data-catalog=${catErr ? "kept" : "ready"} data-services=${catalog.services.length} class="flex flex-col gap-4">
    <div ref=${head} class="relative z-10 pointer-events-none [&_button]:pointer-events-auto flex flex-col gap-1 px-0.5">
      <div data-counts class=${`${LABEL} tabular-nums truncate`}>${T(t, "cServices")} ${catalog.services.length} · ${T(t, "cDirections")} ${catalog.directions.length} · ${T(t, "cCountries")} ${live.length}</div>
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-[2rem] font-bold leading-none tracking-tight">${T(t, "catalog")}</h2>
        ${countryChip("max-w-[55%]")}
      </div>
    </div>
    <${Comb} items=${items} groups=${groups} cell=${cell} top=${headH + 32} onOpen=${(it) => openSvc(it.id)} onBloom=${(it) => setBloom(it ? it.id : null)} />
    ${caption}
  </div>`;
}
