// c64lua color model.
//
// The C64 has 16 fixed hardware colors, indices 0-15 (the VIC-II palette, the
// same order the KERNAL's PEEK/POKE color codes use):
//
//   0 black   1 white     2 red        3 cyan
//   4 purple  5 green     6 blue       7 yellow
//   8 orange  9 brown    10 light-red 11 dark-grey
//  12 med-grey 13 light-green 14 light-blue 15 light-grey
//
// A c64lua color literal IS a C64 index 0-15 (unlike GameTank, where a color is
// a raw palette byte). But PICO-8 code is color-FIRST: it writes cls(1) meaning
// "dark blue", pset(x,y,8) meaning "red". PICO-8's index order differs from the
// C64's, so a static 0-15 P8 color is baked to the nearest C64 hardware index at
// compile time via P8_TO_C64 below (the luacretro colorBake seam). rgb(r,g,b)
// quantizes against the canonical VICE palette with the same redmean metric.

// Canonical VICE "colodore"-family C64 palette, index 0-15 -> [r,g,b].
// These are the widely-used measured values; the importer + rgb() quantize
// against them so PNG art and rgb() calls land on the right hardware color.
export const C64_PALETTE = [
  [0x00, 0x00, 0x00], // 0  black
  [0xff, 0xff, 0xff], // 1  white
  [0x81, 0x33, 0x38], // 2  red
  [0x75, 0xce, 0xc8], // 3  cyan
  [0x8e, 0x3c, 0x97], // 4  purple
  [0x56, 0xac, 0x4d], // 5  green
  [0x2e, 0x2c, 0x9b], // 6  blue
  [0xed, 0xf1, 0x71], // 7  yellow
  [0x8e, 0x50, 0x29], // 8  orange
  [0x55, 0x38, 0x00], // 9  brown
  [0xc4, 0x6c, 0x71], // 10 light red
  [0x4a, 0x4a, 0x4a], // 11 dark grey
  [0x7b, 0x7b, 0x7b], // 12 medium grey
  [0xa9, 0xff, 0x9f], // 13 light green
  [0x70, 0x6d, 0xeb], // 14 light blue
  [0xb2, 0xb2, 0xb2], // 15 light grey
];

/**
 * P8 color index 0-15 -> nearest C64 hardware color index 0-15.
 * Curated so the mapping reads well for typical PICO-8 art (the closest
 * color-model kinship to PICO-8 of any target we support). Both directions
 * are documented in docs/ASSETS.md.
 *
 *  P8:  0 black  1 dk-blue 2 dk-purple 3 dk-green 4 brown   5 dk-grey
 *       6 lt-grey 7 white  8 red       9 orange  10 yellow 11 green
 *      12 blue   13 indigo 14 pink    15 peach
 */
export const P8_TO_C64 = [
  0,  // 0  black       -> black
  6,  // 1  dark blue   -> blue
  4,  // 2  dark purple -> purple
  5,  // 3  dark green  -> green
  9,  // 4  brown       -> brown
  11, // 5  dark grey   -> dark grey
  12, // 6  light grey  -> medium grey
  1,  // 7  white       -> white
  2,  // 8  red         -> red
  8,  // 9  orange      -> orange
  7,  // 10 yellow      -> yellow
  5,  // 11 green       -> green
  14, // 12 blue        -> light blue
  4,  // 13 indigo      -> purple
  10, // 14 pink        -> light red
  15, // 15 peach       -> light grey
];

/**
 * Nearest C64 hardware color index (0-15) for an (r,g,b) triple, redmean
 * perceptual distance (same metric family as gtlua's nearestColorByte, just
 * over 16 entries instead of 256). Used by rgb() at compile time and by the
 * PNG importer's quantizer.
 * @param {number} r @param {number} g @param {number} b
 * @returns {number} 0-15
 */
export function nearestColorIndex(r, g, b) {
  r &= 255; g &= 255; b &= 255;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < 16; i++) {
    const p = C64_PALETTE[i];
    const rm = (r + p[0]) >> 1;
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = (((512 + rm) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rm) * db * db) >> 8);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
