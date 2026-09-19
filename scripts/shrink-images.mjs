// Re-encodes the images in content/assets to the size they are actually shown at.
//
// Generation and stock APIs hand back 1024-2048px originals at two or three megabytes
// each. A widget thumbnail drawn at 64x48 does not need that, and a wallpaper does not
// need more than the screen. This walks the manifest, works out a sensible maximum for
// each slot from what uses it, and re-encodes anything larger — in Chromium, so there is
// no native image dependency to install.
//
//   node scripts/shrink-images.mjs          # report what would change
//   node scripts/shrink-images.mjs --write  # actually rewrite them
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const assets = path.join(root, "content/assets");
const write = process.argv.includes("--write");

/** Longest edge, by what the slot is drawn at. Wallpapers fill a screen; the rest do not. */
const LIMITS = [
  [/^stock\/(wallpaper-desktop|harbour|coast|spruce|lighthouse|rain|dunes)\./, 2560, 0.82],
  [/^stock\/ntp-background\./, 1920, 0.82],
  [/^generated\/weather-/, 1280, 0.82],
  [/^generated\/widgets-news-/, 900, 0.8],
  [/^people\//, 640, 0.9],
  [/^stock\//, 1280, 0.82],
];
const limitFor = (rel) => LIMITS.find(([re]) => re.test(rel))?.slice(1) ?? [1600, 0.82];

function walk(dir, base = "") {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else if (/\.(jpe?g|png)$/i.test(e.name)) out.push(rel);
  }
  return out;
}

// The two composed fallbacks are referenced by name — and by extension — from the asset
// manifest, and are rebuilt as PNGs by scripts/make-images.mjs. Re-encoding them to JPEG
// would rename them and break every `fallback` entry that points at one.
const KEEP = [/^generated\/harbour-fog/];
const files = walk(assets).map((f) => f.replace(/\\/g, "/")).filter((f) => !KEEP.some((re) => re.test(f)));
if (!files.length) { console.log("no images to shrink"); process.exit(0); }

const browser = await chromium.launch();
const page = await browser.newPage();
let saved = 0, touched = 0;

for (const rel of files) {
  const full = path.join(assets, rel);
  const before = fs.statSync(full).size;
  const [maxEdge, quality] = limitFor(rel);
  const dataUrl = `data:${rel.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg"};base64,${fs.readFileSync(full).toString("base64")}`;

  const out = await page.evaluate(async ({ dataUrl, maxEdge, quality }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return { b64: c.toDataURL("image/jpeg", quality).split(",")[1], w, h, ow: img.width, oh: img.height };
  }, { dataUrl, maxEdge, quality }).catch((e) => { console.warn(`  ${rel}: ${String(e).slice(0, 80)}`); return null; });
  if (!out) continue;

  const bytes = Buffer.from(out.b64, "base64");
  // Only rewrite when it is a real saving; never make a file bigger.
  if (bytes.length >= before * 0.92) continue;
  touched++; saved += before - bytes.length;
  const dest = rel.toLowerCase().endsWith(".png") && out.ow === out.w ? full : full.replace(/\.png$/i, ".jpg");
  console.log(`${write ? "wrote" : "would write"} ${rel.padEnd(34)} ${out.ow}x${out.oh} -> ${out.w}x${out.h}  ${(before / 1024).toFixed(0)}kB -> ${(bytes.length / 1024).toFixed(0)}kB`);
  if (write) {
    fs.writeFileSync(dest, bytes);
    if (dest !== full) fs.rmSync(full);
  }
}

await browser.close();
console.log(`\n${touched} image(s), ${(saved / 1024 / 1024).toFixed(1)} MB ${write ? "saved" : "would be saved"}`);
if (!write) console.log("re-run with --write to apply");
