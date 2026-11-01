// Draws the app icons (a crosshair on a dark rounded square) as PNGs for the web app
// manifest. No image libraries: pixels are computed directly and written with zlib.
//
//   npx tsx scripts/make-icons.ts   -> public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf: Buffer) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size: number, maskable: boolean): Buffer {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const bg = [0x12, 0x12, 0x11];
  const accent = [0x39, 0x87, 0xe5];
  const white = [0xf0, 0xef, 0xec];
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size - 0.5;
      const v = (y + 0.5) / size - 0.5;
      // Rounded square (full bleed for maskable icons).
      const r = maskable ? 0 : 0.18;
      const qx = Math.max(Math.abs(u) - (0.5 - r), 0);
      const qy = Math.max(Math.abs(v) - (0.5 - r), 0);
      const inside = maskable || Math.hypot(qx, qy) <= r;
      let col = inside ? bg : null;
      const d = Math.hypot(u, v);
      const s = maskable ? 0.8 : 1;
      // Ring, crosshair lines with a gap in the middle, and a centre dot.
      if (inside && Math.abs(d - 0.27 * s) < 0.035 * s) col = accent;
      if (inside && ((Math.abs(u) < 0.022 * s && Math.abs(v) > 0.09 * s && Math.abs(v) < 0.38 * s) || (Math.abs(v) < 0.022 * s && Math.abs(u) > 0.09 * s && Math.abs(u) < 0.38 * s))) col = white;
      if (inside && d < 0.04 * s) col = accent;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      if (col) {
        raw[o] = col[0]!;
        raw[o + 1] = col[1]!;
        raw[o + 2] = col[2]!;
        raw[o + 3] = 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync("public/icon-192.png", png(192, false));
writeFileSync("public/icon-512.png", png(512, false));
writeFileSync("public/icon-maskable-512.png", png(512, true));
writeFileSync("public/apple-touch-icon.png", png(180, true));
console.log("icons written to public/");
