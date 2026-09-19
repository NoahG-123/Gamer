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
import { SearchPanel, TaskViewPanel, NotificationPanel, WidgetsPanel, QuickSettingsPanel, AppEntry } from "./Panels";
import { api, Profile, VfsNode, OpenResult, OpenWith, useLiveEvents, LiveEvent } from "@/lib/client/api";
import { RecycleBinIcon, FileTypeIcon, ChromeIcon, WhatsAppIcon, TerminalAppIcon } from "@/components/icons/apps";
import { Toasts, Toast } from "./Toasts";
import { AssetsProvider, useAssets } from "@/lib/client/assets";
import { host } from "@/lib/client/host";
import { SystemProvider, useSystem } from "@/lib/client/system";
import { RenameDialog, ConfirmDialog } from "./Prompts";
import { LockScreen } from "./LockScreen";
import { ViewIcon, Sort, Refresh, NewIcon, Display, Personalize, Terminal, ChevronRight } from "@/components/icons/fluent";

export default function Desktop() {
  return (
    <AssetsProvider>
      <SystemProvider>
        <WMProvider>
          <MenuProvider>
            <DesktopInner />
          </MenuProvider>
        </WMProvider>
      </SystemProvider>
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
  // The desktop's own View and Sort by, which really do change what is on the desktop.
  const [iconSize, setIconSize] = useState<"large" | "medium" | "small">("medium");
  const [iconSort, setIconSort] = useState<"name" | "size" | "type" | "modified">("name");
  const [showIcons, setShowIcons] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [history, setHistory] = useState<Toast[]>([]);
  const [seenNotif, setSeenNotif] = useState(0);
  const [renaming, setRenaming] = useState<VfsNode | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; text: string; ok: string; onOk: () => void } | null>(null);
  const [clipboard, setClipboard] = useState<{ paths: string[]; move: boolean } | null>(null);
  const [locked, setLocked] = useState(false);
  const sys = useSystem();
  const assets = useAssets();
  const wallpaperKey = sys.settings.wallpaper ?? profile?.wallpaper ?? "wallpaper.desktop";
  const wallpaper = /^[A-Za-z]:\//.test(wallpaperKey) ? `/lf/${encodeURIComponent(wallpaperKey).replace(/%2F/g, "/")}` : assets[wallpaperKey]?.url ?? null;

  useEffect(() => { api.profile().then((d) => { setProfile(d.profile); setHome(d.home); }).catch(() => {}); }, []);
  // The shell blocks or allows network traffic to match this computer's Wi-Fi setting.
  useEffect(() => { host().setNetwork?.(sys.online); }, [sys.online]);
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
    // Something on this machine opened up that was not open before.
    if (ev.type === "fs.changed" && ev.reason === "revealed") sys.play("discovery");
    if (ev.type === "contact.unlocked") sys.play("unlock");
    if (ev.type === "ui.open") launch(String(ev.app) as AppId, (ev.props as Record<string, unknown>) ?? {});
    if (ev.type === "ui.notify") {
      const t: Toast = { id: Date.now() + Math.random(), app: String(ev.app), title: String(ev.title), text: String(ev.text), props: (ev.props as Record<string, unknown>) ?? {}, at: Date.now() };
      setToasts((x) => [...x, t]);
      setHistory((x) => [...x.slice(-49), t]);
      // A muted chat still arrives; it just doesn't make a sound.
      const chatId = typeof t.props.chatId === "string" ? t.props.chatId : null;
      const silenced = t.app === "whatsapp" && (sys.settings.waSounds === false || !!(chatId && sys.settings.chatFlags?.[chatId]?.muted));
      if (!silenced) sys.play(t.app === "whatsapp" ? "message" : "notify");
    }
  }, [launch, sys]);
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
    // Pictures open in Photos, the way they do on Windows; everything else opens in the browser.
    if (res.kind === "image") { launch("photos", { path: node.path, nonce: Date.now() }); return; }
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
  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  const fsOps = useMemo(() => ({
    create: async (parent: string, kind: "text" | "folder") => { const r = await api.create(parent, kind); refresh(); return r.node; },
    rename: (node: VfsNode) => setRenaming(node),
    remove: async (paths: string[], permanent = false) => {
      if (permanent) {
        setConfirm({ title: "Delete File", text: `Are you sure you want to permanently delete ${paths.length === 1 ? `this file? ${paths[0].split("/").pop()}` : `these ${paths.length} items?`}`, ok: "Yes", onOk: async () => { await api.remove(paths, true); sys.play("empty-bin"); refresh(); } });
        return;
      }
      await api.remove(paths, false); sys.play("click"); refresh();
    },
    copy: (paths: string[], move = false) => setClipboard({ paths, move }),
    paste: async (dest: string) => { if (!clipboard) return; await api.paste(clipboard.paths, dest, clipboard.move); if (clipboard.move) setClipboard(null); refresh(); },
    clipboard,
    setWallpaper: (path: string) => { sys.set({ wallpaper: path }); sys.play("click"); },
    confirm: (opts: { title: string; text: string; ok: string; onOk: () => void }) => setConfirm(opts),
    refresh,
  }), [clipboard, refresh, sys]);
  const openUrl = useCallback((url: string) => { launch("chrome", { openUrl: url }); }, [launch]);
  const launchEntry = useCallback((a: AppEntry) => { if (a.app) launch(a.app, a.url ? { openUrl: a.url } : a.page ? { page: a.page } : undefined); }, [launch]);

  const os = useMemo<OS | null>(() => profile ? { profile, home, launch, openFile, openWith, openFolder, openUrl, refreshTick, fs: fsOps } : null, [profile, home, launch, openFile, openWith, openFolder, openUrl, refreshTick, fsOps]);

  const ICON_PX = { large: 64, medium: 48, small: 32 } as const;
  const ICON_BOX = { large: 100, medium: 76, small: 60 } as const;
  const sortedIcons = useMemo(() => {
    const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    return [...desktopItems].sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      if (iconSort === "size") return a.size - b.size;
      if (iconSort === "modified") return b.modified.localeCompare(a.modified);
      if (iconSort === "type") return collator.compare(a.ext, b.ext) || collator.compare(a.name, b.name);
      return collator.compare(a.name, b.name);
    });
  }, [desktopItems, iconSort]);

  // Close any flyout on outside click; deselect desktop icons.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (panel && !t.closest("[data-startmenu],[data-start],[data-search],[data-search-btn],[data-taskview-btn],[data-notif],[data-notif-btn],[data-widgets],[data-widgets-btn],[data-quicksettings],[data-quick-btn],[data-menu-root]")) setPanel(null);
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
      if (e.ctrlKey && e.shiftKey && e.key === "Escape") { e.preventDefault(); launch("taskmgr"); }
      if (e.metaKey && e.key.toLowerCase() === "i") { e.preventDefault(); launch("settings"); }
      if (e.metaKey && e.key.toLowerCase() === "a") { e.preventDefault(); setPanel((p) => (p === "quick" ? null : "quick")); }
      if (e.metaKey && e.key.toLowerCase() === "l") { e.preventDefault(); setPanel(null); setLocked(true); }
      if (e.metaKey && e.key.toLowerCase() === "e") { e.preventDefault(); launch("explorer"); }
      if (e.metaKey && e.key.toLowerCase() === "d") { e.preventDefault(); wm.windows.forEach((w) => wm.minimize(w.id)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [launch]);
  useEffect(() => { if (panel === "notif") setSeenNotif(history.length); }, [panel, history.length]);

  const desktopMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-desktop-icon]")) return;
    e.preventDefault();
    menu.open({ x: e.clientX, y: e.clientY, items: [
      { label: "View", icon: <ViewIcon />, children: [
        { label: "Large icons", checked: iconSize === "large", onClick: () => setIconSize("large") },
        { label: "Medium icons", checked: iconSize === "medium", onClick: () => setIconSize("medium") },
        { label: "Small icons", checked: iconSize === "small", onClick: () => setIconSize("small") },
        { type: "sep" },
        { label: "Show desktop icons", checked: showIcons, onClick: () => setShowIcons((v) => !v) },
      ] },
      { label: "Sort by", icon: <Sort />, children: [
        { label: "Name", checked: iconSort === "name", onClick: () => setIconSort("name") },
        { label: "Size", checked: iconSort === "size", onClick: () => setIconSort("size") },
        { label: "Item type", checked: iconSort === "type", onClick: () => setIconSort("type") },
        { label: "Date modified", checked: iconSort === "modified", onClick: () => setIconSort("modified") },
      ] },
      { label: "Refresh", icon: <Refresh />, onClick: () => setRefreshTick((t) => t + 1) },
      { type: "sep" },
      { label: "New", icon: <NewIcon />, children: [
        { label: "Folder", onClick: () => void fsOps.create(`${home}/Desktop`, "folder") },
        { label: "Shortcut", disabled: true },
        { type: "sep" },
        { label: "Text Document", onClick: () => void fsOps.create(`${home}/Desktop`, "text") },
      ] },
      ...(clipboard ? [{ label: "Paste", icon: <NewIcon />, onClick: () => void fsOps.paste(`${home}/Desktop`) } as const] : []),
      { type: "sep" },
      { label: "Display settings", icon: <Display />, onClick: () => launch("settings", { page: "system" }) },
      { label: "Personalize", icon: <Personalize />, onClick: () => launch("settings", { page: "personalisation" }) },
      { type: "sep" },
      { label: "Open in Terminal", icon: <Terminal />, onClick: () => launch("terminal", { cwd: `${home}/Desktop` }) },
    ] });
  };

  const iconMenu = (e: React.MouseEvent, node: VfsNode | null) => {
    e.preventDefault(); e.stopPropagation();
    setSelected(node ? node.path : "recycle-bin");
    if (!node) {
      menu.open({ x: e.clientX, y: e.clientY, items: [
        { label: "Open", onClick: () => openFolder("Recycle Bin") },
        { label: "Empty Recycle Bin", onClick: () => setConfirm({ title: "Delete Multiple Items", text: "Are you sure you want to permanently delete these items?", ok: "Yes", onOk: async () => { await api.emptyBin(); sys.play("empty-bin"); refresh(); } }) },
        { type: "sep" },
        { label: "Properties", onClick: () => wm.open("dialog", { props: { kind: "properties", name: "Recycle Bin", ext: "", path: "shell:RecycleBinFolder" }, w: 400, h: 520, resizable: false }) },
      ] });
      return;
    }
    menu.open({ x: e.clientX, y: e.clientY, items: [
      { label: "Open", onClick: () => openFile(node) },
      { label: "Open with", children: [
        { label: "Notepad", onClick: () => openWith(node.path, "notepad") },
        { label: "Google Chrome", onClick: () => openWith(node.path, "chrome") },
        { label: "Photos", onClick: () => launch("photos", { path: node.path, nonce: Date.now() }) },
        { label: "Paint", onClick: () => launch("paint", { path: node.path, nonce: Date.now() }) },
        { label: "REAPER", onClick: () => launch("audio", { path: node.path, nonce: Date.now() }) },
        { label: "Windows Media Player", onClick: () => openWith(node.path, "player") },
        { type: "sep" },
        { label: "Choose another app", onClick: () => { const d = dialogForFile(node.name, node.ext); wm.open("dialog", { props: { kind: "open-with", name: node.name, ext: node.ext, path: node.path }, w: d.w, h: 560, resizable: false }); } },
      ] },
      { label: "Open in Terminal", onClick: () => launch("terminal", { cwd: node.path.slice(0, node.path.lastIndexOf("/")) }) },
      { type: "sep" },
      { label: "Cut", shortcut: "Ctrl+X", onClick: () => fsOps.copy([node.path], true) },
      { label: "Copy", shortcut: "Ctrl+C", onClick: () => fsOps.copy([node.path]) },
      ...(/^(jpg|jpeg|png|bmp|webp|heic)$/.test(node.ext) ? [{ label: "Set as desktop background", onClick: () => fsOps.setWallpaper(node.path) } as const] : []),
      { type: "sep" },
      { label: "Delete", shortcut: "Del", onClick: () => void fsOps.remove([node.path]) },
      { label: "Rename", shortcut: "F2", onClick: () => fsOps.rename(node) },
      { type: "sep" },
      { label: "Properties", shortcut: "Alt+Enter", onClick: () => wm.open("dialog", { props: { kind: "properties", name: node.name, ext: node.ext, path: node.path, node }, w: 400, h: 520, resizable: false }) },
    ] });
  };

  if (!profile || !os) return <div className={styles.desktop} data-theme={sys.settings.theme} style={{ backgroundImage: wallpaper ? `url(${wallpaper})` : undefined }} />;

  const iconFor = (n: VfsNode, size = 48) => {
    if (n.ext === "lnk" && /chrome/i.test(n.name)) return <ChromeIcon size={size} />;
    if (n.ext === "lnk" && /whatsapp/i.test(n.name)) return <WhatsAppIcon size={size} />;
    if (n.ext === "lnk" && /terminal|powershell/i.test(n.name)) return <TerminalAppIcon size={size} />;
    return <FileTypeIcon ext={n.ext} dir={n.dir} name={n.name} size={size} />;
  };
  const label = (n: VfsNode) => (n.ext === "lnk" || n.ext === "url" ? n.name.replace(/\.(lnk|url)$/i, "") : n.name);
  const weather = profile.weather ?? { temp: 21, text: "Partly cloudy", icon: "sun-behind-cloud" };

  return (
    <OSProvider value={os}>
      <div
        className={styles.desktop}
        data-theme={sys.settings.theme}
        style={{
          backgroundImage: wallpaper ? `url(${wallpaper})` : undefined,
          backgroundSize: sys.settings.wallpaperFit === "fit" ? "contain" : sys.settings.wallpaperFit === "stretch" ? "100% 100%" : sys.settings.wallpaperFit === "tile" ? "auto" : sys.settings.wallpaperFit === "centre" ? "auto" : "cover",
          backgroundRepeat: sys.settings.wallpaperFit === "tile" ? "repeat" : "no-repeat",
          ["--accent" as string]: sys.settings.accent,
        }}
        onContextMenu={desktopMenu}
        data-desktop
      >
        {showIcons && <div className={styles.icons}>
          <button data-desktop-icon className={`${styles.icon} ${selected === "recycle-bin" ? styles.iconSel : ""}`} style={{ width: ICON_BOX[iconSize], height: ICON_BOX[iconSize] + 42 }} onClick={() => setSelected("recycle-bin")} onDoubleClick={() => openFolder("Recycle Bin")} onContextMenu={(e) => iconMenu(e, null)}>
            <span className={styles.iconImg} style={{ width: ICON_PX[iconSize], height: ICON_PX[iconSize] }}><RecycleBinIcon size={ICON_PX[iconSize]} full={!profile.recycleBinEmpty} /></span>
            <span className={styles.iconLabel}>Recycle Bin</span>
          </button>
          {sortedIcons.map((n) => (
            <button key={n.path} data-desktop-icon className={`${styles.icon} ${selected === n.path ? styles.iconSel : ""}`} style={{ width: ICON_BOX[iconSize], height: ICON_BOX[iconSize] + 42 }} onClick={() => setSelected(n.path)} onDoubleClick={() => openFile(n)} onContextMenu={(e) => iconMenu(e, n)}>
              <span className={styles.iconImg} style={{ width: ICON_PX[iconSize], height: ICON_PX[iconSize] }}>{iconFor(n, ICON_PX[iconSize])}</span>
              <span className={styles.iconLabel} style={{ maxWidth: ICON_BOX[iconSize] - 4 }}>{label(n)}</span>
            </button>
          ))}
        </div>}
        <div className={styles.windows}>
          {wm.windows.map((w) => { const C = APP_COMPONENTS[w.app]; return <C key={w.id} win={w} />; })}
        </div>
        <div className={styles.screenTint} style={{ opacity: (100 - sys.settings.brightness) / 100 * 0.72 }} />
        {sys.settings.nightLight && <div className={styles.nightLight} />}
        <TaskViewPanel open={panel === "taskview"} onClose={() => setPanel(null)} />
        <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} onOpen={openToast} />
        <StartMenu open={panel === "start"} displayName={profile.displayName} onLaunch={(a, p) => launch(a, p)} onOpenFile={openFile} onClose={() => setPanel(null)} onSearch={(q) => { setSearchInitial(q); setPanel("search"); }} onLock={() => setLocked(true)} />
        <SearchPanel open={panel === "search"} initial={searchInitial} onClose={() => { setPanel(null); setSearchInitial(""); }} onLaunch={launchEntry} onOpenFile={openFile} onOpenUrl={openUrl} />
        <NotificationPanel open={panel === "notif"} onClose={() => setPanel(null)} history={history} onOpen={openToast} onClear={() => { setHistory([]); setSeenNotif(0); }} />
        <WidgetsPanel open={panel === "widgets"} weather={weather} unit={profile.tempUnit ?? "C"} onOpenUrl={(u) => { setPanel(null); openUrl(u); }} />
        <QuickSettingsPanel open={panel === "quick"} onClose={() => setPanel(null)} onOpenSettings={(page) => launch("settings", page ? { page } : undefined)} />
        {locked && <LockScreen profile={profile} wallpaper={wallpaper} onUnlock={() => setLocked(false)} />}
        {renaming && <RenameDialog node={renaming} onClose={() => setRenaming(null)} onDone={() => { setRenaming(null); refresh(); }} />}
        {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
        <Taskbar profile={profile} pins={profile.taskbarPins as AppId[]} panel={panel} onPanel={(p) => { if (p === "search") setSearchInitial(""); setPanel(p); }} onLaunch={(a) => { setPanel(null); launch(a); }} onShowDesktop={() => { setPanel(null); wm.windows.forEach((w) => wm.minimize(w.id)); }} unreadCount={Math.max(0, history.length - seenNotif)} />
      </div>
    </OSProvider>
  );
}
