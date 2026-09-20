/**
 * Browser history. The seeded entries in content/browser/history.json are expanded into
 * real, dated visits the first time history is asked for, so chrome://history shows a
 * believable past; everything the player browses is appended to the same table.
 */
import { db } from "./db";
import { loadContent } from "./content";

interface HistoryFile { entries: { url: string; title: string; visits: number }[] }
export interface Visit { url: string; title: string; at: string }

function seedOnce(): void {
  const row = db().prepare("SELECT COUNT(*) AS n FROM browser_history WHERE title LIKE '%'").get() as { n: number };
  if (row.n > 0) return;
  const entries = loadContent<HistoryFile>("browser/history.json").entries;
  const ins = db().prepare("INSERT INTO browser_history(url, title, at) VALUES (?, ?, ?)");
  const now = Date.now();
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const e of entries) {
    const n = Math.min(e.visits, 40);
    for (let i = 0; i < n; i++) {
      // Spread visits over the last six months, clustered into waking hours.
      const daysAgo = Math.floor(rand() * 180) + (i % 3);
      const hour = 8 + Math.floor(rand() * 15);
      const at = new Date(now - daysAgo * 86400000);
      at.setHours(hour, Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
      ins.run(e.url, e.title, at.toISOString());
    }
  }
}

// Wren's own seeded past (content/browser/history.json) alone expands to several hundred
// rows; a real play session logs a fresh row per navigation, no deduplication, same as real
// Chrome. A small cap here quietly pushes her older visits out of "today" once anyone plays
// for a while, which read as if her history had vanished. This table lives in one player's
// local SQLite file and will never be large enough to matter, so the cap is generous instead.
export function historyVisits(limit = 20000, query = ""): Visit[] {
  seedOnce();
  const like = `%${query.toLowerCase()}%`;
  const sql = query
    ? "SELECT url, title, at FROM browser_history WHERE lower(url) LIKE ? OR lower(title) LIKE ? ORDER BY at DESC LIMIT ?"
    : "SELECT url, title, at FROM browser_history ORDER BY at DESC LIMIT ?";
  const rows = query ? db().prepare(sql).all(like, like, limit) : db().prepare(sql).all(limit);
  return rows as unknown as Visit[];
}
