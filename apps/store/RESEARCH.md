# store — the farm's front door

A launcher: Today (the hero, then the large comb), Fresh arrivals (a pager of three-card slides), then every
category as a small comb with all its apps; a search filters the one page in place into rows; a tap opens the
app itself.

## Honeycomb 2026-11-06

Owner: the top apps were stale, the top becomes the apps he uses; the grid becomes a honeycomb, large on top
and small in the groups; the top is personal, with his own measured set as the default.

**The top is personal.** The core keeps a record of opens on the device (`/_rt/usage.js` `frequent()`, core
1.2.157: every app notes its own open under one origin-wide key, a score that halves every 14 days; nothing
leaves the phone). `PICKS` = the device's most used apps, then `spec.featured` for the slots the record does
not fill, six in all. The first pick is the hero; apps born in the last 48 h stand next; the other picks
follow. The large comb shows whole rows only: 5 cells, or 8 when many are born at once. The record is read
once per load, so the order never moves under the thumb. `spec.featured` is the measured default: the farm's
`use` census for the owner's phone over 30 days (fonoteka 275 rows on 16 days, reel 103 on 8, remix 6 on 6,
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
