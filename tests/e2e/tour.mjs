// Opens each app in the real shell and captures it, so the new surfaces can be eyeballed.
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";

const SERVER = process.env.TEST_SERVER_URL || "http://127.0.0.1:4127";
const out = path.resolve("tests/e2e/output/tour");
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = await electron.launch({ args: [".", "--no-sandbox"], env: { ...process.env, FOUND_DEV_SERVER_URL: SERVER, FOUND_WINDOWED: "1" }, timeout: 120000 });
const page = await app.firstWindow({ timeout: 120000 });
await page.setViewportSize({ width: 1600, height: 950 });
await page.waitForSelector("[data-taskbar]", { timeout: 60000 });
await sleep(1500);

const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log("captured", name); };
const launch = async (label) => {
  await page.click("[data-start]");
  await sleep(500);
  await page.click(`button:has-text("All apps")`).catch(() => {});
  await sleep(400);
  const btn = page.locator(`[data-startmenu] button:has-text("${label}")`).first();
  await btn.click({ timeout: 5000 });
  await sleep(1800);
};

await shot("00-desktop");
await page.click("[data-quick-btn]"); await sleep(600); await shot("01-quick-settings"); await page.keyboard.press("Escape");

for (const [label, name] of [["Calculator", "02-calculator"], ["Clock", "03-clock"], ["Task Manager", "04-taskmgr"], ["Settings", "05-settings"], ["Paint", "07-paint"], ["Photos", "08-photos"], ["REAPER", "09-audio"]]) {
  try { await launch(label); await shot(name); } catch (e) { console.log("could not open", label, e.message.split("\n")[0]); }
}

// Settings pages
try {
  const nav = page.locator('[data-window="settings"] button:has-text("Personalisation")').first();
  await nav.click({ timeout: 4000 }); await sleep(900); await shot("06-settings-personalisation");
} catch { /* window not focused */ }

// A file opened from the desktop
try { await page.click("button[title='Show desktop']"); await sleep(400); await page.dblclick("[data-desktop-icon]:has-text('READ ME')"); await sleep(1200); await shot("10-notepad"); } catch { /* */ }

await app.close();
console.log("tour done ->", out);
