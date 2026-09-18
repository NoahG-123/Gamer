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

Menu.setApplicationMenu(null);
app.commandLine.appendSwitch("disable-features", "OutOfBlinkCors");

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
function setupBrowserSession(): void {
  const ses = session.fromPartition(PARTITION);
  // Identify as the real Chrome build we are (Electron's default UA advertises Electron).
  ses.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`);
  ses.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
    try {
      const u = new URL(details.url);
      const host = u.hostname.toLowerCase();
      if (storyHosts.has(host)) {
        const canonical = host.replace(/^www\./, "");
        callback({ redirectURL: `${serverOrigin}/sites/${canonical}${u.pathname}${u.search}` });
        return;
      }
    } catch { /* fall through */ }
    callback({});
  });
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === "fullscreen" || permission === "clipboard-read" || permission === "clipboard-sanitized-write"));
  ses.setPermissionCheckHandler((_wc, permission) => permission === "fullscreen" || permission === "clipboard-read" || permission === "clipboard-sanitized-write");
}

app.on("web-contents-created", (_e, contents: WebContents) => {
  if (contents.getType() === "webview") {
    // Anything that wants a new window becomes a new tab in the fake Chrome.
    contents.setWindowOpenHandler(({ url }) => {
      const host = contents.hostWebContents;
      if (host && !host.isDestroyed()) host.send("open-tab", url);
      return { action: "deny" };
    });
    contents.on("will-attach-webview" as never, () => {});
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
      spellcheck: false,
      additionalArguments: [`--found-origin=${serverOrigin}`, `--found-partition=${PARTITION}`],
    },
  });
  mainWindow.webContents.on("will-attach-webview", (_e, webPreferences, params) => {
    delete (webPreferences as { preload?: string }).preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    if (params.partition !== PARTITION) params.partition = PARTITION;
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.loadURL(`${serverOrigin}/`);
}

ipcMain.on("quit", () => app.quit());
ipcMain.on("toggle-devtools", () => { if (isDev) mainWindow?.webContents.toggleDevTools(); });
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
  createWindow();
  // Hidden exits: Alt+F4 works as usual; this is the belt-and-braces one.
  globalShortcut.register("Control+Shift+Alt+Q", () => app.quit());
  if (isDev) globalShortcut.register("F12", () => mainWindow?.webContents.toggleDevTools());
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { globalShortcut.unregisterAll(); if (serverProc && !serverProc.killed) serverProc.kill(); });
