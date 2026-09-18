// Builds the executable icon (a plain, generic "unknown file" page from the icon library)
// as build/icon.png (256) and build/icon.ico (16/32/48/256, PNG-compressed entries).
import fs from "node:fs";
import { chromium } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const data = require("../web/lib/icons/iconify-data.json");
const ico = data["flat-color-icons:file"];
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${ico.width} ${ico.height}">${ico.body}</svg>`;
fs.mkdirSync("build", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const pngs = [];
for (const size of [16, 32, 48, 256]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`);
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  pngs.push({ size, buf });
  if (size === 256) fs.writeFileSync("build/icon.png", buf);
  await page.close();
}
await browser.close();
// ICO container: header + directory entries + PNG payloads
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
let offset = 6 + 16 * pngs.length;
const entries = [], payloads = [];
for (const { size, buf } of pngs) {
  const e = Buffer.alloc(16);
  e.writeUInt8(size === 256 ? 0 : size, 0); e.writeUInt8(size === 256 ? 0 : size, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12);
  entries.push(e); payloads.push(buf); offset += buf.length;
}
fs.writeFileSync("build/icon.ico", Buffer.concat([header, ...entries, ...payloads]));
console.log("wrote build/icon.png and build/icon.ico");
