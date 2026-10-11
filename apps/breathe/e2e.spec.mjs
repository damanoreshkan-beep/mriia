const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-orb]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "дихання: куля + техніки + фаза рендеряться", run: async (h) => {
      await ready(h); await h.wait(500);
      h.expect((await h.count("[data-orb]")) === 1, "немає кулі-подиху");
      h.expect((await h.count("[data-tech]")) === 4, "немає 4 технік");
      h.expect((await h.count("#play")) === 1, "немає кнопки старт/пауза");
      h.expect(/Вдих|Затримка|Видих/.test(await h.bodyText()), "немає фази дихання");
    },
  },
  {
    name: "вибір техніки підсвічується", run: async (h) => {
      await ready(h);
      await h.click('[data-tech="478"]'); await h.wait(150);
      h.expect((await h.attr('[data-tech="478"]', "aria-pressed")) === "true", "техніка не обралась");
      h.expect((await h.attr('[data-tech="478"]', "class")).includes("border-primary"), "не підсвітилась");
    },
  },
  {
    name: "куля — форма техніки, що перетікає у форму обраної", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-orb] .br-rim path")) === 3, "у кулі немає обідка");
      h.expect(!!(await h.attr("[data-orb] .br-rim .e", "d")), "обідок не намальований");
      h.expect((await h.count("#play.tp-form")) === 1, "кнопка старту не форма");
      const was = await h.attr("[data-orb]", "data-form");
      h.expect(!!was, "форма техніки не задана");
      // whichever technique is on now (the previous test leaves 4-7-8), pick a different one
      const next = (await h.attr("[data-breathe]", "data-tech-sel")) === "calm" ? "box" : "calm";
      await h.click(`[data-tech="${next}"]`); await h.wait(150);
      h.expect((await h.attr("[data-orb]", "data-form")) !== was, "форма не змінилась з технікою");
    },
  },
  {
    name: "пауза перемикає стан", run: async (h) => {
      await ready(h);
      const a0 = await h.attr("#play", "aria-label");
      await h.click("#play"); await h.wait(150);
      h.expect(a0 !== (await h.attr("#play", "aria-label")), "пауза не перемкнула стан");
      await h.click("#play"); await h.wait(150);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Breathe|Practice|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Дихання|Вправа|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="breathe"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
