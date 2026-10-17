# lipka — a photo becomes a model for a 3D printer



catalogue — reachable only at its URL), and it rides `edge/site3d.js`: our own `/feed/image/upscale` (hd, 4×) first,
then Prism 3.1 on 3daistudio.com driven by a pod's browser, ~4 min end to end (measured: 1200² → 4800² → 4096² on
the site → a 45 MB watertight .glb in 245 s). The screen shows the edge's stages: enhancing → preparing → sculpting
N %. Prism's NSFW filter refuses some photos outright — the edge passes its words on and the screen says ePolicy.

## Before: `/feed/mesh` (`microspec-edge` `edge/mesh.js`, 9bad0d6) — no longer called by lipka

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
| `error` | the photo | Go again + the error line (eFailed · eBusy · eRate · eBig · eSignIn · eNetwork) |

A finished mesh while the app is hidden raises a notification (the wait is 30 s to several minutes).
