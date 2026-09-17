"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./Explorer.module.css";
import { WinState, useWM } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import { useOS } from "@/components/desktop/os";
import { useMenu, MenuItem } from "@/components/desktop/ContextMenu";
import { api, VfsNode, Drive, formatSizeCol, formatDateTime, formatBytes, toWindowsPath } from "@/lib/client/api";
import * as F from "@/components/icons/fluent";
import * as A from "@/components/icons/apps";

type View = "details" | "large";
type SortKey = "name" | "modified" | "type" | "size";
interface Tab { id: string; history: string[]; index: number; view: View; sort: SortKey; asc: boolean }

const SPECIAL = { home: "Home", pc: "This PC", bin: "Recycle Bin", net: "Network", gallery: "Gallery" } as const;
const isSpecial = (p: string) => Object.values(SPECIAL).includes(p as never);

function folderNameFor(p: string): string {
  if (isSpecial(p)) return p;
  if (/^[A-Z]:$/.test(p)) return p === "C:" ? "Local Disk (C:)" : "Data (D:)";
  return p.slice(p.lastIndexOf("/") + 1);
}

/** Icon for a folder path in the nav pane and address bar. */
function folderIcon(p: string, home: string, size = 16): React.ReactNode {
  if (p === SPECIAL.home) return <A.HomeIcon size={size} />;
  if (p === SPECIAL.pc) return <A.ThisPC size={size} />;
  if (p === SPECIAL.bin) return <A.RecycleBinIcon size={size} />;
  if (p === SPECIAL.net) return <A.NetworkIcon size={size} />;
  if (p === SPECIAL.gallery) return <A.GalleryIcon size={size} />;
  if (p === "C:") return <A.DriveC size={size} />;
  if (/^[A-Z]:$/.test(p)) return <A.DriveD size={size} />;
  if (p === `${home}/Desktop`) return <A.DesktopFolder size={size} />;
  if (p === `${home}/Downloads`) return <A.DownloadsFolder size={size} />;
  if (p === `${home}/Documents`) return <A.DocumentsFolder size={size} />;
  if (p === `${home}/Pictures`) return <A.PicturesFolder size={size} />;
  if (p === `${home}/Music`) return <A.MusicFolder size={size} />;
  if (p === `${home}/Videos`) return <A.VideosFolder size={size} />;
  if (p === `${home}/OneDrive`) return <A.OneDriveIcon size={size} />;
  return <A.FolderIcon size={size} />;
}

function breadcrumbs(p: string, home: string): { label: string; path: string }[] {
  if (isSpecial(p)) return [{ label: p, path: p }];
  const parts = p.split("/");
  const out: { label: string; path: string }[] = [{ label: "This PC", path: SPECIAL.pc }];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    acc = i === 0 ? parts[0] : `${acc}/${parts[i]}`;
    out.push({ label: folderNameFor(acc), path: acc });
  }
  void home;
  return out;
}

export function Explorer({ win }: { win: WinState }) {
  const wm = useWM();
  const os = useOS();
  const menu = useMenu();
  const home = os.home;
  const initial = (win.props.path as string) || SPECIAL.home;
  const [tabs, setTabs] = useState<Tab[]>(() => [{ id: "t1", history: [initial], index: 0, view: "details", sort: "name", asc: true }]);
  const [activeTab, setActiveTab] = useState("t1");
  const tab = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const path = tab.history[tab.index];
  const [items, setItems] = useState<VfsNode[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [recent, setRecent] = useState<VfsNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pcOpen, setPcOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<VfsNode[] | null>(null);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressText, setAddressText] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const active = wm.activeId === win.id;

  const updateTab = useCallback((fn: (t: Tab) => Tab) => setTabs((ts) => ts.map((t) => (t.id === activeTab ? fn(t) : t))), [activeTab]);
  const navigate = useCallback((p: string) => {
    setSearch(""); setSearchResults(null);
    updateTab((t) => ({ ...t, history: [...t.history.slice(0, t.index + 1), p], index: t.index + 1 }));
    setSelected(new Set());
  }, [updateTab]);
  const back = () => { if (tab.index > 0) { updateTab((t) => ({ ...t, index: t.index - 1 })); setSelected(new Set()); } };
  const forward = () => { if (tab.index < tab.history.length - 1) { updateTab((t) => ({ ...t, index: t.index + 1 })); setSelected(new Set()); } };
  const up = () => {
    if (isSpecial(path)) return;
    if (/^[A-Z]:$/.test(path)) return navigate(SPECIAL.pc);
    navigate(path.slice(0, path.lastIndexOf("/")) || SPECIAL.pc);
  };

  useEffect(() => { api.profile().then((d) => setDrives(d.drives)).catch(() => {}); }, []);

  // Load directory contents
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (path === SPECIAL.pc || path === SPECIAL.bin || path === SPECIAL.net || path === SPECIAL.gallery) {
      api.profile().then((d) => { if (!cancelled) { setDrives(d.drives); setItems([]); setLoading(false); } }).catch(() => setLoading(false));
      return () => { cancelled = true; };
    }
    if (path === SPECIAL.home) {
      fetch("/api/fs/recent?limit=20").then((r) => r.json()).then((d) => { if (!cancelled) { setRecent(d.recent ?? []); setItems([]); setLoading(false); } }).catch(() => setLoading(false));
      return () => { cancelled = true; };
    }
    api.list(path).then((d) => { if (!cancelled) { setItems(d.children); setLoading(false); } }).catch(() => { if (!cancelled) { setItems([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [path, os.refreshTick]);

  // Search (debounced)
  useEffect(() => {
    if (!search.trim() || isSpecial(path)) { setSearchResults(null); return; }
    const id = setTimeout(() => { api.search(path, search).then((d) => setSearchResults(d.results)).catch(() => {}); }, 250);
    return () => clearTimeout(id);
  }, [search, path]);

  const sorted = useMemo(() => {
    const list = searchResults ?? items;
    const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    const cmp = (a: VfsNode, b: VfsNode) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      let r = 0;
      if (tab.sort === "name") r = collator.compare(a.name, b.name);
      else if (tab.sort === "modified") r = a.modified.localeCompare(b.modified);
      else if (tab.sort === "type") r = collator.compare(A.typeLabel(a.ext, a.dir), A.typeLabel(b.ext, b.dir)) || collator.compare(a.name, b.name);
      else if (tab.sort === "size") r = a.size - b.size;
      return tab.asc ? r : -r;
    };
    return [...list].sort(cmp);
  }, [items, searchResults, tab.sort, tab.asc]);

  const open = useCallback((n: VfsNode) => {
    if (n.dir) navigate(n.path);
    else os.openFile(n);
  }, [navigate, os]);

  const click = (e: React.MouseEvent, n: VfsNode) => {
    e.stopPropagation();
    if (e.shiftKey && anchor) {
      const ids = sorted.map((x) => x.path);
      const a = ids.indexOf(anchor), b = ids.indexOf(n.path);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelected(new Set(ids.slice(lo, hi + 1)));
    } else if (e.ctrlKey) {
      const s = new Set(selected); if (s.has(n.path)) s.delete(n.path); else s.add(n.path); setSelected(s); setAnchor(n.path);
    } else { setSelected(new Set([n.path])); setAnchor(n.path); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "Enter" && selected.size === 1) { const n = sorted.find((x) => selected.has(x.path)); if (n) open(n); }
    else if (e.key === "Backspace") back();
    else if (e.altKey && e.key === "ArrowLeft") back();
    else if (e.altKey && e.key === "ArrowRight") forward();
    else if (e.altKey && e.key === "ArrowUp") up();
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const ids = sorted.map((x) => x.path);
      const cur = anchor ? ids.indexOf(anchor) : -1;
      const next = Math.max(0, Math.min(ids.length - 1, cur + (e.key === "ArrowDown" ? 1 : -1)));
      if (ids[next]) { setSelected(new Set([ids[next]])); setAnchor(ids[next]); }
    } else if (e.ctrlKey && e.key.toLowerCase() === "a") { e.preventDefault(); setSelected(new Set(sorted.map((x) => x.path))); }
    else if (e.key === "F5") { e.preventDefault(); refresh(); }
  };

  const refresh = () => { updateTab((t) => ({ ...t })); api.list(path).then((d) => setItems(d.children)).catch(() => {}); };

  const setSort = (k: SortKey) => updateTab((t) => ({ ...t, sort: k, asc: t.sort === k ? !t.asc : k === "modified" ? false : true }));

  // ---- context menus ----
  const fileMenu = (e: React.MouseEvent, n: VfsNode) => {
    e.preventDefault(); e.stopPropagation();
    if (!selected.has(n.path)) { setSelected(new Set([n.path])); setAnchor(n.path); }
    const iconRow: MenuItem = { type: "iconRow", buttons: [
      { icon: <F.Cut />, label: "Cut" }, { icon: <F.Copy />, label: "Copy" }, { icon: <F.Rename />, label: "Rename" }, { icon: <F.Share />, label: "Share" }, { icon: <F.Delete />, label: "Delete" },
    ] };
    const items: MenuItem[] = n.dir ? [
      iconRow, { type: "sep" },
      { label: "Open", icon: <F.Folder />, onClick: () => open(n), shortcut: "Enter" },
      { label: "Open in new tab", icon: <span />, onClick: () => newTab(n.path) },
      { label: "Open in new window", icon: <span />, onClick: () => os.openFolder(n.path) },
      { label: "Pin to Quick access", icon: <F.Pin /> },
      { label: "Add to Favorites", icon: <F.Star /> },
      { type: "sep" },
      { label: "Compress to...", icon: <F.Zip />, children: [{ label: "ZIP File" }, { label: "7z File" }, { label: "TAR File" }, { type: "sep" }, { label: "Additional options" }] },
      { label: "Copy as path", icon: <F.Link />, shortcut: "Ctrl+Shift+C" },
      { label: "Properties", icon: <F.Properties />, shortcut: "Alt+Enter" },
      { type: "sep" },
      { label: "Show more options", icon: <span />, shortcut: "Shift+F10" },
    ] : [
      iconRow, { type: "sep" },
      { label: "Open", icon: <F.OpenWith />, onClick: () => open(n), shortcut: "Enter" },
      { label: "Open with", icon: <span />, children: [{ label: "Choose another app" }] },
      { label: "Add to Favorites", icon: <F.Star /> },
      { type: "sep" },
      { label: "Compress to...", icon: <F.Zip />, children: [{ label: "ZIP File" }, { label: "7z File" }, { label: "TAR File" }, { type: "sep" }, { label: "Additional options" }] },
      { label: "Copy as path", icon: <F.Link />, shortcut: "Ctrl+Shift+C" },
      { label: "Properties", icon: <F.Properties />, shortcut: "Alt+Enter" },
      { type: "sep" },
      { label: "Show more options", icon: <span />, shortcut: "Shift+F10" },
    ];
    menu.open({ x: e.clientX, y: e.clientY, items });
  };
  const bgMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-row]")) return;
    e.preventDefault();
    setSelected(new Set());
    menu.open({ x: e.clientX, y: e.clientY, items: [
      { label: "View", icon: <F.ViewIcon />, children: [{ label: "Extra large icons" }, { label: "Large icons", checked: tab.view === "large", onClick: () => updateTab((t) => ({ ...t, view: "large" })) }, { label: "Medium icons" }, { label: "Small icons" }, { label: "List" }, { label: "Details", checked: tab.view === "details", onClick: () => updateTab((t) => ({ ...t, view: "details" })) }, { label: "Tiles" }, { label: "Content" }] },
      { label: "Sort by", icon: <F.Sort />, children: [{ label: "Name", checked: tab.sort === "name", onClick: () => setSort("name") }, { label: "Date modified", checked: tab.sort === "modified", onClick: () => setSort("modified") }, { label: "Type", checked: tab.sort === "type", onClick: () => setSort("type") }, { label: "Size", checked: tab.sort === "size", onClick: () => setSort("size") }, { type: "sep" }, { label: "Ascending", checked: tab.asc }, { label: "Descending", checked: !tab.asc }] },
      { label: "Group by", icon: <span />, children: [{ label: "(None)", checked: true }, { label: "Name" }, { label: "Date modified" }, { label: "Type" }, { label: "Size" }] },
      { label: "Refresh", icon: <F.Refresh />, onClick: refresh },
      { type: "sep" },
      { label: "New", icon: <F.NewIcon />, children: [{ label: "Folder" }, { label: "Shortcut" }, { type: "sep" }, { label: "Bitmap image" }, { label: "Text Document" }, { label: "Compressed (zipped) Folder" }] },
      { type: "sep" },
      { label: "Properties", icon: <F.Properties />, shortcut: "Alt+Enter" },
      { label: "Open in Terminal", icon: <F.Terminal /> },
      { type: "sep" },
      { label: "Show more options", icon: <span />, shortcut: "Shift+F10" },
    ] });
  };

  const newTab = (p: string = SPECIAL.home) => {
    const id = `t${Date.now().toString(36)}`;
    setTabs((ts) => [...ts, { id, history: [p], index: 0, view: "details", sort: "name", asc: true }]);
    setActiveTab(id);
    setSelected(new Set());
  };
  const closeTab = (id: string) => {
    if (tabs.length === 1) { wm.close(win.id); return; }
    const i = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (activeTab === id) setActiveTab(next[Math.max(0, i - 1)].id);
  };

  const selectedNodes = sorted.filter((n) => selected.has(n.path));
  const selSize = selectedNodes.reduce((a, n) => a + (n.dir ? 0 : n.size), 0);
  const crumbs = breadcrumbs(path, home);
  const quick = [`${home}/Desktop`, `${home}/Downloads`, `${home}/Documents`, `${home}/Pictures`, `${home}/Music`, `${home}/Videos`];
  const canUp = !isSpecial(path);

  const commitAddress = () => {
    setEditingAddress(false);
    const t = addressText.trim().replace(/\\/g, "/").replace(/\/+$/, "");
    if (!t) return;
    if (/^this pc$/i.test(t)) return navigate(SPECIAL.pc);
    if (/^[a-z]:$/i.test(t)) return navigate(t.toUpperCase());
    api.list(t, { record: false }).then(() => navigate(t[0].toUpperCase() + t.slice(1))).catch(() => {});
  };

  return (
    <Window win={win} className={styles.win}>
      <div className={styles.frame} onKeyDown={onKey} tabIndex={-1}>
        {/* Title bar with tabs */}
        <div className={styles.titleBar} data-drag>
          <div className={styles.tabs}>
            {tabs.map((t) => {
              const p = t.history[t.index];
              const isActive = t.id === activeTab;
              return (
                <div key={t.id} className={`${styles.tab} ${isActive ? styles.tabActive : ""}`} data-nodrag onClick={() => setActiveTab(t.id)} onMouseDown={(e) => { if (e.button === 1) closeTab(t.id); }}>
                  <span className={styles.tabIcon}>{folderIcon(p, home)}</span>
                  <span className={styles.tabTitle}>{folderNameFor(p)}</span>
                  <button className={styles.tabClose} onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} aria-label="Close tab"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.1" /></svg></button>
                </div>
              );
            })}
            <button className={styles.newTab} data-nodrag title="Add new tab (Ctrl+T)" onClick={() => newTab()}><F.Plus size={14} /></button>
          </div>
          <div className={styles.dragSpace} />
          <CaptionButtons win={win} />
        </div>

        {/* Command bar */}
        <div className={styles.commandBar}>
          <button className={styles.cmdText}><F.Plus size={16} /><span>New</span><F.ChevronDown size={10} /></button>
          <div className={styles.vsep} />
          <button className={styles.cmdIcon} title="Cut (Ctrl+X)" disabled={!selected.size}><F.Cut size={18} /></button>
          <button className={styles.cmdIcon} title="Copy (Ctrl+C)" disabled={!selected.size}><F.Copy size={18} /></button>
          <button className={styles.cmdIcon} title="Paste (Ctrl+V)" disabled><F.Paste size={18} /></button>
          <button className={styles.cmdIcon} title="Rename (F2)" disabled={selected.size !== 1}><F.Rename size={18} /></button>
          <button className={styles.cmdIcon} title="Share" disabled={!selected.size}><F.Share size={18} /></button>
          <button className={styles.cmdIcon} title="Delete (Delete)" disabled={!selected.size}><F.Delete size={18} /></button>
          <div className={styles.vsep} />
          <button className={styles.cmdText}><F.Sort size={16} /><span>Sort</span><F.ChevronDown size={10} /></button>
          <button className={styles.cmdText} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); menu.open({ x: r.left, y: r.bottom + 2, items: [{ label: "Extra large icons" }, { label: "Large icons", checked: tab.view === "large", onClick: () => updateTab((t) => ({ ...t, view: "large" })) }, { label: "Medium icons" }, { label: "Small icons" }, { label: "List" }, { label: "Details", checked: tab.view === "details", onClick: () => updateTab((t) => ({ ...t, view: "details" })) }, { label: "Tiles" }, { label: "Content" }, { type: "sep" }, { label: "Compact view" }, { label: "Show", children: [{ label: "Navigation pane", checked: true }, { label: "Details pane" }, { label: "Preview pane" }, { type: "sep" }, { label: "Item check boxes" }, { label: "File name extensions", checked: true }, { label: "Hidden items" }] }] }); }}><F.ViewIcon size={16} /><span>View</span><F.ChevronDown size={10} /></button>
          {searchResults && <button className={styles.cmdText}><F.Filter size={16} /><span>Filter</span><F.ChevronDown size={10} /></button>}
          <div className={styles.vsep} />
          <button className={styles.cmdIcon} title="See more"><F.More size={18} /></button>
          <div style={{ flex: 1 }} />
          <button className={styles.cmdText} style={{ marginRight: 6 }}><F.Properties size={16} /><span>Details</span></button>
        </div>

        {/* Address row */}
        <div className={styles.addressRow}>
          <button className={styles.navBtn} disabled={tab.index === 0} onClick={back} title="Back (Alt + Left Arrow)"><F.ArrowLeft size={16} /></button>
          <button className={styles.navBtn} disabled={tab.index >= tab.history.length - 1} onClick={forward} title="Forward (Alt + Right Arrow)"><F.ArrowRight size={16} /></button>
          <button className={styles.navBtn} title="Recent locations" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); menu.open({ x: r.left, y: r.bottom, items: [...tab.history].reverse().slice(0, 10).map((p) => ({ label: folderNameFor(p), icon: folderIcon(p, home), checked: p === path, onClick: () => navigate(p) })) }); }}><F.ChevronDown size={12} /></button>
          <button className={styles.navBtn} disabled={!canUp} onClick={up} title="Up to parent folder (Alt + Up Arrow)"><F.ArrowUp size={16} /></button>
          <div className={styles.address} onClick={(e) => { if ((e.target as HTMLElement).closest("button")) return; setAddressText(isSpecial(path) ? path : toWindowsPath(path)); setEditingAddress(true); }}>
            {editingAddress ? (
              <input className={styles.addressInput} autoFocus value={addressText} onChange={(e) => setAddressText(e.target.value)} onBlur={() => setEditingAddress(false)} onKeyDown={(e) => { if (e.key === "Enter") commitAddress(); if (e.key === "Escape") setEditingAddress(false); }} />
            ) : (
              <>
                <span className={styles.addressIcon}>{folderIcon(path, home)}</span>
                {crumbs.map((c, i) => (
                  <React.Fragment key={c.path}>
                    <span className={styles.crumbSep}><F.ChevronRight size={12} /></span>
                    <button className={`${styles.crumb} ${i === crumbs.length - 1 ? styles.crumbLast : ""}`} onClick={() => navigate(c.path)}>{c.label}</button>
                  </React.Fragment>
                ))}
                <span style={{ flex: 1 }} />
                <button className={styles.addressBtn} title="Previous Locations"><F.ChevronDown size={12} /></button>
                <button className={styles.addressBtn} title="Refresh" onClick={refresh}><F.Refresh size={14} /></button>
              </>
            )}
          </div>
          <div className={styles.searchBox}>
            <input placeholder={`Search ${folderNameFor(path)}`} value={search} onChange={(e) => setSearch(e.target.value)} />
            {search ? <button className={styles.addressBtn} onClick={() => setSearch("")}><F.Close size={12} /></button> : <F.Search size={14} className={styles.searchIcon} />}
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <div className={styles.nav}>
            <NavItem label="Home" icon={<A.HomeIcon size={16} />} active={path === SPECIAL.home} onClick={() => navigate(SPECIAL.home)} />
            <NavItem label="Gallery" icon={<A.GalleryIcon size={16} />} active={path === SPECIAL.gallery} onClick={() => navigate(SPECIAL.gallery)} />
            <div className={styles.navSep} />
            <NavItem label={`OneDrive - Personal`} icon={<A.OneDriveIcon size={16} />} chevron active={path === `${home}/OneDrive`} onClick={() => navigate(`${home}/OneDrive`)} />
            <div className={styles.navSep} />
            {quick.map((p) => <NavItem key={p} label={folderNameFor(p)} icon={folderIcon(p, home)} pinned active={path === p} onClick={() => navigate(p)} />)}
            <div className={styles.navSep} />
            <NavItem label="This PC" icon={<A.ThisPC size={16} />} chevron expanded={pcOpen} onChevron={() => setPcOpen((o) => !o)} active={path === SPECIAL.pc} onClick={() => navigate(SPECIAL.pc)} />
            {pcOpen && drives.map((d) => <NavItem key={d.letter} label={`${d.label} (${d.letter}:)`} icon={folderIcon(`${d.letter}:`, home)} indent chevron active={path === `${d.letter}:`} onClick={() => navigate(`${d.letter}:`)} />)}
            {pcOpen && !drives.length && <NavItem label="Local Disk (C:)" icon={<A.DriveC size={16} />} indent chevron active={path === "C:"} onClick={() => navigate("C:")} />}
            <NavItem label="Network" icon={<A.NetworkIcon size={16} />} chevron active={path === SPECIAL.net} onClick={() => navigate(SPECIAL.net)} />
          </div>
          <div className={styles.content} ref={bodyRef} onClick={() => setSelected(new Set())} onContextMenu={bgMenu}>
            {path === SPECIAL.pc && <ThisPCView drives={drives} home={home} quick={quick} navigate={navigate} selected={selected} click={click} />}
            {path === SPECIAL.home && <HomeView home={home} quick={quick} recent={recent} navigate={navigate} open={open} click={click} selected={selected} fileMenu={fileMenu} />}
            {(path === SPECIAL.bin || path === SPECIAL.net || path === SPECIAL.gallery) && <div className={styles.empty}>{path === SPECIAL.net ? "" : "This folder is empty."}</div>}
            {!isSpecial(path) && tab.view === "details" && (
              <div className={styles.details}>
                <div className={styles.header}>
                  <HeaderCell label="Name" k="name" sort={tab} onClick={setSort} style={{ flex: "0 0 auto", width: searchResults ? 300 : 360 }} />
                  <HeaderCell label="Date modified" k="modified" sort={tab} onClick={setSort} style={{ width: 150 }} />
                  <HeaderCell label="Type" k="type" sort={tab} onClick={setSort} style={{ width: 170 }} />
                  <HeaderCell label="Size" k="size" sort={tab} onClick={setSort} style={{ width: 90, textAlign: "right", justifyContent: "flex-end" }} />
                  {searchResults && <HeaderCell label="Folder path" k="name" sort={tab} onClick={() => {}} style={{ width: 300 }} />}
                </div>
                <div className={styles.rows}>
                  {sorted.map((n) => (
                    <div key={n.path} data-row className={`${styles.row} ${selected.has(n.path) ? styles.rowSel : ""} ${n.hidden ? styles.rowHidden : ""}`} onClick={(e) => click(e, n)} onDoubleClick={() => open(n)} onContextMenu={(e) => fileMenu(e, n)}>
                      <span className={styles.cellName} style={{ width: searchResults ? 300 : 360 }}><span className={styles.rowIcon}><A.FileTypeIcon ext={n.ext} dir={n.dir} name={n.name} /></span><span className={styles.rowText}>{n.name}</span></span>
                      <span className={styles.cell} style={{ width: 150 }}>{formatDateTime(n.modified, os.profile.locale)}</span>
                      <span className={styles.cell} style={{ width: 170 }}>{A.typeLabel(n.ext, n.dir)}</span>
                      <span className={`${styles.cell} ${styles.cellSize}`} style={{ width: 90 }}>{n.dir ? "" : formatSizeCol(n.size)}</span>
                      {searchResults && <span className={styles.cell} style={{ width: 300 }}>{toWindowsPath(n.path.slice(0, n.path.lastIndexOf("/")))}</span>}
                    </div>
                  ))}
                  {!loading && !sorted.length && <div className={styles.empty}>{searchResults ? "No items match your search." : "This folder is empty."}</div>}
                </div>
              </div>
            )}
            {!isSpecial(path) && tab.view === "large" && (
              <div className={styles.grid}>
                {sorted.map((n) => (
                  <div key={n.path} data-row className={`${styles.tile} ${selected.has(n.path) ? styles.rowSel : ""}`} onClick={(e) => click(e, n)} onDoubleClick={() => open(n)} onContextMenu={(e) => fileMenu(e, n)}>
                    <span className={styles.tileIcon}><A.FileTypeIcon ext={n.ext} dir={n.dir} name={n.name} size={64} /></span>
                    <span className={styles.tileLabel}>{n.name}</span>
                  </div>
                ))}
                {!loading && !sorted.length && <div className={styles.empty}>This folder is empty.</div>}
              </div>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className={styles.status}>
          <span className={styles.statusCell}>{path === SPECIAL.pc ? `${drives.length + 6} items` : path === SPECIAL.home ? `${recent.length + quick.length} items` : `${sorted.length} item${sorted.length === 1 ? "" : "s"}`}</span>
          {selected.size > 0 && <span className={styles.statusCell}>{selected.size} item{selected.size === 1 ? "" : "s"} selected{selSize ? `  ${formatBytes(selSize)}` : ""}</span>}
          <span style={{ flex: 1 }} />
          <button className={`${styles.viewBtn} ${tab.view === "details" ? styles.viewBtnActive : ""}`} onClick={() => updateTab((t) => ({ ...t, view: "details" }))} title="Display information about each item in the window."><F.DetailsView size={14} /></button>
          <button className={`${styles.viewBtn} ${tab.view === "large" ? styles.viewBtnActive : ""}`} onClick={() => updateTab((t) => ({ ...t, view: "large" }))} title="Display items by using large thumbnails."><F.LargeIconsView size={14} /></button>
        </div>
        {!active && <div className={styles.inactiveOverlay} />}
      </div>
    </Window>
  );
}

function HeaderCell({ label, k, sort, onClick, style }: { label: string; k: SortKey; sort: Tab; onClick: (k: SortKey) => void; style?: React.CSSProperties }) {
  const on = sort.sort === k;
  return (
    <button className={styles.headerCell} style={style} onClick={(e) => { e.stopPropagation(); onClick(k); }}>
      {on && <span className={styles.sortArrow}>{sort.asc ? <F.ChevronUp size={9} /> : <F.ChevronDown size={9} />}</span>}
      <span>{label}</span>
    </button>
  );
}

function NavItem({ label, icon, active, onClick, chevron, expanded, onChevron, indent, pinned }: { label: string; icon: React.ReactNode; active?: boolean; onClick: () => void; chevron?: boolean; expanded?: boolean; onChevron?: () => void; indent?: boolean; pinned?: boolean }) {
  return (
    <div className={`${styles.navItem} ${active ? styles.navActive : ""}`} onClick={onClick} style={{ paddingLeft: indent ? 34 : 12 }}>
      <span className={styles.navChevron} onClick={(e) => { e.stopPropagation(); onChevron?.(); }}>{chevron && (expanded ? <F.ChevronDown size={10} /> : <F.ChevronRight size={10} />)}</span>
      <span className={styles.navIcon}>{icon}</span>
      <span className={styles.navLabel}>{label}</span>
      {pinned && <span className={styles.navPin}><F.Pin size={12} /></span>}
    </div>
  );
}

function ThisPCView({ drives, home, quick, navigate, selected, click }: { drives: Drive[]; home: string; quick: string[]; navigate: (p: string) => void; selected: Set<string>; click: (e: React.MouseEvent, n: VfsNode) => void }) {
  const fake = (p: string): VfsNode => ({ name: folderNameFor(p), path: p, dir: true, size: 0, created: "", modified: "", hidden: false, system: false, openable: true, ext: "" });
  const gb = (n: number) => `${Math.round(n / 1024 ** 3)} GB`;
  return (
    <div className={styles.pc}>
      <div className={styles.groupHead}><F.ChevronDown size={10} /> Folders ({quick.length})</div>
      <div className={styles.pcFolders}>
        {quick.map((p) => (
          <div key={p} data-row className={`${styles.pcFolder} ${selected.has(p) ? styles.rowSel : ""}`} onClick={(e) => click(e, fake(p))} onDoubleClick={() => navigate(p)}>
            <span className={styles.pcFolderIcon}>{folderIcon(p, home, 48)}</span>
            <span className={styles.pcFolderName}>{folderNameFor(p)}</span>
          </div>
        ))}
      </div>
      <div className={styles.groupHead}><F.ChevronDown size={10} /> Devices and drives ({drives.length})</div>
      <div className={styles.pcDrives}>
        {drives.map((d) => {
          const used = d.total - d.free;
          return (
            <div key={d.letter} data-row className={`${styles.drive} ${selected.has(`${d.letter}:`) ? styles.rowSel : ""}`} onClick={(e) => click(e, fake(`${d.letter}:`))} onDoubleClick={() => navigate(`${d.letter}:`)}>
              <span className={styles.driveIcon}>{d.letter === "C" ? <A.DriveC size={48} /> : <A.DriveD size={48} />}</span>
              <span className={styles.driveInfo}>
                <span className={styles.driveName}>{d.label} ({d.letter}:)</span>
                <span className={styles.driveBar}><span className={`${styles.driveUsed} ${used / d.total > 0.9 ? styles.driveFull : ""}`} style={{ width: `${(used / d.total) * 100}%` }} /></span>
                <span className={styles.driveFree}>{gb(d.free)} free of {gb(d.total)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HomeView({ home, quick, recent, navigate, open, click, selected, fileMenu }: { home: string; quick: string[]; recent: VfsNode[]; navigate: (p: string) => void; open: (n: VfsNode) => void; click: (e: React.MouseEvent, n: VfsNode) => void; selected: Set<string>; fileMenu: (e: React.MouseEvent, n: VfsNode) => void }) {
  const os = useOS();
  const fake = (p: string): VfsNode => ({ name: folderNameFor(p), path: p, dir: true, size: 0, created: "", modified: "", hidden: false, system: false, openable: true, ext: "" });
  return (
    <div className={styles.homeView}>
      <div className={styles.groupHead}><F.ChevronDown size={10} /> Quick access</div>
      <div className={styles.quickGrid}>
        {quick.map((p) => (
          <div key={p} data-row className={`${styles.quickTile} ${selected.has(p) ? styles.rowSel : ""}`} onClick={(e) => click(e, fake(p))} onDoubleClick={() => navigate(p)}>
            <span className={styles.quickIcon}>{folderIcon(p, home, 40)}</span>
            <span className={styles.quickText}><span className={styles.quickName}>{folderNameFor(p)}</span><span className={styles.quickSub}>Pinned</span></span>
          </div>
        ))}
      </div>
      <div className={styles.groupHead}><F.ChevronDown size={10} /> Favorites</div>
      <div className={styles.favEmpty}>After you&apos;ve marked files as favorites, we&apos;ll show them here.</div>
      <div className={styles.groupHead}><F.ChevronDown size={10} /> Recent</div>
      <div className={styles.details}>
        <div className={styles.header}>
          <span className={styles.headerCell} style={{ width: 300 }}>Name</span>
          <span className={styles.headerCell} style={{ width: 150 }}>Date modified</span>
          <span className={styles.headerCell} style={{ width: 160 }}>Type</span>
          <span className={styles.headerCell} style={{ width: 80, justifyContent: "flex-end" }}>Size</span>
          <span className={styles.headerCell} style={{ width: 280 }}>File location</span>
        </div>
        {recent.map((n) => (
          <div key={n.path} data-row className={`${styles.row} ${selected.has(n.path) ? styles.rowSel : ""}`} onClick={(e) => click(e, n)} onDoubleClick={() => open(n)} onContextMenu={(e) => fileMenu(e, n)}>
            <span className={styles.cellName} style={{ width: 300 }}><span className={styles.rowIcon}><A.FileTypeIcon ext={n.ext} name={n.name} /></span><span className={styles.rowText}>{n.name}</span></span>
            <span className={styles.cell} style={{ width: 150 }}>{formatDateTime(n.modified, os.profile.locale)}</span>
            <span className={styles.cell} style={{ width: 160 }}>{A.typeLabel(n.ext, false)}</span>
            <span className={`${styles.cell} ${styles.cellSize}`} style={{ width: 80 }}>{formatSizeCol(n.size)}</span>
            <span className={styles.cell} style={{ width: 280 }}>{toWindowsPath(n.path.slice(0, n.path.lastIndexOf("/")))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
