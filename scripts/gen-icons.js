// Generates the PWA icons (castle silhouette on dark ground) as PNGs.
// No dependencies — hand-rolled PNG encoding via zlib. Run: node scripts/gen-icons.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, pixels) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  };
  const u = size / 64; // design in a 64x64 grid

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // sky gradient
      const t = y / size;
      put(x, y, Math.round(16 + t * 14), Math.round(20 + t * 16), Math.round(30 + t * 20));
    }
  }
  // moon
  const mx = 46 * u, my = 14 * u, mr = 6 * u;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - mx, y - my);
      if (d < mr) put(x, y, 255, 214, 92);
    }
  }
  const rect = (gx, gy, gw, gh, r, g, b) => {
    for (let y = Math.round(gy * u); y < Math.round((gy + gh) * u); y++) {
      for (let x = Math.round(gx * u); x < Math.round((gx + gw) * u); x++) put(x, y, r, g, b);
    }
  };
  const S = [154, 158, 152], D = [120, 124, 120];
  // ground
  rect(0, 56, 64, 8, 34, 40, 34);
  // wall
  rect(12, 38, 40, 18, ...S);
  // battlements on wall
  for (let i = 0; i < 5; i++) rect(14 + i * 8, 34, 4, 4, ...S);
  // towers
  rect(8, 24, 10, 32, ...D);
  rect(46, 24, 10, 32, ...D);
  for (const tx of [8, 46]) {
    rect(tx - 1, 20, 3, 4, ...D);
    rect(tx + 3.5, 20, 3, 4, ...D);
    rect(tx + 8, 20, 3, 4, ...D);
  }
  // central keep
  rect(26, 26, 12, 30, ...S);
  for (let i = 0; i < 3; i++) rect(26 + i * 4.5, 22, 3, 4, ...S);
  // gate
  rect(29, 46, 6, 10, 40, 32, 24);
  // keep window
  rect(31, 32, 2, 5, 255, 214, 92);
  return encodePNG(size, px);
}

const outDir = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), render(size));
  console.log(`wrote icon-${size}.png`);
}
