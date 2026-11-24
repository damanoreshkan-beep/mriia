# Posol — research and state map

Posol sends an envoy to a country: pick a country, pick a service from the dictionary, give it its input, run, and
read what the web looks like from there. The catalog — directions, services, what each returns, the live countries —
is the screen.

## Shape

One tool tab (`envoy`, `needs: ["auth"]`) plus the profile. The tab is a stack of layers on `S.stack` (the reel /
fonoteka idiom: one history entry per level, system Back pops one):

| Stack | Layer | Body |
|---|---|---|
| `[]` | catalog | head row (country chip + counts) over the comb of services; the six directions are the comb's groups |
| `["countries"]` | countries | head row (back + label) over the comb of countries; a tap picks and pops |
| `["svc:<id>"]` | service | rows in flow: what it returns, the country row, the inputs, Run, the readout |
| `["svc:<id>", "countries"]` | countries | the same comb; a tap picks and pops back to the service |

The comb is the core's display (`/_rt/comb.js`), the store's and fonoteka's precedent: items group-major, `groups`
= directions, `top` = the measured head. A cell has two states — itself and itself grown (the bloom). The grown
service cell shows its name and what it returns inside the form (the comb's text atlas, `subtitle`); under it the
store's caption pattern (`.ms-stage`, `pointer-events-none`, its button `pointer-events-auto`) names the direction
and carries the one verb, «Обрати», which opens the service layer. A tap on a cell opens it directly. No sheet,
dialog or pinned island is ever a state of the comb host; the service layer replaces the comb the way the store's
search rows do.

## State map

| State | Stage (body) | Head row | Primary verb | Demotes at 412×430 / 360×340 |
|---|---|---|---|---|
| loading catalog | comb skeleton (`loading`) | country chip shows the remembered code, counts hidden | — | comb pitch shrinks by the core's clamp |
| catalog | comb of services by direction | country chip «Країна · DE Німеччина», counts `38 · 6 · 12` mono | tap a cell | counts drop to one mono line; chip keeps code + name, name truncates |
| cell grown | the grown cell (name + returns inside), others pushed away | same | caption «Обрати» under the form | caption drops the direction line at 360×340 |
| countries | comb of live countries first, then dead ones dimmed (`ink` colour); subtitle `DE · 3 виходи` | back + «Країна» | tap a cell | same |
| country picked | returns to the layer below, chip shows the new country | — | — | — |
| service picked | rows: direction eyebrow + title, what it returns, country row, one growing field per input (`data-line`, `inputmode` by kind, the example as placeholder) | back + direction · title | «Відправити посла» (full width) | rows stack; the button stays full width |
| input invalid | the field's own error line under it (`aria-invalid`) | — | still enabled | — |
| running | readout area: a Scramble skeleton of the title and three rows; the button `aria-busy`, disabled | — | «Посол у дорозі…» | — |
| result ok | readout: exit country + elapsed (mono), page title, excerpt, key/value rows, short lists, per-country blocks | — | «Відправити ще раз» | long values wrap (`break-words`) |
| result failed | readout: the reason (`failed`) in the error colour + whatever data came back | — | «Відправити ще раз» | — |
| no exit (422) | one line: no live exit in that country now + the country row stays tappable | — | «Відправити посла» | — |
| busy (429) | one line: every envoy is out, try in a minute | — | same | — |
| signed out (401 / no session) | the runtime's sign-in wall opens; the readout says sign-in is needed | — | same | — |
| offline / network error | catalog from the last copy kept on the phone (or the fixture on the very first open with no network); a run says there is no connection | — | same | — |
| gate | the fixture catalog (6 directions, 12 services, 5 countries, one dead) and a canned page result; a dead country answers 422, a URL with «blocked» a failed run | — | — | — |

## Data

- `POST ${VPS_PROXY}/posol/catalog {}` → `{ directions, services, countries }`; plain `fetch` through the sealed
  tunnel. Kept on the phone (`persistentAtom`) for the next cold or offline open.
- `POST ${VPS_PROXY}/posol/run { service, country, input }` → `{ service, country, exit_country, ok, data, failed,
  elapsed_ms }`; 400 `{ field }` · 401 · 422 · 429 · 502.
- Every parse, check and fold is in `rt/posol.js` (`catalogOf`, `checkField`, `checkInput`, `liveCountries`,
  `startCountry`, `outcomeOf`, `readout`, `excerptOf`, `combOrder`, `fixtureRun`), tested in `rt/tests/posol_test.js`.
- `data` is service-specific; `readout(data)` renders any of it: `title` + `markdown` (excerpt), `summary`,
  `per_country` (object or array → one block per country), scalars as rows (one nesting level folded into the key),
  arrays as lists of at most 12.

## Precedents read

`apps/store/view.js` (comb + head row + open caption), `apps/fonoteka/view.js` (layers on `S.stack`, `postJson`
through the tunnel, the auth wall), core `comb.d.ts`, `authwall.d.ts`, `gate.d.ts`.
