// golden-c.mjs - snapshot compile() C output for every example + synthetic
// fixtures, so a change to the shared luacretro front-end (or the c64 seam) is
// caught byte-for-byte (Gate A).
//
//   node test/golden-c.mjs snapshot   -> writes test/golden-fixtures/<name>.c
//   node test/golden-c.mjs check       -> recompiles, diffs against snapshots
//
// c64lua's compile() (target:"c64") is the source of truth. Deterministic: no
// dates, no randomness, sorted keys.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "../compiler/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GOLD = path.join(__dirname, "golden-fixtures");
const EX = path.join(ROOT, "examples");

const OPTS = {};                 // c64lua default (16.16 fixed)
const NUM8_OPTS = { num8: true };

// Synthetic Lua fixtures: exercise codegen branches the examples miss.
const SYNTH = {
  "synth-fixedmath": `local x=0.0\nfunction _update() x+=0.5 x*=1.5 x=x/3 x%=2 end\nfunction _draw() end`,
  "synth-shapes": `function _draw() cls(1) rectfill(4,4,20,20,8) circfill(64,64,10,10) line(0,0,159,199,7) spr(0,10,10) print("hi",4,4,7) end`,
  "synth-fornum": `function _update() for i=0,255 do end for j=1,10,2 do end end\nfunction _draw() end`,
  "synth-array": `local a=array(16)\nlocal b=array8(8)\nfunction _update() a[1]=5 b[1]=2 end\nfunction _draw() end`,
  "synth-func": `function helper(x,y) return x+y end\nfunction _update() local z=helper(1,2) end\nfunction _draw() end`,
  "synth-minmax": `function _update() local a=min(1,2) local b=max(3,4) local c=mid(1,2,3) local d=abs(-5) end\nfunction _draw() end`,
  "synth-btn": `function _update() if btn(0) then end if btnp(4) then end end\nfunction _draw() end`,
  "synth-trig": `function _update() local a=sin(0.25) local b=cos(0.5) local c=atan2(1,2) local d=sqrt(9) end\nfunction _draw() end`,
};

function snippetFile(name) { return path.join(GOLD, name + ".c"); }

function compileEntry(entry, opts) {
  const src = readFileSync(entry, "utf8");
  const r = compile(src, path.basename(entry), opts);
  if (!r.ok) {
    const errs = (r.diagnostics || []).filter((d) => d.severity === "error");
    throw new Error(`compile failed for ${entry}:\n` + errs.map((d) => `${d.line}:${d.col} ${d.message}`).join("\n"));
  }
  return r.c;
}

function compileSource(src, opts, name) {
  const r = compile(src, name + ".lua", opts);
  if (!r.ok) throw new Error(`synth ${name} failed: ` + (r.diagnostics || []).map((d) => d.message).join("; "));
  return r.c;
}

function collect() {
  const out = {};
  for (const dir of readdirSync(EX).sort()) {
    const entry = path.join(EX, dir, "main.lua");
    if (!existsSync(entry)) continue;
    out[`ex-${dir}`] = compileEntry(entry, OPTS);
  }
  for (const [name, src] of Object.entries(SYNTH)) out[name] = compileSource(src, OPTS, name);
  out["synth-fixedmath-num8"] = compileSource(SYNTH["synth-fixedmath"], NUM8_OPTS, "synth-fixedmath-num8");
  return out;
}

const mode = process.argv[2];
if (mode === "snapshot") {
  mkdirSync(GOLD, { recursive: true });
  const all = collect();
  for (const [name, c] of Object.entries(all)) writeFileSync(snippetFile(name), c);
  console.log(`snapshot: wrote ${Object.keys(all).length} golden C files to ${path.relative(ROOT, GOLD)}`);
} else if (mode === "check") {
  const all = collect();
  let fails = 0;
  for (const [name, c] of Object.entries(all)) {
    const f = snippetFile(name);
    if (!existsSync(f)) { console.error(`  MISSING golden: ${name}`); fails++; continue; }
    const want = readFileSync(f, "utf8");
    if (want !== c) {
      console.error(`  DIFF: ${name} (golden ${want.length}B vs now ${c.length}B)`);
      const a = want.split("\n"), b = c.split("\n");
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) { console.error(`    line ${i + 1}:\n    - ${a[i]}\n    + ${b[i]}`); break; }
      }
      fails++;
    }
  }
  if (fails) { console.error(`\ngolden-c check: ${fails} FILE(S) DIFFER`); process.exit(1); }
  console.log(`golden-c check: all ${Object.keys(all).length} files byte-identical`);
} else {
  console.error("usage: node test/golden-c.mjs snapshot|check");
  process.exit(2);
}
