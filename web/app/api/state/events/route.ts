import { NextRequest } from "next/server";
import { recordEvent, listEvents } from "@/lib/state";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  return json({ events: listEvents(Number(req.nextUrl.searchParams.get("limit") ?? 200)) });
}
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { type?: string; subject?: string; data?: unknown };
  if (!body.type) return bad("type required");
  return json(recordEvent(body.type, body.subject ?? "", body.data ?? null));
}
