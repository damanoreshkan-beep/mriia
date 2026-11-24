const q = (sel) => JSON.stringify(sel);
const has = (sel) => `!!document.querySelector(${q(sel)})`;
const ready = (h) => h.until(has('[data-layer="catalog"] [data-svc]'), 15000);

export default [
  {
    name: "каталог: соти послуг за напрямами, лічильники, обрана країна", run: async (h) => {
      h.expect(await ready(h), "каталог не з'явився");
      h.expect((await h.attr("[data-posol]", "data-services")) === "12", "не 12 послуг із фікстури");
      h.expect((await h.count("[data-comb-twin] [data-svc]")) === 12, "двійник сот не має 12 послуг");
      h.expect((await h.count('[data-svc][data-direction="tech"]')) === 2, "напрям tech без двох послуг");
      h.expect(/12/.test(await h.text("[data-counts]")), "лічильник послуг не 12");
      h.expect(/US/.test(await h.text("[data-country-pick]")), "країна за замовчуванням не найжвавіша");
      h.expect((await h.count(".loading")) === 0, "крутилка на екрані");
    },
  },
  {
    name: "країни: шар сот країн, вибір повертає назад, Back закриває шар", run: async (h) => {
      h.expect(await ready(h), "каталог не з'явився");
      await h.tap("[data-country-pick]");
      h.expect(await h.until(has('[data-layer="countries"] [data-country]'), 8000), "шар країн не відкрився");
      h.expect((await h.count("[data-comb-twin] [data-country]")) === 5, "не п'ять країн");
      h.expect((await h.attr('[data-country="ZA"]', "data-exits")) === "0", "мертва країна не позначена");
      await h.tap('[data-country="JP"]');
      h.expect(await h.until(has('[data-layer="catalog"]'), 8000), "вибір країни не повернув до каталогу");
      h.expect(/JP/.test(await h.text("[data-country-pick]")), "обрана країна не JP");
      await h.tap("[data-country-pick]");
      h.expect(await h.until(has('[data-layer="countries"]'), 8000), "шар країн не відкрився вдруге");
      await h.back();
      h.expect(await h.until(has('[data-layer="catalog"]'), 8000), "Back не закрив шар країн");
      await h.tap("[data-country-pick]");
      h.expect(await h.until(has('[data-country="US"]'), 8000), "шар країн не відкрився втретє");
      await h.tap('[data-country="US"]');
      h.expect(await h.until(has('[data-layer="catalog"]'), 8000), "не повернулись до каталогу");
    },
  },
  {
    name: "послуга: поле з прикладом, перевірка адреси, запуск і читання результату", run: async (h) => {
      h.expect(await ready(h), "каталог не з'явився");
      await h.tap('[data-comb-twin] [data-svc="page"]');
      h.expect(await h.until(has('[data-layer="service"][data-service="page"]'), 8000), "послуга не відкрилась");
      h.expect((await h.count('textarea[data-input="url"]')) === 1, "немає поля адреси");
      h.expect((await h.attr('textarea[data-input="url"]', "placeholder")) === "https://example.com", "немає прикладу в полі");
      await h.tap("[data-send]");
      h.expect(await h.until(has('[data-run="input"] [data-field-error]'), 6000), "порожнє поле не зупинило запуск");
      await h.type('textarea[data-input="url"]', "not a url");
      await h.tap("[data-send]");
      h.expect(await h.until(has('[data-run="input"] textarea[aria-invalid="true"]'), 6000), "хибна адреса пройшла");
      await h.type('textarea[data-input="url"]', "example.com");
      await h.tap("[data-send]");
      h.expect(await h.until(has('[data-result="ok"] [data-page-title]'), 8000), "немає результату");
      h.expect(/Example Domain/.test(await h.text("[data-page-title]")), "немає назви сторінки");
      h.expect(/Diese Domain/.test(await h.text("[data-excerpt]")), "немає уривка тексту");
      h.expect((await h.count("[data-result] [data-row]")) >= 4, "замало рядків результату");
      h.expect(/US/.test(await h.text("[data-exit]")), "немає країни виходу");
      h.expect(!/[{}"]/.test(await h.text("[data-result]")), "результат показано сирим JSON");
      await h.back();
      h.expect(await h.until(has('[data-layer="catalog"]'), 8000), "Back не повернув до каталогу");
    },
  },
  {
    name: "стани: країна без виходу і провал відвідування", run: async (h) => {
      h.expect(await ready(h), "каталог не з'явився");
      await h.tap('[data-comb-twin] [data-svc="reach"]');
      h.expect(await h.until(has('[data-service="reach"]'), 8000), "послуга не відкрилась");
      await h.type('textarea[data-input="url"]', "https://blocked.example");
      await h.tap("[data-send]");
      h.expect(await h.until(has('[data-result="failed"] [data-failed]'), 8000), "провал не показано");
      await h.tap("[data-country-pick]");
      h.expect(await h.until(has('[data-layer="countries"]'), 8000), "шар країн не відкрився з послуги");
      await h.tap('[data-country="ZA"]');
      h.expect(await h.until(has('[data-layer="service"][data-service="reach"]'), 8000), "вибір країни не повернув до послуги");
      await h.tap("[data-send]");
      h.expect(await h.until(has('[data-result="noexit"]'), 8000), "немає стану «без виходу»");
      h.expect(/Південна Африка|South Africa/.test(await h.text('[data-result="noexit"]')), "стан без назви країни");
      await h.tap("[data-country-pick]");
      h.expect(await h.until(has('[data-layer="countries"]'), 8000), "шар країн не відкрився");
      await h.tap('[data-country="US"]');
      h.expect(await h.until(has('[data-layer="service"]'), 8000), "не повернулись до послуги");
      await h.back();
      h.expect(await h.until(has('[data-layer="catalog"]'), 8000), "Back не повернув до каталогу");
    },
  },
  {
    name: "i18n EN/UA міняє каталог", run: async (h) => {
      h.expect(await ready(h), "каталог не з'явився");
      await h.click('[data-tab="me"]');
      h.expect(await h.until(has('[data-loc="en"]'), 6000), "немає перемикача мови");
      await h.click('[data-loc="en"]');
      await h.click('[data-tab="envoy"]');
      h.expect(await h.until(`/Catalog/.test(document.body.innerText)`, 6000), "не EN");
      await h.click('[data-tab="me"]');
      h.expect(await h.until(has('[data-loc="uk"]'), 6000), "немає перемикача мови");
      await h.click('[data-loc="uk"]');
      await h.click('[data-tab="envoy"]');
      h.expect(await h.until(`/Каталог/.test(document.body.innerText)`, 6000), "не UA");
    },
  },
];
