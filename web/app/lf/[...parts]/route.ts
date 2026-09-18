import { NextRequest } from "next/server";
import fs from "node:fs";
import { getStoryFile, assetPath, getNode, resolveText, contentSeed } from "@/lib/vfs";
import { getOverlay } from "@/lib/fsmut";
import { mimeFor } from "@/lib/http";
import { dressingKind, synthWav, synthPng, synthPdf, junkText } from "@/lib/synth";
import { getRecording, recordingBytes, recordingStream } from "@/lib/audio";
export const dynamic = "force-dynamic";

/**
 * Serves the body of a file so the browser can render it at a file:/// address.
 * Story files serve their real body; anything the player saved serves what they saved;
 * filler files get a deterministic synthetic body by type (lib/synth, lib/synthtext),
 * optionally forced with `?as=raw|image|audio`.
 *
 * Everything is served inline with a type the browser can render: a body that arrives
 * as an unknown type would be handed to the download manager instead of being shown.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ parts: string[] }> }) {
  const { parts } = await ctx.params;
  const p = parts.map(decodeURIComponent).join("/");
  const name = p.slice(p.lastIndexOf("/") + 1);
  const as = req.nextUrl.searchParams.get("as");
  const headers: Record<string, string> = { "cache-control": "no-store", "content-disposition": `inline; filename="${name.replace(/"/g, "")}"` };

  const f = getStoryFile(p);
  if (f?.render) {
    // A recording: generated as it plays, so any point in it can be reached instantly.
    const rec = getRecording(f.render);
    if (rec) {
      const total = recordingBytes(rec);
      const range = req.headers.get("range");
      const m = range?.match(/bytes=(\d*)-(\d*)/);
      const start = m && m[1] ? Math.min(Number(m[1]), total - 1) : 0;
      const end = m && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
      const common = { "content-type": "audio/wav", "accept-ranges": "bytes", "cache-control": "no-store", "content-disposition": headers["content-disposition"] };
      if (m) {
        return new Response(recordingStream(rec, start, end), {
          status: 206,
          headers: { ...common, "content-range": `bytes ${start}-${end}/${total}`, "content-length": String(end - start + 1) },
        });
      }
      return new Response(recordingStream(rec, 0, total - 1), { headers: { ...common, "content-length": String(total) } });
    }
  }
  if (f) {
    // A story file's declared kind wins over its extension (an .html "letter" named .pdf still renders as a page).
    headers["content-type"] = f.kind === "html" ? "text/html; charset=utf-8" : f.kind === "text" ? "text/plain; charset=utf-8" : mimeFor(name);
    if (f.body !== undefined) return new Response(f.body, { headers });
    if (f.src) {
      const full = assetPath(f.src);
      if (!fs.existsSync(full)) return new Response("Not found", { status: 404 });
      return new Response(new Uint8Array(fs.readFileSync(full)), { headers });
    }
    return new Response("", { headers });
  }

  const node = getNode(p);
  if (!node || node.dir) return new Response("Not found", { status: 404 });

  // A file that arrived through the browser's download manager: real bytes in the app's data folder.
  const ov = getOverlay(node.path);
  if (ov?.disk && fs.existsSync(ov.disk)) return new Response(new Uint8Array(fs.readFileSync(ov.disk)), { headers: { ...headers, "content-type": mimeFor(name) } });
  // Something the player drew or captured: stored as a data URL, served as the image it is.
  if (ov?.body?.startsWith("data:")) {
    const m = ov.body.match(/^data:([^;]+);base64,(.*)$/s);
    if (m) return new Response(new Uint8Array(Buffer.from(m[2], "base64")), { headers: { ...headers, "content-type": m[1] } });
  }

  // Text the player saved (or filler text) is served as itself.
  if (!as || as === "text") {
    const text = resolveText(p);
    if (text !== null) return new Response(text, { headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
  }

  const seed = contentSeed(p);
  const kind = as === "image" ? "image" : as === "audio" ? "audio" : as === "raw" ? "other" : dressingKind(node.ext);
  switch (kind) {
    case "audio": case "video":
      return new Response(new Uint8Array(synthWav(seed)), { headers: { ...headers, "content-type": "audio/wav" } });
    case "image":
      return new Response(new Uint8Array(synthPng(seed)), { headers: { ...headers, "content-type": "image/png" } });
    case "pdf":
      return new Response(new Uint8Array(synthPdf(seed, 1 + (node.size > 900_000 ? 2 : 0))), { headers: { ...headers, "content-type": "application/pdf" } });
    case "text":
      return new Response(resolveText(p) ?? "", { headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
    default:
      return new Response(junkText(seed, node.ext, node.size), { headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
  }
}
