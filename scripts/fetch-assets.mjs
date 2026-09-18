// Downloads stock imagery for manifest entries that carry a `pexels` query and whose
// file is missing. Uses the Pexels API (free): set PEXELS_API_KEY in .env or the environment.
// Takes the first result for each query on purpose. Writes content/assets/attribution.json.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const key = process.env.PEXELS_API_KEY;
if (!key) { console.error("PEXELS_API_KEY is not set (put it in .env). Nothing fetched."); process.exit(1); }

const manifest = JSON.parse(fs.readFileSync(path.join(root, "content/assets.json"), "utf8"));
const assetsDir = path.join(root, "content/assets");
const attributionPath = path.join(assetsDir, "attribution.json");
const attribution = fs.existsSync(attributionPath) ? JSON.parse(fs.readFileSync(attributionPath, "utf8")) : {};
const force = process.argv.includes("--force");

for (const [name, a] of Object.entries(manifest.assets)) {
  if (!a.pexels || !a.file) continue;
  const dest = path.join(assetsDir, a.file);
  if (fs.existsSync(dest) && !force) { console.log(`skip ${name} (exists)`); continue; }
  const { query, orientation = "landscape", size = "large2x" } = a.pexels;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=1`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) { console.error(`${name}: Pexels HTTP ${res.status}`); continue; }
  const data = await res.json();
  const photo = data.photos?.[0];
  if (!photo) { console.error(`${name}: no results for "${query}"`); continue; }
  const src = photo.src[size] ?? photo.src.large2x ?? photo.src.original;
  const img = await fetch(src);
  if (!img.ok) { console.error(`${name}: download HTTP ${img.status}`); continue; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await img.arrayBuffer()));
  attribution[name] = { photographer: photo.photographer, photographer_url: photo.photographer_url, pexels_url: photo.url, query };
  console.log(`fetched ${name} <- ${photo.url}`);
}
fs.writeFileSync(attributionPath, JSON.stringify(attribution, null, 2));
console.log("done");
