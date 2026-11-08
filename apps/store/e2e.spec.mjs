const ready = async (h) => { for (let i = 0; i < 12; i++) { if ((await h.count("[data-app]")) > 0) break; await h.wait(200); } };
const machine = async (h) => { for (let i = 0; i < 40; i++) { if ((await h.attr("[data-machine]", "data-machine")) === "ready") break; await h.wait(250); } };

export default [
  {
    name: "стор: соти + пошук; перший візит не позначає нічого як нове", run: async (h) => {
      await ready(h); await h.wait(200);
      h.expect((await h.count("[data-app]")) >= 10, "замало комірок застосунків");
      h.expect((await h.count(".input")) === 1, "немає поля пошуку");
      const badges = await h.count(".badge-primary");
      h.expect(badges === 0, `перший візит позначив ${badges} застосунків як нові — базова лінія не записалась`);
      h.expect(!/НОВЕ|NEW/.test(await h.text('[data-app="rave"]')), "бейдж НОВЕ на першому візиті");
    },
  },
  {
    name: "пошук фільтрує соти в ряди з формами", run: async (h) => {
      await ready(h);
      const base = await h.count("[data-app]");
      h.expect((await h.count("#search-btn")) === 1, "немає іконки пошуку в рядку «Сьогодні»");
      h.expect((await h.count("[data-search-open]")) === 0, "поле пошуку розгорнуте до дотику");
      await h.type("#store-filter", "рейв"); await h.wait(250);
      const now = await h.count("[data-app]");
      h.expect(now >= 1 && now < base, "пошук не звузив соти");
      h.expect((await h.count("[data-search-open]")) === 1, "запит є, а поле згорнуте — нема як його стерти");
      h.expect((await h.count('[data-store-mode="search"] .st-tile[data-form]')) === now, "ряд пошуку без форми застосунку");
      h.expect((await h.count("[data-comb]")) === 0, "соти лишились під пошуком");
      await h.type("#store-filter", ""); await h.wait(250);
      h.expect((await h.count("[data-app]")) === base, "не відновилось після очищення");
      await h.click("#search-close"); await h.wait(250);
      h.expect((await h.count("[data-search-open]")) === 0, "× не згорнув поле");
    },
  },
  {
    name: "одне поле: уся ферма в сотах, без категорій і без скролу", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-app]")) >= 70, "соти не показують всю ферму");
      h.expect((await h.count("[data-cat]")) === 0, "перемикач категорій повернувся — Back із нього не працює");
      h.expect((await h.count("[data-comb]")) === 1, "немає сот");
    },
  },
  {
    name: "тап по застосунку відкриває його одразу — без шитика опису; стор пам'ятає, що його відкривали", run: async (h) => {
      await ready(h);
      await h.click('[data-cell][data-app="rave"]'); await h.wait(250);
      h.expect((await h.count("#appsheet")) === 0, "шитик опису повернувся");
      h.expect((await h.count('[data-cell][data-app="rave"][data-seen="1"]')) === 1, "стор не запам'ятав відкритий застосунок");
    },
  },
  {
    name: "i18n EN/UA міняє chrome", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Apps|Language|Me/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Застосунки|Мова|Я/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="apps"]'); await h.wait(120);
    },
  },
  {
    name: "соти: машина ядра готова, полотно малює, атлас і пам'ять дійшли до шейдера; центр = Фонотека на першому візиті", run: async (h) => {
      await ready(h);
      h.expect((await h.attr("[data-comb]", "data-comb")) === "gl", `соти не на GPU: ${await h.attr("[data-comb]", "data-comb")}`);
      await machine(h);
      h.expect((await h.attr("[data-machine]", "data-machine")) === "ready", `машина не готова: ${await h.attr("[data-machine]", "data-err")}`);
      h.expect((await h.count("[data-stage]")) === 1, "немає полотна");
      h.expect((await h.attr("[data-store-lead]", "data-store-lead")) === "fonoteka", "Фонотека не в центрі на першому візиті");
      for (let i = 0; i < 20; i++) { if (await h.attr("[data-comb]", "data-comb-focus")) break; await h.wait(200); }
      h.expect((await h.attr("[data-comb]", "data-comb-focus")) === "fonoteka", `під лінзою не Фонотека: ${await h.attr("[data-comb]", "data-comb-focus")}`);
      h.expect((await h.attr("[data-comb]", "data-comb-group")) === "picks", `під лінзою не кластер добірки: ${await h.attr("[data-comb]", "data-comb-group")}`);
      h.expect((await h.attr("[data-comb]", "data-comb-zoom")) === "1", "зум не на стандартному рівні");
      h.expect((await h.count('[data-island][data-store-island][data-app="fonoteka"]')) === 1, "немає острівця сфокусованої апки");
      h.expect((await h.text("[data-store-island] [data-slogan]")).trim().length > 5, "острівець без слогана");
      h.expect((await h.count("[data-store-island] button")) >= 1, "острівець без «Відкрити»");
      h.expect(parseFloat(await h.css("html", "--island-h")) > 40, "острівець не опублікував висоту");
      const has = await h.attr("[data-stage]", "data-haswebgl");
      if (has === "yes") {
        h.expect((await h.attr("[data-stage]", "data-render")) === "webgl", `WebGL є, а поле не малюється: err=${await h.attr("[data-stage]", "data-err")}`);
        h.expect((await h.attr("[data-stage]", "data-buf")) === "yes", "памʼять машини не дійшла до шейдера");
        for (let i = 0; i < 30; i++) { if ((await h.attr("[data-stage]", "data-cam")) === "yes") break; await h.wait(300); }
        h.expect((await h.attr("[data-stage]", "data-cam")) === "yes", "атлас форм і назв не дійшов до шейдера");
      }
    },
  },
  {
    name: "двійник сот: кожна комірка має ім'я й один тап; порядок — центр перший, далі добірка", run: async (h) => {
      await ready(h);
      const cells = await h.count("[data-comb-twin] > [data-cell][data-app]");
      h.expect(cells >= 70, `у двійнику ${cells} комірок`);
      h.expect((await h.attr("[data-comb-twin] > [data-cell]:nth-child(1)", "data-app")) === "fonoteka", "перша комірка не Фонотека");
      h.expect((await h.attr("[data-comb-twin] > [data-cell]:nth-child(2)", "data-app")) === "reel", "друга комірка не Reel");
      h.expect((await h.text('[data-comb-twin] > [data-app="rave"]')).trim().length > 1, "комірка без назви — іконка без підпису");
      h.expect((await h.count("[data-comb-twin] > [data-cell] button")) === 0, "у комірці друга кнопка");
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      h.expect((await h.count("#p-install")) === 1, "немає кнопки встановлення");
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив модалку");
    },
  },
  {
    name: "тема: профіль → віджет → «Просто» перемикає лист стилів, «Сяйво» повертає, день/ніч у тій же картці", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(300);
      h.expect((await h.count("#p-material")) === 1, "немає віджета «Тема»");
      h.expect((await h.count('#p-material [data-material-id="plain"]')) === 1, "у стрічці немає картинки «Просто»");
      await h.click('[data-material-id="plain"]'); await h.wait(300);
      h.expect((await h.attr("html", "data-material")) === "plain", "html[data-material] не став plain");
      h.expect((await h.count('link[rel="stylesheet"][href$="/_rt/theme-plain.css"]')) === 1, "лінк теми не переключився на theme-plain.css");
      h.expect((await h.count('link[rel="stylesheet"][href*="daisyui"][href$="themes.css"]')) === 1, "daisyui-ний themes.css мав лишитись незайманим");
      await h.click('[data-material-id="lum"]'); await h.wait(300);
      h.expect((await h.attr("html", "data-material")) === "lum", "повернення до «Сяйва» не спрацювало");
      h.expect((await h.count('link[rel="stylesheet"][href$="/_rt/theme-lum.css"]')) === 1, "лінк теми не повернувся до theme-lum.css");
      await h.click('#p-theme [data-mode="day"]'); await h.wait(200);
      h.expect((await h.attr("html", "data-theme")) === "signal-light", "«День» не перемкнув html[data-theme]");
      await h.click('#p-theme [data-mode="night"]'); await h.wait(200);
      h.expect((await h.attr("html", "data-theme")) === "signal", "«Ніч» не повернула html[data-theme]");
    },
  },
];
