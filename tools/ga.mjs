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
//
// The consent banner (owner 2026-10-14: «додай банер. готове рішення» — the World campaign now runs in Europe, where
// the denied default leaves Google Ads only modelled conversions): CookieConsent 3.1.0 (orestbida, MIT, sha512 checked
// against npm), vendored in site/consent/ and copied to <dist>/_consent/, with site/consent/mriia.css carrying the
// landing's colours. It loads only where the denied default applies — told by the phone's time zone (EEA_TZ; the
// page has no country of its own, and GA's region needs the IP), and only after the page's load event, so it never
// competes with the page or the tag. Its choice goes to Consent Mode: analytics → analytics_storage, ads →
// ad_storage + ad_user_data; ad personalisation stays denied whatever is chosen.
const [dist] = Deno.args;
if (!dist) { console.error("usage: deno run --allow-read --allow-write tools/ga.mjs <dist dir>"); Deno.exit(2); }
const root = new URL("..", import.meta.url).pathname;
const id = (JSON.parse(Deno.readTextFileSync(root + "site/analytics.json")).ga4 || "").trim();
if (!id) { console.log("ga: site/analytics.json has no ga4 id yet — no tag written"); Deno.exit(0); }
if (!/^G-[A-Z0-9]{4,16}$/.test(id)) throw new Error(`ga: "${id}" is not a GA4 measurement id (G-XXXXXXX)`);

const EEA = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH"];
// the IANA zones of EEA + UK + CH (the EEA list above); a phone keeps its zone in sync with where it is
const EEA_TZ = ["Europe/Vienna", "Europe/Brussels", "Europe/Sofia", "Europe/Zagreb", "Europe/Nicosia", "Asia/Nicosia", "Asia/Famagusta",
  "Europe/Prague", "Europe/Copenhagen", "Europe/Tallinn", "Europe/Helsinki", "Europe/Mariehamn", "Europe/Paris", "Europe/Berlin",
  "Europe/Busingen", "Europe/Athens", "Europe/Budapest", "Europe/Dublin", "Europe/Rome", "Europe/Riga", "Europe/Vilnius",
  "Europe/Luxembourg", "Europe/Malta", "Europe/Amsterdam", "Europe/Warsaw", "Europe/Lisbon", "Atlantic/Azores", "Atlantic/Madeira",
  "Europe/Bucharest", "Europe/Bratislava", "Europe/Ljubljana", "Europe/Madrid", "Africa/Ceuta", "Atlantic/Canary", "Europe/Stockholm",
  "Atlantic/Reykjavik", "Europe/Vaduz", "Europe/Oslo", "Arctic/Longyearbyen", "Europe/London", "Europe/Guernsey", "Europe/Jersey",
  "Europe/Isle_of_Man", "Europe/Zurich"];
const PRIVACY = "/store/privacy.html";
const words = {
  uk: {
    consentModal: { title: "Cookie на Mriia", description: "Через Google Analytics ми бачимо, звідки приходять люди і які застосунки їм потрібні, а клік по рекламі звʼязуємо з тим, що було далі. Для цього потрібні cookie. Персоналізованої реклами немає.",
      acceptAllBtn: "Дозволити", acceptNecessaryBtn: "Відхилити", showPreferencesBtn: "Налаштувати", footer: `<a href="${PRIVACY}">Конфіденційність</a>` },
    preferencesModal: { title: "Налаштування cookie", acceptAllBtn: "Дозволити все", acceptNecessaryBtn: "Відхилити все", savePreferencesBtn: "Зберегти вибір", closeIconLabel: "Закрити",
      sections: [
        { title: "Потрібні", description: "Памʼятають твій вибір у цьому вікні.", linkedCategory: "necessary" },
        { title: "Аналітика", description: "Google Analytics: які сторінки відкрили, які кнопки натиснули, чи встановили застосунок. Без імені й пошти.", linkedCategory: "analytics" },
        { title: "Реклама", description: "Google Ads дізнається, що після кліку по оголошенню людина відкрила застосунок. Ремаркетингу й персоналізованої реклами немає.", linkedCategory: "ads" },
        { title: "Більше", description: `Усе про дані — у <a href="${PRIVACY}">політиці конфіденційності</a>.` },
      ] },
  },
  en: {
    consentModal: { title: "Cookies on Mriia", description: "With Google Analytics we see where people come from and which apps they need, and we link an ad click to what happened next. That takes cookies. No personalised ads.",
      acceptAllBtn: "Allow", acceptNecessaryBtn: "Reject", showPreferencesBtn: "Choose", footer: `<a href="${PRIVACY}">Privacy</a>` },
    preferencesModal: { title: "Cookie settings", acceptAllBtn: "Allow all", acceptNecessaryBtn: "Reject all", savePreferencesBtn: "Save my choice", closeIconLabel: "Close",
      sections: [
        { title: "Necessary", description: "Remember your choice in this window.", linkedCategory: "necessary" },
        { title: "Analytics", description: "Google Analytics: which pages were opened, which buttons were tapped, whether an app was installed. No name, no email.", linkedCategory: "analytics" },
        { title: "Advertising", description: "Google Ads learns that a person opened an app after clicking an ad. No remarketing, no personalised ads.", linkedCategory: "ads" },
        { title: "More", description: `Everything about data is in the <a href="${PRIVACY}">privacy policy</a>.` },
      ] },
  },
};
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
var tz="";try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||""}catch(e){}
if(${JSON.stringify(EEA_TZ)}.indexOf(tz)>=0){var cc=function(){
var h=document.documentElement,th=h.getAttribute("data-theme")||"";if(th?!/light$/.test(th):!matchMedia("(prefers-color-scheme: light)").matches)h.classList.add("cc--darkmode");
["cookieconsent.css","mriia.css"].forEach(function(f){var l=document.createElement("link");l.rel="stylesheet";l.href="/_consent/"+f;document.head.appendChild(l)});
var j=document.createElement("script");j.src="/_consent/cookieconsent.umd.js";j.onload=function(){var C=window.CookieConsent,upd=function(){var a=C.acceptedCategory("analytics"),d=C.acceptedCategory("ads");
gtag("consent","update",{analytics_storage:a?"granted":"denied",ad_storage:d?"granted":"denied",ad_user_data:d?"granted":"denied"})};
C.run({cookie:{name:"mriia_consent",expiresAfterDays:182},guiOptions:{consentModal:{layout:"box",position:"bottom center",equalWeightButtons:true},preferencesModal:{layout:"box",equalWeightButtons:true}},
categories:{necessary:{enabled:true,readOnly:true},analytics:{},ads:{}},onConsent:upd,onChange:upd,
language:{default:/^en/.test(h.lang)?"en":"uk",translations:${JSON.stringify(words)}}})};document.head.appendChild(j)};
if(document.readyState==="complete")cc();else addEventListener("load",cc)}
}catch(e){}})();</script>`;

// the banner's files: vendored library + our colours, beside the pages that load them
Deno.mkdirSync(`${dist}/_consent`, { recursive: true });
for (const f of ["cookieconsent.umd.js", "cookieconsent.css", "mriia.css", "LICENSE"]) Deno.copyFileSync(`${root}site/consent/${f}`, `${dist}/_consent/${f}`);

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
