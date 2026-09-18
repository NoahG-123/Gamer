import { NextRequest } from "next/server";
import { instancesBetween } from "@/lib/calendar";
import { recordEvent } from "@/lib/state";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString();
  const to = req.nextUrl.searchParams.get("to") ?? new Date(Date.now() + 60 * 86400000).toISOString();
  if (req.nextUrl.searchParams.get("record") !== "0") recordEvent("app.opened", "calendar");
  return json(instancesBetween(from, to));
}
