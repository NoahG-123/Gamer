/**
 * Deterministic stand-in bodies for "dressing" files (the hundreds of filler files that
 * make the machine feel used but carry no story). Real computers open everything into
 * *something*, so instead of a dead end each type gets a plausible synthetic body:
 * audio/video -> a short ambient WAV, images -> a soft photo-like PNG, pdf -> a scanned
 * blank page, anything binary opened as text -> the mojibake Notepad would show.
 * All seeded by path so a file looks the same every time.
 */
import zlib from "node:zlib";
import crypto from "node:crypto";

export const TEXT_EXTS = new Set(["txt", "log", "ini", "md", "csv", "srt", "json", "yml", "yaml", "toml", "cfg", "conf", "py", "js", "ts", "mjs", "cjs", "sh", "ps1", "html", "htm", "css", "xml", "env", "gitignore", "reg", "nfo", "rtf", "vtt", "sub", "eml", "ics", "pub", "manifest", "ion", "rdp", "txt~", "bak", ""]);
export const AUDIO_EXTS = new Set(["wav", "mp3", "m4a", "flac", "aif", "aiff", "ogg", "wma", "opus"]);
export const VIDEO_EXTS = new Set(["mp4", "mov", "mkv", "webm", "avi", "m4v"]);
export const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp", "heic", "tif", "tiff", "svg", "jfif"]);
export const PDF_EXTS = new Set(["pdf"]);
export const DIALOG_EXTS = new Set(["exe", "msi", "com", "bat", "jar", "lnk", "url", "zip", "rar", "7z"]);

export type DressingKind = "text" | "audio" | "video" | "image" | "pdf" | "dialog" | "other";
export function dressingKind(ext: string): DressingKind {
  if (TEXT_EXTS.has(ext)) return "text";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (PDF_EXTS.has(ext)) return "pdf";
  if (DIALOG_EXTS.has(ext)) return "dialog";
  return "other";
}

function rng(seed: string): () => number {
  let s = crypto.createHash("sha256").update(seed).digest().readUInt32LE(0) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

const cache = new Map<string, Buffer>();
function memo(key: string, make: () => Buffer): Buffer {
  const hit = cache.get(key);
  if (hit) return hit;
  const b = make();
  if (cache.size > 64) cache.delete(cache.keys().next().value as string);
  cache.set(key, b);
  return b;
}

// ---------- audio ----------
const SR = 22050;
export function synthWav(seed: string, seconds = 14): Buffer {
  return memo(`wav:${seed}:${seconds}`, () => {
    const r = rng(seed);
    const base = 55 + r() * 90, breath = 0.08 + r() * 0.16, level = 0.12 + r() * 0.1, noise = 0.02 + r() * 0.05;
    const f1 = 380 + r() * 260, f2 = 900 + r() * 600, voice = r() * 0.8;
    const n = Math.floor(SR * seconds);
    const buf = Buffer.alloc(44 + n * 2);
    buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
    buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
    const fade = Math.floor(SR * 0.6);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const swell = 0.6 + 0.4 * Math.sin(2 * Math.PI * breath * t);
      let v = Math.sin(2 * Math.PI * base * t) * 0.6 + Math.sin(2 * Math.PI * base * 2 * t) * 0.15;
      v += Math.sin(2 * Math.PI * (f1 + 30 * Math.sin(0.3 * t)) * t) * 0.05 * voice;
      v += Math.sin(2 * Math.PI * (f2 + 70 * Math.sin(0.23 * t + 1)) * t) * 0.03 * voice;
      v += (r() * 2 - 1) * noise;
      v *= swell * level;
      if (i < fade) v *= i / fade; else if (n - 1 - i < fade) v *= (n - 1 - i) / fade;
      buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
    }
    return buf;
  });
}

// ---------- image ----------
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf: Buffer): number { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32LE(0); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A soft, slightly grainy photo-like frame: two-tone gradient with a vignette. Looks like an out-of-focus snapshot. */
export function synthPng(seed: string, w = 800, h = 600): Buffer {
  return memo(`png:${seed}:${w}x${h}`, () => {
    const r = rng(seed);
    const palettes = [[[38, 52, 74], [186, 168, 140]], [[70, 60, 52], [210, 196, 170]], [[24, 40, 44], [140, 170, 160]], [[90, 70, 60], [230, 214, 190]], [[30, 30, 36], [120, 130, 150]], [[60, 80, 60], [200, 210, 180]]];
    const [c0, c1] = palettes[Math.floor(r() * palettes.length)];
    const angle = r() * Math.PI * 2, grain = 6 + r() * 10, horizon = 0.35 + r() * 0.3;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    const cx = w / 2, cy = h / 2, maxd = Math.hypot(cx, cy);
    for (let y = 0; y < h; y++) {
      raw[y * (w * 3 + 1)] = 0;
      for (let x = 0; x < w; x++) {
        const nx = x / w - 0.5, ny = y / h - 0.5;
        let t = 0.5 + (nx * Math.cos(angle) + ny * Math.sin(angle));
        t = Math.max(0, Math.min(1, t));
        const band = y / h > horizon ? 0.85 : 1; // a darker lower half, like ground
        const vig = 1 - 0.45 * Math.pow(Math.hypot(x - cx, y - cy) / maxd, 2);
        const g = (r() * 2 - 1) * grain;
        const o = y * (w * 3 + 1) + 1 + x * 3;
        for (let k = 0; k < 3; k++) raw[o + k] = Math.max(0, Math.min(255, Math.round((c0[k] + (c1[k] - c0[k]) * t) * band * vig + g)));
      }
    }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
  });
}

// ---------- pdf ----------
/** A one-page "scan": off-white page with a faint grey band, no text. Chrome's PDF viewer renders it. */
export function synthPdf(seed: string, pages = 1): Buffer {
  return memo(`pdf:${seed}:${pages}`, () => {
    const r = rng(seed);
    const objs: string[] = [];
    const kids: number[] = [];
    let n = 3;
    for (let p = 0; p < pages; p++) {
      const pageId = n++, contentId = n++;
      kids.push(pageId);
      const shade = (0.9 + r() * 0.06).toFixed(3);
      const lines: string[] = [`${shade} ${shade} ${(Number(shade) - 0.02).toFixed(3)} rg 0 0 612 792 re f`];
      // a few faint grey blocks where text would be, like a low-contrast scan
      for (let i = 0; i < 6 + Math.floor(r() * 8); i++) { const y = 700 - i * (28 + r() * 30); const wdt = 200 + r() * 300; lines.push(`0.80 0.80 0.80 rg 72 ${y.toFixed(1)} ${wdt.toFixed(1)} 9 re f`); }
      const content = lines.join("\n");
      objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << >> >>`;
      objs[contentId] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
    }
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objs[2] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets: number[] = [];
    for (let i = 1; i < n; i++) { offsets[i] = Buffer.byteLength(out, "latin1"); out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
    const xref = Buffer.byteLength(out, "latin1");
    out += `xref\n0 ${n}\n0000000000 65535 f \n`;
    for (let i = 1; i < n; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, "latin1");
  });
}

// ---------- binary-as-text ----------
const MAGIC: Record<string, string> = {
  docx: "PK  \b   ! ", xlsx: "PK  \b   ! ", pptx: "PK  \b   ! ", zip: "PK",
  pdf: "%PDF-1.7\n%âãÏÓ\n", jpg: "ÿØÿà JFIF ", jpeg: "ÿØÿà JFIF ", png: "PNG\r\n\n   \rIHDR",
  exe: "MZ       ÿÿ  ", wav: "RIFF¤  WAVEfmt ", mp3: "ID3    ", mp4: "   ftypmp42", doc: "ÐÏà¡±á", heic: "   ftypheic",
};
/** What Notepad shows when you open a binary file. */
export function junkText(seed: string, ext: string, size: number): string {
  const r = rng(seed);
  const len = Math.min(Math.max(size, 800), 6000);
  let s = MAGIC[ext] ?? "";
  const alphabet = " °±µ¶·¼½ÀÉÐ×ØÞßàéïð÷øþÿŒœˆ˜†‡•…‰‹›€™■►▒▓█│┤┴┬├─";
  while (s.length < len) {
    const c = r();
    if (c < 0.55) s += alphabet[Math.floor(r() * alphabet.length)];
    else if (c < 0.8) s += String.fromCharCode(33 + Math.floor(r() * 94));
    else if (c < 0.9) s += " ";
    else if (c < 0.97) s += " ";
    else s += "\r\n";
  }
  return s;
}
