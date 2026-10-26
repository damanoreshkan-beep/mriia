const ready = async (h) => { for (let i = 0; i < 30; i++) { if ((await h.count("[data-stats]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "зразок відкрито: назва, трикутники, кліпи", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-stats]")) === 1, "немає цифр моделі");
      h.expect(/\d/.test(await h.text("[data-stats]")), "у цифрах немає числа");
      h.expect(/Obrys/.test(await h.text("[data-model]")), "немає назви моделі");
      h.expect(await h.attr("[data-model]", "data-clips") === "2", "кліпи зразка не прочитані");
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
    name: "«Про модель» відкривається з цифр і закривається кнопкою Назад", run: async (h) => {
      await ready(h);
      await h.tap("[data-stats]"); await h.wait(300);
      h.expect(/Orbit/.test(await h.text("[data-info]")), "немає анімацій у подробицях");
      await h.back(); await h.wait(300);
      h.expect((await h.count("dialog[open] [data-info]")) === 0, "Back не закрив аркуш");
    },
  },
  {
    name: "посилання: аркуш з полем, Назад закриває", run: async (h) => {
      await ready(h);
      await h.tap("[data-open]"); await h.wait(300);
      await h.tap("#srcsheet [data-link]"); await h.wait(300);
      h.expect((await h.count("[data-url]")) === 1, "немає поля посилання");
      h.expect((await h.prop("[data-go]", "disabled")) === true, "завантаження активне без посилання");
      await h.back(); await h.wait(300);
      h.expect((await h.count("dialog[open] [data-url]")) === 0, "Back не закрив аркуш посилання");
    },
  },
];
