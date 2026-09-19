import fs from "node:fs";
import path from "node:path";
import { loadContent, contentPath } from "./content";
import { dataDir } from "./paths";

export interface AssetEntry { kind: "stock" | "generated" | "person" | "text"; file?: string; fallback?: string; optional?: boolean; placeholder?: "silhouette" | "group" | "none"; value?: string; title?: string; wallpaper?: boolean; pexels?: { query: string; orientation?: string; size?: string; index?: number }; openai?: { prompt: string; size?: "1024x1024" | "1536x1024" | "1024x1536"; quality?: string } }
interface ManifestFile { assets: Record<string, AssetEntry> }
export interface ResolvedAsset { key: string; kind: AssetEntry["kind"]; url: string | null; exists: boolean; placeholder?: string; value?: string; title?: string; wallpaper?: boolean }

export function assetsRoot(): string { return contentPath("assets"); }
/** Images fetched at runtime live here, so a read-only install folder is not a problem. */
export function assetsWritableRoot(): string { return path.join(dataDir(), "assets"); }

function safeJoin(rel: string): string | null {
  const full = path.resolve(assetsRoot(), rel);
  return full.startsWith(path.resolve(assetsRoot())) ? full : null;
}
function safeJoinWritable(rel: string): string | null {
  const root = path.resolve(assetsWritableRoot());
  const full = path.resolve(root, rel);
  return full.startsWith(root) ? full : null;
}
/** Where an asset actually is: the folder it was fetched into, else the one it shipped in. */
export function locateAsset(rel: string): string | null {
  const w = safeJoinWritable(rel);
  if (w && fs.existsSync(w) && fs.statSync(w).isFile()) return w;
  const c = safeJoin(rel);
  return c && fs.existsSync(c) && fs.statSync(c).isFile() ? c : null;
}

/** Resolve every manifest entry to a URL the UI can use (or null when a person image is absent). */
export function resolveAssets(): Record<string, ResolvedAsset> {
  const { assets } = loadContent<ManifestFile>("assets.json");
  const out: Record<string, ResolvedAsset> = {};
  for (const [key, a] of Object.entries(assets)) {
    if (a.kind === "text") { out[key] = { key, kind: a.kind, url: null, exists: true, value: a.value ?? "" }; continue; }
    const exists = !!a.file && !!locateAsset(a.file);
    let url: string | null = exists && a.file ? `/assets/${a.file}` : null;
    if (!url && a.fallback && locateAsset(a.fallback)) url = `/assets/${a.fallback}`;
    out[key] = { key, kind: a.kind, url, exists, placeholder: a.placeholder, title: a.title, wallpaper: a.wallpaper };
  }
  return out;
}

export function assetFilePath(rel: string): string | null {
  return locateAsset(rel);
}
