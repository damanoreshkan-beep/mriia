const ready = async (h) => { for (let i = 0; i < 40; i++) { if ((await h.attr("[data-machine]", "data-machine")) === "ready") break; await h.wait(250); } };
const root = "[data-rz]";

export default [
  {
    name: "машина: бінарник завантажений, сітка є, HUD читає адресу з памʼяті, контекст XOR, WebGL малює де є", run: async (h) => {
      await ready(h);
      h.expect((await h.attr("[data-machine]", "data-machine")) === "ready", `машина не готова: ${await h.attr("[data-machine]", "data-err")}`);
      h.expect(/^\d+×\d+$/.test(await h.attr("[data-machine]", "data-grid")), "сітки немає");
      h.expect((await h.count("[data-stage]")) === 1, "немає полотна");
      await h.wait(600);
      h.expect(/^0x0000[1-9A-F][0-9A-F]{3}$/.test(await h.attr(root, "data-addr")), `адреса не з памʼяті машини: ${await h.attr(root, "data-addr")}`);
      h.expect((await h.attr(root, "data-kernel")) === "xor", "стартовий контекст не XOR");
      h.expect((await h.attr('[data-kernel-key="xor"]', "aria-pressed")) === "true", "XOR не натиснутий");
      h.expect(/XOR/.test(await h.text("[data-hud]")), "HUD не називає контекст");
      h.expect(/wasm 256 KiB/.test(await h.text("[data-hud]")), "HUD не показує памʼять машини");
      const has = await h.attr("[data-stage]", "data-haswebgl");
      if (has === "yes") {
        h.expect((await h.attr("[data-stage]", "data-render")) === "webgl", `WebGL є, а поле не малюється: err=${await h.attr("[data-stage]", "data-err")}`);
        h.expect((await h.attr("[data-stage]", "data-buf")) === "yes", "памʼять машини не дійшла до шейдера");
      }
    },
  },
  {
    name: "дотик: імпульси рахуються в машині, адреса зсувається до точки дотику, відпускання знімає утримання", run: async (h) => {
      await ready(h); await h.wait(300);
      const a0 = await h.attr(root, "data-addr");
      await h.tap("[data-machine]"); await h.wait(600);
      h.expect(Number(await h.attr(root, "data-pulses")) >= 2, `імпульси не зараховані: ${await h.attr(root, "data-pulses")}`);
      h.expect((await h.attr(root, "data-down")) === "0", "утримання не знято після відпускання");
      h.expect((await h.attr(root, "data-addr")) !== a0, "адреса не зсунулась до дотику");
    },
  },
  {
    name: "контекст: тап по AND перемикає ядро машини й HUD, назад на XOR", run: async (h) => {
      await ready(h);
      await h.tap('[data-kernel-key="and"]'); await h.wait(400);
      h.expect((await h.attr('[data-kernel-key="and"]', "aria-pressed")) === "true", "AND не активний");
      h.expect((await h.attr(root, "data-kernel")) === "and", "поле не перемкнуло ядро");
      h.expect(/AND/.test(await h.text("[data-hud]")), "HUD не показує контекст AND");
      await h.tap('[data-kernel-key="xor"]'); await h.wait(150);
      h.expect((await h.attr(root, "data-kernel")) === "xor", "не повернувся на XOR");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Language|Dark theme/i.test(await h.bodyText()), "англійська не застосувалась");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Мова|Темна тема/.test(await h.bodyText()), "українська не застосувалась");
    },
  },
];
