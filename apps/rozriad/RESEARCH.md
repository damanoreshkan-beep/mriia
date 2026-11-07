# rozriad — research & state map

**What it is.** A field of bits that lives in a WebAssembly machine. `rozriad.wat` (hand-written WAT, assembled
by the core's `wat` node) owns a W×H grid of bytes — one word per screen cell — the cursor, the hold, the
energy buffer and the last eight impulses; `step` evolves the grid on an 8 Hz word clock by the active
kernel, flutters the bits under a held finger at the display rate and burns every impulse's ring into the
grid. `rozriad.frag` reads that memory on the GPU (`texelFetch` on `usampler2D buf`, exact bytes) and turns
a word into light. The host is the core's `/_rt/machine.js` (ABI 1); `view.js` picks the kernel and formats
the machine's HUD block. One fit screen, one island (the kernel strip), the profile tab. Born 2026-11-07
from the owner's brief (fullscreen quad · cursor + hold · bit fluctuations and impulses at the touch · a mono
black HUD with the hex address, the shader context, the memory status · no heavy library); the same day
the owner asked for the complexity to live in a binary with JS as a thin layer — and for that to be a
system, because more such apps follow (core 1.2.159: `machine.js`, GlStage `buf`, the `wat` node).

## The recipe (what the build stands on)

- **The machine (`rozriad.wat`, ~2.3 KB of wasm).** Memory map in the file's head: OUT f32[48] at 0, HUD
  i32[16] at 0x100, state, 8 rings at 0x300, the grid at 0x1000 (row 0 = top). Kernels: XOR — the word folds
  its left and upper neighbours in (raster order, already advanced, so the fold flows) and +1 keeps it alive;
  HASH — pcg of the word, its place and the tick, re-rolled every fourth tick (static that holds); AND —
  `((x + tick) & y) ^ (w >> 1)`, the Sierpinski carpet with the old word draining out. The first picture is
  munching squares `(x ^ y) + seed`. Touch: the primary finger is the cursor (viewport fractions); every
  down/up strikes an impulse (0.6; a release after a hold up to 1.0); the flutter XORs a 60 Hz hash masked by
  proximity inside a radius of 6 cells growing to 24 over ~3 s; each ring (36 cells/s, 2.5 s) writes 0xFF on
  its circle every step — a trail the kernel then eats. Measured headless (Deno, 64×139): a held step 70 µs,
  a released step 26 µs, HASH 20 µs, AND 5 µs — a frame has 16 700.
- **What the HUD shows is read from the machine, never invented**: `ADDR` = the linear-memory address of the
  cell under the cursor (`0x1000 + y·W + x`); `WORD` = the byte there, hex and as eight bits; `CTX` = the
  kernel and the GLSL version the context reports; `GPU` = the unmasked renderer; `MEM` = the machine's memory
  (4 pages = 256 KiB) and the drawing buffer's bytes; `T` = the machine's step counter and the fps derived
  from it. WebGL has no VRAM percentage, so none is shown (owner's rule: never claim what we do not keep).
- **GLSL ES 3.00 has `uint` and bitwise ops but no `bitCount` (3.10)** — the population count is a SWAR fold.
  The brightness curve is CUBIC in the population count: a square curve read as a flat grey-teal slab on the
  first eye (2026-11-07).
- **htm folds a template's line breaks** — a `<pre>` cannot carry HUD lines as text; each line is a block.
- **Themes.** `env.x` turns the void into paper: the same bits as ink and deep amber/cyan on `#F6F4EE`. The
  HUD is a black terminal in both — that is the brief, and black-on-paper reads as a window into the machine.

## State map (fit screen 384×832; demotion at 412×430 and 360×340)

| State | Stage (memory → shader) | HUD | Island | Demotes |
|---|---|---|---|---|
| loading | black/paper, nothing drawn (`data-machine="loading"`) | zeros, dashes | kernel strip | — |
| idle | the kernel's evolving grid, cursor at centre, hold 0 | ADDR/WORD of the centre cell, CTX, GPU, MEM, T | strip, active = stored (xor) | HUD shrinks with `--ms-label`; island fits by the tokens |
| touch down / drag | bits flutter in memory under the finger, radius grows; a ring burnt at the press | ADDR/WORD follow the finger (4 Hz) | unchanged | same |
| release | a stronger ring burnt from the release point; flutter stops | ADDR/WORD stay at the last point | unchanged | same |
| multi-touch | every finger strikes a ring (8 slots, oldest dropped); the cursor is the first finger down | primary only | unchanged | same |
| kernel tap | `set(0, k)` — the next word-clock tick evolves by the new rule, the old grid drains through it | CTX names the new kernel | `aria-pressed` moves | same |
| machine failed | nothing drawn; `data-machine="failed"` + `data-err` | zeros | strip | — |
| no WebGL2 | the machine still steps; nothing drawn | HUD reads memory, GPU line «—» | strip | — |

Precedents: the `data-haswebgl ⇒ data-render` e2e guard from `apps/tide`; the island at the foot of a fit
column from `apps/afterdark`; the ABI and the minimal machine in the core's `packages/runtime/tests/machine_test.js`.
