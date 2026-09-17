import { loadProfile } from "@/lib/content";
import { DRIVES, userHome } from "@/lib/vfs";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  const p = loadProfile();
  return json({ profile: p, home: userHome(), drives: DRIVES, serverTime: new Date().toISOString() });
}
