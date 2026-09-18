import { NextRequest } from "next/server";
import { historyVisits, clearHistory } from "@/lib/browser";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return json({ visits: historyVisits(500, q).filter((v) => v.url) });
}
export async function DELETE() { return json({ ok: true, cleared: clearHistory() }); }
