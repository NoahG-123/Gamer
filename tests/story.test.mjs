// Story integrity and playthrough.
//
// This suite exists to answer one question: can the machine ever put the player in front
// of something that looks like a puzzle but is actually a bug? It does that two ways.
//
//   1. A static pass over the content: every path, id and reference a trigger, a piece of
//      mail, a calendar entry or an encrypted archive points at must actually exist, and
//      every gate must be reachable from a gate that comes before it. A dangling reference
//      here is the exact failure the player would experience as "I must be missing
//      something" when in fact nothing is there.
//
//   2. A live pass through the server: walk the chain the way a player would — open the
//      thing that starts it, decrypt the archive, read what that opens — and assert each
//      step actually unlocks what it promises.
//
// Nothing in here prints story text; it asserts on ids and paths only, so a failure says
// what is broken without spoiling what it is.
//
// Requires a running server (the same one tests/api.test.mjs uses):
//   LLM_PROVIDER=mock FOUND_FAST_REPLIES=1 npx next dev web -p 4127
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const B = process.env.TEST_SERVER_URL || "http://127.0.0.1:4127";
const ROOT = path.resolve(process.env.CONTENT_DIR ?? "content");

const j = async (p, init) => { const r = await fetch(B + p, init); return { status: r.status, body: await r.json().catch(() => null) }; };
const post = (p, body) => j(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Everything the terminal printed, as one string. */
const termText = (r) => (r.body?.lines ?? []).map((l) => l.text ?? "").join("\n");

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const listJson = (rel) => {
  const dir = path.join(ROOT, rel);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(rel, f)) : [];
};

let home = "";
let user = "";

// ---------------------------------------------------------------- the content, loaded flat
const profile = readJson("profile.json");
const triggers = readJson("triggers.json").triggers;
const secrets = readJson("terminal/secrets.json").files;

function storyFiles() {
  const out = new Map();
  const add = (f) => out.set(sub(f.path), { ...f, path: sub(f.path) });
  for (const rel of ["filesystem/story.json", ...listJson("filesystem/story")]) {
    const d = readJson(rel);
    for (const f of d.files ?? []) add(f);
  }
  return out;
}
function dressingPaths() {
  const out = new Set();
  for (const rel of ["filesystem/dressing.json", "filesystem/story-dressing.json"]) {
    for (const e of readJson(rel).entries ?? []) out.add(sub(e.path));
  }
  return out;
}
function mailThreads() {
  const out = new Map();
  for (const rel of ["mail/mailbox.json", ...listJson("mail/threads")]) {
    for (const t of readJson(rel).threads ?? []) out.set(t.id, t);
  }
  return out;
}
function calendarEvents() {
  const out = new Map();
  for (const rel of ["calendar/events.json", ...listJson("calendar/extra")]) {
    for (const e of readJson(rel).events ?? []) out.set(e.id, e);
  }
  return out;
}
function contactIds() {
  const out = new Set();
  for (const rel of ["messaging/contacts.json", ...listJson("messaging")]) {
    let d;
    try { d = readJson(rel); } catch { continue; }
    // contacts.json is a list of contacts; history.json keys its chats by contact id.
    for (const c of d.contacts ?? []) out.add(c.id);
    if (d.chats && !Array.isArray(d.chats)) for (const id of Object.keys(d.chats)) out.add(id);
    else for (const c of d.chats ?? []) out.add(c.id);
  }
  return out;
}

const sub = (s) => String(s).replace(/\{user\}/g, profile.username);

/** Every condition in a trigger, flattened. */
function conditions(when, out = []) {
  if (!when || typeof when !== "object") return out;
  if (Array.isArray(when.any)) when.any.forEach((w) => conditions(w, out));
  else if (Array.isArray(when.all)) when.all.forEach((w) => conditions(w, out));
  else if (when.not) conditions(when.not, out);
  else out.push(when);
  return out;
}
/** Every effect in a trigger, flattened to {kind, value}. */
function effects(t) {
  const out = [];
  for (const e of t.then ?? []) for (const [kind, value] of Object.entries(e)) out.push({ kind, value });
  return out;
}

before(async () => {
  await post("/api/state/reset", {});
  const p = await j("/api/profile");
  home = p.body.home;
  user = p.body.profile.username;
});

// ================================================================ static integrity
test("every file a trigger waits on or reveals actually exists", () => {
  const files = storyFiles();
  const dressing = dressingPaths();
  const exists = (p) => files.has(p) || dressing.has(p);
  const missing = [];

  for (const t of triggers) {
    for (const c of conditions(t.when)) {
      if (c.event === "file.opened" && c.subject && !String(c.subject).includes("*")) {
        const p = sub(c.subject);
        if (!exists(p)) missing.push(`${t.id}: waits on a file that does not exist — ${p}`);
      }
    }
    for (const e of effects(t)) {
      if (e.kind !== "reveal") continue;
      const v = sub(typeof e.value === "string" ? e.value : e.value.path ?? "");
      if (/^[A-Za-z]:\//.test(v) && !exists(v)) missing.push(`${t.id}: reveals a file that does not exist — ${v}`);
    }
  }
  assert.deepEqual(missing, [], missing.join("\n"));
});

test("every mail, calendar entry and contact a trigger names exists", () => {
  const mail = mailThreads();
  const cal = calendarEvents();
  const contacts = contactIds();
  const bad = [];

  for (const t of triggers) {
    for (const e of effects(t)) {
      if (e.kind === "deliver_mail" && !mail.has(e.value.id)) bad.push(`${t.id}: delivers mail that does not exist — ${e.value.id}`);
      if (e.kind === "reveal_event" && !cal.has(e.value.id)) bad.push(`${t.id}: reveals a calendar event that does not exist — ${e.value.id}`);
      if (e.kind === "unlock_contact" && contacts.size && !contacts.has(e.value.id)) bad.push(`${t.id}: unlocks a contact that does not exist — ${e.value.id}`);
      if (e.kind === "deliver_message" && contacts.size && !contacts.has(e.value.chat)) bad.push(`${t.id}: messages a chat that does not exist — ${e.value.chat}`);
    }
    for (const c of conditions(t.when)) {
      if (c.event === "mail.read" && c.subject && !String(c.subject).includes("*") && !mail.has(c.subject)) {
        bad.push(`${t.id}: waits on mail that does not exist — ${c.subject}`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("no gate waits on a flag nothing ever sets", () => {
  const set = new Set();
  for (const t of triggers) for (const e of effects(t)) if (e.kind === "set_flag") set.add(e.value.key);
  // Flags the decryption engine sets on its own.
  for (const s of Object.values(secrets)) if (s.flag) set.add(s.flag);

  const orphans = [];
  for (const t of triggers) {
    for (const c of conditions(t.when)) {
      const key = c.flag ?? c.since?.flag;
      if (key && !set.has(key)) orphans.push(`${t.id}: waits on flag "${key}", which nothing sets`);
    }
  }
  assert.deepEqual(orphans, [], orphans.join("\n"));
});

test("every encrypted archive is solvable: the file is there, the outputs are real, and the answer hashes", () => {
  const files = storyFiles();
  const dressing = dressingPaths();
  const problems = [];
  assert.ok(Object.keys(secrets).length > 0, "there is something to decrypt");

  for (const [rawPath, s] of Object.entries(secrets)) {
    const p = sub(rawPath);
    if (!files.has(p) && !dressing.has(p)) problems.push(`${p}: the encrypted file itself is not on the machine`);
    assert.match(s.sha256 ?? "", /^[0-9a-f]{64}$/, `${p}: no passphrase hash`);
    assert.ok(s.flag, `${p}: decrypting it sets no flag, so nothing can depend on it`);
    for (const out of s.outputs ?? []) {
      const o = sub(out);
      if (!files.has(o)) problems.push(`${p}: unlocks "${o}", which does not exist`);
    }
    assert.ok((s.outputs ?? []).length > 0, `${p}: decrypting it produces nothing`);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

test("everything gated behind a flag has something that can set that flag", () => {
  const set = new Set();
  for (const t of triggers) for (const e of effects(t)) if (e.kind === "set_flag") set.add(e.value.key);
  for (const s of Object.values(secrets)) if (s.flag) set.add(s.flag);

  const files = storyFiles();
  const bad = [];
  for (const f of files.values()) {
    for (const req of f.requires ?? []) {
      const key = String(req).replace(/^!/, "").split(/[=<>]/)[0].trim();
      if (key && !set.has(key)) bad.push(`file "${f.path}" requires flag "${key}", which nothing sets`);
    }
  }
  for (const e of calendarEvents().values()) {
    for (const req of e.requires ?? []) {
      const key = String(req).replace(/^!/, "").split(/[=<>]/)[0].trim();
      if (key && !set.has(key)) bad.push(`calendar "${e.id}" requires flag "${key}", which nothing sets`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("the hint files that lead to an answer are readable before the answer is known", async () => {
  // Anything whose name marks it as a hint has to open with no flags set at all — a hint
  // locked behind the thing it hints at is the definition of unsolvable.
  const files = storyFiles();
  const hints = [...files.values()].filter((f) => /hint|read ?me/i.test(f.path));
  assert.ok(hints.length > 0, "there is at least one hint file");
  for (const h of hints) {
    assert.deepEqual(h.requires ?? [], [], `${h.path} is gated, but it is a hint`);
    assert.equal(h.hidden ?? false, false, `${h.path} is hidden, but it is a hint`);
    const r = await post("/api/fs/open", { path: sub(h.path) });
    assert.equal(r.body.openable, true, `${h.path} does not open`);
    const text = r.body.text ?? "";
    assert.ok(text.length > 40 || r.body.url, `${h.path} opens into nothing`);
  }
});

test("every site a hint points at is served, not a 404", async () => {
  const files = storyFiles();
  const hosts = (await j("/api/sites/hosts")).body.match;
  const referenced = new Set();
  for (const f of files.values()) {
    for (const m of String(f.body ?? "").matchAll(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)+\.(?:ca|com|net|org|sh))\b/gi)) {
      referenced.add(m[1].toLowerCase());
    }
  }
  const unreachable = [];
  for (const host of referenced) {
    if (!hosts.includes(host)) continue; // a real-internet domain is not ours to serve
    const r = await fetch(`${B}/sites/${host.replace(/^www\./, "")}/`);
    if (!r.ok) unreachable.push(`${host} -> HTTP ${r.status}`);
  }
  assert.deepEqual(unreachable, [], unreachable.join("\n"));
});

// ================================================================ live playthrough
test("playthrough: the opening move unlocks what it should", async () => {
  await post("/api/state/reset", {});

  const before = await j("/api/state/flags");
  assert.equal(before.body.flags.read_witness_readme ?? false, false, "nothing is unlocked yet");

  // The first thing a player does: open the file the desktop puts in front of them.
  const readme = await post("/api/fs/open", { path: `${home}/Desktop/READ ME.txt` });
  assert.equal(readme.body.openable, true, "the opening file opens");
  assert.ok((readme.body.text ?? "").length > 100, "and has something in it");

  const after = await j("/api/state/flags");
  assert.equal(after.body.flags.read_witness_readme, true, "which sets the flag the chain hangs off");

  // That flag is what puts the first person on the machine.
  await sleep(600);
  const chats = await j("/api/messages");
  assert.ok(chats.body.chats.length > 0, "there are chats");
});

test("playthrough: the archive rejects a wrong answer and accepts the right one", async () => {
  const desktop = `${home}/Desktop`;
  const archive = Object.keys(secrets).map(sub).find((p) => p.endsWith(".7z"));
  assert.ok(archive, "there is an archive to open");
  const name = archive.slice(archive.lastIndexOf("/") + 1);

  // Listing it is allowed without the password, so the player can see it is real.
  const listed = await post("/api/terminal", { line: `7z l ${name}`, cwd: desktop });
  assert.equal(listed.status, 200);

  const wrong = await post("/api/terminal", { line: `7z x ${name}`, cwd: desktop, stdin: "not the answer" });
  assert.match(termText(wrong), /wrong password|cannot open|error/i, "a wrong answer is refused");
  const stillLocked = await j("/api/state/flags");
  assert.notEqual(stillLocked.body.flags.decrypted_excerpt, true, "and unlocks nothing");

  // The answer the hint and the archive both lead to.
  const right = await post("/api/terminal", { line: `7z x ${name}`, cwd: desktop, stdin: "she had her mothers ring on" });
  assert.equal(right.status, 200);
  const flags = await j("/api/state/flags");
  assert.equal(flags.body.flags.decrypted_excerpt, true, "the right answer opens it");

  // And what it opens is actually there afterwards.
  const secret = Object.entries(secrets).find(([p]) => sub(p) === archive)[1];
  for (const out of secret.outputs) {
    const p = sub(out);
    const r = await post("/api/fs/open", { path: p });
    assert.equal(r.body.openable, true, `${p} should open after decryption`);
    const body = r.body.text ?? "";
    if (r.body.viewer === "notepad") assert.ok(body.length > 40, `${p} opens into an empty window`);
  }
});

test("playthrough: decrypting moves the story on rather than dead-ending", async () => {
  const flags = await j("/api/state/flags");
  assert.equal(flags.body.flags.decrypted_excerpt, true, "still decrypted from the step before");
  assert.equal(flags.body.flags.read_transcript, true, "which is what the next gate waits on");

  // Everything the decryption revealed is listed where the player would look for it.
  const secret = Object.values(secrets)[0];
  const dir = sub(secret.outputs[0]).replace(/\/[^/]+$/, "");
  const ls = await j(`/api/fs/list?path=${encodeURIComponent(dir)}`);
  assert.equal(ls.status, 200, `${dir} should be browsable`);
  const names = ls.body.children.map((c) => c.name);
  assert.ok(names.includes(sub(secret.outputs[0]).split("/").pop()), "the recording is in the folder");
});

test("playthrough: nothing on this machine opens into a blank window", async () => {
  // Walk a wide slice of the filesystem and assert every file resolves to something with
  // content in it. A blank viewer is what makes a player think they have missed a step.
  const seen = new Set();
  const blanks = [];
  const walk = async (dir, depth) => {
    if (depth > 3 || seen.size > 340) return;
    const r = await j(`/api/fs/list?path=${encodeURIComponent(dir)}`);
    if (r.status !== 200) return;
    for (const c of r.body.children) {
      if (c.dir) { await walk(c.path, depth + 1); continue; }
      if (seen.size > 340 || seen.has(c.path)) continue;
      seen.add(c.path);
      const o = await post("/api/fs/open", { path: c.path });
      if (!o.body.openable) continue;            // installers and archives are allowed a dialog
      if (o.body.viewer === "notepad") {
        if (!(o.body.text ?? "").trim()) blanks.push(`${c.path} (empty in Notepad)`);
        continue;
      }
      const res = await fetch(`${B}${o.body.url}`);
      if (!res.ok) { blanks.push(`${c.path} (HTTP ${res.status})`); continue; }
      const bytes = Number(res.headers.get("content-length") ?? 0) || (await res.arrayBuffer()).byteLength;
      if (bytes < 64) blanks.push(`${c.path} (${bytes} bytes)`);
    }
  };
  await walk(home, 0);
  assert.ok(seen.size > 80, `walked enough of the machine (${seen.size} files)`);
  assert.deepEqual(blanks, [], blanks.slice(0, 20).join("\n"));
});

test("playthrough: the terminal commands the hints tell you to type all work", async () => {
  const desktop = `${home}/Desktop`;
  const lines = [
    ["dir", desktop],
    ["ls", desktop],
    ["cd Documents", home],
    ["type \"READ ME.txt\"", desktop],
    ["cat \"READ ME.txt\"", desktop],
  ];
  for (const [line, cwd] of lines) {
    const r = await post("/api/terminal", { line, cwd });
    assert.equal(r.status, 200, `${line} failed`);
    assert.ok(!/is not recognized|unknown command|not recognised/i.test(termText(r)), `"${line}" is not a command this shell has`);
  }
});
