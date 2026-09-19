import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { userHome, listDir, normalizePath, getNode } from "@/lib/vfs";
import { addDownload, uniqueName } from "@/lib/fsmut";
import { dataDir } from "@/lib/paths";
import { recordEvent } from "@/lib/state";
import { publish } from "@/lib/bus";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Folders a "Save as" is allowed to write into: this computer's own, and nothing else. */
const FOLDERS = ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos"] as const;

export async function GET() {
  const home = userHome();
  return json({ home, folders: FOLDERS.map((f) => ({ name: f, path: `${home}/${f}` })) });
}

/**
 * "Save image as…" from the browser.
 *
 * The download manager already lands finished downloads in this computer's Downloads
 * folder. This is the other half of it: picking a folder yourself, so a picture saved out
 * of a page turns up where you put it in File Explorer and can be used as a wallpaper,
 * opened in Photos or Paint, or found by search — rather than only existing inside the
 * browser's own download list.
 *
 * The bytes are written into the app's own data folder and the file is registered against
 * a path in the virtual filesystem. Nothing is ever written to the machine this runs on.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { url?: string; folder?: string; name?: string } | null;
  if (!body?.url) return bad("url required");

  const home = userHome();
  const folder = normalizePath(body.folder && body.folder.startsWith(home) ? body.folder : `${home}/Downloads`);
  const dir = getNode(folder);
  if (!dir || !dir.dir) return bad("no such folder", 404);

  // Fetch the bytes. A /lf/ address is this machine's own filesystem, read back through
  // the same route the browser would have used, so a synthetic body saves exactly as shown.
  let bytes: Buffer;
  let suggested = "download";
  try {
    const target = body.url.startsWith("/") ? new URL(body.url, req.nextUrl.origin).toString() : body.url;
    const u = new URL(target);
    suggested = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "download");
    const res = await fetch(target, { headers: { accept: "*/*" } });
    if (!res.ok) return bad(`could not fetch (HTTP ${res.status})`, 502);
    bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length) return bad("nothing to save", 502);
  } catch (e) {
    return bad(`could not fetch: ${(e as Error).message}`, 502);
  }

  const wanted = (body.name || suggested).replace(/[\\/:*?"<>|]/g, "_").trim() || "download";
  const taken = new Set((listDir(folder, { showHidden: true })?.children ?? []).map((c) => c.name));
  const dot = wanted.lastIndexOf(".");
  const stem = dot > 0 ? wanted.slice(0, dot) : wanted;
  const ext = dot > 0 ? wanted.slice(dot + 1) : "";
  const name = taken.has(wanted) ? uniqueName(taken, stem, ext) : wanted;
  const vpath = normalizePath(`${folder}/${name}`);

  const store = path.join(dataDir(), "downloads");
  fs.mkdirSync(store, { recursive: true });
  let disk = path.join(store, name);
  for (let i = 1; fs.existsSync(disk); i++) disk = path.join(store, `${stem} (${i})${ext ? `.${ext}` : ""}`);
  fs.writeFileSync(disk, bytes);

  addDownload({ path: vpath, disk, size: bytes.length, url: body.url, name });
  recordEvent("file.downloaded", vpath, { url: body.url, savedAs: true });
  publish({ type: "ui.notify", app: "explorer", title: "Download complete", text: `${name} was saved to ${folder.replace(/\//g, "\\")}`, props: { path: folder } });

  return json({ ok: true, path: vpath, name, folder, size: bytes.length });
}
