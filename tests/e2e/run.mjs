// End-to-end: boots the real Electron app against the dev server and drives it with Playwright.
// Usage: LLM_PROVIDER=mock node tests/e2e/run.mjs   (expects `next dev web -p 4127` running; wrap in xvfb-run on headless Linux)
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const SERVER = process.env.TEST_SERVER_URL || "http://127.0.0.1:4127";
const out = path.resolve("tests/e2e/output"); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await fetch(`${SERVER}/api/state/reset`, { method: "POST" });

const app = await electron.launch({ args: [".", "--no-sandbox"], env: { ...process.env, FOUND_DEV_SERVER_URL: SERVER, FOUND_WINDOWED: "1", ELECTRON_ENABLE_LOGGING: "1" }, timeout: 120000 });
const page = await app.firstWindow({ timeout: 120000 });
process.on("unhandledRejection", async (e) => { try { await page.screenshot({ path: `${out}/FAIL.png` }); } catch {} console.error(e); process.exit(1); });
await page.waitForSelector("[data-taskbar]", { timeout: 60000 });
await sleep(1500);
await page.screenshot({ path: `${out}/01-desktop.png` });
console.log("desktop booted");

// 1. Chrome + story host intercept through the real webview session
await page.dblclick("[data-desktop-icon]:has-text('Google Chrome')");
await page.waitForSelector("input[placeholder='Search Google or type a URL']");
const omni = page.locator("input[placeholder='Search Google or type a URL']");
await omni.click(); await omni.fill("placeholder-one.example"); await omni.press("Enter");
await sleep(2500);
const shown = await omni.inputValue();
assert.equal(shown, "placeholder-one.example", `address bar shows story host, got ${shown}`);
const wvUrl = await page.evaluate(() => { const w = document.querySelector("webview"); return w ? w.getURL() : ""; });
assert.ok(wvUrl.startsWith(`${SERVER}/sites/placeholder-one.example`), `webview actually loaded local page: ${wvUrl}`);
const title = await page.evaluate(() => document.querySelector("webview")?.getTitle?.() ?? "");
assert.equal(title, "Placeholder One");
await page.screenshot({ path: `${out}/02-chrome-story-site.png` });
console.log("intercept ok:", shown, "->", wvUrl);
// Cross-site link inside the fake page
await page.evaluate(() => document.querySelector("webview").executeJavaScript("document.querySelector('a[href^=\"https://placeholder-two\"]').click()"));
await sleep(2000);
assert.equal(await omni.inputValue(), "placeholder-two.example");
console.log("cross-site story link ok");
// A real host must go to the network (proxy-blocked here, so we only assert it was NOT redirected locally)
await omni.click(); await omni.fill("example.com"); await omni.press("Enter");
await sleep(2500);
const realUrl = await page.evaluate(() => document.querySelector("webview").getURL());
assert.ok(!realUrl.startsWith(SERVER), `real host untouched by intercept: ${realUrl}`);
console.log("real host untouched:", realUrl);
const ev = await (await fetch(`${SERVER}/api/state/events?limit=50`)).json();
assert.ok(ev.events.some((e) => e.type === "site.visited" && e.subject.startsWith("placeholder-one.example")), "site.visited recorded");

// 2. File Explorer -> open story file in Notepad, trigger reveals another file
await page.dblclick("[data-desktop-icon]:has-text('read me first')");
await page.waitForSelector("[data-window='notepad']");
const note = await page.locator("[data-window='notepad'] textarea").inputValue();
assert.match(note, /PLACEHOLDER STORY FILE/);
await page.screenshot({ path: `${out}/03-notepad.png` });
await page.dblclick("[data-desktop-icon]:has-text('New folder')");
await page.waitForSelector("[data-window='explorer']");
await page.click("[data-window='explorer'] >> text=Documents");
await sleep(800);
assert.ok(await page.locator("[data-row]:has-text('placeholder notes.txt')").count() > 0, "revealed file shows in Explorer");
await page.dblclick("[data-row]:has-text('placeholder notes.txt')");
await sleep(800);
await page.screenshot({ path: `${out}/04-explorer-reveal.png` });
// clear the stacked windows: "Show desktop", then bring Explorer back on top from the taskbar
await page.click("button[title='Show desktop']");
await sleep(300);
await page.click("[data-taskbar] [data-app='explorer']");
await sleep(500);
// dressing file -> realistic OS dialog
await page.dblclick("[data-row]:has-text('Document1.docx')");
await page.waitForSelector("[data-window='dialog']");
assert.match(await page.locator("[data-window='dialog']").innerText(), /Select an app to open this \.docx file/);
await page.screenshot({ path: `${out}/05-open-with-dialog.png` });
console.log("explorer/notepad/dialog ok");

// 3. Story file that opens in Chrome as file:///
await page.keyboard.press("Escape");
await sleep(400);
assert.equal(await page.locator("[data-window='dialog']").count(), 0, "flyout dismissed with Escape");
await page.dblclick("[data-row]:has-text('placeholder page.html')");
await sleep(2000);
assert.match(await omni.inputValue(), /^file:\/\/\/C:\/Users\/.*placeholder page\.html$/);
console.log("file:/// open in Chrome ok");

// 4. WhatsApp: unlocked contact present, send -> mock reply
await page.click("[data-taskbar] [data-app='whatsapp']");
await page.waitForSelector("[data-window='whatsapp']");
await sleep(1000);
assert.ok(await page.locator("[data-window='whatsapp'] >> text=Placeholder Unlock").count() > 0, "trigger-unlocked contact listed");
await page.click("[data-window='whatsapp'] >> text=Placeholder A");
await page.fill("textarea[placeholder='Type a message']", "e2e hello");
await page.keyboard.press("Enter");
const deadline = Date.now() + 30000; let ok = false;
while (Date.now() < deadline) { if ((await page.locator("[data-window='whatsapp'] >> text=/mock deepseek-reasoner/").count()) > 0) { ok = true; break; } await sleep(300); }
assert.ok(ok, "LLM reply rendered");
await page.screenshot({ path: `${out}/06-whatsapp.png` });
console.log("whatsapp ok");

await app.close();
console.log("E2E PASSED");
