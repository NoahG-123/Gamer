import { NextRequest } from "next/server";
import { setThreadState } from "@/lib/mail";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; read?: boolean; starred?: boolean; labels?: string[]; trashed?: boolean };
  if (!body.id) return bad("id required");
  setThreadState(body.id, body);
  return json({ ok: true });
}
