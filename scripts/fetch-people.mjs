// Puts a face on every person in the cast, at the paths the asset manifest already points
// to. Tries OpenAI image generation first (a face that belongs to nobody), then the free
// portrait services randomuser.me and pravatar.cc.
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
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gpt-image-1";
const IMAGE_QUALITY = process.env.IMAGE_QUALITY || "medium";
let imageAllowanceSpent = false;

/** A stable number from a string, so the same person always asks for the same kind of face. */
function seedOf(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const at = (xs, seed, shift = 0) => xs[(seed >>> shift) % xs.length];

// A rendered face reads as a render. These ask for the things a real frame has instead:
// a named body and lens, focus landing slightly off, a hand smeared by too slow a shutter,
// noise in the shadows, a colour cast nothing corrected for, framing that was not composed.
const BODIES = [
  "a Canon EOS 400D with the 18-55mm kit lens at 35mm, f/5.6, ISO 800",
  "an iPhone 11 rear camera, f/1.8, ISO 500, HDR off",
  "a Nikon D3100 with a 50mm f/1.8 wide open, ISO 1600",
  "a Pixel 4a in poor light, f/1.7, ISO 1200, one-handed",
  "a Sony NEX-5 with the 16mm pancake, f/2.8, ISO 640",
  "a 2013 Samsung compact at full zoom, f/5.9, ISO 400",
];
const FAULTS = [
  "focus landing a little behind the subject, motion blur in one hand from too slow a shutter",
  "slight camera shake, the horizon about a degree out of level, one corner softer than the rest",
  "visible sensor noise in the shadows, faint purple fringing on the brightest edge",
  "mild barrel distortion, a smear of lens flare from a light just outside the frame",
  "a greasy fingerprint haze across one side of the lens, shadows crushed to near black",
  "slight overexposure where a window blows out, the rest of the frame a stop under",
];
const CASTS = [
  "a green colour cast off the walls", "a warm tungsten cast nothing corrected for",
  "a cold blue cast from overcast daylight", "mixed lighting the white balance could not settle on",
];
const REALISM =
  "This is an ordinary unedited JPEG straight off the card - no retouching, no colour grading, "
  + "no studio lighting, no stylisation, nothing tidied. Keep every flaw described above. "
  + "No text, no watermark, no border, no logo, no frame.";

function portraitPrompt(gender, seed) {
  const ages = ["in their twenties", "in their thirties", "in their forties", "in their fifties", "in their sixties", "in their seventies"];
  const where = [
    "indoors by a north-facing window on an overcast afternoon",
    "under a kitchen ceiling light at night",
    "outdoors on a grey day with the wind moving their hair",
    "in a hallway lit by one lamp further down it",
    "in a car in a car park, daylight through the windscreen",
  ];
  const doing = [
    "half-way through saying something, mouth open, eyes not on the lens",
    "caught just before they were ready, a flat unposed expression",
    "glancing sideways at whoever is holding the camera",
    "mid-blink, one shoulder turned away",
  ];
  const who = gender === "female" ? "a woman" : "a man";
  return `A candid snapshot of ${who} ${at(ages, seed)}, taken by a friend or family member, ${at(where, seed, 7)}. `
    + `${at(doing, seed, 13)}. Everyday worn clothes, no styling, no makeup for camera. `
    + "Cluttered domestic background thrown out of focus behind them. Head and shoulders. One person only. "
    + `Shot on ${at(BODIES, seed)}. ${at(FAULTS, seed, 5)}, ${at(CASTS, seed, 11)}. `
    + "Framing is casual and slightly off-centre, not composed. " + REALISM;
}

/** A face that belongs to nobody, drawn on request. Needs OPENAI_API_KEY. */
async function generatedPortrait(gender, seed) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || imageAllowanceSpent) return null;
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: IMAGE_MODEL, prompt: portraitPrompt(gender, seed), size: "1024x1024", quality: IMAGE_QUALITY, n: 1,
      // These are written to people/*.jpg, so ask for JPEG rather than PNG under a .jpg name.
      output_format: "jpeg", output_compression: 88,
    }),
  });
  if (res.status === 429 || res.status === 403) { imageAllowanceSpent = true; return null; }
  if (!res.ok) throw new Error(`OpenAI images HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
  const data = await res.json();
  const first = data?.data?.[0];
  if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
  if (first?.url) { const img = await fetch(first.url); if (img.ok) return Buffer.from(await img.arrayBuffer()); }
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
