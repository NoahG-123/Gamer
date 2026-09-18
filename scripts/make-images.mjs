// Builds the images this machine ships with, so nothing in the finished build is a
// leftover test gradient:
//
//   content/assets/generated/harbour-fog.png   the desktop wallpaper (used when no stock
//                                              photo has been fetched)
//   content/assets/generated/lockscreen.png    the same scene, brighter, for the start menu
//   content/filesystem/assets/photos/*.png     the photographs that story files point at
//
// Everything is composed here rather than downloaded: layered fog banks, a horizon, a
// light source, depth-of-field blur, film grain and a vignette. Deterministic, so a
// rebuild produces the same images.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// ---------- png ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 1; // Sub filter: cheap and compresses these gradients well
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3, s = (y * w + x) * 3;
      for (let k = 0; k < 3; k++) raw[o + k] = (rgb[s + k] - (x > 0 ? rgb[s - 3 + k] : 0)) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- noise ----------
function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function valueNoise(seed, w, h, cells) {
  const r = mulberry(seed);
  const gw = cells + 2, grid = new Float32Array(gw * gw);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / w) * cells, fy = (y / h) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const g = (a, b) => grid[Math.min(gw - 1, b) * gw + Math.min(gw - 1, a)];
    return lerp(lerp(g(x0, y0), g(x0 + 1, y0), tx), lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), tx), ty);
  };
}
function fbm(seed, w, h, octaves = 5, cells = 3) {
  const layers = Array.from({ length: octaves }, (_, i) => valueNoise(seed + i * 977, w, h, cells * 2 ** i));
  return (x, y) => {
    let v = 0, amp = 0.5, total = 0;
    for (const l of layers) { v += l(x, y) * amp; total += amp; amp *= 0.5; }
    return v / total;
  };
}

/**
 * Night fog over water: a dark sky graded to a pale band at the horizon, fog banks rolling
 * through it, one soft light off to the side, grain and a vignette.
 */
function harbourFog(w, h, { bright = 0 } = {}) {
  const rgb = new Uint8Array(w * h * 3);
  const fogA = fbm(1201, w, h, 5, 2), fogB = fbm(6607, w, h, 4, 4), speck = mulberry(90210);
  const horizon = 0.62, lightX = 0.74, lightY = 0.52;
  for (let y = 0; y < h; y++) {
    const ny = y / h;
    for (let x = 0; x < w; x++) {
      const nx = x / w;
      // sky: deep blue-green above, colder and paler towards the water line
      const toHorizon = 1 - Math.min(1, Math.abs(ny - horizon) / 0.55);
      let r = 9 + 26 * toHorizon, g = 14 + 33 * toHorizon, b = 20 + 42 * toHorizon;
      // water below the horizon: darker, with a long reflection under the light
      if (ny > horizon) {
        const depth = (ny - horizon) / (1 - horizon);
        const refl = Math.exp(-((nx - lightX) ** 2) / 0.006) * Math.exp(-depth * 2.2) * 34;
        r = 7 + 10 * (1 - depth) + refl; g = 11 + 14 * (1 - depth) + refl * 0.95; b = 16 + 19 * (1 - depth) + refl * 0.8;
        const ripple = Math.sin((ny * 260) + fogB(x, y) * 8) * 2.2 * (1 - depth);
        r += ripple; g += ripple; b += ripple;
      }
      // fog banks
      const fog = Math.max(0, fogA(x, y) * 0.75 + fogB(x, y) * 0.35 - 0.34) * (0.55 + 0.45 * toHorizon);
      r += fog * 62; g += fog * 68; b += fog * 74;
      // the light itself: a sodium lamp somewhere out in it
      const d = Math.hypot((nx - lightX) * 1.9, ny - lightY);
      const glow = Math.exp(-d * d / 0.012) * 46 + Math.exp(-d * d / 0.16) * 13;
      r += glow * 1.18; g += glow * 0.93; b += glow * 0.62;
      // grain + vignette
      const grain = (speck() - 0.5) * 7.5;
      const vig = 1 - 0.5 * ((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 1.7;
      const lift = bright;
      const o = (y * w + x) * 3;
      rgb[o] = Math.max(0, Math.min(255, (r + grain + lift) * vig));
      rgb[o + 1] = Math.max(0, Math.min(255, (g + grain + lift) * vig));
      rgb[o + 2] = Math.max(0, Math.min(255, (b + grain + lift) * vig));
    }
  }
  return rgb;
}

/**
 * A photograph taken indoors on a phone: window light across a room, everything soft,
 * warm highlights, grain. Abstract by design — it reads as a snapshot, not a diagram.
 */
function interiorPhoto(w, h, seed, opts = {}) {
  const { warm = 1, windowX = 0.28, windowY = 0.34, clutter = 7 } = opts;
  const rgb = new Uint8Array(w * h * 3);
  const shapes = [];
  const r = mulberry(seed);
  for (let i = 0; i < clutter; i++) {
    shapes.push({ x: r(), y: 0.45 + r() * 0.5, w: 0.05 + r() * 0.22, h: 0.06 + r() * 0.3, tone: 0.3 + r() * 0.55, blur: 0.04 + r() * 0.1 });
  }
  const grain = mulberry(seed + 17);
  const haze = fbm(seed + 31, w, h, 4, 3);
  for (let y = 0; y < h; y++) {
    const ny = y / h;
    for (let x = 0; x < w; x++) {
      const nx = x / w;
      // the window: a bright soft rectangle that bleeds into the room
      const wx = Math.max(0, 1 - Math.abs(nx - windowX) / 0.2);
      const wy = Math.max(0, 1 - Math.abs(ny - windowY) / 0.3);
      const win = Math.pow(wx * wy, 1.6);
      let lum = 26 + win * 190;
      // light falling away across the room
      lum += Math.exp(-((nx - windowX) ** 2 + (ny - windowY) ** 2) / 0.22) * 58;
      // furniture and objects, blurred
      for (const s of shapes) {
        const dx = Math.abs(nx - s.x) - s.w / 2, dy = Math.abs(ny - s.y) - s.h / 2;
        const inside = Math.max(dx, dy);
        const soft = 1 - Math.min(1, Math.max(0, inside) / s.blur);
        if (soft > 0) lum = lum * (1 - soft * 0.55) + s.tone * 52 * soft;
      }
      lum *= 0.82 + haze(x, y) * 0.3;
      const g = (grain() - 0.5) * 9;
      const vig = 1 - 0.42 * ((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 1.8;
      const o = (y * w + x) * 3;
      rgb[o] = Math.max(0, Math.min(255, (lum * (1 + 0.14 * warm) + g) * vig));
      rgb[o + 1] = Math.max(0, Math.min(255, (lum * (1 + 0.02 * warm) + g) * vig));
      rgb[o + 2] = Math.max(0, Math.min(255, (lum * (1 - 0.12 * warm) + g) * vig));
    }
  }
  return rgb;
}

const targets = [
  { file: "content/assets/generated/harbour-fog.png", w: 2560, h: 1440, make: (w, h) => harbourFog(w, h) },
  { file: "content/assets/generated/harbour-fog-light.png", w: 1920, h: 1080, make: (w, h) => harbourFog(w, h, { bright: 46 }) },
  { file: "content/filesystem/assets/photos/kitchen.png", w: 1600, h: 1200, make: (w, h) => interiorPhoto(w, h, 5150, { warm: 1.25, windowX: 0.3, windowY: 0.3, clutter: 9 }) },
];

for (const t of targets) {
  const out = path.join(root, t.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const buf = png(t.w, t.h, t.make(t.w, t.h));
  fs.writeFileSync(out, buf);
  console.log(`wrote ${t.file} (${t.w}x${t.h}, ${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
}
