// Gate A: the generated C for every example + synthetic fixture is byte-for-byte
// identical to the committed golden. Catches any drift in the shared luacretro
// front-end or the c64 target seam.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "../compiler/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GOLD = path.join(__dirname, "golden-fixtures");
const EX = path.join(ROOT, "examples");

function c(src, file, opts = {}) {
  const r = compile(src, file, opts);
  assert.ok(r.ok, (r.diagnostics || []).map((d) => d.message).join("\n"));
  return r.c;
}

test("every example's generated C matches its golden byte-for-byte", () => {
  for (const dir of readdirSync(EX).sort()) {
    const entry = path.join(EX, dir, "main.lua");
    if (!existsSync(entry)) continue;
    const got = c(readFileSync(entry, "utf8"), path.basename(entry));
    const gold = path.join(GOLD, `ex-${dir}.c`);
    assert.ok(existsSync(gold), `missing golden for ${dir} (run: node test/golden-c.mjs snapshot)`);
    assert.strictEqual(got, readFileSync(gold, "utf8"), `golden drift in ex-${dir}`);
  }
});
