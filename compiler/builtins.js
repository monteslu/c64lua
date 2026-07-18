// c64lua builtin functions - the PICO-8 global API surface for the Commodore 64.
//
// The C64 has a real framebuffer (VIC-II multicolor bitmap, 160x200 native),
// so the FULL P8 drawing verb set works with no queue and no vblank budget -
// unlike the NES. There is no gt.* namespace (that's a GameTank escape hatch):
// passing no `members` table makes any `gt.x(...)` call a clear platform error.
//
// The `c` field carries the luacretro schema symbol name (lc_*); the
// luacretro c64 seam rewrites those to c64_* at the call site (cName) and in a
// final pass, so this table stays in the shared shape. Param kinds:
//   coord - pixel coordinate/radius: C int; fixed args floored (>>16)
//   num   - 16.16 number: C long; int args promoted (<<16)
//   int   - small integer (button index, player, sprite id): C int
//   color - a C64 color. A static 0-15 P8 literal is baked to its C64 hardware
//           index at compile time (P8_TO_C64); optional -> -1 (keep current).
// Ret kinds: fixed | int | bool | void | same (polymorphic with args)

export const BUILTINS = {
  // ---- graphics (CPU-rendered into the multicolor bitmap, any time) --------
  cls:      { params: [["color", true]], ret: "void", c: "lc_cls" },
  camera:   { params: [["coord", true], ["coord", true]], ret: "void", c: "lc_camera" },
  color:    { params: [["color", false]], ret: "void", c: "lc_color" },
  pset:     { params: [["coord", false], ["coord", false], ["color", true]], ret: "void", c: "lc_pset" },
  rect:     { params: [["coord", false], ["coord", false], ["coord", false], ["coord", false], ["color", true]], ret: "void", c: "lc_rect" },
  rectfill: { params: [["coord", false], ["coord", false], ["coord", false], ["coord", false], ["color", true]], ret: "void", c: "lc_rectfill" },
  circ:     { params: [["coord", false], ["coord", false], ["coord", false], ["color", true]], ret: "void", c: "lc_circ" },
  circfill: { params: [["coord", false], ["coord", false], ["coord", false], ["color", true]], ret: "void", c: "lc_circfill" },
  line:     { params: [["coord", false], ["coord", false], ["coord", false], ["coord", false], ["color", true]], ret: "void", c: "lc_line" },
  pget:     { params: [["coord", false], ["coord", false]], ret: "int", c: "lc_pget" },
  // spr(n, x, y, [w], [h], [flip_x], [flip_y]): entities 0-7 ride hardware MOB
  // sprites (fast, free sub-cell movement); entities 8+ fall back to a software
  // blit into the bitmap. See docs/DIFFERENCES.md.
  spr:      { params: [["int", false], ["coord", false], ["coord", false], ["int", true], ["int", true], ["flip", true], ["flip", true]], ret: "void", c: "lc_spr" },
  print: { params: [], ret: "int", special: "print" },

  // ---- input (joystick port 2 = P1; btn(5) = SPACE on real hardware) -------
  btn:      { params: [["int", false], ["int", true]], ret: "bool", c: "lc_btn" },
  btnp:     { params: [["int", false], ["int", true]], ret: "bool", c: "lc_btnp" },

  // ---- sound (SID; hardware ADSR envelopes) --------------------------------
  // sfx(n, [ch]) fires compiled effect n on a SID voice; `audio` links the
  // SID driver at build time.
  sfx:   { params: [["int", false], ["int", true]], ret: "void", c: "lc_sfx", audio: true },

  // ---- math (16.16 fixed point, PICO-8 semantics) --------------------------
  flr:   { params: [["num", false]], ret: "int", c: null, special: "flr" },
  ceil:  { params: [["num", false]], ret: "int", c: null, special: "ceil" },
  abs:   { params: [["num", false]], ret: "same", c: null, special: "abs" },
  sgn:   { params: [["num", false]], ret: "int", c: null, special: "sgn" },
  min:   { params: [["num", false], ["num", true]], ret: "same", c: null, special: "min" },
  max:   { params: [["num", false], ["num", true]], ret: "same", c: null, special: "max" },
  mid:   { params: [["num", false], ["num", false], ["num", false]], ret: "same", c: null, special: "mid" },
  sqrt:  { params: [["num", false]], ret: "fixed", c: "lc_fsqrt" },
  sin:   { params: [["num", false]], ret: "fixed", c: "lc_fsin" },
  cos:   { params: [["num", false]], ret: "fixed", c: "lc_fcos" },
  atan2: { params: [["num", false], ["num", false]], ret: "fixed", c: "lc_fatan2" },

  band:  { params: [["num", false], ["num", false]], ret: "same", c: null, special: "bitop", op: "&" },
  bor:   { params: [["num", false], ["num", false]], ret: "same", c: null, special: "bitop", op: "|" },
  bxor:  { params: [["num", false], ["num", false]], ret: "same", c: null, special: "bitop", op: "^^" },
  bnot:  { params: [["num", false]], ret: "same", c: null, special: "bitop", op: "~" },
  shl:   { params: [["num", false], ["num", false]], ret: "same", c: null, special: "bitop", op: "<<" },
  shr:   { params: [["num", false], ["num", false]], ret: "same", c: null, special: "bitop", op: ">>" },
  lshr:  { params: [["num", false], ["num", false]], ret: "same", c: null, special: "bitop", op: ">>>" },
  rnd:   { params: [["num", true]], ret: "fixed", c: "lc_rnd" },
  srand: { params: [["num", false]], ret: "void", c: "lc_srand" },
  t:     { params: [], ret: "fixed", c: "lc_time", isValue: false },
  time:  { params: [], ret: "fixed", c: "lc_time" },

  // ---- data structures (roomy on the C64's 64KB flat RAM) ------------------
  array:  { params: [["int", false], ["num", true]], ret: "array", special: "array" },
  array8: { params: [["int", false], ["num", true]], ret: "array", special: "array" },
  pool:   { params: [["int", false]], ret: "pool", special: "pool" },
  add:    { params: [], ret: "void", special: "add" },
  del:    { params: [], ret: "void", special: "del" },
};

// C64 has no gt.* extras: pass NO members table so `gt.foo(...)` is rejected
// with the shared platform message ("...isn't available on this platform").
export const MEMBERS = null;

export const CALLBACKS = ["_init", "_update", "_update60", "_draw"];

// PICO-8 color index 0-15 -> C64 hardware color index 0-15 (the colorBake seam).
export { P8_TO_C64 as P8_PALETTE } from "./c64_palette.js";
