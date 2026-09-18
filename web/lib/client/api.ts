"use client";
import { useEffect } from "react";

export interface VfsNode { name: string; path: string; dir: boolean; size: number; created: string; modified: string; hidden: boolean; system: boolean; openable: boolean; kind?: string; ext: string; items?: number }
export interface Drive { letter: string; label: string; total: number; free: number; system: boolean }
export interface Profile { username: string; displayName: string; machineName: string; timezone: string; locale: string; accountEmail: string; wallpaper: string; accentColor: string; taskbarPins: string[]; desktopIcons: string[]; recycleBinEmpty: boolean; theme?: "dark" | "light"; tempUnit?: "C" | "F"; dateFormat?: string; laptop?: boolean; inputLanguage?: [string, string]; weather?: { temp: number; text: string; icon?: string }; trayIcons?: string[] }
export interface Contact { id: string; name: string; phone?: string; about?: string; avatar: { initials: string; color: string; src?: string }; presence?: "online" | "offline" | "lastSeen"; lastSeen?: string; character?: string | null; isGroup?: boolean; participants?: string[]; pinned?: boolean }
export interface Message { id: number; chatId: string; sender: string; text: string; at: string; status: "sent" | "delivered" | "read"; origin: string }
export interface ChatSummary { contact: Contact; last: Message | null; unread: number }
export interface Bookmark { id: string; title: string; url?: string; folder?: boolean; children?: Bookmark[] }
export interface HistoryEntry { url: string; title: string; visits: number }
export type OpenWith = "notepad" | "chrome" | "player" | "image";
export type OpenResult = { openable: false; node: VfsNode } | { openable: true; node: VfsNode; viewer: "notepad"; text: string; synthetic?: boolean } | { openable: true; node: VfsNode; viewer: "chrome"; url: string; kind: string; synthetic?: boolean };

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

export interface BinItem { name: string; path: string; origin: string; dir: boolean; size: number; modified: string; ext: string; deletedHere: boolean }
export interface DownloadItem { id: number; name: string; url: string; path: string; size: number; state: string; at: string }
export interface SettingsState { volume: number; muted: boolean; brightness: number; wifi: boolean; bluetooth: boolean; airplane: boolean; nightLight: boolean; theme: "dark" | "light"; accent: string; wallpaper: string | null; wallpaperFit: string }

export const api = {
  profile: () => get<{ profile: Profile; home: string; drives: Drive[]; serverTime: string }>("/api/profile"),
  list: (path: string, opts: { hidden?: boolean; record?: boolean } = {}) => get<{ node: VfsNode; children: VfsNode[]; drives: Drive[]; home: string }>(`/api/fs/list?path=${encodeURIComponent(path)}${opts.hidden ? "&hidden=1" : ""}${opts.record === false ? "&record=0" : ""}`),
  open: (path: string, withApp?: OpenWith) => post<OpenResult>("/api/fs/open", withApp ? { path, with: withApp } : { path }),
  search: (path: string, q: string) => get<{ results: VfsNode[] }>(`/api/fs/search?path=${encodeURIComponent(path)}&q=${encodeURIComponent(q)}`),
  chats: () => get<{ chats: ChatSummary[] }>("/api/messages"),
  messages: (chatId: string, since = 0, record = true) => get<{ contact: Contact; messages: Message[] }>(`/api/messages/${encodeURIComponent(chatId)}?since=${since}${record ? "" : "&record=0"}`),
  send: (chatId: string, text: string) => post<{ message: Message }>(`/api/messages/${encodeURIComponent(chatId)}`, { text }),
  markRead: (chatId: string) => post<{ ok: true }>(`/api/messages/${encodeURIComponent(chatId)}/read`, {}),
  browser: () => get<{ bookmarks: Bookmark[]; history: HistoryEntry[] }>("/api/browser"),
  visit: (url: string, title: string) => post<{ ok: true }>("/api/browser/visit", { url, title }),
  hosts: () => get<{ hosts: { host: string; title?: string }[]; match: string[] }>("/api/sites/hosts"),
  event: (type: string, subject = "", data: unknown = null) => post<{ id: number; fired: string[] }>("/api/state/events", { type, subject, data }),

  // --- changes the player makes to the machine ---
  save: (path: string, text: string) => post<{ ok: true; path: string; node: VfsNode }>("/api/fs/mutate", { op: "save", path, text }),
  create: (parent: string, kind: "text" | "folder", name?: string) => post<{ ok: true; path: string; node: VfsNode }>("/api/fs/mutate", { op: "new", parent, kind, name }),
  rename: (path: string, name: string) => post<{ ok: true; path: string; node: VfsNode }>("/api/fs/mutate", { op: "rename", path, name }),
  remove: (paths: string[], permanent = false) => post<{ ok: true; deleted: string[] }>("/api/fs/mutate", { op: "delete", paths, permanent }),
  restore: (paths: string[]) => post<{ ok: true }>("/api/fs/mutate", { op: "restore", paths }),
  emptyBin: () => post<{ ok: true; count: number }>("/api/fs/mutate", { op: "emptyBin" }),
  paste: (paths: string[], dest: string, move = false) => post<{ ok: true; created: string[] }>("/api/fs/mutate", { op: "copy", paths, dest, move }),
  bin: () => get<{ items: BinItem[] }>("/api/fs/mutate"),
  downloads: () => get<{ downloads: DownloadItem[] }>("/api/downloads"),
  settings: () => get<{ settings: SettingsState }>("/api/settings"),
  setSettings: (patch: Partial<SettingsState>) => post<{ settings: SettingsState }>("/api/settings", patch),
  tasks: () => get<{ processes: { name: string; pid: number; cpu: number; memMb: number; disk: number; network: number; app: boolean; status?: string }[]; totals: { cpu: number; memPct: number; memUsedGb: number; memTotalGb: number; diskPct: number; netMbps: number } }>("/api/tasks"),
};

export type LiveEvent = { type: string; [k: string]: unknown };

/** Subscribe to the server-sent event stream. */
export function useLiveEvents(handler: (ev: LiveEvent) => void): void {
  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    const connect = () => {
      if (closed) return;
      es = new EventSource("/api/events");
      es.onmessage = (m) => { try { handler(JSON.parse(m.data)); } catch { /* ignore */ } };
      es.onerror = () => { es?.close(); setTimeout(connect, 2000); };
    };
    connect();
    return () => { closed = true; es?.close(); };
  }, [handler]);
}

export function formatBytes(n: number): string {
  // Explorer style: KB with no decimals below 1 MB ("24 KB"), and "1.2 MB" etc. above.
  if (n < 1024) return `${n} bytes`;
  const kb = n / 1024;
  if (kb < 1024) return `${Math.ceil(kb).toLocaleString("en-US")} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 2 : mb < 100 ? 1 : 0)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;
}

export function formatSizeCol(n: number): string {
  // The Size column in Explorer is always in KB, rounded up.
  return `${Math.max(1, Math.ceil(n / 1024)).toLocaleString("en-US")} KB`;
}

export function formatDate(d: Date, dateFormat = "yyyy-MM-dd", locale = "en-US"): string {
  if (dateFormat === "yyyy-MM-dd") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return d.toLocaleDateString(locale, { month: "numeric", day: "numeric", year: "numeric" });
}
export function formatTime(d: Date, locale = "en-US"): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
export function formatDateTime(iso: string, locale = "en-US", dateFormat = "yyyy-MM-dd"): string {
  const d = new Date(iso);
  return `${formatDate(d, dateFormat, locale)} ${formatTime(d, locale)}`;
}

export function toWindowsPath(p: string): string {
  return /^[A-Z]:$/.test(p) ? p + "\\" : p.replace(/\//g, "\\");
}
