import { NextRequest } from "next/server";
import { loadMailbox, visibleThreads } from "@/lib/mail";
import { recordEvent } from "@/lib/state";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Mailbox listing: account, labels and every visible thread (without bodies). */
export async function GET(req: NextRequest) {
  const box = loadMailbox();
  if (req.nextUrl.searchParams.get("record") !== "0") recordEvent("app.opened", "gmail");
  const threads = visibleThreads().map(({ messages, ...t }) => ({ ...t, count: messages.length, attachments: messages.some((m) => m.attachments?.length) }));
  return json({ account: box.account, labels: box.labels, threads });
}
