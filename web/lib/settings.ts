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
  /** Which network this machine is joined to. Always one of profile.network.known. */
  ssid: string;
  bluetooth: boolean;
  airplane: boolean;
  nightLight: boolean;
  theme: "dark" | "light";
  accent: string;
  /** An asset-manifest key, or a path on this machine ("C:/Users/…/photo.jpg"). */
  wallpaper: string | null;
  wallpaperFit: "fill" | "fit" | "stretch" | "tile" | "centre" | "span";
  /** Chrome's own preferences, so its settings page and its menus agree. */
  chromeBookmarksBar: boolean;
  chromeTabGroups: boolean;
  chromeZoom: number;
  chromeStartup: "ntp" | "continue";
  /** New-tab-page background: an asset-manifest key, a path on this machine, or null for none. */
  chromeNtpBackground: string | null;
  /** Display, from the System page. */
  resolution: string;
  scaling: number;
  /** What the lock screen shows under the clock, and whether it shows anything. */
  lockScreenStatus: "weather" | "calendar" | "mail" | "none";
  lockScreenTips: boolean;
  /** Accessibility, which the shell reads directly. */
  textScale: number;
  transparency: boolean;
  animations: boolean;
  /** Time & language. */
  autoTime: boolean;
  time24: boolean;
  /** Per-chat switches the messaging app offers: pin, mute, archive, favourite, unread. */
  chatFlags: Record<string, ChatFlags>;
  /** Message sounds in the messaging app, separate from the machine's own mute. */
  waSounds: boolean;
  /** Message ids the player has starred, which is what the Starred list shows. */
  starredMessages: StarredMessage[];
}

export interface ChatFlags { pinned?: boolean; muted?: boolean; archived?: boolean; favourite?: boolean; unread?: boolean }
export interface StarredMessage { id: number; chatId: string; name: string; text: string; at: string }

export interface NetworkProfile {
  ssid: string; security: string; band: string; protocol: string; ipv4: string; gateway: string;
  dns: string; mac: string; router: string;
  known: { ssid: string; security: string; auto: boolean }[];
  nearby: { ssid: string; bars: number; secure: boolean }[];
}

/** This machine's own Wi-Fi, from content/profile.json. */
export function networkProfile(): NetworkProfile {
  const p = loadProfile() as unknown as { network?: Partial<NetworkProfile> };
  const n = p.network ?? {};
  return {
    ssid: n.ssid ?? "Home", security: n.security ?? "WPA2-Personal", band: n.band ?? "5 GHz",
    protocol: n.protocol ?? "Wi-Fi 6 (802.11ax)", ipv4: n.ipv4 ?? "192.168.1.24",
    gateway: n.gateway ?? "192.168.1.1", dns: n.dns ?? "192.168.1.1", mac: n.mac ?? "00-00-00-00-00-00",
    router: n.router ?? "Router", known: n.known ?? [], nearby: n.nearby ?? [],
  };
}

function defaults(): SettingsState {
  const p = loadProfile() as unknown as { theme?: "dark" | "light"; accentColor?: string; wallpaper?: string };
  return {
    volume: 34, muted: true, brightness: 100,
    wifi: true, ssid: "", bluetooth: false, airplane: false, nightLight: false,
    theme: p.theme ?? "dark", accent: p.accentColor ?? "#0067C0",
    wallpaper: p.wallpaper ?? "wallpaper.desktop", wallpaperFit: "fill",
    chromeBookmarksBar: true, chromeTabGroups: true, chromeZoom: 1, chromeStartup: "ntp",
    chromeNtpBackground: "chrome.ntpBackground",
    resolution: "1920 x 1080", scaling: 100,
    lockScreenStatus: "weather", lockScreenTips: true,
    textScale: 100, transparency: true, animations: true,
    autoTime: true, time24: true,
    chatFlags: {}, waSounds: true, starredMessages: [],
  };
}

export function getSettings(): SettingsState {
  const rows = db().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.map((r) => { try { return [r.key, JSON.parse(r.value)]; } catch { return [r.key, r.value]; } }));
  const s = { ...defaults(), ...stored } as SettingsState;
  // The network name belongs to the world, not to this file: an install that has never
  // changed it shows whatever content/profile.json says the flat's Wi-Fi is called.
  if (!s.ssid) s.ssid = networkProfile().ssid;
  return s;
}

export function setSettings(patch: Partial<SettingsState>): SettingsState {
  const stmt = db().prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) stmt.run(k, JSON.stringify(v));
  const next = getSettings();
  publish({ type: "settings", settings: next as unknown as Record<string, unknown> });
  return next;
}
