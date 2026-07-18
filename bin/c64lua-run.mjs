// c64lua-run.mjs - play a .prg/.d64 in a window via the shared romdev SDL host.
//
// Thin shim over romdev-core-runner (the one SDL host in the ecosystem). It
// loads the bundled VICE x64 core and maps the keyboard/arrows to the C64
// joystick: arrows = joystick directions, Z = fire (RETRO_B), Space = the
// second action (RETRO_A). romdev-core-host stages the media file into VICE's
// FS internally, so a bytes+name load works even though VICE fopen()s the path.
// If @kmamal/sdl isn't installed the runner throws { code:"SDL_UNAVAILABLE" };
// we re-throw so the CLI can print its fallback message.

import { runRom as runRomInWindow } from "romdev-core-runner";
import * as core from "romdev-core-vice";

// Keyboard -> libretro RetroPad bit (see romdev-core-runner bitToName).
const keyMap = { up: 4, down: 5, left: 6, right: 7, z: 0, space: 8 };
// Gamepad: bottom = fire, right = second action, matching the keys.
const buttonMap = { dpadUp: 4, dpadDown: 5, dpadLeft: 6, dpadRight: 7, a: 0, b: 8, back: 2, guide: 2, start: 3 };

export async function runProgram(romPath, opts = {}) {
  const session = await runRomInWindow(romPath, { core, keyMap, buttonMap, scale: 2, aspect: "fb", ...opts });
  await session.closed;
}
