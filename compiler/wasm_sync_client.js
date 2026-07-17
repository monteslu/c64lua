// wasm_sync_client.js - synchronous front-end to the persistent WASM worker.
//
// The build orchestrator (bin/gtlua.js) is synchronous, but running a cc65 tool
// in WASM is inherently async (module instantiation). This bridges the two: a
// single long-lived worker (compiler/wasm_worker.js) holds the WASM tools for
// the whole build, and each call blocks the main thread via Atomics.wait until
// the worker signals done - so run()/runLink() stay synchronous and the FLASH2M
// placement ladder is untouched.
//
// The result crosses back through the SharedArrayBuffer itself (not a message,
// which would race the Atomics flag): [0]=flag, [1]=status, [2]=stderr byte
// length, then the UTF-8 stderr bytes. A generous buffer holds tool diagnostics;
// if a tool ever overflows it we grow and retry.

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), "wasm_worker.js");
const HEADER_INTS = 3;                 // flag, status, stderrLen
let SAB_BYTES = 1 << 20;               // 1 MB; grows if a tool's log is bigger

let worker = null;
let nextId = 1;

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(WORKER);
  worker.unref();                      // don't keep the process alive on its own
  // drain the worker's ready/result notifications; the SAB carries the payload
  // we actually read, so these messages are just liveness.
  worker.on("message", () => {});
  worker.on("error", (e) => { throw e; });
  return worker;
}

/**
 * Run one cc65-family tool synchronously via the persistent worker.
 * Files are read from / written to their host paths by the worker, so only the
 * argv crosses the boundary.
 * @param {"cc65"|"ca65"|"ld65"} tool
 * @param {string[]} argv
 * @returns {{status:number, stdout:string, stderr:string}}
 */
export function runToolSync(tool, argv) {
  const w = ensureWorker();
  for (;;) {
    const sab = new SharedArrayBuffer(SAB_BYTES);
    const flag = new Int32Array(sab, 0, HEADER_INTS);
    Atomics.store(flag, 0, 0);
    w.postMessage({ type: "run", id: nextId++, tool, argv, sab });
    Atomics.wait(flag, 0, 0);          // BLOCK until the worker flips flag[0]

    const status = Atomics.load(flag, 1);
    const len = Atomics.load(flag, 2);
    if (len === -1) { SAB_BYTES *= 2; continue; }   // buffer too small; grow+retry
    const bytes = new Uint8Array(sab, HEADER_INTS * 4, len);
    const stderr = new TextDecoder().decode(bytes);
    return { status, stdout: "", stderr };
  }
}

/** Shut the worker down at the end of a build (best effort). */
export function closeWorker() {
  if (worker) { worker.terminate(); worker = null; }
}
