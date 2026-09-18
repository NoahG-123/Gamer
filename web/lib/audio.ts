/**
 * Field recordings, rendered while they play.
 *
 * A recording is an ambient bed plus spoken clips placed at their real timecodes
 * (content/audio/recordings.json). Nothing is stored: every byte is computed from the
 * sample position it sits at, so a 47-minute file costs no disk and seeking anywhere in
 * it is instant.
 *
 * The east-wing bed keeps the exact signature the notes in the world describe — a ~92 Hz
 * fundamental with a 0.16 Hz swell and formant-like partials near 470 Hz and 1180 Hz that
 * drift slowly — so anything measured off the audio still agrees with what is written
 * about it. Voices are mixed over that bed, never in place of it.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { contentPath, loadContent } from "./content";

export const SR = 22050;
const BYTES_PER_SAMPLE = 2;
const HEADER = 44;

export type BedName = "room" | "room17" | "corridor" | "kitchen";
interface Clip { at: number; v: string; text: string; gain?: number }
interface Recording { id: string; seconds: number; bed: BedName; clips: Clip[] }
interface RecordingsFile { voices: Record<string, { voice: string; style: string }>; recordings: Recording[] }

export function loadRecordings(): RecordingsFile {
  return loadContent<RecordingsFile>("audio/recordings.json");
}
export function getRecording(id: string): Recording | null {
  return loadRecordings().recordings.find((r) => r.id === id) ?? null;
}
export function recordingBytes(rec: Recording): number {
  return HEADER + Math.floor(rec.seconds * SR) * BYTES_PER_SAMPLE;
}

/** Same clip naming as scripts/fetch-voices.mjs, so the renderer finds what was generated. */
function clipFile(v: string, text: string): string {
  const name = `${v}-${crypto.createHash("sha256").update(`${v}|${text}`).digest("hex").slice(0, 12)}.wav`;
  return path.join(contentPath("filesystem", "assets", "audio", "voice"), name);
}

// ---------- deterministic noise ----------
/** Value noise keyed by absolute sample index: the same file always sounds the same. */
function noiseAt(i: number, seed: number): number {
  let x = (i ^ (seed * 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
  return ((x ^ (x >>> 15)) >>> 0) / 0xffffffff * 2 - 1;
}

// ---------- beds ----------
/**
 * One sample of the ambient bed at absolute sample index `i`.
 * `hum` scales the east-wing tone: 0 in an ordinary room, 1 in the corridor it was loudest in.
 */
function bedSample(bed: BedName, i: number): number {
  const t = i / SR;
  switch (bed) {
    case "corridor": return humSample(t, i, 1) + floorSample(t, i, 0.5);
    case "room17": return humSample(t, i, 0.45) + floorSample(t, i, 0.8);
    case "room": return floorSample(t, i, 1);
    case "kitchen": return kitchenSample(t, i);
  }
}

/**
 * The hum: a 92 Hz fundamental with a 0.16 Hz swell and two formant-like partials that
 * drift slowly around 470 Hz and 1180 Hz.
 *
 * The partials are integrated properly rather than written as `f(t) · t`: a frequency
 * that wobbles has to have its phase accumulated, or the tone runs away as the recording
 * gets longer instead of drifting a few Hz either side. They also sit clearly above the
 * noise floor, because the notes in the world describe measuring them.
 */
function humSample(t: number, i: number, amount: number): number {
  if (amount <= 0) return 0;
  const swell = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.16 * t);
  const w1 = 2 * Math.PI * 0.05, w2 = 2 * Math.PI * 0.037;
  const phase1 = 2 * Math.PI * (470 * t + (40 / w1) * (1 - Math.cos(w1 * t)));
  const phase2 = 2 * Math.PI * (1180 * t - (90 / w2) * (Math.cos(w2 * t + 1) - Math.cos(1)));
  let v = Math.sin(2 * Math.PI * 92 * t) * 0.6;
  v += Math.sin(2 * Math.PI * 184 * t) * 0.15;
  v += Math.sin(phase1) * 0.17;
  v += Math.sin(phase2) * 0.11;
  v += noiseAt(i, 11) * 0.028;
  return v * swell * 0.18 * amount;
}

/** The floor of a quiet institutional room: air handling, a distant corridor, the odd tick. */
function floorSample(t: number, i: number, amount: number): number {
  let v = Math.sin(2 * Math.PI * 58 * t) * 0.35 + Math.sin(2 * Math.PI * 121 * t + 0.6) * 0.12;
  v += noiseAt(i, 23) * 0.5 + noiseAt(i - 1, 23) * 0.3; // gently low-passed hiss
  const breath = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.023 * t + 2.1);
  // a far-off door or trolley every minute or so
  const knockPhase = (t % 67) / 67;
  const knock = knockPhase < 0.004 ? Math.sin(2 * Math.PI * 180 * t) * (1 - knockPhase / 0.004) * 0.35 : 0;
  return (v * 0.055 * breath + knock * 0.4) * amount;
}

/** A domestic kitchen: fridge, a radio two rooms away, movement. */
function kitchenSample(t: number, i: number): number {
  let v = Math.sin(2 * Math.PI * 120 * t) * 0.1;
  v += Math.sin(2 * Math.PI * 220 * t + Math.sin(t * 3)) * 0.05;
  const radio = Math.sin(2 * Math.PI * 340 * t + Math.sin(2 * Math.PI * 2.7 * t) * 3) * 0.02 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.11 * t));
  v += radio;
  v += noiseAt(i, 41) * 0.06 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.7 * t));
  return v * 0.5;
}

// ---------- clips ----------
interface LoadedClip { start: number; samples: Float32Array }
const clipCache = new Map<string, Float32Array | null>();

function readClip(file: string): Float32Array | null {
  if (clipCache.has(file)) return clipCache.get(file)!;
  let out: Float32Array | null = null;
  try {
    const buf = fs.readFileSync(file);
    // Minimal WAV reader: find "data", take 16-bit mono samples.
    const idx = buf.indexOf("data", 12, "ascii");
    if (idx > 0) {
      const size = buf.readUInt32LE(idx + 4);
      const n = Math.min(size, buf.length - idx - 8) / 2;
      const raw = new Float32Array(n);
      for (let i = 0; i < n; i++) raw[i] = buf.readInt16LE(idx + 8 + i * 2) / 32768;
      out = roomify(raw);
    }
  } catch { out = null; }
  clipCache.set(file, out);
  return out;
}

/** Put a dry voice in the room: a little early reflection and a gentle top-end roll-off. */
function roomify(dry: Float32Array): Float32Array {
  const tail = Math.floor(SR * 0.35);
  const out = new Float32Array(dry.length + tail);
  const taps = [[Math.floor(SR * 0.017), 0.22], [Math.floor(SR * 0.029), 0.16], [Math.floor(SR * 0.051), 0.1], [Math.floor(SR * 0.083), 0.06]];
  for (let i = 0; i < dry.length; i++) {
    out[i] += dry[i];
    for (const [d, g] of taps) out[i + d] += dry[i] * g;
  }
  let prev = 0;
  for (let i = 0; i < out.length; i++) { prev = prev + 0.55 * (out[i] - prev); out[i] = prev * 0.72; }
  return out;
}

function clipsFor(rec: Recording): LoadedClip[] {
  const out: LoadedClip[] = [];
  for (const c of rec.clips ?? []) {
    const samples = readClip(clipFile(c.v, c.text));
    if (!samples) continue;
    out.push({ start: Math.floor(c.at * SR), samples });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---------- rendering ----------
function header(totalSamples: number): Buffer {
  const buf = Buffer.alloc(HEADER);
  const dataBytes = totalSamples * BYTES_PER_SAMPLE;
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataBytes, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * BYTES_PER_SAMPLE, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

/** Render samples [from, to) of a recording into 16-bit little-endian PCM. */
function renderSamples(rec: Recording, clips: LoadedClip[], from: number, to: number): Buffer {
  const n = to - from;
  const buf = Buffer.alloc(n * BYTES_PER_SAMPLE);
  const total = Math.floor(rec.seconds * SR);
  // Only the clips that overlap this window matter.
  const active = clips.filter((c) => c.start < to && c.start + c.samples.length > from);
  for (let k = 0; k < n; k++) {
    const i = from + k;
    let v = bedSample(rec.bed, i);
    for (const c of active) {
      const j = i - c.start;
      if (j >= 0 && j < c.samples.length) v += c.samples[j] * 0.9;
    }
    // Soft limit, then the fade the recorder puts on the very start and end.
    if (v > 0.95) v = 0.95 + (v - 0.95) * 0.2;
    else if (v < -0.95) v = -0.95 + (v + 0.95) * 0.2;
    const fade = SR * 0.8;
    if (i < fade) v *= i / fade;
    else if (total - i < fade) v *= Math.max(0, (total - i) / fade);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), k * BYTES_PER_SAMPLE);
  }
  return buf;
}

/**
 * A byte range of the finished WAV, as a stream. `start`/`end` are inclusive byte offsets
 * into the whole file (header included), the way an HTTP range request describes them.
 */
export function recordingStream(rec: Recording, start: number, end: number): ReadableStream<Uint8Array> {
  const totalSamples = Math.floor(rec.seconds * SR);
  const clips = clipsFor(rec);
  const CHUNK = 64 * 1024;
  let pos = start;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pos > end) { controller.close(); return; }
      const upto = Math.min(end, pos + CHUNK - 1);
      const parts: Buffer[] = [];
      if (pos < HEADER) {
        const h = header(totalSamples);
        parts.push(h.subarray(pos, Math.min(HEADER, upto + 1)));
      }
      const dataFrom = Math.max(pos, HEADER) - HEADER;
      const dataTo = upto - HEADER + 1;
      if (dataTo > dataFrom) {
        const firstSample = Math.floor(dataFrom / BYTES_PER_SAMPLE);
        const lastSample = Math.min(totalSamples, Math.ceil(dataTo / BYTES_PER_SAMPLE));
        if (lastSample > firstSample) {
          const pcm = renderSamples(rec, clips, firstSample, lastSample);
          const offset = dataFrom - firstSample * BYTES_PER_SAMPLE;
          parts.push(pcm.subarray(offset, offset + (dataTo - dataFrom)));
        }
      }
      pos = upto + 1;
      const chunk = Buffer.concat(parts);
      if (chunk.length) controller.enqueue(new Uint8Array(chunk));
      else controller.close();
    },
  });
}

/** How many voice clips a recording has, and how many were actually generated. */
export function voiceStatus(): { total: number; present: number } {
  let total = 0, present = 0;
  for (const rec of loadRecordings().recordings) {
    for (const c of rec.clips ?? []) { total++; if (fs.existsSync(clipFile(c.v, c.text))) present++; }
  }
  return { total, present };
}

/**
 * A waveform summary: the loudest positive and negative value in each bucket across the
 * whole recording. Sampled rather than exhaustive, so even a 47-minute file draws at once.
 */
export function peakBuckets(rec: Recording, buckets: number): [number, number][] {
  const total = Math.floor(rec.seconds * SR);
  const per = Math.max(1, Math.floor(total / buckets));
  const step = Math.max(1, Math.floor(per / 220)); // sample each bucket rather than read all of it
  const clips = clipsFor(rec);
  const out: [number, number][] = [];
  for (let b = 0; b < buckets; b++) {
    const from = b * per;
    const to = Math.min(total, from + per);
    let lo = 0, hi = 0;
    const active = clips.filter((c) => c.start < to && c.start + c.samples.length > from);
    for (let i = from; i < to; i += step) {
      let v = bedSample(rec.bed, i);
      for (const c of active) {
        const j = i - c.start;
        if (j >= 0 && j < c.samples.length) v += c.samples[j] * 0.9;
      }
      if (v > hi) hi = v;
      if (v < lo) lo = v;
    }
    out.push([Number(lo.toFixed(3)), Number(hi.toFixed(3))]);
  }
  return out;
}
