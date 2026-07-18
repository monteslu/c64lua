// c64lua compiler entry - binds c64lua's identity + builtins to the shared
// luacretro front-end. (The compiler itself lives in the luacretro package;
// this SDK owns the C64 builtins + runtime + build pipeline.)

import { compile as core, formatDiagnostics } from "luacretro";
import { BUILTINS, MEMBERS, CALLBACKS, P8_PALETTE } from "./builtins.js";
import { nearestColorIndex } from "./c64_palette.js";

// The Commodore 64 target descriptor (cc65 / VIC-II multicolor bitmap). A real
// framebuffer (full P8 verb set), 16 hardware colors (colorBake). No hardware
// divide and no zero-page ABI: user fns take real C params and fixed mul/div
// are plain cdecl. _update is runtime-paced. Its own SDK owns all of this.
const TARGET = {
  caps: {
    zpFastcall: false, zpUserFn: false, fixedZp: false,
    banked: false, nativeDiv: false, colorBake: true, framebuffer: true,
    prefix: "c64", finalRename: true,
  },
  harness: {
    signature: "void main(void)",
    init: ["c64_init"],
    onAudio: "c64_audio_init", onMusic: "c64_music_init", onFps30: "c64_p8_fps30",
    loopTop: ["c64_update_inputs"], frameEnd: "c64_endframe",
    fps30Style: "runtime", returns: false, includes: ["c64_api.h"],
  },
};

export function compile(source, file = "main.lua", opts = {}) {
  return core(source, file, {
    sdkName: "c64lua",
    builtins: BUILTINS,
    members: MEMBERS,             // null: no gt.* namespace on the C64
    callbacks: CALLBACKS,
    p8Palette: P8_PALETTE,        // the P8 -> C64 hardware-index colorBake table
    nearestColorByte: nearestColorIndex,
    ...opts,
    target: TARGET,   // the SDK OWNS its target - not overridable by callers
  });
}

export { formatDiagnostics };
