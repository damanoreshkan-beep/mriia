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
