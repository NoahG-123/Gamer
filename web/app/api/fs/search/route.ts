import { NextRequest } from "next/server";
import { search, userHome } from "@/lib/vfs";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const root = req.nextUrl.searchParams.get("path") ?? userHome();
  if (!q.trim()) return json({ results: [] });
  return json({ results: search(root, q.trim()) });
}
