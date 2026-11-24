const q = (s) => JSON.stringify(s);
const has = (s) => `!!document.querySelector(${q(s)})`;

export default [
  {
    name: "підхід: лічильник, секундомір з мікросекундами, чипи, сцена камери", run: async (h) => {
      h.expect(await h.until(has("[data-count]")), "немає лічильника");
      h.expect(/^\d+$/.test((await h.text("[data-count]")).trim()), "лічильник не число");
      h.expect(/^\d{2}:\d{2}\.\d{6}$/.test((await h.text("[data-clock]")).trim()), "секундомір без шести знаків");
      h.expect((await h.count("[data-camstage]")) === 1, "немає сцени камери");
      h.expect((await h.count("[data-eyes]")) === 1, "немає стану очей");
      h.expect((await h.count("[data-expr]")) === 1, "немає міміки");
      h.expect((await h.count("[data-meter]")) <= 1, "крок годинника двічі");
    },
  },
  {
    name: "почати і завершити підхід", run: async (h) => {
      h.expect(await h.until(has("[data-start]:not([disabled])")), "кнопка Почати неактивна");
      await h.tap("[data-start]");
      h.expect(await h.until(has('[data-zhym][data-running="1"] [data-stop]')), "підхід не почався");
      await h.tap("[data-stop]");
      h.expect(await h.until(has('[data-zhym][data-running="0"] [data-start]')), "підхід не завершився");
    },
  },
  {
    name: "журнал: ціль, рекорди, календар, матриця кадрів, такти", run: async (h) => {
      await h.click('[data-tab="log"]');
      h.expect(await h.until(has("[data-matrix] [data-rep]")), "немає матриці кадрів");
      h.expect((await h.count("[data-records]")) === 1, "немає рекордів");
      h.expect((await h.count("[data-tempo-bars]")) > 0, "немає тактів");
      h.expect((await h.count("[data-set]")) > 0, "немає підходів дня");
      const g = Number((await h.text("[data-goal]")).trim());
      await h.tap("[data-goal-more]");
      h.expect(await h.until(`Number(document.querySelector("[data-goal]")?.textContent) === ${g + 10}`), "ціль не зросла");
      await h.tap("[data-goal-less]");
      h.expect(await h.until(`Number(document.querySelector("[data-goal]")?.textContent) === ${g}`), "ціль не повернулась");
    },
  },
  {
    name: "кадр повтору відкриває деталі, Back закриває", run: async (h) => {
      await h.click('[data-tab="log"]');
      h.expect(await h.until(has("[data-matrix] [data-rep]")), "немає матриці");
      await h.tap("[data-matrix] [data-rep]");
      h.expect(await h.until(has("#repsheet[open] [data-rep-detail]")), "деталі повтору не відкрились");
      h.expect(/\d{2}:\d{2}\.\d{6}/.test(await h.text("[data-rep-detail]")), "у деталях немає мікросекунд");
      await h.back();
      h.expect(await h.until(`!document.querySelector("#repsheet[open]")`), "Back не закрив деталі");
      await h.click('[data-tab="set"]');
    },
  },
  {
    name: "дозволи: профіль → екран, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]');
      h.expect(await h.until(has("#p-perms")), "немає пункту дозволів");
      await h.click("#p-perms");
      h.expect(await h.until(has("#perms-back")), "екран дозволів не відкрився");
      await h.back();
      h.expect(await h.until(`!document.querySelector("#perms-back")`), "Back не закрив дозволи");
      await h.click('[data-tab="set"]');
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]');
      h.expect(await h.until(has('[data-loc="en"]')), "немає перемикача мови");
      await h.click('[data-loc="en"]');
      h.expect(await h.until(`/Set|Log|Language/.test(document.body.innerText)`), "не EN");
      await h.click('[data-loc="uk"]');
      h.expect(await h.until(`/Підхід|Журнал|Мова/.test(document.body.innerText)`), "не UA");
      await h.click('[data-tab="set"]');
    },
  },
];
