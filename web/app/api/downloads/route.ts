import { NextRequest } from "next/server";
import { addDownload, listDownloads, uniqueName } from "@/lib/fsmut";
import { userHome, listDir, normalizePath } from "@/lib/vfs";
import { recordEvent } from "@/lib/state";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";

/**
 * The browser's download manager. Electron hands downloads here instead of writing to the
 * real machine: the bytes land in the app's own data folder and the file appears in this
 * computer's Downloads folder, where it opens like anything else.
 */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as { name?: string; disk?: string; size?: number; url?: string } | null;
  if (!b?.name || !b.disk) return bad("name and disk required");
  const dir = `${userHome()}/Downloads`;
  const taken = new Set((listDir(dir, { showHidden: true })?.children ?? []).map((c) => c.name));
  const dot = b.name.lastIndexOf(".");
  const stem = dot > 0 ? b.name.slice(0, dot) : b.name;
  const ext = dot > 0 ? b.name.slice(dot + 1) : "";
  const name = taken.has(b.name) ? uniqueName(taken, stem, ext) : b.name;
  const path = normalizePath(`${dir}/${name}`);
  addDownload({ path, disk: b.disk, size: b.size ?? 0, url: b.url ?? "", name });
  recordEvent("file.downloaded", path, { url: b.url ?? "" });
  return json({ ok: true, path, name });
}

export async function GET() { return json({ downloads: listDownloads() }); }
