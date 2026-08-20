// PWA icon generator: no image tooling (ImageMagick, rsvg-convert, sharp) was
// available when these were first made, so this writes real PNGs by hand —
// zlib is a Node built-in, and the rest of the PNG format is simple enough to
// encode directly. Not part of the build; run by hand when the theme colours
// in styles.css change or a size needs adding.
//
//   node scripts/gen-icons.mjs public/icons
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

// --- OKLCH -> sRGB, so the icon uses the app's real theme tokens ----------
function oklchToSrgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const rl = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gl = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055);
  const clamp = (c) => Math.max(0, Math.min(255, Math.round(gam(c) * 255)));
  return [clamp(rl), clamp(gl), clamp(bl)];
}

// Values straight from src/styles.css.
const BG = oklchToSrgb(0.19, 0.055, 268); // --background, night sky
const GOLD = oklchToSrgb(0.85, 0.15, 88); // --gold, the moon

// --- Minimal PNG encoder (8-bit RGBA, filter type 0) ----------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // no filter
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// --- The mark: a crescent moon on the app's night-sky background ---------
function drawIcon(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    const i = (y * size + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, BG);

  // Maskable icons are cropped to a circle/squircle by the OS, so the mark
  // sits in the safe zone (roughly the inner 60%); a plain icon can use more
  // of the canvas.
  const cx = size / 2, cy = size / 2;
  const r = size * (maskable ? 0.24 : 0.32);
  const offset = r * 0.62; // how much of the disc the "night" bite removes

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d1 = Math.hypot(x - cx, y - cy);
      const d2 = Math.hypot(x - (cx + offset), y - cy);
      const edge1 = r - d1; // inside the full moon disc
      const edge2 = d2 - r * 0.86; // outside the biting disc -> stays gold
      // Antialias both edges with a ~1px ramp, then combine.
      const a1 = Math.max(0, Math.min(1, edge1 + 0.5));
      const a2 = Math.max(0, Math.min(1, edge2 + 0.5));
      const a = Math.min(a1, a2);
      if (a > 0) {
        const i = (y * size + x) * 4;
        buf[i] = Math.round(BG[0] + (GOLD[0] - BG[0]) * a);
        buf[i + 1] = Math.round(BG[1] + (GOLD[1] - BG[1]) * a);
        buf[i + 2] = Math.round(BG[2] + (GOLD[2] - BG[2]) * a);
      }
    }
  }
  return encodePng(size, size, buf);
}

const outDir = process.argv[2];
mkdirSync(outDir, { recursive: true });
const targets = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, {}],
];
for (const [name, size, opts] of targets) {
  writeFileSync(`${outDir}/${name}`, drawIcon(size, opts));
  console.log(`wrote ${name} (${size}x${size})`);
}
console.log("background", BG, "gold", GOLD);
