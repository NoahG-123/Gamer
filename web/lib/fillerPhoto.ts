/**
 * Real footage for the junk image files scattered through the machine (Downloads, Pictures,
 * phone backup, and the like) that carry no story significance. content/filler-photos.json
 * pools real Pixabay photos by folder (a small set fetched once, see lib/fetchAssets.ts); a
 * junk image file picks one deterministically from a hash of its own path, the same way
 * lib/synth.ts picks a filler scene, except a handful of files whose own name already says
 * what they are (a saved "cat.jpg") are pinned to an exact photo instead. Until the pool is
 * fetched (no PIXABAY_API_KEY set), callers should fall back to the procedural render.
 */
import { loadContent } from "./content";
import { locateAsset } from "./assets";

interface Category { folders: string[]; photos: { id: string; query: string; index?: number }[] }
interface FillerPhotoFile { categories: Record<string, Category>; overrides: { path: string; target: string }[] }

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function assetFor(category: string, id: string): string | null {
  return locateAsset(`generated/filler-photo/${category}-${id}.jpg`);
}

/** Every (category, id) pair the manifest names, for the fetcher to walk. */
export function allFillerPhotos(): { category: string; id: string; query: string; index: number }[] {
  const { categories } = loadContent<FillerPhotoFile>("filler-photos.json");
  const out: { category: string; id: string; query: string; index: number }[] = [];
  for (const [category, c] of Object.entries(categories)) for (const p of c.photos) out.push({ category, id: p.id, query: p.query, index: p.index ?? 0 });
  return out;
}

/** The absolute path of the photo a given file picks, or null if none has been fetched yet. */
export function pickFillerPhoto(nodePath: string, seed: string): string | null {
  const { categories, overrides } = loadContent<FillerPhotoFile>("filler-photos.json");
  const override = overrides.find((o) => o.path === nodePath);
  if (override) {
    const [category, id] = override.target.split(":");
    const full = assetFor(category, id);
    if (full) return full;
  }
  // Longest matching folder prefix wins, so a more specific folder beats a shared parent.
  let category = "life";
  let bestLen = -1;
  for (const [name, c] of Object.entries(categories)) {
    for (const folder of c.folders) {
      if (nodePath.startsWith(folder) && folder.length > bestLen) { category = name; bestLen = folder.length; }
    }
  }
  const pool = categories[category]?.photos ?? [];
  if (!pool.length) return null;
  const start = seedOf(seed) % pool.length;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[(start + i) % pool.length];
    const full = assetFor(category, p.id);
    if (full) return full;
  }
  return null;
}
