/**
 * Story state engine.
 *
 * Records events (file opened, site visited, ...), keeps flags, and evaluates
 * trigger definitions from content/triggers.json after every change. Effects
 * reveal hidden content, set flags, unlock contacts or schedule messages.
 */
import { db } from "./db";
import { loadContent } from "./content";
import { publish } from "./bus";

export interface EventRecord { id: number; type: string; subject: string; data: unknown; at: string }

type Condition =
  | { event: string; subject?: string }
  | { flag: string; value?: unknown }
  | { count: { event: string; subject?: string; min: number } }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

type Effect =
  | { reveal: string }
  | { set_flag: { key: string; value: unknown } }
  | { unlock_contact: { id: string } }
  | { deliver_message: { chat: string; from: string; text: string; delayMs?: number } }
  | { log: { text: string } };

export interface Trigger { id: string; when: Condition; then: Effect[]; repeat?: boolean }

interface TriggersFile { triggers: Trigger[] }

// Effects that need other modules (messaging) register handlers here to avoid import cycles.
type EffectHandler = (effect: Effect, trigger: Trigger) => void;
const handlers: Record<string, EffectHandler> = {};
export function registerEffectHandler(name: string, fn: EffectHandler): void { handlers[name] = fn; }

function subjectMatches(pattern: string | undefined, subject: string): boolean {
  if (pattern === undefined) return true;
  if (pattern.endsWith("*")) return subject.startsWith(pattern.slice(0, -1));
  return pattern === subject;
}

export function countEvents(type: string, subject?: string): number {
  const conn = db();
  if (subject === undefined) return Number((conn.prepare("SELECT COUNT(*) AS n FROM events WHERE type = ?").get(type) as { n: number }).n);
  if (subject.endsWith("*")) return Number((conn.prepare("SELECT COUNT(*) AS n FROM events WHERE type = ? AND subject LIKE ?").get(type, subject.slice(0, -1).replace(/[%_]/g, "\\$&") + "%") as { n: number }).n);
  return Number((conn.prepare("SELECT COUNT(*) AS n FROM events WHERE type = ? AND subject = ?").get(type, subject) as { n: number }).n);
}

export function getFlag(key: string): unknown {
  const row = db().prepare("SELECT value FROM flags WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : undefined;
}

export function setFlag(key: string, value: unknown): void {
  db().prepare("INSERT INTO flags(key, value, set_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, set_at = excluded.set_at").run(key, JSON.stringify(value));
  publish({ type: "flag", key, value });
  evaluateTriggers();
}

export function allFlags(): Record<string, unknown> {
  const rows = db().prepare("SELECT key, value FROM flags").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
}

export function isRevealed(kind: string, id: string): boolean {
  return !!db().prepare("SELECT 1 FROM revealed WHERE kind = ? AND id = ?").get(kind, id);
}

export function reveal(kind: string, id: string): void {
  db().prepare("INSERT OR IGNORE INTO revealed(kind, id) VALUES (?, ?)").run(kind, id);
  if (kind === "file") publish({ type: "fs.changed", paths: [id] });
  if (kind === "contact") publish({ type: "contact.unlocked", contactId: id });
}

export function revealedIds(kind: string): Set<string> {
  return new Set((db().prepare("SELECT id FROM revealed WHERE kind = ?").all(kind) as { id: string }[]).map((r) => r.id));
}

/** True when an item's visibility rules (`hidden`, `requires`) pass. */
export function isVisible(item: { hidden?: boolean; requires?: string[] }, kind: string, id: string, flags = allFlags(), revealed?: Set<string>): boolean {
  if (item.hidden) {
    const set = revealed ?? revealedIds(kind);
    if (!set.has(id)) return false;
  }
  if (item.requires?.length) for (const f of item.requires) if (!flags[f]) return false;
  return true;
}

function evalCondition(c: Condition): boolean {
  if ("all" in c) return c.all.every(evalCondition);
  if ("any" in c) return c.any.some(evalCondition);
  if ("not" in c) return !evalCondition(c.not);
  if ("count" in c) return countEvents(c.count.event, c.count.subject) >= c.count.min;
  if ("flag" in c) {
    const v = getFlag(c.flag);
    if (c.value === undefined) return v !== undefined && v !== false && v !== null;
    return JSON.stringify(v) === JSON.stringify(c.value);
  }
  if ("event" in c) return countEvents(c.event, c.subject) > 0;
  return false;
}

function applyEffect(effect: Effect, trigger: Trigger): void {
  if ("reveal" in effect) {
    // A path reveals a file; anything else is looked up by handlers (contact/bookmark ids).
    const id = effect.reveal;
    const kind = /^[A-Za-z]:\//.test(id) ? "file" : "generic";
    if (kind === "file") reveal("file", id);
    else handlers["reveal"]?.(effect, trigger);
    return;
  }
  if ("set_flag" in effect) {
    db().prepare("INSERT INTO flags(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, set_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')").run(effect.set_flag.key, JSON.stringify(effect.set_flag.value));
    publish({ type: "flag", key: effect.set_flag.key, value: effect.set_flag.value });
    return;
  }
  if ("unlock_contact" in effect) { reveal("contact", effect.unlock_contact.id); handlers["unlock_contact"]?.(effect, trigger); return; }
  if ("deliver_message" in effect) { handlers["deliver_message"]?.(effect, trigger); return; }
  if ("log" in effect) { recordEventRaw("trigger.log", trigger.id, { text: effect.log.text }); return; }
}

let evaluating = false;
/** Evaluate all not-yet-fired triggers. Re-runs until no new trigger fires (effects can satisfy other triggers). */
export function evaluateTriggers(): string[] {
  if (evaluating) return [];
  evaluating = true;
  const fired: string[] = [];
  try {
    const { triggers } = loadContent<TriggersFile>("triggers.json");
    const conn = db();
    let progressed = true;
    let guard = 0;
    while (progressed && guard++ < 20) {
      progressed = false;
      const done = new Set((conn.prepare("SELECT trigger_id FROM fired_triggers").all() as { trigger_id: string }[]).map((r) => r.trigger_id));
      for (const t of triggers) {
        if (done.has(t.id) && !t.repeat) continue;
        if (!evalCondition(t.when)) continue;
        conn.prepare("INSERT INTO fired_triggers(trigger_id) VALUES (?)").run(t.id);
        for (const e of t.then) applyEffect(e, t);
        recordEventRaw("trigger.fired", t.id, null);
        publish({ type: "trigger.fired", triggerId: t.id });
        fired.push(t.id);
        progressed = !t.repeat;
        done.add(t.id);
      }
    }
  } finally {
    evaluating = false;
  }
  return fired;
}

function recordEventRaw(type: string, subject: string, data: unknown): number {
  const r = db().prepare("INSERT INTO events(type, subject, data) VALUES (?, ?, ?)").run(type, subject, data == null ? null : JSON.stringify(data));
  return Number(r.lastInsertRowid);
}

/** Record an event and evaluate triggers. Returns ids of triggers that fired. */
export function recordEvent(type: string, subject = "", data: unknown = null): { id: number; fired: string[] } {
  const id = recordEventRaw(type, subject, data);
  const fired = evaluateTriggers();
  return { id, fired };
}

export function listEvents(limit = 200): EventRecord[] {
  return (db().prepare("SELECT id, type, subject, data, at FROM events ORDER BY id DESC LIMIT ?").all(limit) as { id: number; type: string; subject: string; data: string | null; at: string }[])
    .map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null }));
}

export function firedTriggers(): string[] {
  return (db().prepare("SELECT trigger_id FROM fired_triggers ORDER BY rowid").all() as { trigger_id: string }[]).map((r) => r.trigger_id);
}

export function snapshot() {
  return { flags: allFlags(), fired: firedTriggers(), revealed: { files: [...revealedIds("file")], contacts: [...revealedIds("contact")], generic: [...revealedIds("generic")] }, events: listEvents(50) };
}
