export default [
  {
    name: "reading renders: sign card, day segmented (today), real prose, star ratings", run: async (h) => {
      h.expect((await h.count("[data-sign]")) === 1, "немає картки знака");
      h.expect(/Leo|Лев/.test(await h.text("[data-sign]")), "стандартний знак ≠ поточний сонячний (Лев)");
      h.expect((await h.count("[data-day]")) === 3, "має бути 3 дні (вчора/сьогодні/завтра)");
      h.expect((await h.attr('[data-day="today"]', "aria-pressed")) === "true", "'сьогодні' не активне за замовчуванням");
      h.expect((await h.text("[data-reading]")).trim().length > 40, "порожнє/поверхневе читання");
      h.expect((await h.count("[data-ratings]")) === 1, "немає блоку зоряних рейтингів");
      const body = await h.bodyText();
      h.expect(/Love|Любов/.test(body) && /Work|Робота/.test(body) && /Vibe|Настрій/.test(body) && /Success|Успіх/.test(body), "немає шкал love/work/vibe/success");
    },
  },
  {
    name: "знак — форма: орб у власній формі знака, текстура крізь неї, обідок", run: async (h) => {
      h.expect((await h.count("[data-sign] [data-orb]")) === 1, "на картці знака немає орба");
      h.expect(!!(await h.attr("[data-orb]", "data-form")), "форма знака не задана");
      h.expect((await h.count("[data-orb] .hs-rim path")) === 2, "у орба немає обідка");
      h.expect(!!(await h.attr("[data-orb] .hs-rim .e", "d")), "обідок не намальований");
      h.expect(/^path\(/.test(await h.css("[data-orb] .hs-fill", "clip-path")), "текстура не обрізана формою знака");
    },
  },
  {
    name: "перемикання дня змінює гороскоп", run: async (h) => {
      const today = await h.text("[data-reading]");
      await h.click('[data-day="tomorrow"]'); await h.wait(200);
      h.expect((await h.attr('[data-day="tomorrow"]', "aria-pressed")) === "true", "'завтра' не стало активним");
      h.expect((await h.text("[data-reading]")) !== today, "гороскоп не змінився при зміні дня");
      await h.click('[data-day="today"]'); await h.wait(150);
    },
  },
  {
    name: "вибір знака: аркуш історія-backed (Back закриває) + вибір оновлює картку", run: async (h) => {
      await h.click("[data-sign]"); await h.wait(200);
      h.expect((await h.prop("#signsheet", "open")) === true, "аркуш вибору знака не відкрився");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#signsheet", "open")) !== true, "Back не закрив аркуш вибору");
      await h.click("[data-sign]"); await h.wait(200);
      // every sign its own form — twelve signs, twelve faces; the chosen one is the orb's
      const forms = new Set();
      for (let i = 0; i < 12; i++) forms.add(await h.attr(`[data-signpick="${i}"] [data-form]`, "data-form"));
      h.expect(forms.size === 12 && !forms.has(null) && !forms.has(""), "у знаків у виборі не дванадцять різних форм");
      const was = await h.attr("[data-orb]", "data-form");
      h.expect((await h.attr('[data-signpick][aria-pressed="true"] [data-form]', "data-form")) === was, "обраний знак у виборі не у формі орба");
      const aries = await h.attr('[data-signpick="0"] [data-form]', "data-form");
      await h.click('[data-signpick="0"]'); await h.wait(200);
      h.expect((await h.prop("#signsheet", "open")) !== true, "вибір знака не закрив аркуш");
      h.expect(/Aries|Овен/.test(await h.text("[data-sign]")), "картка не оновилась на обраний знак");
      h.expect((await h.attr("[data-orb]", "data-form")) === aries && aries !== was, "орб не перетік у форму обраного знака");
    },
  },
  {
    name: "i18n EN/UA", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click('[data-loc="en"]'); await h.wait(250);
      h.expect(/Today|Yesterday|Tomorrow/i.test(await h.bodyText()), "не EN");
      await h.click('[data-loc="uk"]'); await h.wait(250);
      h.expect(/Сьогодні|Вчора|Завтра/i.test(await h.bodyText()), "не UA");
      await h.click('[data-tab="read"]'); await h.wait(120);
    },
  },
  {
    name: "PWA: профіль → модалка встановлення, Back закриває", run: async (h) => {
      await h.click('[data-tab="me"]'); await h.wait(150);
      await h.click("#p-install"); await h.wait(150);
      h.expect((await h.prop("#install", "open")) === true, "модалка не відкрилась");
      await h.back(); await h.wait(200);
      h.expect((await h.prop("#install", "open")) !== true, "Back не закрив");
    },
  },
];
