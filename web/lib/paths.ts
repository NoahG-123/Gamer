import path from "node:path";
import fs from "node:fs";

/** Directory holding all story/data content. Overridable so a packaged app can point at resources/content. */
export function contentDir(): string {
  const env = process.env.CONTENT_DIR;
  if (env) return env;
  const candidates = [
    path.join(process.cwd(), "content"),
    path.join(process.cwd(), "..", "content"),
    path.join(__dirname, "..", "..", "content"),
    path.join(__dirname, "..", "..", "..", "content"),
  ];
  for (const c of candidates) if (fs.existsSync(path.join(c, "profile.json"))) return c;
  return candidates[0];
}

/** Directory for runtime state (SQLite). Electron sets DATA_DIR to its userData folder. */
export function dataDir(): string {
  const d = process.env.DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(d, { recursive: true });
  return d;
}
