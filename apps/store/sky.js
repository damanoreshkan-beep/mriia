import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const REDUCE = !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/**
 * The sky component. Props:
 *   apps      — the manifest array (id, category, title…), already the store's `apps`
 *   cats      — ordered category ids (the store's CATS)
 *   catLabel  — (categoryId) => localized name
 *   nameOf    — (app) => localized name
 *   isNewborn — (app) => bool   isFeatured — (app) => bool
 *   onOpen    — (app) => void   (the store's tap(): page for undiscovered, launch for opened)
 */
export function Sky({ apps, cats, catLabel, nameOf, isNewborn, isFeatured, onOpen }) {
  const wrap = useRef(null);
  const cvRef = useRef(null);
  const camRef = useRef({ x: 0, y: 0, s: 0.62, ts: 0.62 });

  useEffect(() => {
    const cv = cvRef.current, box = wrap.current;
    if (!cv || !box || typeof cv.getContext !== "function" || !globalThis.requestAnimationFrame) return;
    const ctx = cv.getContext("2d", { alpha: false });
    if (!ctx || !ctx.createRadialGradient || !ctx.createRadialGradient(0, 0, 0, 0, 0, 1)) return;
    let VW = 0, VH = 0, DPR = 1, raf = 0;
    const cam = camRef.current;
    let SMAX = 2.6;   
    let fitS = 0.14, frames = 0;   

    const css = getComputedStyle(document.documentElement);
    const tok = (n, f) => (css.getPropertyValue(n).trim() || f);

    const R = 1180;
    const aspect = box.clientWidth > 0 ? Math.min(1.6, Math.max(0.72, box.clientHeight / box.clientWidth)) : 0.72;
    const centres = {};
    cats.forEach((c, i) => {
      const a = (i / cats.length) * Math.PI * 2 - Math.PI / 2;
      const wob = (hash(c) % 100) / 100 * 0.15;
      centres[c] = { x: Math.cos(a + wob) * R, y: Math.sin(a + wob) * R * aspect };
    });
    const stars = apps.map((app) => {
      const r = rng(hash(app.id));
      const c = centres[app.category] || { x: 0, y: 0 };
      const ang = r() * Math.PI * 2, rad = 90 + Math.sqrt(r()) * 300, z = 0.45 + r() * 0.55;
      return { app, x: c.x + Math.cos(ang) * rad, y: c.y + Math.sin(ang) * rad * 0.9, z, tw: r() * Math.PI * 2, tws: 0.6 + r() * 1.4, base: (isFeatured(app) ? 3.4 : 2.05) * (0.7 + z * 0.6), nb: isNewborn(app), ft: isFeatured(app) };
    });
    const chains = cats.map((c) => {
      const ct = centres[c], g = stars.filter((s) => s.app.category === c);
      g.sort((a, b) => Math.atan2(a.y - ct.y, a.x - ct.x) - Math.atan2(b.y - ct.y, b.x - ct.x));
      const rMax = g.reduce((m, s) => Math.max(m, Math.hypot(s.x - ct.x, s.y - ct.y)), 0);
      const len = Math.hypot(ct.x, ct.y) || 1;
      return { c, ct, g, rMax, dir: { x: ct.x / len, y: ct.y / len } };
    });
    const ext = stars.reduce((e, s) => ({ minX: Math.min(e.minX, s.x), maxX: Math.max(e.maxX, s.x), minY: Math.min(e.minY, s.y), maxY: Math.max(e.maxY, s.y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const extW = ext.maxX - ext.minX, extH = ext.maxY - ext.minY, extCX = (ext.minX + ext.maxX) / 2, extCY = (ext.minY + ext.maxY) / 2;

    let fitted = false, SMIN = 0.1;
    const resize = () => {
      DPR = Math.min(globalThis.devicePixelRatio || 1, 2);
      VW = box.clientWidth; VH = box.clientHeight;
      cv.width = VW * DPR; cv.height = VH * DPR; cv.style.width = VW + "px"; cv.style.height = VH + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const fit = Math.min((VW - 144) / extW, (VH - 80) / extH);
      SMIN = fit * 0.75; SMAX = fit * 6; fitS = fit;
      if (!fitted && VW > 0 && VH > 0) { cam.s = cam.ts = fit; cam.x = extCX; cam.y = extCY; fitted = true; }
    };
    const toScreen = (wx, wy) => [(wx - cam.x) * cam.s + VW / 2, (wy - cam.y) * cam.s + VH / 2];
    const t0 = performance.now();

    const draw = (now) => {
      const t = (now - t0) / 1000;
      cam.s += (cam.ts - cam.s) * 0.12;
      const ink = tok("--color-base-content", "#fff");
      const amber = tok("--app-accent", "#ffb020");
      const cyan = tok("--app-accent-2", "#35e0e8");
      const bg = tok("--color-base-100", "#000");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, VW, VH);
      const haloK = lum(bg) < 0.5 ? 1 : 0.32;

      if (++frames % 30 === 0) box.dataset.frames = String(frames);   
      const lineA = Math.max(0, Math.min(1, (fitS * 3 - cam.s) / (fitS * 2))) * 0.28;
      if (lineA > 0.01) {
        ctx.strokeStyle = cyan; ctx.globalAlpha = lineA; ctx.lineWidth = 1;
        for (const { g } of chains) {
          if (g.length < 2) continue;
          ctx.beginPath();
          for (let i = 0; i < g.length; i++) { const [sx, sy] = toScreen(g[i].x, g[i].y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }
          const [fx, fy] = toScreen(g[0].x, g[0].y); ctx.lineTo(fx, fy); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      if (cam.s < fitS * 3) {
        const a = Math.min(1, (fitS * 3 - cam.s) / fitS);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "500 12px ui-monospace, monospace"; ctx.fillStyle = hexA(ink, 0.5 * a);
        ctx.lineJoin = "round"; ctx.lineWidth = 4; ctx.strokeStyle = hexA(bg, 0.85 * a);
        for (const { c, ct, rMax, dir } of chains) {
          const lx = ct.x + dir.x * (rMax + 16 / cam.s), ly = ct.y + dir.y * (rMax + 16 / cam.s);
          const [sx, sy] = toScreen(lx, ly);
          if (sx > -80 && sx < VW + 80 && sy > -40 && sy < VH + 40) { const txt = catLabel(c).toUpperCase(); ctx.strokeText(txt, sx, sy); ctx.fillText(txt, sx, sy); }
        }
      }
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (const s of stars) {
        const [sx, sy] = toScreen(s.x, s.y); const rr = s.base;
        if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
        const twk = REDUCE ? 1 : 0.78 + 0.22 * Math.sin(t * s.tws + s.tw);
        if (s.nb && !REDUCE) { const p = 0.5 + 0.5 * Math.sin(t * 1.3 + s.tw); ctx.beginPath(); ctx.arc(sx, sy, rr * (2.6 + p * 1.6), 0, 7); ctx.strokeStyle = amber; ctx.globalAlpha = 0.14 * (1 - p * 0.6) * haloK; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1; }
        const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr * 6);
        halo.addColorStop(0, s.ft ? amber : cyan); halo.addColorStop(1, hexA(bg, 0));
        ctx.globalAlpha = (s.ft ? 0.5 : 0.3) * twk * haloK; ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sx, sy, rr * 6, 0, 7); ctx.fill();
        ctx.globalAlpha = twk;
        const core = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr * 1.7);
        core.addColorStop(0, ink); core.addColorStop(0.5, ink); core.addColorStop(1, hexA(ink, 0));
        ctx.fillStyle = core; ctx.beginPath(); ctx.arc(sx, sy, rr * 1.7, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
        const showName = s.ft || cam.s > fitS * 2.5;
        if (showName) { const a = s.ft ? 1 : Math.min(1, (cam.s - fitS * 2.5) / fitS); if (a > 0.03) { const txt = nameOf(s.app), ny = sy + rr * 2 + 4; ctx.font = "12px -apple-system, system-ui, sans-serif"; ctx.lineJoin = "round"; ctx.lineWidth = 3; ctx.strokeStyle = hexA(bg, 0.8 * a); ctx.strokeText(txt, sx, ny); ctx.fillStyle = hexA(ink, 0.85 * a); ctx.fillText(txt, sx, ny); } }
      }
      raf = requestAnimationFrame(draw);
    };

    const pts = new Map(); let moved = 0, downT = 0, pinchD = 0, panx = 0, pany = 0;
    const zoomAt = (px, py, f) => { const ns = Math.max(SMIN, Math.min(SMAX, cam.ts * f)); const wx = (px - VW / 2) / cam.s + cam.x, wy = (py - VH / 2) / cam.s + cam.y; cam.ts = ns; cam.s = ns; cam.x = wx - (px - VW / 2) / ns; cam.y = wy - (py - VH / 2) / ns; };
    const rectXY = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const pickNear = (px, py) => { let best = null, bd = 1e9; for (const s of stars) { const [sx, sy] = toScreen(s.x, s.y); const d = Math.hypot(sx - px, sy - py); const hit = Math.max(18, s.base * 3); if (d < hit && d < bd) { bd = d; best = s; } } return best; };
    const onDown = (e) => { cv.setPointerCapture(e.pointerId); const [x, y] = rectXY(e); pts.set(e.pointerId, { x, y }); if (pts.size === 1) { moved = 0; downT = performance.now(); panx = x; pany = y; } if (pts.size === 2) { const p = [...pts.values()]; pinchD = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); } };
    const onMove = (e) => { if (!pts.has(e.pointerId)) return; const [x, y] = rectXY(e); pts.set(e.pointerId, { x, y }); const p = [...pts.values()]; if (pts.size === 1) { const dx = x - panx, dy = y - pany; panx = x; pany = y; moved += Math.abs(dx) + Math.abs(dy); cam.x -= dx / cam.s; cam.y -= dy / cam.s; } else if (pts.size === 2) { const nd = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); if (pinchD) zoomAt((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2, nd / pinchD); pinchD = nd; moved += 20; } };
    const onUp = (e) => { if (pts.size === 1 && moved < 8 && performance.now() - downT < 350) { const [x, y] = rectXY(e); const s = pickNear(x, y); if (s) onOpen(s.app); } pts.delete(e.pointerId); if (pts.size < 2) pinchD = 0; };
    const onWheel = (e) => { e.preventDefault(); const [x, y] = rectXY(e); zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); };

    resize();
    const ro = new ResizeObserver(resize); ro.observe(box);
    cv.addEventListener("pointerdown", onDown); cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp); cv.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); pinchD = 0; });
    cv.addEventListener("wheel", onWheel, { passive: false });
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [apps]);

  return html`<div ref=${wrap} class="ms-sky"><canvas ref=${cvRef} class="ms-sky-canvas" aria-hidden="true"></canvas></div>`;
}

function lum(c) {
  c = c.trim();
  if (c[0] !== "#" || (c.length !== 7 && c.length !== 4)) return 0;
  const n = c.length === 4 ? c.replace(/#(.)(.)(.)/, "#$1$1$2$2$3$3") : c;
  return (0.2126 * parseInt(n.slice(1, 3), 16) + 0.7152 * parseInt(n.slice(3, 5), 16) + 0.0722 * parseInt(n.slice(5, 7), 16)) / 255;
}
function hexA(c, a) {
  c = c.trim();
  if (c[0] === "#" && (c.length === 7 || c.length === 4)) {
    const n = c.length === 4 ? c.replace(/#(.)(.)(.)/, "#$1$1$2$2$3$3") : c;
    const r = parseInt(n.slice(1, 3), 16), g = parseInt(n.slice(3, 5), 16), b = parseInt(n.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return `rgba(255,255,255,${a})`;
}
