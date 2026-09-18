"use client";
import React, { createContext, useContext, useEffect, useState } from "react";

export interface ClientAsset { key: string; kind: string; url: string | null; exists: boolean; placeholder?: string; value?: string }
type AssetMap = Record<string, ClientAsset>;
const Ctx = createContext<AssetMap>({});

/** Loads the resolved asset manifest once and exposes it to every component. */
export function AssetsProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<AssetMap>({});
  useEffect(() => { fetch("/api/assets", { cache: "no-store" }).then((r) => r.json()).then((d) => setAssets(d.assets ?? {})).catch(() => {}); }, []);
  return <Ctx.Provider value={assets}>{children}</Ctx.Provider>;
}

export function useAssets(): AssetMap { return useContext(Ctx); }
/** URL for a manifest key, or null when the image is absent (person slots) / unknown. */
export function useAsset(key: string): string | null { return useContext(Ctx)[key]?.url ?? null; }
