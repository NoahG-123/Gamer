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
await omni.click(); await omni.fill("wrencastellanos.com"); await omni.press("Enter");
await sleep(2500);
assert.equal(await omni.inputValue(), "wrencastellanos.com", "address bar shows story host");
const wvUrl = await page.evaluate(() => { const w = document.querySelector("webview"); return w ? w.getURL() : ""; });
assert.ok(wvUrl.startsWith(`${SERVER}/sites/wrencastellanos.com`), `webview loaded local page: ${wvUrl}`);
await page.screenshot({ path: `${out}/02-chrome-story-site.png` });
console.log("intercept ok:", wvUrl);
// Second story host, and the Gmail clone as a single-page app
await omni.click(); await omni.fill("harbourledger.ca/archive/1971-mahar"); await omni.press("Enter");
await sleep(2000);
const ledgerText = await page.evaluate(() => document.querySelector("webview").executeJavaScript("document.body.innerText"));
assert.match(await ledgerText, /Colleen/, "story newspaper article served");
await omni.click(); await omni.fill("mail.google.com/mail/u/0/#inbox"); await omni.press("Enter");
await sleep(2500);
const gmailTitle = await page.evaluate(() => document.querySelector("webview")?.getTitle?.() ?? "");
assert.match(gmailTitle, /Gmail|Inbox/, "gmail clone loads");
await page.screenshot({ path: `${out}/03-gmail.png` });
// A real host must go to the network (proxy-blocked here, so we only assert it was NOT redirected locally)
await omni.click(); await omni.fill("example.com"); await omni.press("Enter");
await sleep(2500);
const realUrl = await page.evaluate(() => document.querySelector("webview").getURL());
assert.ok(!realUrl.startsWith(SERVER), `real host untouched by intercept: ${realUrl}`);
console.log("real host untouched:", realUrl);

// 2. Open the desktop README -> Notepad, which unlocks Wren on WhatsApp
await page.click("button[title='Show desktop']");
await sleep(300);
await page.dblclick("[data-desktop-icon]:has-text('READ ME')");
await page.waitForSelector("[data-window='notepad']");
const note = await page.locator("[data-window='notepad'] textarea").inputValue();
assert.match(note, /Colleen Anne Mahar/, "README is the story readme");
await page.screenshot({ path: `${out}/04-notepad.png` });

// 3. Terminal: cd into a repo, git log, then decrypt the archive
await page.click("[data-taskbar] [data-app='terminal']").catch(async () => { await page.click("[data-start]"); await sleep(500); await page.click("button:has-text('Terminal')"); });
await page.waitForSelector("[data-window='terminal']");
await sleep(600);
const type = async (s) => { await page.locator("[data-window='terminal'] input").fill(s); await page.keyboard.press("Enter"); await sleep(700); };
await type("cd Projects\\witness");
await type("git log --oneline");
await type("cd ..\\..\\Desktop");
await type("7z x slow_rooms_AF.7z");
await sleep(500);
await page.locator("[data-window='terminal'] input").fill("she had her mothers ring on");
await page.keyboard.press("Enter");
await sleep(1200);
const termText = await page.locator("[data-window='terminal']").innerText();
assert.match(termText, /seeding tonight/, "git history rendered");
assert.match(termText, /Everything is Ok/, "archive decrypted");
await page.screenshot({ path: `${out}/05-terminal-decrypt.png` });
const st = await (await fetch(`${SERVER}/api/state`)).json();
assert.equal(st.flags.decrypted_excerpt, true, "decryption set the flag");
console.log("terminal + decrypt ok");

// 4. WhatsApp: Wren unlocked (README), send -> mock reply
await page.click("[data-taskbar] [data-app='whatsapp']");
await page.waitForSelector("[data-window='whatsapp']");
await sleep(1200);
assert.ok(await page.locator("[data-window='whatsapp']").innerText().then((t) => /506|Priya/.test(t)), "contacts listed");
await page.click("[data-window='whatsapp'] >> text=Priya");
await page.fill("textarea[placeholder='Type a message']", "e2e hello");
await page.keyboard.press("Enter");
const deadline = Date.now() + 30000; let ok = false;
while (Date.now() < deadline) { if ((await page.locator("[data-window='whatsapp'] >> text=/mock/").count()) > 0) { ok = true; break; } await sleep(300); }
assert.ok(ok, "LLM reply rendered");
await page.screenshot({ path: `${out}/06-whatsapp.png` });
console.log("whatsapp ok");

await app.close();
console.log("E2E PASSED");
