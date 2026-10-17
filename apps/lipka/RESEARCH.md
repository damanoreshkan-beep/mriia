# lipka — a photo becomes a model for a 3D printer

Owner's ask (2026-10-17): «дуже просту апку для генерації 3d моделей для 3d принтеру». Decisions taken by
the owner the same day: the input is a **photo** (not text); the output is the **.glb** as it comes — «glb
також підходить. не конвертуй» (no STL conversion); «не треба three js, просто скачати файл» and «максимально
просто» — no 3D preview, no options.

## The capability (`microspec-edge` `edge/mesh.js`, 9bad0d6)

`POST /feed/mesh {image}` → `202 {job}`, ridden as a `/feed/task` route, so the `.glb` is the task's `ready`
file (Range, resumable). Signed-in, one mesh per user. The rows, measured on a pod with the Space's own example
(1204.png): Hunyuan3D-2 `Gen Shape → settle → Transform` → `white_mesh.glb` 8.5 MB in 29 s; Hunyuan3D-2.1 the
same steps, 7.8 MB in 405 s; then TRELLIS.2 and TRELLIS (character's rows). The mesh is untextured — a printer
needs the shape only. There is no cancel on the route: a second start while one runs answers 409 with the
running job, which `/feed/task` then follows — so the app has no Stop key (it would hand the old photo's mesh
to the new one).

## The state map

| phase | stage shows | island |
|---|---|---|
| `empty` | the kit's `Chooser` (upload · camera · last picture) | Go disabled |
| `camera` | the kit's `Camera` | Go disabled |
| `ready` | the photo | New photo · Go («Виліпити») |
| `working` | the photo dimmed + the scan line + «Ліплю · m:ss» (or «Чекаю на GPU» while queued) | Go busy (disabled), New photo disabled |
| `done` | the photo + a «модель готова · N МБ» badge | New photo · Download .glb (the primary key) |
| `error` | the photo | Go again + the error line (eFailed · eBusy · eRate · eBig · eSignIn · eNetwork) |

A finished mesh while the app is hidden raises a notification (the wait is 30 s to several minutes).
