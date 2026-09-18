import { resolveAssets } from "@/lib/assets";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() { return json({ assets: resolveAssets() }); }
