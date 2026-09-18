/**
 * First-run imagery.
 *
 * Two things happen here, both in the background, neither blocking a request:
 *  - the faces of the people on this machine are fetched from randomiser.me, one request
 *    each, into the paths the manifest already points at, so the cast is there without
 *    anyone having to run a script. Which face a person gets is whatever the service
 *    returns; nothing chooses a face for anyone.
 *  - stock imagery for any manifest entry with a `pexels` query, when PEXELS_API_KEY is set.
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
  g.__foundAssetFetch = Promise.all([
    run().catch((e) => console.warn("[assets] stock fetch failed:", (e as Error).message)),
    fetchPeople().catch((e) => console.warn("[assets] portraits failed:", (e as Error).message)),
  ]).then(() => undefined);
  return g.__foundAssetFetch;
}

/** Portraits for every `person` slot whose file is missing. Silent when offline. */
async function fetchPeople(): Promise<void> {
  const { assets } = loadContent<ManifestFile>("assets.json");
  const root = contentPath("assets");
  // Slots that name the same file share one face (an account picture and a chat avatar
  // belong to the same human).
  const wanted = new Map<string, { gender: "male" | "female" }>();
  const GENDER: Record<string, "male" | "female"> = {
    "people.owner": "female", "people.contact.wren": "female", "people.contact.priya": "female",
    "people.contact.mateo": "male", "people.contact.mama": "female", "people.contact.jonah": "male",
    "people.contact.nadia": "female", "people.contact.colin": "male", "people.contact.ilse": "female",
    "people.contact.liam": "male", "people.contact.landlord": "male",
  };
  for (const [name, a] of Object.entries(assets)) {
    if (a.kind !== "person" || !a.file) continue;
    const dest = path.join(root, a.file);
    if (fs.existsSync(dest) || wanted.has(dest)) continue;
    wanted.set(dest, { gender: GENDER[name] ?? (Math.random() < 0.5 ? "male" : "female") });
  }
  if (!wanted.size) return;
  let got = 0;
  for (const [dest, { gender }] of wanted) {
    try {
      const res = await fetch(`https://randomuser.me/api/?inc=picture&gender=${gender}&noinfo`, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { results?: { picture?: { large?: string } }[] };
      const src = data.results?.[0]?.picture?.large;
      if (!src) continue;
      const img = await fetch(src);
      if (!img.ok) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await img.arrayBuffer()));
      got++;
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      // No network, or the service is down: the silhouettes stay and everything still works.
      console.warn("[assets] portrait:", (e as Error).message);
      return;
    }
  }
  if (got) console.log(`[assets] fetched ${got} portrait(s)`);
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
