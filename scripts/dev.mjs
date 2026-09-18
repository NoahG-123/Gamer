// Dev: Next.js dev server + Electron pointed at it. Loads .env for the server process.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PORT = process.env.PORT || "4127";
const env = { ...process.env };
if (fs.existsSync(".env")) for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !line.trim().startsWith("#") && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
env.DATA_DIR = env.DATA_DIR || path.resolve("data");
const next = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "web", "-p", PORT], { stdio: "inherit", env, shell: process.platform === "win32" });
const { execSync } = await import("node:child_process");
execSync("node scripts/build-electron.mjs", { stdio: "inherit" });
const electronBin = require("electron");
const url = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 300; i++) { try { const r = await fetch(`${url}/api/profile`); if (r.ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 500)); }
const el = spawn(electronBin, ["."], { stdio: "inherit", env: { ...env, FOUND_DEV_SERVER_URL: url } });
const stop = () => { try { next.kill(); } catch { /* ignore */ } try { el.kill(); } catch { /* ignore */ } };
el.on("exit", () => { stop(); process.exit(0); });
process.on("SIGINT", () => { stop(); process.exit(0); });
