const SITE = "https://mriia.si";
const [dist] = Deno.args;
if (!dist) { console.error("usage: deno run -A tools/site.mjs <dist dir> | --shots"); Deno.exit(2); }
const root = new URL("..", import.meta.url).pathname;
const read = (p) => Deno.readTextFileSync(root + p);
const apps = JSON.parse(read("apps/store/apps.json"));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byId = Object.fromEntries(apps.map((a) => [a.id, a]));
const N = apps.length;

const SHOWCASE = [["weather", "now", "07:10"], ["air", "now", "07:40"], ["tarot", "read", "08:30"], ["fonoteka", "songs", "09:00"],
  ["muzak", "likes", "13:00"], ["iptv", "watch", "20:00"], ["remix", "mix", "01:00"]];
const HERO_BACK = "store--apps", HERO_FRONT = "fonoteka--songs", LIVES = "remix--mix";
for (const [id] of SHOWCASE) if (!byId[id]) throw new Error(`showcase app "${id}" is not in apps/store/apps.json`);

const COUNT = /\{(LIGHT_)?APPS\}|\d+\s+(легк\S*\s+|light\s+)?(застосун|програм|апок|apps?\b)/i;
const said = (s) => { if (COUNT.test(s)) throw new Error(`site copy names an app count: "${s}"`); return s; };

const LOCALES = {
  uk: { dir: "", url: `${SITE}/`, og: "uk_UA", ogAlt: "en_US", ogImage: "og.jpg", shot: "", q: "" },
  en: { dir: "en", url: `${SITE}/en/`, og: "en_US", ogAlt: "uk_UA", ogImage: "og-en.jpg", shot: "--en", q: "?locale=en" },
};
const CAPTURES = [...new Set([HERO_BACK, HERO_FRONT, LIVES, ...SHOWCASE.map(([id, tab]) => `${id}--${tab}`)])]
  .flatMap((name) => Object.values(LOCALES).flatMap((L) => [false, true].map((light) => `shot-${name}${L.shot}${light ? "--light" : ""}`)));
const SIZES = "(max-width: 480px) 240px, (max-width: 899px) 270px, 290px";
const SHOTS = "site/shots", AVIF = { cqLevel: 20, speed: 6 }, WEBP = { quality: 82 };
const sha = async (p) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Deno.readFileSync(root + p))), (b) => b.toString(16).padStart(2, "0")).join("");
const made = (() => { try { return JSON.parse(read(`${SHOTS}/index.json`)); } catch { return {}; } })();
const outs = (base) => [`${base}-480.avif`, `${base}-768.avif`, `${base}-480.webp`];

if (dist === "--shots") {
  const { decode, encode: webp } = await import("npm:@jsquash/webp@1.4.0");
  const { encode: avif } = await import("npm:@jsquash/avif@1.3.0");
  const { default: resize } = await import("npm:@jsquash/resize@2.1.0");
  Deno.mkdirSync(root + SHOTS, { recursive: true });
  for (const [i, base] of CAPTURES.entries()) {
    const src = `apps/store/assets/${base}.webp`, h = await sha(src);
    if (made[base] === h && outs(base).every((f) => { try { return Deno.statSync(`${root}${SHOTS}/${f}`).isFile; } catch { return false; } })) continue;
    const img = await decode(Deno.readFileSync(root + src));
    const small = await resize(img, { width: 480, height: Math.round(img.height * 480 / img.width) });
    const [a480, a768, w480] = await Promise.all([avif(small, AVIF), avif(img, AVIF), webp(small, WEBP)]);
    outs(base).forEach((f, k) => Deno.writeFileSync(`${root}${SHOTS}/${f}`, new Uint8Array([a480, a768, w480][k])));
    made[base] = h;
    Deno.writeTextFileSync(`${root}${SHOTS}/index.json`, JSON.stringify(made, null, 1) + "\n");   
    console.log(`${i + 1}/${CAPTURES.length} ${base}: ${[a480, a768, w480].map((b) => Math.round(b.byteLength / 1024) + "KB").join(" ")}`);
  }
  console.log(`shots: ${CAPTURES.length} captures current in ${SHOTS}/`);
  Deno.exit(0);
}
for (const base of CAPTURES) {
  if (made[base] !== await sha(`apps/store/assets/${base}.webp`)) throw new Error(`${SHOTS}: ${base} is missing or older than its capture — run: deno run -A tools/site.mjs --shots`);
}
Deno.mkdirSync(`${dist}/_landing`, { recursive: true });
for (const base of CAPTURES) for (const f of outs(base)) Deno.copyFileSync(`${root}${SHOTS}/${f}`, `${dist}/_landing/${f}`);

const icon = (name) => read(`site/icons/${name}.svg`).replace("<svg ", '<svg aria-hidden="true" focusable="false" ');
const need = (p) => { try { Deno.statSync(root + p); } catch { throw new Error(`no ${p} — retake the captures (see the header of this file)`); } };

function page(lang) {
  const L = LOCALES[lang];
  const dict = JSON.parse(read(`site/i18n/${lang}.json`));
  const store = JSON.parse(read(`apps/store/i18n/${lang}.json`));
  const t = (k) => { if (!(k in dict)) throw new Error(`site/i18n/${lang}.json has no "${k}"`); return esc(said(dict[k])); };
  const title = (a) => a.titles?.[lang] || a.title;
  const src = (name, light) => `/store/assets/shot-${name}${L.shot}${light ? "--light" : ""}.webp`;
  for (const name of [HERO_BACK, HERO_FRONT, LIVES, ...SHOWCASE.map(([id, tab]) => `${id}--${tab}`)]) for (const l of [false, true]) need(`apps/store/assets${src(name, l).slice("/store/assets".length)}`);
  const base = (name, light) => src(name, light).slice("/store/assets/".length, -".webp".length);
  const set = (name, light, ext) => `/_landing/${base(name, light)}-480.${ext} 480w, ${ext === "avif" ? `/_landing/${base(name, light)}-768.avif` : src(name, light)} 768w`;
  const shot = (name, alt, eager = false) => `<picture>` +
    `<source media="(prefers-color-scheme: light)" type="image/avif" srcset="${set(name, true, "avif")}" sizes="${SIZES}">` +
    `<source media="(prefers-color-scheme: light)" type="image/webp" srcset="${set(name, true, "webp")}" sizes="${SIZES}">` +
    `<source type="image/avif" srcset="${set(name, false, "avif")}" sizes="${SIZES}">` +
    `<img src="${src(name, false)}" srcset="${set(name, false, "webp")}" sizes="${SIZES}" alt="${esc(alt)}" width="768" height="1664"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}></picture>`;

  const rail = SHOWCASE.map(([id, tab, when], i) => {
    const a = byId[id], line = said(dict["m_" + id] ?? (() => { throw new Error(`site/i18n/${lang}.json has no "m_${id}"`); })());
    return `<a class="app rise" style="--d:${Math.min(i, 3) * 70}ms" href="/${id}/${L.q}"><div class="phone">${shot(`${id}--${tab}`, `${title(a)}: ${line}`)}</div>` +
      `<div class="moment"><time class="when mono">${when}</time><p>${esc(line)}</p>` +
      `<span class="who"><img src="/${id}/icon.svg" alt="" width="24" height="24" loading="lazy">${esc(title(a))}</span></div></a>`;
  }).join("");

  const cats = Object.entries(apps.reduce((m, a) => ((m[a.category] ||= []).push(a), m), {})).sort((x, y) => y[1].length - x[1].length);
  const catName = (c) => store["cat" + c[0].toUpperCase() + c.slice(1)] || c;
  const wide = 4 - (cats.length % 4) || 4;
  const bento = cats.map(([c, list], i) =>
    `<a class="shelf rise${i < wide ? " big" : ""}${i === 0 ? " lit" : i === 1 ? " cool" : ""}" style="--d:${(i % 4) * 60}ms" href="/store/${L.q}">` +
    `<div><div class="n">${list.length}</div><div class="t">${esc(catName(c))}</div></div>` +
    `<div class="icons">${list.slice(0, 5).map((a) => `<img src="/${a.id}/icon.svg" alt="" width="38" height="38" loading="lazy">`).join("")}</div></a>`).join("");

  const jsonld = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE}/#org`, name: "Mriia", url: `${SITE}/`, logo: `${SITE}/store/icons/apple-touch-icon.png` },
      { "@type": "WebSite", "@id": `${SITE}/#site`, name: "Mriia", url: `${SITE}/`, inLanguage: ["uk", "en"], publisher: { "@id": `${SITE}/#org` } },
      { "@type": "WebPage", "@id": `${L.url}#page`, url: L.url, name: said(dict.title), inLanguage: lang, isPartOf: { "@id": `${SITE}/#site` } },
      { "@type": "ItemList", name: lang === "uk" ? "Застосунки Mriia" : "Mriia apps", numberOfItems: SHOWCASE.length, itemListElement: SHOWCASE.map(([id], i) => ({
        "@type": "ListItem", position: i + 1,
        item: { "@type": "WebApplication", name: title(byId[id]), url: `${SITE}/${id}/`, description: said(dict["m_" + id]), applicationCategory: "LifestyleApplication", operatingSystem: "Android, iOS, Windows, macOS, Linux", inLanguage: ["uk", "en"], image: `${SITE}/${id}/icon.webp` },
      })) },
    ],
  }).replace(/</g, "\\u003c");

  const html = read("site/index.html")
    .replace(/\{\{t ([A-Za-z0-9_]+)\}\}/g, (_, k) => t(k))
    .replaceAll("{{LANG}}", lang)
    .replaceAll("{{URL}}", L.url)
    .replaceAll("{{HOME}}", lang === "uk" ? "/" : "/en/")
    .replaceAll("{{STORE}}", `/store/${L.q}`)
    .replace("{{OG_LOCALE}}", L.og).replace("{{OG_LOCALE_ALT}}", L.ogAlt)
    .replaceAll("{{OG_IMAGE}}", `${SITE}/${L.ogImage}`)
    .replace("{{CUR_UK}}", lang === "uk" ? ' aria-current="page"' : "").replace("{{CUR_EN}}", lang === "en" ? ' aria-current="page"' : "")
    .replaceAll("{{YEAR}}", String(new Date().getUTCFullYear()))
    .replace("{{JSONLD}}", jsonld)
    .replace("{{HERO_FRONT_SET}}", set(HERO_FRONT, false, "avif")).replace("{{HERO_FRONT_SET_LIGHT}}", set(HERO_FRONT, true, "avif")).replaceAll("{{SIZES}}", SIZES)
    .replace("{{HERO_BACK_IMG}}", shot(HERO_BACK, said(dict.heroBackAlt)))
    .replace("{{HERO_FRONT_IMG}}", shot(HERO_FRONT, said(dict.heroFrontAlt), true))
    .replace("{{LIVES_IMG}}", shot(LIVES, said(dict.livesAlt)))
    .replace("{{RAIL}}", rail)
    .replace("{{BENTO}}", bento)
    .replace(/\{\{ICON ([a-z-]+)\}\}/g, (_, n) => icon(n));
  const left = html.match(/\{\{[^{}]*\}\}/);
  if (left) throw new Error(`site/index.html (${lang}): ${left[0]} was never filled`);
  if (L.dir) Deno.mkdirSync(`${dist}/${L.dir}`, { recursive: true });
  Deno.writeTextFileSync(`${dist}/${L.dir ? L.dir + "/" : ""}index.html`, html);
  try { Deno.copyFileSync(`${root}site/${L.ogImage}`, `${dist}/${L.ogImage}`); } catch { throw new Error(`site/${L.ogImage} is missing — the link preview the page names`); }
  return cats.length;
}

const shelves = page("uk");
page("en");
const day = new Date().toISOString().slice(0, 10);
const alt = `\n    <xhtml:link rel="alternate" hreflang="uk" href="${SITE}/"/>\n    <xhtml:link rel="alternate" hreflang="en" href="${SITE}/en/"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/en/"/>`;
const url = (loc) => `  <url>\n    <loc>${loc}</loc><lastmod>${day}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority>${alt}\n  </url>`;
Deno.writeTextFileSync(`${dist}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
Deno.writeTextFileSync(`${dist}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${url(`${SITE}/`)}\n${url(`${SITE}/en/`)}\n</urlset>\n`);
console.log(`site: ${dist}/index.html + en/index.html (${N} apps, ${shelves} shelves, ${SHOWCASE.length} screens), robots.txt, sitemap.xml, og.jpg, og-en.jpg`);
