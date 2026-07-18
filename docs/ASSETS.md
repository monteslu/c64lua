# ASSETS — the c64lua color model & art pipeline

## The 16 C64 hardware colors

A c64lua color IS a C64 hardware index 0-15 (the VIC-II palette, same order the
KERNAL's PEEK/POKE color codes use):

| idx | name | idx | name |
| --- | --- | --- | --- |
| 0 | black | 8 | orange |
| 1 | white | 9 | brown |
| 2 | red | 10 | light red |
| 3 | cyan | 11 | dark grey |
| 4 | purple | 12 | medium grey |
| 5 | green | 13 | light green |
| 6 | blue | 14 | light blue |
| 7 | yellow | 15 | light grey |

Pass any of these directly: `pset(x, y, 14)` is light blue.

## The PICO-8 → C64 mapping (the color bake)

PICO-8 code is color-first: it writes `cls(1)` meaning "dark blue", `pset(x,y,8)`
meaning "red". PICO-8's index order differs from the C64's, so a **static** 0-15
PICO-8 color literal is **baked to the nearest C64 hardware index at compile
time** (the luacretro `colorBake` seam). Both directions in one table:

| P8 | P8 name | → C64 | C64 name |
| --- | --- | --- | --- |
| 0 | black | 0 | black |
| 1 | dark blue | 6 | blue |
| 2 | dark purple | 4 | purple |
| 3 | dark green | 5 | green |
| 4 | brown | 9 | brown |
| 5 | dark grey | 11 | dark grey |
| 6 | light grey | 12 | medium grey |
| 7 | white | 1 | white |
| 8 | red | 2 | red |
| 9 | orange | 8 | orange |
| 10 | yellow | 7 | yellow |
| 11 | green | 5 | green |
| 12 | blue | 14 | light blue |
| 13 | indigo | 4 | purple |
| 14 | pink | 10 | light red |
| 15 | peach | 15 | light grey |

This is the closest color-model kinship to PICO-8 of any console in the family.
Because the C64 has only 16 colors, a couple of P8 indices share a C64 color
(e.g. P8 dark-green and green both map to C64 green). The table lives in
`compiler/c64_palette.js` (`P8_TO_C64`) and is the single source of truth.

**Runtime colors are NOT baked.** A color computed at runtime
(`pset(x, y, some_var)`) is used as a raw C64 index 0-15 — so a game that
computes a P8 index at runtime should compute a C64 index instead, or index the
table itself. Static literals are the common case and are handled for you.

## rgb() quantization

`rgb(r, g, b)` (r/g/b 0-255) resolves to the nearest C64 hardware color at
compile time via redmean perceptual distance against the canonical VICE palette
(`nearestColorIndex` in `compiler/c64_palette.js`). Use it to pick a color by
its RGB rather than guessing the index.

## PNG import

The `compiler/c64_palette.js` `nearestColorIndex()` quantizer is the basis of
the PNG art pipeline: an imported PNG is quantized against the 16 C64 colors,
then packed with the per-cell **3-colors + backdrop** constraint enforced (a
cell that needs more than 3 colors reports the offending cell so you can fix the
art, exactly the NES importer's shape with different constraints). Sprite sheets
follow the family's P8-style convention: 8x8 cells map to MOB data (24x21) and to
the software-blit source. A raw sprite/charset binary can be supplied as-is.

The 2:1 fat-pixel aspect (see [DIFFERENCES.md](DIFFERENCES.md)) means source art
should be authored at **160 x 200** (not 320 x 200) so a source pixel maps to one
addressable canvas pixel.
