;; rozriad — the bit field as a MACHINE (runtime/machine.js ABI 1). Everything the app knows lives in this
;; linear memory: a W×H grid of bytes (one word per screen cell), the cursor, the hold, the energy buffer and
;; the last eight impulses. `step` evolves the grid on an 8 Hz word clock by the active kernel, flutters the
;; bits under a held finger at the display rate, and burns every impulse's ring into the grid as a trail the
;; kernel then eats. The shader (rozriad.frag) reads the grid as `buf` and the out block as its channels.
;;
;; Memory map (one page = 64 KiB; four pages):
;;   0x0000  OUT   f32[48]  [0..3] ink = cx cy down hold_s · [4..7] vary = kernel energy 0 0 · [8..39] points · [40] count
;;   0x0100  HUD   i32[16]  [0] address of the cell under the cursor · [1] its byte · [2] kernel · [3] energy×1000
;;                          [4] impulses · [5] steps · [6] word-clock ticks · [7] W · [8] H · [9] memory bytes · [10] rings · [11] down
;;   0x0200  STATE          W H SEED KERNEL FRAME CX CY DOWN HOLD ENERGY PULSES ACC PID STEPS TICK
;;   0x0300  RINGS 8×{x y age k} f32
;;   0x0400  SCRATCH  one old row (W ≤ 1024) for the XOR pass
;;   0x1000  GRID  W×H bytes, row 0 = top (the shader's texelFetch y is the DOM's y)
(module
  (memory (export "memory") 4)

  (global $OUT i32 (i32.const 0))
  (global $HUD i32 (i32.const 256))
  (global $GRID i32 (i32.const 4096))
  (global $GRID_MAX i32 (i32.const 258048))        ;; 4 pages − 0x1000
  (global $RINGS i32 (i32.const 768))
  (global $SCRATCH i32 (i32.const 1024))           ;; one old row for the XOR pass: W ≤ 1024 cells (0x400..0x800)
  (global $W_MAX i32 (i32.const 1024))
  (global $RING_MAX i32 (i32.const 8))
  (global $CLOCK_MS f32 (f32.const 125.0))         ;; the word clock: 8 ticks a second
  (global $RING_LIFE f32 (f32.const 2.5))          ;; s
  (global $RING_SPEED f32 (f32.const 36.0))        ;; cells per second (≈ 220 px/s at a 6 px cell)

  ;; state
  (global $W (mut i32) (i32.const 1))
  (global $H (mut i32) (i32.const 1))
  (global $SEED (mut i32) (i32.const 0))
  (global $KERNEL (mut i32) (i32.const 0))
  (global $FRAME (mut i32) (i32.const 0))
  (global $CX (mut f32) (f32.const 0.5))
  (global $CY (mut f32) (f32.const 0.5))
  (global $DOWN (mut i32) (i32.const 0))
  (global $HOLD (mut f32) (f32.const 0.0))        ;; ms
  (global $ENERGY (mut f32) (f32.const 0.0))
  (global $PULSES (mut i32) (i32.const 0))
  (global $ACC (mut f32) (f32.const 0.0))
  (global $PID (mut i32) (i32.const -1))
  (global $STEPS (mut i32) (i32.const 0))
  (global $TICK (mut i32) (i32.const 0))
  (global $NRINGS (mut i32) (i32.const 0))

  ;; ---- ABI constants ----
  (func (export "abi") (result i32) (i32.const 1))
  (func (export "out_ptr") (result i32) (global.get $OUT))
  (func (export "hud_ptr") (result i32) (global.get $HUD))
  (func (export "buf_ptr") (result i32) (global.get $GRID))
  (func (export "buf_w") (result i32) (global.get $W))
  (func (export "buf_h") (result i32) (global.get $H))
  (func (export "buf_ch") (result i32) (i32.const 1))

  ;; ---- bits ----
  ;; pcg output hash — the same mixer the shader used before the memory moved here
  (func $pcg (param $v i32) (result i32) (local $w i32)
    (local.set $v (i32.add (i32.mul (local.get $v) (i32.const 747796405)) (i32.const 2891336453)))
    (local.set $w (i32.mul (i32.xor (i32.shr_u (local.get $v) (i32.add (i32.shr_u (local.get $v) (i32.const 28)) (i32.const 4))) (local.get $v)) (i32.const 277803737)))
    (i32.xor (i32.shr_u (local.get $w) (i32.const 22)) (local.get $w)))
  (func $hash3 (param $x i32) (param $y i32) (param $t i32) (result i32)
    (call $pcg (i32.xor (i32.mul (local.get $x) (i32.const 0x9E3779B1)) (call $pcg (i32.xor (local.get $y) (call $pcg (local.get $t)))))))
  (func $addr (param $x i32) (param $y i32) (result i32)
    (i32.add (global.get $GRID) (i32.add (i32.mul (local.get $y) (global.get $W)) (local.get $x))))
  (func $rotl8 (param $v i32) (result i32)
    (i32.and (i32.or (i32.shl (local.get $v) (i32.const 1)) (i32.shr_u (local.get $v) (i32.const 7))) (i32.const 255)))
  (func $clampi (param $v i32) (param $lo i32) (param $hi i32) (result i32)
    (select (local.get $lo) (select (local.get $hi) (local.get $v) (i32.gt_s (local.get $v) (local.get $hi))) (i32.lt_s (local.get $v) (local.get $lo))))
  (func $fmin (param $a f32) (param $b f32) (result f32) (f32.min (local.get $a) (local.get $b)))

  ;; ---- the word clock: one pass over the grid by the active kernel ----
  (func $evolve (local $x i32) (local $y i32) (local $a i32) (local $w i32) (local $l i32) (local $u i32) (local $k i32) (local $old i32)
    (local.set $k (global.get $KERNEL))
    ;; HASH only re-rolls every fourth tick: static that holds between rolls
    (if (i32.and (i32.eq (local.get $k) (i32.const 1)) (i32.ne (i32.and (global.get $FRAME) (i32.const 3)) (i32.const 0))) (then (return)))
    ;; XOR reads the OLD upper row: the last row is copied to the scratch row before the pass (rows wrap), and each
    ;; row is copied there before it is overwritten. One spark a tick (a 0xFF word at a hashed place) keeps the
    ;; field sprouting when nothing is touched — a gasket grows from every spark.
    (if (i32.eqz (local.get $k)) (then
      (memory.copy (global.get $SCRATCH) (call $addr (i32.const 0) (i32.sub (global.get $H) (i32.const 1))) (global.get $W))
      (i32.store8 (i32.add (global.get $GRID) (i32.rem_u (call $hash3 (global.get $FRAME) (global.get $SEED) (i32.const 77)) (i32.mul (global.get $W) (global.get $H)))) (i32.const 255))))
    (local.set $y (i32.const 0))
    (loop $Y
      (local.set $x (i32.const 0))
      ;; the old value of the cell to the LEFT (wrapping to the row's last cell, still old at x = 0)
      (local.set $old (i32.load8_u (call $addr (i32.sub (global.get $W) (i32.const 1)) (local.get $y))))
      (loop $X
        (local.set $a (call $addr (local.get $x) (local.get $y)))
        (local.set $w (i32.load8_u (local.get $a)))
        (if (i32.eq (local.get $k) (i32.const 0))
          (then ;; XOR: every bit plane is a 2D rule-90 automaton — a cell becomes left ⊕ up (old values), so a burnt
                ;; ring or a fluttered bit unfolds into Sierpinski gaskets and the munching squares keep their folds
            (local.set $l (local.get $old))
            (local.set $u (i32.load8_u (i32.add (global.get $SCRATCH) (local.get $x))))
            (local.set $old (local.get $w))
            (i32.store8 (i32.add (global.get $SCRATCH) (local.get $x)) (local.get $w))
            (local.set $w (i32.xor (local.get $l) (local.get $u))))
          (else (if (i32.eq (local.get $k) (i32.const 1))
            (then ;; HASH: the word is re-rolled from itself, its place and the tick
              (local.set $w (i32.and (call $hash3 (i32.xor (local.get $x) (local.get $w)) (local.get $y) (i32.add (global.get $FRAME) (global.get $SEED))) (i32.const 255))))
            (else ;; AND: the Sierpinski carpet of place and time, with the old word draining out of it
              (local.set $w (i32.and (i32.xor (i32.and (i32.add (local.get $x) (global.get $FRAME)) (local.get $y)) (i32.shr_u (local.get $w) (i32.const 1))) (i32.const 255)))))))
        (i32.store8 (local.get $a) (local.get $w))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br_if $X (i32.lt_u (local.get $x) (global.get $W))))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br_if $Y (i32.lt_u (local.get $y) (global.get $H)))))

  ;; ---- the finger: bits flutter inside a radius that grows with the hold ----
  (func $flutter (local $r f32) (local $cx f32) (local $cy f32) (local $x0 i32) (local $x1 i32) (local $y0 i32) (local $y1 i32)
      (local $x i32) (local $y i32) (local $dx f32) (local $dy f32) (local $d f32) (local $near f32) (local $a i32)
    (local.set $r (f32.add (f32.const 6.0) (call $fmin (f32.const 18.0) (f32.mul (global.get $HOLD) (f32.const 0.008)))))
    (local.set $cx (f32.mul (global.get $CX) (f32.convert_i32_u (global.get $W))))
    (local.set $cy (f32.mul (global.get $CY) (f32.convert_i32_u (global.get $H))))
    (local.set $x0 (call $clampi (i32.trunc_sat_f32_s (f32.sub (local.get $cx) (local.get $r))) (i32.const 0) (i32.sub (global.get $W) (i32.const 1))))
    (local.set $x1 (call $clampi (i32.trunc_sat_f32_s (f32.add (local.get $cx) (local.get $r))) (i32.const 0) (i32.sub (global.get $W) (i32.const 1))))
    (local.set $y0 (call $clampi (i32.trunc_sat_f32_s (f32.sub (local.get $cy) (local.get $r))) (i32.const 0) (i32.sub (global.get $H) (i32.const 1))))
    (local.set $y1 (call $clampi (i32.trunc_sat_f32_s (f32.add (local.get $cy) (local.get $r))) (i32.const 0) (i32.sub (global.get $H) (i32.const 1))))
    (local.set $y (local.get $y0))
    (loop $Y
      (local.set $x (local.get $x0))
      (loop $X
        (local.set $dx (f32.sub (f32.add (f32.convert_i32_u (local.get $x)) (f32.const 0.5)) (local.get $cx)))
        (local.set $dy (f32.sub (f32.add (f32.convert_i32_u (local.get $y)) (f32.const 0.5)) (local.get $cy)))
        (local.set $d (f32.sqrt (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dy) (local.get $dy)))))
        (if (f32.lt (local.get $d) (local.get $r))
          (then
            (local.set $near (f32.sub (f32.const 1.0) (f32.div (local.get $d) (local.get $r))))
            (local.set $a (call $addr (local.get $x) (local.get $y)))
            (i32.store8 (local.get $a) (i32.xor (i32.load8_u (local.get $a))
              (i32.and (call $hash3 (local.get $x) (local.get $y) (global.get $TICK)) (i32.trunc_sat_f32_u (f32.mul (local.get $near) (f32.const 255.0))))))))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br_if $X (i32.le_s (local.get $x) (local.get $x1))))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br_if $Y (i32.le_s (local.get $y) (local.get $y1)))))

  ;; ---- the impulses: every ring burns its circle into the grid (0xFF — the kernel eats the trail) ----
  (func $burn (local $i i32) (local $p i32) (local $rad f32) (local $cx f32) (local $cy f32) (local $x0 i32) (local $x1 i32) (local $y0 i32) (local $y1 i32)
      (local $x i32) (local $y i32) (local $dx f32) (local $dy f32) (local $d2 f32) (local $r2 f32) (local $band f32)
    (local.set $i (i32.const 0))
    (block $done
      (loop $R
        (br_if $done (i32.ge_u (local.get $i) (global.get $NRINGS)))
        (local.set $p (i32.add (global.get $RINGS) (i32.shl (local.get $i) (i32.const 4))))
        (local.set $rad (f32.mul (f32.mul (f32.load offset=8 (local.get $p)) (global.get $RING_SPEED))
                                 (f32.add (f32.const 0.6) (f32.mul (f32.const 0.4) (f32.load offset=12 (local.get $p))))))
        (local.set $cx (f32.mul (f32.load (local.get $p)) (f32.convert_i32_u (global.get $W))))
        (local.set $cy (f32.mul (f32.load offset=4 (local.get $p)) (f32.convert_i32_u (global.get $H))))
        (local.set $x0 (call $clampi (i32.trunc_sat_f32_s (f32.sub (local.get $cx) (local.get $rad))) (i32.const 0) (i32.sub (global.get $W) (i32.const 1))))
        (local.set $x1 (call $clampi (i32.trunc_sat_f32_s (f32.add (local.get $cx) (local.get $rad))) (i32.const 0) (i32.sub (global.get $W) (i32.const 1))))
        (local.set $y0 (call $clampi (i32.trunc_sat_f32_s (f32.sub (local.get $cy) (local.get $rad))) (i32.const 0) (i32.sub (global.get $H) (i32.const 1))))
        (local.set $y1 (call $clampi (i32.trunc_sat_f32_s (f32.add (local.get $cy) (local.get $rad))) (i32.const 0) (i32.sub (global.get $H) (i32.const 1))))
        (local.set $r2 (f32.mul (local.get $rad) (local.get $rad)))
        (local.set $band (f32.mul (local.get $rad) (f32.const 1.6)))   ;; |d² − r²| < 1.6·r  ≈  |d − r| < 0.8 cells
        (local.set $y (local.get $y0))
        (loop $Y
          (local.set $x (local.get $x0))
          (loop $X
            (local.set $dx (f32.sub (f32.add (f32.convert_i32_u (local.get $x)) (f32.const 0.5)) (local.get $cx)))
            (local.set $dy (f32.sub (f32.add (f32.convert_i32_u (local.get $y)) (f32.const 0.5)) (local.get $cy)))
            (local.set $d2 (f32.sub (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dy) (local.get $dy))) (local.get $r2)))
            (if (f32.lt (f32.abs (local.get $d2)) (local.get $band))
              (then ;; a press ring burns 0xFF (low bit set: the cool pole), a strong release ring 0xFE (the warm pole)
                (i32.store8 (call $addr (local.get $x) (local.get $y)) (select (i32.const 254) (i32.const 255) (f32.gt (f32.load offset=12 (local.get $p)) (f32.const 0.8))))))
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br_if $X (i32.le_s (local.get $x) (local.get $x1))))
          (local.set $y (i32.add (local.get $y) (i32.const 1)))
          (br_if $Y (i32.le_s (local.get $y) (local.get $y1))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $R))))

  ;; age the rings by dt and drop the ones past their life (compacting in place)
  (func $age_rings (param $dt f32) (local $i i32) (local $o i32) (local $p i32) (local $q i32) (local $age f32)
    (local.set $i (i32.const 0)) (local.set $o (i32.const 0))
    (block $done
      (loop $L
        (br_if $done (i32.ge_u (local.get $i) (global.get $NRINGS)))
        (local.set $p (i32.add (global.get $RINGS) (i32.shl (local.get $i) (i32.const 4))))
        (local.set $age (f32.add (f32.load offset=8 (local.get $p)) (f32.div (local.get $dt) (f32.const 1000.0))))
        (if (f32.le (local.get $age) (global.get $RING_LIFE))
          (then
            (local.set $q (i32.add (global.get $RINGS) (i32.shl (local.get $o) (i32.const 4))))
            (f32.store (local.get $q) (f32.load (local.get $p)))
            (f32.store offset=4 (local.get $q) (f32.load offset=4 (local.get $p)))
            (f32.store offset=8 (local.get $q) (local.get $age))
            (f32.store offset=12 (local.get $q) (f32.load offset=12 (local.get $p)))
            (local.set $o (i32.add (local.get $o) (i32.const 1)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $L)))
    (global.set $NRINGS (local.get $o)))

  (func $add_ring (param $x f32) (param $y f32) (param $k f32) (local $i i32) (local $p i32)
    ;; full: drop the oldest (slot 0) by shifting the rest down
    (if (i32.ge_u (global.get $NRINGS) (global.get $RING_MAX))
      (then
        (memory.copy (global.get $RINGS) (i32.add (global.get $RINGS) (i32.const 16)) (i32.const 112))
        (global.set $NRINGS (i32.sub (global.get $RING_MAX) (i32.const 1)))))
    (local.set $p (i32.add (global.get $RINGS) (i32.shl (global.get $NRINGS) (i32.const 4))))
    (f32.store (local.get $p) (local.get $x))
    (f32.store offset=4 (local.get $p) (local.get $y))
    (f32.store offset=8 (local.get $p) (f32.const 0.0))
    (f32.store offset=12 (local.get $p) (local.get $k))
    (global.set $NRINGS (i32.add (global.get $NRINGS) (i32.const 1)))
    (global.set $ENERGY (call $fmin (f32.const 3.0) (f32.add (global.get $ENERGY) (local.get $k))))
    (global.set $PULSES (i32.add (global.get $PULSES) (i32.const 1))))

  ;; ---- what the host reads: the out block for the shader, the HUD block for the view ----
  (func $publish (local $i i32) (local $p i32) (local $o i32) (local $cx i32) (local $cy i32) (local $a i32)
    (f32.store (global.get $OUT) (global.get $CX))
    (f32.store offset=4 (global.get $OUT) (global.get $CY))
    (f32.store offset=8 (global.get $OUT) (f32.convert_i32_s (global.get $DOWN)))
    (f32.store offset=12 (global.get $OUT) (f32.div (global.get $HOLD) (f32.const 1000.0)))
    (f32.store offset=16 (global.get $OUT) (f32.convert_i32_s (global.get $KERNEL)))
    (f32.store offset=20 (global.get $OUT) (global.get $ENERGY))
    (f32.store offset=24 (global.get $OUT) (f32.const 0.0))
    (f32.store offset=28 (global.get $OUT) (f32.const 0.0))
    (memory.copy (i32.add (global.get $OUT) (i32.const 32)) (global.get $RINGS) (i32.const 128))
    (f32.store offset=160 (global.get $OUT) (f32.convert_i32_u (global.get $NRINGS)))
    ;; HUD: the cell under the cursor is a real address in this memory
    (local.set $cx (call $clampi (i32.trunc_sat_f32_s (f32.mul (global.get $CX) (f32.convert_i32_u (global.get $W)))) (i32.const 0) (i32.sub (global.get $W) (i32.const 1))))
    (local.set $cy (call $clampi (i32.trunc_sat_f32_s (f32.mul (global.get $CY) (f32.convert_i32_u (global.get $H)))) (i32.const 0) (i32.sub (global.get $H) (i32.const 1))))
    (local.set $a (call $addr (local.get $cx) (local.get $cy)))
    (i32.store (global.get $HUD) (local.get $a))
    (i32.store offset=4 (global.get $HUD) (i32.load8_u (local.get $a)))
    (i32.store offset=8 (global.get $HUD) (global.get $KERNEL))
    (i32.store offset=12 (global.get $HUD) (i32.trunc_sat_f32_s (f32.mul (global.get $ENERGY) (f32.const 1000.0))))
    (i32.store offset=16 (global.get $HUD) (global.get $PULSES))
    (i32.store offset=20 (global.get $HUD) (global.get $STEPS))
    (i32.store offset=24 (global.get $HUD) (global.get $FRAME))
    (i32.store offset=28 (global.get $HUD) (global.get $W))
    (i32.store offset=32 (global.get $HUD) (global.get $H))
    (i32.store offset=36 (global.get $HUD) (i32.shl (memory.size) (i32.const 16)))
    (i32.store offset=40 (global.get $HUD) (global.get $NRINGS))
    (i32.store offset=44 (global.get $HUD) (global.get $DOWN)))

  ;; ---- ABI entry points ----
  (func (export "init") (param $w i32) (param $h i32) (param $seed i32) (result i32) (local $x i32) (local $y i32)
    (if (i32.or (i32.le_s (local.get $w) (i32.const 0)) (i32.le_s (local.get $h) (i32.const 0))) (then (return (i32.const 0))))
    (if (i32.gt_u (i32.mul (local.get $w) (local.get $h)) (global.get $GRID_MAX)) (then (return (i32.const 0))))
    (if (i32.gt_u (local.get $w) (global.get $W_MAX)) (then (return (i32.const 0))))
    (global.set $W (local.get $w)) (global.set $H (local.get $h)) (global.set $SEED (local.get $seed))
    (global.set $FRAME (i32.const 0)) (global.set $DOWN (i32.const 0)) (global.set $HOLD (f32.const 0.0))
    (global.set $ENERGY (f32.const 0.0)) (global.set $PULSES (i32.const 0)) (global.set $ACC (f32.const 0.0))
    (global.set $PID (i32.const -1)) (global.set $STEPS (i32.const 0)) (global.set $TICK (i32.const 0)) (global.set $NRINGS (i32.const 0))
    (global.set $CX (f32.const 0.5)) (global.set $CY (f32.const 0.5))
    ;; the first picture: munching squares, shifted by the seed, with one random word in eight — a pure gradient
    ;; collapses to zero under the XOR rule within a few ticks (measured on the eye 2026-11-07); random words live
    (local.set $y (i32.const 0))
    (loop $Y
      (local.set $x (i32.const 0))
      (loop $X
        (i32.store8 (call $addr (local.get $x) (local.get $y))
          (select (call $hash3 (local.get $x) (local.get $y) (local.get $seed))
                  (i32.add (i32.xor (local.get $x) (local.get $y)) (local.get $seed))
                  (i32.eqz (i32.and (call $hash3 (local.get $y) (local.get $x) (i32.xor (local.get $seed) (i32.const 0x5bd1e995))) (i32.const 7)))))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br_if $X (i32.lt_u (local.get $x) (local.get $w))))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br_if $Y (i32.lt_u (local.get $y) (local.get $h))))
    (call $publish)
    (i32.const 1))

  (func (export "set") (param $i i32) (param $v f32)
    (if (i32.eqz (local.get $i))
      (then (global.set $KERNEL (call $clampi (i32.trunc_sat_f32_s (f32.add (local.get $v) (f32.const 0.5))) (i32.const 0) (i32.const 2))))))

  (func (export "touch") (param $id i32) (param $phase i32) (param $x f32) (param $y f32) (local $mine i32) (local $k f32)
    (local.set $mine (i32.or (i32.eq (local.get $id) (global.get $PID)) (i32.eqz (global.get $DOWN))))
    (if (i32.eqz (local.get $phase))
      (then ;; down: this finger becomes the cursor when none is held; every finger strikes an impulse
        (if (local.get $mine) (then
          (global.set $PID (local.get $id)) (global.set $CX (local.get $x)) (global.set $CY (local.get $y))
          (global.set $DOWN (i32.const 1)) (global.set $HOLD (f32.const 0.0))))
        (call $add_ring (local.get $x) (local.get $y) (f32.const 0.6)))
      (else (if (i32.eq (local.get $phase) (i32.const 1))
        (then (if (i32.and (local.get $mine) (global.get $DOWN)) (then (global.set $CX (local.get $x)) (global.set $CY (local.get $y)))))
        (else (if (i32.eq (local.get $phase) (i32.const 2))
          (then ;; up: the release is the stronger discharge after a hold
            (local.set $k (f32.const 0.6))
            (if (i32.and (local.get $mine) (global.get $DOWN)) (then
              (local.set $k (call $fmin (f32.const 1.0) (f32.add (f32.const 0.6) (f32.mul (global.get $HOLD) (f32.const 0.00025)))))
              (global.set $CX (local.get $x)) (global.set $CY (local.get $y)) (global.set $DOWN (i32.const 0)) (global.set $PID (i32.const -1)) (global.set $HOLD (f32.const 0.0))))
            (call $add_ring (local.get $x) (local.get $y) (local.get $k)))
          (else ;; cancel
            (if (local.get $mine) (then (global.set $DOWN (i32.const 0)) (global.set $PID (i32.const -1)) (global.set $HOLD (f32.const 0.0))))))))))
    (call $publish))

  (func (export "step") (param $dt f32) (param $t f32) (result i32) (local $dirty i32)
    (global.set $STEPS (i32.add (global.get $STEPS) (i32.const 1)))
    (if (global.get $DOWN) (then (global.set $HOLD (f32.add (global.get $HOLD) (local.get $dt)))))
    ;; the energy buffer decays on its own clock (≈ e^(−0.9 t))
    (global.set $ENERGY (f32.max (f32.const 0.0) (f32.sub (global.get $ENERGY) (f32.mul (global.get $ENERGY) (f32.mul (local.get $dt) (f32.const 0.0009))))))
    (call $age_rings (local.get $dt))
    ;; the word clock
    (global.set $ACC (f32.add (global.get $ACC) (local.get $dt)))
    (block $clock
      (loop $C
        (br_if $clock (f32.lt (global.get $ACC) (global.get $CLOCK_MS)))
        (global.set $ACC (f32.sub (global.get $ACC) (global.get $CLOCK_MS)))
        (global.set $FRAME (i32.add (global.get $FRAME) (i32.const 1)))
        (call $evolve)
        (local.set $dirty (i32.const 1))
        (br $C)))
    (if (global.get $DOWN) (then
      (global.set $TICK (i32.add (global.get $TICK) (i32.const 1)))
      (call $flutter)
      (local.set $dirty (i32.const 1))))
    (if (global.get $NRINGS) (then (call $burn) (local.set $dirty (i32.const 1))))
    (call $publish)
    (local.get $dirty)))
