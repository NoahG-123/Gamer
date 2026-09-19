/**
 * First-run imagery.
 *
 * Two things happen here, both in the background, neither blocking a request:
 *  - the faces of the people on this machine are drawn or fetched, one per person, into
 *    the paths the manifest already points at, so the cast is there without anyone having
 *    to run a script. Which face a person gets falls out of a hash of the file it lands
 *    in; nothing chooses a face for anyone.
 *  - stock imagery for any manifest entry with a `pexels` query, when PEXELS_API_KEY is set.
 */
import fs from "node:fs";
import path from "node:path";
import { loadContent, contentPath } from "./content";
import { assetsWritableRoot, locateAsset } from "./assets";
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

/**
 * A face for every `person` slot whose file is missing.
 *
 * Three sources are tried in turn, per person, and whichever answers first wins:
 *  1. Gemini image generation, when GEMINI_API_KEY is set and the key has image
 *     allowance. The face is invented, so it belongs to nobody.
 *  2. randomuser.me, then pravatar.cc — free portrait services, no key needed.
 *
 * The look of a face comes from a hash of the file it is being written to, so a person
 * keeps the same face across reinstalls, and nothing here chooses a face for anyone.
 * If every source is unreachable the silhouettes stay and the machine works as before.
 */
async function fetchPeople(): Promise<void> {
  const { assets } = loadContent<ManifestFile>("assets.json");
  // Written to the data folder: a packaged app's own folder may not be writable.
  const root = assetsWritableRoot();
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
    if (a.placeholder === "group") continue; // a group chat wears an icon, not a face
    const dest = path.join(root, a.file);
    if (locateAsset(a.file) || wanted.has(dest)) continue;
    wanted.set(dest, { gender: GENDER[name] ?? (Math.random() < 0.5 ? "male" : "female") });
  }
  if (!wanted.size) return;
  let got = 0, misses = 0;
  for (const [dest, { gender }] of wanted) {
    const bytes = await portrait(gender, dest);
    if (!bytes) {
      // Two people in a row with nothing from any source means there is no route out;
      // stop rather than spend a minute of start-up on it.
      if (++misses >= 2) break;
      continue;
    }
    misses = 0;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bytes);
    got++;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (got) console.log(`[assets] fetched ${got} portrait(s)`);
}

/** A stable number from a string, so the same slot always asks for the same kind of face. */
function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

async function portrait(gender: "male" | "female", dest: string): Promise<Buffer | null> {
  const seed = seedOf(dest);
  for (const source of [generatedPortrait, randomUserPortrait, pravatarPortrait]) {
    try {
      const b = await source(gender, seed);
      if (b && b.length > 2048) return b;
    } catch (e) {
      // Out of allowance, offline, or the service is having a day: try the next one.
      console.warn("[assets] portrait:", (e as Error).message);
    }
  }
  return null;
}

const IMAGE_MODELS = (process.env.IMAGE_MODELS || "gemini-3.1-flash-image,gemini-2.5-flash-image,gemini-3-pro-image").split(",").map((m) => m.trim()).filter(Boolean);
const spentImageModels = new Set<string>();

/** A face that belongs to nobody, drawn on request. Needs a key with image allowance. */
async function generatedPortrait(gender: "male" | "female", seed: number): Promise<Buffer | null> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;
  const ages = ["in their twenties", "in their thirties", "in their forties", "in their fifties", "in their sixties", "in their seventies"];
  const light = ["by a window on an overcast day", "under warm indoor light", "outdoors in flat daylight", "in a lamplit room at night"];
  const who = gender === "female" ? "a woman" : "a man";
  const prompt = `A plain head-and-shoulders photograph of ${who} ${ages[seed % ages.length]}, taken ${light[(seed >> 3) % light.length]} on an ordinary phone camera. `
    + "Everyday clothes, relaxed expression, uncluttered background, slightly soft focus, as if cropped from a family photo. "
    + "Photographic, not illustrated. No text, no watermark, no border, one person only.";
  for (const model of IMAGE_MODELS) {
    if (spentImageModels.has(model)) continue;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"] } }),
    });
    if (res.status === 429 || res.status === 403) { spentImageModels.add(model); continue; }
    if (!res.ok) continue;
    const data = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };
    const b64 = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (b64) return Buffer.from(b64, "base64");
  }
  return null;
}

async function randomUserPortrait(gender: "male" | "female"): Promise<Buffer | null> {
  const res = await fetch(`https://randomuser.me/api/?inc=picture&gender=${gender}&noinfo`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`randomuser.me HTTP ${res.status}`);
  const data = (await res.json()) as { results?: { picture?: { large?: string } }[] };
  const src = data.results?.[0]?.picture?.large;
  if (!src) return null;
  const img = await fetch(src);
  if (!img.ok) throw new Error(`randomuser.me portrait HTTP ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

async function pravatarPortrait(_gender: "male" | "female", seed: number): Promise<Buffer | null> {
  const img = await fetch(`https://i.pravatar.cc/512?u=${seed}`);
  if (!img.ok) throw new Error(`pravatar HTTP ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
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
