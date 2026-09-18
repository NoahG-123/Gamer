"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./Desktop.module.css";
import { WMProvider, useWM, AppId } from "./wm";
import { MenuProvider, useMenu } from "./ContextMenu";
import { Taskbar, Panel } from "./Taskbar";
import { StartMenu } from "./StartMenu";
import { OSProvider, OS } from "./os";
import { APP_COMPONENTS } from "./registry";
import { dialogForFile } from "./Dialogs";
import { SearchPanel, TaskViewPanel, NotificationPanel, WidgetsPanel, AppEntry } from "./Panels";
import { api, Profile, VfsNode, OpenResult, OpenWith, useLiveEvents, LiveEvent } from "@/lib/client/api";
import { RecycleBinIcon, FileTypeIcon, ChromeIcon, WhatsAppIcon, TerminalAppIcon } from "@/components/icons/apps";
import { Toasts, Toast } from "./Toasts";
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
  const [panel, setPanel] = useState<Panel>(null);
  const [searchInitial, setSearchInitial] = useState("");
  const [desktopItems, setDesktopItems] = useState<VfsNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [history, setHistory] = useState<Toast[]>([]);
  const [seenNotif, setSeenNotif] = useState(0);
  const wallpaper = useAsset(profile?.wallpaper ?? "wallpaper.desktop");

  useEffect(() => { api.profile().then((d) => { setProfile(d.profile); setHome(d.home); }).catch(() => {}); }, []);
  useEffect(() => {
    if (!home) return;
    api.list(`${home}/Desktop`, { record: false }).then((d) => setDesktopItems(d.children.filter((c) => !c.hidden))).catch(() => {});
  }, [home, refreshTick]);

  const launch = useCallback((app: AppId, props?: Record<string, unknown>) => {
    api.event("app.opened", app).catch(() => {});
    if (app === "chrome") return wm.open("chrome", { singleton: true, props: { ...(props ?? {}), nonce: Date.now() }, w: Math.min(1366, window.innerWidth - 80), h: Math.min(860, window.innerHeight - 48 - 40) });
    if (app === "whatsapp") return wm.open("whatsapp", { singleton: true, props: { ...(props ?? {}), nonce: Date.now() } });
    if (app === "notepad") return wm.open("notepad", { props: { name: "Untitled", text: "", ...(props ?? {}) } });
    if (app === "terminal") return wm.open("terminal", { props: { ...(props ?? {}) }, ...(props?.small ? { w: 720, h: 380, x: Math.round(window.innerWidth * 0.55), y: Math.round(window.innerHeight * 0.55) } : {}) });
    return wm.open(app, { props });
  }, [wm]);

  const onLive = useCallback((ev: LiveEvent) => {
    if (ev.type === "fs.changed" || ev.type === "flag" || ev.type === "trigger.fired") setRefreshTick((t) => t + 1);
    if (ev.type === "ui.open") launch(String(ev.app) as AppId, (ev.props as Record<string, unknown>) ?? {});
    if (ev.type === "ui.notify") {
      const t: Toast = { id: Date.now() + Math.random(), app: String(ev.app), title: String(ev.title), text: String(ev.text), props: (ev.props as Record<string, unknown>) ?? {}, at: Date.now() };
      setToasts((x) => [...x, t]);
      setHistory((x) => [...x.slice(-49), t]);
    }
  }, [launch]);
  useLiveEvents(onLive);

  const openToast = useCallback((t: Toast) => {
    if (t.app === "whatsapp") launch("whatsapp", { chatId: t.props.chatId });
    else if (t.app === "mail" || t.app === "chrome") launch("chrome", { openUrl: String(t.props.url ?? "https://mail.google.com/mail/u/0/#inbox") });
    else if (t.app === "explorer") launch("explorer", { path: t.props.path });
    else if (t.app === "terminal") launch("terminal", t.props);
  }, [launch]);

  /** Route an open result to the right app. Every openable file ends up somewhere visible. */
  const showOpen = useCallback((res: OpenResult, node: VfsNode) => {
    if (!res.openable) {
      const d = dialogForFile(node.name, node.ext);
      wm.open("dialog", { props: { kind: d.kind, name: node.name, ext: node.ext, path: node.path }, w: d.w, h: d.h, resizable: false });
      return;
    }
    if (res.viewer === "notepad") { wm.open("notepad", { props: { name: node.name, text: res.text, path: node.path } }); return; }
    launch("chrome", { openUrl: res.url, displayUrl: `file:///${node.path}`, title: node.name });
  }, [wm, launch]);

  const openFile = useCallback(async (node: VfsNode) => {
    if (node.dir) { wm.open("explorer", { props: { path: node.path } }); return; }
    // Shortcuts to the apps that exist launch them; any other shortcut is a broken .lnk.
    if (node.ext === "lnk" || node.ext === "url") {
      const n = node.name.toLowerCase();
      const target: AppId | null = /chrome/.test(n) ? "chrome" : /whatsapp/.test(n) ? "whatsapp" : /notepad/.test(n) ? "notepad" : /terminal|powershell/.test(n) ? "terminal" : /(desktop|downloads|documents|explorer)/.test(n) ? "explorer" : null;
      if (target) { api.event("file.opened", node.path).catch(() => {}); launch(target); return; }
    }
    let res: OpenResult;
    try { res = await api.open(node.path); } catch { res = { openable: false, node }; }
    showOpen(res, node);
  }, [wm, launch, showOpen]);

  const openWith = useCallback(async (path: string, app: OpenWith) => {
    let res: OpenResult;
    try { res = await api.open(path, app); } catch { return; }
    showOpen(res, res.node);
  }, [showOpen]);

  const openFolder = useCallback((path: string) => { wm.open("explorer", { props: { path } }); }, [wm]);
  const openUrl = useCallback((url: string) => { launch("chrome", { openUrl: url }); }, [launch]);
  const launchEntry = useCallback((a: AppEntry) => { if (a.app) launch(a.app, a.url ? { openUrl: a.url } : undefined); }, [launch]);

  const os = useMemo<OS | null>(() => profile ? { profile, home, launch, openFile, openWith, openFolder, openUrl, refreshTick } : null, [profile, home, launch, openFile, openWith, openFolder, openUrl, refreshTick]);

  // Close any flyout on outside click; deselect desktop icons.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (panel && !t.closest("[data-startmenu],[data-start],[data-search],[data-search-btn],[data-taskview-btn],[data-notif],[data-notif-btn],[data-widgets],[data-widgets-btn],[data-menu-root]")) setPanel(null);
      if (!t.closest("[data-desktop-icon]") && !t.closest("[data-menu-root]")) setSelected(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [panel]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(null);
      // Win key (Meta) toggles Start; Win+S opens Search.
      if (e.key === "Meta" && !e.repeat) { e.preventDefault(); setPanel((p) => (p === "start" ? null : "start")); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (panel === "notif") setSeenNotif(history.length); }, [panel, history.length]);

  const desktopMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-desktop-icon]")) return;
    e.preventDefault();
    menu.open({ x: e.clientX, y: e.clientY, items: [
      { label: "View", icon: <ViewIcon />, children: [{ label: "Large icons" }, { label: "Medium icons", checked: true }, { label: "Small icons" }, { type: "sep" }, { label: "Auto arrange icons" }, { label: "Align icons to grid", checked: true }, { type: "sep" }, { label: "Show desktop icons", checked: true }] },
      { label: "Sort by", icon: <Sort />, children: [{ label: "Name" }, { label: "Size" }, { label: "Item type" }, { label: "Date modified" }] },
      { label: "Refresh", icon: <Refresh />, onClick: () => setRefreshTick((t) => t + 1) },
      { type: "sep" },
      { label: "New", icon: <NewIcon />, children: [{ label: "Folder" }, { label: "Shortcut" }, { type: "sep" }, { label: "Bitmap image" }, { label: "Text Document", onClick: () => launch("notepad", { name: "New Text Document.txt", text: "" }) }, { label: "Compressed (zipped) Folder" }] },
      { type: "sep" },
      { label: "Display settings", icon: <Display /> },
      { label: "Personalize", icon: <Personalize /> },
      { type: "sep" },
      { label: "Open in Terminal", icon: <Terminal />, onClick: () => launch("terminal", { cwd: `${home}/Desktop` }) },
      { type: "sep" },
      { label: "Show more options", shortcut: "Shift+F10", icon: <ChevronRight style={{ visibility: "hidden" }} /> },
    ] });
  };

  const iconMenu = (e: React.MouseEvent, node: VfsNode | null) => {
    e.preventDefault(); e.stopPropagation();
    setSelected(node ? node.path : "recycle-bin");
    if (!node) {
      menu.open({ x: e.clientX, y: e.clientY, items: [{ label: "Open", onClick: () => openFolder("Recycle Bin") }, { label: "Empty Recycle Bin", disabled: profile?.recycleBinEmpty }, { type: "sep" }, { label: "Pin to Start" }, { type: "sep" }, { label: "Create shortcut" }, { label: "Rename" }, { label: "Properties" }] });
      return;
    }
    menu.open({ x: e.clientX, y: e.clientY, items: [
      { label: "Open", onClick: () => openFile(node) },
      { label: "Open with", children: [
        { label: "Notepad", onClick: () => openWith(node.path, "notepad") },
        { label: "Google Chrome", onClick: () => openWith(node.path, "chrome") },
        { label: "VLC media player", onClick: () => openWith(node.path, "player") },
        { label: "Photos", onClick: () => openWith(node.path, "image") },
        { type: "sep" },
        { label: "Choose another app", onClick: () => { const d = dialogForFile(node.name, node.ext); wm.open("dialog", { props: { kind: "open-with", name: node.name, ext: node.ext, path: node.path }, w: d.w, h: 560, resizable: false }); } },
      ] },
      { label: "Open in Terminal", onClick: () => launch("terminal", { cwd: node.path.slice(0, node.path.lastIndexOf("/")) }) },
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
    if (n.ext === "lnk" && /terminal|powershell/i.test(n.name)) return <TerminalAppIcon size={48} />;
    return <FileTypeIcon ext={n.ext} dir={n.dir} name={n.name} size={48} />;
  };
  const label = (n: VfsNode) => (n.ext === "lnk" || n.ext === "url" ? n.name.replace(/\.(lnk|url)$/i, "") : n.name);
  const weather = profile.weather ?? { temp: 21, text: "Partly cloudy", icon: "sun-behind-cloud" };

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
        <TaskViewPanel open={panel === "taskview"} onClose={() => setPanel(null)} />
        <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} onOpen={openToast} />
        <StartMenu open={panel === "start"} displayName={profile.displayName} onLaunch={(a, p) => launch(a, p)} onOpenFile={openFile} onClose={() => setPanel(null)} onSearch={(q) => { setSearchInitial(q); setPanel("search"); }} />
        <SearchPanel open={panel === "search"} initial={searchInitial} onClose={() => { setPanel(null); setSearchInitial(""); }} onLaunch={launchEntry} onOpenFile={openFile} onOpenUrl={openUrl} />
        <NotificationPanel open={panel === "notif"} onClose={() => setPanel(null)} history={history} onOpen={openToast} onClear={() => { setHistory([]); setSeenNotif(0); }} />
        <WidgetsPanel open={panel === "widgets"} weather={weather} unit={profile.tempUnit ?? "C"} onOpenUrl={(u) => { setPanel(null); openUrl(u); }} />
        <Taskbar profile={profile} pins={profile.taskbarPins as AppId[]} panel={panel} onPanel={(p) => { if (p === "search") setSearchInitial(""); setPanel(p); }} onLaunch={(a) => { setPanel(null); launch(a); }} onShowDesktop={() => { setPanel(null); wm.windows.forEach((w) => wm.minimize(w.id)); }} unreadCount={Math.max(0, history.length - seenNotif)} />
      </div>
    </OSProvider>
  );
}
