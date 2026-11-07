# rozriad — research & state map

**What it is.** A field of bits computed on the GPU: one fullscreen quad, every pixel an integer cell whose
word comes from its coordinates, the frame clock and the touch state through bitwise math (`rozriad.frag`,
GLSL ES 3.00 on `/_rt/glstage.js`). Touching the field flips bits at high frequency around the finger
(the radius grows while held) and every press and release sends an energy ring out of the point. Over it a
terminal HUD reads the real numbers of the pixel under the finger. One fit screen, one island (the kernel
bit fluctuations and impulses at the touch · a mono black HUD with the hex address, the shader context and
the memory status · no heavy library.

## The recipe (what the build stands on)

- **The stage is the core's** (`/_rt/glstage.js`, 4 apps before this one). Its uniform contract carries the
  brief without a new channel: `ink = [cx, cy, down, hold]` is the cursor and the hold (u_cursor /
  u_mousedown), `vary = [kernel, energy, pitch, 0]` the global buffer state, `points[8] = [x, y, age,
  strength]` the last eight impulses. `age` is computed in JS at read time (the stage's `time` starts at
  its own mount, so a birth stamp would be on the wrong clock). `preserve` keeps the drawing buffer so the
  HUD can `readPixels` the touched pixel; the view takes the SAME context back with
  `canvas.getContext("webgl2")` (the spec returns the existing context for a repeated type).
- **Bitwise math on the GPU.** GLSL ES 3.00 has `uint`, `^ & | << >>` but NOT `bitCount` (3.10) — the
  population count is a SWAR fold. Three kernels, chosen on the island and named in the HUD as the context:
  XOR (`(x ^ y) + frame`, munching squares) · HASH (pcg of the cell and a slower clock, static) · AND
  (`(x + frame) & y`, the Sierpinski carpet). The word's population count is the cell's brightness
  (squared, so most cells stay dim), its low bit picks the pole: amber or cyan — the farm's pair of light.
- **The touch.** Within the radius (6 cells, growing to 24 over ~3 s of hold) the word is XOR-ed with a
  60 Hz hash masked by proximity: bits flutter hardest under the finger. An impulse is a ring at
  `age × 260 px/s`, fading over 2.5 s; a release after a hold is a stronger one.
- **What the HUD shows is measured, never invented**: `ADDR` = the byte offset of the touched pixel in the
  drawing buffer (`(y·W + x)·4`, device pixels); `PIX` = that pixel's RGBA read back from the GPU; `CTX` =
  the kernel and the GLSL version the context reports; `GPU` = the unmasked renderer
  (`WEBGL_debug_renderer_info`), or the masked one; `FB` = the drawing buffer's size and bytes — the GPU
  memory this page holds; `T` = the stage clock and the measured frame rate. No VRAM percentage exists in
- **Themes.** `env.x` turns the void into paper: the same bits as ink and deep amber/cyan on `#F6F4EE`.
  The HUD is a black terminal in both — that is the brief, and black-on-paper reads as a window into the
  machine.

## State map (fit screen 384×832; demotion at 412×430 and 360×340)

| State | Stage | HUD | Island | Demotes |
|---|---|---|---|---|
| idle (no touch yet) | the kernel's pattern at rest, cursor at centre, hold 0 | ADDR of the centre pixel, PIX of it, CTX, GPU, FB, T | kernel strip, active = stored (xor) | HUD shrinks with `--ms-label`; island fits by the tokens |
| touch down / drag | bits flutter under the finger, radius grows with hold; a ring left at the press | ADDR/PIX follow the finger (readPixels ≤ 15 Hz) | unchanged | same |
| release | a stronger ring from the release point, flutter stops, radius 0 | ADDR/PIX stay at the last point | unchanged | same |
| multi-touch | one ring per finger (8 slots, oldest dropped); the cursor is the primary pointer | primary only | unchanged | same |
| kernel tap | the pattern changes on the next frame | CTX names the new kernel | `aria-pressed` moves | same |
| no WebGL2 | black/paper, nothing drawn | GPU line says none | strip present (it does nothing visible) | the empty state `noGl` + hint centred in the void |
| preflight (linkedom, no GL) | empty canvas | ADDR of the centre, PIX dashes | strip | — |

Precedents: the stage mount and the `data-haswebgl ⇒ data-render` e2e guard from `apps/tide`; the island at
the foot of a fit column and the live `env` object read per frame from `apps/afterdark`.
