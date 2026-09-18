/**
 * Writable layer over the virtual filesystem.
 *
 * The world in content/ is read-only; everything the player does to the machine
 * (saving in Notepad, creating a folder, renaming, deleting, emptying the Recycle
 * Bin, a browser download landing in Downloads) is stored here in SQLite and
 * merged on top of the base index by lib/vfs.
 *
 * A row either holds `body` (real content typed or written by the player), or a
 * `seed` pointing at the path whose content it inherits — so renaming a file keeps
 * the bytes it had, instead of re-rolling the synthetic body from its new name.
 */
import { db } from "./db";
import { publish } from "./bus";

export interface OverlayRow {
  path: string;
  dir: boolean;
  body: string | null;
  seed: string | null;
  /** Absolute path of a real file in the app's own data folder (a completed download). */
  disk: string | null;
  kind: string | null;
  created: string;
  modified: string;
  deleted: boolean;
  origin: string | null;
  size: number;
}

interface Raw { path: string; dir: number; body: string | null; seed: string | null; disk: string | null; kind: string | null; created: string; modified: string; deleted: number; origin: string | null; size: number }

const now = () => new Date().toISOString();
let version = 0;
export function overlayVersion(): number { return version; }
function bump(paths: string[]): void { version++; publish({ type: "fs.changed", paths }); }

function row(r: Raw): OverlayRow {
  return { path: r.path, dir: !!r.dir, body: r.body, seed: r.seed, disk: r.disk ?? null, kind: r.kind, created: r.created, modified: r.modified, deleted: !!r.deleted, origin: r.origin, size: r.size };
}

export function allOverlay(): OverlayRow[] {
  return (db().prepare("SELECT * FROM fs_overlay").all() as unknown as Raw[]).map(row);
}
export function getOverlay(path: string): OverlayRow | null {
  const r = db().prepare("SELECT * FROM fs_overlay WHERE path = ?").get(path) as unknown as Raw | undefined;
  return r ? row(r) : null;
}
/** Everything currently in the Recycle Bin, newest first. */
export function binItems(): OverlayRow[] {
  return (db().prepare("SELECT * FROM fs_overlay WHERE deleted = 1 ORDER BY modified DESC").all() as unknown as Raw[]).map(row);
}

function upsert(o: Partial<OverlayRow> & { path: string }): void {
  const cur = getOverlay(o.path);
  const merged: OverlayRow = {
    path: o.path,
    dir: o.dir ?? cur?.dir ?? false,
    body: o.body !== undefined ? o.body : cur?.body ?? null,
    seed: o.seed !== undefined ? o.seed : cur?.seed ?? null,
    disk: o.disk !== undefined ? o.disk : cur?.disk ?? null,
    kind: o.kind !== undefined ? o.kind : cur?.kind ?? null,
    created: cur?.created ?? o.created ?? now(),
    modified: o.modified ?? now(),
    deleted: o.deleted ?? cur?.deleted ?? false,
    origin: o.origin !== undefined ? o.origin : cur?.origin ?? null,
    size: o.size ?? (o.body != null ? Buffer.byteLength(o.body) : cur?.size ?? 0),
  };
  db().prepare(`INSERT INTO fs_overlay(path, dir, body, seed, disk, kind, created, modified, deleted, origin, size)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(path) DO UPDATE SET dir=excluded.dir, body=excluded.body, seed=excluded.seed, disk=excluded.disk, kind=excluded.kind,
      modified=excluded.modified, deleted=excluded.deleted, origin=excluded.origin, size=excluded.size`)
    .run(merged.path, merged.dir ? 1 : 0, merged.body, merged.seed, merged.disk, merged.kind, merged.created, merged.modified, merged.deleted ? 1 : 0, merged.origin, merged.size);
}

/** Save text to a path (Notepad's Save / Save As, `>` in the terminal, a download). */
export function writeFile(path: string, body: string, opts: { kind?: string } = {}): void {
  upsert({ path, dir: false, body, seed: null, kind: opts.kind ?? "text", deleted: false, origin: null, size: Buffer.byteLength(body) });
  bump([path]);
}

/** Register a completed browser download: the bytes sit in the app's data folder, the file shows up in Downloads. */
export function addDownload(opts: { path: string; disk: string; size: number; url: string; name: string }): void {
  upsert({ path: opts.path, dir: false, body: null, seed: null, disk: opts.disk, deleted: false, origin: null, size: opts.size });
  db().prepare("INSERT INTO downloads(name, url, path, size, state) VALUES (?,?,?,?, 'complete')").run(opts.name, opts.url, opts.path, opts.size);
  bump([opts.path]);
}

export function listDownloads(limit = 50): { id: number; name: string; url: string; path: string; size: number; state: string; at: string }[] {
  return db().prepare("SELECT id, name, url, path, size, state, at FROM downloads ORDER BY id DESC LIMIT ?").all(limit) as never;
}

export function mkdir(path: string): void {
  upsert({ path, dir: true, body: null, deleted: false, origin: null, size: 0 });
  bump([path]);
}

/** Send to the Recycle Bin. `seed` keeps the original content reachable for restore. */
export function remove(path: string, opts: { seed?: string; dir?: boolean } = {}): void {
  const cur = getOverlay(path);
  upsert({ path, dir: opts.dir ?? cur?.dir ?? false, seed: cur?.seed ?? opts.seed ?? path, deleted: true, origin: path, modified: now() });
  bump([path]);
}

/** Put a deleted item back where it came from. */
export function restore(path: string): void {
  const cur = getOverlay(path);
  if (!cur) return;
  if (cur.body === null && cur.disk === null && cur.seed === cur.path) db().prepare("DELETE FROM fs_overlay WHERE path = ?").run(path);
  else upsert({ path, deleted: false, origin: null });
  bump([path]);
}

/** Permanently gone: the tombstone stays so the base file stays hidden, but the body is dropped. */
export function purge(path: string): void {
  const cur = getOverlay(path);
  if (!cur) return;
  db().prepare("UPDATE fs_overlay SET body = NULL, seed = NULL, disk = NULL, deleted = 1, origin = 'purged' WHERE path = ?").run(path);
  bump([path]);
}

export function emptyBin(): number {
  const items = binItems();
  for (const i of items) purge(i.path);
  return items.length;
}

/** True when a path has been deleted or purged (so the base entry must not show). */
export function isTombstoned(path: string): boolean {
  const r = getOverlay(path);
  return !!r && r.deleted;
}

export function rename(from: string, to: string, base: { dir: boolean; seed: string | null; body: string | null; disk?: string | null; kind?: string | null }): void {
  const cur = getOverlay(from);
  upsert({ path: to, dir: base.dir, body: cur?.body ?? base.body, seed: cur?.seed ?? base.seed ?? from, disk: cur?.disk ?? base.disk ?? null, kind: base.kind ?? null, deleted: false, origin: null });
  upsert({ path: from, dir: base.dir, seed: cur?.seed ?? base.seed ?? from, deleted: true, origin: "renamed" });
  bump([from, to]);
}

export function copyTo(dest: string, base: { dir: boolean; seed: string | null; body: string | null; disk?: string | null; kind?: string | null }): void {
  upsert({ path: dest, dir: base.dir, body: base.body, seed: base.seed, disk: base.disk ?? null, kind: base.kind ?? null, deleted: false, origin: null });
  bump([dest]);
}

/** A free filename in a folder: "New Text Document (2).txt" style. */
export function uniqueName(existing: Set<string>, base: string, ext: string): string {
  const dot = ext ? `.${ext}` : "";
  if (!existing.has(`${base}${dot}`)) return `${base}${dot}`;
  for (let i = 2; i < 500; i++) if (!existing.has(`${base} (${i})${dot}`)) return `${base} (${i})${dot}`;
  return `${base} (${Date.now()})${dot}`;
}
