// Generates the spoken clips for the field recordings from content/audio/recordings.json.
//
// Uses Google's Gemini TTS (one short request per line, paced for the rate limit) and writes
// 22.05 kHz mono 16-bit WAVs into content/filesystem/assets/audio/voice/. Clips already on
// disk are left alone, so re-running costs nothing. The recordings themselves are not stored:
// web/lib/audio.ts mixes these clips over the ambient bed while the file is played.
//
//   GEMINI_API_KEY=... npm run fetch:voices
//   npm run fetch:voices -- --force        # regenerate everything
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const outDir = path.join(root, "content/filesystem/assets/audio/voice");
const dataFile = path.join(root, "content/audio/recordings.json");
const MODEL = process.env.TTS_MODEL || "gemini-2.5-flash-preview-tts";
const SR = 22050;
const force = process.argv.includes("--force");

const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!key) {
  console.error("No GEMINI_API_KEY set. The recordings still play — they just have no voices in them.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { voices, recordings } = JSON.parse(fs.readFileSync(dataFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

/** Stable name for a line, so regenerating only touches what changed. */
export function clipName(v, text) {
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

/** 24 kHz PCM from the API down to the 22.05 kHz the recordings run at, trimmed and levelled. */
function conditionPcm(pcm, fromRate) {
  const n = pcm.length / 2;
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) src[i] = pcm.readInt16LE(i * 2) / 32768;
  const ratio = fromRate / SR;
  const outLen = Math.floor(n / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio, i0 = Math.floor(x), frac = x - i0;
    out[i] = (src[i0] ?? 0) * (1 - frac) + (src[i0 + 1] ?? 0) * frac;
  }
  // Trim leading/trailing near-silence, then normalise to a consistent level.
  let start = 0, end = outLen - 1;
  const floor = 0.004;
  while (start < end && Math.abs(out[start]) < floor) start++;
  while (end > start && Math.abs(out[end]) < floor) end--;
  const trimmed = out.slice(Math.max(0, start - SR * 0.05), Math.min(outLen, end + SR * 0.12));
  let peak = 0;
  for (const v of trimmed) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0.001 ? 0.82 / peak : 1;
  for (let i = 0; i < trimmed.length; i++) trimmed[i] *= gain;
  const fade = Math.floor(SR * 0.02);
  for (let i = 0; i < fade && i < trimmed.length; i++) { trimmed[i] *= i / fade; trimmed[trimmed.length - 1 - i] *= i / fade; }
  return trimmed;
}

async function tts(voiceName, style, text, attempt = 0) {
  const body = {
    contents: [{ parts: [{ text: `Read this aloud as ${style}. Read only the words, naturally, with the pauses the punctuation implies:\n\n${text}` }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`giving up after ${attempt} retries (HTTP ${res.status})`);
    const wait = Math.min(90000, 8000 * 2 ** attempt);
    process.stdout.write(` rate limited, waiting ${Math.round(wait / 1000)}s…`);
    await sleep(wait);
    return tts(voiceName, style, text, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("no audio in response");
  const mime = part.inlineData.mimeType || "";
  const rate = Number(mime.match(/rate=(\d+)/)?.[1] ?? 24000);
  return conditionPcm(Buffer.from(part.inlineData.data, "base64"), rate);
}

const wanted = [];
for (const rec of recordings) for (const c of rec.clips ?? []) wanted.push({ ...c, rec: rec.id });
let made = 0, kept = 0, failed = 0;

for (const [i, c] of wanted.entries()) {
  const cfg = voices[c.v];
  if (!cfg) { console.warn(`  ${c.v}: no voice configured, skipping`); continue; }
  const name = clipName(c.v, c.text);
  const file = path.join(outDir, name);
  if (fs.existsSync(file) && !force) { kept++; continue; }
  process.stdout.write(`[${i + 1}/${wanted.length}] ${c.rec} ${c.v} ${JSON.stringify(c.text.slice(0, 42))}…`);
  try {
    const samples = await tts(cfg.voice, cfg.style, c.text);
    fs.writeFileSync(file, wav(samples));
    made++;
    process.stdout.write(` ${(samples.length / SR).toFixed(1)}s\n`);
  } catch (e) {
    failed++;
    process.stdout.write(` failed: ${e.message}\n`);
  }
  await sleep(Number(process.env.TTS_DELAY_MS ?? 7000));
}

console.log(`\nvoice clips: ${made} generated, ${kept} already present, ${failed} failed -> ${path.relative(root, outDir)}`);
if (failed) process.exitCode = 1;
