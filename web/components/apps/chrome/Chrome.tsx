"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./Chrome.module.css";
import { WinState, useWM } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import { useMenu, MenuItem } from "@/components/desktop/ContextMenu";
import { useOS } from "@/components/desktop/os";
import { WebPane, PaneHandle } from "./WebPane";
import { api, Bookmark, HistoryEntry } from "@/lib/client/api";
import { host as hostBridge } from "@/lib/client/host";
import * as M from "@/components/icons/material";
import { GoogleIcon } from "@/components/icons/apps";

interface Tab { id: string; url: string; title: string; favicon: string | null; loading: boolean; canBack: boolean; canForward: boolean; pinned?: boolean }

const NTP_PATH = "/chrome/ntp";
let tabSeq = 1;

/** URL the address bar shows for what the pane actually loaded. Local story routes appear as their real-looking hosts. */
function toDisplay(actual: string, origin: string): string {
  if (!actual) return "";
  if (actual.startsWith(origin)) {
    const rest = actual.slice(origin.length);
    if (rest.startsWith(NTP_PATH)) return "";
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
function fromInput(text: string): string {
  const t = text.trim();
  if (!t) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^(about|chrome|file):/i.test(t)) return t;
  if (/^localhost(:\d+)?(\/|$)/.test(t) || /^[\w.-]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#].*)?$/.test(t)) return `https://${t}`;
  return `https://www.google.com/search?q=${encodeURIComponent(t)}&sourceid=chrome&ie=UTF-8`;
}

export function Chrome({ win }: { win: WinState }) {
  const wm = useWM();
  const os = useOS();
  const menu = useMenu();
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
  const omniRef = useRef<HTMLInputElement>(null);
  const active = wm.activeId === win.id;
  const handledNonce = useRef<unknown>(null);

  useEffect(() => {
    api.hosts().then((d) => setStoryHosts(d.match)).catch(() => {});
    api.browser().then((d) => { setBookmarks(d.bookmarks); setHistory(d.history); }).catch(() => {});
  }, []);

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
    else if (!tabs.length) openTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.props.nonce, win.props.openUrl]);

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
    const url = fromInput(text);
    if (!url || !activeTab) return;
    setOmniFocus(false); omniRef.current?.blur();
    navigate(activeTab.id, url);
  };

  const suggestions = useMemo(() => {
    const q = omniText.trim().toLowerCase();
    if (!q || !omniFocus) return [] as { kind: "search" | "history" | "url"; text: string; url: string; title?: string }[];
    const out: { kind: "search" | "history" | "url"; text: string; url: string; title?: string }[] = [];
    const looksUrl = /^[\w.-]+\.[a-z]{2,}/i.test(q) || /^[a-z]+:\/\//i.test(q);
    if (looksUrl) out.push({ kind: "url", text: q, url: fromInput(q) });
    out.push({ kind: "search", text: omniText.trim(), url: `https://www.google.com/search?q=${encodeURIComponent(omniText.trim())}&sourceid=chrome&ie=UTF-8` });
    for (const h of history) {
      if (h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q)) out.push({ kind: "history", text: h.title || h.url, url: h.url, title: prettyUrl(h.url) });
      if (out.length >= 8) break;
    }
    const seen = new Set<string>();
    return out.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
  }, [omniText, omniFocus, history]);

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
  };

  // ---- menus ----
  const chromeMenu = (x: number, y: number, items: MenuItem[], width?: number) => menu.open({ x, y, items, variant: "chrome", width });
  const tabMenu = (e: React.MouseEvent, t: Tab) => {
    e.preventDefault(); e.stopPropagation();
    const i = tabs.findIndex((x) => x.id === t.id);
    chromeMenu(e.clientX, e.clientY, [
      { label: "New tab to the right", icon: <M.MTab />, shortcut: "Ctrl+T", onClick: () => openTab(undefined, { after: t.id }) },
      { label: "Add tab to reading list", icon: <span /> },
      { label: "Add tab to new group", icon: <span /> },
      { label: "Move tab to new window", icon: <span /> },
      { type: "sep" },
      { label: "Reload", icon: <M.MRefresh />, shortcut: "Ctrl+R", onClick: () => panes.current.get(t.id)?.reload() },
      { label: "Duplicate", icon: <span />, onClick: () => openTab(t.url, { after: t.id }) },
      { label: t.pinned ? "Unpin" : "Pin", icon: <span />, onClick: () => update(t.id, { pinned: !t.pinned }) },
      { label: "Mute site", icon: <span /> },
      { label: "Send to your devices", icon: <M.MDevices /> },
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
        { label: "Open link in Incognito window", icon: <M.MIncognito /> },
        { type: "sep" },
        { label: "Save link as...", icon: <span /> },
        { label: "Copy link address", icon: <span />, onClick: () => navigator.clipboard?.writeText(p.linkURL!).catch(() => {}) },
        { type: "sep" },
        { label: "Inspect", icon: <M.MInspect /> },
      ]);
      return;
    }
    if (p.selectionText) {
      const sel = p.selectionText.trim().slice(0, 40);
      chromeMenu(x, y, [
        { label: "Copy", icon: <span />, shortcut: "Ctrl+C", onClick: () => navigator.clipboard?.writeText(p.selectionText!).catch(() => {}) },
        { label: `Search Google for "${sel}${p.selectionText.trim().length > 40 ? "…" : ""}"`, icon: <span />, onClick: () => openTab(fromInput(p.selectionText!), { after: t.id }) },
        { label: "Print...", icon: <M.MPrint />, shortcut: "Ctrl+P" },
        { type: "sep" },
        { label: "Inspect", icon: <M.MInspect /> },
      ]);
      return;
    }
    const pane = panes.current.get(t.id);
    chromeMenu(x, y, [
      { label: "Back", icon: <span />, shortcut: "Alt+Left Arrow", disabled: !t.canBack, onClick: () => pane?.goBack() },
      { label: "Forward", icon: <span />, shortcut: "Alt+Right Arrow", disabled: !t.canForward, onClick: () => pane?.goForward() },
      { label: "Reload", icon: <span />, shortcut: "Ctrl+R", onClick: () => pane?.reload() },
      { type: "sep" },
      { label: "Save as...", icon: <span />, shortcut: "Ctrl+S" },
      { label: "Print...", icon: <span />, shortcut: "Ctrl+P" },
      { label: "Cast...", icon: <span /> },
      { label: "Search with Google Lens", icon: <span /> },
      { label: "Send to your devices", icon: <span /> },
      { label: "Create QR Code for this page", icon: <span /> },
      { label: "Translate to English", icon: <span /> },
      { type: "sep" },
      { label: "View page source", icon: <span />, shortcut: "Ctrl+U" },
      { label: "Inspect", icon: <span />, shortcut: "Ctrl+Shift+I" },
    ]);
  };
  const mainMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    chromeMenu(r.right - 300, r.bottom + 4, [
      { label: "New tab", icon: <M.MTab />, shortcut: "Ctrl+T", onClick: () => openTab() },
      { label: "New window", icon: <M.MWindow />, shortcut: "Ctrl+N", onClick: () => openTab() },
      { label: "New Incognito window", icon: <M.MIncognito />, shortcut: "Ctrl+Shift+N" },
      { type: "sep" },
      { label: os.profile.displayName, icon: <M.MAccount />, children: [{ label: "Manage your Google Account" }, { type: "sep" }, { label: "Customize profile" }, { label: "Add new profile" }] },
      { label: "Passwords and autofill", icon: <M.MKey />, children: [{ label: "Google Password Manager" }, { label: "Payment methods" }, { label: "Addresses and more" }] },
      { label: "History", icon: <M.MHistory />, children: [{ label: "History", shortcut: "Ctrl+H" }, { type: "sep" }, ...history.slice(0, 8).map((h) => ({ label: h.title || h.url, onClick: () => openTab(h.url) }))] },
      { label: "Downloads", icon: <M.MDownload />, shortcut: "Ctrl+J" },
      { label: "Bookmarks and lists", icon: <M.MBookmarks />, children: [{ label: "Bookmark this tab...", shortcut: "Ctrl+D" }, { label: "Bookmark all tabs...", shortcut: "Ctrl+Shift+D" }, { type: "sep" }, { label: "Show bookmarks bar", shortcut: "Ctrl+Shift+B", checked: true }, { label: "Bookmark manager", shortcut: "Ctrl+Shift+O" }, { label: "Reading list" }] },
      { label: "Tab groups", icon: <span />, children: [{ label: "No tab groups", disabled: true }] },
      { label: "Extensions", icon: <M.MExtension />, children: [{ label: "Manage extensions" }, { label: "Visit Chrome Web Store" }] },
      { label: "Delete browsing data...", icon: <M.MDelete />, shortcut: "Ctrl+Shift+Del" },
      { type: "sep" },
      { label: "Zoom", icon: <M.MZoomIn />, shortcut: "−  100%  +" },
      { label: "Print...", icon: <M.MPrint />, shortcut: "Ctrl+P" },
      { label: "Search with Google Lens", icon: <M.MGoogleLens /> },
      { label: "Translate...", icon: <M.MTranslate /> },
      { label: "Find and edit", icon: <M.MFind />, children: [{ label: "Find...", shortcut: "Ctrl+F" }, { type: "sep" }, { label: "Cut", shortcut: "Ctrl+X" }, { label: "Copy", shortcut: "Ctrl+C" }, { label: "Paste", shortcut: "Ctrl+V" }] },
      { label: "Cast, save, and share", icon: <M.MCast />, children: [{ label: "Cast..." }, { label: "Save page as...", shortcut: "Ctrl+S" }, { label: "Create shortcut..." }, { label: "Copy link" }, { label: "Send to your devices" }, { label: "Create QR Code" }] },
      { label: "More tools", icon: <span />, children: [{ label: "Name window..." }, { label: "Reading mode" }, { label: "Performance" }, { label: "Task manager", shortcut: "Shift+Esc" }, { label: "Developer tools", shortcut: "Ctrl+Shift+I" }] },
      { type: "sep" },
      { label: "Help", icon: <M.MHelp />, children: [{ label: "About Google Chrome" }, { label: "What's new" }, { label: "Help center" }, { label: "Report an issue...", shortcut: "Alt+Shift+I" }] },
      { label: "Settings", icon: <M.MSettings /> },
      { label: "Exit", icon: <M.MExit />, onClick: () => wm.close(win.id) },
    ], 300);
  };
  const bookmarkMenu = (e: React.MouseEvent, b?: Bookmark) => {
    e.preventDefault(); e.stopPropagation();
    chromeMenu(e.clientX, e.clientY, b && b.url ? [
      { label: "Open in new tab", icon: <span />, onClick: () => openTab(b.url!, { background: true }) },
      { label: "Open in new window", icon: <span />, onClick: () => openTab(b.url!) },
      { label: "Open in Incognito window", icon: <span /> },
      { type: "sep" },
      { label: "Edit...", icon: <span /> }, { label: "Cut", icon: <span /> }, { label: "Copy", icon: <span /> }, { label: "Paste", icon: <span />, disabled: true }, { label: "Delete", icon: <span /> },
      { type: "sep" },
      { label: "Add page...", icon: <span /> }, { label: "Add folder...", icon: <span /> },
      { type: "sep" },
      { label: "Bookmark manager", icon: <span /> }, { label: "Show apps shortcut", icon: <span /> }, { label: "Show tab groups", icon: <span />, checked: true }, { label: "Show bookmarks bar", icon: <span />, shortcut: "Ctrl+Shift+B", checked: true },
    ] : [
      { label: "Add page...", icon: <span /> }, { label: "Add folder...", icon: <span /> },
      { type: "sep" },
      { label: "Bookmark manager", icon: <span /> }, { label: "Show apps shortcut", icon: <span /> }, { label: "Show tab groups", icon: <span />, checked: true }, { label: "Show bookmarks bar", icon: <span />, shortcut: "Ctrl+Shift+B", checked: true },
    ]);
  };
  const folderMenu = (e: React.MouseEvent, b: Bookmark) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    chromeMenu(r.left, r.bottom + 2, (b.children ?? []).map((c) => ({ label: c.title, icon: <Favicon url={c.url} />, onClick: () => c.url && navigate(activeTab!.id, c.url) })).concat(b.children?.length ? [] : [{ label: "(empty)", icon: <span />, onClick: () => {} }]));
  };

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
          <button className={styles.gemini} data-nodrag><M.MSparkle size={16} />Ask Gemini</button>
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
              {isNtp ? <button className={styles.omniChip}><M.MSparkle size={16} />AI Mode</button> : (
                <>
                  <button className={styles.tbBtn} title="Share this page"><M.MShare size={18} /></button>
                  <button className={styles.tbBtn} title="Bookmark this tab"><M.MStar size={18} /></button>
                </>
              )}
            </div>
          </div>
          <button className={styles.tbBtn} title="Extensions"><M.MExtension /></button>
          <button className={styles.tbBtn} title="Downloads"><M.MDownload /></button>
          <button className={styles.avatarBtn} title={`Google Account\n${os.profile.displayName}\n${os.profile.accountEmail}`}><span className={styles.avatarDot}><M.MPerson size={16} /></span></button>
          <button className={styles.tbBtn} title="Customize and control Google Chrome" onClick={mainMenu}><M.MMoreVert /></button>
        </div>
        <div className={styles.bookmarks} onContextMenu={(e) => bookmarkMenu(e)}>
          {bookmarks.map((b) => (
            b.folder ? (
              <button key={b.id} className={styles.bm} onClick={(e) => folderMenu(e, b)} onContextMenu={(e) => bookmarkMenu(e, b)}><span className={styles.bmIcon}><M.MFolder size={16} /></span><span className={styles.bmText}>{b.title}</span></button>
            ) : (
              <button key={b.id} className={styles.bm} title={b.url} onClick={() => activeTab && b.url && navigate(activeTab.id, b.url)} onMouseDown={(e) => { if (e.button === 1 && b.url) openTab(b.url, { background: true }); }} onContextMenu={(e) => bookmarkMenu(e, b)}><span className={styles.bmIcon}><Favicon url={b.url} /></span><span className={styles.bmText}>{b.title}</span></button>
            )
          ))}
          <span className={styles.bmSpacer} />
          <span className={styles.bmSep} />
          <button className={styles.bm}><span className={styles.bmIcon}><M.MFolder size={16} /></span><span className={styles.bmText}>All Bookmarks</span></button>
        </div>
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
