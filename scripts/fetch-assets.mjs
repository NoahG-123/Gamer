// Downloads stock imagery for manifest entries that carry a `pexels` query and whose
// file is missing, plus a small pool of filler video clips (content/filler-videos.json).
// Pixabay (PIXABAY_API_KEY / PIXABAY_API_KEY_VIDEOS) is tried first for both; Pexels
// (PEXELS_API_KEY) is only a fallback for stills, kept for installs that only have that key.
// Writes content/assets/attribution.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const pixabayKey = process.env.PIXABAY_API_KEY;
const pixabayVideoKey = process.env.PIXABAY_API_KEY_VIDEOS || pixabayKey;
const pexelsKey = process.env.PEXELS_API_KEY;
const force = process.argv.includes("--force");
if (!pixabayKey && !pexelsKey) { console.error("Neither PIXABAY_API_KEY nor PEXELS_API_KEY is set (put one in .env). Nothing fetched."); process.exit(1); }

const assetsDir = path.join(root, "content/assets");
const attributionPath = path.join(assetsDir, "attribution.json");
const attribution = fs.existsSync(attributionPath) ? JSON.parse(fs.readFileSync(attributionPath, "utf8")) : {};

/** One still photo matching `query`, from Pixabay if a key is set, else Pexels. */
async function fetchPhoto(query, { orientation = "landscape", index = 0 } = {}) {
  if (pixabayKey) {
    const perPage = Math.max(3, index + 1);
    const url = `https://pixabay.com/api/?key=${pixabayKey}&q=${encodeURIComponent(query)}&image_type=photo&orientation=${orientation === "landscape" ? "horizontal" : "vertical"}&safesearch=true&per_page=${perPage}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`);
    const data = await res.json();
    const hit = data.hits?.[Math.min(index, (data.hits?.length ?? 1) - 1)];
    if (!hit) throw new Error(`no Pixabay results for "${query}"`);
    const img = await fetch(hit.largeImageURL);
    if (!img.ok) throw new Error(`Pixabay download HTTP ${img.status}`);
    return { bytes: Buffer.from(await img.arrayBuffer()), credit: { photographer: hit.user, photographer_url: `https://pixabay.com/users/${hit.user}-${hit.user_id}/`, source_url: hit.pageURL, source: "Pixabay", query } };
  }
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=${Math.max(1, index + 1)}`;
  const res = await fetch(url, { headers: { Authorization: pexelsKey } });
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
  const data = await res.json();
  const photo = data.photos?.[Math.min(index, (data.photos?.length ?? 1) - 1)];
  if (!photo) throw new Error(`no Pexels results for "${query}"`);
  const src = photo.src.large2x ?? photo.src.large ?? photo.src.original;
  const img = await fetch(src);
  if (!img.ok) throw new Error(`Pexels download HTTP ${img.status}`);
  return { bytes: Buffer.from(await img.arrayBuffer()), credit: { photographer: photo.photographer, photographer_url: photo.photographer_url, source_url: photo.url, source: "Pexels", query } };
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "content/assets.json"), "utf8"));
for (const [name, a] of Object.entries(manifest.assets)) {
  if (!a.pexels || !a.file) continue;
  const dest = path.join(assetsDir, a.file);
  if (fs.existsSync(dest) && !force) { console.log(`skip ${name} (exists)`); continue; }
  try {
    const { bytes, credit } = await fetchPhoto(a.pexels.query, a.pexels);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bytes);
    attribution[name] = credit;
    console.log(`fetched ${name} <- ${credit.source} ${credit.source_url}`);
  } catch (e) {
    console.error(`${name}: ${e.message}`);
  }
}

// ---------- filler photo pool ----------
if (pixabayKey || pexelsKey) {
  const { categories } = JSON.parse(fs.readFileSync(path.join(root, "content/filler-photos.json"), "utf8"));
  const photoDir = path.join(assetsDir, "generated/filler-photo");
  for (const [category, c] of Object.entries(categories)) {
    for (const p of c.photos) {
      const dest = path.join(photoDir, `${category}-${p.id}.jpg`);
      if (fs.existsSync(dest) && !force) { console.log(`skip photo ${category}-${p.id} (exists)`); continue; }
      try {
        const { bytes, credit } = await fetchPhoto(p.query, { index: p.index ?? 0 });
        fs.mkdirSync(photoDir, { recursive: true });
        fs.writeFileSync(dest, bytes);
        attribution[`filler-photo.${category}-${p.id}`] = credit;
        console.log(`fetched photo ${category}-${p.id} <- ${credit.source} ${credit.source_url}`);
      } catch (e) {
        console.error(`photo ${category}-${p.id}: ${e.message}`);
      }
    }
  }
}

// ---------- filler video pool ----------
if (pixabayVideoKey) {
  const poolFile = path.join(root, "content/filler-videos.json");
  const pool = JSON.parse(fs.readFileSync(poolFile, "utf8")).clips;
  const videoDir = path.join(assetsDir, "generated/filler-video");
  for (const clip of pool) {
    const dest = path.join(videoDir, `${clip.id}.mp4`);
    if (fs.existsSync(dest) && !force) { console.log(`skip video ${clip.id} (exists)`); continue; }
    try {
      const url = `https://pixabay.com/api/videos/?key=${pixabayVideoKey}&q=${encodeURIComponent(clip.query)}&safesearch=true&per_page=3`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Pixabay video HTTP ${res.status}`);
      const data = await res.json();
      const hit = data.hits?.[0];
      if (!hit) throw new Error(`no Pixabay video results for "${clip.query}"`);
      const v = hit.videos.medium ?? hit.videos.small ?? hit.videos.tiny;
      const vid = await fetch(v.url);
      if (!vid.ok) throw new Error(`Pixabay video download HTTP ${vid.status}`);
      fs.mkdirSync(videoDir, { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await vid.arrayBuffer()));
      attribution[`filler-video.${clip.id}`] = { photographer: hit.user, photographer_url: `https://pixabay.com/users/${hit.user}-${hit.user_id}/`, source_url: hit.pageURL, source: "Pixabay", query: clip.query };
      console.log(`fetched video ${clip.id} <- ${hit.pageURL}`);
    } catch (e) {
      console.error(`video ${clip.id}: ${e.message}`);
    }
  }
} else {
  console.log("PIXABAY_API_KEY_VIDEOS not set; filler videos stay as the silent placeholder.");
}

fs.writeFileSync(attributionPath, JSON.stringify(attribution, null, 2));
console.log("done");
