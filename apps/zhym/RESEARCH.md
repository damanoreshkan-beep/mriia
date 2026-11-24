# Жим — push-up counter on the camera

The phone lies on the floor under the face, front camera up. Each push-up brings the face down onto the lens
and takes it away again; the face shades the camera, so the frame darkens. That darkness is the only signal.
The app counts, times every phase on the page clock to the microsecond, and keeps a grey frame of the
bottom of each rep.

## Signal

- Every camera frame (`requestVideoFrameCallback`, else rAF) is drawn into a 24×24 canvas;
  `rt/zhym.js nearOf` = 1000 / (mean Rec.709 luma + 4). It grows as the frame darkens.
- No face model. MediaPipe Face Landmarker was tried first: on the phone its GPU graph failed on every frame
  (`INVALID_ARGUMENT … Adding Image to stream`, client log 2026-11-24), so nothing was counted.
- Counter: `repStep` — an EMA (α 0.45) over an 8 s window; a rep needs the window's near/far ratio ≥ 1.12,
  enters the bottom at 62 % of the range, completes back under 38 %, starts at the last sample under 25 %,
  lasts ≥ 350 ms. A lit 150 → shaded 60 luma swing is a ratio of 2.4. Proven in `rt/tests/zhym_test.js`.
- Time: rep times are the frame callback's `captureTime` (else `expectedDisplayTime`) on the page clock. The
  clock's real step is measured at start (`tickOf` over 2000 reads) and shown with the measured frame rate.
- Frames: on every new darkest point of a descent the centre square is drawn grey into a 128 px canvas; the
  last one is kept as WebP q0.72 when the rep completes. Shown with the theme's `--color-primary` blended in
  as colour at 35 %.
- Store: `runtime/db.js` collection `zhym`, one record per set `{ day, at, dur, reps: [{ t0, tb, t1, frame }] }`.
  Goal: `persistentAtom("zhym:goal")`.

## State map — tab «Підхід» (fit)

| State | Stage | Centre | Primary verb | 360×340 |
|---|---|---|---|---|
| not primed | CamStage priming screen | — | Enable (kit) | kit |
| camera on, idle | grey tinted picture | count, «Поклади телефон під обличчя», clock | Start | HUD hides |
| running | picture + nearness rail | count grows, clock runs, last rep ↓ ↑ | Finish | tempo hides |
| finished with reps | picture | the set's count and time stay, toast «Збережено: N» | Start | — |
| finished, 0 reps | picture | nothing saved, toast «Повторів не було» | Start | — |

## State map — tab «Журнал» (scroll)

| State | Shows |
|---|---|
| empty | goal panel + «Ще жодного підходу» |
| populated | goal (today / goal, stepper, streak) · records · calendar (dot = reps) · chosen day: one block per set — stats, down/up bars, the matrix of frames |
| rep sheet (`screen = "rep"`) | the frame, start / bottom / end to the microsecond, down / up |
