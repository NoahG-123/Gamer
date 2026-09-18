import { NextRequest } from "next/server";
import fs from "node:fs";
import { assetFilePath } from "@/lib/assets";
import { mimeFor } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Serves files from content/assets/ (images referenced by the asset manifest). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const full = assetFilePath(parts.map(decodeURIComponent).join("/"));
  if (!full) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(full)), { headers: { "content-type": mimeFor(full), "cache-control": "no-cache" } });
}
