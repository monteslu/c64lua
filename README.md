# c64lua

[![npm version](https://img.shields.io/npm/v/c64lua.svg)](https://www.npmjs.com/package/c64lua)

Write PICO-8-flavored Lua, get a Commodore 64 `.prg` / `.d64`.

c64lua is the Commodore 64 member of the **luacretro** family of Lua-to-C
console SDKs (alongside gtlua/GameTank, gbalua/Game Boy Advance, mdlua/Genesis).
You write a small PICO-8-shaped Lua game; c64lua **ahead-of-time compiles** it to
C, then to a 6502 `.prg` with the bundled cc65 toolchain, and wraps it into an
autostart `.d64` disk image, the format the new **Commodore 64 Ultimate** hardware
and the homebrew/demo scene load. No interpreter, no VM: your Lua becomes native
6502 machine code. No native compiler or emulator to install, either.

## Your first game

This is a complete C64 game. No assets, no boilerplate - one `main.lua`.
`_draw()` runs every frame and clears + redraws the whole scene - the normal
game-engine model. The runtime is **double-buffered** (you draw into a hidden
buffer that's shown only once it's complete), so a full-screen redraw every
frame is correct and tear-free. A full 160x200 cls+redraw runs *below* 60fps at
~1 MHz - that's honest C64 speed, not tearing (see the perf model in
[docs/CHEATSHEET.md](docs/CHEATSHEET.md)):

```lua
function _draw()                  -- runs every frame: clear + redraw
  cls(0)                          -- black background
  circfill(80, 96, 22, 10)        -- head: a yellow circle
  circfill(74, 90, 3, 0)          -- left eye: black
  circfill(86, 90, 3, 0)          -- right eye
  circ(80, 100, 12, 0)            -- mouth: a black arc
  print("hello c64", 58, 132, 7)  -- white text
end
```

Build it and play it in a window:

```sh
npx c64lua run examples/hello/main.lua
```

<p align="center">
  <img src="https://raw.githubusercontent.com/monteslu/c64lua/main/examples/hello/screenshot.png" width="480" alt="hello c64: a yellow smiley face on a black screen">
</p>

Or build the distributable - a `.prg` and an autostart `.d64` disk image:

```sh
npx c64lua build examples/hello/main.lua -o hello.prg --d64 hello.d64
```

That's the whole loop: write `main.lua`, `run` it, ship the `.d64`. Load the
disk on a real C64 (or the Ultimate) with `LOAD"*",8,1 : RUN`.

> **One C64 wrinkle:** the multicolor pixel is 2:1 (double-wide), so a plain
> `circfill` reads a touch wide on screen. The shipped `examples/hello/main.lua`
> adds a tiny integer-only `disc()` helper (halve each span's x-extent) so the
> smiley in the screenshot above is perfectly round - see
> [docs/DIFFERENCES.md](docs/DIFFERENCES.md) for the fat-pixel details.

## Why the C64

Unlike the NES, the C64 has a **real framebuffer**: video memory is plain RAM the
CPU can write at any time (VIC-II multicolor bitmap mode). So the **full P8 draw
verb set works** with no queue, no vblank budget, and no refusals:
`cls/pset/line/rect/rectfill/circ/circfill/print/spr/pget`. Its 16 fixed
hardware colors are the closest color-model kinship to PICO-8 of any console in
the family, and SID gives great-sounding sfx for very little driver code.

The honest cost: the C64 is ~1MHz with no blitter. It is the slowest
pixel-pusher in the family. c64lua games *look* like PICO-8 games but *budget*
like C64 games — see the perf model in [docs/CHEATSHEET.md](docs/CHEATSHEET.md)
and the platform realities in [docs/DIFFERENCES.md](docs/DIFFERENCES.md).

## Native resolution

- Hardware: **VIC-II multicolor bitmap mode, 160 x 200 native** — each
  multicolor pixel is 2:1 (double-wide), so the displayed picture is 320 x 200
  with 160 addressable columns, plus the hardware border.
- c64lua's canvas is **160 x 200**, coordinates 0-159 x 0-199.
- Screenshots in this repo are integer-scaled (2x = 640 x 400) captures of the
  real emulator output, never resampled.

## Build options & requirements

Start your own game by copying an example, then build with these flags:

```sh
npx c64lua build mygame/main.lua -o game.prg --d64 game.d64
# --dev     attribute-clash border flash + counter diagnostics
# --num8    8.8 fixed point (smaller/faster math, less range)
```

- `-o game.prg` produces the C64 `.prg`; `--d64 game.d64` also wraps it into an
  autostart 1541 disk image (`LOAD"*",8,1 : RUN`, the format the C64 Ultimate
  and the demo scene load).
- `npx c64lua run mygame/main.lua` builds and plays it in a window over the
  bundled VICE core (needs the optional `@kmamal/sdl`, pulled by `npm install`).

**Requirements:** [Node.js](https://nodejs.org/) **24+**, and nothing else -
`npm install` brings the cc65 toolchain (compiler + `c64.lib` + linker config)
as WebAssembly via `romdev-toolchain-cc65`. No native compiler, no VICE install.

## The Lua dialect

c64lua speaks the same PICO-8-flavored subset as the rest of the luacretro
family (the shared front-end compiles it): 16.16 fixed-point numbers with
PICO-8 semantics, `_init/_update/_update60/_draw` callbacks, `local`-only
top-level declarations, structs via `pool()`, flat arrays via `array()`,
integer-typed locals inferred automatically. See
[docs/CHEATSHEET.md](docs/CHEATSHEET.md) for the full verb list and
[docs/ASSETS.md](docs/ASSETS.md) for the color model + art pipeline.

## Examples

| example | what it shows |
| --- | --- |
| [hello](examples/hello/) | centered smiley + text (the "it works" cart) |
| [pad-square](examples/pad-square/) | joystick + a hardware MOB sprite |
| [mathcheck](examples/mathcheck/) | fixed-point conformance (shared family goldens) |
| [plasma](examples/plasma/) | the framebuffer flex — full-screen CPU rendering |

## Docs

- [CHEATSHEET.md](docs/CHEATSHEET.md) — every verb, the color table, the perf model.
- [DIFFERENCES.md](docs/DIFFERENCES.md) — 2:1 fat pixels + per-cell attribute clash, honestly.
- [ASSETS.md](docs/ASSETS.md) — the P8↔C64 color mapping + PNG import.

## License

MIT. No AI attribution. See [LICENSE](LICENSE).
