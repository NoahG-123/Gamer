import { NextRequest } from "next/server";
import { getNode, getStoryFile } from "@/lib/vfs";
import { recordEvent } from "@/lib/state";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";

/**
 * Open a file. Openable (story) files return a viewer descriptor; dressing
 * files return `openable: false` and the UI shows a realistic OS response.
 */
export async function POST(req: NextRequest) {
  const { path } = (await req.json().catch(() => ({}))) as { path?: string };
  if (!path) return bad("path required");
  const node = getNode(path);
  if (!node) return bad("not found", 404);
  const { fired } = recordEvent("file.opened", node.path, { openable: node.openable, ext: node.ext });
  if (!node.openable) return json({ openable: false, node, fired });
  const story = getStoryFile(node.path);
  if (!story) return json({ openable: false, node, fired });
  const rawUrl = `/lf/${encodeURIComponent(node.path).replace(/%2F/g, "/")}`;
  if (story.kind === "text") return json({ openable: true, node, viewer: "notepad", text: story.body ?? "", fired });
  return json({ openable: true, node, viewer: "chrome", url: rawUrl, kind: story.kind, fired });
}
