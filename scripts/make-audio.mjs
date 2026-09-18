// Generates the story WAV files under content/filesystem/assets/audio/.
// These are short, low, ambient tones (a stand-in for real field recordings) so the
// audio player has something to play. Deterministic, no dependencies. Small files.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const outDir = path.join(root, "content/filesystem/assets/audio");
fs.mkdirSync(outDir, { recursive: true });

const SR = 22050;

function wav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}

// A slow low hum with faint moving formants and breath — the "east wing" texture.
function hum(seconds, { base = 94, breath = 0.16, level = 0.18, voice = 0.5 } = {}) {
  const n = Math.floor(SR * seconds);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const swell = 0.6 + 0.4 * Math.sin(2 * Math.PI * breath * t);
    let v = Math.sin(2 * Math.PI * base * t) * 0.6;
    v += Math.sin(2 * Math.PI * base * 2 * t) * 0.15;
    // moving formant-ish partials
    const f1 = 470 + 40 * Math.sin(2 * Math.PI * 0.05 * t);
    const f2 = 1180 + 90 * Math.sin(2 * Math.PI * 0.037 * t + 1);
    v += Math.sin(2 * Math.PI * f1 * t) * 0.05 * voice;
    v += Math.sin(2 * Math.PI * f2 * t) * 0.03 * voice;
    // pink-ish noise floor
    v += (Math.random() * 2 - 1) * 0.04;
    s[i] = v * swell * level;
  }
  // gentle fade in/out
  const f = Math.floor(SR * 0.8);
  for (let i = 0; i < f; i++) { s[i] *= i / f; s[n - 1 - i] *= i / f; }
  return s;
}

// A warmer domestic tone for the "papa in the kitchen" file — a low radio murmur.
function kitchen(seconds) {
  const n = Math.floor(SR * seconds);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = Math.sin(2 * Math.PI * 120 * t) * 0.1;
    v += Math.sin(2 * Math.PI * 220 * t + Math.sin(t * 3)) * 0.05;
    v += (Math.random() * 2 - 1) * 0.06 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.7 * t));
    s[i] = v * 0.5;
  }
  const f = Math.floor(SR * 0.5);
  for (let i = 0; i < f; i++) { s[i] *= i / f; s[n - 1 - i] *= i / f; }
  return s;
}

const files = {
  "hum.wav": hum(24, { voice: 0.8 }),
  "af01.wav": kitchen(16),
  "af02.wav": kitchen(14),
  "af03_locked.wav": hum(20, { base: 88, voice: 0.6, level: 0.14 }),
  "papa.wav": kitchen(18),
};
for (const [name, samples] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), wav(samples));
  console.log(`wrote audio/${name} (${(fs.statSync(path.join(outDir, name)).size / 1024).toFixed(0)} KB)`);
}
console.log("done");
