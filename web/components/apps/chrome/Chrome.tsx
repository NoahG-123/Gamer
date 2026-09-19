"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./Chrome.module.css";
import { WinState, useWM } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import { useMenu, MenuItem } from "@/components/desktop/ContextMenu";
import { useOS } from "@/components/desktop/os";
import { useSystem } from "@/lib/client/system";
import { WebPane, PaneHandle } from "./WebPane";
import { api, Bookmark, HistoryEntry } from "@/lib/client/api";
import { host as hostBridge } from "@/lib/client/host";
import * as M from "@/components/icons/material";
import { GoogleIcon } from "@/components/icons/apps";

interface Tab { id: string; url: string; title: string; favicon: string | null; loading: boolean; canBack: boolean; canForward: boolean; pinned?: boolean }

const NTP_PATH = "/chrome/ntp";
/** Chrome's own pages, served by this machine but addressed the way Chrome addresses them. */
const CHROME_PAGES: Record<string, string> = { history: "/chrome/history", downloads: "/chrome/downloads", bookmarks: "/chrome/bookmarks", settings: "/chrome/settings", offline: "/chrome/offline" };
let tabSeq = 1;

/** URL the address bar shows for what the pane actually loaded. Local story routes appear as their real-looking hosts. */
function toDisplay(actual: string, origin: string): string {
  if (!actual) return "";
  if (actual.startsWith(origin)) {
    const rest = actual.slice(origin.length);
    if (rest.startsWith(NTP_PATH)) return "";
    for (const [name, p] of Object.entries(CHROME_PAGES)) if (rest.startsWith(p)) return `chrome://${name}`;
    const m = rest.match(/^\/sites\/([^/?#]+)(.*)$/);
    if (m) return `https://${m[1]}${m[2] || "/"}`;
    const f = rest.match(/^\/lf\/(.*)$/);
    if (f) return `file:///${decodeURIComponent(f[1])}`;
  }
  return actual;
}
/** Chrome hides the scheme and "www." for http(s) pages in the omnibox. */
function prettyUrl(display: string): string {
  if (!display) return "";
  return display.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}
function fromInput(text: string, origin = ""): string {
  const t = text.trim();
  if (!t) return "";
  const chrome = t.match(/^chrome:\/\/([a-z-]+)\/?$/i);
  if (chrome) {
    const page = CHROME_PAGES[chrome[1].toLowerCase()];
    return page ? `${origin}${page}` : `${origin}${NTP_PATH}`;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^(about|chrome|file):/i.test(t)) return t;
  if (/^localhost(:\d+)?(\/|$)/.test(t) || /^[\w.-]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#].*)?$/.test(t)) return `https://${t}`;
  return `https://www.google.com/search?q=${encodeURIComponent(t)}&sourceid=chrome&ie=UTF-8`;
}

export function Chrome({ win }: { win: WinState }) {
  const wm = useWM();
  const os = useOS();
  const menu = useMenu();
  const sys = useSystem();
  const origin = typeof location !== "undefined" ? location.origin : "";
  const electron = hostBridge().isElectron;
  const [storyHosts, setStoryHosts] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const panes = useRef(new Map<string, PaneHandle | null>());
  const [omniText, setOmniText] = useState("");
  const [omniFocus, setOmniFocus] = useState(false);
  const [ddIndex, setDdIndex] = useState(-1);
  const showBar = sys.settings.chromeBookmarksBar;
  const showTabGroups = sys.settings.chromeTabGroups;
  const setShowBar = (fn: (v: boolean) => boolean) => sys.set({ chromeBookmarksBar: fn(sys.settings.chromeBookmarksBar) });
  const setShowTabGroups = (fn: (v: boolean) => boolean) => sys.set({ chromeTabGroups: fn(sys.settings.chromeTabGroups) });
  const zoom = sys.settings.chromeZoom;
  const [find, setFind] = useState<string | null>(null);
  const [findHits, setFindHits] = useState({ active: 0, total: 0 });
  const [note, setNote] = useState<string | null>(null);
  const omniRef = useRef<HTMLInputElement>(null);
  const active = wm.activeId === win.id;
  const handledNonce = useRef<unknown>(null);

  const loadBrowserData = useCallback(() => {
    api.browser().then((d) => { setBookmarks(d.bookmarks); setHistory(d.history); }).catch(() => {});
  }, []);
  useEffect(() => {
    api.hosts().then((d) => setStoryHosts(d.match)).catch(() => {});
    loadBrowserData();
  }, [loadBrowserData]);

  /** Where the iframe fallback (non-Electron) should really load a URL. Electron's session intercept does this natively. */
  const resolveForFrame = useCallback((url: string) => {
    if (electron) return url;
    try {
      const u = new URL(url, origin);
      if (storyHosts.includes(u.hostname.toLowerCase())) return `${origin}/sites/${u.hostname.replace(/^www\./, "")}${u.pathname}${u.search}`;
    } catch { /* ignore */ }
    return url;
  }, [electron, origin, storyHosts]);

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const update = useCallback((id: string, patch: Partial<Tab>) => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t))), []);

  const openTab = useCallback((url?: string, opts: { background?: boolean; after?: string } = {}) => {
    const id = `tab${tabSeq++}`;
    const target = url || `${origin}${NTP_PATH}`;
    const tab: Tab = { id, url: target, title: url ? "" : "New Tab", favicon: null, loading: !!url, canBack: false, canForward: false };
    setTabs((ts) => {
      if (opts.after) { const i = ts.findIndex((t) => t.id === opts.after); return [...ts.slice(0, i + 1), tab, ...ts.slice(i + 1)]; }
      return [...ts, tab];
    });
    if (!opts.background) setActiveId(id);
    return id;
  }, [origin]);

  const closeTab = useCallback((id: string) => {
    setTabs((ts) => {
      const i = ts.findIndex((t) => t.id === id);
      const next = ts.filter((t) => t.id !== id);
      if (!next.length) { setTimeout(() => wm.close(win.id), 0); return ts; }
      if (id === activeId) setActiveId(next[Math.min(i, next.length - 1)].id);
      panes.current.delete(id);
      return next;
    });
  }, [activeId, wm, win.id]);

  // First tab + external open requests (file links, story URLs from other apps)
  useEffect(() => {
    const nonce = win.props.nonce;
    if (nonce !== undefined && nonce === handledNonce.current) return;
    handledNonce.current = nonce;
    const url = win.props.openUrl as string | undefined;
    if (url) openTab(url.startsWith("/") ? `${origin}${url}` : url);
    else if (!tabs.length) {
      // "Continue where you left off" reopens what was on screen when Chrome last closed.
      let restored = false;
      if (sys.settings.chromeStartup === "continue") {
        try {
          const saved = JSON.parse(localStorage.getItem("chrome.session") || "[]") as string[];
          for (const u of saved.slice(0, 12)) { openTab(u, { background: restored }); restored = true; }
        } catch { /* nothing kept, or storage is unavailable */ }
      }
      if (!restored) openTab();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.props.nonce, win.props.openUrl]);

  useEffect(() => {
    try { localStorage.setItem("chrome.session", JSON.stringify(tabs.map((t) => t.url).filter((u) => u && !u.includes(NTP_PATH)))); } catch { /* storage unavailable */ }
  }, [tabs]);

  // Links that want a new window open as a new tab (Electron sends these from main).
  useEffect(() => {
    const h = window.__host as { onOpenTab?: (cb: (url: string) => void) => () => void } | undefined;
    if (!h?.onOpenTab) return;
    return h.onOpenTab((url) => openTab(url));
  }, [openTab]);

  // Address bar follows the active tab unless the user is typing.
  const display = activeTab ? toDisplay(activeTab.url, origin) : "";
  useEffect(() => { if (!omniFocus) setOmniText(prettyUrl(display)); }, [display, omniFocus, activeId]);

  const navigate = useCallback((id: string, url: string) => {
    const pane = panes.current.get(id);
    if (!pane) return;
    update(id, { loading: true });
    pane.loadURL(url);
    setTimeout(() => panes.current.get(id)?.focus(), 30);
  }, [update]);

  const commitOmni = (text: string) => {
    const url = fromInput(text, origin);
    if (!url || !activeTab) return;
    setOmniFocus(false); omniRef.current?.blur();
    navigate(activeTab.id, url);
  };

  const suggestions = useMemo(() => {
    const q = omniText.trim().toLowerCase();
    if (!q || !omniFocus) return [] as { kind: "search" | "history" | "url"; text: string; url: string; title?: string }[];
    const out: { kind: "search" | "history" | "url"; text: string; url: string; title?: string }[] = [];
    const looksUrl = /^[\w.-]+\.[a-z]{2,}/i.test(q) || /^[a-z]+:\/\//i.test(q);
    if (looksUrl) out.push({ kind: "url", text: q, url: fromInput(q, origin) });
    out.push({ kind: "search", text: omniText.trim(), url: `https://www.google.com/search?q=${encodeURIComponent(omniText.trim())}&sourceid=chrome&ie=UTF-8` });
    for (const h of history) {
      if (h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q)) out.push({ kind: "history", text: h.title || h.url, url: h.url, title: prettyUrl(h.url) });
      if (out.length >= 8) break;
    }
    const seen = new Set<string>();
    return out.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
  }, [omniText, omniFocus, history, origin]);

  const onOmniKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); commitOmni(ddIndex >= 0 && suggestions[ddIndex] ? suggestions[ddIndex].url : omniText); setDdIndex(-1); }
    else if (e.key === "Escape") { setOmniText(prettyUrl(display)); setOmniFocus(false); omniRef.current?.blur(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setDdIndex((i) => Math.min(suggestions.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setDdIndex((i) => Math.max(-1, i - 1)); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key.toLowerCase() === "t") { e.preventDefault(); openTab(); setTimeout(() => omniRef.current?.focus(), 50); }
    else if (e.ctrlKey && e.key.toLowerCase() === "w") { e.preventDefault(); if (activeTab) closeTab(activeTab.id); }
    else if (e.ctrlKey && e.key.toLowerCase() === "l") { e.preventDefault(); omniRef.current?.focus(); omniRef.current?.select(); }
    else if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) { e.preventDefault(); if (activeTab) panes.current.get(activeTab.id)?.reload(); }
    else if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); if (activeTab) panes.current.get(activeTab.id)?.goBack(); }
    else if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); if (activeTab) panes.current.get(activeTab.id)?.goForward(); }
    else if (e.ctrlKey && e.key === "Tab") { e.preventDefault(); const i = tabs.findIndex((t) => t.id === activeId); if (tabs.length) setActiveId(tabs[(i + (e.shiftKey ? tabs.length - 1 : 1)) % tabs.length].id); }
    else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "b") { e.preventDefault(); setShowBar((v) => !v); }
    else if (e.ctrlKey && e.key.toLowerCase() === "h") { e.preventDefault(); openChromePage("history"); }
    else if (e.ctrlKey && e.key.toLowerCase() === "j") { e.preventDefault(); openChromePage("downloads"); }
    else if (e.ctrlKey && e.key.toLowerCase() === "u") { e.preventDefault(); if (activeTab) viewSource(activeTab.id); }
    else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "i") { e.preventDefault(); if (activeTab) inspect(activeTab.id); }
    else if (e.ctrlKey && e.key.toLowerCase() === "f") { e.preventDefault(); setFind((f) => (f === null ? "" : f)); }
    else if (e.ctrlKey && e.key.toLowerCase() === "d") { e.preventDefault(); void toggleBookmark(); }
    else if (e.ctrlKey && (e.key === "+" || e.key === "=")) { e.preventDefault(); applyZoom(zoom * 1.1); }
    else if (e.ctrlKey && e.key === "-") { e.preventDefault(); applyZoom(zoom / 1.1); }
    else if (e.ctrlKey && e.key === "0") { e.preventDefault(); applyZoom(1); }
  };

  // ---- menus ----
  const chromeMenu = (x: number, y: number, items: MenuItem[], width?: number) => menu.open({ x, y, items, variant: "chrome", width });
  const tabMenu = (e: React.MouseEvent, t: Tab) => {
    e.preventDefault(); e.stopPropagation();
    const i = tabs.findIndex((x) => x.id === t.id);
    chromeMenu(e.clientX, e.clientY, [
      { label: "New tab to the right", icon: <M.MTab />, shortcut: "Ctrl+T", onClick: () => openTab(undefined, { after: t.id }) },
      { type: "sep" },
      { label: "Reload", icon: <M.MRefresh />, shortcut: "Ctrl+R", onClick: () => panes.current.get(t.id)?.reload() },
      { label: "Duplicate", icon: <span />, onClick: () => openTab(t.url, { after: t.id }) },
      { label: t.pinned ? "Unpin" : "Pin", icon: <span />, onClick: () => update(t.id, { pinned: !t.pinned }) },
      { type: "sep" },
      { label: "Close", icon: <M.MClose />, shortcut: "Ctrl+W", onClick: () => closeTab(t.id) },
      { label: "Close other tabs", icon: <span />, disabled: tabs.length < 2, onClick: () => tabs.filter((x) => x.id !== t.id).forEach((x) => closeTab(x.id)) },
      { label: "Close tabs to the right", icon: <span />, disabled: i >= tabs.length - 1, onClick: () => tabs.slice(i + 1).forEach((x) => closeTab(x.id)) },
    ]);
  };
  const pageMenu = (t: Tab, p: { x: number; y: number; linkURL?: string; srcURL?: string; selectionText?: string; isEditable?: boolean; mediaType?: string }) => {
    const rect = contentRef.current?.getBoundingClientRect();
    const x = electron ? (rect?.left ?? 0) + p.x : p.x, y = electron ? (rect?.top ?? 0) + p.y : p.y;
    wm.focus(win.id);
    if (p.linkURL) {
      chromeMenu(x, y, [
        { label: "Open link in new tab", icon: <span />, onClick: () => openTab(p.linkURL!, { background: true, after: t.id }) },
        { label: "Open link in new window", icon: <span />, onClick: () => openTab(p.linkURL!) },
        { type: "sep" },
        { label: "Copy link address", icon: <span />, onClick: () => navigator.clipboard?.writeText(p.linkURL!).catch(() => {}) },
        { type: "sep" },
        { label: "Inspect", icon: <M.MInspect />, onClick: () => inspect(t.id) },
      ]);
      return;
    }
    if (p.selectionText) {
      const sel = p.selectionText.trim().slice(0, 40);
      chromeMenu(x, y, [
        { label: "Copy", icon: <span />, shortcut: "Ctrl+C", onClick: () => navigator.clipboard?.writeText(p.selectionText!).catch(() => {}) },
        { label: `Search Google for "${sel}${p.selectionText.trim().length > 40 ? "…" : ""}"`, icon: <span />, onClick: () => openTab(fromInput(p.selectionText!, origin), { after: t.id }) },
        { label: "Print...", icon: <M.MPrint />, shortcut: "Ctrl+P", disabled: true },
        { type: "sep" },
        { label: "Inspect", icon: <M.MInspect />, onClick: () => inspect(t.id) },
      ]);
      return;
    }
    const pane = panes.current.get(t.id);
    chromeMenu(x, y, [
      { label: "Back", icon: <span />, shortcut: "Alt+Left Arrow", disabled: !t.canBack, onClick: () => pane?.goBack() },
      { label: "Forward", icon: <span />, shortcut: "Alt+Right Arrow", disabled: !t.canForward, onClick: () => pane?.goForward() },
      { label: "Reload", icon: <span />, shortcut: "Ctrl+R", onClick: () => pane?.reload() },
      { type: "sep" },
      { label: "Find...", icon: <span />, shortcut: "Ctrl+F", onClick: () => setFind("") },
      { type: "sep" },
      { label: "View page source", icon: <span />, shortcut: "Ctrl+U", onClick: () => viewSource(t.id) },
      { label: "Inspect", icon: <span />, shortcut: "Ctrl+Shift+I", onClick: () => inspect(t.id) },
    ]);
  };
  const mainMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    chromeMenu(r.right - 300, r.bottom + 4, [
      { label: "New tab", icon: <M.MTab />, shortcut: "Ctrl+T", onClick: () => openTab() },
      { label: "New window", icon: <M.MWindow />, shortcut: "Ctrl+N", onClick: () => openTab() },
      { type: "sep" },
      { label: os.profile.displayName, icon: <M.MAccount />, children: [{ label: "Manage your Google Account", onClick: () => openTab("https://myaccount.google.com/") }] },
      { label: "Passwords and autofill", icon: <M.MKey />, children: [{ label: "No saved passwords", disabled: true }] },
      { label: "History", icon: <M.MHistory />, children: [{ label: "History", shortcut: "Ctrl+H", onClick: () => openChromePage("history") }, { type: "sep" }, ...history.slice(0, 8).map((h) => ({ label: h.title || h.url, onClick: () => openTab(h.url) }))] },
      { label: "Downloads", icon: <M.MDownload />, shortcut: "Ctrl+J", onClick: () => openChromePage("downloads") },
      { label: "Bookmarks", icon: <M.MBookmarks />, children: [
        { label: bookmarked ? "Remove bookmark" : "Bookmark this tab...", shortcut: "Ctrl+D", disabled: !display, onClick: toggleBookmark },
        { label: "Bookmark manager", onClick: () => openChromePage("bookmarks") },
        { type: "sep" },
        ...bookmarks.filter((b) => b.url).slice(0, 10).map((b) => ({ label: b.title, onClick: () => b.url && openTab(b.url) })),
      ] },

      { label: "Extensions", icon: <M.MExtension />, children: [{ label: "No extensions are installed", disabled: true }] },
      { label: "Delete browsing data...", icon: <M.MDelete />, shortcut: "Ctrl+Shift+Del", onClick: async () => { await fetch("/api/browser/history", { method: "DELETE" }); loadBrowserData(); setNote("Browsing data deleted"); setTimeout(() => setNote(null), 2500); } },
      { type: "sep" },
      { label: "Zoom", icon: <M.MZoomIn />, children: [
        { label: "Zoom in", shortcut: "Ctrl++", onClick: () => applyZoom(zoom * 1.1) },
        { label: "Zoom out", shortcut: "Ctrl+−", onClick: () => applyZoom(zoom / 1.1) },
        { label: `Reset to 100% (now ${Math.round(zoom * 100)}%)`, shortcut: "Ctrl+0", onClick: () => applyZoom(1) },
      ] },
      { label: "Print...", icon: <M.MPrint />, shortcut: "Ctrl+P", onClick: () => { setNote("No printers are installed."); setTimeout(() => setNote(null), 3000); } },
      { label: "Find...", icon: <M.MFind />, shortcut: "Ctrl+F", onClick: () => setFind("") },
      { label: "Copy link", icon: <M.MShare />, disabled: !display, onClick: () => navigator.clipboard?.writeText(display).catch(() => {}) },
      { label: "More tools", icon: <span />, children: [{ label: "Task manager", shortcut: "Shift+Esc", onClick: () => os.launch("taskmgr") }, { label: "Developer tools", shortcut: "Ctrl+Shift+I", onClick: () => activeTab && inspect(activeTab.id) }] },
      { type: "sep" },
      { label: "Help", icon: <M.MHelp />, children: [{ label: "About Google Chrome", onClick: () => { setNote("Google Chrome is up to date — Version 138.0.7204.101 (Official Build) (64-bit)"); setTimeout(() => setNote(null), 4000); } }] },
      { label: "Settings", icon: <M.MSettings />, onClick: () => openChromePage("settings") },
      { label: "Exit", icon: <M.MExit />, onClick: () => wm.close(win.id) },
    ], 300);
  };
  const dropBookmark = async (b: Bookmark) => {
    if (!b.url) return;
    await fetch("/api/browser/bookmarks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: b.url, title: b.title, add: false }) });
    loadBrowserData();
  };
  const bookmarkMenu = (e: React.MouseEvent, b?: Bookmark) => {
    e.preventDefault(); e.stopPropagation();
    chromeMenu(e.clientX, e.clientY, b && b.url ? [
      { label: "Open in new tab", icon: <span />, onClick: () => openTab(b.url!, { background: true }) },
      { label: "Open in new window", icon: <span />, onClick: () => openTab(b.url!) },
      { type: "sep" },
      { label: "Copy address", icon: <span />, onClick: () => navigator.clipboard?.writeText(b.url!).catch(() => {}) },
      { label: "Cut", icon: <span />, onClick: () => { navigator.clipboard?.writeText(b.url!).catch(() => {}); void dropBookmark(b); } },
      { label: "Delete", icon: <span />, onClick: () => void dropBookmark(b) },
      { type: "sep" },
      { label: "Add this page", icon: <span />, disabled: !display || bookmarked, onClick: toggleBookmark },
      { type: "sep" },
      { label: "Bookmark manager", icon: <span />, onClick: () => openChromePage("bookmarks") },
      { label: "Show tab groups", icon: <span />, checked: showTabGroups, onClick: () => setShowTabGroups((v) => !v) },
      { label: "Show bookmarks bar", icon: <span />, shortcut: "Ctrl+Shift+B", checked: showBar, onClick: () => setShowBar((v) => !v) },
    ] : [
      { label: "Bookmark this tab...", icon: <span />, shortcut: "Ctrl+D", disabled: !display, onClick: toggleBookmark },
      { type: "sep" },
      { label: "Bookmark manager", icon: <span />, onClick: () => openChromePage("bookmarks") },
      { label: "Show tab groups", icon: <span />, checked: showTabGroups, onClick: () => setShowTabGroups((v) => !v) },
      { label: "Show bookmarks bar", icon: <span />, shortcut: "Ctrl+Shift+B", checked: showBar, onClick: () => setShowBar((v) => !v) },
    ]);
  };
  const folderMenu = (e: React.MouseEvent, b: Bookmark) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    chromeMenu(r.left, r.bottom + 2, (b.children ?? []).map((c) => ({ label: c.title, icon: <Favicon url={c.url} />, onClick: () => c.url && navigate(activeTab!.id, c.url) })).concat(b.children?.length ? [] : [{ label: "(empty)", icon: <span />, onClick: () => {} }]));
  };

  /** Chrome's Inspect: opens Chromium's own devtools on the page in this tab. */
  const inspect = useCallback((tabId: string) => {
    const id = panes.current.get(tabId)?.webContentsId();
    if (id != null) void hostBridge().tabDevTools?.(id);
  }, []);
  const viewSource = useCallback((tabId: string) => {
    const url = panes.current.get(tabId)?.getURL();
    if (url) openTab(`view-source:${url}`, { after: tabId });
  }, [openTab]);
  const openChromePage = useCallback((name: keyof typeof CHROME_PAGES | string) => {
    openTab(`${origin}${CHROME_PAGES[name] ?? NTP_PATH}`);
  }, [openTab, origin]);

  const bookmarked = !!activeTab && bookmarks.some((b) => b.url === display || (b.children ?? []).some((c) => c.url === display));
  const toggleBookmark = useCallback(async () => {
    if (!display) return;
    await fetch("/api/browser/bookmarks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: display, title: activeTab?.title || display, add: !bookmarked }) });
    loadBrowserData();
    setNote(bookmarked ? "Bookmark removed" : "Bookmark added");
    setTimeout(() => setNote(null), 2200);
  }, [display, activeTab?.title, bookmarked, loadBrowserData]);

  const applyZoom = useCallback((factor: number) => {
    const f = Math.max(0.25, Math.min(3, Number(factor.toFixed(2))));
    sys.set({ chromeZoom: f });
    if (activeTab) panes.current.get(activeTab.id)?.setZoom(f);
  }, [activeTab, sys]);
  // A zoom set from chrome://settings applies to the page already on screen.
  useEffect(() => { if (activeTab) panes.current.get(activeTab.id)?.setZoom(zoom); }, [zoom, activeTab?.id]);

  const contentRef = useRef<HTMLDivElement>(null);
  const isNtp = !display;
  const tabIndexOf = (id: string) => tabs.findIndex((t) => t.id === id);

  return (
    <Window win={win} className={styles.win}>
      <div className={`${styles.frame} ${win.maximized ? styles.maximized : ""} ${active ? "" : styles.inactive}`} onKeyDown={onKey} tabIndex={-1}>
        <div className={styles.tabStrip} data-drag onDoubleClick={(e) => { if ((e.target as HTMLElement).closest("[data-nodrag]")) e.stopPropagation(); }}>
          <button className={styles.tabSearch} data-nodrag title="Search tabs" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); chromeMenu(r.left, r.bottom + 4, tabs.map((t) => ({ label: t.title || prettyUrl(toDisplay(t.url, origin)) || "New Tab", icon: <Favicon url={toDisplay(t.url, origin)} favicon={t.favicon} />, onClick: () => setActiveId(t.id) }))); }}><M.MExpandMore size={20} /></button>
          <div className={styles.tabs} data-nodrag>
            {tabs.map((t) => (
              <div key={t.id} className={`${styles.tab} ${t.id === activeId ? styles.tabActive : ""}`} style={t.pinned ? { flex: "0 0 36px", padding: "0 10px" } : undefined} onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(t.id); } else if (e.button === 0) setActiveId(t.id); }} onContextMenu={(e) => tabMenu(e, t)} title={t.title}>
                <span className={styles.tabCurveL} /><span className={styles.tabCurveR} />
                <span className={styles.tabIcon}>{t.loading ? <M.MSpinner size={16} /> : <Favicon url={toDisplay(t.url, origin)} favicon={t.favicon} />}</span>
                {!t.pinned && <span className={styles.tabTitle}>{t.title || (toDisplay(t.url, origin) ? prettyUrl(toDisplay(t.url, origin)) : "New Tab")}</span>}
                {!t.pinned && <button className={styles.tabClose} onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} onMouseDown={(e) => e.stopPropagation()} aria-label="Close"><M.MClose size={12} /></button>}
              </div>
            ))}
          </div>
          <button className={styles.newTab} data-nodrag title="New tab (Ctrl+T)" onClick={() => { openTab(); setTimeout(() => omniRef.current?.focus(), 50); }}><M.MAdd size={20} /></button>
          <div className={styles.dragSpace} />
          <CaptionButtons win={win} dark className={styles.caption} />
        </div>
        <div className={styles.toolbar}>
          <button className={styles.tbBtn} disabled={!activeTab?.canBack} title="Click to go back, hold to see history" onClick={() => activeTab && panes.current.get(activeTab.id)?.goBack()}><M.MArrowBack /></button>
          <button className={styles.tbBtn} disabled={!activeTab?.canForward} title="Click to go forward, hold to see history" onClick={() => activeTab && panes.current.get(activeTab.id)?.goForward()}><M.MArrowForward /></button>
          <button className={styles.tbBtn} title={activeTab?.loading ? "Stop loading this page" : "Reload this page"} onClick={() => activeTab && (activeTab.loading ? panes.current.get(activeTab.id)?.stop() : panes.current.get(activeTab.id)?.reload())}>{activeTab?.loading ? <M.MClose /> : <M.MRefresh />}</button>
          <div className={`${styles.omni} ${omniFocus ? styles.omniFocus : ""}`} onClick={() => omniRef.current?.focus()}>
            {omniFocus && suggestions.length > 0 && (
              <div className={styles.dropdown}>
                {suggestions.map((s, i) => (
                  <div key={s.url + i} className={`${styles.ddRow} ${i === ddIndex ? styles.ddRowSel : ""}`} onMouseDown={(e) => { e.preventDefault(); commitOmni(s.url); }}>
                    <span className={styles.ddIcon}>{s.kind === "search" ? <M.MSearch size={18} /> : s.kind === "history" ? <M.MHistory size={18} /> : <M.MGlobe size={18} />}</span>
                    <span className={styles.ddText}>{s.text}</span>
                    {s.kind === "search" && <><span className={styles.ddSep}>-</span><span className={styles.ddUrl}>Google Search</span></>}
                    {s.kind === "history" && <><span className={styles.ddSep}>-</span><span className={styles.ddUrl}>{s.title}</span></>}
                  </div>
                ))}
              </div>
            )}
            <button className={styles.omniIcon} title={isNtp ? "Search Google" : display.startsWith("https://") ? "View site information" : "Site information"} onClick={(e) => e.stopPropagation()} style={{ zIndex: 6 }}>{isNtp || omniFocus ? <GoogleIcon size={16} /> : display.startsWith("file:") ? <M.MFolder size={16} /> : <M.MTune size={16} />}</button>
            <input
              ref={omniRef}
              className={styles.omniInput}
              style={{ zIndex: 6 }}
              value={omniText}
              placeholder="Search Google or type a URL"
              spellCheck={false}
              onChange={(e) => { setOmniText(e.target.value); setDdIndex(-1); }}
              onFocus={(e) => { setOmniFocus(true); setOmniText(display); requestAnimationFrame(() => e.target.select()); }}
              onBlur={() => { setOmniFocus(false); setDdIndex(-1); }}
              onKeyDown={onOmniKey}
            />
            <div className={styles.omniRight} style={{ zIndex: 6 }}>
              {!isNtp && (
                <button className={styles.tbBtn} title={bookmarked ? "Edit bookmark" : "Bookmark this tab (Ctrl+D)"} onClick={toggleBookmark}>{bookmarked ? <M.MStarFilled size={18} /> : <M.MStar size={18} />}</button>
              )}
            </div>
          </div>
          <button className={styles.tbBtn} title="Extensions" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); chromeMenu(r.right - 280, r.bottom + 4, [{ label: "No extensions are installed", disabled: true }, { type: "sep" }, { label: "Visit Chrome Web Store", icon: <M.MExtension />, onClick: () => openTab("https://chromewebstore.google.com/") }], 280); }}><M.MExtension /></button>
          <button className={styles.tbBtn} title="Downloads (Ctrl+J)" onClick={() => openChromePage("downloads")}><M.MDownload /></button>
          <button className={styles.avatarBtn} title={`Google Account\n${os.profile.displayName}\n${os.profile.accountEmail}`} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); chromeMenu(r.right - 300, r.bottom + 4, [{ label: os.profile.displayName, disabled: true }, { label: os.profile.accountEmail, disabled: true }, { type: "sep" }, { label: "Manage your Google Account", icon: <M.MAccount />, onClick: () => openTab("https://myaccount.google.com/") }, { label: "Sync is on", icon: <M.MRefresh />, disabled: true }], 300); }}><span className={styles.avatarDot}><M.MPerson size={16} /></span></button>
          <button className={styles.tbBtn} title="Customize and control Google Chrome" onClick={mainMenu}><M.MMoreVert /></button>
        </div>
        {showBar && <div className={styles.bookmarks} onContextMenu={(e) => bookmarkMenu(e)}>
          {showTabGroups && <button className={styles.tabGroups} title="Saved tab groups" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); chromeMenu(r.left, r.bottom + 4, [{ label: "No saved tab groups", disabled: true }], 260); }}><M.MApps size={18} /></button>}
          <span className={styles.bmSep} />
          {bookmarks.map((b) => (
            b.folder ? (
              <button key={b.id} className={styles.bm} onClick={(e) => folderMenu(e, b)} onContextMenu={(e) => bookmarkMenu(e, b)}><span className={styles.bmIcon}><M.MFolder size={16} /></span><span className={styles.bmText}>{b.title}</span></button>
            ) : (
              <button key={b.id} className={styles.bm} title={b.url} onClick={() => activeTab && b.url && navigate(activeTab.id, b.url)} onMouseDown={(e) => { if (e.button === 1 && b.url) openTab(b.url, { background: true }); }} onContextMenu={(e) => bookmarkMenu(e, b)}><span className={styles.bmIcon}><Favicon url={b.url} /></span><span className={styles.bmText}>{b.title}</span></button>
            )
          ))}
          <span className={styles.bmSpacer} />
          <span className={styles.bmSep} />
          <button className={styles.bm} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); chromeMenu(Math.max(8, r.right - 320), r.bottom + 4, [...bookmarks.map((b) => (b.folder  ? { label: b.title, icon: <M.MFolder size={16} />, children: (b.children ?? []).length      ? (b.children ?? []).map((c) => ({ label: c.title, icon: <Favicon url={c.url} />, onClick: () => c.url && openTab(c.url) }))      : [{ label: "(empty)", disabled: true }] }  : { label: b.title, icon: <Favicon url={b.url} />, onClick: () => b.url && openTab(b.url) })),...(bookmarks.length ? [{ type: "sep" as const }] : [{ label: "No bookmarks yet", disabled: true }]),{ label: "Bookmark manager", icon: <M.MBookmarks />, onClick: () => openChromePage("bookmarks") },], 320); }}><span className={styles.bmIcon}><M.MFolder size={16} /></span><span className={styles.bmText}>All Bookmarks</span></button>
        </div>}
        {find !== null && (
          <div className={styles.findBar}>
            <input
              autoFocus
              className={styles.findInput}
              placeholder="Find in page"
              value={find}
              onChange={(e) => { setFind(e.target.value); if (activeTab) { if (e.target.value) panes.current.get(activeTab.id)?.find(e.target.value); else panes.current.get(activeTab.id)?.stopFind(); } }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && activeTab) panes.current.get(activeTab.id)?.find(find, !e.shiftKey);
                if (e.key === "Escape") { if (activeTab) panes.current.get(activeTab.id)?.stopFind(); setFind(null); setFindHits({ active: 0, total: 0 }); }
              }}
            />
            <span className={styles.findCount}>{findHits.total ? `${findHits.active}/${findHits.total}` : find ? "0/0" : ""}</span>
            <button className={styles.tbBtn} onClick={() => activeTab && panes.current.get(activeTab.id)?.find(find, false)}><M.MExpandMore size={16} style={{ transform: "rotate(180deg)" }} /></button>
            <button className={styles.tbBtn} onClick={() => activeTab && panes.current.get(activeTab.id)?.find(find, true)}><M.MExpandMore size={16} /></button>
            <button className={styles.tbBtn} onClick={() => { if (activeTab) panes.current.get(activeTab.id)?.stopFind(); setFind(null); setFindHits({ active: 0, total: 0 }); }}><M.MClose size={16} /></button>
          </div>
        )}
        {note && <div className={styles.note}>{note}</div>}
        <div className={styles.content} ref={contentRef}>
          {tabs.map((t) => (
            <WebPane
              key={t.id}
              ref={(h) => { panes.current.set(t.id, h); }}
              initialUrl={t.url}
              visible={t.id === activeId}
              resolveForFrame={resolveForFrame}
              events={{
                onStartLoading: () => update(t.id, { loading: true }),
                onStopLoading: () => { const p = panes.current.get(t.id); update(t.id, { loading: false, canBack: !!p?.canGoBack(), canForward: !!p?.canGoForward() }); },
                onNavigate: (url) => {
                  const p = panes.current.get(t.id);
                  update(t.id, { url, canBack: !!p?.canGoBack(), canForward: !!p?.canGoForward(), favicon: null });
                  const shown = toDisplay(url, origin);
                  if (shown) api.visit(shown, "").catch(() => {});
                  if (!shown) update(t.id, { title: "New Tab" });
                },
                onTitle: (title) => { update(t.id, { title }); const shown = toDisplay(t.url, origin); if (shown && title) api.visit(shown, title).catch(() => {}); },
                onFavicon: (f) => update(t.id, { favicon: f }),
                onContextMenu: (p) => pageMenu(t, p),
                onFocus: () => wm.focus(win.id),
                onFound: (active, total) => setFindHits({ active, total }),
              }}
            />
          ))}
          {/* While another window is active, clicks must first activate this one (webviews swallow pointer events). */}
          {!active && <div className={styles.contentBlocker} onMouseDown={() => wm.focus(win.id)} />}
          {menu.isOpen && <div className={styles.contentBlocker} />}
        </div>
      </div>
    </Window>
  );
}

function Favicon({ url, favicon }: { url?: string; favicon?: string | null }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [favicon, url]);
  if (favicon && !broken) return <img src={favicon} alt="" onError={() => setBroken(true)} />;
  if (!url) return <M.MGlobe size={16} />;
  try {
    const u = new URL(url);
    if (u.protocol === "file:") return <M.MFolder size={16} />;
    if (!favicon && u.hostname.endsWith(".example")) return <M.MGlobe size={16} />;
    if (!broken) return <img src={`https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`} alt="" onError={() => setBroken(true)} />;
  } catch { /* ignore */ }
  return <M.MGlobe size={16} />;
}
