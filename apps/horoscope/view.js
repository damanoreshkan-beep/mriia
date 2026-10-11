import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { Sheet, Segmented, Panel } from "/_rt/ui.js";
import { pathOf, scalePath, shaper } from "/_rt/shape.js";
import { useStore } from "@nanostores/preact";
import { persistentAtom } from "@nanostores/persistent";
import { T } from "/_rt/i18n.js";
import { Sign } from "/_rt/zodiac.js";
import { sunSign } from "/_rt/horoscope.js";
import { useLocalized } from "/_rt/localize.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { Scramble, Pixels } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const QS = new URLSearchParams(location.search);
const SIGN_OVERRIDE = QS.get("sign");

const API = `${VPS_PROXY}/horoscope`;
const DAY_IDS = ["yesterday", "today", "tomorrow"], DAY_KEYS = ["dYesterday", "dToday", "dTomorrow"];

const RATINGS = [["love", "sex"], ["work", "hustle"], ["vibe", "vibe"], ["success", "success"]];

// a sign's own form (core shape.js organic set). shapeOf(id) seeded it, but twelve ids on thirteen forms
// collide (gemini, cancer, leo and libra all land on Cookie9Sided; taurus/aquarius, aries/pisces share) — two
// signs with one face and no morph between them — so the twelve are pinned, indexed like SIGN_PATHS: the hash's
// pick where it was free, the colliders on the free forms; PuffyDiamond, the deepest cut into a centred glyph,
// is the one left out.
const FORM = ["Puffy", "Clover8Leaf", "Cookie9Sided", "Cookie12Sided", "VerySunny", "Cookie7Sided",
  "Cookie4Sided", "Sunny", "Flower", "Cookie6Sided", "Clover4Leaf", "SoftBurst"];

const $sign = persistentAtom("horoscope.sign", "");
const clampSign = (n) => Math.max(0, Math.min(11, Number(n) || 0));
const ck = (s, d) => `horoscope:v3:${s}:${d}`;
const readCache = (s, d) => { try { return JSON.parse(localStorage.getItem(ck(s, d)) || "null"); } catch { return null; } };
const writeCache = (s, d, v) => { try { localStorage.setItem(ck(s, d), JSON.stringify(v)); } catch { } };

const GATE = {
  yesterday: { date: "Jul 22, 2027", ratings: { sex: 2, hustle: 2, vibe: 2, success: 2 }, text: "Tension in your romantic life is apt to well up today, Leo. More than likely, there are certain responsibilities that you feel you have to attend to that take you away from your intimate experience with another. Try to find a healthy balance between work and play." },
  today: { date: "Jul 23, 2027", ratings: { sex: 4, hustle: 2, vibe: 3, success: 4 }, text: "Be prepared to work diligently toward making your dreams a reality today, Leo. Success is definitely on the way, though it may not be approaching quite as quickly as you might like. Take time periodically throughout the day to sit quietly and recoup your energy." },
  tomorrow: { date: "Jul 24, 2027", ratings: { sex: 4, hustle: 4, vibe: 3, success: 3 }, text: "Your heart has been active, Leo, and you're probably feeling the need to take charge of a certain relationship. Instead of being too hasty in your pursuit of this romance, you should probably do more planning. Look at the situation from a long-term perspective." },
};

async function fetchReading(signIdx, dayId) {
  const r = await fetch(`${API}?sign=${signIdx + 1}&day=${dayId}`);
  if (!r.ok) throw new Error("status " + r.status);
  const j = await r.json();
  if (!j || !j.text) throw new Error("empty");
  return { date: j.date, ratings: j.ratings || {}, text: j.text };
}

export function horoscope({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const stored = useStore($sign);
  const now = gate ? new Date(2027, 6, 23) : new Date();
  const signIdx = (SIGN_OVERRIDE != null && SIGN_OVERRIDE !== "") ? clampSign(SIGN_OVERRIDE)
    : stored === "" ? sunSign(now.getMonth() + 1, now.getDate()) : clampSign(stored);
  const [day, setDay] = useState(1);
  const [data, setData] = useState(gate ? GATE[DAY_IDS[1]] : null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    const dayId = DAY_IDS[day];
    if (gate) { setData(GATE[dayId]); setErr(false); return; }
    const cached = readCache(signIdx, dayId);
    setData(cached || null);
    setErr(false);
    let live = true;
    fetchReading(signIdx, dayId)
      .then((d) => { if (!live) return; setData(d); setErr(false); writeCache(signIdx, dayId, d); })
      .catch(() => { if (live) setErr(!cached); });
    return () => { live = false; };
  }, [signIdx, day]);

  const { text: readingText, pending: localizing } = useLocalized(data?.text, loc);
  const dateLabel = data?.date ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + (day - 1))
    .toLocaleDateString(loc === "en" ? "en-GB" : loc || "uk", { day: "numeric", month: "long" }) : "";
  const state = err && !data ? "error" : !data ? "loading" : localizing ? "localizing" : "ready";
  const proseSkeleton = html`<div class="flex flex-col gap-2 text-muted">${[26, 30, 28, 18].map((n, i) => html`<div class="text-[0.97rem]" key=${i}><${Scramble} len=${n} /></div>`)}</div>`;

  return html`<${Fragment}>
    <div class="flex flex-col gap-[var(--ms-gap)]" data-state=${state} data-day-sel=${DAY_IDS[day]} data-sign-idx=${signIdx}>
      ${""}
      <button data-sign class="w-full flex items-center gap-[var(--ms-gap)] rounded-[var(--ms-r)] sf-raised sf-e2 sf-press p-[var(--ms-pad)] ms-press" onClick=${() => openScreen("signs")}>
        <${SignOrb} i=${signIdx} />
        <span class="flex-1 min-w-0 text-left">
          <span class="block font-bold text-lg leading-tight">${(t.signs || "").split("|")[signIdx] || ""}</span>
          <span class=${`block mt-0.5 ${LABEL}`}>${(t.signDates || "").split("|")[signIdx] || ""}</span>
        </span>
        ${Icon("lucide:chevrons-up-down", "text-muted text-xl shrink-0")}
      </button>

      ${""}
      <${Segmented} attr="data-day" label=${T(t, "dToday")}
        items=${[0, 1, 2].map((i) => ({ id: DAY_IDS[i], label: T(t, DAY_KEYS[i]) }))}
        value=${DAY_IDS[day]} onChange=${(id) => setDay(DAY_IDS.indexOf(id))} />

      ${err && !data
      ? html`<div class="flex flex-col items-center text-muted py-16 gap-3 text-center px-6">${Icon("lucide:cloud-off", "text-3xl")}<span class="text-sm">${T(t, "noConnection")}</span></div>`
      : !data
        ? html`<!-- structure-shaped skeleton (date · prose lines · ratings) — never a bare spinner -->
          <div class="flex flex-col gap-[var(--ms-gap)]">
            <div class=${LABEL}><${Scramble} len=${11} /></div>
            ${proseSkeleton}
            <div class="rounded-[var(--ms-r)] sf-inset overflow-hidden h-32"><${Pixels} /></div>
          </div>`
        : html`<!-- reading -->
          <div class="flex flex-col gap-[var(--ms-gap)]">
            <div class="flex items-baseline justify-between gap-2">
              <span class=${LABEL}>${dateLabel}</span>
              ${err ? html`<span class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-warning truncate">${T(t, "offline")}</span>` : null}
            </div>
            ${localizing
      ? proseSkeleton
      : html`<p data-reading data-live class="text-[0.97rem] leading-relaxed">${readingText}</p>`}

            <!-- the day's four real star ratings -->
            <${Panel} title=${T(t, "ratings")} data-ratings="">
              ${RATINGS.map(([label, key]) => html`<div class="flex items-center gap-[var(--ms-gap)]" key=${key}>
                <span class="w-16 shrink-0 text-sm text-muted">${T(t, label)}</span>
                ${""}
                <span class="flex-1 flex gap-1">${[0, 1, 2, 3, 4].map((n) => html`<span class="flex-1 h-1.5 rounded-full" style=${`background:${n < (data.ratings[key] || 0) ? "var(--app-accent)" : "var(--sf-track-face)"}`} key=${n}></span>`)}</span>
              </div>`)}
            <//>
          </div>`}
    </div>

    <${SignSheet} open=${screen === "signs"} onClose=${closeScreen} t=${t} signIdx=${signIdx} />
  </${Fragment}>`;
}

// THE ORB — the chosen sign's form, the theme's texture through it, its rim a light, the glyph on it. Choosing
// another sign flows it into that one's form (one-shot; instant under reduced motion and in the gate). Layout
// effects, so the first paint already has the form, never an unclipped square; the clip follows the measured size.
function SignOrb({ i }) {
  const orb = useRef(), fill = useRef(), rim = useRef(), form = useRef();
  useLayoutEffect(() => {
    let w = orb.current.offsetWidth, last = "";
    const lay = (d) => {
      last = d;
      if (w) fill.current.style.clipPath = `path("${scalePath(d, w)}")`;
      for (const p of rim.current.children) p.setAttribute("d", d);
    };
    form.current = shaper(FORM[i], lay);
    const ro = new ResizeObserver(() => { const nw = orb.current?.offsetWidth || 0; if (nw !== w) { w = nw; if (last) lay(last); } });
    ro.observe(orb.current);
    return () => { ro.disconnect(); form.current.stop(); };
  }, []);
  useLayoutEffect(() => { form.current?.to(FORM[i]); }, [i]);
  return html`<span ref=${orb} data-orb data-form=${FORM[i]} class="hs-orb" aria-hidden="true">
    <span ref=${fill} class="hs-fill"></span>
    <svg ref=${rim} class="hs-rim" viewBox="0 0 1 1"><path class="b" /><path class="e" /></svg>
    <${Sign} i=${i} cls="hs-sign" />
  </span>`;
}

function SignSheet({ open, onClose, t, signIdx }) {
  const choose = (i) => { $sign.set(String(i)); onClose(); };
  // the twelve arrive one after another each time the sheet opens: daisy's closed .modal is only hidden, never
  // display:none, so a standing .ms-stagger would play once, unseen, at boot — the class rides `open` instead
  return html`<${Sheet} id="signsheet" open=${open} onClose=${onClose} title=${T(t, "pickSign")} icon="lucide:sparkles">
      ${""}
      <div class=${`grid grid-cols-3 gap-2 sf-inset rounded-[var(--ms-r)] p-2 ${open ? "ms-stagger" : ""}`}>
        ${Array.from({ length: 12 }, (_, i) => html`<button data-signpick=${i} aria-pressed=${i === signIdx} style=${`--i:${i}`} class=${`hs-pick flex flex-col items-center gap-1.5 py-3 rounded-[var(--ms-r-in)] ms-press ${i === signIdx ? "" : "text-base-content/80"}`} onClick=${() => choose(i)} key=${i}>
          <span class="hs-mark" data-form=${FORM[i]} aria-hidden="true"><svg viewBox="0 0 1 1" class="hs-form"><path d=${pathOf(FORM[i])} /></svg><${Sign} i=${i} cls="hs-mark-sign" /></span>
          <span class="text-sm truncate max-w-full">${(t.signs || "").split("|")[i] || ""}</span>
        </button>`)}
      </div>
  </${Sheet}>`;
}
