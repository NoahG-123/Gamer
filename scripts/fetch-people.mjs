// Puts a face on every person in the cast, at the paths the asset manifest already points
// to. Tries Gemini image generation first (a face that belongs to nobody, when the key has
// image allowance), then the free portrait services randomuser.me and pravatar.cc.
//
//   npm run fetch:people          # fills in anything missing
//   npm run fetch:people -- --force   # re-rolls every face
//
// What a face looks like falls out of a hash of the file it lands in, so a person keeps
// the same face across runs. Nothing here picks a face for a character on purpose.
//
// Note: randomuser.me serves photographs of real people under a prototyping licence.
// They are gitignored by default (see .gitignore) so this repo never redistributes
// them; they are still copied into packaged builds from your working tree.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const peopleDir = path.join(root, "content/assets/people");
const manifestPath = path.join(root, "content/assets.json");
const force = process.argv.includes("--force");

// asset-manifest key -> which person's photo it uses. Keys sharing a `person` share one
// image (the owner's account picture and her messaging avatar are the same human).
const SLOTS = [
  { key: "people.owner", person: "owner", gender: "female" },
  { key: "people.contact.wren", person: "owner", gender: "female" },
  { key: "people.contact.priya", person: "priya", gender: "female" },
  { key: "people.contact.mateo", person: "mateo", gender: "male" },
  { key: "people.contact.mama", person: "mama", gender: "female" },
  { key: "people.contact.jonah", person: "jonah", gender: "male" },
  { key: "people.contact.nadia", person: "nadia", gender: "female" },
  { key: "people.contact.colin", person: "colin", gender: "male" },
  { key: "people.contact.ilse", person: "ilse", gender: "female" },
  { key: "people.contact.liam", person: "liam", gender: "male" },
  { key: "people.contact.landlord", person: "landlord", gender: "male" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Three sources, tried in turn per person; whichever answers first wins. Kept in step with
// fetchPeople() in web/lib/fetchAssets.ts, which does the same thing on first run.
const IMAGE_MODELS = (process.env.IMAGE_MODELS || "gemini-3.1-flash-image,gemini-2.5-flash-image,gemini-3-pro-image")
  .split(",").map((m) => m.trim()).filter(Boolean);
const spentImageModels = new Set();

/** A stable number from a string, so the same person always asks for the same kind of face. */
function seedOf(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A face that belongs to nobody, drawn on request. Needs a key with image allowance. */
async function generatedPortrait(gender, seed) {
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
    const data = await res.json();
    const b64 = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (b64) return Buffer.from(b64, "base64");
  }
  return null;
}

async function randomUserPortrait(gender) {
  const res = await fetch(`https://randomuser.me/api/?inc=picture&gender=${gender}&noinfo`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`randomuser.me HTTP ${res.status}`);
  const data = await res.json();
  const src = data?.results?.[0]?.picture?.large;
  if (!src) return null;
  const img = await fetch(src);
  if (!img.ok) throw new Error(`randomuser.me portrait HTTP ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

async function pravatarPortrait(_gender, seed) {
  const img = await fetch(`https://i.pravatar.cc/512?u=${seed}`);
  if (!img.ok) throw new Error(`pravatar HTTP ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

async function fetchPortrait(gender, person) {
  const seed = seedOf(`people/${person}.jpg`);
  const reasons = [];
  for (const source of [generatedPortrait, randomUserPortrait, pravatarPortrait]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const b = await source(gender, seed);
        if (b && b.length > 2048) return b;
        break;
      } catch (e) {
        reasons.push(e.message);
        await sleep(600 * (attempt + 1));
      }
    }
  }
  throw new Error(reasons.join("; ") || "no source returned a portrait");
}

fs.mkdirSync(peopleDir, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const byPerson = new Map();
for (const s of SLOTS) if (!byPerson.has(s.person)) byPerson.set(s.person, s);

let fetched = 0, kept = 0, failed = 0;
for (const [person, slot] of byPerson) {
  const file = `people/${person}.jpg`;
  const dest = path.join(root, "content/assets", file);
  if (fs.existsSync(dest) && !force) { kept++; continue; }
  try {
    fs.writeFileSync(dest, await fetchPortrait(slot.gender, person));
    fetched++;
    await sleep(250); // be polite to a free API
  } catch (e) {
    console.error(`  ${person}: ${e.message}`);
    failed++;
  }
}

// Point every slot at its person's file. `kind: person` still renders a silhouette
// until the file is actually on disk, so a partial run degrades cleanly.
for (const s of SLOTS) {
  const entry = manifest.assets[s.key];
  if (!entry) { console.error(`  manifest has no key ${s.key}`); continue; }
  entry.kind = "person";
  entry.file = `people/${s.person}.jpg`;
  entry.placeholder = "silhouette";
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const present = new Set(SLOTS.filter((s) => fs.existsSync(path.join(root, "content/assets", `people/${s.person}.jpg`))).map((s) => s.key));
console.log(`people: ${fetched} fetched, ${kept} already present, ${failed} failed`);
console.log(`manifest: ${SLOTS.length} slots mapped, ${present.size} resolving to a file on disk`);
if (failed) process.exitCode = 1;
