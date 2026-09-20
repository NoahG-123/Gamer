/**
 * DeepSeek V3 client, via OpenRouter (OpenAI-compatible chat completions).
 *
 * Configuration comes from environment variables only — never hardcode keys:
 *   DEEPSEEK_API_KEY   required for live calls; an OpenRouter key ("sk-or-v1-...") from
 *                      openrouter.ai/keys.
 *   DEEPSEEK_API_BASE  default https://openrouter.ai/api/v1. Only the test suite points it
 *                      anywhere else.
 *   LLM_PROVIDER       "deepseek" (default) | "mock" (canned replies, no network)
 *   LLM_BUDGET_USD     hard spend cap across the whole install (default 10)
 *   LLM_DEFAULT_MODEL  default "deepseek-chat" (V3). Reasoning models like deepseek-reasoner
 *                      write long, deliberate paragraphs, which reads wrong as a text message.
 *                      Sent to OpenRouter as "deepseek/<model>" (namespaced automatically).
 *   LLM_TIMEOUT_MS     default 120000
 *
 * This is the only model that answers messages or email. OpenAI and Gemini are used
 * elsewhere in the project (portraits, spoken lines) but never here.
 */
import { db } from "../db";
import { loadContent } from "../content";

export type Role = "system" | "user" | "assistant";
export interface ChatMessage { role: Role; content: string }

export interface ChatRequest {
  messages: ChatMessage[];
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  characterId?: string;
}

export interface ChatUsage { promptTokens: number; cacheHitTokens: number; completionTokens: number; reasoningTokens: number; costUsd: number }
export interface ChatResponse { content: string; reasoning?: string; model: string; usage: ChatUsage; provider: "deepseek" | "mock" }

export class BudgetExceededError extends Error { constructor(public spent: number, public budget: number) { super(`LLM budget exhausted: $${spent.toFixed(4)} of $${budget.toFixed(2)}`); } }
export class NotConfiguredError extends Error { constructor() { super("DEEPSEEK_API_KEY is not set"); } }

interface Pricing { models: Record<string, { inputCacheHit: number; inputCacheMiss: number; output: number }> }

export function budgetUsd(): number { const v = Number(process.env.LLM_BUDGET_USD ?? 10); return Number.isFinite(v) ? v : 10; }
export function spentUsd(): number {
  const r = db().prepare("SELECT COALESCE(SUM(cost_usd), 0) AS s FROM llm_usage").get() as { s: number };
  return Number(r.s);
}
export function usageSummary() {
  const rows = db().prepare("SELECT model, COUNT(*) AS calls, SUM(prompt_tokens) AS prompt, SUM(cache_hit_tokens) AS cache_hit, SUM(completion_tokens) AS completion, SUM(reasoning_tokens) AS reasoning, SUM(cost_usd) AS cost, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS errors FROM llm_usage GROUP BY model").all();
  return { budgetUsd: budgetUsd(), spentUsd: spentUsd(), provider: provider(), configured: !!process.env.DEEPSEEK_API_KEY, byModel: rows };
}

export function provider(): "deepseek" | "mock" { return process.env.LLM_PROVIDER === "mock" ? "mock" : "deepseek"; }

/** OpenRouter namespaces every model under its provider; "deepseek-chat" -> "deepseek/deepseek-chat". */
function openRouterModel(model: string): string {
  return model.includes("/") ? model : `deepseek/${model}`;
}

/**
 * Trouble with the key or the endpoint is reported once, on the console of whoever
 * started the app — never inside the machine, where it would not belong. In the app
 * itself an unanswered message just looks like someone who has not picked up.
 */
type Warned = typeof globalThis & { __foundLlmWarned?: Set<string> };
function warnOnce(kind: string, message: string): void {
  const g = globalThis as Warned;
  g.__foundLlmWarned = g.__foundLlmWarned ?? new Set();
  if (g.__foundLlmWarned.has(kind)) return;
  g.__foundLlmWarned.add(kind);
  console.warn(`\n[found] ${message}\n`);
}

function estimateCost(model: string, u: { promptTokens: number; cacheHitTokens: number; completionTokens: number }): number {
  let pricing: Pricing | null = null;
  try { pricing = loadContent<Pricing>("llm/pricing.json"); } catch { pricing = null; }
  const p = pricing?.models[model] ?? pricing?.models["deepseek-reasoner"] ?? { inputCacheHit: 0.07, inputCacheMiss: 0.56, output: 1.68 };
  const miss = Math.max(0, u.promptTokens - u.cacheHitTokens);
  return (u.cacheHitTokens * p.inputCacheHit + miss * p.inputCacheMiss + u.completionTokens * p.output) / 1_000_000;
}

function record(characterId: string | undefined, model: string, usage: ChatUsage, ok: boolean, error?: string): void {
  db().prepare("INSERT INTO llm_usage(character_id, model, prompt_tokens, cache_hit_tokens, completion_tokens, reasoning_tokens, cost_usd, ok, error) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(characterId ?? null, model, usage.promptTokens, usage.cacheHitTokens, usage.completionTokens, usage.reasoningTokens, usage.costUsd, ok ? 1 : 0, error ?? null);
}

/** Send a conversation to the model. Throws BudgetExceededError / NotConfiguredError / Error(network). */
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const model = req.model || process.env.LLM_DEFAULT_MODEL || "deepseek-chat";
  const budget = budgetUsd();
  const spent = spentUsd();
  if (spent >= budget) {
    warnOnce("budget", `The spend cap of $${budget.toFixed(2)} has been reached (LLM_BUDGET_USD), so nobody will reply. Raise it in .env to carry on.`);
    throw new BudgetExceededError(spent, budget);
  }

  const messages: ChatMessage[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push(...req.messages);

  if (provider() === "mock") {
    const last = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const content = `[mock ${model}] re: "${last.slice(0, 60)}"`;
    const usage: ChatUsage = { promptTokens: 50, cacheHitTokens: 0, completionTokens: 12, reasoningTokens: 0, costUsd: 0 };
    usage.costUsd = estimateCost(model, usage);
    record(req.characterId, model, usage, true);
    return { content, model, usage, provider: "mock" };
  }

  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    warnOnce("nokey", "No DEEPSEEK_API_KEY is set, so nobody will answer messages or email. Put your OpenRouter key in the .env file next to the app and restart.");
    throw new NotConfiguredError();
  }
  const base = (process.env.DEEPSEEK_API_BASE || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LLM_TIMEOUT_MS ?? 120000));
  const body: Record<string, unknown> = { model: openRouterModel(model), messages, max_tokens: req.maxTokens ?? 400, stream: false };
  // deepseek-reasoner ignores temperature; harmless to send for deepseek-chat.
  if (req.temperature !== undefined && model !== "deepseek-reasoner") body.temperature = req.temperature;
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) warnOnce("badkey", `OpenRouter rejected the key (HTTP ${res.status}). DEEPSEEK_API_KEY has to be an OpenRouter key ("sk-or-...") from openrouter.ai/keys; a plain DeepSeek key from platform.deepseek.com will not work against this endpoint.`);
      else if (res.status === 402) warnOnce("nofunds", "The model account has no credit left, so nobody will reply.");
      else if (res.status === 429) warnOnce("ratelimit", "The model provider is rate limiting this key; replies will be slow or missing.");
      else if (res.status >= 500) warnOnce("provider", `The model provider returned HTTP ${res.status}. Replies will be missing until it recovers.`);
      const err = `DeepSeek HTTP ${res.status}: ${text.slice(0, 300)}`;
      record(req.characterId, model, { promptTokens: 0, cacheHitTokens: 0, completionTokens: 0, reasoningTokens: 0, costUsd: 0 }, false, err);
      throw new Error(err);
    }
    const json = (await res.json()) as {
      choices: { message: { content: string; reasoning_content?: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number; prompt_cache_hit_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
      model?: string;
    };
    const msg = json.choices?.[0]?.message;
    const usage: ChatUsage = {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      cacheHitTokens: json.usage?.prompt_cache_hit_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      costUsd: 0,
    };
    usage.costUsd = estimateCost(model, usage);
    record(req.characterId, model, usage, true);
    return { content: (msg?.content ?? "").trim(), reasoning: msg?.reasoning_content, model: json.model ?? model, usage, provider: "deepseek" };
  } catch (e) {
    if ((e as Error).cause || (e as Error).message.includes("fetch failed")) {
      warnOnce("network", `Could not reach ${base}. Check the machine's internet connection, or DEEPSEEK_API_BASE if you changed it.`);
    }
    if ((e as Error).name === "AbortError") {
      record(req.characterId, model, { promptTokens: 0, cacheHitTokens: 0, completionTokens: 0, reasoningTokens: 0, costUsd: 0 }, false, "timeout");
      throw new Error("DeepSeek request timed out");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
