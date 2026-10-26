# obrys — a viewer for GLB 3D models

Owner's ask (2026-10-26, /microspec): «створи нову апку gbl viewer». Decisions taken by the owner the same day:
the format is **GLB / glTF 2.0** (not Gerber .gbl); sources — **a file from the phone, the farm's models, a link**;
the first version carries **viewing, AR in the room and a snapshot**; the name is **Обрис / Obrys** (id `obrys`).

## The recipe

- three@0.171 from the page import map, loaded lazily (`import("./scene.js")`) only where `hasWebGL2()` answers —
  blackout's pattern; preflight's canvas stub answers null, so the gate measures the DOM, never a dead GL.
- `GLTFLoader` with every decoder a real-world file asks for: Draco (gstatic 1.5.7, as blackout), Meshopt
  (`three/addons/libs/meshopt_decoder.module.js`), KTX2/Basis (transcoder from jsdelivr, same three version).
- Light: `RoomEnvironment` through `PMREMGenerator` (PBR materials are black without an environment) + one key light;
  `NeutralToneMapping` keeps the file's own colours (ACES shifts them — fine for a game, wrong for a viewer).
- Transparent renderer over the theme's stage; a radial contact shadow and a thin accent ring under the model.
- Framing (`rt/glb.js` `frameBox`): the bounding sphere fitted into the NARROWER field of view — a portrait phone
  is narrow, fitting the vertical field alone cuts the sides. The model is centred on X/Z and stands on y = 0.
- Render on demand: a frame only when the orbit changes, a clip plays or auto-rotate runs (battery).
- The numbers come from the FILE (`readGltf` + `gltfStats`), not from three: they reach the DOM where WebGL does
  not, and per-instance triangles match what the GPU draws. Size in metres comes from the stage's Box3.
- AR = WebXR `immersive-ar` + `hit-test` + `dom-overlay` (Chrome on Android with ARCore). The model follows the
  reticle until the first tap, a tap places/moves it, real glTF scale (metres). The overlay's buttons stop
  `beforexrselect` so a tap on Exit does not also place the model. The action shows only when
  `isSessionSupported("immersive-ar")` is true — the APK's WebView has no `navigator.xr`, so it never sees it.
- Snapshot: render, then `canvas.toBlob` in the same task (the drawing buffer is not preserved) → a PNG with a
  transparent background → `downloadBlob` (works in the shell and the browser).
- The file input carries NO `accept`: Android turns `accept` into MIME types, and `.glb` has none registered on many
  phones, so the picker would grey the files out. The bytes are checked instead (`readGltf`).
- A link the site does not serve with CORS throws in `fetch` → `eCors`, which says what to do (download → open as a
  file). No proxy (farm rule).
- Farm models = `/character/mine` through `rt/genchar.js` `fetchMyChars` (signed-in; the .glb stays on the edge).
  `/feed/mesh` results are in memory for an hour only, so they are not a list to show.
- Gate fixture `assets/sample.glb` — built by `tools/glb/sample.mjs` with glTF-Transform (an amber core, three cyan
  rings, two clips «Orbit» and «Pulse»), 96 KB.

## The state map

| phase | stage | island |
|---|---|---|
| `empty` | the glowing box glyph + «Відкрий 3D-модель» · `.glb · .gltf` | Open file (primary) · My models · Link |
| `loading` | the glyph breathing + «Завантажую N%» / «Читаю файл» + a thin bar | the same three (a new pick replaces the run) |
| `ready` | the model, orbit by finger, auto-rotate until the first touch; the stats chip top-left (triangles · file · size) — a tap opens «Про модель» | Transport: title = name, subtitle = clip; play/pause when the file has clips, prev/next when it has two or more; actions Open another · Snapshot · In your room (AR devices only) · Reset view |
| `ready`, no WebGL | «Цей браузер не малює 3D…»; chip + «Про модель» still work | the same, Snapshot/Reset disabled |
| `error` | the glyph | the three sources + the error line (eFormat · eExternal · eParse · eRead · eCors · eGone · eNetwork) |
| sheet `src` | — | the three sources (from «Відкрити іншу») |
| sheet `mine` | — | skeleton rows → the list (avatar · name) · signed out → Sign in · empty · offline |
| sheet `link` | — | a one-line field (`data-line`, `inputmode=url`) + Download |
| sheet `info` | — | triangles · vertices · meshes · materials · textures · animations · size · file · made in · extensions |
| AR | the camera, the reticle, the model | the overlay: hint + Exit |

At 412×430 / 360×340 `.ms-side` puts the stage beside the island; the Transport demotes its actions past `keep=2`
into its overflow sheet (history-backed `more`).
