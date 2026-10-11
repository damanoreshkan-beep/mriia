const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-prism]")) > 0) break; await h.wait(250); } };

export default [
  {
    name: "призма: картинка під гейтом, 11 матеріалів лисичками і плитка «свій стиль»", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-source]")) === 1, "немає картки картинки");
      h.expect((await h.count('[data-tile="mat"]')) === 11, `не 11 матеріалів: ${await h.count('[data-tile="mat"]')}`);
      h.expect((await h.count('[data-tile="own"]')) === 1, "немає свого стилю під гейтом");
      h.expect((await h.count("[data-add-style]")) === 1, "немає плитки «Свій стиль»");
      h.expect((await h.count('[data-tile][data-state="idle"]')) === 12, "плитки не чекають розкладу");
    },
  },
  {
    name: "розкласти: кожна плитка домальовується, лічильник каже скільки; відкрита плитка — у повний екран з Зберегти/Поділитися", run: async (h) => {
      await ready(h);
      await h.tap("[data-split]");
      for (let i = 0; i < 30 && (await h.count('[data-tile][data-state="done"]')) < 12; i++) await h.wait(100);
      h.expect((await h.count('[data-tile][data-state="done"]')) === 12, "не всі плитки домалювались");
      h.expect(/12/.test(await h.text("[data-count]")), "лічильник не каже 12");
      await h.tap('[data-tile="mat"] button'); await h.wait(250);
      h.expect((await h.count("[data-lightbox]")) === 1, "плитка не відкрилась");
      h.expect((await h.count("[data-lightbox] [data-save]")) === 1 && (await h.count("[data-lightbox] [data-share]")) === 1, "немає Зберегти/Поділитися");
      await h.back(); await h.wait(250);
      h.expect((await h.count("[data-lightbox]")) === 0, "Back не закрив");
    },
  },
  {
    name: "ніч і день: розклад за поточною темою, перемикач показує інший режим окремо", run: async (h) => {
      await ready(h);
      const was = await h.attr("[data-prism]", "data-mode");
      h.expect(was === "dark" || was === "light", "немає режиму");
      await h.click(`[data-mode="${was === "dark" ? "light" : "dark"}"]`); await h.wait(200);
      h.expect((await h.attr("[data-prism]", "data-mode")) !== was, "режим не перемкнувся");
      h.expect((await h.count('[data-tile][data-state="idle"]')) === 12, "інший режим не чекає свого розкладу");
      await h.click(`[data-mode="${was}"]`); await h.wait(150);
    },
  },
  {
    name: "свій стиль: назва + опис → лисичка → зберегти; стиль з'являється в сітці і в «Мої стилі»", run: async (h) => {
      await ready(h);
      await h.tap("[data-add-style]"); await h.wait(250);
      h.expect((await h.count("[data-style-sheet]")) === 1, "не відкрився аркуш стилю");
      h.expect(await h.prop("[data-draw-fox]", "disabled"), "лисичку можна малювати без назви");
      await h.type("[data-style-name]", "Неон");
      await h.type("[data-style-prompt]", "glowing neon tubes bent into shapes");
      await h.tap("[data-draw-fox]"); await h.wait(250);
      h.expect(!(await h.prop("[data-save-style]", "disabled")), "після лисички не можна зберегти");
      await h.tap("[data-save-style]"); await h.wait(300);
      h.expect((await h.count('[data-tile="own"]')) === 2, "новий стиль не з'явився в сітці");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Prism|Language/.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="split"]'); await h.wait(150);
    },
  },
];
