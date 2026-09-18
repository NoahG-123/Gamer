import { resetDb } from "@/lib/db";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Debug/testing: wipe all progress. */
export async function POST() { resetDb(); return json({ ok: true }); }
