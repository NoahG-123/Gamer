import { NextRequest } from "next/server";
import { getSettings, setSettings, SettingsState } from "@/lib/settings";
import { recordEvent } from "@/lib/state";
import { runDueReplies } from "@/lib/messaging";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";

export async function GET() { return json({ settings: getSettings() }); }

export async function POST(req: NextRequest) {
  const patch = (await req.json().catch(() => ({}))) as Partial<SettingsState>;
  const settings = setSettings(patch);
  for (const k of Object.keys(patch)) recordEvent("setting.changed", k, { value: (patch as Record<string, unknown>)[k] });
  // Back on the network: send what was waiting.
  if ((patch.wifi === true || patch.airplane === false) && settings.wifi && !settings.airplane) { try { runDueReplies(); } catch { /* nothing waiting */ } }
  return json({ settings });
}
