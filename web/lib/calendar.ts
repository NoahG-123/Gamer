/**
 * Calendar backend for the Google Calendar clone. Events live in content/calendar/events.json
 * (plus content/calendar/*.json), with weekly recurrences expanded on request. Hidden events
 * appear after a trigger's `reveal_event` effect.
 *
 * On top of that read-only world sits a writable overlay in SQLite, so the calendar is a
 * calendar: events the player creates are stored, edits to an existing event are stored as
 * a patch over the one in the content, and a deletion leaves a tombstone that hides it.
 * Nothing in content/ is ever written to, so a story event can always be put back by
 * deleting the row that shadows it.
 */
import fs from "node:fs";
import { loadContent, contentPath } from "./content";
import { allFlags, isVisible, revealedIds } from "./state";
import { db } from "./db";
import { publish } from "./bus";

export interface CalendarDef { id: string; name: string; color: string; visible?: boolean }
export interface EventDef {
  id: string; calendar: string; title: string; start: string; end?: string; allDay?: boolean;
  location?: string; description?: string; guests?: string[]; color?: string;
  recurrence?: { freq: "daily" | "weekly" | "monthly"; interval?: number; byDay?: string[]; until?: string; count?: number; exceptions?: string[] };
  hidden?: boolean; requires?: string[];
}
interface CalendarFile { calendars?: CalendarDef[]; events: EventDef[] }

interface OverlayRow { id: string; series_id: string | null; json: string | null; deleted: number }

/** Everything the player has added, changed or deleted, keyed by event id. */
function overlay(): Map<string, { event: EventDef | null; deleted: boolean }> {
  const rows = db().prepare("SELECT id, series_id, json, deleted FROM calendar_overlay").all() as unknown as OverlayRow[];
  const out = new Map<string, { event: EventDef | null; deleted: boolean }>();
  for (const r of rows) {
    let event: EventDef | null = null;
    if (r.json) { try { event = JSON.parse(r.json) as EventDef; } catch { event = null; } }
    out.set(r.id, { event, deleted: !!r.deleted });
  }
  return out;
}

export function loadCalendar(): { calendars: CalendarDef[]; events: EventDef[] } {
  const base = loadContent<CalendarFile>("calendar/events.json");
  const events = [...base.events];
  const dir = contentPath("calendar", "extra");
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) events.push(...loadContent<CalendarFile>(`calendar/extra/${f}`).events);

  const ov = overlay();
  if (!ov.size) return { calendars: base.calendars ?? [], events };

  const merged: EventDef[] = [];
  for (const e of events) {
    const row = ov.get(e.id);
    if (!row) { merged.push(e); continue; }
    if (row.deleted) continue;            // the player deleted this one
    merged.push(row.event ? { ...e, ...row.event, id: e.id } : e);
    ov.delete(e.id);
  }
  // Whatever is left is the player's own: events they created from scratch.
  for (const [id, row] of ov) if (!row.deleted && row.event) merged.push({ ...row.event, id });
  return { calendars: base.calendars ?? [], events: merged };
}

export interface EventPatch {
  calendar?: string; title?: string; start?: string; end?: string; allDay?: boolean;
  location?: string; description?: string; guests?: string[]; color?: string;
}

/** Every event the world ships, before the player's overlay is applied. */
function baseEvents(): EventDef[] {
  const base = loadContent<CalendarFile>("calendar/events.json");
  const events = [...base.events];
  const dir = contentPath("calendar", "extra");
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) events.push(...loadContent<CalendarFile>(`calendar/extra/${f}`).events);
  return events;
}
function isStoryEvent(id: string): boolean {
  return baseEvents().some((e) => e.id === id);
}

function touched(ids: string[] = []): void { publish({ type: "calendar.changed", ids }); }

/** A new event, created by the player. Returns the id it was given. */
export function createEvent(patch: EventPatch): string {
  const id = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const event: EventDef = {
    id,
    calendar: patch.calendar || "wren",
    title: patch.title?.trim() || "(No title)",
    start: patch.start ?? new Date().toISOString(),
    end: patch.end,
    allDay: patch.allDay,
    location: patch.location,
    description: patch.description,
    guests: patch.guests,
    color: patch.color,
  };
  db().prepare("INSERT INTO calendar_overlay(id, series_id, json, deleted) VALUES (?,?,?,0)").run(id, null, JSON.stringify(event));
  touched([id]);
  return id;
}

/**
 * Change an event. A story event keeps its own row in content/ untouched; the patch is
 * stored over the top of it, so nothing in the world is ever lost.
 */
export function updateEvent(id: string, patch: EventPatch): boolean {
  const series = id.split("@")[0];
  // Look past any tombstone: editing an event the player deleted is how it comes back,
  // and a story event is never gone from content/ in the first place.
  const current = loadCalendar().events.find((e) => e.id === series) ?? baseEvents().find((e) => e.id === series);
  if (!current) return false;
  const next: EventDef = { ...current, ...patch, id: series };
  db().prepare(`INSERT INTO calendar_overlay(id, series_id, json, deleted) VALUES (?,?,?,0)
    ON CONFLICT(id) DO UPDATE SET json = excluded.json, deleted = 0`).run(series, series, JSON.stringify(next));
  touched([series]);
  return true;
}

/** Remove an event. A story event is hidden by a tombstone rather than deleted. */
export function deleteEvent(id: string): boolean {
  const series = id.split("@")[0];
  if (!isStoryEvent(series)) {
    const r = db().prepare("DELETE FROM calendar_overlay WHERE id = ?").run(series);
    touched([series]);
    return Number(r.changes) > 0;
  }
  db().prepare(`INSERT INTO calendar_overlay(id, series_id, json, deleted) VALUES (?,?,NULL,1)
    ON CONFLICT(id) DO UPDATE SET deleted = 1`).run(series, series);
  touched([series]);
  return true;
}

/** True when this event came from the world rather than from the player. */
export function eventIsFromStory(id: string): boolean { return isStoryEvent(id.split("@")[0]); }

export interface EventInstance { id: string; seriesId: string; calendar: string; title: string; start: string; end: string; allDay: boolean; location?: string; description?: string; guests?: string[]; color?: string }

const DAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Expand events into instances overlapping [from, to). Dates are ISO strings; recurrence math is done in UTC on the event's own wall-clock offset. */
export function instancesBetween(from: string, to: string): { calendars: CalendarDef[]; events: EventInstance[] } {
  const { calendars, events } = loadCalendar();
  const flags = allFlags();
  const revealed = revealedIds("calendar");
  const f = new Date(from).getTime(), t = new Date(to).getTime();
  const out: EventInstance[] = [];
  for (const e of events) {
    if (!isVisible(e, "calendar", e.id, flags, revealed)) continue;
    const s0 = new Date(e.start).getTime();
    const dur = e.end ? new Date(e.end).getTime() - s0 : e.allDay ? 86400000 : 3600000;
    const push = (s: number, idx: number) => {
      if (s + dur <= f || s >= t) return;
      out.push({ id: idx ? `${e.id}@${idx}` : e.id, seriesId: e.id, calendar: e.calendar, title: e.title, start: new Date(s).toISOString(), end: new Date(s + dur).toISOString(), allDay: !!e.allDay, location: e.location, description: e.description, guests: e.guests, color: e.color });
    };
    if (!e.recurrence) { push(s0, 0); continue; }
    const r = e.recurrence;
    const until = r.until ? new Date(r.until).getTime() : t;
    const interval = r.interval ?? 1;
    const exceptions = new Set((r.exceptions ?? []).map((d) => d.slice(0, 10)));
    let count = 0, idx = 0;
    if (r.freq === "weekly") {
      const days = (r.byDay?.length ? r.byDay : [DAY[new Date(s0).getUTCDay()]]).map((d) => DAY.indexOf(d));
      const start = new Date(s0);
      const weekStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() - start.getUTCDay(), start.getUTCHours(), start.getUTCMinutes()));
      for (let w = 0; w < 400; w++) {
        const base = weekStart.getTime() + w * interval * 7 * 86400000;
        for (const d of days.sort()) {
          const s = base + d * 86400000;
          if (s < s0) continue;
          if (s > until || s >= t) { w = 1e9; break; }
          if (r.count && count >= r.count) { w = 1e9; break; }
          count++; idx++;
          if (exceptions.has(new Date(s).toISOString().slice(0, 10))) continue;
          push(s, idx);
        }
      }
    } else if (r.freq === "daily") {
      for (let i = 0; i < 2000; i++) {
        const s = s0 + i * interval * 86400000;
        if (s > until || s >= t || (r.count && i >= r.count)) break;
        if (exceptions.has(new Date(s).toISOString().slice(0, 10))) continue;
        push(s, i);
      }
    } else if (r.freq === "monthly") {
      const d0 = new Date(s0);
      for (let i = 0; i < 120; i++) {
        const s = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + i * interval, d0.getUTCDate(), d0.getUTCHours(), d0.getUTCMinutes());
        if (s > until || s >= t || (r.count && i >= r.count)) break;
        if (exceptions.has(new Date(s).toISOString().slice(0, 10))) continue;
        push(s, i);
      }
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start));
  return { calendars, events: out };
}
