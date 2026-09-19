import { NextRequest } from "next/server";
import fs from "node:fs";
import { assetFilePath } from "@/lib/assets";
import { mimeFor } from "@/lib/http";
export const dynamic = "force-dynamic";

/** What the first bytes say the file is, for images fetched at runtime whose name lies. */
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return null;
}

/** Serves files from content/assets/ (images referenced by the asset manifest). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const full = assetFilePath(parts.map(decodeURIComponent).join("/"));
  if (!full) return new Response("Not found", { status: 404 });
  const bytes = new Uint8Array(fs.readFileSync(full));
  return new Response(bytes, { headers: { "content-type": sniff(bytes) ?? mimeFor(full), "cache-control": "no-cache" } });
}
