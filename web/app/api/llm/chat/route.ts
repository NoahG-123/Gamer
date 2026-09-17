import { NextRequest } from "next/server";
import { chat, BudgetExceededError, NotConfiguredError } from "@/lib/llm/deepseek";
import { loadCharacter } from "@/lib/llm/characters";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";

/**
 * Generic LLM endpoint. Body: { messages: [{role, content}], system?, characterId?, model?, maxTokens?, temperature? }.
 * When characterId is given, that character's system prompt/model/limits are used unless overridden.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as null | { messages?: { role: "user" | "assistant" | "system"; content: string }[]; system?: string; characterId?: string; model?: string; maxTokens?: number; temperature?: number };
  if (!body?.messages?.length) return bad("messages required");
  const character = body.characterId ? loadCharacter(body.characterId) : null;
  if (body.characterId && !character) return bad("unknown character", 404);
  try {
    const res = await chat({
      messages: body.messages.filter((m) => m.role !== "system"),
      system: body.system ?? character?.systemPrompt,
      model: body.model ?? character?.model,
      maxTokens: body.maxTokens ?? character?.maxTokens,
      temperature: body.temperature ?? character?.temperature,
      characterId: character?.id,
    });
    return json(res);
  } catch (e) {
    if (e instanceof BudgetExceededError) return json({ error: e.message, code: "budget_exceeded" }, { status: 402 });
    if (e instanceof NotConfiguredError) return json({ error: e.message, code: "not_configured" }, { status: 503 });
    return json({ error: (e as Error).message, code: "upstream" }, { status: 502 });
  }
}
