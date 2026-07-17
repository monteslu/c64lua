// c64lua build pipeline - environment-agnostic.
//
// Lua -> C (luacretro c64 seam) -> cc65/ca65/ld65 -> .prg (2-byte load-address
// header). The C64 is a FLAT 64KB target: no banking, no placement ladder - one
// compile of the game + the needed SDK units, then one ld65 link with the
// bitmap linker config. `env` injects every fs/path/tool primitive (see the
// BuildEnv typedef in gtlua's build.js; identical shape here). The node CLI
// (bin/c64lua.js) supplies a node-backed env over the bundled cc65 WASM.
//
// @typedef {object} BuildEnv  (see bin/c64lua.js makeNodeEnv)

import { compile, formatDiagnostics } from "./index.js";
import { peephole } from "./peephole.js";

function fail(msg) { throw new Error(msg); }

function run(env, tool, args) {
  const r = env.runTool(tool, args);
  if (r.error) fail(`${tool}: ${r.error.message}`);
  if (r.status !== 0) {
    if (r.stdout) env.warn(r.stdout);
    if (r.stderr) env.warn(r.stderr);
    fail(`${tool} failed (exit ${r.status})`);
  }
  if (r.stderr) env.warn(r.stderr);
  return r;
}

// SDK units. The .c files always compiled; the .s asm engines assembled.
const SDK_C  = ["c64_api.c", "c64_fixed.c", "c64_math.c"];
const SDK_S  = ["c64_clear.s"];

/**
 * Build a C64 .prg from a Lua entry file.
 * @param {string} entry absolute path to main.lua
 * @param {object} opts  { out, dev, num8 }
 * @param {BuildEnv} env
 * @returns {{prg:string, cBytes:number}}
 */
export function build(entry, opts, env) {
  const SDK = env.sdk;
  const outPrg = opts.out || entry.replace(/\.lua$/, ".prg");
  const workDir = env.dirname(outPrg);
  const name = env.basename(outPrg, ".prg");
  const B = (f) => env.join(workDir, f);

  // 1. Lua -> C
  const src = env.readText(entry);
  const result = compile(src, env.basename(entry), { num8: !!opts.num8 });
  if (!result.ok) fail("compile failed:\n" + formatDiagnostics(result.diagnostics));
  const mainC = B(`${name}.c`);
  env.writeFile(mainC, result.c);

  // 2. compile flags (C64 target, NMOS 6510 = plain 6502)
  const CFLAGS = ["-t", "c64", "-Osr", "--cpu", "6502", "-g", "--static-locals", "-I", SDK];
  if (opts.dev) CFLAGS.push("-DC64_DEV");
  if (opts.num8) CFLAGS.push("-DC64_NUM8");
  if (opts.bench) CFLAGS.push("-DC64_BENCH");
  const AFLAGS = ["--cpu", "6502", "-g"];
  if (env.asminc && env.exists(env.asminc)) AFLAGS.push("-I", env.asminc);

  const cc = (srcFile, dst, extra = []) => {
    run(env, "cc65", [...CFLAGS, ...extra, "-o", dst, srcFile]);
    // peephole pass over the generated .s (same cc65 .s shapes the shared
    // luacretro peephole.js targets)
    try {
      const opt = peephole(env.readText(dst));
      env.writeFile(dst, opt.text);
    } catch { /* peephole is best-effort */ }
  };
  const as = (srcFile, obj) => run(env, "ca65", [...AFLAGS, "-o", obj, srcFile]);

  // 3. compile the game + SDK C units, assemble the asm engines
  const objs = [];
  cc(mainC, B(`${name}.s`));
  as(B(`${name}.s`), B(`${name}.o`));
  objs.push(B(`${name}.o`));

  for (const cfile of SDK_C) {
    const base = cfile.replace(/\.c$/, "");
    cc(env.sdkFile(cfile), B(`${base}.s`));
    as(B(`${base}.s`), B(`${base}.o`));
    objs.push(B(`${base}.o`));
  }
  for (const sfile of SDK_S) {
    const base = sfile.replace(/\.s$/, "");
    as(env.sdkFile(sfile), B(`${base}.o`));
    objs.push(B(`${base}.o`));
  }

  // 4. link with the bitmap linker config -> .prg
  run(env, "ld65", [
    "-C", env.sdkFile("c64_bitmap.cfg"),
    "-o", outPrg,
    "-m", B(`${name}.map`),
    ...objs,
    env.lib,   // c64.lib
  ]);

  env.log(`${outPrg} (${env.size(outPrg)} bytes)`);
  return { prg: outPrg, cBytes: result.c.length };
}
