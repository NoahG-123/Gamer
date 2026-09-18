import { loadContent } from "./content";
export interface SiteHost { host: string; title?: string; aliases?: string[]; spa?: boolean }
interface HostsFile { hosts: SiteHost[] }
export function storyHosts(): SiteHost[] { return loadContent<HostsFile>("sites/hosts.json").hosts; }
/** Resolve a request host (with or without www.) to the canonical story host folder, or null. */
export function resolveHost(host: string): string | null {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  for (const s of storyHosts()) {
    const names = [s.host, `www.${s.host}`, ...(s.aliases ?? [])].map((x) => x.toLowerCase());
    if (names.includes(h)) return s.host;
  }
  return null;
}
export function hostInfo(host: string): SiteHost | null { return storyHosts().find((s) => s.host === host) ?? null; }
