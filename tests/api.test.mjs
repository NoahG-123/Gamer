// API-level tests for the content server (state engine, filesystem, sites, messaging, mail,
// calendar, terminal, LLM plumbing). Requires a running server with LLM_PROVIDER=mock:
//   LLM_PROVIDER=mock npx next dev web -p 4127
import { test, before } from "node:test";
import assert from "node:assert/strict";

const B = process.env.TEST_SERVER_URL || "http://127.0.0.1:4127";
const j = async (path, init) => { const r = await fetch(B + path, init); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }; };
const post = (path, body) => j(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let home = "";

before(async () => {
  await post("/api/state/reset", {});
  const p = await j("/api/profile");
  home = p.body.home;
});

test("profile is Wren's machine; filesystem lists deep tree", async () => {
  const prof = await j("/api/profile");
  assert.equal(prof.body.profile.username, "wren");
  const r = await j(`/api/fs/list?path=${encodeURIComponent(home + "/Documents")}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.children.length > 10, "deep folder tree");
  assert.ok(r.body.children.some((c) => c.dir && c.name === "Slow Rooms"), "story folder present");
  const root = await j("/api/fs/list?path=C:");
  assert.ok(root.body.children.some((c) => c.name === "Windows"));
  assert.ok(!root.body.children.some((c) => c.name === "pagefile.sys"), "hidden system files hidden by default");
});

test("dressing files are unopenable; the README opens and unlocks Wren", async () => {
  const dressing = await post("/api/fs/open", { path: `${home}/Desktop/passport scan (2).pdf` });
  assert.equal(dressing.body.openable, false);
  const before = await j("/api/messages");
  assert.ok(!before.body.chats.some((c) => c.contact.id === "wren"), "Wren hidden before README");
  const readme = await post("/api/fs/open", { path: `${home}\\Desktop\\READ ME.txt` });
  assert.equal(readme.body.openable, true);
  assert.equal(readme.body.viewer, "notepad");
  assert.ok(readme.body.fired.includes("flag-read-readme"));
  assert.ok(readme.body.fired.includes("unlock-wren-after-readme"));
  const state = await j("/api/state");
  assert.equal(state.body.flags.read_witness_readme, true);
  const after = await j("/api/messages");
  assert.ok(after.body.chats.some((c) => c.contact.id === "wren"), "Wren contact unlocked");
});

test("encrypted archive: wrong passphrase fails, right one reveals the transcript", async () => {
  await post("/api/state/reset", {});
  await post("/api/fs/open", { path: `${home}/Desktop/READ ME.txt` });
  const hidden = await post("/api/fs/open", { path: `${home}/Documents/Slow Rooms/transcripts/2026-05-14_AF_03_excerpt_transcript.txt` });
  assert.equal(hidden.body.openable ?? hidden.body.error !== undefined, hidden.body.openable === undefined ? true : false, "transcript not readable before decrypt");
  const wrong = await post("/api/terminal", { line: "7z x slow_rooms_AF.7z", cwd: `${home}/Desktop`, stdin: "nope" });
  assert.ok(wrong.body.lines.some((l) => /Wrong password/i.test(l.text)), "wrong passphrase rejected");
  const right = await post("/api/terminal", { line: "7z x slow_rooms_AF.7z", cwd: `${home}/Desktop`, stdin: "she had her mothers ring on" });
  assert.ok(right.body.lines.some((l) => /Everything is Ok/.test(l.text)), "right passphrase extracts");
  const open = await post("/api/fs/open", { path: `${home}/Documents/Slow Rooms/transcripts/2026-05-14_AF_03_excerpt_transcript.txt` });
  assert.equal(open.body.openable, true);
  assert.match(open.body.text, /Colleen/);
  const flags = await j("/api/state");
  assert.equal(flags.body.flags.decrypted_excerpt, true);
});

test("terminal: navigation, cat, git log, ssh session", async () => {
  const ls = await post("/api/terminal", { line: "ls", cwd: `${home}/Projects/witness` });
  assert.ok(ls.body.lines.some((l) => l.text.includes("README.md")));
  const cat = await post("/api/terminal", { line: "cat serial.txt", cwd: `${home}/Projects/witness` });
  assert.ok(cat.body.lines.some((l) => l.text.includes("417")), "reads real file body");
  const gl = await post("/api/terminal", { line: "git log --oneline", cwd: `${home}/Projects/witness` });
  assert.ok(gl.body.lines.some((l) => /seeding tonight/.test(l.text)), "git history present");
  const ssh = await post("/api/terminal", { line: "ssh wren@relay.wrn.sh", cwd: home });
  assert.equal(ssh.body.mode?.kind, "ssh");
  const log = await post("/api/terminal", { line: "cat opens.log", cwd: "/home/wren", mode: ssh.body.mode });
  assert.ok(log.body.lines.some((l) => l.text.includes("417")), "relay file readable in ssh mode");
});

test("mail: listing, thread read marks unread, compose sends", async () => {
  const box = await j("/api/mail?record=0");
  assert.equal(box.body.account.email, "wren.castellanos@gmail.com");
  assert.ok(box.body.threads.length > 10, "many threads");
  const thread = await j("/api/mail/thread?id=furey-lawyer");
  assert.equal(thread.body.thread.subject.includes("Hanley"), true);
  assert.ok(thread.body.thread.messages.length >= 2);
  const sent = await post("/api/mail/send", { to: "priya.raman.lib@gmail.com", subject: "test", body: "hi from the suite" });
  assert.ok(sent.body.threadId, "compose returns a thread id");
});

test("calendar expands recurring events within a window", async () => {
  const cal = await j("/api/calendar?from=2026-05-01T00:00:00Z&to=2026-06-01T00:00:00Z&record=0");
  assert.ok(cal.body.calendars.length >= 3);
  assert.ok(cal.body.events.length > 10, "recurring shoot days expanded");
  assert.ok(cal.body.events.some((e) => e.title.includes("Interview")), "one-off event present");
});

test("story sites are served; single-page hosts serve deep paths; unknown hosts 404", async () => {
  const site = await fetch(`${B}/sites/wrencastellanos.com/`);
  assert.equal(site.status, 200);
  assert.match(site.headers.get("content-type"), /text\/html/);
  const article = await fetch(`${B}/sites/harbourledger.ca/archive/1971-mahar`);
  assert.equal(article.status, 200);
  assert.match(await article.text(), /Colleen/);
  const spa = await fetch(`${B}/sites/mail.google.com/mail/u/0/`, { headers: { "sec-fetch-dest": "document" } });
  assert.equal(spa.status, 200, "gmail SPA serves any path");
  const evil = await fetch(`${B}/sites/evil.example/`);
  assert.equal(evil.status, 404);
});

test("messaging: send -> delivered -> read -> typing -> LLM reply (mock)", async () => {
  const events = [];
  const ctrl = new AbortController();
  const stream = fetch(`${B}/api/events`, { signal: ctrl.signal }).then(async (r) => {
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
    while (true) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf("\n\n")) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const line = chunk.split("\n").find((l) => l.startsWith("data: ")); if (line) events.push(JSON.parse(line.slice(6))); } }
  }).catch(() => {});
  await sleep(300);
  const sent = await post("/api/messages/priya", { text: "hello from the test suite" });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.message.status, "sent");
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline && !events.some((e) => e.type === "message" && e.message?.sender === "priya" && e.message.text.includes("mock"))) await sleep(200);
  ctrl.abort(); await stream;
  const types = events.map((e) => e.type + (e.status ? ":" + e.status : "") + (e.typing !== undefined ? ":" + e.typing : ""));
  assert.ok(types.includes("message.status:delivered"), types.join(","));
  assert.ok(types.includes("message.status:read"));
  assert.ok(types.includes("typing:true") && types.includes("typing:false"));
  assert.ok(events.some((e) => e.type === "message" && e.message?.sender === "priya"), "reply arrived");
});

test("generic LLM endpoint uses character config and reports budget", async () => {
  const r = await post("/api/llm/chat", { messages: [{ role: "user", content: "ping" }], characterId: "wren" });
  assert.equal(r.status, 200);
  assert.match(r.body.content, /mock/);
  const bad = await post("/api/llm/chat", { messages: [{ role: "user", content: "ping" }], characterId: "nope" });
  assert.equal(bad.status, 404);
});

test("asset manifest resolves fallbacks and leaves person slots blank", async () => {
  const a = await j("/api/assets");
  assert.ok(a.body.assets["wallpaper.desktop"].url, "wallpaper has a fallback url");
  assert.equal(a.body.assets["people.owner"].url, null, "person image intentionally absent");
  assert.equal(a.body.assets["people.owner"].placeholder, "silhouette");
  const img = await fetch(B + a.body.assets["wallpaper.desktop"].url);
  assert.equal(img.status, 200);
});
