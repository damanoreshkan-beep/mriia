
const DIST = "dist";
const OUT = `${DIST}/lite`;

const CAT_LABELS = {
  sound: "Звук",
  creative: "Творчість",
  feeds: "Стрічки",
  science: "Наука і небо",
  tools: "Інструменти",
  hackrf: "HackRF",
  esoterica: "Езотерика",
  wellness: "Здоров'я",
  play: "Ігри",
  money: "Гроші",
};
const CAT_ORDER = Object.keys(CAT_LABELS);

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortTagline(t) {
  var s = String(t || "");
  var dot = s.indexOf(". ");
  if (dot > 0 && dot < 140) return s.slice(0, dot + 1);
  if (s.length > 110) return s.slice(0, 109) + "…";
  return s;
}

function renderIndex(apps) {
  var byCat = {};
  for (var i = 0; i < apps.length; i++) {
    var a = apps[i];
    var c = CAT_LABELS[a.category] ? a.category : "tools";
    if (!byCat[c]) byCat[c] = [];
    byCat[c].push(a);
  }
  var body = "";
  for (var ci = 0; ci < CAT_ORDER.length; ci++) {
    var cat = CAT_ORDER[ci];
    var list = byCat[cat];
    if (!list || !list.length) continue;
    body += '<h2 class="cat">' + esc(CAT_LABELS[cat]) + "</h2>\n";
    body += '<ul class="apps">\n';
    for (var j = 0; j < list.length; j++) {
      var app = list[j];
      var bg = app.bg || "#1f2430";
      var fg = app.fg || "#a78bfa";
      var title = app.title || app.id;
      var tag = shortTagline(app.tagline);
      body += '<li class="row">' +
        '<a class="tile" href="/' + esc(app.id) + '/" style="background:' + esc(bg) + ";color:" + esc(fg) + '">' +
        esc(title) +
        "</a>";
      if (tag) body += '<p class="tag">' + esc(tag) + "</p>";
      body += "</li>\n";
    }
    body += "</ul>\n";
  }
  return "<!DOCTYPE html>\n" +
    '<html lang="uk">\n' +
    "<head>\n" +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    "<title>DreamStudio</title>\n" +
    "<style>\n" +
    "body{margin:0;padding:0;background:#0a0a0b;color:#f2eee6;font-family:Helvetica,Arial,sans-serif}\n" +
    "h1{font-size:1.1em;margin:0;padding:14px 12px;background:#000000;color:#f2eee6}\n" +
    "p.lead{margin:0;padding:0 12px 12px 12px;font-size:0.85em;color:#b8b2a6}\n" +
    "h2.cat{font-size:0.8em;text-transform:uppercase;letter-spacing:1px;margin:18px 0 6px 0;padding:0 12px;color:#8a8478}\n" +
    "ul.apps{list-style:none;margin:0;padding:0}\n" +
    "li.row{margin:0;padding:0;border-bottom:1px solid #232323}\n" +
    "a.tile{display:block;padding:12px;text-decoration:none;font-weight:bold;font-size:1em}\n" +
    "p.tag{margin:0;padding:4px 12px 10px 12px;font-size:0.8em;color:#b8b2a6;background:#141416}\n" +
    "</style>\n" +
    "</head>\n" +
    "<body>\n" +
    "<h1>DreamStudio</h1>\n" +
    '<p class="lead">Ферма мікрозастосунків — ' + apps.length + " шт. Спрощена версія для старого браузера.</p>\n" +
    body +
    "</body>\n</html>\n";
}

function renderFallback() {
  return "<!DOCTYPE html>\n" +
    '<html lang="uk">\n' +
    "<head>\n" +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    "<title>DreamStudio</title>\n" +
    "<style>\n" +
    "body{margin:0;padding:24px 16px;background:#0a0a0b;color:#f2eee6;font-family:Helvetica,Arial,sans-serif}\n" +
    "h1{font-size:1.1em;margin:0 0 12px 0}\n" +
    "p{font-size:0.9em;line-height:1.4;color:#d8d2c6;margin:0 0 16px 0}\n" +
    "a{color:#9F8CF6}\n" +
    "</style>\n" +
    "</head>\n" +
    "<body>\n" +
    "<h1>DreamStudio</h1>\n" +
    "<p>Ця апка потребує сучасного браузера — відкрий dreamstudio.mooo.com на іншому пристрої.</p>\n" +
    '<p><a href="/lite/">&larr; До списку застосунків</a></p>\n' +
    "</body>\n</html>\n";
}

const apps = JSON.parse(await Deno.readTextFile("apps/store/apps.json"));
await Deno.mkdir(OUT, { recursive: true });
await Deno.writeTextFile(`${OUT}/index.html`, renderIndex(apps));
await Deno.writeTextFile(`${OUT}/app-fallback.html`, renderFallback());
console.log(`lite: ${apps.length} apps -> ${OUT}/index.html + ${OUT}/app-fallback.html`);
