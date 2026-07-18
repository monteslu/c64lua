// c64-png.mjs — self-contained PNG -> C64 multicolor bitmap/sprite importer.
//
// Decodes a PNG (pure JS, own inflate; the decode core is shared with the
// gbalua importer) and quantizes it against the 16 C64 hardware colors, then
// packs it as a 160x200 multicolor bitmap with the per-cell 3-colors+backdrop
// constraint enforced (a cell that needs a 4th color is reported so you can fix
// the art). See docs/ASSETS.md.
//
// BROWSER-SAFE: no node:zlib, no Buffer — runs identically in Node and in a
// Web Worker.

// ---- pure-JS inflate (zlib stream) ------------------------------------------
// Classic puff-style canonical-Huffman DEFLATE decoder. Small and deterministic;
// PNG payloads here are tiny (sprite sheets / maps), speed is irrelevant.
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// build a canonical-Huffman decoder from a code-length array.
function buildHuff(lengths) {
  const count = new Int32Array(16);
  for (const l of lengths) count[l]++;
  count[0] = 0;
  const offsets = new Int32Array(16);
  for (let l = 1; l < 16; l++) offsets[l] = offsets[l - 1] + count[l - 1];
  const symbols = new Int32Array(lengths.length);
  for (let s = 0; s < lengths.length; s++) if (lengths[s]) symbols[offsets[lengths[s]]++] = s;
  return { count, symbols };
}

export function inflate(src) {
  // zlib wrapper: 2-byte header (CM must be 8 = deflate), 4-byte adler trailer.
  if ((src[0] & 0x0f) !== 8) throw new Error("inflate: not a zlib/deflate stream");
  let pos = 2, bitBuf = 0, bitCnt = 0;
  let out = new Uint8Array(64 * 1024), outLen = 0;
  const push = (b) => {
    if (outLen === out.length) { const g = new Uint8Array(out.length * 2); g.set(out); out = g; }
    out[outLen++] = b;
  };
  const bits = (n) => {
    while (bitCnt < n) { bitBuf |= src[pos++] << bitCnt; bitCnt += 8; }
    const v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n; bitCnt -= n;
    return v;
  };
  const decode = (huff) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const cnt = huff.count[len];
      if (code - first < cnt) return huff.symbols[index + (code - first)];
      index += cnt; first = (first + cnt) << 1; code <<= 1;
    }
    throw new Error("inflate: bad huffman code");
  };

  let fixedLit = null, fixedDist = null;
  for (;;) {
    const final = bits(1), type = bits(2);
    if (type === 0) {                     // stored
      bitBuf = 0; bitCnt = 0;             // align to byte
      const len = src[pos] | (src[pos + 1] << 8);
      pos += 4;                            // len + ~len
      for (let i = 0; i < len; i++) push(src[pos++]);
    } else {
      let lit, dist;
      if (type === 1) {                   // fixed codes
        if (!fixedLit) {
          const ll = new Array(288);
          for (let i = 0; i < 144; i++) ll[i] = 8;
          for (let i = 144; i < 256; i++) ll[i] = 9;
          for (let i = 256; i < 280; i++) ll[i] = 7;
          for (let i = 280; i < 288; i++) ll[i] = 8;
          fixedLit = buildHuff(ll);
          fixedDist = buildHuff(new Array(30).fill(5));
        }
        lit = fixedLit; dist = fixedDist;
      } else if (type === 2) {            // dynamic codes
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const clens = new Array(19).fill(0);
        for (let i = 0; i < hclen; i++) clens[CLEN_ORDER[i]] = bits(3);
        const clHuff = buildHuff(clens);
        const lens = new Array(hlit + hdist).fill(0);
        for (let i = 0; i < hlit + hdist;) {
          const sym = decode(clHuff);
          if (sym < 16) lens[i++] = sym;
          else if (sym === 16) { const rep = 3 + bits(2), prev = lens[i - 1]; for (let r = 0; r < rep; r++) lens[i++] = prev; }
          else if (sym === 17) { const rep = 3 + bits(3); for (let r = 0; r < rep; r++) lens[i++] = 0; }
          else { const rep = 11 + bits(7); for (let r = 0; r < rep; r++) lens[i++] = 0; }
        }
        lit = buildHuff(lens.slice(0, hlit));
        dist = buildHuff(lens.slice(hlit));
      } else throw new Error("inflate: bad block type");
      for (;;) {
        const sym = decode(lit);
        if (sym === 256) break;
        if (sym < 256) push(sym);
        else {
          const len = LEN_BASE[sym - 257] + bits(LEN_EXTRA[sym - 257]);
          const dsym = decode(dist);
          const d = DIST_BASE[dsym] + bits(DIST_EXTRA[dsym]);
          for (let i = 0; i < len; i++) push(out[outLen - d]);
        }
      }
    }
    if (final) break;
  }
  return out.subarray(0, outLen);
}

// ---- minimal PNG decode -> {width, height, rgba: Uint8Array} ----------------
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/** Decode an 8-bit PNG (RGBA/RGB/indexed/gray) to {width, height, rgba}. */
export function decodePng(buf) {
  buf = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u32be(buf, 0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  let idatLen = 0;
  let palette = null, trns = null;
  while (pos < buf.length) {
    const len = u32be(buf, pos);
    const type = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = u32be(data, 0); height = u32be(data, 4);
      bitDepth = data[8]; colorType = data[9];
      if (data[12]) throw new Error("interlaced PNG unsupported");
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") { idat.push(data); idatLen += data.length; }
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`PNG bit depth ${bitDepth} unsupported (need 8)`);
  const joined = new Uint8Array(idatLen);
  let jo = 0;
  for (const c of idat) { joined.set(c, jo); jo += c.length; }
  const raw = inflate(joined);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`PNG color type ${colorType} unsupported`);
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const rawv = raw[rp++];
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v;
      switch (filter) {
        case 0: v = rawv; break;
        case 1: v = rawv + a; break;
        case 2: v = rawv + b; break;
        case 3: v = rawv + ((a + b) >> 1); break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = rawv + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: v = rawv;
      }
      line[x] = v & 0xff;
    }
    // expand line -> rgba
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 6) { out[o] = line[x * 4]; out[o + 1] = line[x * 4 + 1]; out[o + 2] = line[x * 4 + 2]; out[o + 3] = line[x * 4 + 3]; }
      else if (colorType === 2) { out[o] = line[x * 3]; out[o + 1] = line[x * 3 + 1]; out[o + 2] = line[x * 3 + 2]; out[o + 3] = 255; }
      else if (colorType === 3) { const idx = line[x]; out[o] = palette[idx * 3]; out[o + 1] = palette[idx * 3 + 1]; out[o + 2] = palette[idx * 3 + 2]; out[o + 3] = trns && idx < trns.length ? trns[idx] : 255; }
      else { out[o] = out[o + 1] = out[o + 2] = line[x]; out[o + 3] = 255; }
    }
    prev.set(line);
  }
  return { width, height, rgba: out };
}

// ---- C64 import ------------------------------------------------------------
import { C64_PALETTE, nearestColorIndex } from "./c64_palette.js";

/**
 * Quantize a decoded PNG to a C64 multicolor bitmap image + a digested report.
 * The canvas is 160x200; source art should be authored at 160x200 (one source
 * pixel per addressable canvas pixel — the 2:1 fat pixel is a DISPLAY property).
 *
 * @param {Uint8Array} buf  PNG bytes
 * @returns {{
 *   width:number, height:number,
 *   indices:Uint8Array,          // per-pixel C64 index 0-15 (row-major, WxH)
 *   backdrop:number,             // chosen shared background index (00 slot)
 *   clashes:{cell:number, cx:number, cy:number, colors:number[]}[],
 *   report:string
 * }}
 */
export function pngToC64Bitmap(buf) {
  const { width, height, rgba } = decodePng(buf);
  const W = 160, H = 200;
  const iw = Math.min(width, W), ih = Math.min(height, H);
  const indices = new Uint8Array(W * H);

  // 1. quantize every pixel to the nearest C64 index.
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      const o = (y * width + x) * 4;
      indices[y * W + x] = nearestColorIndex(rgba[o], rgba[o + 1], rgba[o + 2]);
    }
  }

  // 2. pick the backdrop: the most common color across the whole image (the
  // shared 00 slot every cell gets for free).
  const hist = new Array(16).fill(0);
  for (let i = 0; i < W * H; i++) hist[indices[i]]++;
  let backdrop = 0, best = -1;
  for (let c = 0; c < 16; c++) if (hist[c] > best) { best = hist[c]; backdrop = c; }

  // 3. per-cell (4x8) constraint check: at most 3 non-backdrop colors per cell.
  const clashes = [];
  const cellsAcross = W / 4, cellsDown = H / 8;
  for (let cy = 0; cy < cellsDown; cy++) {
    for (let cx = 0; cx < cellsAcross; cx++) {
      const seen = new Set();
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 4; px++) {
          const c = indices[(cy * 8 + py) * W + (cx * 4 + px)];
          if (c !== backdrop) seen.add(c);
        }
      }
      if (seen.size > 3) clashes.push({ cell: cy * cellsAcross + cx, cx, cy, colors: [...seen] });
    }
  }

  const lines = [
    `c64 bitmap import: ${width}x${height} -> ${W}x${H} canvas`,
    `backdrop (shared 00 color): ${backdrop} (${C64_PALETTE[backdrop] ? "rgb " + C64_PALETTE[backdrop].join(",") : "?"})`,
    `cells over the 3-color budget: ${clashes.length} of ${cellsAcross * cellsDown}`,
  ];
  if (clashes.length) {
    lines.push(`  first offenders (cell cx,cy -> colors): ` +
      clashes.slice(0, 6).map((k) => `(${k.cx},${k.cy})->[${k.colors.join(",")}]`).join(" "));
    lines.push(`  fix: reduce a cell to 3 non-backdrop colors, or align color changes to cell edges.`);
  }

  return { width: W, height: H, indices, backdrop, clashes, report: lines.join("\n") };
}
