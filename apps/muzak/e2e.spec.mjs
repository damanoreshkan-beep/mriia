const ready = async (h) => { for (let i = 0; i < 20; i++) { if ((await h.count("[data-muzak]")) > 0) break; await h.wait(300); } };

export default [
  {
    name: "пісня: картка з назвою, виконавцем і тривалістю; слухати, поділитися, мікс, радіо, ⋯", run: async (h) => {
      await ready(h); await h.wait(300);
      h.expect((await h.count("[data-link]")) === 1, "немає поля посилання");
      h.expect((await h.attr("[data-muzak]", "data-song")) === "dQw4w9WgXcQ", "картка пісні не показана під гейтом");
      h.expect(/Never Gonna Give You Up/.test(await h.text("[data-song-title]")), "немає назви пісні");
      h.expect(/Rick Astley · Whenever You Need Somebody · 1987/.test(await h.bodyText()), "немає рядка виконавець · альбом · рік");
      h.expect(/3:33/.test(await h.bodyText()), "немає тривалості");
      h.expect((await h.count("[data-listen]")) === 1, "немає «Слухати»");
      for (const a of ["share", "mix", "radio", "more"]) h.expect((await h.count(`[data-muzak] [data-${a}]`)) === 1, `немає кнопки ${a}`);
      h.expect((await h.count("[data-muzak] [data-save], [data-muzak] [data-keep]")) === 0, "«Скачати» чи «У Фонотеку» не сховались у ⋯");
      h.expect((await h.count(".loading")) === 0, "крутилка на екрані");
    },
  },
  {
    name: "скачати: ⋯ відкриває меню, Back його закриває; «Скачати» зберігає mp3 і каже «Збережено»", run: async (h) => {
      await ready(h);
      await h.tap("[data-muzak] [data-more]"); await h.wait(250);
      h.expect((await h.prop("#mz-more", "open")) === true, "меню ⋯ не відкрилось");
      h.expect((await h.count("#mz-more [data-keep]")) === 1 && (await h.count("#mz-more [data-save]")) === 1, "у меню немає «У Фонотеку» чи «Скачати»");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#mz-more", "open")) !== true, "Back не закрив меню");
      await h.tap("[data-muzak] [data-more]"); await h.wait(250);
      await h.tap("#mz-more [data-save]"); await h.wait(400);
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
      await h.tap("[data-muzak] [data-more]"); await h.wait(250);
      await h.tap("#mz-more [data-keep]"); await h.wait(400);
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
    name: "для тебе: під карткою пісні — схожі на вподобані, з «Мікс», «Радіо», ⋯; тап грає з плеєром над списком", run: async (h) => {
      await ready(h); await h.wait(200);
      h.expect((await h.attr("[data-foryou]", "data-songs")) === "4", "не 4 пісні «Для тебе» під гейтом");
      for (const a of ["mix", "radio", "more"]) h.expect((await h.count(`[data-foryou] [data-like] [data-${a}]`)) === 4, `не в кожної пісні «Для тебе» ${a}`);
      h.expect((await h.count("[data-muzak] [data-like]")) === 0, "«Для тебе» влізло в картку пісні");
      h.expect((await h.count("[data-foryou] [data-player]")) === 0, "плеєр до першого тапу");
      await h.tap('[data-foryou] [data-play="xrI5jBPT4Cw"]'); await h.wait(300);
      h.expect(/Оберіг/.test(await h.text("[data-foryou] [data-player]")), "плеєр не назвав пісню");
      await h.tap("[data-foryou] [data-player] #play"); await h.wait(150);
    },
  },
  {
    name: "вподобане: плеєр над списком, тап на пісню грає її, у кожної «У Фонотеку» і «Скачати», список довантажується сам", run: async (h) => {
      await h.click('[data-tab="likes"]'); await h.wait(250);
      h.expect((await h.attr("[data-likes]", "data-connected")) === "true", "список не показаний під гейтом");
      h.expect((await h.count("[data-player]")) === 1, "немає плеєра");
      h.expect((await h.count("[data-like]")) === 4, "не 4 пісні");
      for (const a of ["share", "mix", "radio", "more"]) h.expect((await h.count(`[data-player] [data-${a}]`)) === 1, `у плеєра немає ${a}`);
      for (const a of ["mix", "radio", "more"]) h.expect((await h.count(`[data-like] [data-${a}]`)) === 4, `не в кожної пісні ${a}`);
      await h.tap('[data-like] [data-mix="pAgnJDJN4VA"]'); await h.wait(400);
      h.expect(/Обидві версії у Фонотеці|Both versions are in Fonoteka/.test(await h.bodyText()), "мікс не сказав, що обидві версії у Фонотеці");
      await h.tap('[data-like] [data-more="kXYiU_JCYtU"]'); await h.wait(250);
      await h.tap('#mz-more [data-save="kXYiU_JCYtU"]'); await h.wait(400);
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
    name: "радіо: тап грає пісню, за нею в черзі й у секції «Радіо» схожі; тап по схожій грає її; ✕ закриває", run: async (h) => {
      await h.click('[data-tab="likes"]'); await h.wait(250);
      await h.tap('[data-like] [data-radio="kXYiU_JCYtU"]'); await h.wait(300);
      h.expect((await h.attr("[data-radio-list]", "data-songs")) === "5", "радіо не зібрало пісню і 4 схожі");
      h.expect((await h.attr("[data-likes]", "data-playing")) === "true", "радіо не заграло");
      h.expect(/Numb/.test(await h.text("[data-player]")), "плеєр не назвав пісню, з якої радіо");
      h.expect((await h.attr('[data-like] [data-radio="kXYiU_JCYtU"]', "aria-pressed")) === "true", "кнопка радіо не світиться");
      await h.tap('[data-radio-list] [data-play="xrI5jBPT4Cw"]'); await h.wait(300);
      h.expect(/Оберіг/.test(await h.text("[data-player]")), "схожа пісня з радіо не заграла");
      await h.tap("[data-radio-off]"); await h.wait(150);
      h.expect((await h.count("[data-radio-list]")) === 0, "✕ не закрив радіо");
      await h.tap("[data-player] #play"); await h.wait(150);
      await h.click('[data-tab="song"]'); await h.wait(120);
    },
  },
  {
    name: "пошук: поле і кнопка; знайдені пісні з «Мікс», «Радіо», ⋯; тап грає з плеєром над списком; порожнє поле — кнопка вимкнена", run: async (h) => {
      await h.click('[data-tab="search"]'); await h.wait(250);
      h.expect((await h.count("[data-search] [data-q]")) === 1, "немає поля пошуку");
      h.expect((await h.attr("[data-search]", "data-found")) === "4", "не 4 знайдені пісні під гейтом");
      for (const a of ["mix", "radio", "more"]) h.expect((await h.count(`[data-search] [data-like] [data-${a}]`)) === 4, `не в кожної знайденої пісні ${a}`);
      h.expect(/Без бою/.test(await h.bodyText()) && /Океан Ельзи/.test(await h.bodyText()), "немає назви чи виконавця");
      h.expect((await h.count("[data-search] [data-player]")) === 0, "плеєр до першого тапу");
      await h.tap('[data-search] [data-play="8wWrzr3_46Y"]'); await h.wait(300);
      h.expect((await h.attr("[data-search]", "data-playing")) === "true", "не грає");
      h.expect(/Обійми/.test(await h.text("[data-search] [data-player]")), "плеєр не назвав пісню");
      await h.type("[data-search] [data-q]", ""); await h.wait(100);
      h.expect((await h.prop("[data-search-go]", "disabled")) === true, "кнопка не вимкнена на порожньому полі");
      await h.type("[data-search] [data-q]", "queen"); await h.click("[data-search-go]"); await h.wait(300);
      h.expect((await h.count("[data-search] [data-err]")) === 0, "помилка після пошуку");
      h.expect((await h.attr("[data-search]", "data-found")) === "4", "пошук не показав пісні");
      h.expect((await h.count(".loading")) === 0, "крутилка на екрані");
      await h.tap("[data-search] [data-player] #play"); await h.wait(150);
      await h.click('[data-tab="song"]'); await h.wait(120);
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
