import { NextRequest } from "next/server";
import { getContact, listMessages, sendMessage } from "@/lib/messaging";
import { recordEvent } from "@/lib/state";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ chatId: string }> };
export async function GET(req: NextRequest, ctx: Ctx) {
  const { chatId } = await ctx.params;
  const contact = getContact(chatId);
  if (!contact) return bad("not found", 404);
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0);
  if (!since && req.nextUrl.searchParams.get("record") !== "0") recordEvent("chat.opened", chatId);
  return json({ contact, messages: listMessages(chatId, since) });
}
export async function POST(req: NextRequest, ctx: Ctx) {
  const { chatId } = await ctx.params;
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text?.trim()) return bad("text required");
  if (!getContact(chatId)) return bad("not found", 404);
  return json({ message: sendMessage(chatId, text.trim()) });
}
