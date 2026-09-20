import { NextRequest } from "next/server";
import { historyVisits } from "@/lib/browser";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return json({ visits: historyVisits(undefined, q).filter((v) => v.url) });
}
/** Blocked, the way a real Chrome shows "Managed by your organisation" on a locked-down setting. */
export async function DELETE() { return bad("Clearing browsing data is managed by your organisation.", 403); }
