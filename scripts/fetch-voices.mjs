// Generates the spoken clips for the field recordings from content/audio/recordings.json.
//
// Uses Google's Gemini speech models and writes 22.05 kHz mono 16-bit WAVs into
// content/filesystem/assets/audio/voice/. Clips already on disk are left alone, so running
// it again only fetches what is missing. The recordings themselves are never stored:
// web/lib/audio.ts mixes these clips over the ambient bed while a file is played, so a
// missing clip simply means that moment is room tone.
//
//   GEMINI_API_KEY=... npm run fetch:voices
//   npm run fetch:voices -- --force        # regenerate everything
//
// The free tier allows only a handful of speech requests per model per day, so the script
// works through several models in turn, does the most important lines first, and stops
// cleanly when the day's allowance is gone. Run it again tomorrow and it carries on.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const outDir = path.join(root, "content/filesystem/assets/audio/voice");
const dataFile = path.join(root, "content/audio/recordings.json");
const MODELS = (process.env.TTS_MODELS || "gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-2.5-pro-preview-tts")
  .split(",").map((m) => m.trim()).filter(Boolean);
const SR = 22050;
const force = process.argv.includes("--force");
const exhausted = new Set();

const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!key) {
  console.error("No GEMINI_API_KEY set. The recordings still play — they just have no voices in them.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { voices, recordings } = JSON.parse(fs.readFileSync(dataFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

/** Stable name for a line, so regenerating only touches what changed. Matches web/lib/audio.ts. */
function clipName(v, text) {
  return `${v}-${crypto.createHash("sha256").update(`${v}|${text}`).digest("hex").slice(0, 12)}.wav`;
}

function wav(samples, rate = SR) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}

/** API audio (24 kHz) down to the rate the recordings run at, trimmed and levelled. */
function conditionPcm(pcm, fromRate) {
  const n = Math.floor(pcm.length / 2);
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) src[i] = pcm.readInt16LE(i * 2) / 32768;
  const ratio = fromRate / SR;
  const outLen = Math.floor(n / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio, i0 = Math.floor(x), frac = x - i0;
    out[i] = (src[i0] ?? 0) * (1 - frac) + (src[i0 + 1] ?? 0) * frac;
  }
  let start = 0, end = outLen - 1;
  const floor = 0.004;
  while (start < end && Math.abs(out[start]) < floor) start++;
  while (end > start && Math.abs(out[end]) < floor) end--;
  const trimmed = out.slice(Math.max(0, start - Math.floor(SR * 0.05)), Math.min(outLen, end + Math.floor(SR * 0.12)));
  let peak = 0;
  for (const v of trimmed) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0.001 ? 0.82 / peak : 1;
  for (let i = 0; i < trimmed.length; i++) trimmed[i] *= gain;
  const fade = Math.floor(SR * 0.02);
  for (let i = 0; i < fade && i < trimmed.length; i++) { trimmed[i] *= i / fade; trimmed[trimmed.length - 1 - i] *= i / fade; }
  return trimmed;
}

function decode(json) {
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("no audio in response");
  const mime = part.inlineData.mimeType || "";
  const rate = Number(mime.match(/rate=(\d+)/)?.[1] ?? 24000);
  return conditionPcm(Buffer.from(part.inlineData.data, "base64"), rate);
}

async function ask(model, voiceName, style, text) {
  const prompt = `Read this aloud as ${style}. Read only the words, naturally, with the pauses the punctuation implies:\n\n${text}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (res.status === 429) {
    const detail = await res.text();
    return { retry: true, daily: /PerDay/i.test(detail), wait: Number(detail.match(/"retryDelay":\s*"(\d+)s"/)?.[1] ?? 30) * 1000 };
  }
  if (res.status >= 500) return { retry: true, daily: false, wait: 15000 };
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return { json: await res.json() };
}

/** One line, through whichever model still has allowance left. */
async function tts(voiceName, style, text) {
  for (let round = 0; round < 3; round++) {
    for (const model of MODELS) {
      if (exhausted.has(model)) continue;
      const r = await ask(model, voiceName, style, text);
      if (r.json) return decode(r.json);
      if (r.daily) { exhausted.add(model); process.stdout.write(` [${model} spent for today]`); continue; }
      process.stdout.write(` waiting ${Math.round(r.wait / 1000)}s…`);
      await sleep(r.wait);
    }
    if (exhausted.size >= MODELS.length) throw new Error("daily allowance spent on every speech model");
  }
  throw new Error("rate limited");
}

// Lines marked with a priority go first, so a small allowance is spent where it counts.
const wanted = [];
for (const rec of recordings) for (const c of rec.clips ?? []) wanted.push({ ...c, rec: rec.id });
wanted.sort((a, b) => (a.p ?? 5) - (b.p ?? 5));

let made = 0, kept = 0, failed = 0, stopped = false;
for (const [i, c] of wanted.entries()) {
  const cfg = voices[c.v];
  if (!cfg) { console.warn(`  ${c.v}: no voice configured, skipping`); continue; }
  const file = path.join(outDir, clipName(c.v, c.text));
  if (fs.existsSync(file) && !force) { kept++; continue; }
  process.stdout.write(`[${i + 1}/${wanted.length}] ${c.rec} ${c.v} ${JSON.stringify(c.text.slice(0, 40))}…`);
  try {
    const samples = await tts(cfg.voice, cfg.style, c.text);
    fs.writeFileSync(file, wav(samples));
    made++;
    process.stdout.write(` ${(samples.length / SR).toFixed(1)}s\n`);
  } catch (e) {
    failed++;
    process.stdout.write(` ${e.message}\n`);
    if (/daily allowance/.test(e.message)) { stopped = true; break; }
  }
  await sleep(Number(process.env.TTS_DELAY_MS ?? 4000));
}

const total = wanted.length;
console.log(`\nvoice clips: ${made} new, ${kept} already there, ${total - made - kept} still missing (of ${total})`);
if (stopped) console.log("The day's free allowance is spent. Run `npm run fetch:voices` again tomorrow and it carries on from here.");
if (failed && !stopped) process.exitCode = 1;
