/**
 * Virtual filesystem: merges generated dressing entries with story files and
 * applies story-state visibility. Paths use forward slashes internally
 * ("C:/Users/x/Documents"); the UI renders them with backslashes.
 */
import fs from "node:fs";
import path from "node:path";
import { loadContent, loadProfile, contentPath } from "./content";
import { allFlags, isVisible, revealedIds } from "./state";
import { allOverlay, getOverlay, OverlayRow } from "./fsmut";
import { synthText } from "./synthtext";
import { dressingKind } from "./synth";

export type FileKind = "text" | "html" | "image" | "pdf" | "audio";

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

/**
 * Cheap change detector for everything the index is built from. Stats the content
 * files at most every 300ms; the index is rebuilt only when one of them changes.
 */
let versionAt = 0, versionVal = "";
function contentVersion(): string {
  const now = Date.now();
  if (now - versionAt < 300) return versionVal;
  versionAt = now;
  const files = ["profile.json", "filesystem/dressing.json", "filesystem/story-dressing.json", "filesystem/story.json"].map((f) => contentPath(f));
  for (const dir of ["story", "bodies"]) { const d = contentPath("filesystem", dir); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) files.push(path.join(d, f)); }
  let v = "";
  for (const f of files) { try { v += fs.statSync(f).mtimeMs + "|"; } catch { v += "-|"; } }
  versionVal = v;
  return v;
}

function buildIndex(): Index {
  const key = contentVersion();
  if (cached && cacheKey === key) return cached;
  const dressing = loadContent<DressingFile>("filesystem/dressing.json");
  const story = loadStory();
  const extra = fs.existsSync(contentPath("filesystem", "story-dressing.json")) ? loadContent<DressingFile>("filesystem/story-dressing.json") : { entries: [] };
  // Never mutate the cached content objects; combine into a local list.
  const entries: DressingEntry[] = [...dressing.entries, ...extra.entries];

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

  for (const e of entries) {
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

/**
 * Story files come from filesystem/story.json plus every filesystem/story/*.json
 * (one file per topic keeps the world editable). Bodies may also be loaded from
 * `bodyFile` (relative to filesystem/bodies/) so long documents live as plain files.
 */
function loadStory(): StoryFileList {
  const base = loadContent<StoryFileList>("filesystem/story.json");
  const files = [...base.files];
  const dir = contentPath("filesystem", "story");
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) files.push(...loadContent<StoryFileList>(`filesystem/story/${f}`).files);
  for (const f of files as (StoryFile & { bodyFile?: string })[]) {
    if (f.bodyFile && f.body === undefined) {
      const full = path.resolve(contentPath("filesystem", "bodies"), f.bodyFile);
      f.body = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
    }
  }
  return { files };
}

export function allStoryFiles(): StoryFile[] { return [...buildIndex().story.values()]; }

function storyVisible(f: StoryFile | undefined, flags: Record<string, unknown>, revealed: Set<string>): boolean {
  if (!f) return true;
  return isVisible(f, "file", normalizePath(f.path), flags, revealed);
}

/** A node as the overlay describes it, inheriting what it does not override from the base entry. */
function overlayNode(r: OverlayRow, base?: VfsNode): VfsNode {
  const name = baseName(r.path);
  const size = r.body != null ? Buffer.byteLength(r.body) : base ? base.size : r.size;
  return {
    name, path: r.path, dir: r.dir, size,
    created: r.created, modified: r.modified,
    hidden: base?.hidden ?? false, system: base?.system ?? false,
    openable: true,
    kind: (r.kind as FileKind | null) ?? base?.kind,
    ext: extOf(name),
  };
}

function overlayMaps(): { byPath: Map<string, OverlayRow>; byParent: Map<string, OverlayRow[]> } {
  const byPath = new Map<string, OverlayRow>();
  const byParent = new Map<string, OverlayRow[]>();
  for (const r of allOverlay()) {
    byPath.set(r.path, r);
    if (r.deleted) continue;
    const parent = parentPath(r.path);
    if (!parent) continue;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)!.push(r);
  }
  return { byPath, byParent };
}

export function getNode(p: string): VfsNode | null {
  const idx = buildIndex();
  const n = normalizePath(p);
  const ov = getOverlay(n);
  if (ov?.deleted) return null;
  const base = idx.nodes.get(n);
  if (ov) return overlayNode(ov, base);
  if (!base) return null;
  if (!storyVisible(idx.story.get(base.path), allFlags(), revealedIds("file"))) return null;
  return base;
}

export interface ListOptions { showHidden?: boolean }

export function listDir(p: string, opts: ListOptions = {}): { node: VfsNode; children: VfsNode[] } | null {
  const idx = buildIndex();
  const path = normalizePath(p);
  const ov = overlayMaps();
  const ovSelf = ov.byPath.get(path);
  if (ovSelf?.deleted) return null;
  const base = idx.nodes.get(path);
  const node = base ?? (ovSelf?.dir ? overlayNode(ovSelf) : null);
  if (!node || !node.dir) return null;
  const flags = allFlags();
  const revealed = revealedIds("file");
  const kids: VfsNode[] = [];
  for (const c of idx.children.get(path) ?? []) {
    const o = ov.byPath.get(c.path);
    if (o?.deleted) continue;
    if (!opts.showHidden && c.hidden) continue;
    if (!o && !storyVisible(idx.story.get(c.path), flags, revealed)) continue;
    kids.push(o ? overlayNode(o, c) : c);
  }
  const known = new Set(kids.map((k) => k.path));
  for (const o of ov.byParent.get(path) ?? []) if (!known.has(o.path)) kids.push(overlayNode(o, idx.nodes.get(o.path)));
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  kids.sort((a, b) => (a.dir === b.dir ? collator.compare(a.name, b.name) : a.dir ? -1 : 1));
  return { node, children: kids };
}

export function folderItemCount(p: string): number {
  return listDir(p)?.children.length ?? 0;
}

export function getStoryFile(p: string): StoryFile | null {
  const idx = buildIndex();
  const n = normalizePath(p);
  const ov = getOverlay(n);
  if (ov?.deleted || ov?.body != null) return null; // deleted, or the player overwrote it
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
  const ov = overlayMaps();
  const out: VfsNode[] = [];
  const emit = (n: VfsNode) => { if (!out.some((x) => x.path === n.path)) out.push(n); };
  for (const o of ov.byParent.values()) for (const e of o) {
    if (!e.path.startsWith(r === e.path ? r : r + "/")) continue;
    if (!baseName(e.path).toLowerCase().includes(q)) continue;
    emit(overlayNode(e, idx.nodes.get(e.path)));
  }
  for (const n of idx.nodes.values()) {
    if (ov.byPath.get(n.path)?.deleted) continue;
    if (!n.path.startsWith(r === n.path ? r : r + "/") || n.path === r) continue;
    if (n.hidden) continue;
    if (!n.name.toLowerCase().includes(q)) continue;
    if (!storyVisible(idx.story.get(n.path), flags, revealed)) continue;
    emit(n);
    if (out.length >= limit) break;
  }
  return out;
}

export function toWindowsPath(p: string): string {
  const n = normalizePath(p);
  return (/^[A-Z]:$/.test(n) ? n + "\\" : n.replace(/\//g, "\\"));
}

/**
 * The text a file actually holds right now: what the player saved, else what it
 * inherits (a renamed copy keeps its old bytes), else the story body, else a
 * deterministic filler body. Returns null for things that are not text.
 */
export function resolveText(p: string): string | null {
  const n = normalizePath(p);
  const ov = getOverlay(n);
  if (ov?.deleted) return null;
  if (ov?.body != null) return ov.body;
  const seed = ov?.seed && ov.seed !== n ? normalizePath(ov.seed) : n;
  const story = buildIndex().story.get(seed);
  if (story) return story.body ?? "";
  const node = buildIndex().nodes.get(seed) ?? (ov ? overlayNode(ov) : null);
  if (!node || node.dir) return null;
  if (dressingKind(node.ext) !== "text") return null;
  return synthText(seed, node.ext, node.size);
}

/** What a path inherits its bytes from (used when copying or renaming). */
export function contentSeed(p: string): string {
  const ov = getOverlay(normalizePath(p));
  return ov?.seed ?? normalizePath(p);
}
