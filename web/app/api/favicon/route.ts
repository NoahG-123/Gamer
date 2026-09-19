import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { contentPath } from "@/lib/content";
import { resolveHost } from "@/lib/sites";
export const dynamic = "force-dynamic";

const COLOURS = ["#5b6d8a", "#7b5cd6", "#1a73e8", "#188038", "#c5221f", "#e37400", "#9334e6", "#007b83"];

function tile(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const colour = COLOURS[h % COLOURS.length];
  const letter = (name[0] ?? "?").toUpperCase().replace(/[<>&"]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">`
    + `<rect width="32" height="32" rx="6" fill="${colour}"/>`
    + `<text x="16" y="23" text-anchor="middle" font-size="19" font-family="Arial, Helvetica, sans-serif" fill="#ffffff">${letter}</text>`
    + `</svg>`;
}

/**
 * A site's icon, served by this machine.
 *
 * Chrome's real history, bookmarks and new tab page fetch favicons from google.com. Doing
 * that here would send a list of everywhere the player has been to a third party, would
 * keep working while this computer is supposed to be offline, and would leave broken
 * squares and a console full of 404s whenever it failed. So this answers instead: the
 * site's own favicon when it has one, and otherwise a lettered tile coloured from its
 * hostname. It never 404s.
 */
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("host") ?? "").toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  const host = raw.replace(/^www\./, "") || "?";
  const headers = { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" };

  const canonical = resolveHost(host);
  if (canonical) {
    for (const name of ["favicon.svg", "favicon.ico", "favicon.png"]) {
      const file = path.join(contentPath("sites", canonical), name);
      if (!fs.existsSync(file)) continue;
      const type = name.endsWith(".svg") ? "image/svg+xml" : name.endsWith(".png") ? "image/png" : "image/x-icon";
      return new Response(new Uint8Array(fs.readFileSync(file)), { headers: { ...headers, "content-type": type } });
    }
  }
  return new Response(tile(host), { headers });
}
