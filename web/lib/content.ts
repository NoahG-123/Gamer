import fs from "node:fs";
import path from "node:path";
import { contentDir } from "./paths";

export interface Profile {
  username: string;
  displayName: string;
  machineName: string;
  timezone: string;
  locale: string;
  accountEmail: string;
  wallpaper: string;
  accentColor: string;
  taskbarPins: string[];
  desktopIcons: string[];
  recycleBinEmpty: boolean;
}

const cache = new Map<string, { mtime: number; value: unknown }>();

function readJsonFile<T>(rel: string): T {
  const full = path.join(contentDir(), rel);
  const mtime = fs.statSync(full).mtimeMs;
  const hit = cache.get(full);
  if (hit && hit.mtime === mtime) return hit.value as T;
  const raw = fs.readFileSync(full, "utf8");
  const value = JSON.parse(raw) as T;
  cache.set(full, { mtime, value });
  return value;
}

export function loadProfile(): Profile {
  return readJsonFile<Profile>("profile.json");
}

/** Replace {user} tokens with the profile username. */
export function expandTokens(s: string, profile = loadProfile()): string {
  return s.replace(/\{user\}/g, profile.username);
}

function deepExpand<T>(value: T, profile: Profile): T {
  if (typeof value === "string") return expandTokens(value, profile) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepExpand(v, profile)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deepExpand(v, profile);
    return out as T;
  }
  return value;
}

/** Load a content JSON file with {user} expanded everywhere. */
export function loadContent<T>(rel: string): T {
  const profile = loadProfile();
  const key = `expanded:${rel}`;
  const full = path.join(contentDir(), rel);
  const mtime = fs.statSync(full).mtimeMs + fs.statSync(path.join(contentDir(), "profile.json")).mtimeMs;
  const hit = cache.get(key);
  if (hit && hit.mtime === mtime) return hit.value as T;
  const value = deepExpand(readJsonFile<T>(rel), profile);
  cache.set(key, { mtime, value });
  return value;
}

export function contentPath(...parts: string[]): string {
  return path.join(contentDir(), ...parts);
}

export function listCharacterIds(): string[] {
  const dir = contentPath("characters");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
}
