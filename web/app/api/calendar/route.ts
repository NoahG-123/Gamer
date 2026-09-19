import { NextRequest } from "next/server";
import { instancesBetween, createEvent, updateEvent, deleteEvent, EventPatch } from "@/lib/calendar";
import { recordEvent } from "@/lib/state";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString();
  const to = req.nextUrl.searchParams.get("to") ?? new Date(Date.now() + 60 * 86400000).toISOString();
  if (req.nextUrl.searchParams.get("record") !== "0") recordEvent("app.opened", "calendar");
  return json(instancesBetween(from, to));
}

function patchOf(b: Record<string, unknown>): EventPatch {
  const p: EventPatch = {};
  if (typeof b.calendar === "string") p.calendar = b.calendar;
  if (typeof b.title === "string") p.title = b.title;
  if (typeof b.start === "string") p.start = b.start;
  if (typeof b.end === "string") p.end = b.end;
  if (typeof b.allDay === "boolean") p.allDay = b.allDay;
  if (typeof b.location === "string") p.location = b.location;
  if (typeof b.description === "string") p.description = b.description;
  if (typeof b.color === "string") p.color = b.color;
  if (Array.isArray(b.guests)) p.guests = b.guests.filter((g): g is string => typeof g === "string");
  return p;
}

/** Create an event. */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.start !== "string") return bad("start required");
  const id = createEvent(patchOf(b));
  recordEvent("calendar.created", id, { title: b.title ?? "" });
  return json({ ok: true, id });
}

/** Change one. */
export async function PATCH(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.id !== "string") return bad("id required");
  if (!updateEvent(b.id, patchOf(b))) return bad("not found", 404);
  recordEvent("calendar.edited", b.id, { title: b.title ?? "" });
  return json({ ok: true });
}

/** Delete one. Story events are hidden rather than destroyed. */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return bad("id required");
  if (!deleteEvent(id)) return bad("not found", 404);
  recordEvent("calendar.deleted", id);
  return json({ ok: true });
}
