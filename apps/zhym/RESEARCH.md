# Жим — push-up counter on the face

The phone lies on the floor under the face, front camera up. Each push-up brings the face nearer and takes it
away again; the face's size in the frame is the signal. The app counts, times every phase to the microsecond
of the page clock, and keeps a frame of the face at the bottom of each rep with what the eyes and the
expression were doing.

## Sources

- Face: MediaPipe Face Landmarker through the core's `runtime/face.js` (`@mediapipe/tasks-vision@1.2.3` on
  jsDelivr, float16 model from `storage.googleapis.com/mediapipe-models`). The WebAssembly is 14.7 MB, over
  JSR's 4 MB per-file limit, so the bytes come from the CDN and the service worker caches them
  (`sw-core.js` CDN list carries both origins). 478 landmarks + 52 blendshapes, VIDEO mode, one face.
- Nearness: `scaleOf` = the outer eye corners' distance (landmarks 33, 263) over the frame width.
- Counter: `rt/zhym.js` `repStep` — an EMA (α 0.45) over an 8 s window; a rep needs the window's near/far
  ratio ≥ 1.12, enters the bottom at 62 % of the range, completes back under 38 %, starts at the last sample
  under 25 %, lasts ≥ 350 ms. Frames with no face are skipped. Proven in `rt/tests/zhym_test.js` on
  synthetic sets: clean, noisy (±0.003), slow (2.5 s down), shallow nods (0), dropouts every 5th frame.
- Time: rep times are `requestVideoFrameCallback` metadata (`captureTime`, else `expectedDisplayTime`) in the
  page clock (ms, fractional). The page clock's real step is MEASURED at start (`tickOf` over 2000 reads)
  and shown next to the clock; without cross-origin isolation Chrome coarsens it to 100 µs, so the last two
  of six digits read the step, not noise. The physical event resolution is the frame interval, also
  measured and shown (fps).
- Frames: on every new nearest point of a descent the face box (×1.6, square) is drawn into a 128 px canvas
  with `filter: grayscale(1)`; at rep completion the last one is encoded as WebP q0.72 (~3–5 KB). Stored
  grey; shown with the active theme's `--color-primary` blended in (`mix-blend-mode: color`, 35 %), so the
  tint follows the theme and no colour of the face is kept.
- Store: `runtime/db.js` collection `zhym`, one record per set
  `{ day, at, dur, reps: [{ t0, tb, t1, eyes, gaze, expr, frame }] }`, times relative to the set's start.
  Goal: `persistentAtom("zhym:goal")`, reps per day.

## Precedents

- Camera stage: `apps/pipette` (CamStage `show`, `primeFull`, `data-live` readout, e2e shape).
- Log with calendar, records and a day's detail: `apps/moto/log.js` (`Calendar` marks, `Panel` stats).
- Sheet behind a routed screen: `apps/ether` (`openScreen` / `closeScreen`, `h.back()` test).

## State map — tab «Підхід» (fit)

| State | Stage | Centre | Primary verb | 360×340 |
|---|---|---|---|---|
| not primed | CamStage priming screen | — | Enable (kit) | kit |
| model loading | grey tinted picture | count 0, clock 00:00.000000, line «Готую розпізнавання облич» (Scramble) | Start disabled | HUD hides |
| ready, no face | picture | count, «Поклади телефон під обличчя» | Start | HUD hides |
| ready, face | picture | count, eyes · gaze · expression chips | Start | chips stay, HUD hides |
| running | picture + nearness rail | count grows, clock runs, last rep tempo ↓ ↑ | Stop | tempo hides |
| stopped with reps | picture | the set's count and time stay, toast «Збережено: N» | Start | — |
| stopped, 0 reps | picture | nothing saved, toast «Повторів не було» | Start | — |
| model error | picture | «Не вдалося завантажити розпізнавання» | Retry | — |

## State map — tab «Журнал» (scroll)

| State | Shows |
|---|---|
| empty | the goal panel + «Ще жодного підходу» |
| populated | goal panel (today / goal, stepper, streak) · records · calendar (dot = reps) · chosen day: one row per set — stats, tempo bars, the matrix of frames |
| rep sheet (`screen = "rep"`) | the frame large, t0 / bottom / t1 to the microsecond, down / up, each eye's openness, gaze, expression |
