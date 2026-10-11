export default [
  {
    name: "month: the seeded month is a grid of days, each one a mark", run: async (h) => {
      await h.tap('[data-tab="month"]'); await h.wait(500);
      h.expect((await h.count("[data-month-grid]")) === 1, "сітка місяця не змонтувалась");
      const cells = await h.count("[data-day]");
      h.expect(cells >= 12, `очікував посіяний місяць, знайшов ${cells} днів`);
      h.expect((await h.count("[data-month-grid].ms-stagger")) === 1, "місяць не приходить тижнями (.ms-stagger)");
      h.expect((await h.count("[data-day].ms-press")) === cells, "не кожен день відповідає на дотик (.ms-press)");

      const head = await h.text("main");
      h.expect(/\d/.test(head), "у заголовку місяця немає жодного числа");
      h.expect(/km/i.test(head), `немає одиниці відстані: ${head.slice(0, 120)}`);
    },
  },
  {
    name: "month: a day opens its poster and system Back closes it, never exits", run: async (h) => {
      await h.tap('[data-tab="month"]'); await h.wait(400);
      h.expect((await h.count("[data-poster]")) === 0, "деталь дня відкрита ще до дотику");

      await h.tap("[data-day]"); await h.wait(400);
      h.expect((await h.count("[data-poster]")) === 1, "дотик по дню не відкрив плакат");

      await h.back(); await h.wait(400);
      h.expect((await h.count("[data-poster]")) === 0, "Back не закрив деталь дня");
      h.expect((await h.count("[data-month-grid]")) === 1, "Back вийшов із застосунку замість закрити екран");
    },
  },
  {
    name: "today: the recorder shows a live day, not a waiting state", run: async (h) => {
      await h.tap('[data-tab="today"]'); await h.wait(500);
      h.expect((await h.count("[data-live]")) === 1, "немає елемента, який не існує без показань");
      const body = await h.text("[data-live]");
      h.expect(/\d/.test(body), `у зведенні дня немає чисел: ${body.slice(0, 120)}`);

      h.expect((await h.count("[data-rec]")) === 1, "немає кнопки запису");
      const rec = await h.attr("[data-rec]", "data-rec");
      h.expect(rec === "on" || rec === "off", `нерозпізнаний стан запису: ${rec}`);
    },
  },
  {
    name: "today: a recording day is pressed into the face, a stopped one is the primary key", run: async (h) => {
      await h.tap('[data-tab="today"]'); await h.wait(500);
      const pressed = async () => /\bsf-pressed\b/.test(await h.attr("[data-rec]", "class"));
      const before = await h.attr("[data-rec]", "data-rec");
      h.expect((await pressed()) === (before === "on"), `матеріал не збігся зі станом запису: ${before}`);

      await h.tap("[data-rec]"); await h.wait(300);
      const after = await h.attr("[data-rec]", "data-rec");
      h.expect(after !== before, `дотик не перемкнув запис: ${before} → ${after}`);
      h.expect((await pressed()) === (after === "on"), `матеріал не пішов за станом запису: ${after}`);

      await h.tap("[data-rec]"); await h.wait(300);
      h.expect((await h.attr("[data-rec]", "data-rec")) === before, "другий дотик не повернув стан");
    },
  },
];
