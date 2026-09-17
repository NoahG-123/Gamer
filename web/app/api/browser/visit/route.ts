import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { resolveHost } from "@/lib/sites";
import { recordEvent } from "@/lib/state";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Records a completed top-level navigation in the browser. */
export async function POST(req: NextRequest) {
  const { url, title } = (await req.json().catch(() => ({}))) as { url?: string; title?: string };
  if (!url) return bad("url required");
  db().prepare("INSERT INTO browser_history(url, title) VALUES (?, ?)").run(url, title ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* ignore */ }
  const story = host ? resolveHost(host) : null;
  const ev = recordEvent("page.visited", url, { story: !!story });
  return json({ ok: true, story, fired: ev.fired });
}
