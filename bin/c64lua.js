#!/usr/bin/env node
// c64lua CLI - compile a .lua game to a Commodore 64 .prg (and optional .d64).
//
//   c64lua build <main.lua> [-o game.prg] [--d64 game.d64] [--dev] [--num8]
//   c64lua run   <main.lua|game.prg>          build + play in a window (VICE core)
//   c64lua c     <main.lua>                    print the generated C (debugging)
//
// Thin NODE adapter over the environment-agnostic build pipeline in
// compiler/build.js: it resolves the cc65 toolchain (bundled WASM by default,
// or native cc65 if present) and builds an `env` of node fs/path primitives.
// The .d64 wrapper is pure JS (writeD64 below) so `c64lua build --d64` needs
// zero native tools and no MCP server.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compile, formatDiagnostics } from "../compiler/index.js";
import { build } from "../compiler/build.js";
import { writeD64 } from "./d64.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SDK = path.join(REPO, "sdk");

// Locate romdev-toolchain-cc65 via Node module resolution, so it works whether
// npm nested it under this SDK or HOISTED it to the consumer's top-level
// node_modules (the flattened-install case a REPO-relative path misses). The
// package exports "./wasm/*" but not "./package.json", so resolve an exported
// file and walk up. Falls back to the REPO-local path for a source checkout.
function cc65PackageDir() {
  try {
    const wasmGlue = fileURLToPath(import.meta.resolve("romdev-toolchain-cc65/wasm/cc65.js"));
    return path.dirname(path.dirname(wasmGlue));
  } catch {
    return path.join(REPO, "node_modules", "romdev-toolchain-cc65");
  }
}

function fail(msg) { console.error(msg); process.exit(1); }

function nativeToolchain(home) {
  return {
    kind: "native",
    cc65: [path.join(home, "bin", "cc65")],
    ca65: [path.join(home, "bin", "ca65")],
    ld65: [path.join(home, "bin", "ld65")],
    lib: path.join(home, "lib", "c64.lib"),
    asminc: path.join(home, "asminc"),
  };
}

function wasmToolchain() {
  const share = path.join(cc65PackageDir(), "share", "cc65");
  return {
    kind: "wasm",
    cc65: ["cc65"], ca65: ["ca65"], ld65: ["ld65"],
    lib: path.join(share, "lib", "c64.lib"),
    asminc: path.join(share, "asminc"),
  };
}

function wasmToolchainInstalled() {
  return existsSync(path.join(cc65PackageDir(), "wasm", "cc65.js"));
}

function findToolchain() {
  const forced = process.env.C64LUA_TOOLCHAIN;
  if (forced === "wasm") {
    if (!wasmToolchainInstalled()) fail("C64LUA_TOOLCHAIN=wasm but romdev-toolchain-cc65 is not installed (run: npm install).");
    return wasmToolchain();
  }
  const findNative = () => {
    const candidates = [];
    if (process.env.C64LUA_CC65_HOME) candidates.push(process.env.C64LUA_CC65_HOME);
    candidates.push(path.join(REPO, "tools", "cc65"));
    for (const home of candidates) {
      if (existsSync(path.join(home, "bin", "cc65"))) return nativeToolchain(home);
    }
    const probe = spawnSync("cc65", ["--version"], { encoding: "utf8" });
    if (probe.status === 0 || probe.status === 1) {
      const tp = spawnSync("cc65", ["--print-target-path"], { encoding: "utf8" });
      const targetPath = (tp.stdout || "").trim();
      const share = targetPath ? path.dirname(targetPath) : null;
      return {
        kind: "native",
        cc65: ["cc65"], ca65: ["ca65"], ld65: ["ld65"],
        lib: share ? path.join(share, "lib", "c64.lib") : "c64.lib",
        asminc: share ? path.join(share, "asminc") : null,
      };
    }
    return null;
  };
  if (forced === "native") {
    const n = findNative();
    if (n) return n;
    fail("C64LUA_TOOLCHAIN=native but no cc65 found (put cc65/ca65/ld65 on PATH).");
  }
  const native = findNative();
  if (native) return native;
  if (wasmToolchainInstalled()) return wasmToolchain();
  fail(
    "No cc65 toolchain found. Either:\n" +
    "  - run `npm install` (uses the bundled cc65 WASM, no native tools needed), or\n" +
    "  - put cc65/ca65/ld65 on your PATH."
  );
}

let toolchainKind = "native";
let _runToolSync = null;
let _closeWorker = null;

function execTool(tool, args) {
  if (toolchainKind === "wasm") return _runToolSync(tool[0], args);
  const [cmd, ...pre] = tool;
  return spawnSync(cmd, [...pre, ...args], { encoding: "utf8" });
}

async function prepareToolchain() {
  const tc = findToolchain();
  toolchainKind = tc.kind;
  if (tc.kind === "wasm" && !_runToolSync) {
    const mod = await import("../compiler/wasm_sync_client.js");
    _runToolSync = mod.runToolSync;
    _closeWorker = mod.closeWorker;
  }
  return tc;
}

function makeNodeEnv(tc, sdkDir) {
  return {
    readFile: (p) => readFileSync(p),
    readText: (p) => readFileSync(p, "utf8"),
    writeFile: (p, x) => writeFileSync(p, x),
    exists: (p) => existsSync(p),
    size: (p) => statSync(p).size,
    mkdirp: (p) => { mkdirSync(p, { recursive: true }); },
    join: (...parts) => path.join(...parts),
    dirname: (p) => path.dirname(p),
    basename: (p, ext) => path.basename(p, ext),
    extname: (p) => path.extname(p),
    sdk: sdkDir,
    sdkFile: (name) => path.join(sdkDir, name),
    runTool: (name, args) => execTool(tc[name], args),
    lib: tc.lib,
    asminc: tc.asminc,
    hash: (bytes) => createHash("sha1").update(bytes).digest("hex"),
    log: (msg) => console.log(msg),
    warn: (msg) => console.error(msg),
    debug: !!process.env.C64LUA_DEBUG,
  };
}

function compileLuaCli(entry, opts = {}) {
  const source = readFileSync(entry, "utf8");
  const result = compile(source, path.basename(entry), opts);
  const warnings = result.diagnostics.filter((d) => d.severity === "warning");
  if (warnings.length) console.error(formatDiagnostics(warnings));
  if (!result.ok) {
    console.error(formatDiagnostics(result.diagnostics.filter((d) => d.severity === "error")));
    process.exit(1);
  }
  return result;
}

async function runBuild(entry, opts) {
  if (!existsSync(entry)) fail(`no such file: ${entry}`);
  const tc = await prepareToolchain();
  const env = makeNodeEnv(tc, SDK);
  const absEntry = path.resolve(entry);
  let res;
  try {
    res = await build(absEntry, { out: opts.outPath, dev: opts.dev, num8: opts.num8 }, env);
  } catch (e) {
    fail(e?.message ?? String(e));
  }
  // optional .d64 wrapping (the headline distributable artifact)
  if (opts.d64Path) {
    const prg = readFileSync(res.prg);
    const label = path.basename(res.prg, ".prg").toUpperCase().slice(0, 16);
    const d64 = writeD64(prg, label);
    writeFileSync(opts.d64Path, d64);
    console.log(`${opts.d64Path} (${d64.length} bytes, autostart .d64)`);
  }
  return res;
}

// ---- arg parsing -------------------------------------------------------------

function parseFlags(rest, flagNames) {
  const out = {};
  const consumed = new Set();
  for (const f of flagNames) {
    const i = rest.indexOf(f.name);
    if (i === -1) continue;
    if (f.value) { out[f.key] = rest[i + 1]; consumed.add(i); consumed.add(i + 1); }
    else { out[f.key] = true; consumed.add(i); }
  }
  const entry = rest.find((a, i) => !consumed.has(i));
  return { entry, ...out };
}

const [, , cmd, ...rest] = process.argv;

if (cmd === "build") {
  const f = parseFlags(rest, [
    { name: "-o", key: "outPath", value: true },
    { name: "--d64", key: "d64Path", value: true },
    { name: "--dev", key: "dev" },
    { name: "--num8", key: "num8" },
  ]);
  if (!f.entry) fail("usage: c64lua build <main.lua> [-o game.prg] [--d64 game.d64] [--dev] [--num8]");
  await runBuild(f.entry, f);
  if (_closeWorker) _closeWorker();
} else if (cmd === "run") {
  const f = parseFlags(rest, [
    { name: "-o", key: "outPath", value: true },
    { name: "--d64", key: "d64Path", value: true },
    { name: "--dev", key: "dev" },
    { name: "--num8", key: "num8" },
  ]);
  if (!f.entry) fail("usage: c64lua run <main.lua|game.prg>");
  let prg;
  if (f.entry.endsWith(".prg")) {
    prg = f.entry;
  } else {
    prg = f.outPath || path.join(path.dirname(path.resolve(f.entry)), path.basename(f.entry, path.extname(f.entry)) + ".prg");
    await runBuild(f.entry, { ...f, outPath: prg });
    if (_closeWorker) _closeWorker();
  }
  try {
    const { runProgram } = await import("./c64lua-run.mjs");
    await runProgram(prg);
  } catch (e) {
    if (e && e.code === "SDL_UNAVAILABLE") {
      fail(
        "Could not open a window (the optional @kmamal/sdl dependency isn't\n" +
        "installed on this platform).\n" +
        `Your program built fine: ${prg}\n` +
        "Load it in a C64 emulator (VICE), or wrap it with --d64 for real hardware."
      );
    }
    fail(`c64lua run: ${e?.message ?? e}`);
  }
} else if (cmd === "c") {
  if (!rest[0]) fail("usage: c64lua c <main.lua>");
  process.stdout.write(compileLuaCli(rest[0]).c);
} else {
  fail(
    "usage: c64lua build <main.lua> [-o game.prg] [--d64 game.d64] [--dev] [--num8]\n" +
    "       c64lua run   <main.lua|game.prg>   build + play in a window (VICE core)\n" +
    "       c64lua c     <main.lua>            print the generated C"
  );
}
