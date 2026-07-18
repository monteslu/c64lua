# c64lua cheatsheet

Native resolution: **160 x 200** (VIC-II multicolor bitmap; 2:1 fat pixels
displayed as 320 x 200). Coordinates 0-159 x 0-199. Color is a C64 hardware
index 0-15 (a static PICO-8 color literal is baked to its C64 index at compile
time — see the table below).

## Callbacks

| callback | when |
| --- | --- |
| `_init()` | once at boot (after VIC-II bitmap mode is up) |
| `_update60()` | every frame (60 Hz) |
| `_update()` | every OTHER frame (30 Hz — PICO-8's default) |
| `_draw()` | every frame |

The frame loop reads the joystick, runs your callbacks, then waits for the
raster (line 250) — a reliable per-frame tick with no vblank IRQ.

## Drawing verbs (full P8 set — real framebuffer, no refusals)

| verb | notes |
| --- | --- |
| `cls([c])` | clear the bitmap to color `c` (default 0). See perf below. |
| `pset(x,y,[c])` | set one pixel |
| `pget(x,y)` | read a pixel's color index |
| `line(x0,y0,x1,y1,[c])` | Bresenham line |
| `rect(x0,y0,x1,y1,[c])` | rectangle outline |
| `rectfill(x0,y0,x1,y1,[c])` | filled rectangle (fast byte-run path for aligned spans) |
| `circ(cx,cy,r,[c])` | circle outline (canvas-space radius — reads 2:1 wide, see DIFFERENCES) |
| `circfill(cx,cy,r,[c])` | filled circle |
| `print(s,x,y,[c])` | text via the 3x5 font, 4px advance. `print(n,...)` prints a number. |
| `spr(n,x,y)` | draw entity `n` — entities 0-7 ride hardware MOB sprites |
| `camera([x],[y])` | set a draw offset applied to all verbs |
| `color(c)` | set the current draw color (used when a verb's `c` is omitted) |

## Input (joystick port 2 = player 1)

| call | meaning |
| --- | --- |
| `btn(0)` | left | `btn(1)` right | `btn(2)` up | `btn(3)` down |
| `btn(4)` | fire (the joystick's one button) |
| `btn(5)` | SPACE on real hardware (there is no 2nd joystick button) |
| `btnp(i)` | true only on the frame `i` was newly pressed |

Player 2 is joystick port 1 via `btn(i, 1)`. Over romdev, host port 0 = P1.

## Sound (SID)

| call | meaning |
| --- | --- |
| `sfx(n)` | fire compiled effect `n` (0-7) on SID voice 3, hardware ADSR |

## Math (16.16 fixed point, PICO-8 semantics)

`flr ceil abs sgn min max mid sqrt sin cos atan2 rnd srand t/time` plus the
bitwise function forms `band bor bxor bnot shl shr lshr`. `sin`/`cos` are
turns-based and screen-space-inverted, exactly like PICO-8. Division and modulo
use the runtime fixed helpers (the 6510 has no hardware divide).

## Data structures (roomy — 64KB flat RAM)

- `array(n [,init])` / `array8(n [,init])` — fixed-capacity numeric arrays,
  1-based, `#a` = capacity. `array8` is one byte per element.
- `pool(n)` + `add(pool,{...})` / `del(pool,x)` / `for x in all(pool)` — structs.

## Performance model (MEASURED — budget before you promise)

The C64 is ~1MHz (985 kHz PAL / 1023 kHz NTSC) with VIC-II badline steals:
roughly **17-20k CPU cycles per frame**. There is no blitter. Numbers:

| operation | cost | budget |
| --- | --- | --- |
| **cls** (full 8KB bitmap + screen + color RAM) | **~55k cycles ≈ 2.8 frames (PAL)** | NOT free — a per-frame `cls` alone caps you well under 60fps |
| **pset** (multicolor, per-cell allocator) | ~250-320 cycles | ~60-80 psets/frame at 60fps |
| **rectfill** aligned span | ~1 byte-store per 4 canvas px (+ 1 cell-slot alloc/cell) | a full-screen fill is still multi-frame |
| **hardware sprite** `spr(0..7)` | a handful of register writes | free sub-cell movement, no per-cell cost |

**The runtime is DOUBLE-BUFFERED** (VIC-II bank flip, [DIFFERENCES.md](DIFFERENCES.md)):
you draw into a hidden buffer and it's shown only once the frame is complete.
So clearing and redrawing the whole screen every frame is **correct and
tear-free** — the normal game-engine model. What the double buffer does NOT do
is make a full-screen software redraw *fast*: at ~1MHz with no blitter it just
runs below 60fps. The fix removes TEARING, not the speed ceiling.

**Measured** (VICE, PAL 50Hz): the `plasma` example — a full 160x200 cls +
~100 `rectfill` bands + text, redrawn every frame — runs at **~1.3 fps**
(~30-something host frames per game frame). A lighter full-frame scene like
`hello` (cls + a filled disc + text) lands in the same low-single-digit-fps
range. Every frame you see is a *complete* frame; it just advances slower than
60Hz. That's honest C64 speed.

Design accordingly:

- **Clear + redraw every frame** is fine and tear-free — just know a *full*
  160x200 repaint is low-single-digit fps. Great for menus, title art, slow
  effects, turn-based/puzzle games.
- **Entities** ride the 8 **hardware sprites** (`spr(0..7)`) — they move freely
  over a static or slowly-changing bitmap at zero per-frame draw cost. This is
  how you get 60fps action on a real C64.
- **Partial redraw** — clear and repaint only the dirty region, not the whole
  screen — buys the most headroom when you need a moving software layer.
- **30fps** (`_update` instead of `_update60`) buys roughly double the per-frame
  draw budget.

> Measure your own loop: build with `--bench` and read the game-loop counter the
> runtime bumps each frame, then divide host frames by it. The full-screen `cls`
> alone (8000 bitmap bytes + 1000 screen + 1000 color) is ~55k cycles ≈ several
> frames — the dominant cost of any full repaint. A true 1-frame clear would need
> a stack-sweep (`pha`) trick reaching only stack-addressable RAM; it's a tracked
> v2 lever, not a v1 promise. Published up front rather than discovered in a game.
