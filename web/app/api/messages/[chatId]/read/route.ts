import { NextRequest } from "next/server";
import { markChatRead, getContact } from "@/lib/messaging";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(_req: NextRequest, ctx: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await ctx.params;
  if (!getContact(chatId)) return bad("not found", 404);
  markChatRead(chatId);
  return json({ ok: true });
}
