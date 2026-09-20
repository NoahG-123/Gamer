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
    // The two drifting partials have their phase integrated rather than written as
    // f(t)·t: a frequency that wobbles has to accumulate phase, or the pitch climbs
    // steadily with the length of the file instead of moving a few Hz either way.
    const w1 = 0.3, w2 = 0.23, d1 = 30, d2 = 70;
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
      v += Math.sin(2 * Math.PI * (f1 * t + (d1 / w1) * (1 - Math.cos(w1 * t)))) * 0.05 * voice;
      v += Math.sin(2 * Math.PI * (f2 * t - (d2 / w2) * (Math.cos(w2 * t + 1) - Math.cos(1)))) * 0.03 * voice;
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
/**
 * A photograph. Not a gradient: each one is a composed scene chosen by the file's own path
 * — a view out over water, a room with light coming in a window, a sky over a horizon, or
 * something too close to the lens to read — with depth-of-field softness, film grain and a
 * vignette. Deterministic, so a picture looks the same every time it is opened.
 */
function fbm(r: () => number, cells: number, octaves = 4): (x: number, y: number) => number {
  const grids: Float32Array[] = [];
  const sizes: number[] = [];
  for (let o = 0; o < octaves; o++) {
    const c = cells * 2 ** o + 2;
    const g = new Float32Array(c * c);
    for (let i = 0; i < g.length; i++) g[i] = r();
    grids.push(g); sizes.push(c);
  }
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return (x, y) => {
    let v = 0, amp = 0.5, total = 0;
    for (let o = 0; o < grids.length; o++) {
      const c = sizes[o], g = grids[o];
      const fx = x * (c - 2), fy = y * (c - 2);
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      const at = (a: number, b: number) => g[Math.min(c - 1, b) * c + Math.min(c - 1, a)];
      v += lerp(lerp(at(x0, y0), at(x0 + 1, y0), tx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), ty), ty) * amp;
      total += amp; amp *= 0.5;
    }
    return v / total;
  };
}

export function synthPng(seed: string, w = 800, h = 600): Buffer {
  return memo(`png:${seed}:${w}x${h}`, () => {
    const r = rng(seed);
    const scene = Math.floor(r() * 4);
    const haze = fbm(r, 2, 4), detail = fbm(r, 5, 3);
    const warm = 0.6 + r() * 0.9;            // how warm the light is
    const dark = scene === 0 ? 0.55 : 0.85;  // evening or daylight
    const horizon = 0.42 + r() * 0.26;
    const lx = 0.2 + r() * 0.6, ly = 0.18 + r() * 0.4;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    const cx = 0.5, cy = 0.5;
    for (let y = 0; y < h; y++) {
      raw[y * (w * 3 + 1)] = 0;
      const ny = y / h;
      for (let x = 0; x < w; x++) {
        const nx = x / w;
        let lum: number, tint: number;
        if (scene === 0) {
          // water under an evening sky
          const toH = 1 - Math.min(1, Math.abs(ny - horizon) / 0.5);
          lum = 22 + 52 * toH + (ny > horizon ? -14 * ((ny - horizon) / (1 - horizon)) : 0);
          lum += Math.max(0, haze(nx, ny) - 0.35) * 70;
          lum += Math.exp(-(((nx - lx) ** 2) * 2.2 + (ny - ly) ** 2) / 0.02) * 60;
          tint = 0.75;
        } else if (scene === 1) {
          // a room with a window
          const win = Math.pow(Math.max(0, 1 - Math.abs(nx - lx) / 0.19) * Math.max(0, 1 - Math.abs(ny - ly) / 0.27), 1.5);
          lum = 26 + win * 185 + Math.exp(-(((nx - lx) ** 2) + (ny - ly) ** 2) / 0.24) * 54;
          lum *= 0.75 + detail(nx, ny) * 0.45;
          tint = 1.15;
        } else if (scene === 2) {
          // open sky over ground
          const sky = ny < horizon;
          lum = sky ? 120 + (1 - ny / horizon) * 72 : 58 + detail(nx, ny) * 60;
          lum += Math.max(0, haze(nx, ny * 1.6) - 0.4) * (sky ? 56 : 24);
          tint = sky ? 0.7 : 1.05;
        } else {
          // too close to the lens to make out
          const blob = Math.exp(-(((nx - lx) ** 2) + ((ny - ly) ** 2)) / 0.09);
          lum = 40 + blob * 120 + detail(nx, ny) * 70;
          tint = 1.0;
        }
        lum *= dark;
        const grain = (r() * 2 - 1) * 6.5;
        const vig = 1 - 0.46 * ((nx - cx) ** 2 + (ny - cy) ** 2) * 1.8;
        const o = y * (w * 3 + 1) + 1 + x * 3;
        // 0.13 here made the warm/cool cast a few pixel values wide at most - indistinguishable
        // from grayscale once JPEG-style grain and a vignette were on top of it. A photograph
        // needs the cast to actually read.
        const wr = 1 + 0.4 * (warm - 1) * tint, wb = 1 - 0.4 * (warm - 1) * tint;
        raw[o] = Math.max(0, Math.min(255, (lum * wr + grain) * vig));
        raw[o + 1] = Math.max(0, Math.min(255, (lum + grain) * vig));
        raw[o + 2] = Math.max(0, Math.min(255, (lum * wb + grain) * vig));
      }
    }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
  });
}

// ---------- pdf ----------
/**
 * A filler PDF that reads as a document rather than as a blank page.
 *
 * It used to draw grey bars where text would be, which on screen is indistinguishable
 * from a viewer that has failed to load anything. Now it sets real type in Helvetica —
 * a heading, a date line and a few paragraphs of mundane text from lib/synthtext — so a
 * stray PDF on the desktop opens into something a person would recognise as a letter or
 * a statement. Deterministic, so a file reads the same every time it is opened.
 */
function pdfEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Break a line of text to a column width, measured in characters at the given point size. */
function wrap(text: string, cols: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    if (!para.trim()) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (line && (line + " " + word).length > cols) { out.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(line);
  }
  return out;
}

export function synthPdf(seed: string, pages = 1, text?: string): Buffer {
  return memo(`pdf:${seed}:${pages}:${text ? text.length : 0}`, () => {
    const r = rng(seed);
    const name = seed.slice(seed.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Document";
    const dated = `${2024 + Math.floor(r() * 3)}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`;
    const lines = wrap(text ?? "", 88);
    const perPage = 44;

    const objs: string[] = [];
    const kids: number[] = [];
    let n = 4; // 1 catalog, 2 pages, 3 font
    for (let p = 0; p < pages; p++) {
      const pageId = n++, contentId = n++;
      kids.push(pageId);
      const body: string[] = ["0.99 0.99 0.98 rg 0 0 612 792 re f", "0.12 0.12 0.12 rg"];
      let y = 720;
      if (p === 0) {
        body.push(`BT /F1 17 Tf 72 ${y} Td (${pdfEscape(name)}) Tj ET`);
        y -= 26;
        body.push("0.42 0.42 0.42 rg", `BT /F1 9 Tf 72 ${y} Td (${pdfEscape(dated)}) Tj ET`, "0.12 0.12 0.12 rg");
        y -= 10;
        body.push(`0.80 0.80 0.80 RG 0.7 w 72 ${y} m 540 ${y} l S`);
        y -= 26;
      }
      const slice = lines.slice(p * perPage, (p + 1) * perPage);
      for (const line of slice) {
        if (y < 72) break;
        if (line) body.push(`BT /F1 10.5 Tf 72 ${y} Td (${pdfEscape(line)}) Tj ET`);
        y -= 15;
      }
      body.push("0.55 0.55 0.55 rg", `BT /F1 8 Tf 72 48 Td (Page ${p + 1} of ${pages}) Tj ET`);
      const content = body.join("\n");
      objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
      objs[contentId] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
    }
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objs[2] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

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
