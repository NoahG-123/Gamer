/**
 * Messaging (WhatsApp-style) backend: contacts, history, sending, and LLM-driven
 * replies with realistic delivery/read/typing pacing.
 */
import fs from "node:fs";
import { db } from "./db";
import { loadContent, contentPath, loadProfile } from "./content";
import { publish } from "./bus";
import { allFlags, isVisible, recordEvent, registerEffectHandler, revealedIds, presenceOverride, onTick } from "./state";
import { enqueue, dueReplies, markDone, scheduleFor, pendingFor, Responsiveness, DEFAULT_RESPONSIVENESS } from "./replies";
import { getSettings } from "./settings";
import { chat, BudgetExceededError, NotConfiguredError } from "./llm/deepseek";
import { loadCharacter, CharacterConfig } from "./llm/characters";

export interface Contact {
  id: string; name: string; phone?: string; about?: string; email?: string;
  avatar: { initials: string; color: string; src?: string };
  presence?: "online" | "offline" | "lastSeen"; lastSeen?: string;
  character?: string | null; hidden?: boolean; requires?: string[]; pinned?: boolean;
  isGroup?: boolean; participants?: string[];
  /** How soon this person tends to answer (lib/replies). */
  responsiveness?: Responsiveness;
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

/** Whether this computer is on the network right now. Nothing goes out while it is not. */
function online(): boolean {
  const s = getSettings();
  return s.wifi && !s.airplane;
}

/** Who actually answers in a group: a participant who has a character, chosen loosely at random. */
function speakerFor(contact: Contact): { chatId: string; sender: string; character: CharacterConfig } | null {
  const candidates = contact.isGroup
    ? (contact.participants ?? []).filter((p) => p !== "me").map((id) => getContactRaw(id)).filter((c): c is Contact => !!c?.character)
    : contact.character ? [contact] : [];
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const character = loadCharacter(pick.character!);
  if (!character) return null;
  return { chatId: contact.id, sender: contact.isGroup ? pick.id : contact.id, character };
}

/** Contacts by id including hidden ones, for group membership. */
function getContactRaw(id: string): Contact | null {
  return loadContent<ContactsFile>("messaging/contacts.json").contacts.find((c) => c.id === id) ?? null;
}

/** Send a message from me. Returns immediately; the person answers in their own time. */
export function sendMessage(chatId: string, text: string): Message {
  const contact = getContact(chatId);
  if (!contact) throw new Error("unknown chat");
  seedChat(chatId);
  const m = insertMessage(chatId, "me", text, "sent");
  recordEvent("message.sent", chatId, { id: m.id, length: text.length });

  if (!online()) return m; // no network: it sits on one tick until there is

  // Delivered almost at once, like a phone that is on.
  setTimeout(() => { try { setStatus(chatId, [m.id], "delivered"); } catch { /* window closed */ } }, rand(400, 1600));

  // One pending reply per chat: someone answering a burst replies once, to the lot.
  if (pendingFor(chatId).some((p) => p.kind === "message")) return m;
  const speaker = speakerFor(contact);
  if (!speaker) return m;
  const turn = countMyMessages(chatId);
  const due = scheduleFor(contact.responsiveness ?? DEFAULT_RESPONSIVENESS, turn);
  enqueue({ chatId, sender: speaker.sender, dueAt: due, kind: "message", meta: { character: speaker.character.id } });
  // The clock runs every 20 seconds; someone answering straight away should not wait for it.
  const inMs = due.getTime() - Date.now();
  if (inMs < 60_000) setTimeout(() => { try { runDueReplies(); } catch (e) { console.error("[messaging]", e); } }, Math.max(0, inMs));
  return m;
}

function countMyMessages(chatId: string): number {
  return Number((db().prepare("SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND sender = 'me'").get(chatId) as { n: number }).n);
}

const running = new Set<string>();

/** Run a reply that has come due: read receipt, the model, typing, then the message. */
async function deliverReply(chatId: string, sender: string, characterId: string): Promise<void> {
  if (running.has(chatId)) return;
  running.add(chatId);
  try {
    const character = loadCharacter(characterId);
    if (!character) return;
    const history = listMessages(chatId).slice(-(character.historyWindow ?? 24));
    const msgs = history.map((m) => ({ role: m.sender === "me" ? ("user" as const) : ("assistant" as const), content: m.text }));
    if (!msgs.length) return;

    let replyText: string | null = null;
    try {
      const res = await chat({ messages: msgs, system: buildSystemPrompt(character), model: character.model, temperature: character.temperature, maxTokens: character.maxTokens, characterId: character.id });
      replyText = res.content || null;
    } catch (e) {
      if (e instanceof BudgetExceededError || e instanceof NotConfiguredError) { console.warn("[messaging]", (e as Error).message); return; }
      console.error("[messaging] LLM error:", (e as Error).message);
      return;
    }
    if (!replyText) return;

    setStatus(chatId, myUnreadIds(chatId), "read");
    const parts = character.reply?.splitOnNewlines === false ? [replyText] : replyText.split(/\n{1,}/).map((s) => s.trim()).filter(Boolean);
    const [tlo, thi] = character.reply?.typingMsPerChar ?? [35, 70];
    for (const part of parts) {
      await sleep(rand(600, 1800));
      publish({ type: "typing", chatId, typing: true });
      await sleep(Math.min(character.reply?.maxTypingMs ?? 9000, part.length * rand(tlo, thi)));
      publish({ type: "typing", chatId, typing: false });
      deliverIncoming(chatId, sender, part);
    }
  } finally {
    running.delete(chatId);
  }
}

/** Called by the clock: deliver everything that has come due, including while the app was closed. */
export function runDueReplies(): void {
  if (!online()) return;
  for (const p of dueReplies()) {
    if (p.kind !== "message") continue;
    markDone(p.id);
    void deliverReply(p.chatId, p.sender, String(p.meta.character ?? p.sender)).catch((e) => console.error("[messaging] reply failed:", e));
  }
}
onTick(runDueReplies);

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
