// c64lua-run.mjs - play a .prg/.d64 in a window, zero external emulator install.
//
// Loads the bundled VICE x64 libretro core (romdev-core-vice) and drives a
// minimal frame loop: retro_run each tick, blit the framebuffer to a @kmamal/sdl
// window (integer-scaled, nearest-neighbor so the 2:1 pixels stay crisp), and
// map the keyboard/arrows to the C64 joystick (port 2). This is our small host -
// one core, one window - using the same LibretroHost pattern as gtlua-run.
//
// If @kmamal/sdl isn't installed (headless / unsupported platform), this exits
// with SDL_UNAVAILABLE and the CLI prints a fallback message.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const RETRO_DEVICE_JOYPAD = 1;
const ID = { B: 0, Y: 1, SELECT: 2, START: 3, UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7, A: 8, X: 9 };
const RETRO_PIXEL_FORMAT_XRGB8888 = 1;
const RETRO_PIXEL_FORMAT_RGB565 = 2;

// Arrows drive the joystick; Z = fire; Space maps to the C64 SPACE (btn 5).
function keymap(sdl) {
  const K = sdl.keyboard.SCANCODE;
  return [
    [K.UP, ID.UP], [K.DOWN, ID.DOWN], [K.LEFT, ID.LEFT], [K.RIGHT, ID.RIGHT],
    [K.Z, ID.B], [K.SPACE, ID.A],
  ];
}

export async function runProgram(romPath, opts = {}) {
  if (!existsSync(romPath)) throw new Error(`no such program: ${romPath}`);

  let sdl;
  try {
    sdl = (await import("@kmamal/sdl")).default;
  } catch {
    const err = new Error("SDL_UNAVAILABLE");
    err.code = "SDL_UNAVAILABLE";
    throw err;
  }

  const { core } = await import("romdev-core-vice");
  if (!existsSync(core.jsPath)) throw new Error("romdev-core-vice wasm missing (run: npm install)");
  const factory = (await import(core.jsPath)).default;
  const wasmBinary = readFileSync(core.wasmPath);
  const mod = await factory({ wasmBinary, locateFile: (p) => (p.endsWith(".wasm") ? core.wasmPath : p) });

  let fbWidth = 384, fbHeight = 272, pixelFormat = RETRO_PIXEL_FORMAT_XRGB8888;
  let latestFrame = null;
  const buttons = new Uint8Array(16);

  const envCb = mod.addFunction((cmd, dataPtr) => {
    if (cmd === 10) { pixelFormat = mod.HEAP32[dataPtr >> 2]; return 1; }
    return 0;
  }, "iii");
  mod._retro_set_environment(envCb);
  const videoCb = mod.addFunction((dataPtr, width, height, pitch) => {
    if (dataPtr) latestFrame = { ptr: dataPtr, width, height, pitch };
    fbWidth = width; fbHeight = height;
  }, "viiii");
  mod._retro_set_video_refresh(videoCb);

  let audioQueue = [];
  const audioBatchCb = mod.addFunction((dataPtr, frames) => {
    const n = frames * 2;
    const src = new Int16Array(mod.HEAP16.buffer, dataPtr, n);
    audioQueue.push(Int16Array.from(src));
    return frames;
  }, "iii");
  mod._retro_set_audio_sample_batch(audioBatchCb);
  mod._retro_set_audio_sample(mod.addFunction(() => {}, "vii"));
  mod._retro_set_input_poll(mod.addFunction(() => {}, "v"));
  mod._retro_set_input_state(mod.addFunction((port, device, index, id) =>
    (port === 0 && device === RETRO_DEVICE_JOYPAD && buttons[id]) ? 1 : 0, "iiiii"));

  mod._retro_init();

  const romData = readFileSync(romPath);
  const romPtr = mod._malloc(romData.length);
  mod.HEAPU8.set(romData, romPtr);
  // VICE fopen()s the media path, so stage the file + pass a real path.
  const vpath = "/" + path.basename(romPath);
  try { mod.FS.writeFile(vpath, romData); } catch {}
  const pathPtr = mod._malloc(vpath.length + 1);
  mod.stringToUTF8(vpath, pathPtr, vpath.length + 1);
  const info = mod._malloc(24);
  mod.HEAPU32[(info >> 2) + 0] = pathPtr;
  mod.HEAPU32[(info >> 2) + 1] = romPtr;
  mod.HEAPU32[(info >> 2) + 2] = romData.length;
  mod.HEAPU32[(info >> 2) + 3] = 0;
  if (!mod._retro_load_game(info)) throw new Error("retro_load_game failed");

  const av = mod._malloc(64);
  mod._retro_get_system_av_info(av);
  const dv = new DataView(mod.HEAPU8.buffer, av, 64);
  const fps = dv.getFloat64(24, true) || 50;
  const sampleRate = dv.getFloat64(32, true) || 44100;

  const scale = opts.scale ?? 2;
  const window = sdl.video.createWindow({
    title: opts.title ?? `c64lua - ${path.basename(romPath)}`,
    width: fbWidth * scale, height: fbHeight * scale, resizable: true,
  });
  let audioDev = null;
  try {
    audioDev = sdl.audio.openDevice({ type: "playback" }, { channels: 2, frequency: sampleRate, format: "s16lsb" });
    audioDev.play();
  } catch { /* audio optional */ }

  const km = keymap(sdl);
  const setKeys = (down, scancode) => { for (const [sc, id] of km) if (sc === scancode) buttons[id] = down ? 1 : 0; };
  window.on("keyDown", (e) => setKeys(true, e.scancode));
  window.on("keyUp", (e) => setKeys(false, e.scancode));

  const present = () => {
    if (!latestFrame) return;
    const { ptr, width, height, pitch } = latestFrame;
    const out = Buffer.alloc(width * height * 4);
    if (pixelFormat === RETRO_PIXEL_FORMAT_RGB565) {
      const src = new Uint16Array(mod.HEAP16.buffer, ptr, (pitch / 2) * height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const p = src[y * (pitch / 2) + x], o = (y * width + x) * 4;
        out[o] = ((p >> 11) & 0x1f) << 3; out[o + 1] = ((p >> 5) & 0x3f) << 2; out[o + 2] = (p & 0x1f) << 3; out[o + 3] = 255;
      }
    } else {
      const src = new Uint8Array(mod.HEAPU8.buffer, ptr, pitch * height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const s = y * pitch + x * 4, o = (y * width + x) * 4;
        out[o] = src[s + 2]; out[o + 1] = src[s + 1]; out[o + 2] = src[s]; out[o + 3] = 255;
      }
    }
    const ww = window.width, wh = window.height;
    const mult = Math.max(1, Math.min(Math.floor(ww / width), Math.floor(wh / height)));
    const dw = width * mult, dh = height * mult;
    const dstRect = { x: Math.floor((ww - dw) / 2), y: Math.floor((wh - dh) / 2), width: dw, height: dh };
    window.render(width, height, width * 4, "rgba32", out, { scaling: "nearest", dstRect });
  };

  const frameMs = 1000 / fps;
  let running = true;
  window.on("close", () => { running = false; });
  const cleanup = () => {
    try { mod._retro_unload_game(); mod._retro_deinit(); } catch {}
    try { audioDev && audioDev.close(); } catch {}
    try { !window.destroyed && window.destroy(); } catch {}
  };
  const tick = () => {
    if (!running || window.destroyed) { cleanup(); return; }
    mod._retro_run();
    present();
    if (audioDev && audioQueue.length) {
      for (const chunk of audioQueue) audioDev.enqueue(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      audioQueue = [];
    }
    setTimeout(tick, frameMs);
  };
  tick();
}
