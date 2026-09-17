import { NextRequest } from "next/server";
import fs from "node:fs";
import { getStoryFile, assetPath } from "@/lib/vfs";
import { mimeFor } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Serves the body of a story file so the browser can render html/image/pdf files as file:/// URLs. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ parts: string[] }> }) {
  const { parts } = await ctx.params;
  const p = parts.map(decodeURIComponent).join("/");
  const f = getStoryFile(p);
  if (!f) return new Response("Not found", { status: 404 });
  const name = p.slice(p.lastIndexOf("/") + 1);
  const headers = { "content-type": mimeFor(name), "cache-control": "no-store" };
  if (f.body !== undefined) return new Response(f.body, { headers });
  if (f.src) {
    const full = assetPath(f.src);
    if (!fs.existsSync(full)) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(fs.readFileSync(full)), { headers });
  }
  return new Response("", { headers });
}
