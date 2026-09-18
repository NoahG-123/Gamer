import { contextBridge, ipcRenderer } from "electron";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? "";

contextBridge.exposeInMainWorld("__host", {
  isElectron: true,
  platform: process.platform,
  serverOrigin: arg("found-origin"),
  webviewPartition: arg("found-partition") || "persist:browser",
  quit: () => ipcRenderer.send("quit"),
  toggleDevTools: () => ipcRenderer.send("toggle-devtools"),
  onOpenTab: (cb: (url: string) => void) => {
    const handler = (_e: unknown, url: string) => cb(url);
    ipcRenderer.on("open-tab", handler);
    return () => ipcRenderer.removeListener("open-tab", handler);
  },
});
