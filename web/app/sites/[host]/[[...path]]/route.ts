import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { contentPath } from "@/lib/content";
import { resolveHost } from "@/lib/sites";
import { mimeFor } from "@/lib/http";
import { recordEvent } from "@/lib/state";
export const dynamic = "force-dynamic";

const NOT_FOUND = (host: string, p: string) => `<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">
<html><head>
<title>404 Not Found</title>
</head><body>
<h1>Not Found</h1>
<p>The requested URL ${p} was not found on this server.</p>
<hr>
<address>Apache/2.4.58 (Ubuntu) Server at ${host} Port 443</address>
</body></html>
`;

/** Serves content/sites/<host>/... as if it were the live site. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ host: string; path?: string[] }> }) {
  const { host, path: parts = [] } = await ctx.params;
  const canonical = resolveHost(host);
  if (!canonical) return new Response("Not Found", { status: 404 });
  const root = path.resolve(contentPath("sites", canonical));
  let rel = parts.map(decodeURIComponent).join("/");
  const urlPath = "/" + rel;
  let full = path.resolve(root, rel);
  if (!full.startsWith(root)) return new Response("Forbidden", { status: 403 });
  const isMainNav = req.headers.get("sec-fetch-dest") === "document" || req.headers.get("sec-fetch-dest") === "iframe" || !req.headers.get("sec-fetch-dest");
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
    if (rel && !req.nextUrl.pathname.endsWith("/")) {
      return new Response(null, { status: 301, headers: { location: `${req.nextUrl.pathname}/${req.nextUrl.search}` } });
    }
    full = path.join(full, "index.html");
    rel = path.join(rel, "index.html");
  }
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    // try extensionless -> .html
    if (fs.existsSync(full + ".html")) full = full + ".html";
    else {
      if (isMainNav) recordEvent("site.visited", `${canonical}${urlPath}`, { status: 404 });
      return new Response(NOT_FOUND(canonical, urlPath), { status: 404, headers: { "content-type": "text/html; charset=iso-8859-1", server: "Apache/2.4.58 (Ubuntu)" } });
    }
  }
  const body = fs.readFileSync(full);
  const name = path.basename(full);
  if (isMainNav && mimeFor(name).startsWith("text/html")) recordEvent("site.visited", `${canonical}${urlPath}`, { status: 200 });
  return new Response(new Uint8Array(body), { headers: { "content-type": mimeFor(name), "cache-control": "no-cache", server: "Apache/2.4.58 (Ubuntu)", "last-modified": fs.statSync(full).mtime.toUTCString() } });
}
