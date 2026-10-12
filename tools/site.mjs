// site — Mriia's front door at "/", the one page of the farm a search engine is asked to index (owner 2026-10-12:
// «створи лендінг індексовний, все інше заборони індексувати … seo, метатеги, якісні скріни»).
//
//   deno run -A tools/site.mjs <dist>       after `deno task build`: replaces the build's redirect at <dist>/index.html
//
// The page is site/index.html with its numbers and lists filled from the farm itself — apps/store/apps.json (how many
// apps, the shelves and their counts, each app's icon) — so it can never claim an app the store does not carry. Its
// screens are the STORE's captures (apps/store/assets/shot-<app>--<tab>[--light].webp): one set of pictures for the
// store and for this page, retaken together. Beside it: robots.txt (everything may be crawled, so the noindex the
// web server sends on every other path is seen) and a sitemap with this one URL. The noindex itself is the web
// server's (microspec-edge edge/web/nginx.conf), because it has to cover 93 apps' pages, their files and the store.
const SITE = "https://mriia.si";
const [dist] = Deno.args;
if (!dist) { console.error("usage: deno run -A tools/site.mjs <dist dir>"); Deno.exit(2); }
const root = new URL("..", import.meta.url).pathname;
const read = (p) => Deno.readTextFileSync(root + p);
const apps = JSON.parse(read("apps/store/apps.json"));
const uk = JSON.parse(read("apps/store/i18n/uk.json"));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byId = Object.fromEntries(apps.map((a) => [a.id, a]));

// THE SHOWCASE — seven screens, each app's own line written for this page (the store's taglines are longer and
// carry dashes this page does not use). Every id must be in the store: a page that links a missing app fails here.
// Picked by reading the captures: a screen whose mock is English (horoscope) or whose stage is empty without a live
// render (mirage, afterdark) does not stand for its app on a Ukrainian front page.
const SHOWCASE = [
  ["fonoteka", "songs", "Твоя полиця пісень, що завжди з тобою."],
  ["remix", "mix", "Будь-яка пісня від super slowed до super sped up."],
  ["muzak", "likes", "Пісні з твоїх вподобань YouTube у власному плеєрі."],
  ["iptv", "watch", "Прямий ефір тисяч каналів з усього світу."],
  ["tarot", "read", "Карта дня і розклади з тлумаченням українською."],
  ["weather", "now", "Погода зараз, по годинах і на тиждень."],
  ["air", "now", "Повітря довкола наживо, з прогнозом пилку."],
];
for (const [id] of SHOWCASE) if (!byId[id]) throw new Error(`showcase app "${id}" is not in apps/store/apps.json`);

// a capture as the theme asks for it: the dark one, and the paper one where the reader's system is light
const shot = (name, alt, eager = false) =>
  `<picture><source media="(prefers-color-scheme: light)" srcset="/store/assets/shot-${name}--light.webp"><img src="/store/assets/shot-${name}.webp" alt="${esc(alt)}" width="768" height="1664"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}></picture>`;
for (const [id, tab] of [...SHOWCASE.map(([i, t]) => [i, t]), ["store", "apps"]]) {
  for (const s of ["", "--light"]) {
    try { Deno.statSync(`${root}apps/store/assets/shot-${id}--${tab}${s}.webp`); }
    catch { throw new Error(`no capture apps/store/assets/shot-${id}--${tab}${s}.webp — retake the store's captures`); }
  }
}

const rail = SHOWCASE.map(([id, tab, line], i) => {
  const a = byId[id];
  return `<a class="app rise" style="--d:${Math.min(i, 3) * 70}ms" href="/${id}/"><div class="phone">${shot(`${id}--${tab}`, `${a.title}: екран застосунку`)}</div>` +
    `<div class="who"><img src="/${id}/icon.webp" alt="" width="40" height="40" loading="lazy"><div><b>${esc(a.title)}</b><span>${esc(line)}</span></div></div></a>`;
}).join("");

// THE SHELVES — every category the store has, with its real count and the first apps' icons; the largest are wide
// tiles (two cells), as many as close the last row of the four-column grid, which also closes the phone's two
// columns; the two largest carry the two poles of light
const cats = Object.entries(apps.reduce((m, a) => ((m[a.category] ||= []).push(a), m), {})).sort((x, y) => y[1].length - x[1].length);
const catName = (c) => uk["cat" + c[0].toUpperCase() + c.slice(1)] || c;
const wide = 4 - (cats.length % 4) || 4;
const bento = cats.map(([c, list], i) =>
  `<a class="shelf rise${i < wide ? " big" : ""}${i === 0 ? " lit" : i === 1 ? " cool" : ""}" style="--d:${(i % 4) * 60}ms" href="/store/">` +
  `<div><div class="n">${list.length}</div><div class="t">${esc(catName(c))}</div></div>` +
  `<div class="icons">${list.slice(0, 5).map((a) => `<img src="/${a.id}/icon.webp" alt="" width="38" height="38" loading="lazy">`).join("")}</div></a>`).join("");

const N = apps.length;
// the count with its noun in the form Ukrainian asks of that number: 91 застосунок, 92 застосунки, 95 застосунків
const count = (one, few, many) => `${N} ${{ one, few, many }[new Intl.PluralRules("uk").select(N)] ?? many}`;
const jsonld = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE}/#org`, name: "Mriia", url: `${SITE}/`, logo: `${SITE}/store/icons/apple-touch-icon.png` },
    { "@type": "WebSite", "@id": `${SITE}/#site`, name: "Mriia", url: `${SITE}/`, inLanguage: "uk", publisher: { "@id": `${SITE}/#org` } },
    { "@type": "ItemList", name: "Застосунки Mriia", numberOfItems: SHOWCASE.length, itemListElement: SHOWCASE.map(([id, , line], i) => ({
      "@type": "ListItem", position: i + 1,
      item: { "@type": "WebApplication", name: byId[id].title, url: `${SITE}/${id}/`, description: line, applicationCategory: "LifestyleApplication", operatingSystem: "Android, iOS, Windows, macOS, Linux", inLanguage: ["uk", "en"], image: `${SITE}/${id}/icon.webp` },
    })) },
  ],
}).replace(/</g, "\\u003c");

const icon = (name) => read(`site/icons/${name}.svg`).replace("<svg ", '<svg aria-hidden="true" focusable="false" ');
let html = read("site/index.html")
  .replaceAll("{{APPS}}", count("застосунок", "застосунки", "застосунків"))
  .replaceAll("{{LIGHT_APPS}}", count("легкий застосунок", "легкі застосунки", "легких застосунків"))
  .replaceAll("{{SHELVES_N}}", cats.length === 10 ? "Десять" : String(cats.length))
  .replaceAll("{{YEAR}}", String(new Date().getUTCFullYear()))
  .replace("{{JSONLD}}", jsonld)
  .replaceAll("{{HERO_FRONT}}", "fonoteka--songs")
  .replace("{{HERO_BACK_IMG}}", shot("store--apps", "Каталог Mriia на телефоні"))
  .replace("{{HERO_FRONT_IMG}}", shot("fonoteka--songs", "Фонотека: полиця пісень", true))
  .replace("{{LIVES_IMG}}", shot("remix--mix", "Ремікс: повзунок швидкості пісні"))
  .replace("{{RAIL}}", rail)
  .replace("{{BENTO}}", bento)
  .replace(/\{\{ICON ([a-z-]+)\}\}/g, (_, n) => icon(n));
const left = html.match(/\{\{[A-Z_ a-z-]+\}\}/);
if (left) throw new Error(`site/index.html: ${left[0]} was never filled`);

Deno.writeTextFileSync(`${dist}/index.html`, html);
Deno.writeTextFileSync(`${dist}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
Deno.writeTextFileSync(`${dist}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`);
try { Deno.copyFileSync(`${root}site/og.jpg`, `${dist}/og.jpg`); } catch { throw new Error("site/og.jpg is missing — the link preview the page names"); }
console.log(`site: ${dist}/index.html (${N} apps, ${cats.length} shelves, ${SHOWCASE.length} screens), robots.txt, sitemap.xml, og.jpg`);
