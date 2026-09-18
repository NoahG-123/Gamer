import { NextRequest } from "next/server";
import { sendMail } from "@/lib/mail";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { threadId?: string; to?: string; subject?: string; body?: string };
  if (!body.to || !body.body) return bad("to and body required");
  return json(sendMail({ threadId: body.threadId, to: body.to, subject: body.subject ?? "", body: body.body }));
}
