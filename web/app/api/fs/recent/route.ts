import { listDir, userHome, VfsNode } from "@/lib/vfs";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Recently modified user files, for the Start menu "Recommended" list. */
export async function GET(_req: Request) {
  const home = userHome();
  const out: VfsNode[] = [];
  const walk = (p: string, depth: number) => {
    const r = listDir(p);
    if (!r) return;
    for (const c of r.children) {
      if (c.dir) { if (depth < 2 && !/AppData|OneDrive/.test(c.name)) walk(c.path, depth + 1); }
      else if (c.openable || !/^(desktop\.ini|thumbs\.db)$/i.test(c.name)) out.push(c);
    }
  };
  walk(home, 0);
  out.sort((a, b) => b.modified.localeCompare(a.modified));
  const url = new URL(_req.url); const limit = Number(url.searchParams.get("limit") ?? 6);
  return json({ recent: out.slice(0, limit) });
}
