/**
 * Electron shell. Boots straight into the desktop: no splash, no menu, no title.
 *  - starts (or attaches to) the local Next.js content server
 *  - one fullscreen frameless window showing the desktop shell
 *  - the browser tabs live in the "persist:browser" session, where story hosts are
 *    redirected to the local server before any network request is made
 */
import { app, BrowserWindow, session, ipcMain, Menu, globalShortcut, WebContents } from "electron";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import { spawn, ChildProcess } from "node:child_process";

const PARTITION = "persist:browser";
const isDev = !app.isPackaged;
let serverProc: ChildProcess | null = null;
let serverOrigin = "";
let storyHosts = new Set<string>();
let mainWindow: BrowserWindow | null = null;
/** Whether this computer's Wi-Fi is on. The desktop pushes it whenever the setting changes. */
let netOnline = true;

Menu.setApplicationMenu(null);
/**
 * Everything Chromium has that could offer to sign this machine in to a Google account is
 * turned off here, at the command line, before any window exists. Electron does not ship
 * Chrome Sync, but the identity plumbing that puts up account and profile prompts is still
 * compiled in; with these off there is nothing left to prompt with, and the URL intercept
 * below means a real sign-in page is never reachable in the first place.
 */
app.commandLine.appendSwitch("disable-features", [
  "OutOfBlinkCors",
  "AccountConsistency", "IdentityConsistency", "MirrorAccountConsistency",
  "SigninSupport", "ChromeSignin", "DiceWebSigninInterception", "ForceSigninReauth",
  "SyncEnableHistoryDataType", "EnableSyncPromos", "SigninPromo",
  "AutofillServerCommunication", "OptimizationHints", "InterestFeedV2",
  "MediaRouter", "TranslateUI", "SafeBrowsingEnhancedProtection",
].join(","));
app.commandLine.appendSwitch("disable-sync");
app.commandLine.appendSwitch("disable-signin-promo");
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-client-side-phishing-detection");
app.commandLine.appendSwitch("disable-domain-reliability");

// ---------- environment ----------
function loadEnvFiles(): void {
  const candidates = [
    process.env.PORTABLE_EXECUTABLE_DIR ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, ".env") : "",
    path.join(path.dirname(process.execPath), ".env"),
    path.join(app.getPath("userData"), ".env"),
    isDev ? path.join(__dirname, "..", "..", ".env") : "",
  ].filter(Boolean);
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function resourcePath(...p: string[]): string {
  return isDev ? path.join(__dirname, "..", "..", ...p) : path.join(process.resourcesPath, ...p);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => { const a = srv.address(); srv.close(() => (typeof a === "object" && a ? resolve(a.port) : reject(new Error("no port")))); });
    srv.on("error", reject);
  });
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not start: ${url}`);
}

// ---------- content server ----------
async function startServer(): Promise<string> {
  if (process.env.FOUND_DEV_SERVER_URL) {
    await waitFor(`${process.env.FOUND_DEV_SERVER_URL}/api/profile`, 60000);
    return process.env.FOUND_DEV_SERVER_URL;
  }
  const port = await freePort();
  const serverDir = resourcePath("web");
  const serverJs = path.join(serverDir, "web", "server.js");
  if (!fs.existsSync(serverJs)) throw new Error(`content server missing at ${serverJs}`);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    CONTENT_DIR: resourcePath("content"),
    DATA_DIR: app.getPath("userData"),
    NEXT_TELEMETRY_DISABLED: "1",
  };
  delete env.NODE_OPTIONS; // packaged Electron rejects most of these; the child must not inherit them
  const debug = isDev || process.env.FOUND_DEBUG === "1";
  serverProc = spawn(process.execPath, [serverJs], { env, cwd: path.join(serverDir, "web"), stdio: debug ? "inherit" : "ignore", windowsHide: true });
  serverProc.on("exit", (code) => { if (!app.isPackaged) console.error("[server] exited", code); });
  const origin = `http://127.0.0.1:${port}`;
  await waitFor(`${origin}/api/profile`, 60000);
  return origin;
}

async function refreshHosts(): Promise<void> {
  try {
    const r = await fetch(`${serverOrigin}/api/sites/hosts`);
    const d = (await r.json()) as { match: string[] };
    storyHosts = new Set(d.match.map((h) => h.toLowerCase()));
  } catch { /* keep previous */ }
}

// ---------- URL intercept ----------

/**
 * Anything that would put a real Google sign-in in front of the player. The account
 * domains themselves are story hosts (content/sites/hosts.json) and are caught by name;
 * this catches the sign-in and OAuth paths that live under domains which are not.
 */
const SIGNIN_PATH = /^\/(accounts|signin|ServiceLogin|o\/oauth2|AccountChooser|logout|CheckCookie|AddSession)(\/|$)/i;
function isSignIn(u: URL): boolean {
  const host = u.hostname.toLowerCase();
  if (!/(^|\.)(google\.[a-z.]+|googleapis\.com|youtube\.com|gstatic\.com)$/.test(host)) return false;
  return SIGNIN_PATH.test(u.pathname) || /[?&](service|continue)=/i.test(u.search) && /signin|accounts/i.test(u.pathname);
}

/**
 * A browser tab must never be able to read the disk this is running on.
 *
 * The world has its own filesystem, and its paths look exactly like Windows paths
 * ("C:/Users/<owner>/Desktop/..."). When one of those reaches Chromium as a real
 * file:// URL it goes looking on the host machine for a file that only exists inside
 * the story, which is both a dead end and a way out of the sandbox. Every file:// request
 * in the browser partition is therefore answered by the content server instead, from the
 * virtual filesystem, and nothing else is served from disk at all.
 */
function containFileUrls(ses: Electron.Session): void {
  try {
    ses.protocol.handle("file", async (request) => {
      let inner = "";
      try {
        const u = new URL(request.url);
        inner = decodeURIComponent(u.pathname).replace(/^\/+/, "");
        if (!inner) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
        const target = `${serverOrigin}/lf/${inner.split("/").map(encodeURIComponent).join("/")}${u.search}`;
        const range = request.headers.get("range");
        return await fetch(target, { headers: range ? { range } : {} });
      } catch {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
    });
  } catch (e) {
    // An older Electron without protocol.handle: the renderer-side guard still applies.
    console.warn("[found] file:// containment unavailable:", (e as Error).message);
  }
}

function setupBrowserSession(): void {
  const ses = session.fromPartition(PARTITION);
  // Identify as the real Chrome build we are (Electron's default UA advertises Electron).
  ses.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`);
  ses.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
    try {
      const u = new URL(details.url);
      const host = u.hostname.toLowerCase();
      // Wi-Fi off: nothing leaves this machine, and pages land on Chrome's offline page.
      if (!netOnline && host !== "127.0.0.1" && host !== "localhost") {
        if (details.resourceType === "mainFrame") { callback({ redirectURL: `${serverOrigin}/chrome/offline?u=${encodeURIComponent(details.url)}` }); return; }
        callback({ cancel: true });
        return;
      }
      if (storyHosts.has(host)) {
        const canonical = host.replace(/^www\./, "");
        callback({ redirectURL: `${serverOrigin}/sites/${canonical}${u.pathname}${u.search}` });
        return;
      }
      // A sign-in page under a Google domain that is not itself a story host.
      if (isSignIn(u)) {
        if (details.resourceType === "mainFrame") { callback({ redirectURL: `${serverOrigin}/sites/accounts.google.com/` }); return; }
        callback({ cancel: true });
        return;
      }
    } catch { /* fall through */ }
    callback({});
  });
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === "fullscreen" || permission === "clipboard-read" || permission === "clipboard-sanitized-write"));
  ses.setPermissionCheckHandler((_wc, permission) => permission === "fullscreen" || permission === "clipboard-read" || permission === "clipboard-sanitized-write");
  // Chromium asks for these on its own; nothing in here has an account to sign in to.
  ses.setSpellCheckerEnabled(false);
  containFileUrls(ses);
  captureDownloads(ses);
}

/**
 * Downloads never touch the machine this is running on. Chromium is pointed at a folder
 * inside the app's own data directory, and the finished file is registered with the
 * content server so it turns up in this computer's Downloads folder.
 */
function captureDownloads(ses: Electron.Session): void {
  const dir = path.join(app.getPath("userData"), "downloads");
  ses.on("will-download", (_e, item) => {
    fs.mkdirSync(dir, { recursive: true });
    const safe = item.getFilename().replace(/[\\/:*?"<>|]/g, "_") || "download";
    let target = path.join(dir, safe);
    for (let i = 1; fs.existsSync(target); i++) {
      const dot = safe.lastIndexOf(".");
      target = path.join(dir, dot > 0 ? `${safe.slice(0, dot)} (${i})${safe.slice(dot)}` : `${safe} (${i})`);
    }
    item.setSavePath(target);
    const url = item.getURL();
    item.once("done", (_ev, state) => {
      if (state !== "completed") return;
      fetch(`${serverOrigin}/api/downloads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: path.basename(target), disk: target, size: item.getTotalBytes(), url }),
      }).catch(() => { /* the file is still on disk; it just is not listed */ });
    });
  });
}

/**
 * Chrome's keyboard shortcuts, while the page itself has focus.
 *
 * A <webview> is its own process: once the player clicks into a page, every key goes to
 * the guest and the browser chrome around it never sees Ctrl+T, Ctrl+F or Ctrl+Shift+I
 * again. Chrome handles those above the page, so they are lifted out of the guest here
 * and handed back to the shell, which acts on them exactly as it does from the toolbar.
 */
const SHORTCUTS: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; name: string }[] = [
  { key: "I", ctrl: true, shift: true, name: "inspect" },
  { key: "U", ctrl: true, name: "view-source" },
  { key: "F", ctrl: true, name: "find" },
  { key: "T", ctrl: true, name: "new-tab" },
  { key: "W", ctrl: true, name: "close-tab" },
  { key: "L", ctrl: true, name: "omnibox" },
  { key: "D", ctrl: true, name: "bookmark" },
  { key: "H", ctrl: true, name: "history" },
  { key: "J", ctrl: true, name: "downloads" },
  { key: "S", ctrl: true, name: "save-page" },
  { key: "R", ctrl: true, name: "reload" },
  { key: "ArrowLeft", alt: true, name: "back" },
  { key: "ArrowRight", alt: true, name: "forward" },
];

app.on("web-contents-created", (_e, contents: WebContents) => {
  if (contents.getType() === "webview") {
    // Anything that wants a new window becomes a new tab in the fake Chrome.
    contents.setWindowOpenHandler(({ url }) => {
      const host = contents.hostWebContents;
      if (host && !host.isDestroyed()) host.send("open-tab", url);
      return { action: "deny" };
    });
    contents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      const hit = SHORTCUTS.find((s) => s.key.toLowerCase() === String(input.key).toLowerCase()
        && !!s.ctrl === (input.control || input.meta) && !!s.shift === input.shift && !!s.alt === input.alt);
      if (!hit) return;
      const host = contents.hostWebContents;
      if (!host || host.isDestroyed()) return;
      event.preventDefault();
      host.send("chrome-shortcut", hit.name);
    });
    contents.on("will-attach-webview" as never, () => {});
    return; // a browser tab keeps its devtools: Inspect is a real Chrome feature
  }
  if (!isDev) contents.on("devtools-opened", () => contents.closeDevTools());
});

// ---------- window ----------
function createWindow(): void {
  mainWindow = new BrowserWindow({
    show: false,
    frame: false,
    fullscreen: !isDev || process.env.FOUND_WINDOWED !== "1",
    width: 1600, height: 900,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    title: "",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      plugins: true,
      spellcheck: false,
      additionalArguments: [`--found-origin=${serverOrigin}`, `--found-partition=${PARTITION}`],
    },
  });
  mainWindow.webContents.on("will-attach-webview", (_e, webPreferences, params) => {
    delete (webPreferences as { preload?: string }).preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    // Without this Chromium has no PDF viewer and hands every PDF to the download manager.
    webPreferences.plugins = true;
    if (params.partition !== PARTITION) params.partition = PARTITION;
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.loadURL(`${serverOrigin}/`);
}

ipcMain.on("quit", () => app.quit());
ipcMain.on("net-state", (_e, online: boolean) => { netOnline = !!online; });
ipcMain.on("toggle-devtools", () => { if (isDev) mainWindow?.webContents.toggleDevTools(); });
/** Chrome's Inspect / View source, on the webview that asked for it. */
ipcMain.on("webview-devtools", (e) => {
  const wc = e.sender.hostWebContents ? e.sender : e.sender;
  const target = wc.getType() === "webview" ? wc : null;
  if (target) target.isDevToolsOpened() ? target.closeDevTools() : target.openDevTools({ mode: "bottom" });
});
ipcMain.handle("tab-devtools", (_e, webContentsId: number) => {
  const wc = require("electron").webContents.fromId(webContentsId) as WebContents | undefined;
  if (!wc) return false;
  if (wc.isDevToolsOpened()) wc.closeDevTools(); else wc.openDevTools({ mode: "bottom" });
  return true;
});
ipcMain.handle("origin", () => serverOrigin);

app.whenReady().then(async () => {
  loadEnvFiles();
  try {
    serverOrigin = await startServer();
  } catch (e) {
    console.error("[found] failed to start content server:", e);
    if (process.env.FOUND_DEBUG === "1") { const { dialog } = await import("electron"); dialog.showErrorBox("Startup failed", String(e)); }
    app.quit();
    return;
  }
  await refreshHosts();
  setInterval(refreshHosts, 30000);
  setupBrowserSession();
  captureDownloads(session.defaultSession);
  createWindow();
  // Hidden exits: Alt+F4 works as usual; this is the belt-and-braces one.
  globalShortcut.register("Control+Shift+Alt+Q", () => app.quit());
  if (isDev) globalShortcut.register("F12", () => mainWindow?.webContents.toggleDevTools());
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { globalShortcut.unregisterAll(); if (serverProc && !serverProc.killed) serverProc.kill(); });
