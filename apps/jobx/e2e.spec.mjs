export default [
  {
    name: "the map is populated on mount — a total and a Kyiv bubble carrying its count",
    async run(h) {
      await h.waitFor(/вакансій/);
      await h.wait(200);   
      h.expect((await h.count("[data-map]")) === 1, "немає карти");
      h.expect((await h.count("[data-city]")) === 22, "мають бути всі 22 міста");
      h.expect(/5/.test(await h.text("[data-city=kyiv]")), "бульбашка Києва не показує кількість вакансій");
    },
  },
  {
    name: "the stage fills the view (fit tab) and the map gets most of it",
    async run(h) {
      await h.waitFor(/вакансій/);
      const view = await h.prop("#view", "clientHeight");
      const stage = await h.prop("[data-stage]", "clientHeight");
      const map = await h.prop("[data-map]", "clientHeight");
      h.expect(stage / view >= 0.85, `сцена займає ${Math.round(stage / view * 100)}% екрана, треба ≥85%`);
      h.expect(map / stage >= 0.5, `карта отримує ${Math.round(map / stage * 100)}% сцени, треба ≥50%`);
    },
  },
  {
    name: "tapping Kyiv opens its sheet with a real opening",
    async run(h) {
      await h.waitFor(/вакансій/);
      await h.wait(200);
      await h.tap("[data-city=kyiv]");
      await h.wait(300);
      h.expect((await h.count("[data-job-title]")) >= 1, "аркуш міста не показав жодної вакансії");
      h.expect(/Frontend/.test(await h.text("[data-job-title]")), "картка вакансії не показує засіяну посаду");
      h.expect((await h.count("[data-apply]")) >= 1, "немає кнопки відгуку");
    },
  },
  {
    name: "the + button opens the post form with all its fields",
    async run(h) {
      await h.waitFor(/вакансій/);
      await h.tap("[data-post]");
      await h.wait(250);
      h.expect((await h.count("[data-form]")) === 1, "форма розміщення не відкрилася");
      h.expect((await h.count("[data-f-title]")) === 1, "немає поля «Посада»");
      h.expect((await h.count("[data-f-city]")) === 1, "немає вибору міста");
      h.expect((await h.count("[data-f-contact]")) === 1, "немає поля контакту");
    },
  },
];
