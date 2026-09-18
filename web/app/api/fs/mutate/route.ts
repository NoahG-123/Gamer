import { NextRequest } from "next/server";
import { getNode, listDir, normalizePath, parentPath, toWindowsPath, contentSeed, resolveText, userHome } from "@/lib/vfs";
import { writeFile, mkdir, remove, restore, purge, binItems, emptyBin, rename as renameOv, copyTo, uniqueName, getOverlay } from "@/lib/fsmut";
import { recordEvent } from "@/lib/state";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";

/**
 * Every change the player makes to the machine: saving a file, creating one, renaming,
 * deleting to the Recycle Bin, restoring, emptying it, copying. The base world in
 * content/ is never touched; changes live in the SQLite overlay (lib/fsmut) and are
 * merged on top of it, so they survive restarts exactly like a real disk would.
 */
type Op =
  | { op: "save"; path: string; text: string }
  | { op: "new"; parent: string; kind: "text" | "folder"; name?: string }
  | { op: "rename"; path: string; name: string }
  | { op: "delete"; paths: string[]; permanent?: boolean }
  | { op: "restore"; paths: string[] }
  | { op: "emptyBin" }
  | { op: "copy"; paths: string[]; dest: string; move?: boolean };

const base = (p: string) => {
  const n = getNode(p);
  const ov = getOverlay(normalizePath(p));
  return { dir: !!n?.dir, seed: contentSeed(p), body: ov?.body ?? null, disk: ov?.disk ?? null, kind: (n?.kind as string | undefined) ?? null };
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Op | null;
  if (!body) return bad("bad request");

  switch (body.op) {
    case "save": {
      const p = normalizePath(body.path);
      const parent = parentPath(p);
      if (!parent || !getNode(parent)?.dir) return bad("the folder this file lives in no longer exists", 409);
      writeFile(p, body.text ?? "");
      recordEvent("file.saved", p, { length: (body.text ?? "").length });
      return json({ ok: true, path: p, node: getNode(p) });
    }
    case "new": {
      const parent = normalizePath(body.parent);
      const dir = listDir(parent, { showHidden: true });
      if (!dir) return bad("folder not found", 404);
      const taken = new Set(dir.children.map((c) => c.name));
      const isFolder = body.kind === "folder";
      const name = body.name?.trim() || uniqueName(taken, isFolder ? "New folder" : "New Text Document", isFolder ? "" : "txt");
      if (taken.has(name)) return bad("a file with that name already exists", 409);
      const p = `${parent}/${name}`;
      if (isFolder) mkdir(p); else writeFile(p, "");
      recordEvent(isFolder ? "folder.created" : "file.created", p);
      return json({ ok: true, path: p, node: getNode(p) });
    }
    case "rename": {
      const p = normalizePath(body.path);
      const node = getNode(p);
      if (!node) return bad("not found", 404);
      const parent = parentPath(p);
      const name = body.name.trim();
      if (!name || /[\\/:*?"<>|]/.test(name)) return bad("A file name can't contain any of the following characters:  \\ / : * ? \" < > |", 400);
      const to = `${parent}/${name}`;
      if (to !== p && getNode(to)) return bad("a file with that name already exists", 409);
      if (to !== p) { renameOv(p, to, base(p)); recordEvent("file.renamed", p, { to }); }
      return json({ ok: true, path: to, node: getNode(to) });
    }
    case "delete": {
      const done: string[] = [];
      for (const raw of body.paths) {
        const p = normalizePath(raw);
        const node = getNode(p);
        if (!node) continue;
        if (body.permanent) { remove(p, { seed: contentSeed(p), dir: node.dir }); purge(p); }
        else remove(p, { seed: contentSeed(p), dir: node.dir });
        done.push(p);
      }
      recordEvent("file.deleted", done[0] ?? "", { count: done.length, permanent: !!body.permanent });
      return json({ ok: true, deleted: done });
    }
    case "restore": {
      for (const raw of body.paths) restore(normalizePath(raw));
      return json({ ok: true });
    }
    case "emptyBin": {
      const n = emptyBin();
      recordEvent("bin.emptied", "", { count: n });
      return json({ ok: true, count: n });
    }
    case "copy": {
      const dest = normalizePath(body.dest);
      const dir = listDir(dest, { showHidden: true });
      if (!dir) return bad("destination not found", 404);
      const taken = new Set(dir.children.map((c) => c.name));
      const made: string[] = [];
      for (const raw of body.paths) {
        const p = normalizePath(raw);
        const node = getNode(p);
        if (!node) continue;
        const dot = node.name.lastIndexOf(".");
        const stem = dot > 0 ? node.name.slice(0, dot) : node.name;
        const ext = dot > 0 ? node.name.slice(dot + 1) : "";
        const name = taken.has(node.name) ? uniqueName(taken, `${stem} - Copy`, ext) : node.name;
        taken.add(name);
        const to = `${dest}/${name}`;
        copyTo(to, { ...base(p), body: resolveText(p) });
        if (body.move) remove(p, { seed: contentSeed(p), dir: node.dir });
        made.push(to);
      }
      return json({ ok: true, created: made });
    }
    default:
      return bad("unknown operation");
  }
}

/** Recycle Bin contents: what the player deleted, plus what was already in there. */
export async function GET() {
  const items = binItems()
    .filter((r) => r.origin !== "purged" && r.origin !== "renamed")
    .map((r) => {
      const name = r.path.slice(r.path.lastIndexOf("/") + 1);
      return { name, path: r.path, origin: toWindowsPath(r.path.slice(0, r.path.lastIndexOf("/"))), dir: r.dir, size: r.size, modified: r.modified, ext: name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "", deletedHere: true };
    });
  // Items that were in the bin before the player arrived live under C:\$Recycle.Bin\<SID>.
  const binRoot = listDir("C:/$Recycle.Bin", { showHidden: true });
  const sid = binRoot?.children.find((c) => c.dir);
  const old = sid ? (listDir(sid.path, { showHidden: true })?.children ?? []) : [];
  for (const n of old) items.push({ name: n.name, path: n.path, origin: toWindowsPath(userHome()), dir: n.dir, size: n.size, modified: n.modified, ext: n.ext, deletedHere: false });
  return json({ items });
}
