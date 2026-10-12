// the app opens on «Вподобане» (spec tabs[0]); the remix screen is its own tab
const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-remix]")) > 0) break; if ((await h.count('[data-tab="mix"]')) > 0) await h.click('[data-tab="mix"]'); await h.wait(300); } };
// under the gate the fixture song arrives already mixed at deep, slowed and nightcore (view.js MIXED)
const mixed = async (h) => { await ready(h); if ((await h.count("[data-mix]")) > 0) { await h.tap("[data-mix]"); await h.wait(400); } };
// a slide on the stepper: the drag (input) previews, the release (change) picks — rt/remix.js STEPS order
const STEPS = ["superslow", "deep", "slowed", "spedup", "nightcore", "superfast"];
const slide = async (h, v) => { const i = String(STEPS.indexOf(v)); await h.type("[data-step-range]", i); await h.select("[data-step-range]", i); await h.wait(450); };

export default [
  {
    name: "пісня: поле посилання, картка з назвою і тривалістю, без крутилок", run: async (h) => {
      await ready(h); await h.wait(300);
      h.expect((await h.count("[data-link]")) === 1, "немає поля посилання");
      h.expect((await h.attr("[data-remix]", "data-song")) === "dQw4w9WgXcQ", "картка пісні не показана під гейтом");
      h.expect(/Never Gonna Give You Up/.test(await h.text("[data-song-title]")), "немає назви пісні");
      h.expect(/3:33/.test(await h.bodyText()), "немає тривалості");
      h.expect((await h.count(".loading")) === 0, "крутилка на екрані");
    },
  },
  {
    name: "повзунок: шість кроків від super slow до super fast, вибраний — зі швидкістю і темпом, плюс що почуто в пісні", run: async (h) => {
      await mixed(h); await slide(h, "slowed");
      h.expect((await h.count("[data-stepper] [data-node]")) === 6, "не шість кроків");
      h.expect((await h.count("[data-step-range]")) === 1, "немає повзунка");
      h.expect((await h.attr("[data-step-range]", "aria-valuetext")) === "Slowed + reverb", "повзунок не називає крок");
      h.expect((await h.count('[data-node][data-state="ready"]')) === 3, "під гейтом не три зроблені кроки");
      h.expect((await h.attr('[data-node="slowed"]', "data-on")) === "true", "вибраний вузол не підсвічений");
      h.expect(/0\.85×/.test(await h.text("[data-step-line]")) && /96 BPM/.test(await h.text("[data-step-line]")), "немає швидкості й нового темпу slowed");
      h.expect(/1×/.test(await h.bodyText()), "немає позначки оригіналу");
      h.expect(/113 BPM/.test(await h.text("[data-readout]")), "немає темпу пісні в зчитуванні");
      h.expect(/щільний мікс|dense mix/.test(await h.text("[data-readout]")), "немає слова про щільність");
      h.expect((await h.count("[data-save]")) === 1 && (await h.count("[data-keep]")) === 1, "немає однієї пари зберегти / у Фонотеку");
      h.expect((await h.count("[data-mix]")) === 0, "кнопка реміксу показана, хоча ремікс уже є");
    },
  },
  {
    name: "крок на вимогу: тягнути показує крок, відпустити — робить лише його; краї super slow і super fast", run: async (h) => {
      await mixed(h);
      h.expect((await h.count('[data-node="superslow"][data-state]')) === 0, "super slow зроблений до вибору");
      await h.type("[data-step-range]", "0"); await h.wait(200);
      h.expect(/Super slowed/.test(await h.text("[data-step-name]")), "перетягування не показало крок");
      h.expect(/0\.67×/.test(await h.text("[data-step-line]")) && /76 BPM/.test(await h.text("[data-step-line]")), "немає чисел super slow до рендеру");
      await h.select("[data-step-range]", "0"); await h.wait(450);
      h.expect((await h.attr('[data-node="superslow"]', "data-state")) === "ready", "відпускання не зробило крок");
      h.expect((await h.count('[data-node="superfast"][data-state]')) === 0, "зроблено більше, ніж вибрано");
      await slide(h, "superfast");
      h.expect(/1\.40×/.test(await h.text("[data-step-line]")) && /158 BPM/.test(await h.text("[data-step-line]")), "немає швидкості й темпу super fast");
      h.expect((await h.attr('[data-node="superfast"]', "data-state")) === "ready", "super fast не зробився");
      await slide(h, "slowed");
    },
  },
  {
    name: "плеєр: одна кнопка грати перемикає data-playing, наступна йде по зроблених кроках і тягне повзунок", run: async (h) => {
      await mixed(h); await slide(h, "slowed");
      h.expect((await h.count("[data-transport]")) === 1 && (await h.count("#play")) === 1, "немає одного транспорту з однією кнопкою грати");
      await h.tap("#play"); await h.wait(150);
      h.expect((await h.attr("[data-remix]", "data-playing")) === "true", "гра не почалась");
      await h.tap("#play"); await h.wait(150);
      h.expect((await h.attr("[data-remix]", "data-playing")) !== "true", "пауза не спрацювала");
      await h.tap("#next"); await h.wait(150);
      const now = await h.prop("[data-step-range]", "value");
      h.expect(Number(now) > STEPS.indexOf("slowed"), `наступна не пішла швидше за slowed (крок ${now})`);
      h.expect((await h.attr(`[data-node="${STEPS[Number(now)]}"]`, "data-state")) === "ready", "наступна стала на незроблений крок");
      await slide(h, "slowed");
    },
  },
  {
    name: "форма: кожен крок — своя форма на повзунку, сфера в плеєрі перетікає у форму вибраного", run: async (h) => {
      await mixed(h); await slide(h, "slowed");
      h.expect((await h.count("[data-node] svg path")) === 6, "не шість форм кроків");
      h.expect((await h.count("[data-remix] [data-orb]")) === 1, "немає сфери в плеєрі");
      h.expect((await h.count("[data-tp-filament]")) === 1, "плеєр не на формі (немає нитки перемотки)");
      const was = await h.attr("[data-orb]", "data-form");
      await slide(h, "nightcore");
      const now = await h.attr("[data-orb]", "data-form");
      h.expect(!!was && !!now && was !== now, `сфера не змінила форму (${was} → ${now})`);   // slowed / nightcore seed different forms (core shapeOf)
      await slide(h, "slowed");
      h.expect((await h.attr("[data-orb]", "data-form")) === was, "сфера не повернулась до форми slowed");
    },
  },
  {
    name: "зберегти: тап каже «Збережено»", run: async (h) => {
      await mixed(h); await slide(h, "deep");
      await h.tap('[data-save="deep"]'); await h.wait(400);
      h.expect(/Збережено|Saved/.test(await h.bodyText()), "немає підтвердження");
      await slide(h, "slowed");
    },
  },
  {
    name: "посилання: не-YouTube адреса — одна фраза помилки, картка і повзунок зникають; YouTube-адреса повертає картку з кнопкою реміксу, тап мікшує", run: async (h) => {
      await ready(h);
      await h.type("[data-link]", "https://example.com/song"); await h.click("[data-find]"); await h.wait(250);
      h.expect((await h.count("[data-err]")) === 1, "немає помилки");
      h.expect(!(await h.attr("[data-remix]", "data-song")), "картка лишилась");
      h.expect((await h.count("[data-stepper]")) === 0, "повзунок лишився без пісні");
      await h.type("[data-link]", "https://youtu.be/dQw4w9WgXcQ"); await h.click("[data-find]"); await h.wait(300);
      h.expect((await h.count("[data-err]")) === 0, "помилка не зникла");
      h.expect((await h.attr("[data-remix]", "data-song")) === "dQw4w9WgXcQ", "картка не повернулась");
      h.expect((await h.count("[data-mix]")) === 1, "немає кнопки реміксу для нової пісні");
      h.expect((await h.count("[data-stepper]")) === 1 && (await h.count('[data-node][data-state]')) === 0, "до реміксу повзунок не порожній");
      await h.tap("[data-mix]"); await h.wait(400);
      h.expect((await h.count('[data-node][data-state="ready"]')) >= 1, "тап не дав ремікс");
    },
  },
  {
    name: "шерінг: посилання з іншого застосунку лягає в поле і одразу шукається", run: async (h) => {
      await h.goto("sh_text=" + encodeURIComponent("дивись https://youtu.be/dQw4w9WgXcQ"), 800);
      for (let i = 0; i < 20 && (await h.count("[data-remix]")) === 0; i++) await h.wait(300);
      h.expect((await h.count("[data-remix]")) === 1, "посилання відкрило не вкладку «Ремікс»");
      await h.wait(300);
      h.expect((await h.prop("[data-link]", "value")).includes("youtu.be/dQw4w9WgXcQ"), "посилання не лягло в поле");
      h.expect((await h.attr("[data-remix]", "data-song")) === "dQw4w9WgXcQ", "картка не знайшлась");
    },
  },
  {
    name: "по колу чи далі: перемикач у плеєрі ходить між «далі» і «одна по колу»", run: async (h) => {
      await mixed(h);
      h.expect((await h.count("[data-remix] #repeat")) === 1, "немає перемикача");
      const was = await h.attr("[data-remix] #repeat", "data-repeat");
      await h.tap("[data-remix] #repeat"); await h.wait(150);
      const now = await h.attr("[data-remix] #repeat", "data-repeat");
      h.expect(["off", "one"].includes(was) && ["off", "one"].includes(now) && was !== now, `перемикач не перемкнувся (${was} → ${now})`);   // "off" is how «далі» is SHOWN (view.js shownRepeat)
      await h.tap("[data-remix] #repeat"); await h.wait(150);
      h.expect((await h.attr("[data-remix] #repeat", "data-repeat")) === was, "другий тап не повернув режим");
    },
  },
  {
    name: "вподобане: застосунок відкривається списком з YouTube, тап по пісні — вкладка «Ремікс» і її ремікс", run: async (h) => {
      await h.goto("", 800);
      for (let i = 0; i < 20 && (await h.count("[data-likes]")) === 0; i++) await h.wait(300);
      h.expect((await h.attr("[data-likes]", "data-connected")) === "true", "список не показаний під гейтом першим");
      h.expect((await h.count("[data-pick-song]")) === 4, "не чотири пісні з фікстури");
      h.expect((await h.count("[data-yt-off]")) === 1, "немає «Відключити»");
      await h.tap('[data-pick-song="fJ9rUzIMcZQ"]'); await h.wait(500);
      h.expect((await h.attr("[data-remix]", "data-song")) === "fJ9rUzIMcZQ", "тап не відкрив ремікс цієї пісні");
      h.expect(/Bohemian Rhapsody/.test(await h.text("[data-song-title]")), "картка не тієї пісні");
      h.expect((await h.count('[data-node][data-state="ready"]')) >= 1, "ремікс не почався сам");
      h.expect((await h.count("[data-mix]")) === 0, "після вибору ще треба тиснути кнопку");
      await h.click('[data-tab="likes"]'); await h.wait(250);
      h.expect((await h.attr('[data-pick-song="fJ9rUzIMcZQ"]', "aria-pressed")) === "true", "у списку не позначено пісню в реміксі");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Remix|Song|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Ремікс|Пісня|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="mix"]'); await h.wait(120);
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
