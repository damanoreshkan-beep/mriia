# personas — research note

Synthetic customers for Working Backwards discovery: one line about the audience becomes adult people with life
facts; each can be interviewed; a comparison shows quotes and stated prices in Telegram Stars.

## Server paths (all existing routes, all signed-in)

- **People**: `/feed/ai` mode `crowd` (edge `ai-prompts.js`), sent twice in parallel through `/feed/task`
  (`askAI` from `/_rt/ai-core.js`), 4 people each — a "core" half and an "edge / indifferent" half for spread.
  JSON `{people:[{name, age, city, job, money, media, spends, hides, look}]}`; `look` is English for the portrait.
  The prompt forbids wishes, pains and needs: seeding a persona with the product made it parrot the pitch back.
  Minors are dropped twice: the mode's `accept` and `personsOf` (age 18–99).
- **Interview**: `/feed/ai` mode `interview`, a `turns` mode — the dossier is `text`, prepended to the first user
  turn by `askMessages` (edge `ai.js`), last 12 turns kept. Short, colloquial, may be indifferent, never admits
  being an AI; answers in the language of the last question.
- **Portrait**: `/feed/image` through `taskSlides` (`k: 2`, the first picture wins), two portraits at a time,
  downscaled to a 640 px JPEG data URL and kept in IndexedDB (`/_rt/db.js`, collections `personas`,
  `personas-group`).
- **3D**: `/feed/mesh` (Hunyuan3D-2.1, untextured, ~90–105 s, one job per account, no wallet charge) through
  `taskOne`; the `.glb` blob is kept with the person and shown on a Three turntable with a clay material
  (`viewer.js`, loaded only when a model exists). `/feed/character` (textured + rigged) was not used: it is
  charged from the farm wallet per app (`wallet.js CATALOG`) and needs a full-body A-pose picture.

## Price

The price question names Telegram Stars; the first integer of that answer becomes the stated price
(`0` = would not pay). The interview prompt anchors a Star at about 2 US cents.

## Gate

Six fixture people with committed portraits (`assets/p1–6.webp`, generated once with Z-Image-Turbo), one full
interview, fixture replies per question kind.
