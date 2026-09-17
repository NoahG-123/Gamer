// usage: node shot.mjs <out.png> [script.js]  — script gets (page) and runs before the screenshot
import { chromium } from "playwright";
import fs from "node:fs";
const [out, scriptPath] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
await page.goto("http://127.0.0.1:4127/", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
if (scriptPath) { const fn = (await import(fs.realpathSync(scriptPath))).default; await fn(page); }
await page.screenshot({ path: out });
await browser.close();
console.log("wrote", out);
