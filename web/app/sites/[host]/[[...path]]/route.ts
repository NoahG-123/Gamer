import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { contentPath } from "@/lib/content";
import { resolveHost, hostInfo } from "@/lib/sites";
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

/**
 * Paths the shell owns, which a page inside a site is allowed to point straight at.
 * Everything else beginning with "/" belongs to the site it is written in.
 */
const SHELL_PREFIXES = ["/sites/", "/api/", "/lf/", "/assets/", "/player", "/chrome/"];

/**
 * Root-relative links inside a served page are rewritten to sit under the site.
 *
 * A story page is written the way the real site would be — `href="/"` for its own front
 * page — but the browser is looking at it through this server, so an untouched `/` would
 * resolve against the server root and drop the player out onto the desktop shell inside
 * the tab. Prefixing every site-owned path with /sites/<host> keeps a link inside the site
 * it was written in, under Electron and in the plain-browser fallback alike.
 */
function scopeLinks(html: string, host: string): string {
  return html.replace(/\b(href|src|action|poster|data-href)=("|')(\/[^"'>]*)\2/gi, (whole, attr: string, q: string, url: string) => {
    if (url.startsWith("//")) return whole;                                   // protocol-relative: leave alone
    if (SHELL_PREFIXES.some((pre) => url === pre || url.startsWith(pre))) return whole;
    return `${attr}=${q}/sites/${host}${url}${q}`;
  });
}

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
    // try extensionless -> .html; single-page hosts (the Gmail/Calendar clones) serve index.html for any path
    if (fs.existsSync(full + ".html")) full = full + ".html";
    else if (hostInfo(canonical)?.spa && isMainNav && fs.existsSync(path.join(root, "index.html"))) { full = path.join(root, "index.html"); rel = "index.html"; }
    else {
      if (isMainNav) recordEvent("site.visited", `${canonical}${urlPath}`, { status: 404 });
      return new Response(NOT_FOUND(canonical, urlPath), { status: 404, headers: { "content-type": "text/html; charset=iso-8859-1", server: "Apache/2.4.58 (Ubuntu)" } });
    }
  }
  const name = path.basename(full);
  const type = mimeFor(name);
  const headers = { "content-type": type, "cache-control": "no-cache", server: "Apache/2.4.58 (Ubuntu)", "last-modified": fs.statSync(full).mtime.toUTCString() };
  if (type.startsWith("text/html")) {
    if (isMainNav) recordEvent("site.visited", `${canonical}${urlPath}`, { status: 200 });
    return new Response(scopeLinks(fs.readFileSync(full, "utf8"), canonical), { headers });
  }
  return new Response(new Uint8Array(fs.readFileSync(full)), { headers });
}
