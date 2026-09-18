/**
 * Messaging (WhatsApp-style) backend: contacts, history, sending, and LLM-driven
 * replies with realistic delivery/read/typing pacing.
 */
import fs from "node:fs";
import { db } from "./db";
import { loadContent, contentPath, loadProfile } from "./content";
import { publish } from "./bus";
import { allFlags, isVisible, recordEvent, registerEffectHandler, revealedIds, presenceOverride } from "./state";
import { chat, BudgetExceededError, NotConfiguredError } from "./llm/deepseek";
import { loadCharacter, CharacterConfig } from "./llm/characters";

export interface Contact {
  id: string; name: string; phone?: string; about?: string; email?: string;
  avatar: { initials: string; color: string; src?: string };
  presence?: "online" | "offline" | "lastSeen"; lastSeen?: string;
  character?: string | null; hidden?: boolean; requires?: string[]; pinned?: boolean;
  isGroup?: boolean; participants?: string[];
}

/**
 * Full system prompt for a character: shared world notes (characters/_world.md),
 * the character's own prompt, and situation notes for every story flag currently set,
 * so people "know" what the player has already found. `{now}` expands to the current date.
 */
export function buildSystemPrompt(character: CharacterConfig, opts: { channel: "whatsapp" | "email" } = { channel: "whatsapp" }): string {
  const worldPath = contentPath("characters", "_world.md");
  const world = fs.existsSync(worldPath) ? fs.readFileSync(worldPath, "utf8") : "";
  const flags = allFlags();
  const situations = Object.entries(character.situations ?? {}).filter(([k]) => !!flags[k]).map(([, v]) => v);
  const now = new Date().toLocaleString("en-CA", { timeZone: loadProfile().timezone, dateStyle: "full", timeStyle: "short" });
  const parts = [world.trim(), character.systemPrompt.trim()];
  if (opts.channel === "email" && character.emailPrompt) parts.push(character.emailPrompt.trim());
  if (situations.length) parts.push("What has happened so far (the person you are talking to has done these things on the computer):\n- " + situations.join("\n- "));
  parts.push(`Current date and time where you are: ${now}.`);
  return parts.filter(Boolean).join("\n\n").replace(/\{now\}/g, now);
}
interface ContactsFile { contacts: Contact[] }
interface HistoryFile { chats: Record<string, { from: string; at: string; text: string; status?: string }[]> }

export interface Message { id: number; chatId: string; sender: string; text: string; at: string; status: "sent" | "delivered" | "read"; origin: string }

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function seedChat(chatId: string): void {
  const conn = db();
  const meta = conn.prepare("SELECT seeded FROM chat_meta WHERE chat_id = ?").get(chatId) as { seeded: number } | undefined;
  if (meta?.seeded) return;
  const history = loadContent<HistoryFile>("messaging/history.json");
  const ins = conn.prepare("INSERT INTO messages(chat_id, sender, text, at, status, origin) VALUES (?,?,?,?,?,'seed')");
  for (const m of history.chats[chatId] ?? []) ins.run(chatId, m.from, m.text, m.at, m.status ?? (m.from === "me" ? "read" : "delivered"));
  conn.prepare("INSERT INTO chat_meta(chat_id, seeded) VALUES (?, 1) ON CONFLICT(chat_id) DO UPDATE SET seeded = 1").run(chatId);
}

export function visibleContacts(): Contact[] {
  const { contacts } = loadContent<ContactsFile>("messaging/contacts.json");
  const flags = allFlags();
  const revealed = revealedIds("contact");
  return contacts.filter((c) => isVisible(c, "contact", c.id, flags, revealed)).map((c) => {
    const o = presenceOverride(c.id);
    return o ? { ...c, presence: o.presence, lastSeen: o.lastSeen ?? c.lastSeen } : c;
  });
}

export function getContact(id: string): Contact | null {
  return visibleContacts().find((c) => c.id === id) ?? null;
}

export function listMessages(chatId: string, sinceId = 0): Message[] {
  seedChat(chatId);
  return db().prepare("SELECT id, chat_id AS chatId, sender, text, at, status, origin FROM messages WHERE chat_id = ? AND id > ? ORDER BY id").all(chatId, sinceId) as unknown as Message[];
}

export interface ChatSummary { contact: Contact; last: Message | null; unread: number }

export function chatSummaries(): ChatSummary[] {
  const conn = db();
  const out: ChatSummary[] = [];
  for (const c of visibleContacts()) {
    seedChat(c.id);
    const last = conn.prepare("SELECT id, chat_id AS chatId, sender, text, at, status, origin FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1").get(c.id) as unknown as Message | undefined;
    const meta = conn.prepare("SELECT last_read_incoming_id FROM chat_meta WHERE chat_id = ?").get(c.id) as { last_read_incoming_id: number } | undefined;
    const unread = Number((conn.prepare("SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND sender != 'me' AND id > ?").get(c.id, meta?.last_read_incoming_id ?? 0) as { n: number }).n);
    out.push({ contact: c, last: last ?? null, unread });
  }
  // WhatsApp orders by most recent activity.
  out.sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""));
  return out;
}

/** Mark all incoming messages in a chat as read by me (clears unread badge). */
export function markChatRead(chatId: string): void {
  const conn = db();
  const last = conn.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM messages WHERE chat_id = ? AND sender != 'me'").get(chatId) as { m: number };
  conn.prepare("INSERT INTO chat_meta(chat_id, last_read_incoming_id, seeded) VALUES (?, ?, 1) ON CONFLICT(chat_id) DO UPDATE SET last_read_incoming_id = MAX(last_read_incoming_id, excluded.last_read_incoming_id)").run(chatId, last.m);
}

function insertMessage(chatId: string, sender: string, text: string, status: Message["status"], origin = "runtime"): Message {
  const at = new Date().toISOString();
  const r = db().prepare("INSERT INTO messages(chat_id, sender, text, at, status, origin) VALUES (?,?,?,?,?,?)").run(chatId, sender, text, at, status, origin);
  const m: Message = { id: Number(r.lastInsertRowid), chatId, sender, text, at, status, origin };
  publish({ type: "message", chatId, message: m });
  return m;
}

function setStatus(chatId: string, ids: number[], status: Message["status"]): void {
  if (!ids.length) return;
  const conn = db();
  const stmt = conn.prepare("UPDATE messages SET status = ? WHERE id = ?");
  for (const id of ids) stmt.run(status, id);
  publish({ type: "message.status", chatId, ids, status });
}

function myUnreadIds(chatId: string): number[] {
  return (db().prepare("SELECT id FROM messages WHERE chat_id = ? AND sender = 'me' AND status != 'read'").all(chatId) as { id: number }[]).map((r) => r.id);
}

/** Deliver an incoming message from a contact (used by triggers and LLM replies). */
export function deliverIncoming(chatId: string, from: string, text: string): Message {
  const m = insertMessage(chatId, from, text, "delivered");
  recordEvent("message.received", chatId, { from, id: m.id });
  const c = getContact(chatId);
  publish({ type: "ui.notify", app: "whatsapp", title: c?.name ?? from, text, props: { chatId } });
  return m;
}

const inflight = new Map<string, Promise<void>>();

/** Send a message from me. Returns immediately; the reply pipeline runs in the background. */
export function sendMessage(chatId: string, text: string): Message {
  const contact = getContact(chatId);
  if (!contact) throw new Error("unknown chat");
  seedChat(chatId);
  const m = insertMessage(chatId, "me", text, "sent");
  recordEvent("message.sent", chatId, { id: m.id, length: text.length });
  const chain = (inflight.get(chatId) ?? Promise.resolve()).then(() => replyPipeline(contact, m).catch((e) => console.error("[messaging] reply pipeline failed:", e)));
  inflight.set(chatId, chain);
  return m;
}

async function replyPipeline(contact: Contact, sent: Message): Promise<void> {
  const chatId = contact.id;
  const online = contact.presence !== "offline";
  if (online) {
    await sleep(rand(400, 1400));
    setStatus(chatId, [sent.id], "delivered");
  }
  const character = contact.character ? loadCharacter(contact.character) : null;
  if (!character) return; // scripted-only contact: no reply

  // Ask the model right away; the "read" + "typing" theatre is timed to hide the latency.
  const history = listMessages(chatId).filter((m) => m.id !== sent.id || true).slice(-(character.historyWindow ?? 24));
  const msgs = history.map((m) => ({ role: m.sender === "me" ? ("user" as const) : ("assistant" as const), content: m.text }));
  const started = Date.now();
  let replyText: string | null = null;
  try {
    const res = await chat({ messages: msgs, system: buildSystemPrompt(character), model: character.model, temperature: character.temperature, maxTokens: character.maxTokens, characterId: character.id });
    replyText = res.content || null;
  } catch (e) {
    if (e instanceof BudgetExceededError || e instanceof NotConfiguredError) {
      // Out of budget / no key: the message simply never gets read. Looks like the person is away.
      console.warn("[messaging]", (e as Error).message);
      return;
    }
    console.error("[messaging] LLM error:", (e as Error).message);
    return;
  }
  if (!replyText) return;

  const [rlo, rhi] = character.reply?.readDelayMs ?? [1500, 6000];
  const remainingRead = Math.max(0, rand(rlo, rhi) - (Date.now() - started));
  await sleep(remainingRead);
  setStatus(chatId, myUnreadIds(chatId), "read");

  const parts = character.reply?.splitOnNewlines === false ? [replyText] : replyText.split(/\n{1,}/).map((s) => s.trim()).filter(Boolean);
  const [tlo, thi] = character.reply?.typingMsPerChar ?? [35, 70];
  for (const part of parts) {
    await sleep(rand(600, 1800));
    publish({ type: "typing", chatId, typing: true });
    await sleep(Math.min(character.reply?.maxTypingMs ?? 9000, part.length * rand(tlo, thi)));
    publish({ type: "typing", chatId, typing: false });
    deliverIncoming(chatId, contact.id, part);
  }
}

// ---- trigger effect handlers ----
registerEffectHandler("deliver_message", (effect) => {
  if (!("deliver_message" in effect)) return;
  const { chat: chatId, from, text, delayMs } = effect.deliver_message;
  setTimeout(() => {
    try { seedChat(chatId); deliverIncoming(chatId, from, text); } catch (e) { console.error("[messaging] deliver_message failed:", e); }
  }, Math.max(0, delayMs ?? 0));
});
registerEffectHandler("unlock_contact", (effect) => {
  if ("unlock_contact" in effect) seedChat(effect.unlock_contact.id);
});
