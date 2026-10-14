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
// app_launched (opened from the home screen), app_engaged (owner 2026-10-13: the ads' sitelinks land straight on
// an app, past the landing's CTA, and appinstalled fires on Android only, so a person who really uses an app was
// invisible to Google Ads: once per app per visit, after a first tap or key AND 10 s with the page on screen —
// GA's own "engaged" threshold; never on the landing, which has cta_clicked, nor on the store — owner 2026-10-14:
// the goal is a person using an app, and 14 of 22 engaged visitors from the ads were only browsing the catalog), and any element with data-ga="<event>" sends that event with its
// data-ga-* attributes as parameters (the landing's CTAs and language switch). Every event carries app_id, the
// first path segment ("landing" for "/" and "/en/"). Measured only on mriia.si (verify and dist-eye serve dist
// from localhost, a dev server is not the site), never under ?mock or ?live and never for an automated browser
// (navigator.webdriver) — the gate and our own eyes are not users. To test it from a patchright pod, read the
// page's dataLayer from the MAIN world (a DOM attribute written by an injected script): patchright's evaluate runs
// in an isolated world and sees neither window.gtag nor dataLayer (2026-10-12: that read as "the tag never ran"). Consent: the EEA, the UK and
// Switzerland start with every storage denied (GA's Consent Mode then sends cookieless pings); everywhere else
// analytics, ad storage and ad user data are granted, so a Google Ads click is tied to what the person then did
// (owner 2026-10-13: «давай запускати рекламу»). Ad personalisation is denied everywhere: no remarketing lists.
// The tag script is fetched at high priority: an async script is low, and on a phone's mobile data the landing's
// images held it until 6.5 s, so anyone who left sooner was never counted (owner 2026-10-14).
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
gtag("consent","default",{analytics_storage:"denied",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied",region:${JSON.stringify(EEA)}});
gtag("consent","default",{analytics_storage:"granted",ad_storage:"granted",ad_user_data:"granted",ad_personalization:"denied"});
gtag("js",new Date());gtag("config",${JSON.stringify(id)},{app_id:app});
var s=document.createElement("script");s.async=true;s.fetchPriority="high";s.src="https://www.googletagmanager.com/gtag/js?id=${id}";document.head.appendChild(s);
addEventListener("appinstalled",function(){gtag("event","app_installed",{app_id:app})});
if(matchMedia("(display-mode: standalone)").matches)gtag("event","app_launched",{app_id:app});
if(app!=="landing"&&app!=="store"){var ek="ga:eng:"+app,on=0,seen=0,t0=document.hidden?0:Date.now(),sent=false,tm;try{sent=sessionStorage.getItem(ek)==="1"}catch(e){}
var go=function(){if(sent||!on)return;var left=10000-seen-(t0?Date.now()-t0:0);if(left>0){clearTimeout(tm);if(t0)tm=setTimeout(go,left+50);return}
sent=true;try{sessionStorage.setItem(ek,"1")}catch(e){}gtag("event","app_engaged",{app_id:app})};
document.addEventListener("visibilitychange",function(){if(document.hidden){if(t0){seen+=Date.now()-t0;t0=0}clearTimeout(tm)}else{t0=Date.now();go()}});
var first=function(){on=1;go()};addEventListener("pointerdown",first,{capture:true,once:true});addEventListener("keydown",first,{capture:true,once:true})}
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
