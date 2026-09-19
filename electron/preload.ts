import { contextBridge, ipcRenderer } from "electron";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? "";

contextBridge.exposeInMainWorld("__host", {
  isElectron: true,
  platform: process.platform,
  serverOrigin: arg("found-origin"),
  webviewPartition: arg("found-partition") || "persist:browser",
  quit: () => ipcRenderer.send("quit"),
  setNetwork: (online: boolean) => ipcRenderer.send("net-state", online),
  tabDevTools: (webContentsId: number) => ipcRenderer.invoke("tab-devtools", webContentsId),
  toggleDevTools: () => ipcRenderer.send("toggle-devtools"),
  onOpenTab: (cb: (url: string) => void) => {
    const handler = (_e: unknown, url: string) => cb(url);
    ipcRenderer.on("open-tab", handler);
    return () => ipcRenderer.removeListener("open-tab", handler);
  },
  /** Chrome shortcuts pressed while a page had focus, lifted out of the guest. */
  onChromeShortcut: (cb: (name: string) => void) => {
    const handler = (_e: unknown, name: string) => cb(name);
    ipcRenderer.on("chrome-shortcut", handler);
    return () => ipcRenderer.removeListener("chrome-shortcut", handler);
  },
});
