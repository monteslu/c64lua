// c64lua compiler entry - binds c64lua's identity + builtins to the shared
// luacretro front-end. (The compiler itself lives in the luacretro package;
// this SDK owns the C64 builtins + runtime + build pipeline.)

import { compile as core, formatDiagnostics } from "luacretro";
import { BUILTINS, MEMBERS, CALLBACKS, P8_PALETTE } from "./builtins.js";
import { nearestColorIndex } from "./c64_palette.js";

export function compile(source, file = "main.lua", opts = {}) {
  return core(source, file, {
    target: "c64",
    sdkName: "c64lua",
    builtins: BUILTINS,
    members: MEMBERS,             // null: no gt.* namespace on the C64
    callbacks: CALLBACKS,
    p8Palette: P8_PALETTE,        // the P8 -> C64 hardware-index colorBake table
    nearestColorByte: nearestColorIndex,
    ...opts,
  });
}

export { formatDiagnostics };
