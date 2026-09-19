import { NextRequest } from "next/server";
import { getNode, getStoryFile, resolveText } from "@/lib/vfs";
import { recordEvent } from "@/lib/state";
import { json, bad } from "@/lib/http";
import { dressingKind, junkText } from "@/lib/synth";
import { isOfficeExt } from "@/lib/synthdoc";
export const dynamic = "force-dynamic";

type With = "notepad" | "chrome" | "player" | "image" | undefined;

/**
 * Open a file. Story files return a viewer descriptor. Everything else opens into a
 * plausible body by type (see lib/synth, lib/synthtext and lib/synthdoc): text in Notepad
 * with real readable content, media in the player, images and PDFs in Chrome, and Word,
 * Excel and PowerPoint files in the read-only document viewer. Only types with no sensible
 * app at all (installers and archives) return `openable: false`, which the UI turns into
 * the real Windows "how do you want to open this" dialog. `with` forces a viewer, which is
 * what that dialog's choices use.
 */
export async function POST(req: NextRequest) {
  const { path, with: force } = (await req.json().catch(() => ({}))) as { path?: string; with?: With };
  if (!path) return bad("path required");
  const node = getNode(path);
  if (!node) return bad("not found", 404);
  const { fired } = recordEvent("file.opened", node.path, { openable: node.openable, ext: node.ext, with: force ?? null });
  const rawUrl = `/lf/${encodeURIComponent(node.path).replace(/%2F/g, "/")}`;
  /**
   * The media viewer needs a body the browser can decode. A file whose extension is not
   * an audio or video one still has to arrive as audio when it is opened in the player —
   * otherwise the server serves it as text and the player gets silence.
   */
  const player = (kind: "audio" | "video", forceBody = false) =>
    `/player?src=${encodeURIComponent(forceBody ? `${rawUrl}?as=audio` : rawUrl)}&name=${encodeURIComponent(node.name)}&kind=${kind}`;

  const story = getStoryFile(node.path);
  if (story) {
    if (story.kind === "text" && force !== "chrome") return json({ openable: true, node, viewer: "notepad", text: resolveText(node.path) ?? story.body ?? "", fired });
    if (story.kind === "audio") return json({ openable: true, node, viewer: "chrome", url: player("audio"), kind: story.kind, fired });
    if (story.kind === "text") return json({ openable: true, node, viewer: "chrome", url: rawUrl, kind: "text", fired });
    return json({ openable: true, node, viewer: "chrome", url: rawUrl, kind: story.kind, fired });
  }

  // An image the player drew or captured opens in the viewer, not as its own source.
  if (node.kind === "image") return json({ openable: true, node, viewer: "chrome", url: rawUrl, kind: "image", fired });

  // Text the player wrote (Notepad, a download, the terminal) always opens as itself.
  const text = resolveText(node.path);
  const kind = node.kind === "text" ? "text" : dressingKind(node.ext);

  if (force === "notepad") return json({ openable: true, node, viewer: "notepad", text: text ?? junkText(node.path, node.ext, node.size), synthetic: text === null, fired });
  if (force === "chrome") return json({ openable: true, node, viewer: "chrome", url: kind === "text" ? rawUrl : `${rawUrl}?as=raw`, kind: "raw", synthetic: true, fired });
  if (force === "player") return json({ openable: true, node, viewer: "chrome", url: player(kind === "video" ? "video" : "audio", kind !== "audio" && kind !== "video"), kind: "audio", synthetic: true, fired });
  if (force === "image") return json({ openable: true, node, viewer: "chrome", url: `${rawUrl}?as=image`, kind: "image", synthetic: true, fired });

  // Word, Excel and PowerPoint files open in the read-only viewer this machine has,
  // the way a computer without Office installed still shows you what is in them.
  if (isOfficeExt(node.ext)) return json({ openable: true, node, viewer: "chrome", url: rawUrl, kind: "document", synthetic: true, fired });

  switch (kind) {
    case "text": return json({ openable: true, node, viewer: "notepad", text: text ?? "", synthetic: !node.kind, fired });
    case "audio": return json({ openable: true, node, viewer: "chrome", url: player("audio"), kind: "audio", synthetic: true, fired });
    case "video": return json({ openable: true, node, viewer: "chrome", url: player("video"), kind: "video", synthetic: true, fired });
    case "image": return json({ openable: true, node, viewer: "chrome", url: rawUrl, kind: "image", synthetic: true, fired });
    case "pdf": return json({ openable: true, node, viewer: "chrome", url: rawUrl, kind: "pdf", synthetic: true, fired });
    default: return json({ openable: false, node, fired });
  }
}
