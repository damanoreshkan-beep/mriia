const seed = async (h) => { for (let i = 0; i < 26; i++) { if ((await h.count("canvas")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "дзвінок іде за вкладкою: МКС і землетруси — різні правила", run: async (h) => {
      await seed(h);
      h.expect((await h.count("#watch-btn")) === 0, "на Землі нема чого сповіщати, а дзвінок є");
      await h.click('[data-tab="track"]'); await h.wait(400);
      h.expect((await h.count("#watch-btn")) === 1, "немає дзвінка на МКС");
      await h.click("#watch-btn"); await h.wait(400);
      h.expect((await h.count('[data-watch="iss"]')) === 1, "дзвінок на МКС відкрив не те правило");
      await h.back(); await h.wait(250);
      await h.click('[data-tab="map"]'); await h.wait(400);
      await h.click("#watch-btn"); await h.wait(400);
      h.expect((await h.count('[data-watch="quake"]')) === 1, "дзвінок на землетрусах відкрив не те правило");
      await h.back(); await h.wait(250);
      await h.click('[data-tab="earth"]'); await h.wait(200);
    },
  },
  {
    name: "глобус рендериться (canvas)", run: async (h) => {
      await seed(h);
      h.expect((await h.count("canvas")) === 1, "немає глобуса");
      h.expect((await h.count("#country-search")) === 1, "немає пошуку країни");
    },
  },
  {
    name: "пошук країни → факти (столиця, населення)", run: async (h) => {
      await seed(h);
      await h.type("#country-search", "Ukraine"); await h.wait(300);
      h.expect((await h.count('#matches [data-id="804"]')) === 1, "немає збігу Ukraine");
      await h.click('#matches [data-id="804"]'); await h.wait(400);
      const t = await h.bodyText();
      h.expect(/Ukraine/.test(t), "немає назви країни");
      h.expect(/Kyiv/.test(t), "немає столиці");
      h.expect(/Столиця|Capital/i.test(t) && /Населення|Population/i.test(t), "немає полів фактів");
    },
  },
  {
    name: "країна — форма: збіг у пошуку і орб на картці фактів в одній формі", run: async (h) => {
      await seed(h);
      await h.type("#country-search", "Poland"); await h.wait(300);
      const form = await h.attr('#matches [data-id="616"] [data-form]', "data-form");
      h.expect(!!form, "збіг у пошуку без форми країни");
      await h.click('#matches [data-id="616"]'); await h.wait(400);
      h.expect((await h.count("[data-facts] [data-orb]")) === 1, "на картці фактів немає орба");
      h.expect((await h.attr("[data-facts] [data-orb]", "data-form")) === form, "орб не у формі цієї країни");
      h.expect(/Warsaw/.test(await h.bodyText()), "картка не перейшла на нову країну");
    },
  },
  {
    name: "i18n EN/UA міняє chrome", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Earth|Language|Me/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Земля|Мова|Я/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="earth"]'); await h.wait(150);
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
    name: "шар МКС: глобус + телеметрія", run: async (h) => {
      await h.click('[data-tab="track"]'); await h.wait(600);
      h.expect((await h.count("canvas")) >= 1, "немає глобуса у вкладці МКС");
      const txt = await h.bodyText();
      h.expect(/км|km|\d/.test(txt), "немає читання позиції/висоти МКС");
      h.expect((await h.count("[data-me]")) === 1, "не видно, де я");
      h.expect((await h.count("[data-me-ask]")) === 0, "під воротами місце вже відоме, а кнопка запиту є");
    },
  },
  {
    name: "шар землетрусів: глобус + список подій", run: async (h) => {
      await h.click('[data-tab="map"]'); await h.wait(600);
      h.expect((await h.count("canvas")) >= 1, "немає глобуса у вкладці землетрусів");
      h.expect(/\d/.test(await h.bodyText()), "немає читання магнітуди/подій");
    },
  },
  {
    name: "землетрус — форма: кожен рядок у своїй формі, тап обирає подію", run: async (h) => {
      await h.click('[data-tab="map"]'); await h.wait(600);
      const rows = await h.count("[data-quake]");
      h.expect(rows > 0, "немає рядків землетрусів");
      h.expect((await h.count("[data-quake] [data-form]")) === rows, "не кожен землетрус у своїй формі");
      h.expect((await h.count('[data-quake][aria-pressed="true"]')) === 1, "не позначено обраний землетрус");
      await h.click('[data-quake="c"]'); await h.wait(300);
      h.expect((await h.attr('[data-quake="c"]', "aria-pressed")) === "true", "тап не обрав землетрус");
      h.expect((await h.text("[data-mag]")) === "M4.8", "зведення не перейшло на обраний землетрус");
    },
  },
];
