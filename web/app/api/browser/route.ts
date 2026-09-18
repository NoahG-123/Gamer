import { loadContent } from "@/lib/content";
import { allFlags, isVisible, revealedIds } from "@/lib/state";
import { db } from "@/lib/db";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";

interface Bookmark { id: string; title: string; url?: string; folder?: boolean; children?: Bookmark[]; hidden?: boolean; requires?: string[] }
interface BookmarksFile { bar: Bookmark[] }
interface HistoryFile { entries: { url: string; title: string; visits: number }[] }

function filterBookmarks(list: Bookmark[], flags: Record<string, unknown>, revealed: Set<string>): Bookmark[] {
  return list.filter((b) => isVisible(b, "generic", b.id, flags, revealed)).map((b) => (b.children ? { ...b, children: filterBookmarks(b.children, flags, revealed) } : b));
}

export async function GET() {
  const flags = allFlags();
  const revealed = revealedIds("generic");
  const bookmarks = filterBookmarks(loadContent<BookmarksFile>("browser/bookmarks.json").bar, flags, revealed);
  const seeded = loadContent<HistoryFile>("browser/history.json").entries;
  const runtime = db().prepare("SELECT url, title, COUNT(*) AS visits, MAX(at) AS last FROM browser_history GROUP BY url ORDER BY last DESC LIMIT 300").all() as { url: string; title: string; visits: number; last: string }[];
  const merged = new Map<string, { url: string; title: string; visits: number }>();
  for (const e of seeded) merged.set(e.url, { ...e });
  for (const r of runtime) { const prev = merged.get(r.url); merged.set(r.url, { url: r.url, title: r.title || prev?.title || r.url, visits: (prev?.visits ?? 0) + Number(r.visits) }); }
  return json({ bookmarks, history: [...merged.values()].sort((a, b) => b.visits - a.visits) });
}
