// d64.mjs - pure-JS Commodore 1541 .d64 disk-image writer.
//
// Wraps a single .prg (2-byte load-address header + data) into a standard
// 35-track, 174848-byte .d64 with a valid BAM (track 18 sector 0), a directory
// entry, and the file's sector chain. The result is the exact format the new
// Commodore 64 Ultimate hardware and the homebrew/demo scene load, and that
// romdev's loadMedia autostarts (LOAD"*",8,1 : RUN).
//
// This is a faithful subset of romdev's cart({op:'packDisk'}) so the standalone
// CLI needs no MCP server. Layout facts (1541 GCR-decoded "35-track" image):
//   sectors per track: 1-17 -> 21, 18-24 -> 19, 25-30 -> 18, 31-35 -> 17
//   total 683 sectors * 256 bytes = 174848 bytes.

const SPT = []; // sectors-per-track, 1-based
for (let t = 1; t <= 35; t++) {
  SPT[t] = t <= 17 ? 21 : t <= 24 ? 19 : t <= 30 ? 18 : 17;
}

// byte offset of (track, sector) in the image
function ofs(track, sector) {
  let o = 0;
  for (let t = 1; t < track; t++) o += SPT[t] * 256;
  return o + sector * 256;
}

// PETSCII-ish: uppercase ASCII maps directly; pad with $A0 (shifted space).
function petName(name) {
  const buf = new Uint8Array(16).fill(0xa0);
  const s = (name || "GAME").toUpperCase().slice(0, 16);
  for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i) & 0xff;
  return buf;
}

/**
 * @param {Uint8Array|Buffer} prg  .prg bytes (load addr header + data)
 * @param {string} label           disk + file name (<=16 chars)
 * @returns {Buffer} 174848-byte .d64
 */
export function writeD64(prg, label = "GAME") {
  const img = Buffer.alloc(174848, 0);
  prg = Uint8Array.from(prg);

  // --- write the file's sector chain, starting at track 17 sector 0 ---------
  // (data tracks are everything but the directory track 18; start just below it)
  const startTrack = 17, startSector = 0;
  const usedSectors = []; // [ [t,s], ... ]
  let remaining = prg.length;
  let off = 0;
  let t = startTrack, s = startSector;

  const nextFree = (ct, cs) => {
    // simple interleave-free allocator across tracks 1..35, skipping track 18
    let nt = ct, ns = cs + 1;
    for (;;) {
      if (ns >= SPT[nt]) { ns = 0; nt++; if (nt === 18) nt = 19; if (nt > 35) return null; }
      return [nt, ns];
    }
  };

  while (remaining > 0) {
    usedSectors.push([t, s]);
    remaining -= 254;
    if (remaining > 0) {
      const nx = nextFree(t, s);
      if (!nx) throw new Error("d64: program too large for a single disk");
      [t, s] = nx;
    }
  }

  // fill sectors with data + chain links
  for (let i = 0; i < usedSectors.length; i++) {
    const [ct, cs] = usedSectors[i];
    const base = ofs(ct, cs);
    const chunk = prg.subarray(i * 254, i * 254 + 254);
    if (i + 1 < usedSectors.length) {
      const [nt, ns] = usedSectors[i + 1];
      img[base] = nt; img[base + 1] = ns;
    } else {
      img[base] = 0x00;                 // last sector: no next track
      img[base + 1] = chunk.length + 1; // bytes used in this sector (+1 offset)
    }
    img.set(chunk, base + 2);
  }

  // --- BAM: track 18 sector 0 -----------------------------------------------
  const bam = ofs(18, 0);
  img[bam] = 18; img[bam + 1] = 1;      // first directory sector: 18/1
  img[bam + 2] = 0x41;                  // DOS version 'A'
  img[bam + 3] = 0x00;
  // per-track free entries: 4 bytes each for tracks 1..35 at offset 4
  for (let tr = 1; tr <= 35; tr++) {
    const e = bam + 4 + (tr - 1) * 4;
    let free = SPT[tr];
    const bits = [0, 0, 0];
    for (let b = 0; b < SPT[tr]; b++) bits[b >> 3] |= 1 << (b & 7); // all free
    // mark used sectors on this track as allocated
    for (const [ut, us] of usedSectors) {
      if (ut === tr) { bits[us >> 3] &= ~(1 << (us & 7)); free--; }
    }
    if (tr === 18) {                     // directory track: 18/0 + 18/1 used
      bits[0] &= ~(1 << 0); bits[0] &= ~(1 << 1); free -= 2;
    }
    img[e] = free;
    img[e + 1] = bits[0]; img[e + 2] = bits[1]; img[e + 3] = bits[2];
  }
  // disk name at 0x90 (offset 144 into the sector), padded with $A0
  const dn = petName(label);
  img.set(dn, bam + 0x90);
  img[bam + 0xa0] = 0xa0; img[bam + 0xa1] = 0xa0;     // disk id area
  img[bam + 0xa2] = 0x30; img[bam + 0xa3] = 0x30;     // id "00"
  img[bam + 0xa4] = 0xa0;
  img[bam + 0xa5] = 0x32; img[bam + 0xa6] = 0x41;     // DOS type "2A"
  for (let i = 0xa7; i <= 0xaa; i++) img[bam + i] = 0xa0;

  // --- directory: track 18 sector 1, entry 0 --------------------------------
  const dir = ofs(18, 1);
  img[dir] = 0x00; img[dir + 1] = 0xff;  // last dir sector; 0xff = full sector
  // entry 0 starts at dir+2
  const e0 = dir + 2;
  img[e0 + 0] = 0x82;                    // file type: PRG (0x80 | 0x02), closed
  img[e0 + 1] = startTrack;              // first data track
  img[e0 + 2] = startSector;             // first data sector
  img.set(petName(label), e0 + 3);       // file name (16 bytes)
  // sector count (low/high) at offset 0x1E-0x1F of the entry
  const nsec = usedSectors.length;
  img[e0 + 0x1c] = nsec & 0xff;
  img[e0 + 0x1d] = (nsec >> 8) & 0xff;

  return img;
}
