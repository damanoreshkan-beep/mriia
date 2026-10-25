# Vassago — the calendar of what is already known (research note)

Owner, 2026-10-25: «потрібно на сервері створити нове апі яке в json через наш feed надасть повну інфу з числами відомими
та фактами» … «це апі назвемо в його честь» … «а ти створи нову апку під це». Vassago (Ars Goetia, the third spirit: a
prince "of a good nature", tells past and future, finds what is hidden) is the figure: **the past is measured, the future
is scheduled or computed — nothing here is a forecast.** The app is the face of `/feed/vassago` (microspec-edge); the
math lives on the edge, the app only lays out what the edge returns (farm rule: math never in an app).

Neighbours, not duplicates: `transit` (a person's natal chart and its transits), `horoscope` (a sign's day), `launches`
(rocket countdowns), `kp` (geomagnetic activity). Vassago puts EVERY vector of known numbers on one timeline of days.

## The vectors (v1 = those with a free, keyless, reliable source today)
sky (astronomy-engine: positions, Moon phases, retrogrades and stations, ingresses, eclipses, transits to a natal —
ETH's genesis 2015-07-30 15:26:13 UTC by default) · calendar (weekdays, month/quarter ends, DST switches) · holidays
(Nager.Date: 204 countries; lunar ones flagged `estimated`) · markets (FOMC, CPI, NFP, Deribit/CME expiries — published
schedules in code) · politics (elections from Wikipedia's electoral calendar; central banks; summits) · crypto (BTC halving
from the block height; Ethereum upgrades) · measured (our backtests: how ETH behaved on each kind of day, with n).
Every event: `{at, type, vector, label, source, certainty: exact | scheduled | estimated}`.

## The state map

| state | stage (top) | island (the list) | primary verb | 412×430 / 360×340 |
|---|---|---|---|---|
| first load | the hero day as a skeleton (shape of the real card, no spinner) | 6 day-row skeletons | — | hero shrinks to one line |
| loaded | **today**: date, Moon phase glyph + %, retrogrades, the day's strongest transit to ETH, the measured odds of a day like this, the countdown to the next big scheduled event | days ahead (60): date + weekday, coloured vector dots, the top 1–2 labels, a certainty mark on estimates | tap a day → its sheet | rows keep date + dots; labels truncate |
| filtered (Segmented: all · sky · markets · politics · holidays · crypto) | unchanged | only days with that vector; a day with none disappears | change filter | segments become icons only (kit Segmented demotes) |
| day sheet | — | Sheet: every event of that day grouped by vector, each with its source and certainty; the measured block (odds, n, p) | close / back | the sheet scrolls inside itself |
| offline / edge error | the last good response (cache), dimmed, with its age | same, dimmed | retry by pull / on focus | — |
| empty filter | — | one line: nothing of this kind in the window | — | — |

Precedents: the hero card and the countdown from `launches`; the planet glyphs and sign math from `transit` / `rt/astro.js`
(the app shows, the edge computes); the Sheet, Segmented, Island from the kit (`ui.js`).

## Not in v1
Forecasts of anything (price, weather, polls, results). The owner's own natal (needs his birth data — a later setting).
Walt funding (needs his OAuth; I read it through the MCP, not the app).
