const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-muzak]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "пісня: картка з назвою, виконавцем і тривалістю; слухати, скачати, у Фонотеку, поділитися, мікс", run: async (h) => {
      await ready(h); await h.wait(300);
      h.expect((await h.count("[data-link]")) === 1, "немає поля посилання");
      h.expect((await h.attr("[data-muzak]", "data-song")) === "dQw4w9WgXcQ", "картка пісні не показана під гейтом");
      h.expect(/Never Gonna Give You Up/.test(await h.text("[data-song-title]")), "немає назви пісні");
      h.expect(/Rick Astley · Whenever You Need Somebody · 1987/.test(await h.bodyText()), "немає рядка виконавець · альбом · рік");
      h.expect(/3:33/.test(await h.bodyText()), "немає тривалості");
      h.expect((await h.count("[data-listen]")) === 1, "немає «Слухати»");
      for (const a of ["save", "keep", "share", "mix"]) h.expect((await h.count(`[data-muzak] [data-${a}]`)) === 1, `немає кнопки ${a}`);
      h.expect((await h.count(".loading")) === 0, "крутилка на екрані");
    },
  },
  {
    name: "скачати: тап зберігає mp3 і каже «Збережено»", run: async (h) => {
      await ready(h);
      await h.tap("[data-muzak] [data-save]"); await h.wait(400);
      h.expect(/Збережено|Saved/.test(await h.bodyText()), "немає підтвердження");
    },
  },
  {
    name: "слухати: тап грає, другий ставить на паузу; «У Фонотеку» каже, що пісня там", run: async (h) => {
      await ready(h);
      await h.tap("[data-listen]"); await h.wait(250);
      h.expect((await h.attr("[data-muzak]", "data-playing")) === "true", "не грає");
      h.expect((await h.count("[data-listen]")) === 0 && (await h.count("[data-muzak] [data-transport]")) === 1, "плеєр не заступив «Слухати» — дві паузи");
      await h.tap("[data-muzak] #play"); await h.wait(250);
      h.expect(!(await h.attr("[data-muzak]", "data-playing")), "не стало на паузу");
      await h.tap("[data-muzak] [data-keep]"); await h.wait(400);
      h.expect(/Є у Фонотеці|In Fonoteka/.test(await h.bodyText()), "немає підтвердження");
    },
  },
  {
    name: "посилання: не-YouTube адреса — одна фраза помилки, картка зникає; YouTube-адреса повертає картку", run: async (h) => {
      await ready(h);
      await h.type("[data-link]", "https://example.com/song"); await h.click("[data-find]"); await h.wait(250);
      h.expect((await h.count("[data-err]")) === 1, "немає помилки");
      h.expect(!(await h.attr("[data-muzak]", "data-song")), "картка лишилась");
      await h.type("[data-link]", "https://youtu.be/dQw4w9WgXcQ"); await h.click("[data-find]"); await h.wait(300);
      h.expect((await h.count("[data-err]")) === 0, "помилка не зникла");
      h.expect((await h.attr("[data-muzak]", "data-song")) === "dQw4w9WgXcQ", "картка не повернулась");
    },
  },
  {
    name: "шерінг: посилання з іншого застосунку лягає в поле і одразу шукається; адреса очищена", run: async (h) => {
      await h.goto("sh_text=" + encodeURIComponent("дивись https://youtu.be/dQw4w9WgXcQ"), 800); await ready(h); await h.wait(300);
      h.expect((await h.prop("[data-link]", "value")).includes("youtu.be/dQw4w9WgXcQ"), "посилання не лягло в поле");
      h.expect((await h.attr("[data-muzak]", "data-song")) === "dQw4w9WgXcQ", "картка не знайшлась");
      h.expect(!(await h.prop("body", "baseURI")).includes("sh_text"), "sh_text лишився в адресі");
    },
  },
  {
    name: "вподобане: плеєр над списком, тап на пісню грає її, у кожної «У Фонотеку» і «Скачати», список довантажується сам", run: async (h) => {
      await h.click('[data-tab="likes"]'); await h.wait(250);
      h.expect((await h.attr("[data-likes]", "data-connected")) === "true", "список не показаний під гейтом");
      h.expect((await h.count("[data-player]")) === 1, "немає плеєра");
      h.expect((await h.count("[data-like]")) === 4, "не 4 пісні");
      h.expect((await h.count("[data-like] [data-keep]")) === 4, "не в кожної пісні «У Фонотеку»");
      for (const a of ["share", "mix"]) h.expect((await h.count(`[data-player] [data-${a}]`)) === 1, `у плеєра немає ${a}`);
      h.expect((await h.count("[data-like] [data-save]")) === 4, "не в кожної пісні «Скачати»");
      h.expect((await h.count("[data-like] [data-mix]")) === 4, "не в кожної пісні «Мікс»");
      await h.tap('[data-like] [data-mix="pAgnJDJN4VA"]'); await h.wait(400);
      h.expect(/Обидві версії у Фонотеці|Both versions are in Fonoteka/.test(await h.bodyText()), "мікс не сказав, що обидві версії у Фонотеці");
      await h.tap('[data-like] [data-save="kXYiU_JCYtU"]'); await h.wait(400);
      h.expect(/Збережено|Saved/.test(await h.bodyText()), "скачування не сказало «Збережено»");
      h.expect(/YouTube · Оксана/i.test(await h.bodyText()), "немає рядка, чий це YouTube");   // the label is uppercase by CSS, and innerText carries it
      h.expect((await h.count("[data-tail]")) === 1, "немає довантаження в кінці списку");
      h.expect((await h.count("[data-yt-off]")) === 1, "немає «Відключити»");
      await h.tap('[data-play="fJ9rUzIMcZQ"]'); await h.wait(300);
      h.expect((await h.attr('[data-play="fJ9rUzIMcZQ"]', "aria-pressed")) === "true", "пісня не стала поточною");
      h.expect((await h.attr("[data-likes]", "data-playing")) === "true", "не грає");
      h.expect(/Bohemian Rhapsody/.test(await h.text("[data-player]")), "плеєр не назвав пісню");
    },
  },
  {
    name: "по колу чи далі: перемикач у плеєрі ходить між «далі» і «одна по колу»", run: async (h) => {
      await h.click('[data-tab="likes"]'); await h.wait(250);
      h.expect((await h.count("[data-player] #repeat")) === 1, "немає перемикача");
      const was = await h.attr("[data-player] #repeat", "data-repeat");
      await h.tap("[data-player] #repeat"); await h.wait(150);
      const now = await h.attr("[data-player] #repeat", "data-repeat");
      h.expect(["off", "one"].includes(was) && ["off", "one"].includes(now) && was !== now, `перемикач не перемкнувся (${was} → ${now})`);   // "off" is how «далі» is SHOWN (view.js shownRepeat)
      await h.tap("[data-player] #repeat"); await h.wait(150);
      h.expect((await h.attr("[data-player] #repeat", "data-repeat")) === was, "другий тап не повернув режим");
      await h.click('[data-tab="song"]'); await h.wait(120);
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Muzak|Song|Language/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Музак|Пісня|Мова/.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="song"]'); await h.wait(120);
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
