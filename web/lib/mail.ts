/**
 * Mailbox backend for the Gmail clone. Threads come from content/mail/*.json;
 * read/star/trash state and any runtime messages (sent or received) live in SQLite.
 * Hidden threads appear after a trigger's `deliver_mail` effect reveals them.
 */
import fs from "node:fs";
import { db } from "./db";
import { loadContent, contentPath } from "./content";
import { publish } from "./bus";
import { allFlags, isVisible, recordEvent, revealedIds, registerEffectHandler } from "./state";
import { chat, BudgetExceededError, NotConfiguredError } from "./llm/deepseek";
import { loadCharacter } from "./llm/characters";
import { buildSystemPrompt } from "./messaging";

export interface Address { name?: string; email: string }
export interface Attachment { name: string; size: number; path?: string; mime?: string }
export interface MailMessage { id: string; from: Address; to: Address[]; cc?: Address[]; at: string; body: string; html?: string; attachments?: Attachment[]; unread?: boolean }
export interface Thread { id: string; subject: string; labels: string[]; messages: MailMessage[]; hidden?: boolean; requires?: string[]; starred?: boolean; unread?: boolean; important?: boolean; snippetOverride?: string }
export interface Mailbox { account: { email: string; name: string; initials: string; color: string }; labels: { id: string; name: string; color?: string }[]; threads: Thread[] }

interface MailFile { account?: Mailbox["account"]; labels?: Mailbox["labels"]; threads: Thread[] }

export function loadMailbox(): Mailbox {
  const base = loadContent<MailFile>("mail/mailbox.json");
  const threads = [...base.threads];
  const dir = contentPath("mail", "threads");
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) threads.push(...loadContent<MailFile>(`mail/threads/${f}`).threads);
  // Threads composed at runtime are stored in kv so they survive restarts.
  const rows = db().prepare("SELECT value FROM kv WHERE key LIKE 'mailthread:%'").all() as { value: string }[];
  for (const r of rows) { const t = JSON.parse(r.value) as { id: string; subject: string; labels: string[] }; threads.push({ id: t.id, subject: t.subject, labels: t.labels, messages: [] }); }
  return { account: base.account!, labels: base.labels ?? [], threads };
}

interface StateRow { thread_id: string; read: number; starred: number | null; labels: string | null; trashed: number }

function stateMap(): Map<string, StateRow> {
  const rows = db().prepare("SELECT thread_id, read, starred, labels, trashed FROM mail_state").all() as unknown as StateRow[];
  return new Map(rows.map((r) => [r.thread_id, r]));
}

function runtimeMessages(): Map<string, MailMessage[]> {
  const rows = db().prepare("SELECT thread_id, message FROM mail_runtime ORDER BY id").all() as { thread_id: string; message: string }[];
  const out = new Map<string, MailMessage[]>();
  for (const r of rows) { if (!out.has(r.thread_id)) out.set(r.thread_id, []); out.get(r.thread_id)!.push(JSON.parse(r.message)); }
  return out;
}

export interface ThreadView extends Thread { lastAt: string; snippet: string; unread: boolean; starred: boolean; trashed: boolean; from: string }

export function visibleThreads(): ThreadView[] {
  const box = loadMailbox();
  const flags = allFlags();
  const revealed = revealedIds("mail");
  const states = stateMap();
  const runtime = runtimeMessages();
  const out: ThreadView[] = [];
  for (const t of box.threads) {
    if (!isVisible(t, "mail", t.id, flags, revealed)) continue;
    const st = states.get(t.id);
    const messages = [...t.messages, ...(runtime.get(t.id) ?? [])].sort((a, b) => a.at.localeCompare(b.at));
    const last = messages[messages.length - 1];
    const labels = st?.labels ? (JSON.parse(st.labels) as string[]) : t.labels;
    const unread = st ? !st.read : t.unread ?? messages.some((m) => m.unread);
    const starred = st?.starred != null ? !!st.starred : !!t.starred;
    const bodyText = (last?.body ?? "").replace(/\s+/g, " ").trim();
    const senders = [...new Set(messages.map((m) => (m.from.email === box.account.email ? "me" : (m.from.name || m.from.email).split(" ")[0])))];
    out.push({ ...t, messages, labels, lastAt: last?.at ?? "", snippet: t.snippetOverride ?? bodyText.slice(0, 120), unread, starred, trashed: !!st?.trashed, from: senders.length > 1 ? `${senders.join(", ")} ${messages.length}` : senders[0] ?? "" });
  }
  out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return out;
}

export function getThread(id: string): ThreadView | null { return visibleThreads().find((t) => t.id === id) ?? null; }

export function setThreadState(id: string, patch: { read?: boolean; starred?: boolean; labels?: string[]; trashed?: boolean }): void {
  const conn = db();
  const cur = conn.prepare("SELECT thread_id, read, starred, labels, trashed FROM mail_state WHERE thread_id = ?").get(id) as unknown as StateRow | undefined;
  const t = loadMailbox().threads.find((x) => x.id === id);
  const read = patch.read ?? (cur ? !!cur.read : !(t?.unread ?? t?.messages.some((m) => m.unread)));
  const starred = patch.starred ?? (cur?.starred != null ? !!cur.starred : !!t?.starred);
  const labels = patch.labels ?? (cur?.labels ? (JSON.parse(cur.labels) as string[]) : t?.labels ?? []);
  const trashed = patch.trashed ?? (cur ? !!cur.trashed : false);
  conn.prepare("INSERT INTO mail_state(thread_id, read, starred, labels, trashed) VALUES (?,?,?,?,?) ON CONFLICT(thread_id) DO UPDATE SET read = excluded.read, starred = excluded.starred, labels = excluded.labels, trashed = excluded.trashed")
    .run(id, read ? 1 : 0, starred ? 1 : 0, JSON.stringify(labels), trashed ? 1 : 0);
  if (patch.read) recordEvent("mail.read", id);
  publish({ type: "mail.changed", ids: [id] });
}

export function unreadCount(label = "inbox"): number {
  return visibleThreads().filter((t) => !t.trashed && t.unread && t.labels.includes(label)).length;
}

let seq = 0;
function newId(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`; }

/** Append a runtime message (received) to a thread; used by triggers and LLM replies. */
export function receiveMail(threadId: string, msg: Omit<MailMessage, "id" | "at"> & { at?: string }): MailMessage {
  const m: MailMessage = { id: newId("rt"), at: msg.at ?? new Date().toISOString(), ...msg, unread: true };
  db().prepare("INSERT INTO mail_runtime(thread_id, message) VALUES (?, ?)").run(threadId, JSON.stringify(m));
  setThreadState(threadId, { read: false });
  recordEvent("mail.received", threadId, { from: m.from.email });
  const t = loadMailbox().threads.find((x) => x.id === threadId);
  publish({ type: "ui.notify", app: "mail", title: m.from.name || m.from.email, text: `${t?.subject ?? ""} — ${m.body.replace(/\s+/g, " ").slice(0, 90)}`, props: { url: `https://mail.google.com/mail/u/0/#inbox/${threadId}` } });
  return m;
}

/** Send a message from the account owner. Creates a new thread when threadId is absent. */
export function sendMail(opts: { threadId?: string; to: string; subject: string; body: string }): { threadId: string; message: MailMessage } {
  const box = loadMailbox();
  const toAddrs = opts.to.split(/[;,]/).map((s) => s.trim()).filter(Boolean).map(parseAddress);
  const m: MailMessage = { id: newId("me"), from: { name: box.account.name, email: box.account.email }, to: toAddrs, at: new Date().toISOString(), body: opts.body };
  let threadId = opts.threadId ?? "";
  if (!threadId || !box.threads.some((t) => t.id === threadId)) {
    threadId = newId("t");
    // New threads are stored as a runtime-only thread definition in kv so they survive restarts.
    db().prepare("INSERT INTO kv(key, value) VALUES (?, ?)").run(`mailthread:${threadId}`, JSON.stringify({ id: threadId, subject: opts.subject || "(no subject)", labels: ["sent"] }));
  }
  db().prepare("INSERT INTO mail_runtime(thread_id, message) VALUES (?, ?)").run(threadId, JSON.stringify(m));
  setThreadState(threadId, { read: true });
  recordEvent("mail.sent", threadId, { to: toAddrs.map((a) => a.email), subject: opts.subject, length: opts.body.length });
  for (const a of toAddrs) void emailReplyPipeline(threadId, a, opts.subject, m);
  return { threadId, message: m };
}

function parseAddress(s: string): Address {
  const m = s.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: s.trim() };
}

const replyDelays = new Map<string, number>();

/** LLM email reply from a contact whose character config has an `email` address. */
async function emailReplyPipeline(threadId: string, to: Address, subject: string, sent: MailMessage): Promise<void> {
  const contacts = loadContent<{ contacts: { id: string; name: string; email?: string; character?: string | null }[] }>("messaging/contacts.json").contacts;
  const contact = contacts.find((c) => c.email && c.email.toLowerCase() === to.email.toLowerCase() && c.character);
  if (!contact) return;
  const character = loadCharacter(contact.character!);
  if (!character) return;
  const thread = getThread(threadId);
  const history = (thread?.messages ?? []).slice(-12).map((m) => ({ role: m.from.email === sent.from.email ? ("user" as const) : ("assistant" as const), content: `Subject: ${thread?.subject ?? subject}\n\n${m.body}` }));
  if (!history.length) history.push({ role: "user", content: `Subject: ${subject}\n\n${sent.body}` });
  const system = buildSystemPrompt(character, { channel: "email" });
  let text: string | null = null;
  try {
    const res = await chat({ messages: history, system, model: character.model, temperature: character.temperature, maxTokens: Math.max(character.maxTokens ?? 300, 500), characterId: character.id });
    text = res.content || null;
  } catch (e) {
    if (!(e instanceof BudgetExceededError || e instanceof NotConfiguredError)) console.error("[mail] LLM error:", (e as Error).message);
    return;
  }
  if (!text) return;
  // People answer email slowly. Second and later replies in a burst come a little faster.
  const n = (replyDelays.get(contact.id) ?? 0) + 1; replyDelays.set(contact.id, n);
  const [lo, hi] = character.emailDelayMinutes ?? [2, 9];
  const delay = (lo + Math.random() * (hi - lo)) * 60_000 / Math.min(n, 3);
  setTimeout(() => { try { receiveMail(threadId, { from: { name: contact.name, email: contact.email! }, to: [sent.from], body: text! }); } catch (e) { console.error("[mail] reply failed:", e); } }, delay);
}

registerEffectHandler("deliver_mail", () => { /* reveal already published; nothing else needed */ });
