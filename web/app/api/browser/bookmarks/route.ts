import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Bookmarks the player adds or removes. Stored beside the ones that came with the machine. */
interface Extra { id: string; title: string; url: string }

function extras(): Extra[] {
  const row = db().prepare("SELECT value FROM kv WHERE key = 'bookmarks:added'").get() as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as Extra[]) : [];
}
function removed(): string[] {
  const row = db().prepare("SELECT value FROM kv WHERE key = 'bookmarks:removed'").get() as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as string[]) : [];
}
function save(key: string, value: unknown): void {
  db().prepare("INSERT INTO kv(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
}

export async function GET() { return json({ added: extras(), removed: removed() }); }

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as { url?: string; title?: string; add?: boolean } | null;
  if (!b?.url) return bad("url required");
  if (b.add === false) {
    save("bookmarks:added", extras().filter((e) => e.url !== b.url));
    save("bookmarks:removed", [...new Set([...removed(), b.url])]);
    return json({ ok: true, bookmarked: false });
  }
  const list = extras();
  if (!list.some((e) => e.url === b.url)) list.push({ id: `bm-${Date.now().toString(36)}`, title: b.title || b.url, url: b.url });
  save("bookmarks:added", list);
  save("bookmarks:removed", removed().filter((u) => u !== b.url));
  return json({ ok: true, bookmarked: true });
}
