const q = (sel) => JSON.stringify(sel);
const has = (sel) => `!!document.querySelector(${q(sel)})`;
const gone = (sel) => `!document.querySelector(${q(sel)})`;
const ready = (h) => h.until(has("[data-people] [data-persona] img"), 15000);

export default [
  {
    name: "люди з фото, рядок і чесна примітка", run: async (h) => {
      h.expect(await ready(h), "людей немає");
      h.expect((await h.count("[data-persona]")) === 6, "не шість людей");
      h.expect((await h.count("[data-note]")) === 1, "немає примітки про гіпотези");
      h.expect(/гіпотези/i.test(await h.text("[data-note]")), "примітка не каже про гіпотези");
      h.expect((await h.count("[data-gather]")) === 1, "немає кнопки збору");
    },
  },
  {
    name: "картка відкриває інтерв'ю, Назад закриває", run: async (h) => {
      await ready(h);
      await h.tap('[data-persona="gate-0"]');
      h.expect(await h.until(has("[data-interview]"), 5000), "інтерв'ю не відкрилось");
      h.expect((await h.count("[data-answer]")) === 4, "немає розмови");
      h.expect((await h.count("[data-chip]")) === 6, "не шість готових питань");
      await h.back();
      h.expect(await h.until(gone("[data-interview]"), 5000), "Назад не закрив інтерв'ю");
      h.expect((await h.count("[data-people]")) === 1, "Назад вийшов зі сторінки");
    },
  },
  {
    name: "готове питання отримує відповідь, ціна в зірках стає", run: async (h) => {
      await ready(h);
      await h.tap('[data-persona="gate-5"]');
      await h.until(has("[data-interview]"), 5000);
      await h.tap('[data-chip="price"]');
      h.expect(await h.until(`document.querySelectorAll("[data-answer]").length === 1`, 5000), "відповіді немає");
      h.expect(await h.until(has("[data-stated]"), 5000), "ціна не з'явилась");
      h.expect(/50/.test(await h.text("[data-stated]")), "ціна не з відповіді");
      await h.back();
    },
  },
  {
    name: "5 питань Amazon у листі, Назад закриває", run: async (h) => {
      await ready(h);
      await h.tap("[data-open-guide]");
      h.expect(await h.until(`document.querySelectorAll("[data-guide] li").length === 5`, 5000), "немає п'яти питань");
      await h.back();
      h.expect(await h.until(`!document.querySelector("dialog[open] [data-guide]")`, 5000), "Назад не закрив лист");
    },
  },
  {
    name: "порівняння: люди поруч, ціни й цитати", run: async (h) => {
      await h.click('[data-tab="compare"]');
      h.expect(await h.until(has("[data-compare] [data-row]"), 5000), "порівняння порожнє");
      h.expect((await h.count("[data-row]")) === 6, "не всі люди в порівнянні");
      h.expect((await h.count("[data-quote]")) >= 5, "менше п'яти цитат");
      h.expect(/50/.test(await h.text("[data-s-median]")), "медіана не 50");
    },
  },
];
