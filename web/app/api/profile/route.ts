import { loadProfile } from "@/lib/content";
import { DRIVES, userHome } from "@/lib/vfs";
import { json } from "@/lib/http";
import { recordEvent, startClock } from "@/lib/state";
import { ensureStockAssets } from "@/lib/fetchAssets";
export const dynamic = "force-dynamic";
export async function GET() {
  const p = loadProfile();
  startClock();
  recordEvent("boot", p.machineName);
  ensureStockAssets().catch(() => {});
  return json({ profile: p, home: userHome(), drives: DRIVES, serverTime: new Date().toISOString() });
}
