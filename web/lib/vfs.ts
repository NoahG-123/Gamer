/**
 * Virtual filesystem: merges generated dressing entries with story files and
 * applies story-state visibility. Paths use forward slashes internally
 * ("C:/Users/x/Documents"); the UI renders them with backslashes.
 */
import fs from "node:fs";
import path from "node:path";
import { loadContent, loadProfile, contentPath } from "./content";
import { allFlags, isVisible, revealedIds } from "./state";

export type FileKind = "text" | "html" | "image" | "pdf";

export interface DressingEntry { path: string; dir?: boolean; size?: number; created: string; modified: string; hidden?: boolean; system?: boolean; dressing?: boolean }
export interface StoryFile { path: string; kind: FileKind; size?: number; created: string; modified: string; body?: string; src?: string; hidden?: boolean; requires?: string[] }

export interface VfsNode {
  name: string;
  path: string;
  dir: boolean;
  size: number;
  created: string;
  modified: string;
  hidden: boolean;
  system: boolean;
  openable: boolean;
  kind?: FileKind;
  ext: string;
}

interface DressingFile { entries: DressingEntry[] }
interface StoryFileList { files: StoryFile[] }

export const DRIVES = [
  { letter: "C", label: "Local Disk", total: 476 * 1024 ** 3, free: 131 * 1024 ** 3, system: true },
  { letter: "D", label: "Data", total: 931 * 1024 ** 3, free: 402 * 1024 ** 3, system: false },
];

export function normalizePath(p: string): string {
  let s = p.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (/^[a-zA-Z]:$/.test(s)) s += "/";
  if (s.length > 3 && s.endsWith("/")) s = s.slice(0, -1);
  if (/^[a-z]:/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  if (/^[A-Z]:\/$/.test(s)) s = s.slice(0, 2); // "C:" is the drive root key
  return s;
}

export function parentPath(p: string): string | null {
  const n = normalizePath(p);
  if (/^[A-Z]:$/.test(n)) return null;
  const i = n.lastIndexOf("/");
  const parent = n.slice(0, i);
  return /^[A-Z]:$/.test(parent) ? parent : parent || null;
}

function baseName(p: string): string {
  const n = normalizePath(p);
  if (/^[A-Z]:$/.test(n)) return n;
  return n.slice(n.lastIndexOf("/") + 1);
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

interface Index { nodes: Map<string, VfsNode>; children: Map<string, VfsNode[]>; story: Map<string, StoryFile>; version: number }
let cached: Index | null = null;
let cacheKey = "";

function buildIndex(): Index {
  const dressing = loadContent<DressingFile>("filesystem/dressing.json");
  const story = loadContent<StoryFileList>("filesystem/story.json");
  const key = JSON.stringify([dressing.entries.length, story.files.length, loadProfile().username]);
  if (cached && cacheKey === key) return cached;

  const nodes = new Map<string, VfsNode>();
  const storyMap = new Map<string, StoryFile>();
  const ensureFolder = (p: string, created: string, modified: string) => {
    const n = normalizePath(p);
    if (nodes.has(n)) return;
    nodes.set(n, { name: baseName(n), path: n, dir: true, size: 0, created, modified, hidden: false, system: false, openable: true, ext: "" });
    const parent = parentPath(n);
    if (parent) ensureFolder(parent, created, modified);
  };
  for (const d of DRIVES) nodes.set(`${d.letter}:`, { name: `${d.letter}:`, path: `${d.letter}:`, dir: true, size: 0, created: "2021-06-14T09:12:41Z", modified: "2026-09-16T23:59:14Z", hidden: false, system: false, openable: true, ext: "" });

  for (const e of dressing.entries) {
    const p = normalizePath(e.path);
    const parent = parentPath(p);
    if (parent) ensureFolder(parent, e.created, e.modified);
    if (e.dir) {
      const existing = nodes.get(p);
      nodes.set(p, { name: baseName(p), path: p, dir: true, size: 0, created: e.created, modified: e.modified, hidden: !!e.hidden, system: !!e.system, openable: true, ext: "", ...(existing ? {} : {}) });
    } else {
      nodes.set(p, { name: baseName(p), path: p, dir: false, size: e.size ?? 0, created: e.created, modified: e.modified, hidden: !!e.hidden, system: !!e.system, openable: false, ext: extOf(baseName(p)) });
    }
  }
  for (const f of story.files) {
    const p = normalizePath(f.path);
    const parent = parentPath(p);
    if (parent) ensureFolder(parent, f.created, f.modified);
    let size = f.size;
    if (size === undefined) size = f.body ? Buffer.byteLength(f.body) : f.src ? safeSize(contentPath("filesystem", "assets", f.src)) : 0;
    nodes.set(p, { name: baseName(p), path: p, dir: false, size, created: f.created, modified: f.modified, hidden: false, system: false, openable: true, kind: f.kind, ext: extOf(baseName(p)) });
    storyMap.set(p, f);
  }

  const children = new Map<string, VfsNode[]>();
  for (const n of nodes.values()) {
    const parent = parentPath(n.path);
    if (!parent) continue;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(n);
  }
  // Windows sorts folders first, then names case-insensitively with natural numeric ordering.
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  for (const list of children.values()) list.sort((a, b) => (a.dir === b.dir ? collator.compare(a.name, b.name) : a.dir ? -1 : 1));

  cached = { nodes, children, story: storyMap, version: Date.now() };
  cacheKey = key;
  return cached;
}

function safeSize(p: string): number { try { return fs.statSync(p).size; } catch { return 0; } }

function storyVisible(f: StoryFile | undefined, flags: Record<string, unknown>, revealed: Set<string>): boolean {
  if (!f) return true;
  return isVisible(f, "file", normalizePath(f.path), flags, revealed);
}

export function getNode(p: string): VfsNode | null {
  const idx = buildIndex();
  const n = idx.nodes.get(normalizePath(p));
  if (!n) return null;
  if (!storyVisible(idx.story.get(n.path), allFlags(), revealedIds("file"))) return null;
  return n;
}

export interface ListOptions { showHidden?: boolean }

export function listDir(p: string, opts: ListOptions = {}): { node: VfsNode; children: VfsNode[] } | null {
  const idx = buildIndex();
  const n = idx.nodes.get(normalizePath(p));
  if (!n || !n.dir) return null;
  const flags = allFlags();
  const revealed = revealedIds("file");
  const kids = (idx.children.get(n.path) ?? []).filter((c) => (opts.showHidden || !c.hidden) && storyVisible(idx.story.get(c.path), flags, revealed));
  return { node: n, children: kids };
}

export function folderItemCount(p: string): number {
  const idx = buildIndex();
  return (idx.children.get(normalizePath(p)) ?? []).filter((c) => !c.hidden).length;
}

export function getStoryFile(p: string): StoryFile | null {
  const idx = buildIndex();
  const n = normalizePath(p);
  const f = idx.story.get(n);
  if (!f) return null;
  if (!storyVisible(f, allFlags(), revealedIds("file"))) return null;
  return f;
}

export function assetPath(src: string): string {
  const full = path.resolve(contentPath("filesystem", "assets"), src);
  if (!full.startsWith(path.resolve(contentPath("filesystem", "assets")))) throw new Error("bad asset path");
  return full;
}

export function userHome(): string {
  return `C:/Users/${loadProfile().username}`;
}

export function search(root: string, query: string, limit = 200): VfsNode[] {
  const idx = buildIndex();
  const q = query.toLowerCase();
  const r = normalizePath(root);
  const flags = allFlags();
  const revealed = revealedIds("file");
  const out: VfsNode[] = [];
  for (const n of idx.nodes.values()) {
    if (!n.path.startsWith(r === n.path ? r : r + "/") || n.path === r) continue;
    if (n.hidden) continue;
    if (!n.name.toLowerCase().includes(q)) continue;
    if (!storyVisible(idx.story.get(n.path), flags, revealed)) continue;
    out.push(n);
    if (out.length >= limit) break;
  }
  return out;
}

export function toWindowsPath(p: string): string {
  const n = normalizePath(p);
  return (/^[A-Z]:$/.test(n) ? n + "\\" : n.replace(/\//g, "\\"));
}
