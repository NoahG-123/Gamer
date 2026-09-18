import fs from "node:fs";
import path from "node:path";
import { loadContent, contentPath } from "./content";

export interface AssetEntry { kind: "stock" | "generated" | "person" | "text"; file?: string; fallback?: string; optional?: boolean; placeholder?: "silhouette" | "group" | "none"; value?: string; pexels?: { query: string; orientation?: string; size?: string } }
interface ManifestFile { assets: Record<string, AssetEntry> }
export interface ResolvedAsset { key: string; kind: AssetEntry["kind"]; url: string | null; exists: boolean; placeholder?: string; value?: string }

export function assetsRoot(): string { return contentPath("assets"); }

function safeJoin(rel: string): string | null {
  const full = path.resolve(assetsRoot(), rel);
  return full.startsWith(path.resolve(assetsRoot())) ? full : null;
}

/** Resolve every manifest entry to a URL the UI can use (or null when a person image is absent). */
export function resolveAssets(): Record<string, ResolvedAsset> {
  const { assets } = loadContent<ManifestFile>("assets.json");
  const out: Record<string, ResolvedAsset> = {};
  for (const [key, a] of Object.entries(assets)) {
    if (a.kind === "text") { out[key] = { key, kind: a.kind, url: null, exists: true, value: a.value ?? "" }; continue; }
    const primary = a.file ? safeJoin(a.file) : null;
    const exists = !!primary && fs.existsSync(primary);
    let url: string | null = exists && a.file ? `/assets/${a.file}` : null;
    if (!url && a.fallback) { const fb = safeJoin(a.fallback); if (fb && fs.existsSync(fb)) url = `/assets/${a.fallback}`; }
    out[key] = { key, kind: a.kind, url, exists, placeholder: a.placeholder };
  }
  return out;
}

export function assetFilePath(rel: string): string | null {
  const full = safeJoin(rel);
  return full && fs.existsSync(full) && fs.statSync(full).isFile() ? full : null;
}
