// Play: the production build of the content server + Electron, without packaging.
// `npm run dev` compiles every page on first visit (slow, meant for editing code);
// this runs the prebuilt standalone server, which is what the packaged exe uses.
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const PORT = process.env.PORT || "4128";

const env = { ...process.env };
if (!fs.existsSync(path.join(root, ".env")) && fs.existsSync(path.join(root, ".env.example"))) {
  fs.copyFileSync(path.join(root, ".env.example"), path.join(root, ".env"));
  console.log("\n  Created .env from .env.example. Paste your API key after DEEPSEEK_API_KEY= to make the characters reply.\n");
}
for (const line of fs.existsSync(path.join(root, ".env")) ? fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !line.trim().startsWith("#") && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (!env.DEEPSEEK_API_KEY && env.LLM_PROVIDER !== "mock") console.log("  (no DEEPSEEK_API_KEY in .env — characters will stay silent)\n");

const standalone = path.join(root, "web", ".next", "standalone");
const serverJs = path.join(standalone, "web", "server.js");
const buildStamp = path.join(root, "web", ".next", "BUILD_ID");
const srcNewer = () => {
  if (!fs.existsSync(buildStamp)) return true;
  const built = fs.statSync(buildStamp).mtimeMs;
  const newest = (dir) => { let m = 0; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === "node_modules" || e.name === ".next") continue; const p = path.join(dir, e.name); m = Math.max(m, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs); } return m; };
  return newest(path.join(root, "web")) > built;
};
if (!fs.existsSync(serverJs) || srcNewer()) {
  console.log("  Building the content server (one-time; ~1 min)...");
  execSync("npm run build:web", { stdio: "inherit", cwd: root, env });
}
// The standalone server expects static assets and public/ beside it (electron-builder's after-pack does the same copy).
fs.cpSync(path.join(root, "web", ".next", "static"), path.join(standalone, "web", ".next", "static"), { recursive: true });
fs.cpSync(path.join(root, "web", "public"), path.join(standalone, "web", "public"), { recursive: true });
execSync("node scripts/build-electron.mjs", { stdio: "inherit", cwd: root });

const serverEnv = { ...env, PORT, HOSTNAME: "127.0.0.1", NODE_ENV: "production", CONTENT_DIR: path.join(root, "content"), DATA_DIR: env.DATA_DIR || path.join(root, "data"), NEXT_TELEMETRY_DISABLED: "1" };
const server = spawn(process.execPath, [serverJs], { stdio: ["ignore", "ignore", "inherit"], env: serverEnv, cwd: path.join(standalone, "web") });
const url = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 300; i++) { try { const r = await fetch(`${url}/api/profile`); if (r.ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 300)); }
const el = spawn(require("electron"), ["."], { stdio: "inherit", cwd: root, env: { ...env, FOUND_DEV_SERVER_URL: url, FOUND_PLAY: "1" } });
const stop = () => { try { server.kill(); } catch { /* ignore */ } try { el.kill(); } catch { /* ignore */ } };
el.on("exit", () => { stop(); process.exit(0); });
process.on("SIGINT", () => { stop(); process.exit(0); });
