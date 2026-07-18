# DIFFERENCES — the two C64 realities to know

c64lua gives you the full PICO-8 draw surface, but the Commodore 64 is not a
PICO-8. Two hardware facts shape every c64lua game. Neither can be engineered
away; both are made legible.

## 1. 2:1 fat pixels (160 x 200 native)

c64lua runs the VIC-II in **multicolor bitmap mode**. Each multicolor pixel is
**two display pixels wide** (2:1), so:

- The canvas is **160 x 200** (coordinates 0-159 x 0-199).
- The displayed picture is **320 x 200**: 160 addressable columns, each drawn
  double-wide, plus the hardware border.

Why multicolor over hires (320 x 200, 2 colors/cell)? PICO-8 code is
color-first: 4 colors per cell (multicolor) halves attribute clash versus 2
(hires) and matches PICO-8's chunky look. c64lua offers one mode, no matrix.

### What this means for circles

`circ()`/`circfill()` draw a true circle in **canvas coordinates** — the radius
is a canvas radius — so a `circfill(x, y, r)` is `r` tall but reads **~2:1 wide**
on screen (each x-pixel is double-wide). That's the honest raw behavior, and it's
a deliberate choice: `pset`, `rect`, `circ`, and `spr` all share ONE coordinate
system (the 160 x 200 canvas), so `pset(x,y)` and `circ(x,y,r)` mean the same
`x`. Pre-squashing circle x-extent inside the runtime would make circle
coordinates inconsistent with every other verb and pull in the float library.

**Want a disc that's round on screen?** Halve each horizontal span's x-extent —
an integer, float-free technique. The `hello` example ships a small `disc()`
helper that does exactly this, which is why its smiley reads round:

![hello — a round-on-screen smiley](../examples/hello/screenshot.png)

So: `circfill` gives you an honest canvas circle (2:1 on screen); the `disc`
pattern in `examples/hello/main.lua` gives you a round-on-screen one. Both are a
few lines and neither touches the float library.

## 2. Per-cell attribute clash (the one graphics catch)

The multicolor bitmap is not a free framebuffer. Each **4 x 8-pixel cell**
displays the shared backdrop color plus **3 free colors** (from screen RAM's two
nibbles and color RAM's nibble). That's the C64's famous **attribute clash**.

c64lua's draw layer maintains a **per-cell color allocator**:

- A `pset` in a color that's new to its cell claims a free slot (there are 3).
- A **4th distinct color** in one cell **evicts** to the nearest existing slot —
  the pixel still draws, but in a color already present in that cell.

![attribute clash — 4th color in a cell evicts to nearest](img/attribute-clash.png)

Above: a band of 1-pixel vertical stripes in 15 colors. Where more than 3
distinct colors fall in one 4-pixel-wide cell, the extras collapse to the cell's
existing colors — the authentic C64 look you cannot design away, only design
*around*.

### Designing around it

- Keep a region's palette to **3 colors + backdrop** per 4x8 cell.
- Align color changes to cell boundaries (x multiples of 4, y multiples of 8).
- Use **hardware sprites** for multi-color moving objects — MOBs have their own
  color and don't interact with cell colors at all.

### The dev diagnostic

Build with `--dev` (`-DC64_DEV`) and every eviction **flashes the border red**
for that frame and bumps a `c64_clash_count`. Watch the border while you draw:
a flashing border means a region is over its color budget.

## 3. Performance is a budget, not a given

The C64 is ~1MHz with no blitter — the slowest pixel-pusher in the family. A
full-screen redraw every frame is not a 60fps proposition. See the measured
numbers and the design patterns (static scenes, hardware sprites, partial
redraw, 30fps) in [CHEATSHEET.md](CHEATSHEET.md#performance-model-measured--budget-before-you-promise).
The `plasma` example is a *static* full-screen paint (drawn once) precisely
because a live per-frame plasma would be seconds-per-frame at 1MHz.
