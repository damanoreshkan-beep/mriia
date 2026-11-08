# store — the farm's front door

A launcher: one GPU field of honeycomb cells — the whole farm from the centre outward, the apps this phone uses
the app itself.

## The comb display 2026-11-07


**What it is.** The core's `/_rt/comb.js` (1.2.161): a display, not a layout. The lattice, the camera, the inertia,
the snap and every touch live in `comb.wasm` (2.6 KB, hand-written bytes on the machine ABI 1 — no text source);
the pixels in `comb.frag` (one pass: a pixel finds its lattice point, reads the machine's site map for the cell,
projects that cell's tile from the atlas); `comb.js` rasterises every app's form + name into ONE 2048² atlas
(icon.svg clipped by `shapeOf(id)`, Geist 600, two lines) and feeds it as the stage's `cam`. No element per cell.
Measured headless: a machine step 0.3 µs; 95 cells.

**The order.** Index 0 (the centre, under the lens) is the lead: the device's most used app (`usage.js
frequent()`), else `spec.featured[0]`; the other picks on the first ring; newborns next; then the whole farm
category by category, each by its Ukrainian title — like things stand together on the rings, the same field in
both locales. Pitch `clamp(min(W,H)/4.2, 84, 120)` px; the lens grows the centre 15%; a drag pans, a release
flings and settles exactly on a cell; past the edge a rubber band. A tap inside a form opens the app (same
`launch` as before); a moved finger never opens anything.

**What the gate reaches.** The comb renders its `cell(item, i, mode)` twice: visible as the core's `.ms-comb`
lattice where WebGL2 is not (`data-comb="dom"`), and as a visually-hidden twin behind the canvas
(`data-comb="gl"`, `[data-comb-twin] > [data-cell][data-app]`, 95 buttons with names and `data-seen`) — the
keyboard, a screen reader and the e2e reach every app. `data-comb-focus` = the app under the lens;
`data-store-lead` = the centre on this load.

- **Clusters.** Every group is one contiguous territory on the field — the picks in the centre, the newborns, then
  each category — laid by the machine (a group's first cell at the first free site of the spiral, its others at the
  nearest free site to that anchor). The hexagon of every cell is drawn: a hairline edge in the group's colour and
  a breath of its tint inside; the colours are the THEME's poles only — the picks in the accent, the new in the
  secondary, the categories alternating accent · secondary · ink — so the borders read without a rainbow. At the
  overview the group's name lies across its territory (mono caps, the group's colour).
- **Zoom.** Two fingers scale the field about their midpoint; on release it eases to one of three levels — 0.8 the
  OVERVIEW (names hidden, territories and their captions), 1 the default (forms + names, the lens on the centre),
  1.35 the CARDS: the rows unfold (row pitch 0.866·1.3 → 0.866·1.85 pitches) and every cell shows its line — the
  app's slogan where it has one, else the first sentence of its description. The larger cards are the zoom.
- **The hero's slogan and the island.** The app under the lens has the farm's control island above the dock
  (`[data-store-island]`): its group · category, its name, its slogan or first line, and Open. The island publishes
  `--island-h`, which the comb reads as its bottom inset, so the field never runs under it.
- **4K.** Two atlases: icons at the source's own 256 px (16 × 16 tiles in 4096²), so the form at the centre is never
  magnified; names and lines on a separate text atlas sized by the screen (`0.9 × pitch × 1.35 × dpr` per tile,
  4096² where the GPU allows, mipmapped), so the type is crisp at every zoom. On the S25 (480 × 3 dpr) a text tile is
  ~455 px wide for a 112-px pitch.
- **Theme.** The field's colours come from the live custom properties (`--app-accent`, `--color-secondary`,
  `--color-base-content`, `--color-base-200`) resolved to sRGB on every theme change and written to the machine's
  palette; the ground IS the theme's ground. Paper: black forms on paper with gold hex edges (eye 2026-11-08).
  updated keep their dot on the form (accent · secondary). Search rows are unchanged, with the category after the line.

- No hexagon edges: a group is only a breath of its colour over its territory, fading to nothing at the cell's
  border; the comb is a convention, not a hive.
- The form's edge is a FILL, not a clip: Chrome does not anti-alias a clip path, so every form had a stair-stepped
  edge. The picture is drawn on a 2× scratch, the form is filled over it with destination-in, and the scratch is
  scaled into the tile with high-quality smoothing — a soft exact edge; the rim rides it.
- Halos are drawn over the whole screen (the lit and focused cells of the pixel's seven lattice points), never cut
  by a cell's region; the tap's ring already was.
- THE ELASTIC FIELD: far from the lens the picture shows the world a moment ago — the camera's velocity × a lag
  that grows with the distance from the lens (0 → 220 ms over 3.2 pitches, capped at 0.45 pitch) — a per-pixel
  camera offset, continuous, so a drag or a fling stretches the field like cloth and it relaxes as it settles;
  the hit test stays on the true positions. And the light under the finger: the theme's accent, soft, on the
  ground and the forms near the touch while a finger is down.
- The icon atlas uploads every 700 ms while pictures land, then once at the end (the eye's software Chromium
  needs ~6 s for 95 forms at 2×; a phone's GPU canvas is far quicker).

State map (the field):

| State | Hook | What shows | 412×430 / 360×340 |
|---|---|---|---|
| field | `[data-comb="gl"]`, `[data-machine="ready"]`, `canvas[data-stage][data-buf][data-cam]` | the comb from the centre; arrival ring by ring (55 ms a ring, instant under reduced motion / the gate) | one ring / the centre row; the rest by panning |
| focus | `data-comb-focus=<id>` | the cell under the lens: 1.15×, its rim and halo in the app's `fg` colour, its name at full ink | same |
| press | machine `pressIdx` | the form gives 6% | same |
| tap | machine `tapSeq`, `onOpen` | a ring of the app's colour leaves the form (700 ms); the app opens in a new tab | same |
| drag / fling | machine `cam`, `vel` | the field moves against the finger; settles on the nearest cell; a rubber band at the edge | same |
| marks | buf `.a`: 1 new · 2 updated | the dot on the form's shoulder, ringed by the ground | same |
| no WebGL2 / machine failed | `[data-comb="dom"]` | the same cells on the core's CSS lattice, scrolling | reflows |
| search | `data-store-mode="search"` | rows with the line, the category and the Open pill; the comb is unmounted | same |

Eye (dev tree over the local core, VPS Chromium, 2026-11-07): 384×832 dark and paper, 412×430, 360×340, 844×390;
drag → focus moved to `sun`; tap → the bloom; no page errors; the atlas bound within 3 s.

## Honeycomb 2026-11-06 (the CSS lattice — superseded on this screen by the display above; still the fallback)

and small in the groups; the top is personal, with his own measured set as the default.

**The top is personal.** The core keeps a record of opens on the device (`/_rt/usage.js` `frequent()`, core
1.2.157: every app notes its own open under one origin-wide key, a score that halves every 14 days; nothing
leaves the phone). `PICKS` = the device's most used apps, then `spec.featured` for the slots the record does
not fill, six in all. The first pick is the hero; apps born in the last 48 h stand next; the other picks
follow. The large comb shows whole rows only: 5 cells, or 8 when many are born at once. The record is read
once per load, so the order never moves under the thumb. `spec.featured` is the measured default: the farm's
dou 4 on 2, persona 9 on 1, prism 3 on 1).

**The comb.** The lattice is the core's `.ms-comb` (1.2.158): rows of n and n-1 cells, the short row half a
cell in, n by the comb's own width. Small comb: 3 across under 19rem, 4 to 26.5rem, 5 to 32rem, then 6.
Large comb (`.ms-comb-lg`): 3 across, 5 from 30rem. A cell is the app's form (80% of the cell, 84% in the
large comb) with its name under it, two lines at most — every app keeps a visible name, an icon and one tap
(the 2026-09-24 lesson: a launcher never trades findability for atmosphere). The description line and the
Open pill live in the search rows only.

State map (one page, one scroll):

| State | Hook | What shows | Demotes at 412×430 / 360×340 |
|---|---|---|---|
| today | `data-store-mode="today"`, `data-store-used` | head row · hero (`.st-hero`, `[data-hero-orb]`) · large comb (`[data-comb="big"]`, cells `[data-cell="big"][data-featured]`) · Fresh · a small comb per category (`[data-comb="small"]`) | nothing: the page scrolls, the combs keep 3 and 4 across |
| personal lead | hero eyebrow "Often · category" | the device's most used app in the hero; no slogan unless `slogan_<id>` exists | same |
| newborn | `data-newborn="1"`, `data-mark="new"` | the amber dot on the cell's form; the hero eyebrow says when | same |
| new / updated | `data-mark="new"` / `"upd"` | amber / cyan dot on the form, the word in the accessible name | same |
| opened | `data-seen="1"` | no visible change in a cell; the search row's pill becomes a glyph | same |
| pressed | `:active` | the cell's rim lights in the accent | same |
| search | `data-store-mode="search"` | rows with the description line and the Open pill, or the no-results state | same |

Measured on the eye (dev tree, 2026-11-06): 384×832 small comb 8 tracks, cell 88px, form 70px; large comb 6
tracks, cell 117px; 360×340 cell 82 / 109; 412×430 cell 95 / 127; 320×568 both combs 3 across at 96; 768 and
844 wide: small 6 across at 91, large one row of 5 at 109. No element wider than the viewport at any shape.
Page height at 384: 4400px (the rows were 8419px).

## Design refresh 2026-09-04

State map of the main screen (one page, one scroll):

- **today** (`data-store-mode="today"`, `data-store-featured`, `data-store-newborn`): the head row (date
  line + "Today", the search glyph `#search-btn` at its right) · the featured grid (the hero wide, the rest
  tall cards; a newborn carries an amber dot in its eyebrow) · Fresh arrivals (pager, `data-fresh-page`
  counter) · a section per category, rows with a quiet Open pill.
- **search unfolded** (`data-store-search="open"`, `[data-search-open]`): the field takes the head row's
  place — glyph · `#store-filter` focused · `#store-status` mono count · `#search-close`. The open state is
  the runtime's `S.searchOpen`, so system Back folds it (and folding empties the query). Folded, a hidden
  twin `#store-filter` keeps a typed query working and unfolds the field.
- **search** (`data-store-mode="search"`, `data-store-found`): the matching rows, or the no-results empty
  state, under the unfolded field.
- **page** (`data-store-page=<id>`): the app page in the large Sheet — tile + name + the ONE filled Open
  (`btn-primary`) + a ghost Install, the fact strip in a well, captures, description, What's new, Info.
- **row badges**: NEW = amber dot + mono word, UPDATED = cyan dot + mono word (`tag()`); featured = a
  sparkles glyph in the accent.

What changed and why (the audit: zero `--ms-label`, seven hand-picked sizes down to 0.52rem, amber as text 13×):

- The permanent full-width search input over the content (view.js:237–240) is gone — search is folded behind
  an icon in the head row and unfolds in place, the shape rules/invariants.md gives a list tab's header
  search (a tool tab cannot use the runtime's `#search-btn`, so the store draws the same row itself); the
  e2e now types into `#store-filter` and checks the fold.
- ONE label constant `LABEL` = `font-mono text-[length:var(--ms-label)] uppercase tracking-wider
  text-base-content/70` replaces `text-[0.52rem]` (:212, :261), `[0.58rem]` (:134, :189), `[0.62rem]`
  (:294) and the `text-xs` counts (:234, :273, :274, :156). 0.52rem was below the ladder's own floor.
- Amber/cyan are MARKS, never text: `text-secondary` (:112 pill, :153 more, :189/:212/:262 eyebrows, :223
  sparkles) → ink + a dot/glyph in `--app-accent`; `badge-secondary`/`badge-warning` (:106) → mono word with
  a dot; `btn-secondary` Open (:125) → `btn-primary` (ink is the brand); `text-warning` (:138, :156, :304) →
  ink/muted with the USB glyph or a cyan dot as the mark; head.html's life light reads `--app-accent`.
- Surfaces: the fact strip's two hairlines (`border-y border-base-300`) → an `sf-inset` well at
  `--ms-r-in`; capture thumbnails' `ring-1 ring-base-300` → `sf-raised sf-e2` (the lit rim); the device note
  → an inset well. Radii: `rounded-2xl` (search, note) → `--ms-r`; `rounded-[1.1rem]`/`[0.6rem]`/`[0.55rem]`
  inside padded cards → `--ms-r-in` (concentric); the counter's `rounded-md` → a pill.
- Muted: the search glyph `text-base-content/50` → `.text-muted`.
- Kept: the row dividers (`[&>div+div]:border-t`) and the Info list's `border-b` — list separators between
  rows, not a border around a card; `text-base-content/80–85` prose (≥/70 is in the safe band); the fresh
  card's `calc(var(--ms-r)*.8)` (derived from the token, a deliberately smaller card); no skeleton — the
  catalogue is a static import, the only async is the NEW-badge lookup and nothing waits on it.
