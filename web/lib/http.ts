import { NextResponse } from "next/server";

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
export const bad = (message: string, status = 400) => json({ error: message }, { status });

export const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8", txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8", log: "text/plain; charset=utf-8", ini: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon", bmp: "image/bmp", avif: "image/avif",
  pdf: "application/pdf", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", xml: "application/xml",
};
export const mimeFor = (name: string) => MIME[name.slice(name.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";
