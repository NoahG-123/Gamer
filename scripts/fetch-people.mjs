// Fetches profile photos for the cast from randomuser.me (free, no API key) and drops
// them at the paths the asset manifest already points to. One request per person.
//
//   npm run fetch:people          # fills in anything missing
//   npm run fetch:people -- --force   # re-rolls every face
//
// The face each character gets is whatever the API returns, so the casting is random
// per install. Nothing here picks a face for a character on purpose.
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

async function fetchPortrait(gender, attempt = 0) {
  const url = `https://randomuser.me/api/?inc=picture&gender=${gender}&noinfo`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`randomuser.me HTTP ${res.status}`);
    const data = await res.json();
    const src = data?.results?.[0]?.picture?.large;
    if (!src) throw new Error("no picture in response");
    const img = await fetch(src);
    if (!img.ok) throw new Error(`portrait HTTP ${img.status}`);
    return Buffer.from(await img.arrayBuffer());
  } catch (e) {
    if (attempt < 3) { await sleep(600 * (attempt + 1)); return fetchPortrait(gender, attempt + 1); }
    throw e;
  }
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
    fs.writeFileSync(dest, await fetchPortrait(slot.gender));
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
