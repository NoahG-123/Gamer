/**
 * Calendar backend for the Google Calendar clone. Events live in content/calendar/events.json
 * (plus content/calendar/*.json), with weekly recurrences expanded on request. Hidden events
 * appear after a trigger's `reveal_event` effect.
 */
import fs from "node:fs";
import { loadContent, contentPath } from "./content";
import { allFlags, isVisible, revealedIds } from "./state";

export interface CalendarDef { id: string; name: string; color: string; visible?: boolean }
export interface EventDef {
  id: string; calendar: string; title: string; start: string; end?: string; allDay?: boolean;
  location?: string; description?: string; guests?: string[]; color?: string;
  recurrence?: { freq: "daily" | "weekly" | "monthly"; interval?: number; byDay?: string[]; until?: string; count?: number; exceptions?: string[] };
  hidden?: boolean; requires?: string[];
}
interface CalendarFile { calendars?: CalendarDef[]; events: EventDef[] }

export function loadCalendar(): { calendars: CalendarDef[]; events: EventDef[] } {
  const base = loadContent<CalendarFile>("calendar/events.json");
  const events = [...base.events];
  const dir = contentPath("calendar", "extra");
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) events.push(...loadContent<CalendarFile>(`calendar/extra/${f}`).events);
  return { calendars: base.calendars ?? [], events };
}

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
