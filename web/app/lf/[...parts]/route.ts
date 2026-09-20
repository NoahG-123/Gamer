import { NextRequest } from "next/server";
import fs from "node:fs";
import { getStoryFile, assetPath, getNode, resolveText, contentSeed } from "@/lib/vfs";
import { getOverlay } from "@/lib/fsmut";
import { mimeFor } from "@/lib/http";
import { dressingKind, synthWav, synthPng, synthPdf, junkText, DIALOG_EXTS } from "@/lib/synth";
import { isOfficeExt, synthDoc, renderDoc } from "@/lib/synthdoc";
import { synthText } from "@/lib/synthtext";
import { getRecording, recordingBytes, recordingStream } from "@/lib/audio";
import { pickFillerVideo } from "@/lib/fillerVideo";
import { pickFillerPhoto } from "@/lib/fillerPhoto";
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
  /**
   * Chromium decides what to do with a response partly from the filename in the
   * content-disposition header: an extension it cannot render turns the navigation into a
   * download however the disposition is spelt, the tab stays where it was, and a copy
   * quietly piles up in the download folder every time. Where the body being served is not
   * what the extension claims, the filename is therefore left off and the response renders.
   */
  const inlineNoName = { "cache-control": "no-store", "content-disposition": "inline" };

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

  // A stray office document opens into the read-only viewer rather than a blank window.
  if (as !== "raw" && isOfficeExt(node.ext)) {
    return new Response(renderDoc(synthDoc(node.path, node.ext), node.name), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
  }

  // An archive or an installer: Chrome itself cannot show one. Say so on the page rather
  // than starting a download nobody asked for.
  if (as !== "raw" && DIALOG_EXTS.has(node.ext)) {
    const kb = Math.max(1, Math.round(node.size / 1024)).toLocaleString("en-CA");
    const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const page = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title>`
      + `<style>:root{color-scheme:light}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;`
      + `background:#f1f3f4;font-family:"Segoe UI",system-ui,Arial,sans-serif;color:#202124}`
      + `.c{max-width:min(520px,90vw);text-align:center;padding:40px 28px;background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.14)}`
      + `h1{font-size:18px;font-weight:500;margin:0 0 10px}p{margin:0 0 6px;color:#5f6368;font-size:13px;line-height:1.6;overflow-wrap:anywhere}`
      + `code{background:#f1f3f4;border-radius:3px;padding:1px 5px}</style></head><body><div class="c">`
      + `<h1>${esc(name)}</h1>`
      + `<p>${kb} KB. Chrome cannot display this kind of file.</p>`
      + `<p>Open it from File Explorer, or use the Terminal — <code>7z l</code> lists what is inside an archive and <code>7z x</code> extracts it.</p>`
      + `</div></body></html>`;
    return new Response(page, { headers: { ...inlineNoName, "content-type": "text/html; charset=utf-8" } });
  }

  const kind = as === "image" ? "image" : as === "audio" ? "audio" : as === "raw" ? "other" : dressingKind(node.ext);
  switch (kind) {
    case "video": {
      // A real clip from the filler-video pool (lib/fetchAssets, content/filler-videos.json),
      // picked deterministically so this file always plays the same one. Falls through to the
      // ambient-only placeholder below until PIXABAY_API_KEY_VIDEOS has fetched the pool.
      const clip = pickFillerVideo(seed);
      if (clip) {
        const stat = fs.statSync(clip);
        const range = req.headers.get("range");
        const m = range?.match(/bytes=(\d*)-(\d*)/);
        const start = m && m[1] ? Math.min(Number(m[1]), stat.size - 1) : 0;
        const end = m && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
        const body = new Uint8Array(fs.readFileSync(clip)).subarray(start, end + 1);
        const common = { ...headers, "content-type": "video/mp4", "accept-ranges": "bytes" };
        if (m) return new Response(body, { status: 206, headers: { ...common, "content-range": `bytes ${start}-${end}/${stat.size}`, "content-length": String(end - start + 1) } });
        return new Response(body, { headers: { ...common, "content-length": String(stat.size) } });
      }
      // Fall through: no clip fetched yet, so this junk file stays ambient-sound-only.
    }
    // eslint-disable-next-line no-fallthrough
    case "audio": {
      // There is no synthetic video track for the fallback above — a filler "video" without
      // a fetched clip is ambient sound only. Naming it inline with its real .mp4/.mov
      // extension while the bytes are a WAV makes Chromium try to lay out a video player for
      // a file with no picture: a black, misplaced frame rather than the clean native audio
      // view it would give an honestly-named .wav.
      const wavName = name.replace(/\.[^.]+$/, "") + ".wav";
      const disposition = `inline; filename="${wavName.replace(/"/g, "")}"`;
      return new Response(new Uint8Array(synthWav(seed)), { headers: { ...headers, "content-disposition": disposition, "content-type": "audio/wav" } });
    }
    case "image": {
      const photo = pickFillerPhoto(node.path, seed);
      if (photo) return new Response(new Uint8Array(fs.readFileSync(photo)), { headers: { ...headers, "content-type": "image/jpeg" } });
      return new Response(new Uint8Array(synthPng(seed)), { headers: { ...headers, "content-type": "image/png" } });
    }
    case "pdf": {
      // Real type on the page, not grey bars: a blank-looking PDF reads as a broken viewer.
      const pages = 1 + (node.size > 900_000 ? 2 : 0);
      return new Response(new Uint8Array(synthPdf(seed, pages, synthText(node.path, "txt", node.size))), { headers: { ...headers, "content-type": "application/pdf" } });
    }
    case "text":
      return new Response(resolveText(p) ?? "", { headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
    default: {
      // The "raw bytes" view of a binary file, which is what Notepad would show.
      //
      // It is served as HTML rather than text/plain on purpose: Chromium sniffs a
      // text/plain body that looks binary, decides it is a download, refuses to navigate
      // and quietly drops a copy in the download folder every time the page is opened.
      // An HTML document is always rendered.
      const junk = junkText(seed, node.ext, node.size);
      const esc = junk.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const page = `<!doctype html><html><head><meta charset="utf-8"><title>${name.replace(/[<>&]/g, "")}</title>`
        + `<style>:root{color-scheme:light}body{margin:0;background:#fff;color:#202124}`
        + `pre{margin:0;padding:12px 16px;font-family:Consolas,"Courier New",monospace;font-size:12px;line-height:1.4;`
        + `white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><pre>${esc}</pre></body></html>`;
      return new Response(page, { headers: { ...inlineNoName, "content-type": "text/html; charset=utf-8" } });
    }
  }
}
