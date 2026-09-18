// API-level tests for the content server (state engine, filesystem, sites, messaging, LLM plumbing).
// Requires a running server with LLM_PROVIDER=mock:  LLM_PROVIDER=mock npx next dev web -p 4127
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

test("profile and filesystem listing", async () => {
  const r = await j(`/api/fs/list?path=${encodeURIComponent(home + "/Documents")}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.children.length > 20, "deep folder tree");
  assert.ok(r.body.children.some((c) => c.dir), "has folders");
  assert.ok(!r.body.children.some((c) => c.name === "placeholder notes.txt"), "hidden story file not visible yet");
  const root = await j("/api/fs/list?path=C:");
  assert.ok(root.body.children.some((c) => c.name === "Windows"));
  assert.ok(!root.body.children.some((c) => c.name === "pagefile.sys"), "hidden system files hidden by default");
});

test("dressing files are unopenable; story files open; triggers reveal content", async () => {
  const dressing = await post("/api/fs/open", { path: `${home}/Downloads/receipt.pdf` });
  assert.equal(dressing.body.openable, false);
  const readme = await post("/api/fs/open", { path: `${home}\\Desktop\\read me first.txt` });
  assert.equal(readme.body.openable, true);
  assert.equal(readme.body.viewer, "notepad");
  assert.deepEqual(readme.body.fired, ["reveal-notes-after-readme"]);
  const docs = await j(`/api/fs/list?path=${encodeURIComponent(home + "/Documents")}`);
  assert.ok(docs.body.children.some((c) => c.name === "placeholder notes.txt"), "revealed file appears");
  const state = await j("/api/state");
  assert.equal(state.body.flags.read_readme, true);
  const raw = await fetch(`${B}/lf/${encodeURIComponent(home + "/Documents/placeholder notes.txt").replace(/%2F/g, "/")}`);
  assert.equal(raw.status, 200);
});

test("opening the revealed file unlocks a contact and delivers a message", async () => {
  const before = await j("/api/messages");
  assert.ok(!before.body.chats.some((c) => c.contact.id === "placeholder-unlock"));
  const r = await post("/api/fs/open", { path: `${home}/Documents/placeholder notes.txt` });
  assert.deepEqual(r.body.fired, ["unlock-contact-after-notes"]);
  const after = await j("/api/messages");
  const unlocked = after.body.chats.find((c) => c.contact.id === "placeholder-unlock");
  assert.ok(unlocked, "contact unlocked");
  await sleep(4500);
  const msgs = await j("/api/messages/placeholder-unlock?record=0");
  assert.ok(msgs.body.messages.some((m) => m.text.includes("you opened the notes file")), "trigger-delivered message arrived");
});

test("story sites are served with realistic behaviour; unknown hosts 404", async () => {
  const one = await fetch(`${B}/sites/placeholder-one.example/`);
  assert.equal(one.status, 200);
  assert.match(one.headers.get("content-type"), /text\/html/);
  const about = await fetch(`${B}/sites/www.placeholder-two.example/about/`);
  assert.equal(about.status, 200);
  const redirect = await fetch(`${B}/sites/placeholder-two.example/about`, { redirect: "manual" });
  assert.equal(redirect.status, 301);
  const missing = await fetch(`${B}/sites/placeholder-two.example/thread/1`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Apache/);
  const evil = await fetch(`${B}/sites/evil.example/`);
  assert.equal(evil.status, 404);
  const hosts = await j("/api/sites/hosts");
  assert.ok(hosts.body.match.includes("www.placeholder-two.example"));
});

test("messaging: send -> delivered -> read -> typing -> LLM reply (mock)", async () => {
  const events = [];
  const ctrl = new AbortController();
  const stream = fetch(`${B}/api/events`, { signal: ctrl.signal }).then(async (r) => {
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
    while (true) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf("\n\n")) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const line = chunk.split("\n").find((l) => l.startsWith("data: ")); if (line) events.push(JSON.parse(line.slice(6))); } }
  }).catch(() => {});
  await sleep(300);
  const sent = await post("/api/messages/placeholder-a", { text: "hello from the test suite" });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.message.status, "sent");
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline && !events.some((e) => e.type === "message" && e.message?.sender === "placeholder-a" && e.message.text.includes("mock"))) await sleep(200);
  ctrl.abort(); await stream;
  const types = events.map((e) => e.type + (e.status ? ":" + e.status : "") + (e.typing !== undefined ? ":" + e.typing : ""));
  assert.ok(types.includes("message.status:delivered"), types.join(","));
  assert.ok(types.includes("message.status:read"));
  assert.ok(types.includes("typing:true") && types.includes("typing:false"));
  const reply = events.find((e) => e.type === "message" && e.message?.sender === "placeholder-a");
  assert.ok(reply, "reply arrived");
  const usage = await j("/api/llm/usage");
  assert.equal(usage.body.provider, "mock");
  assert.ok(usage.body.spentUsd > 0 && usage.body.spentUsd < 0.01);
  assert.ok(usage.body.budgetUsd >= 1);
});

test("generic LLM endpoint uses character config and reports budget", async () => {
  const r = await post("/api/llm/chat", { messages: [{ role: "user", content: "ping" }], characterId: "placeholder-a" });
  assert.equal(r.status, 200);
  assert.match(r.body.content, /mock deepseek-reasoner/);
  const bad = await post("/api/llm/chat", { messages: [{ role: "user", content: "ping" }], characterId: "nope" });
  assert.equal(bad.status, 404);
});

test("custom events, flags and count triggers", async () => {
  for (let i = 0; i < 3; i++) await post("/api/state/events", { type: "message.sent", subject: "placeholder-a" });
  const s = await j("/api/state");
  assert.ok(s.body.fired.includes("three-messages-to-a"));
  assert.equal(s.body.flags.talked_to_a, 3);
  await post("/api/state/flags", { key: "custom_flag", value: "x" });
  const f = await j("/api/state/flags");
  assert.equal(f.body.flags.custom_flag, "x");
});

test("asset manifest resolves fallbacks and leaves person slots blank", async () => {
  const a = await j("/api/assets");
  assert.ok(a.body.assets["wallpaper.desktop"].url, "wallpaper has a fallback url");
  assert.equal(a.body.assets["people.owner"].url, null, "person image intentionally absent");
  assert.equal(a.body.assets["people.owner"].placeholder, "silhouette");
  const img = await fetch(B + a.body.assets["wallpaper.desktop"].url);
  assert.equal(img.status, 200);
});
