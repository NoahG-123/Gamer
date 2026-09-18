import { NextRequest } from "next/server";
import { getSettings, setSettings, SettingsState } from "@/lib/settings";
import { recordEvent } from "@/lib/state";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";

export async function GET() { return json({ settings: getSettings() }); }

export async function POST(req: NextRequest) {
  const patch = (await req.json().catch(() => ({}))) as Partial<SettingsState>;
  const settings = setSettings(patch);
  for (const k of Object.keys(patch)) recordEvent("setting.changed", k, { value: (patch as Record<string, unknown>)[k] });
  return json({ settings });
}
