import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
/** Chrome's built-in media viewer look for audio/video files opened from Explorer. */
export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("src") ?? "";
  const name = req.nextUrl.searchParams.get("name") ?? "media";
  const kind = req.nextUrl.searchParams.get("kind") === "video" ? "video" : "audio";
  if (!src.startsWith("/lf/")) return new Response("bad src", { status: 400 });
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const media = kind === "video"
    ? `<video controls autoplay src="${esc(src)}" style="width:min(960px,96vw);max-height:92vh;background:#000"></video>`
    : `<audio controls autoplay src="${esc(src)}"></audio>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><style>html,body{margin:0;height:100%;background:#0e0e0e}body{display:flex;align-items:center;justify-content:center}audio{width:min(640px,90vw)}</style></head><body>${media}</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
