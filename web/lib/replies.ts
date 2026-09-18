/**
 * When people answer.
 *
 * Real people do not reply on a timer that resets when you close the laptop, and they do
 * not all reply at the same speed. Every reply is scheduled as a row in `pending_replies`
 * with the moment its sender will pick up their phone, worked out from who they are, what
 * time it is where they are, and how the conversation has been going. The clock in
 * lib/state drives it, so a reply that was due while the machine was shut lands shortly
 * after it starts again — the way messages do.
 *
 * Delays run from seconds (someone already typing) to days (someone who has gone quiet).
 */
import { db } from "./db";
import { loadProfile } from "./content";

export type ReplyKind = "message" | "mail";

export interface PendingReply {
  id: number;
  chatId: string;
  sender: string;
  text: string;
  dueAt: string;
  kind: ReplyKind;
  meta: Record<string, unknown>;
}

interface Raw { id: number; chat_id: string; sender: string; text: string; due_at: string; kind: string; meta: string | null }

/** How quickly someone answers, before the time of day is taken into account. */
export interface Responsiveness {
  /** Minutes: the usual range for a first reply. */
  typical: [number, number];
  /** Chance they answer almost at once, because the phone was already in their hand. */
  instant?: number;
  /** Chance they do not get to it for a long time (hours, or overnight). */
  distracted?: number;
  /** Hours they are asleep in their own timezone: messages wait until morning. */
  asleep?: [number, number];
  /** Hours they are at work and slow to answer. */
  busy?: [number, number];
  /** Offset from the machine's timezone, in hours. */
  tzOffset?: number;
}

export const DEFAULT_RESPONSIVENESS: Responsiveness = { typical: [2, 25], instant: 0.25, distracted: 0.12, asleep: [1, 7] };

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/**
 * The moment a reply should land. `turn` is how many messages deep the exchange is: people
 * answer faster once a conversation is actually going.
 */
export function scheduleFor(r: Responsiveness = DEFAULT_RESPONSIVENESS, turn = 0, now = new Date()): Date {
  // The test suite needs replies to land while it is still watching.
  if (process.env.FOUND_FAST_REPLIES === "1") return new Date(now.getTime() + 300);
  const local = new Date(now.getTime() + (r.tzOffset ?? 0) * 3600_000);
  const hour = local.getHours() + local.getMinutes() / 60;
  const inWindow = (w?: [number, number]) => {
    if (!w) return false;
    const [a, b] = w;
    return a <= b ? hour >= a && hour < b : hour >= a || hour < b;
  };

  let minutes: number;
  const warm = Math.min(0.7, turn * 0.16); // a conversation in flow speeds up
  if (Math.random() < (r.instant ?? 0.2) + warm * 0.4) minutes = rand(0.05, 1.2);
  else if (Math.random() < (r.distracted ?? 0.12) * (1 - warm)) minutes = rand(90, 60 * 22);
  else {
    const [lo, hi] = r.typical;
    minutes = rand(lo, hi) * (1 - warm * 0.6);
  }
  if (inWindow(r.busy)) minutes *= rand(1.6, 4);

  let due = new Date(now.getTime() + minutes * 60_000);
  // Asleep: it waits for the morning, with people waking at slightly different times.
  if (r.asleep) {
    const [wakeStart, wakeEnd] = r.asleep;
    for (let guard = 0; guard < 3; guard++) {
      const dueLocal = new Date(due.getTime() + (r.tzOffset ?? 0) * 3600_000);
      const h = dueLocal.getHours() + dueLocal.getMinutes() / 60;
      const sleeping = wakeStart <= wakeEnd ? h >= wakeStart && h < wakeEnd : h >= wakeStart || h < wakeEnd;
      if (!sleeping) break;
      const wake = new Date(dueLocal);
      wake.setHours(Math.floor(wakeEnd), Math.floor(rand(0, 55)), 0, 0);
      if (wake.getTime() <= dueLocal.getTime()) wake.setDate(wake.getDate() + 1);
      due = new Date(wake.getTime() - (r.tzOffset ?? 0) * 3600_000);
    }
  }
  return due;
}

export function enqueue(opts: { chatId: string; sender: string; text?: string; dueAt: Date; kind?: ReplyKind; meta?: Record<string, unknown> }): number {
  const r = db().prepare("INSERT INTO pending_replies(chat_id, sender, text, due_at, kind, meta) VALUES (?,?,?,?,?,?)")
    .run(opts.chatId, opts.sender, opts.text ?? "", opts.dueAt.toISOString(), opts.kind ?? "message", JSON.stringify(opts.meta ?? {}));
  return Number(r.lastInsertRowid);
}

export function dueReplies(now = new Date()): PendingReply[] {
  const rows = db().prepare("SELECT id, chat_id, sender, text, due_at, kind, meta FROM pending_replies WHERE done = 0 AND due_at <= ? ORDER BY due_at").all(now.toISOString()) as unknown as Raw[];
  return rows.map((r) => ({ id: r.id, chatId: r.chat_id, sender: r.sender, text: r.text, dueAt: r.due_at, kind: r.kind as ReplyKind, meta: r.meta ? JSON.parse(r.meta) : {} }));
}

export function pendingFor(chatId: string): PendingReply[] {
  const rows = db().prepare("SELECT id, chat_id, sender, text, due_at, kind, meta FROM pending_replies WHERE done = 0 AND chat_id = ?").all(chatId) as unknown as Raw[];
  return rows.map((r) => ({ id: r.id, chatId: r.chat_id, sender: r.sender, text: r.text, dueAt: r.due_at, kind: r.kind as ReplyKind, meta: r.meta ? JSON.parse(r.meta) : {} }));
}

export function markDone(id: number): void {
  db().prepare("UPDATE pending_replies SET done = 1 WHERE id = ?").run(id);
}

/** Someone's local clock, for "last seen" and for deciding whether they are asleep. */
export function machineTimezone(): string {
  return loadProfile().timezone;
}
