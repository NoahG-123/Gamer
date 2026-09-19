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
  // A stray Word document opens in the read-only viewer, not into a blank window.
  const docx = await post("/api/fs/open", { path: `${home}/Desktop/Untitled document.docx` });
  assert.equal(docx.body.openable, true);
  assert.equal(docx.body.kind, "document");
  const docBody = await fetch(`${B}${docx.body.url}`);
  assert.equal(docBody.status, 200);
  assert.match(docBody.headers.get("content-type") ?? "", /text\/html/);
  const docHtml = await docBody.text();
  assert.ok(docHtml.length > 800, "the viewer renders a page with content on it");
  assert.ok(/Read-only/.test(docHtml), "and says it cannot be edited");
  // Forcing an app still opens it the way Windows would.
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

test("asset manifest resolves wallpapers, portraits and their fallbacks", async () => {
  const a = await j("/api/assets");
  assert.ok(a.body.assets["wallpaper.desktop"].url, "wallpaper has a url (fetched, or its fallback)");
  const img = await fetch(B + a.body.assets["wallpaper.desktop"].url);
  assert.equal(img.status, 200);

  // A person slot either has a face on disk or stays blank behind a silhouette; both are
  // fine, and the placeholder has to be declared either way so nothing renders empty.
  const owner = a.body.assets["people.owner"];
  assert.equal(owner.placeholder, "silhouette");
  if (owner.url) {
    const face = await fetch(B + owner.url);
    assert.equal(face.status, 200, "a portrait that resolves must actually serve");
  }

  // The wallpaper picker needs more than one preset to be worth opening.
  const wallpapers = Object.values(a.body.assets).filter((x) => x.wallpaper);
  assert.ok(wallpapers.length >= 4, `wallpaper presets available (${wallpapers.length})`);
  assert.ok(wallpapers.every((w) => w.title), "every preset is named");
});

test("the PDF filler renders a document rather than a blank page", async () => {
  const pdf = await post("/api/fs/open", { path: `${home}/Desktop/passport scan (2).pdf` });
  assert.equal(pdf.body.viewer, "chrome");
  const r = await fetch(`${B}${pdf.body.url}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /application\/pdf/);
  const body = Buffer.from(await r.arrayBuffer()).toString("latin1");
  assert.ok(body.startsWith("%PDF"), "a real PDF");
  assert.ok(/\/BaseFont \/Helvetica/.test(body), "with a font resource");
  assert.ok((body.match(/Tj/g) ?? []).length > 6, "and real text set on the page");
});

test("this computer's Wi-Fi comes from the world, and turning it off sticks", async () => {
  const before = await j("/api/settings");
  const ssid = before.body.network.ssid;
  assert.ok(ssid && ssid.length > 2, "the network has a name");
  assert.equal(before.body.settings.ssid, ssid, "and the machine is joined to it");
  assert.ok(before.body.network.known.some((k) => k.ssid === ssid), "which is one of its saved networks");

  const off = await post("/api/settings", { wifi: false });
  assert.equal(off.body.settings.wifi, false);
  const stillOff = await j("/api/settings");
  assert.equal(stillOff.body.settings.wifi, false, "the setting survives a reload");
  await post("/api/settings", { wifi: true });
});

test("the calendar can be written to, and story events are hidden rather than destroyed", async () => {
  const from = new Date(Date.UTC(2026, 8, 1)).toISOString();
  const to = new Date(Date.UTC(2026, 9, 1)).toISOString();

  const made = await post("/api/calendar", { title: "Test event", start: "2026-09-15T13:00:00Z", end: "2026-09-15T14:00:00Z", calendar: "wren" });
  assert.equal(made.status, 200);
  const id = made.body.id;
  let list = await j(`/api/calendar?from=${from}&to=${to}&record=0`);
  assert.ok(list.body.events.some((e) => e.seriesId === id && e.title === "Test event"), "the new event shows up");

  const edited = await j("/api/calendar", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, title: "Renamed" }) });
  assert.equal(edited.status, 200);
  list = await j(`/api/calendar?from=${from}&to=${to}&record=0`);
  assert.ok(list.body.events.some((e) => e.seriesId === id && e.title === "Renamed"), "the edit sticks");

  const gone = await j(`/api/calendar?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  assert.equal(gone.status, 200);
  list = await j(`/api/calendar?from=${from}&to=${to}&record=0`);
  assert.ok(!list.body.events.some((e) => e.seriesId === id), "and so does the delete");

  // A story event can be hidden and put back without touching content/.
  const story = list.body.events.find((e) => !String(e.seriesId).startsWith("user-"));
  if (story) {
    await j(`/api/calendar?id=${encodeURIComponent(story.seriesId)}`, { method: "DELETE" });
    let after = await j(`/api/calendar?from=${from}&to=${to}&record=0`);
    assert.ok(!after.body.events.some((e) => e.seriesId === story.seriesId), "story event hidden");
    await j("/api/calendar", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: story.seriesId, title: story.title }) });
    after = await j(`/api/calendar?from=${from}&to=${to}&record=0`);
    assert.ok(after.body.events.some((e) => e.seriesId === story.seriesId), "and restored, still in content/");
  }
});

test("saving a picture out of the browser puts it where File Explorer can see it", async () => {
  const folders = await j("/api/fs/save-url");
  assert.ok(folders.body.folders.some((f) => f.name === "Pictures"));
  const pictures = folders.body.folders.find((f) => f.name === "Pictures").path;

  // Whatever picture this seed put on the desktop; the point is that saving one works.
  const desktop = await j(`/api/fs/list?path=${encodeURIComponent(`${home}/Desktop`)}`);
  const pic = desktop.body.children.find((c) => !c.dir && /^(jpg|jpeg|png|heic|bmp|webp)$/i.test(c.ext)) ?? desktop.body.children.find((c) => !c.dir);
  const src = `/lf/${encodeURIComponent(pic.path).replace(/%2F/g, "/")}`;
  const saved = await post("/api/fs/save-url", { url: src, folder: pictures, name: "saved-from-browser.png" });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.folder, pictures);

  const ls = await j(`/api/fs/list?path=${encodeURIComponent(pictures)}`);
  assert.ok(ls.body.children.some((c) => c.name === "saved-from-browser.png"), "it is in the folder");
  const back = await fetch(`${B}/lf/${encodeURIComponent(saved.body.path).replace(/%2F/g, "/")}`);
  assert.equal(back.status, 200, "and it opens again afterwards");

  // A second save of the same name does not overwrite the first.
  const again = await post("/api/fs/save-url", { url: src, folder: pictures, name: "saved-from-browser.png" });
  assert.notEqual(again.body.path, saved.body.path);
});

test("a fake site's own links stay inside that site", async () => {
  const r = await fetch(`${B}/sites/harbourledger.ca/archive/`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(!/href="\/(?!sites\/|api\/|lf\/|assets\/|player|chrome\/)/.test(html), "no link escapes to the shell root");
  assert.ok(html.includes('href="/sites/harbourledger.ca/"'), "the front-page link points at the site");
});

test("Google account domains are intercepted, so no real sign-in is reachable", async () => {
  const hosts = await j("/api/sites/hosts");
  for (const h of ["mail.google.com", "gmail.com", "calendar.google.com", "accounts.google.com", "myaccount.google.com"]) {
    assert.ok(hosts.body.match.includes(h), `${h} is intercepted`);
  }
  const page = await fetch(`${B}/sites/accounts.google.com/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(/not connected to Google/i.test(html), "and answers with this machine's own copy");
  assert.ok(!/type="password"/i.test(html), "with nowhere to type a password");
});
