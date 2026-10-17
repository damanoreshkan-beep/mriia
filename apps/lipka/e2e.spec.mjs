const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-photo]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "готово: фото, розмір моделі, завантаження .glb", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-photo]")) === 1, "немає фото");
      h.expect(/8[.,]1/.test(await h.text("[data-ready]")), "розмір моделі не показаний");
      h.expect((await h.count("[data-save]")) === 1, "немає завантаження");
      h.expect(/\.glb/i.test(await h.text("[data-save]")), "кнопка не каже .glb");
      h.expect((await h.count("[data-new]")) === 1, "немає нового фото");
    },
  },
  {
    name: "сцена отримує більшу частку екрана, ніж острів", run: async (h) => {
      await ready(h);
      const stage = await h.css("[data-stage-box]", "height"), island = await h.css("[data-island]", "height");
      h.expect(parseFloat(stage) > parseFloat(island), `сцена ${stage} не більша за острів ${island}`);
    },
  },
  {
    name: "натиск відповідає", run: async (h) => {
      await ready(h);
      for (const s of ["[data-save]", "[data-new]"]) h.expect(/\bms-press\b/.test(await h.attr(s, "class")), `${s} не відповідає на натиск`);
    },
  },
  {
    // last: «нове фото» consumes the result the tests above need (the page is shared across tests)
    name: "нове фото повертає вибір, кнопка ліпки неактивна без фото", run: async (h) => {
      await ready(h);
      await h.click("[data-new]"); await h.wait(200);
      h.expect((await h.count("[data-photo]")) === 0, "фото не прибралось");
      h.expect((await h.count("[data-go]")) === 1, "немає кнопки ліпки");
      h.expect(await h.attr("[data-go]", "disabled") !== null, "ліпка активна без фото");
    },
  },
];
