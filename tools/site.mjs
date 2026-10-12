// site — Mriia's front door, the only pages of the farm a search engine is asked to index (owner 2026-10-12:
// «створи лендінг індексовний, все інше заборони індексувати … seo, метатеги, якісні скріни»), in Ukrainian at "/"
// and in English at "/en/" (owner, same day: «лендінг має бути локалізованим en ua. автоматично дивись на локаль
// браузера»). One template, site/index.html; its words are site/i18n/{uk,en}.json.
//
//   deno run -A tools/site.mjs <dist>       after `deno task build`: replaces the build's redirect at <dist>/index.html
//
// The numbers and lists are filled from the farm itself — apps/store/apps.json (how many apps, the shelves and their
// counts, each app's icon and title) — so a page can never claim an app the store does not carry. Its screens are the
// STORE's captures (apps/store/assets/shot-<app>--<tab>[--light].webp), and for the English page the same screens
// shot with ?locale=en (shot-<app>--<tab>--en[--light].webp; manifest only reads shot-<app>--<tab>, so these never
// become tabs). The page picks its language in the head (a footer choice, else the browser's), never for a crawler;
// the hreflang pair tells search which one to show whom. Beside them: robots.txt (everything may be crawled, so the
// noindex the web server sends on every other path is seen) and a sitemap with the two URLs as alternates. The
// noindex itself is the web server's (microspec-edge edge/web/nginx.conf), which also lets "/en/" through.
const SITE = "https://mriia.si";
const [dist] = Deno.args;
if (!dist) { console.error("usage: deno run -A tools/site.mjs <dist dir>"); Deno.exit(2); }
const root = new URL("..", import.meta.url).pathname;
const read = (p) => Deno.readTextFileSync(root + p);
const apps = JSON.parse(read("apps/store/apps.json"));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byId = Object.fromEntries(apps.map((a) => [a.id, a]));
const N = apps.length;

// THE SHOWCASE — a day, from the first coffee to the last track: seven screens, each under the hour and the moment
// of a person's day it belongs to (the line is site/i18n m_<app>), the app's name only after it (owner 2026-10-12:
// «там сухі фічі а не юзерські тексти» — a line says what happens to YOU, never what the app has). Every id must be in
// the store. Picked by reading the captures: a screen whose mock is English (horoscope) or whose stage is empty
// without a live render (mirage, afterdark) does not stand for its app.
const SHOWCASE = [["weather", "now", "07:10"], ["air", "now", "07:40"], ["tarot", "read", "08:30"], ["fonoteka", "songs", "09:00"],
  ["muzak", "likes", "13:00"], ["iptv", "watch", "20:00"], ["remix", "mix", "01:00"]];
const HERO_BACK = "store--apps", HERO_FRONT = "fonoteka--songs", LIVES = "remix--mix";
for (const [id] of SHOWCASE) if (!byId[id]) throw new Error(`showcase app "${id}" is not in apps/store/apps.json`);

// the count with its noun in the form the language asks of that number: 91 застосунок, 92 застосунки, 95 застосунків
const PLURAL = {
  uk: { APPS: ["застосунок", "застосунки", "застосунків"], LIGHT_APPS: ["легкий застосунок", "легкі застосунки", "легких застосунків"] },
  en: { APPS: ["app", "apps", "apps"], LIGHT_APPS: ["light app", "light apps", "light apps"] },
};
const counted = (lang, key) => { const [one, few, many] = PLURAL[lang][key]; const f = new Intl.PluralRules(lang).select(N); return `${N} ${f === "one" ? one : f === "few" ? few : many}`; };

const LOCALES = {
  uk: { dir: "", url: `${SITE}/`, og: "uk_UA", ogAlt: "en_US", ogImage: "og.jpg", shot: "", q: "" },
  en: { dir: "en", url: `${SITE}/en/`, og: "en_US", ogAlt: "uk_UA", ogImage: "og-en.jpg", shot: "--en", q: "?locale=en" },
};
const icon = (name) => read(`site/icons/${name}.svg`).replace("<svg ", '<svg aria-hidden="true" focusable="false" ');
const need = (p) => { try { Deno.statSync(root + p); } catch { throw new Error(`no ${p} — retake the captures (see the header of this file)`); } };

function page(lang) {
  const L = LOCALES[lang];
  const dict = JSON.parse(read(`site/i18n/${lang}.json`));
  const store = JSON.parse(read(`apps/store/i18n/${lang}.json`));
  const fill = (s) => s.replace(/\{(APPS|LIGHT_APPS)\}/g, (_, k) => counted(lang, k));
  const t = (k) => { if (!(k in dict)) throw new Error(`site/i18n/${lang}.json has no "${k}"`); return esc(fill(dict[k])); };
  const title = (a) => a.titles?.[lang] || a.title;
  const src = (name, light) => `/store/assets/shot-${name}${L.shot}${light ? "--light" : ""}.webp`;
  for (const name of [HERO_BACK, HERO_FRONT, LIVES, ...SHOWCASE.map(([id, tab]) => `${id}--${tab}`)]) for (const l of [false, true]) need(`apps/store/assets${src(name, l).slice("/store/assets".length)}`);
  // a capture as the theme asks for it: the dark one, and the paper one where the reader's system is light
  const shot = (name, alt, eager = false) =>
    `<picture><source media="(prefers-color-scheme: light)" srcset="${src(name, true)}"><img src="${src(name, false)}" alt="${esc(alt)}" width="768" height="1664"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}></picture>`;

  const rail = SHOWCASE.map(([id, tab, when], i) => {
    const a = byId[id], line = fill(dict["m_" + id] ?? (() => { throw new Error(`site/i18n/${lang}.json has no "m_${id}"`); })());
    return `<a class="app rise" style="--d:${Math.min(i, 3) * 70}ms" href="/${id}/${L.q}"><div class="phone">${shot(`${id}--${tab}`, `${title(a)}: ${line}`)}</div>` +
      `<div class="moment"><time class="when mono">${when}</time><p>${esc(line)}</p>` +
      `<span class="who"><img src="/${id}/icon.webp" alt="" width="24" height="24" loading="lazy">${esc(title(a))}</span></div></a>`;
  }).join("");

  // THE SHELVES — every category the store has, with its real count and the first apps' icons; the largest are wide
  // tiles (two cells), as many as close the last row of the four-column grid, which also closes the phone's two
  // columns; the two largest carry the two poles of light
  const cats = Object.entries(apps.reduce((m, a) => ((m[a.category] ||= []).push(a), m), {})).sort((x, y) => y[1].length - x[1].length);
  const catName = (c) => store["cat" + c[0].toUpperCase() + c.slice(1)] || c;
  const wide = 4 - (cats.length % 4) || 4;
  const bento = cats.map(([c, list], i) =>
    `<a class="shelf rise${i < wide ? " big" : ""}${i === 0 ? " lit" : i === 1 ? " cool" : ""}" style="--d:${(i % 4) * 60}ms" href="/store/${L.q}">` +
    `<div><div class="n">${list.length}</div><div class="t">${esc(catName(c))}</div></div>` +
    `<div class="icons">${list.slice(0, 5).map((a) => `<img src="/${a.id}/icon.webp" alt="" width="38" height="38" loading="lazy">`).join("")}</div></a>`).join("");

  const jsonld = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE}/#org`, name: "Mriia", url: `${SITE}/`, logo: `${SITE}/store/icons/apple-touch-icon.png` },
      { "@type": "WebSite", "@id": `${SITE}/#site`, name: "Mriia", url: `${SITE}/`, inLanguage: ["uk", "en"], publisher: { "@id": `${SITE}/#org` } },
      { "@type": "WebPage", "@id": `${L.url}#page`, url: L.url, name: fill(dict.title), inLanguage: lang, isPartOf: { "@id": `${SITE}/#site` } },
      { "@type": "ItemList", name: lang === "uk" ? "Застосунки Mriia" : "Mriia apps", numberOfItems: SHOWCASE.length, itemListElement: SHOWCASE.map(([id], i) => ({
        "@type": "ListItem", position: i + 1,
        item: { "@type": "WebApplication", name: title(byId[id]), url: `${SITE}/${id}/`, description: fill(dict["m_" + id]), applicationCategory: "LifestyleApplication", operatingSystem: "Android, iOS, Windows, macOS, Linux", inLanguage: ["uk", "en"], image: `${SITE}/${id}/icon.webp` },
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
    .replace("{{HERO_FRONT_SRC}}", src(HERO_FRONT, false)).replace("{{HERO_FRONT_SRC_LIGHT}}", src(HERO_FRONT, true))
    .replace("{{HERO_BACK_IMG}}", shot(HERO_BACK, fill(dict.heroBackAlt)))
    .replace("{{HERO_FRONT_IMG}}", shot(HERO_FRONT, fill(dict.heroFrontAlt), true))
    .replace("{{LIVES_IMG}}", shot(LIVES, fill(dict.livesAlt)))
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
