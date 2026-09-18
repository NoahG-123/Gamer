import { NextRequest } from "next/server";
import { getThread, setThreadState } from "@/lib/mail";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return bad("id required");
  const t = getThread(id);
  if (!t) return bad("not found", 404);
  if (t.unread) setThreadState(id, { read: true });
  return json({ thread: { ...t, unread: false } });
}
