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

/** The webview of the tab actually on screen (there is one per tab). */
const activeWebview = () => page.evaluate(() => {
  const all = [...document.querySelectorAll("webview")];
  const shown = all.find((w) => getComputedStyle(w).display !== "none") ?? all[0];
  return shown ? shown.getURL() : "";
});
/** Run an expression in the tab on screen. */
const inActiveWebview = (code) => page.evaluate((c) => {
  const all = [...document.querySelectorAll("webview")];
  const shown = all.find((w) => getComputedStyle(w).display !== "none") ?? all[0];
  return shown ? shown.executeJavaScript(c) : "";
}, code);
/** Bring Chrome to the front without toggling it shut, and return its omnibox. */
async function chromeOmni() {
  const win = page.locator("[data-window='chrome']");
  if (!(await win.count()) || !(await win.isVisible().catch(() => false))) {
    await page.click("[data-taskbar] [data-app='chrome']").catch(async () => {
      await page.click("[data-start]"); await sleep(400); await page.click("button:has-text('Google Chrome')");
    });
  }
  await page.waitForSelector("[data-window='chrome']", { state: "visible", timeout: 20000 });
  await win.click({ position: { x: 300, y: 8 } }).catch(() => {});
  await sleep(300);
  return page.locator("[data-window='chrome'] input[placeholder='Search Google or type a URL']");
}

// 3b. A file:// address must never reach the disk this is running on.
//     The world's paths look exactly like Windows paths, so an untouched one would send
//     Chromium looking on the host machine for a file that only exists inside the story.
{
  const o = await chromeOmni();
  await o.click();
  await o.fill("file:///C:/Users/wren/Desktop/slow_rooms_AF.7z?as=raw");
  await o.press("Enter");
  await sleep(3000);
  const u = await activeWebview();
  assert.ok(u.startsWith(`${SERVER}/lf/`), `file:// went to this computer's filesystem, not the host's: ${u}`);
  assert.ok(!u.startsWith("file:"), `no raw file: URL survived: ${u}`);
  const shown = await o.inputValue();
  assert.match(shown, /^file:\/\/\//, `and the address bar still reads as a file path: ${shown}`);
  await page.screenshot({ path: `${out}/07-file-url.png` });
  console.log("file:// contained:", u.slice(SERVER.length));
}

// 3c. The Chrome profile icon must never reach a real Google sign-in.
{
  const o = await chromeOmni();
  for (const target of ["myaccount.google.com", "accounts.google.com/ServiceLogin"]) {
    await o.click(); await o.fill(target); await o.press("Enter");
    await sleep(3000);
    const u = await activeWebview();
    assert.ok(u.startsWith(SERVER), `${target} was intercepted, not loaded from Google: ${u}`);
    const body = String(await inActiveWebview("document.body.innerText"));
    assert.ok(!/Forgot email|Create account|Use your Google Account/i.test(body), `${target} shows no real sign-in`);
  }
  await page.screenshot({ path: `${out}/08-account.png` });
  console.log("google account intercepted");
}

// 3d. Inspect opens a panel inside the tab rather than a window nobody can see.
{
  const o = await chromeOmni();
  await o.click(); await o.fill("harbourledger.ca"); await o.press("Enter");
  await sleep(2500);

  // The way a player reaches it: the ⋮ menu, More tools, Developer tools.
  await page.click("[data-window='chrome'] button[title='Customize and control Google Chrome']");
  await sleep(400);
  await page.click("[data-menu-root] >> text=More tools");
  await sleep(600);
  await page.click("[data-menu-root] >> text=Developer tools");
  await sleep(1500);
  assert.ok(await page.locator("[data-window='chrome'] >> text=Elements").count() > 0, "Inspect docks a devtools panel into the tab");
  assert.ok(await page.locator("[data-window='chrome'] >> text=Console").count() > 0, "with a console in it");

  // It reads the page it is docked to, rather than showing an empty tree.
  await sleep(1200);
  const tree = await page.locator("[data-window='chrome'] >> text=harbourledger").count().catch(() => 0);
  const nodes = await page.locator("[data-window='chrome'] [class*='node']").count();
  assert.ok(nodes > 3, `the element tree has the page in it (${nodes} nodes)`);
  void tree;
  await page.screenshot({ path: `${out}/09-inspect.png` });

  // And the keyboard shortcut closes it again from the browser chrome.
  await o.click();
  await page.keyboard.press("Control+Shift+I");
  await sleep(600);
  console.log("inspect ok:", nodes, "nodes in the element tree");
}

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
