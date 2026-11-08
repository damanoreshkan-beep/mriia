# fonoteka — a shelf of your own songs: shared in from the phone, streamed back with seeking

Built 2026-10-07. Three repos moved for it: the runtime learned FILE shares, the edge learned to keep and stream
songs, and this app plays them. Every number below was measured or read on the box; UNVERIFIED is at the end.

## Decision log
  of Range. R2/B2 are both free to 10 GB with zero/3× egress and stay the nightly-backup target; Supabase (1 GB),
  Telegram Bot API (getFile ≤ 20 MB, no Range), Drive (OAuth churn) were ruled out.
- **Signed-in only, with a quota**: 300 songs / 3 GB per account, one file ≤ 16 MB (nginx's `client_max_body_size`
  for `/feed`, read live). Upload and stream ride **sealed URLs that carry the session** (6 h, bound to the route) —
  the POST tunnel base64s a JSON body (13 MB of text for a 10 MB song, buffered twice) and an `<audio src>` fetches
  itself with its own `Range`, so neither can ride it.
- **"Keep" from remix and muzak** is server-side: those songs are made on the edge, so a button there asks the edge
  to make the file again into the shelf — nothing leaves the phone.

## Share INTO a PWA (VERIFIED on the primary sources)
- Manifest `share_target` with `method: "POST"`, `enctype: "multipart/form-data"`, `params.files: [{ name, accept }]`.
  **`accept` = MIME types only** (`audio/*`). The spec and MDN allow dotted extensions (`.mp3`) and a third-party
  write-up even advised declaring both — but Chrome copies every entry into the WebAPK's `android:mimeType`
  verbatim (`WebApkShareTargetUtil.java` hands the list straight to `MimeTypeFilter`, no conversion), and that
  field takes `type/subtype` only: "There was a problem parsing the package", Chrome hangs at install or falls
  extensions since 1.2.108. Samsung Internet is a separate failure: its minting server ships an old
  `targetSdkVersion`, Android 14+ shows "Blocked dangerous app" (SamsungInternet/support#123) — install from Chrome.
- The POST is a navigation to `./share-target` that **only the service worker can read**: `event.request.formData()`,
  park the files in a cache, answer `303` to the page so a refresh never re-posts. `sw-core.js shareIn()` does
  this under the `ms-share` cache keyed by scope; `/_rt/share.js takeFiles()` collects and deletes.
- Chrome Android since 76 (2019); **iOS Safari cannot receive shares at all** (WebKit 194593 still NEW, 2026);
  Samsung Internet is Chromium-based but has no first-party table — test on the S25. The app must be installed;
  a changed share target needs a reinstall. File Handling / `launchQueue` is desktop-only.

## Streaming with seeking (VERIFIED: MDN, Chromium media source, measured on the box)
- Chromium sends `Range: bytes=N-` for every media load and every seek past the buffer; the answer must be **206
  with Content-Range** (and `Accept-Ranges: bytes`), or `seekable == buffered`. A 206 is not storable in the Cache
  API; `sw-core.js` already leaves Range requests alone.
- `edge/library.js` streams the slice from an open file (`Deno.open` → `seek` → a byte-limited stream), 416 past the
  end, framing headers kept through core; `remuxArgs` re-muxes the upload with `-c copy -map 0` so a VBR mp3 gets a
  fresh Xing frame (ffmpeg writes it by default: duration + seek table). Unit test: a 1000-byte file answers
  `bytes 100-199/1000` with exactly those bytes.
- nginx `/feed` already has `proxy_buffering off` and passes Range/206 untouched (no proxy_cache).

## The edge contract (edge/library.js)
`POST /feed/library/put?s=` raw body → `{ id, name, title, artist, size, dur, added }` · `GET /feed/library/get?s=`
→ audio/mpeg 200/206 · sealed JSON `list` → `{ songs, count, bytes, maxFiles, maxBytes }`, `del {id}`, `keep {url, v?,
genre?, vocal?}`. Errors are one word the app maps to a sentence: `too large` 413 · `too many songs` / `library full`
409 · `not audio` 415.


The shelf is the core's comb DISPLAY (`/_rt/comb.js`, 1.2.161): every song a cell on one GPU field from the centre
outward — the first song in the middle — its cover (from the file, `rt/id3.js`) or the app's light inside its own
form, the name under it. The machine (`comb.wasm`) owns the lattice, the pan, the snap and the touch; the shader
draws; `view.js` hands it the songs and gets the tap back (`play` / `toggle`, as before). The playing song is LIT
(`MARK.lit`: rim and halo in the app's `#5BC8FF`) and BREATHES: `breatheSong` reads the copy on the phone once into
the bass envelope (core breath.js, 10 Hz) and every frame sends the value at the audio clock to the machine as
`PARAM.pulse` — the lit cell's scale in comb.frag. So the ORB is gone from the tab: the lit cell is the orb.

above the dock (`[data-island][data-player]`); the island publishes `--island-h` and the comb takes it as the
field's bottom inset, so the field fades out above the island and never runs under it. The MiniPlayer is gone (the
next: the lens eases to that cell), and `onSettle` — the cell the lens comes to rest on after a finger moved the
field — plays that song at once (never on load: the machine reports a settle only after a touch). A song without a
cover shows the THEME's material in its form (`--ds-fill`, as the orb did); every colour is the theme's accent.
The lock screen's card follows the song fully — title, artist and cover (core mediasession `meta(title, artist,
artwork)`; the artist used to stay the first song's). Uploads, the usage line, the empty state and the error line
stay in flow at the top. Fallback: without WebGL2 the same cells lay out on the core's CSS lattice (`fk-cell`). The
twin behind the canvas keeps `[data-song][data-cover]` and `[data-play][aria-pressed]`, so the e2e and a screen
reader reach every song.

## The screen
Two panels. **Now playing**: the kit `Transport` (sm) — title/artist, seek bar, prev/next walk the shelf through
`advance()` with repeat "all"; one `Audio` element, `holdAudio` for the lock screen. **Songs**: the shelf readout
core's `.ms-comb`, large: 3 across on a phone, 5 from 30rem): a cell is the song's cover (or the theme's
material) in the song's own form with its name under it, the playing one with a lit rim. A cell is one tap —
play. Everything else is done to the CURRENT song in the player: its `artist · length · size` line is the
Transport's subtitle, and Share and Delete are the Transport's actions; delete goes through the runtime's
history-backed confirm sheet, which names the song (a server-side delete has no undo). Under the gate the
shelf is three fixture songs. Measured on the eye at 384×832: 6 tracks, cell 107px, form 94px, the transport
row 320 of 320px with both actions.

## UNVERIFIED / open
- Samsung Internet delivering a file share (Chromium ≥ 76 base; no first-party statement).
- Whether the APK shell hands in files (`share.incoming` carries text today; `kinds:["audio"]` exists only in the mock).
- A 16 MB cap means a 320 kbps song over ~7 min is refused; chunked upload would lift it without touching nginx.
- The host dir `/home/mrx/edge-library` is created by Docker on first `up` (root-owned, like edge-characters); it is
  in no backup yet — the R2/B2 nightly copy is the next step.
