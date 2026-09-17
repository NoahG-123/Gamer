import { storyHosts } from "@/lib/sites";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  const hosts = storyHosts();
  const all = hosts.flatMap((h) => [h.host, `www.${h.host}`, ...(h.aliases ?? [])]);
  return json({ hosts, match: [...new Set(all.map((s) => s.toLowerCase()))] });
}
