/** Bridge to the Electron preload. Falls back to no-ops when opened in a plain browser (used for UI testing). */
export interface HostBridge {
  isElectron: boolean;
  serverOrigin: string;
  platform: string;
  quit: () => void;
  webviewPartition: string;
  toggleDevTools?: () => void;
  /** Tell the shell whether this computer's Wi-Fi is on. */
  setNetwork?: (online: boolean) => void;
  /** Open devtools on a browser tab (Chrome's Inspect). */
  tabDevTools?: (webContentsId: number) => Promise<boolean>;
}

declare global {
  interface Window { __host?: Partial<HostBridge> }
}

export function host(): HostBridge {
  const h = typeof window !== "undefined" ? window.__host : undefined;
  return {
    isElectron: !!h?.isElectron,
    serverOrigin: h?.serverOrigin ?? (typeof location !== "undefined" ? location.origin : ""),
    platform: h?.platform ?? "win32",
    quit: h?.quit ?? (() => {}),
    webviewPartition: h?.webviewPartition ?? "persist:browser",
    toggleDevTools: h?.toggleDevTools,
    setNetwork: h?.setNetwork,
    tabDevTools: h?.tabDevTools,
  };
}
