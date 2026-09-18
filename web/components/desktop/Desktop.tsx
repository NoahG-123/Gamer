"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./Desktop.module.css";
import { WMProvider, useWM, AppId } from "./wm";
import { MenuProvider, useMenu } from "./ContextMenu";
import { Taskbar } from "./Taskbar";
import { StartMenu } from "./StartMenu";
import { OSProvider, OS } from "./os";
import { APP_COMPONENTS } from "./registry";
import { dialogForFile } from "./Dialogs";
import { api, Profile, VfsNode, useLiveEvents, LiveEvent } from "@/lib/client/api";
import { RecycleBinIcon, FileTypeIcon, ChromeIcon, WhatsAppIcon } from "@/components/icons/apps";
import { AssetsProvider, useAsset } from "@/lib/client/assets";
import { ViewIcon, Sort, Refresh, NewIcon, Display, Personalize, Terminal, ChevronRight } from "@/components/icons/fluent";

export default function Desktop() {
  return (
    <AssetsProvider>
      <WMProvider>
        <MenuProvider>
          <DesktopInner />
        </MenuProvider>
      </WMProvider>
    </AssetsProvider>
  );
}

function DesktopInner() {
  const wm = useWM();
  const menu = useMenu();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [home, setHome] = useState("");
  const [startOpen, setStartOpen] = useState(false);
  const [desktopItems, setDesktopItems] = useState<VfsNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const wallpaper = useAsset(profile?.wallpaper ?? "wallpaper.desktop");

  useEffect(() => { api.profile().then((d) => { setProfile(d.profile); setHome(d.home); }).catch(() => {}); }, []);
  useEffect(() => {
    if (!home) return;
    api.list(`${home}/Desktop`, { record: false }).then((d) => setDesktopItems(d.children.filter((c) => !c.hidden))).catch(() => {});
  }, [home, refreshTick]);

  const onLive = useCallback((ev: LiveEvent) => {
    if (ev.type === "fs.changed" || ev.type === "flag" || ev.type === "trigger.fired") setRefreshTick((t) => t + 1);
  }, []);
  useLiveEvents(onLive);

  const launch = useCallback((app: AppId, props?: Record<string, unknown>) => {
    api.event("app.opened", app).catch(() => {});
    if (app === "chrome") return wm.open("chrome", { singleton: true, props, w: Math.min(1366, window.innerWidth - 80), h: Math.min(860, window.innerHeight - 48 - 40) });
    if (app === "whatsapp") return wm.open("whatsapp", { singleton: true, props });
    if (app === "notepad") return wm.open("notepad", { props: { name: "Untitled", text: "", ...(props ?? {}) } });
    return wm.open(app, { props });
  }, [wm]);

  const openFile = useCallback(async (node: VfsNode) => {
    if (node.dir) { wm.open("explorer", { props: { path: node.path } }); return; }
    let res;
    try { res = await api.open(node.path); } catch { return; }
    if (res.openable) {
      if (res.viewer === "notepad") wm.open("notepad", { props: { name: node.name, text: res.text, path: node.path } });
      else launch("chrome", { openUrl: res.url, displayUrl: `file:///${node.path}`, title: node.name });
      return;
    }
    // Dressing text files open in Notepad (empty), everything else gets the OS's usual response.
    if (["txt", "log", "ini", "md", "csv", "srt"].includes(node.ext) || node.ext === "") {
      wm.open("notepad", { props: { name: node.name, text: "", path: node.path } });
      return;
    }
    const d = dialogForFile(node.name, node.ext);
    wm.open("dialog", { props: { kind: d.kind, name: node.name, ext: node.ext, path: node.path }, w: d.w, h: d.h, resizable: false });
  }, [wm, launch]);

  const openFolder = useCallback((path: string) => { wm.open("explorer", { props: { path } }); }, [wm]);
  const openUrl = useCallback((url: string) => { launch("chrome", { openUrl: url }); }, [launch]);

  const os = useMemo<OS | null>(() => profile ? { profile, home, launch, openFile, openFolder, openUrl, refreshTick } : null, [profile, home, launch, openFile, openFolder, openUrl, refreshTick]);

  // Close start menu on outside click; deselect desktop icons.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (startOpen && !t.closest("[data-startmenu]") && !t.closest("[data-start]")) setStartOpen(false);
      if (!t.closest("[data-desktop-icon]") && !t.closest("[data-menu-root]")) setSelected(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [startOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setStartOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const desktopMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-desktop-icon]")) return;
    e.preventDefault();
    menu.open({ x: e.clientX, y: e.clientY, items: [
      { label: "View", icon: <ViewIcon />, children: [{ label: "Large icons" }, { label: "Medium icons", checked: true }, { label: "Small icons" }, { type: "sep" }, { label: "Auto arrange icons" }, { label: "Align icons to grid", checked: true }, { type: "sep" }, { label: "Show desktop icons", checked: true }] },
      { label: "Sort by", icon: <Sort />, children: [{ label: "Name" }, { label: "Size" }, { label: "Item type" }, { label: "Date modified" }] },
      { label: "Refresh", icon: <Refresh />, onClick: () => setRefreshTick((t) => t + 1) },
      { type: "sep" },
      { label: "New", icon: <NewIcon />, children: [{ label: "Folder" }, { label: "Shortcut" }, { type: "sep" }, { label: "Bitmap image" }, { label: "Text Document" }, { label: "Compressed (zipped) Folder" }] },
      { type: "sep" },
      { label: "Display settings", icon: <Display /> },
      { label: "Personalize", icon: <Personalize /> },
      { type: "sep" },
      { label: "Open in Terminal", icon: <Terminal /> },
      { type: "sep" },
      { label: "Show more options", shortcut: "Shift+F10", icon: <ChevronRight style={{ visibility: "hidden" }} /> },
    ] });
  };

  const iconMenu = (e: React.MouseEvent, node: VfsNode | null) => {
    e.preventDefault(); e.stopPropagation();
    setSelected(node ? node.path : "recycle-bin");
    if (!node) {
      menu.open({ x: e.clientX, y: e.clientY, items: [{ label: "Open" }, { label: "Empty Recycle Bin", disabled: profile?.recycleBinEmpty }, { type: "sep" }, { label: "Pin to Start" }, { type: "sep" }, { label: "Create shortcut" }, { label: "Rename" }, { label: "Properties" }] });
      return;
    }
    menu.open({ x: e.clientX, y: e.clientY, items: [
      { label: "Open", onClick: () => openFile(node) },
      { label: "Open with", children: [{ label: "Choose another app" }] },
      { type: "sep" },
      { label: "Cut", shortcut: "Ctrl+X" }, { label: "Copy", shortcut: "Ctrl+C" },
      { type: "sep" },
      { label: "Create shortcut" }, { label: "Delete", shortcut: "Del" }, { label: "Rename", shortcut: "F2" },
      { type: "sep" },
      { label: "Properties", shortcut: "Alt+Enter" },
    ] });
  };

  if (!profile || !os) return <div className={styles.desktop} data-theme="dark" style={{ backgroundImage: wallpaper ? `url(${wallpaper})` : undefined }} />;

  const iconFor = (n: VfsNode) => {
    if (n.ext === "lnk" && /chrome/i.test(n.name)) return <ChromeIcon size={48} />;
    if (n.ext === "lnk" && /whatsapp/i.test(n.name)) return <WhatsAppIcon size={48} />;
    return <FileTypeIcon ext={n.ext} dir={n.dir} name={n.name} size={48} />;
  };
  const label = (n: VfsNode) => (n.ext === "lnk" || n.ext === "url" ? n.name.replace(/\.(lnk|url)$/i, "") : n.name);

  return (
    <OSProvider value={os}>
      <div className={styles.desktop} data-theme={profile.theme ?? "dark"} style={{ backgroundImage: wallpaper ? `url(${wallpaper})` : undefined, ...(profile.theme === "light" ? { ["--accent" as string]: profile.accentColor } : {}) }} onContextMenu={desktopMenu} data-desktop>
        <div className={styles.icons}>
          <button data-desktop-icon className={`${styles.icon} ${selected === "recycle-bin" ? styles.iconSel : ""}`} onClick={() => setSelected("recycle-bin")} onDoubleClick={() => openFolder("Recycle Bin")} onContextMenu={(e) => iconMenu(e, null)}>
            <span className={styles.iconImg}><RecycleBinIcon size={48} full={!profile.recycleBinEmpty} /></span>
            <span className={styles.iconLabel}>Recycle Bin</span>
          </button>
          {desktopItems.map((n) => (
            <button key={n.path} data-desktop-icon className={`${styles.icon} ${selected === n.path ? styles.iconSel : ""}`} onClick={() => setSelected(n.path)} onDoubleClick={() => openFile(n)} onContextMenu={(e) => iconMenu(e, n)}>
              <span className={styles.iconImg}>{iconFor(n)}</span>
              <span className={styles.iconLabel}>{label(n)}</span>
            </button>
          ))}
        </div>
        <div className={styles.windows}>
          {wm.windows.map((w) => { const C = APP_COMPONENTS[w.app]; return <C key={w.id} win={w} />; })}
        </div>
        <StartMenu open={startOpen} displayName={profile.displayName} onLaunch={(a) => launch(a)} onOpenFile={openFile} onClose={() => setStartOpen(false)} />
        <Taskbar profile={profile} pins={profile.taskbarPins as AppId[]} startOpen={startOpen} onToggleStart={() => setStartOpen((s) => !s)} onLaunch={(a) => launch(a)} onShowDesktop={() => wm.windows.forEach((w) => wm.minimize(w.id))} />
      </div>
    </OSProvider>
  );
}
