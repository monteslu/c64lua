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

**The honest framing:** a full-screen redraw every frame is not a 60fps
proposition on a 1MHz CPU with no blitter. Design accordingly:

- **Static scenes** (menus, title art, this repo's `hello`/`plasma`/`mathcheck`)
  draw once in `_init` and simply persist — the bitmap is RAM, it stays.
- **Entities** ride the 8 **hardware sprites** (`spr(0..7)`) — they move freely
  over a static or slowly-changing bitmap at zero per-frame draw cost.
- **Partial redraw** — clear and repaint only the dirty region, not the whole
  screen.
- **30fps** (`_update` instead of `_update60`) buys roughly double the per-frame
  draw budget.

> Why `cls` isn't 1-frame: clearing 8000 bitmap bytes at ~5 cycles/byte is
> ~40k cycles ≈ 2 frames on its own — the theoretical floor for a straightforward
> clear. A true 1-frame clear needs the stack-sweep (`pha`) trick, which only
> reaches stack-addressable RAM; it's a tracked v2 lever, not a v1 promise. This
> is measured and published up front rather than discovered in a game.
