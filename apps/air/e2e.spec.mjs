const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-aqi]")) > 0) break; await h.wait(500); } };

export default [
  {
    name: "якість повітря: гейдж AQI + графік + забрудники", run: async (h) => {
      await ready(h);
      h.expect((await h.count("[data-aqi]")) === 1, "немає індексу AQI");
      h.expect(/88/.test(await h.text("[data-aqi]")), "невірне значення AQI семплу");
      h.expect((await h.count("svg")) >= 2, "немає гейджа/графіка");
      h.expect(/PM2\.5|NO₂|O₃/i.test(await h.bodyText()), "немає забрудників");
      h.expect(/µg\/m³/.test(await h.bodyText()), "немає одиниць забрудників");
    },
  },
  {
    name: "пилок: активні види з рівнем", run: async (h) => {
      await ready(h);
      h.expect(/grains\/m³|зерен/i.test(await h.bodyText()), "немає одиниць пилку");
    },
  },
  {
    name: "форми: показ у формі місця, гейдж поверх, зерна пилку", run: async (h) => {
      await ready(h);
      const ORGANIC = ["Cookie4Sided", "Cookie6Sided", "Cookie7Sided", "Cookie9Sided", "Cookie12Sided", "Clover4Leaf", "Clover8Leaf", "Sunny", "VerySunny", "SoftBurst", "Flower", "Puffy", "PuffyDiamond"];
      h.expect(ORGANIC.includes(await h.attr("[data-orb]", "data-form")), "показ не у формі місця");
      h.expect(!!(await h.attr("[data-orb] .air-rim .e", "d")), "обідок не намальований");
      h.expect(/path\(/.test(await h.attr("[data-orb] .air-fill", "style")), "текстура не обрізана формою");
      h.expect((await h.count("[data-orb] .air-gauge [data-aqi]")) === 1, "гейдж не поверх форми");
      h.expect((await h.css("[data-orb] .air-gauge", "position")) === "absolute", "гейдж не лежить поверх форми (head.html не вбудовано?)");
      h.expect((await h.css("[data-orb] .air-gauge", "clip-path")) === "none", "гейдж обрізаний");
      h.expect((await h.prop("[data-orb]", "offsetWidth")) > 100, "показ без розміру");
      h.expect((await h.count("[data-grain]")) === 3, "у кожного виду пилку немає своєї форми");
      const grains = await Promise.all(["grass", "mugwort", "ragweed"].map((s) => h.attr(`[data-grain="${s}"] path`, "d")));
      h.expect(grains.every(Boolean) && new Set(grains).size === 3, "форми зерен порожні або однакові");
      h.expect((await h.count("[data-forecast] svg rect")) === 24, "графік на 24 години неповний");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Poor|Pollen|Language|hours/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/погана|Пилок|Мова|годин/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="now"]'); await h.wait(120);
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
