// ga — Google Analytics 4 on every page the farm serves (owner 2026-10-12: «потрібно вже підключати аналітику гугл …
// розповсюдиш мітки»), put in at deploy into every <dist>/**/*.html that has a </head>: the landing ("/", "/en/"),
// the store, all apps and their documents — and so every app born later too, with no one remembering to add it.
//
//   deno run --allow-read --allow-write tools/ga.mjs <dist>     after tools/site.mjs (deploy.yml)
//
// The measurement id is site/analytics.json "ga4" (public by nature: it is in every page's source). Empty → the
// step writes nothing and says so, so this lands before the property exists.
//
// What the tag measures is the tracking plan in meta/streams (decisions first): page_view (automatic, and GA's
// enhanced measurement follows a tab change through history), app_installed (the browser's appinstalled),
// app_launched (opened from the home screen), and any element with data-ga="<event>" sends that event with its
// data-ga-* attributes as parameters (the landing's CTAs and language switch). Every event carries app_id, the
// first path segment ("landing" for "/" and "/en/"). Measured only on mriia.si (verify and dist-eye serve dist
// from localhost, a dev server is not the site), never under ?mock or ?live and never for an automated browser
// (navigator.webdriver) — the gate and our own eyes are not users. To test it from a patchright pod, read the
// page's dataLayer from the MAIN world (a DOM attribute written by an injected script): patchright's evaluate runs
// in an isolated world and sees neither window.gtag nor dataLayer (2026-10-12: that read as "the tag never ran"). Consent: the EEA, the UK and
// Switzerland start with analytics storage denied (GA's Consent Mode then sends cookieless pings), everywhere else
// granted; ad storage, ad user data and ad personalisation are denied everywhere — the farm runs no ads.
const [dist] = Deno.args;
if (!dist) { console.error("usage: deno run --allow-read --allow-write tools/ga.mjs <dist dir>"); Deno.exit(2); }
const root = new URL("..", import.meta.url).pathname;
const id = (JSON.parse(Deno.readTextFileSync(root + "site/analytics.json")).ga4 || "").trim();
if (!id) { console.log("ga: site/analytics.json has no ga4 id yet — no tag written"); Deno.exit(0); }
if (!/^G-[A-Z0-9]{4,16}$/.test(id)) throw new Error(`ga: "${id}" is not a GA4 measurement id (G-XXXXXXX)`);

const EEA = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH"];
const tag = `<!-- Google Analytics 4: tools/ga.mjs at deploy --><script>(function(){try{
if(location.hostname!=="mriia.si"||/[?&](mock|live)(=|&|$)/.test(location.search)||navigator.webdriver)return;
var seg=location.pathname.split("/")[1]||"",app=!seg||seg==="en"?"landing":seg;
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;
var no={ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"};
gtag("consent","default",Object.assign({analytics_storage:"denied",region:${JSON.stringify(EEA)}},no));
gtag("consent","default",Object.assign({analytics_storage:"granted"},no));
gtag("js",new Date());gtag("config",${JSON.stringify(id)},{app_id:app});
var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id=${id}";document.head.appendChild(s);
addEventListener("appinstalled",function(){gtag("event","app_installed",{app_id:app})});
if(matchMedia("(display-mode: standalone)").matches)gtag("event","app_launched",{app_id:app});
document.addEventListener("click",function(e){var el=e.target.closest&&e.target.closest("[data-ga]");if(!el)return;var p={app_id:app};
for(var k in el.dataset)if(k.indexOf("ga")===0&&k.length>2)p[k.slice(2).replace(/^./,function(c){return c.toLowerCase()})]=el.dataset[k];gtag("event",el.dataset.ga,p)},true);
}catch(e){}})();</script>`;

let n = 0;
async function walk(dir) {
  for await (const e of Deno.readDir(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) await walk(p);
    else if (e.isFile && e.name.endsWith(".html")) {
      const html = await Deno.readTextFile(p);
      if (!html.includes("</head>") || html.includes("tools/ga.mjs at deploy")) continue;
      await Deno.writeTextFile(p, html.replace("</head>", tag + "</head>"));
      n++;
    }
  }
}
await walk(dist);
console.log(`ga: ${id} on ${n} pages`);
