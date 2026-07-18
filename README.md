# c64lua

[![npm version](https://img.shields.io/npm/v/c64lua.svg)](https://www.npmjs.com/package/c64lua) [![npm downloads](https://img.shields.io/npm/dm/c64lua.svg)](https://www.npmjs.com/package/c64lua)

Write PICO-8-flavored Lua, get a Commodore 64 `.prg` / `.d64`.

c64lua is the Commodore 64 member of the **luacretro** family of Lua-to-C
console SDKs (alongside gtlua/GameTank, gbalua/Game Boy Advance, mdlua/Genesis).
You write a small PICO-8-shaped Lua game; c64lua **ahead-of-time compiles** it to
C, then to a 6502 `.prg` with the bundled cc65 toolchain, and wraps it into an
autostart `.d64` disk image, the format the new **Commodore 64 Ultimate** hardware
and the homebrew/demo scene load. No interpreter, no VM: your Lua becomes native
6502 machine code. No native compiler or emulator to install, either.

```lua
function _init()
  cls(0)
  circfill(80, 96, 20, 10)     -- a yellow smiley
  circfill(72, 90, 3, 6)
  circfill(88, 90, 3, 6)
  print("hello c64", 58, 140, 7)
end
```

![hello c64](examples/hello/screenshot.png)

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

## Install & build

```sh
npm install
npx c64lua build main.lua -o game.prg --d64 game.d64
```

- `build main.lua -o game.prg` produces the C64 `.prg`.
- `--d64 game.d64` wraps it into an autostart 1541 disk image (the headline
  distributable: `LOAD"*",8,1 : RUN`, and what the C64 Ultimate boots).
- `--dev` enables the attribute-clash border flash + counter diagnostics.
- `--num8` uses 8.8 fixed point (smaller/faster, less range).

The cc65 toolchain (compiler + `c64.lib` + linker config) is bundled as WASM via
`romdev-toolchain-cc65` — zero native tools required. `c64lua run main.lua`
builds and plays it in a window over the bundled VICE core (needs the optional
`@kmamal/sdl`).

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
