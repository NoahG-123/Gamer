import { NextRequest } from "next/server";
import { listDir, folderItemCount, userHome, DRIVES } from "@/lib/vfs";
import { recordEvent } from "@/lib/state";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("path") ?? userHome();
  const showHidden = req.nextUrl.searchParams.get("hidden") === "1";
  const record = req.nextUrl.searchParams.get("record") !== "0";
  const r = listDir(p, { showHidden });
  if (!r) return bad("not found", 404);
  if (record) recordEvent("folder.opened", r.node.path);
  const children = r.children.map((c) => (c.dir ? { ...c, items: folderItemCount(c.path) } : c));
  return json({ node: r.node, children, drives: DRIVES, home: userHome() });
}
