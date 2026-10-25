// Vassago under the gate: the fixture fortnight (rt/vassago.js fixtureEvents) — every vector, an estimate, an undated
// election. The routing invariant: the day sheet is a screen, Back closes it.
const days = async (h) => { await h.tap('[data-tab="days"]'); await h.wait(200); };

export default [
  {
    name: "дні: герой (сьогодні + наступне велике з відліком), рядки днів, без дати — окремо", run: async (h) => {
      await days(h);
      h.expect((await h.attr("[data-state]", "data-state")) === "ready", "екран не в стані ready");
      h.expect((await h.count("[data-hero]")) === 1, "немає героя дня");
      h.expect(!!(await h.attr("[data-next]", "data-next")), "немає наступної великої події");
      h.expect((await h.text("[data-countdown]")).trim().length > 2, "немає відліку до наступної події");
      h.expect((await h.count("[data-day-row]")) >= 8, "замало рядків днів");
      h.expect((await h.count("[data-undated]")) === 1, "немає блоку подій без дня");
    },
  },
  {
    name: "день — аркуш: події по векторах, оцінка позначена, Back закриває", run: async (h) => {
      await days(h);
      const rows = await h.count("[data-day-row]");
      let found = false;
      for (let i = 0; i < rows && !found; i++) {
        await h.tap(`[data-day-row]:nth-of-type(${i + 1})`); await h.wait(250);
        h.expect((await h.prop("#daysheet", "open")) === true, "аркуш дня не відкрився");
        h.expect((await h.count("[data-day-sheet] [data-event]")) >= 1, "у аркуші дня немає подій");
        if ((await h.count("[data-day-sheet] [data-estimated]")) > 0) found = true;
        await h.back(); await h.wait(250);
        h.expect((await h.prop("#daysheet", "open")) !== true, "Back не закрив аркуш дня");
      }
      h.expect(found, "орієнтовна подія ніде не позначена");
    },
  },
  {
    name: "фільтр вектора: лише небо — у дні лишаються тільки події неба; назад до всього", run: async (h) => {
      await days(h);
      const before = await h.count("[data-day-row]");
      await h.tap('[data-vec="sky"]'); await h.wait(200);
      h.expect((await h.attr('[data-vec="sky"]', "aria-pressed")) === "true", "фільтр неба не активний");
      const after = await h.count("[data-day-row]");
      h.expect(after > 0 && after < before, "фільтр не звузив дні");
      await h.tap("[data-day-row]"); await h.wait(250);
      h.expect((await h.count("[data-day-sheet] [data-group]")) === (await h.count('[data-day-sheet] [data-group="sky"]')), "у дні з фільтром неба є інші вектори");
      await h.back(); await h.wait(200);
      await h.tap('[data-vec="all"]'); await h.wait(200);
      h.expect((await h.count("[data-day-row]")) === before, "повернення до «усе» не відновило дні");
    },
  },
  {
    name: "країни: вибір регіону зберігається між вкладками", run: async (h) => {
      await days(h);
      await h.tap('[data-region="IL"]'); await h.wait(200);
      h.expect((await h.attr('[data-region="IL"]', "aria-pressed")) === "true", "Ізраїль не обрано");
      await h.tap('[data-tab="month"]'); await h.wait(300);
      h.expect((await h.attr('[data-region="IL"]', "aria-pressed")) === "true", "регіон не перейшов на вкладку місяця");
      await h.tap('[data-region="mine"]'); await h.wait(200);
    },
  },
  {
    name: "місяць: календар з позначками, сьогоднішній день зі списком подій", run: async (h) => {
      await h.tap('[data-tab="month"]'); await h.wait(300);
      h.expect((await h.count("[data-month]")) === 1, "немає екрана місяця");
      h.expect((await h.count("[data-month-list]")) === 1, "немає списку обраного дня");
      h.expect(/Today|Сьогодні|\d/.test(await h.bodyText()), "порожній екран місяця");
      await days(h);
    },
  },
];
