/**
 * First-run stock imagery. Any manifest entry with a `pexels` query whose file is
 * missing is fetched from the Pexels API when PEXELS_API_KEY is set. Runs once per
 * process, sequentially, and never blocks a request; the UI shows fallbacks meanwhile.
 */
import fs from "node:fs";
import path from "node:path";
import { loadContent, contentPath } from "./content";
import type { AssetEntry } from "./assets";

interface ManifestFile { assets: Record<string, AssetEntry & { pexels?: { query: string; orientation?: string; size?: string; index?: number } }> }
type G = typeof globalThis & { __foundAssetFetch?: Promise<void> };

export function ensureStockAssets(): Promise<void> {
  const g = globalThis as G;
  if (g.__foundAssetFetch) return g.__foundAssetFetch;
  g.__foundAssetFetch = run().catch((e) => console.warn("[assets] fetch failed:", (e as Error).message));
  return g.__foundAssetFetch;
}

async function run(): Promise<void> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return;
  const { assets } = loadContent<ManifestFile>("assets.json");
  const root = contentPath("assets");
  const attributionPath = path.join(root, "attribution.json");
  const attribution: Record<string, unknown> = fs.existsSync(attributionPath) ? JSON.parse(fs.readFileSync(attributionPath, "utf8")) : {};
  let fetched = 0;
  for (const [name, a] of Object.entries(assets)) {
    if (!a.pexels || !a.file) continue;
    const dest = path.join(root, a.file);
    if (fs.existsSync(dest)) continue;
    try {
      const { query, orientation = "landscape", size = "large", index = 0 } = a.pexels;
      const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=${index + 1}`, { headers: { Authorization: key } });
      if (!res.ok) { console.warn(`[assets] ${name}: Pexels HTTP ${res.status}`); if (res.status === 429) break; continue; }
      const data = (await res.json()) as { photos?: { src: Record<string, string>; photographer: string; photographer_url: string; url: string }[] };
      const photo = data.photos?.[Math.min(index, (data.photos?.length ?? 1) - 1)];
      if (!photo) continue;
      const img = await fetch(photo.src[size] ?? photo.src.large ?? photo.src.original);
      if (!img.ok) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await img.arrayBuffer()));
      attribution[name] = { photographer: photo.photographer, photographer_url: photo.photographer_url, pexels_url: photo.url, query };
      fetched++;
      fs.writeFileSync(attributionPath, JSON.stringify(attribution, null, 2));
    } catch (e) {
      console.warn(`[assets] ${name}:`, (e as Error).message);
    }
  }
  if (fetched) console.log(`[assets] fetched ${fetched} stock image(s) from Pexels`);
}
