import { NextRequest } from "next/server";
import { allFlags, setFlag } from "@/lib/state";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() { return json({ flags: allFlags() }); }
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { key?: string; value?: unknown };
  if (!body.key) return bad("key required");
  setFlag(body.key, body.value ?? true);
  return json({ flags: allFlags() });
}
