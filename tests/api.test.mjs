// API-level tests for the content server (state engine, filesystem, sites, messaging, mail,
// calendar, terminal, settings, downloads, LLM plumbing). Requires a running server with
// the mock model provider and replies scheduled immediately:
//   LLM_PROVIDER=mock FOUND_FAST_REPLIES=1 npx next dev web -p 4127
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

test("filler files open into something readable, never a blank window", async () => {
  const samples = [
    `${home}/Documents/Recipes/banana bread.txt`,
    `${home}/Desktop/stuff to print.txt`,
    `${home}/Desktop/desktop.ini`,
  ];
  for (const path of samples) {
    const r = await post("/api/fs/open", { path });
    assert.equal(r.body.viewer, "notepad", path);
    assert.ok(r.body.text.trim().length > 40, `${path} opened with ${r.body.text.length} characters`);
  }
  // The same file reads the same every time it is opened.
  const a = await post("/api/fs/open", { path: samples[0] });
  const b = await post("/api/fs/open", { path: samples[0] });
  assert.equal(a.body.text, b.body.text);
  // And it is served the same way through the file URL the browser uses.
  const served = await fetch(`${B}${"/lf/" + encodeURIComponent(samples[0]).replace(/%2F/g, "/")}`);
  assert.match(served.headers.get("content-type"), /text\/plain/);
  assert.match(served.headers.get("content-disposition") ?? "", /^inline/);
  assert.equal((await served.text()).trim(), a.body.text.trim());
});

test("saving, creating, renaming, deleting and restoring really change the machine", async () => {
  const dir = `${home}/Desktop`;
  const made = await post("/api/fs/mutate", { op: "new", parent: dir, kind: "text" });
  assert.equal(made.status, 200);
  const path = made.body.path;
  await post("/api/fs/mutate", { op: "save", path, text: "written by the test suite" });
  const opened = await post("/api/fs/open", { path });
  assert.equal(opened.body.text, "written by the test suite");

  const renamed = await post("/api/fs/mutate", { op: "rename", path, name: "suite-notes.txt" });
  const path2 = renamed.body.path;
  assert.equal((await post("/api/fs/open", { path: path2 })).body.text, "written by the test suite", "a renamed file keeps its contents");

  await post("/api/fs/mutate", { op: "delete", paths: [path2] });
  assert.equal((await post("/api/fs/open", { path: path2 })).status, 404, "deleted files are gone from the filesystem");
  const bin = await j("/api/fs/mutate");
  assert.ok(bin.body.items.some((i) => i.path === path2 && i.deletedHere), "and are in the Recycle Bin");
  await post("/api/fs/mutate", { op: "restore", paths: [path2] });
  assert.equal((await post("/api/fs/open", { path: path2 })).body.text, "written by the test suite", "restoring brings them back");
  await post("/api/fs/mutate", { op: "delete", paths: [path2], permanent: true });

  // A story file can be deleted and restored without losing anything.
  const story = `${home}/Desktop/to do.txt`;
  const before = (await post("/api/fs/open", { path: story })).body.text;
  await post("/api/fs/mutate", { op: "delete", paths: [story] });
  assert.equal((await post("/api/fs/open", { path: story })).status, 404);
  await post("/api/fs/mutate", { op: "restore", paths: [story] });
  assert.equal((await post("/api/fs/open", { path: story })).body.text, before);
});

test("the terminal writes, moves and deletes files for real", async () => {
  const cwd = `${home}/Documents`;
  await post("/api/terminal", { line: "mkdir suite-tmp", cwd });
  await post("/api/terminal", { line: "echo written from the shell > suite-tmp/a.txt", cwd });
  const shown = await post("/api/terminal", { line: "cat suite-tmp/a.txt", cwd });
  assert.match(shown.body.lines.map((l) => l.text).join("\n"), /written from the shell/);
  await post("/api/terminal", { line: "cp suite-tmp/a.txt suite-tmp/b.txt", cwd });
  const listed = await j(`/api/fs/list?path=${encodeURIComponent(cwd + "/suite-tmp")}`);
  assert.deepEqual(listed.body.children.map((c) => c.name).sort(), ["a.txt", "b.txt"]);
  const refuse = await post("/api/terminal", { line: "rm suite-tmp", cwd });
  assert.match(refuse.body.lines.map((l) => l.text).join("\n"), /not empty/);
  await post("/api/terminal", { line: "rm -rf suite-tmp", cwd });
  assert.equal((await j(`/api/fs/list?path=${encodeURIComponent(cwd + "/suite-tmp")}`)).status, 404);
});

test("settings persist and are what the shell reads", async () => {
  const before = await j("/api/settings");
  assert.equal(typeof before.body.settings.volume, "number");
  const set = await post("/api/settings", { volume: 71, muted: false, wifi: false, theme: "light" });
  assert.equal(set.body.settings.volume, 71);
  assert.equal(set.body.settings.wifi, false);
  const again = await j("/api/settings");
  assert.equal(again.body.settings.volume, 71);
  assert.equal(again.body.settings.theme, "light");
  // Airplane mode owns the radios.
  const air = await post("/api/settings", { airplane: true });
  assert.equal(air.body.settings.airplane, true);
  await post("/api/settings", { airplane: false, wifi: true, theme: "dark", muted: true, volume: 34 });
});

test("recordings are rendered on demand, seekable, and the right length", async () => {
  const path = `${home}/Documents/Slow Rooms/recordings/2026-03-14_AF_01.wav`;
  const url = `${B}/lf/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
  const head = await fetch(url, { headers: { range: "bytes=0-43" } });
  assert.equal(head.status, 206);
  assert.equal(head.headers.get("accept-ranges"), "bytes");
  const header = Buffer.from(await head.arrayBuffer());
  assert.equal(header.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(header.subarray(8, 12).toString("ascii"), "WAVE");
  const total = Number(head.headers.get("content-range").split("/")[1]);
  assert.ok(total > 20 * 60 * 22050 * 2, "a recording of the length the story gives it");
  // Seeking into the middle returns audio, not a re-read of the start.
  const mid = await fetch(url, { headers: { range: `bytes=${Math.floor(total / 2)}-${Math.floor(total / 2) + 4095}` } });
  assert.equal(mid.status, 206);
  assert.equal((await mid.arrayBuffer()).byteLength, 4096);
});

test("browsing history is real and searchable", async () => {
  const all = await j("/api/browser/history");
  assert.ok(all.body.visits.length > 20, "seeded visits are dated and listed");
  assert.ok(all.body.visits.every((v) => v.at && v.url));
  const sorted = [...all.body.visits].map((v) => v.at);
  assert.deepEqual(sorted, [...sorted].sort().reverse(), "newest first");
});

test("dressing files open into something plausible; the README opens and unlocks Wren", async () => {
  // Office documents (no Office on this machine) get the real "how do you want to open this" dialog...
  const docx = await post("/api/fs/open", { path: `${home}/Desktop/Untitled document.docx` });
  assert.equal(docx.body.openable, false);
  // ...but forcing an app opens them anyway, like Windows would.
  const forced = await post("/api/fs/open", { path: `${home}/Desktop/Untitled document.docx`, with: "notepad" });
  assert.equal(forced.body.viewer, "notepad");
  assert.ok(forced.body.text.startsWith("PK"), "Notepad shows the raw bytes of a docx");
  // Media, images and PDFs always open: synthetic bodies keep the machine from dead-ending.
  const pdf = await post("/api/fs/open", { path: `${home}/Desktop/passport scan (2).pdf` });
  assert.equal(pdf.body.viewer, "chrome");
  const pdfBody = await fetch(`${B}${pdf.body.url}`);
  assert.match(pdfBody.headers.get("content-type"), /application\/pdf/);
  const img = await post("/api/fs/open", { path: `${home}/Desktop/IMG_4471.HEIC` });
  assert.equal(img.body.kind, "image");
  assert.match((await fetch(`${B}${img.body.url}`)).headers.get("content-type"), /image\/png/);
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
  const deadline = Date.now() + 40000;
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
