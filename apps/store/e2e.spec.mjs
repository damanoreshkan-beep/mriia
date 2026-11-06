const ready = async (h) => { for (let i = 0; i < 12; i++) { if ((await h.count("[data-app]")) > 0) break; await h.wait(200); } };

export default [
  {
    name: "стор: сітка + пошук; перший візит не позначає нічого як нове", run: async (h) => {
      await ready(h); await h.wait(200);
      h.expect((await h.count("[data-app]")) >= 10, "замало плиток застосунків");
      h.expect((await h.count(".input")) === 1, "немає поля пошуку");
      const badges = await h.count(".badge-primary");
      h.expect(badges === 0, `перший візит позначив ${badges} застосунків як нові — базова лінія не записалась`);
      h.expect(!/НОВЕ|NEW/.test(await h.text('[data-app="rave"]')), "бейдж НОВЕ на першому візиті");
    },
  },
  {
    name: "пошук фільтрує сітку", run: async (h) => {
      await ready(h);
      const base = await h.count("[data-app]");
      h.expect((await h.count("#search-btn")) === 1, "немає іконки пошуку в рядку «Сьогодні»");
      h.expect((await h.count("[data-search-open]")) === 0, "поле пошуку розгорнуте до дотику");
      await h.type("#store-filter", "рейв"); await h.wait(250);
      const now = await h.count("[data-app]");
      h.expect(now >= 1 && now < base, "пошук не звузив сітку");
      h.expect((await h.count("[data-search-open]")) === 1, "запит є, а поле згорнуте — нема як його стерти");
      await h.type("#store-filter", ""); await h.wait(250);
      h.expect((await h.count("[data-app]")) === base, "не відновилось після очищення");
      await h.click("#search-close"); await h.wait(250);
      h.expect((await h.count("[data-search-open]")) === 0, "× не згорнув поле");
    },
  },
  {
    name: "одна сторінка: кожна категорія показує всі свої застосунки", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-app]")) >= 70, "головна не показує всю ферму");
      h.expect((await h.count("[data-cat]")) === 0, "перемикач категорій повернувся — Back із нього не працює");
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
    name: "стор: верх без запису відкриттів — добірка за замовчуванням: герой і великі соти 3 + 2, тап відкриває апку одразу", run: async (h) => {
      await ready(h);
      h.expect((await h.attr("[data-featured]", "data-app")) === "fonoteka", "Фонотека не веде «Сьогодні» на першому візиті");
      h.expect([5, 8].includes(await h.count('[data-comb="big"] > [data-cell="big"][data-featured]')), "великі соти не цілими рядами (3 + 2 або 3 + 2 + 3)");
      h.expect((await h.count('[data-comb="big"] > [data-app="reel"]')) === 1, "Reel не у великих сотах");
      if (await h.attr("[data-featured]", "data-newborn")) h.expect(/сьогодні|учора|today|yesterday/i.test(await h.text(".st-hero")), "брова героя-новинки не каже «коли»");
      else h.expect((await h.text("[data-slogan]")).trim().length > 5, "герой без гасла");
      await h.click('[data-featured][data-app="remix"]'); await h.wait(300);
      h.expect((await h.count("#appsheet")) === 0, "комірка добірки відкрила шитик замість апки");
    },
  },
  {
    name: "соти: кожна категорія — решітка ядра, короткий ряд зсунутий на пів комірки, у кожної комірки є назва", run: async (h) => {
      await ready(h);
      const cells = await h.count('[data-comb="small"] > [data-cell="small"]');
      h.expect(cells >= 70, "категорії не показують усю ферму сотами");
      h.expect((await h.count('[data-comb="small"] > [data-cell] > .st-cell-name')) === cells, "комірка без назви — іконка без підпису");
      h.expect((await h.count(".ms-comb > .ms-comb-cells[data-comb]")) >= 5, "соти не на решітці ядра (.ms-comb)");
      const tracks = (await h.css('[data-comb="small"]', "grid-template-columns")).split(" ").length;
      h.expect(tracks >= 6 && tracks % 2 === 0, `решітка не з пів-комірок (${tracks} колонок)`);
      h.expect((await h.css(`[data-comb="small"] > :nth-child(${tracks / 2 + 1})`, "grid-column-start")) === "2", "короткий ряд не зсунутий на пів комірки");
      h.expect((await h.css('[data-comb="small"] > :nth-child(1)', "grid-column-start")) !== "2", "довгий ряд зсунутий");
    },
  },
  {
    name: "свіжі новинки: слайди по 3 дрібні картки з описом, лічильник сторінок", run: async (h) => {
      await ready(h);
      const slides = await h.count("[data-fresh-slide]");
      if (!slides) return;
      const cards = await h.count("[data-fresh-card]");
      h.expect(cards <= slides * 3 && cards > (slides - 1) * 3, `${cards} карток на ${slides} слайдах — не по 3`);
      h.expect((await h.text("[data-fresh-card]")).trim().length >= 30, "картка новинки без опису");
      if (slides > 1) h.expect(new RegExp(`1\\s*/\\s*${slides}`).test(await h.text("[data-fresh-page]")), "немає лічильника сторінок");
    },
  },
  {
    name: "вільні форми: кожна апка у своїй формі з обідком, хмара — лише Mriia, герой — орб", run: async (h) => {
      await ready(h);
      const cells = await h.count("[data-cell]");
      h.expect((await h.count("[data-cell] .st-tile[data-form]")) === cells, "комірка застосунку без власної форми");
      h.expect((await h.count("[data-cell] .st-rim use")) === cells, "форма без обідка — чорна іконка зникає на чорному");
      h.expect((await h.count('[data-app] [data-form="Puffy"]')) === 0, "хмара Mriia дісталась застосунку");
      h.expect(/url\(/.test(await h.css("[data-cell] .st-tile-art", "clip-path")), "іконка не обрізана формою");
      h.expect((await h.count(".st-hero [data-hero-orb]")) === 1, "герой без орба");
      h.expect(!/^(|Puffy)$/.test(await h.attr("[data-hero-orb]", "data-form")), "орб героя не у формі застосунку");
      h.expect(/^path\(/.test(await h.css("[data-hero-orb] .st-orb-art", "clip-path")), "орб не обрізаний формою");
      h.expect((await h.count(`[data-hero-orb] img[src$="/${await h.attr("[data-featured]", "data-app")}/icon.webp"]`)) === 1, "в орбі не мистецтво застосунку-лідера");
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
