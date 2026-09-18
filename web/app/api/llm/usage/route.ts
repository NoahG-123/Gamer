import { usageSummary } from "@/lib/llm/deepseek";
import { listCharacters } from "@/lib/llm/characters";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() { return json({ ...usageSummary(), characters: listCharacters().map((c) => ({ id: c.id, model: c.model, maxTokens: c.maxTokens, historyWindow: c.historyWindow })) }); }
