/**
 * Machine settings the player can actually change: volume, brightness, radios, theme,
 * accent colour, wallpaper. Stored in SQLite so they survive a restart, seeded from
 * content/profile.json the first time.
 */
import { db } from "./db";
import { loadProfile } from "./content";
import { publish } from "./bus";

export interface SettingsState {
  volume: number;        // 0-100, the app's own output level
  muted: boolean;
  brightness: number;    // 40-100, dims the screen inside the app
  wifi: boolean;
  bluetooth: boolean;
  airplane: boolean;
  nightLight: boolean;
  theme: "dark" | "light";
  accent: string;
  /** An asset-manifest key, or a path on this machine ("C:/Users/…/photo.jpg"). */
  wallpaper: string | null;
  wallpaperFit: "fill" | "fit" | "stretch" | "tile" | "centre" | "span";
}

function defaults(): SettingsState {
  const p = loadProfile() as unknown as { theme?: "dark" | "light"; accentColor?: string; wallpaper?: string };
  return {
    volume: 34, muted: true, brightness: 100,
    wifi: true, bluetooth: false, airplane: false, nightLight: false,
    theme: p.theme ?? "dark", accent: p.accentColor ?? "#0067C0",
    wallpaper: p.wallpaper ?? "wallpaper.desktop", wallpaperFit: "fill",
  };
}

export function getSettings(): SettingsState {
  const rows = db().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.map((r) => { try { return [r.key, JSON.parse(r.value)]; } catch { return [r.key, r.value]; } }));
  return { ...defaults(), ...stored } as SettingsState;
}

export function setSettings(patch: Partial<SettingsState>): SettingsState {
  const stmt = db().prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) stmt.run(k, JSON.stringify(v));
  const next = getSettings();
  publish({ type: "settings", settings: next as unknown as Record<string, unknown> });
  return next;
}
