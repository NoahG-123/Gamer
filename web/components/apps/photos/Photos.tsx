"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./photos.module.css";
import { WinState, useWM } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import { useOS } from "@/components/desktop/os";
import { useMenu } from "@/components/desktop/ContextMenu";
import { api, VfsNode, formatBytes, formatDateTime } from "@/lib/client/api";
import * as F from "@/components/icons/fluent";

const IMAGE = /^(jpg|jpeg|png|gif|bmp|webp|heic|tif|tiff|jfif)$/;
const urlFor = (p: string) => `/lf/${encodeURIComponent(p).replace(/%2F/g, "/")}`;

/** Windows Photos: the picture, the ones either side of it, and the things you can do to it. */
export function Photos({ win }: { win: WinState }) {
  const wm = useWM();
  const os = useOS();
  const menu = useMenu();
  const [items, setItems] = useState<VfsNode[]>([]);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [info, setInfo] = useState(false);
  const [filmstrip, setFilmstrip] = useState(true);
  const active = wm.activeId === win.id;
  const startPath = (win.props.path as string) || "";

  // Everything in the same folder as the picture that was opened; the whole gallery if none was.
  const load = useCallback(async () => {
    try {
      if (startPath) {
        const folder = startPath.slice(0, startPath.lastIndexOf("/"));
        const d = await api.list(folder, { record: false });
        const imgs = d.children.filter((n) => !n.dir && IMAGE.test(n.ext));
        if (imgs.length) {
          setItems(imgs);
          setIndex(Math.max(0, imgs.findIndex((n) => n.path === startPath)));
          return;
        }
      }
      const d = await api.search(os.home, ".");
      const imgs = d.results.filter((n) => !n.dir && IMAGE.test(n.ext)).sort((a, b) => b.modified.localeCompare(a.modified));
      setItems(imgs);
      setIndex(Math.max(0, imgs.findIndex((n) => n.path === startPath)));
    } catch { setItems([]); }
  }, [startPath, os.home]);
  useEffect(() => { void load(); }, [load, os.refreshTick]);

  const current = items[index];
  const go = useCallback((d: number) => { setIndex((i) => (items.length ? (i + d + items.length) % items.length : 0)); setZoom(1); setRotate(0); }, [items.length]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Delete" && current) void os.fs.remove([current.path]).then(load);
      else if (e.ctrlKey && (e.key === "+" || e.key === "=")) setZoom((z) => Math.min(6, z * 1.2));
      else if (e.ctrlKey && e.key === "-") setZoom((z) => Math.max(0.2, z / 1.2));
      else if (e.ctrlKey && e.key === "0") { setZoom(1); setRotate(0); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, go, current, os.fs, load]);

  const more = (e: React.MouseEvent) => {
    if (!current) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    menu.open({ x: r.right - 220, y: r.bottom + 4, items: [
      { label: "Set as background", icon: <F.ImageIcon />, onClick: () => os.fs.setWallpaper(current.path) },
      { label: "Open with Paint", icon: <F.PaintBrush />, onClick: () => os.launch("paint", { path: current.path }) },
      { label: "Open file location", icon: <F.Folder />, onClick: () => os.openFolder(current.path.slice(0, current.path.lastIndexOf("/"))) },
      { label: "Copy as path", icon: <F.Link />, onClick: () => navigator.clipboard?.writeText(`"${current.path.replace(/\//g, "\\")}"`).catch(() => {}) },
      { type: "sep" },
      { label: "Rename", icon: <F.Rename />, onClick: () => os.fs.rename(current) },
      { label: "Delete", icon: <F.Delete />, onClick: () => void os.fs.remove([current.path]).then(load) },
      { type: "sep" },
      { label: "File info", icon: <F.Info />, checked: info, onClick: () => setInfo((v) => !v) },
    ] });
  };

  const fit = useMemo(() => ({ transform: `scale(${zoom}) rotate(${rotate}deg)` }), [zoom, rotate]);

  return (
    <Window win={win} className={styles.win}>
      <div className={styles.frame}>
        <div className={styles.titleBar} data-drag>
          <span className={styles.titleText}>{current ? current.name : "Photos"}</span>
          <CaptionButtons win={win} />
        </div>
        <div className={styles.toolbar}>
          <button className={styles.tb} title="Previous (Left arrow)" disabled={items.length < 2} onClick={() => go(-1)}><F.ArrowLeft size={18} /></button>
          <button className={styles.tb} title="Next (Right arrow)" disabled={items.length < 2} onClick={() => go(1)}><F.ArrowRight size={18} /></button>
          <span className={styles.count}>{items.length ? `${index + 1} / ${items.length}` : ""}</span>
          <span style={{ flex: 1 }} />
          <button className={styles.tb} title="Zoom out (Ctrl+−)" onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))}><F.Close size={14} style={{ transform: "rotate(45deg)" }} /></button>
          <span className={styles.count}>{Math.round(zoom * 100)}%</span>
          <button className={styles.tb} title="Zoom in (Ctrl++)" onClick={() => setZoom((z) => Math.min(6, z * 1.2))}><F.Plus size={16} /></button>
          <button className={styles.tb} title="Fit (Ctrl+0)" onClick={() => { setZoom(1); setRotate(0); }}><F.ViewIcon size={18} /></button>
          <button className={styles.tb} title="Rotate" onClick={() => setRotate((r) => (r + 90) % 360)}><F.RestoreIcon size={18} /></button>
          <button className={styles.tb} title="Set as background" disabled={!current} onClick={() => current && os.fs.setWallpaper(current.path)}><F.ImageIcon size={18} /></button>
          <button className={styles.tb} title="Delete" disabled={!current} onClick={() => current && void os.fs.remove([current.path]).then(load)}><F.Delete size={18} /></button>
          <button className={styles.tb} title="See more" onClick={more}><F.MoreVert size={18} /></button>
        </div>
        <div className={styles.stage} onWheel={(e) => { if (e.ctrlKey) { e.preventDefault(); setZoom((z) => Math.max(0.2, Math.min(6, z * (e.deltaY < 0 ? 1.1 : 0.9)))); } }}>
          {current ? <img className={styles.img} style={fit} src={urlFor(current.path)} alt={current.name} draggable={false} /> : <div className={styles.empty}>No pictures to show.</div>}
          {info && current && (
            <aside className={styles.info}>
              <h3>File info</h3>
              <div><b>Name</b><span>{current.name}</span></div>
              <div><b>Folder</b><span>{current.path.slice(0, current.path.lastIndexOf("/")).replace(/\//g, "\\")}</span></div>
              <div><b>Size</b><span>{formatBytes(current.size)}</span></div>
              <div><b>Modified</b><span>{formatDateTime(current.modified, os.profile.locale, os.profile.dateFormat)}</span></div>
              <div><b>Type</b><span>{current.ext.toUpperCase()} image</span></div>
              <button className={styles.infoClose} onClick={() => setInfo(false)}>Close</button>
            </aside>
          )}
        </div>
        {filmstrip && items.length > 1 && (
          <div className={styles.strip}>
            {items.map((n, i) => (
              <button key={n.path} className={`${styles.thumb} ${i === index ? styles.thumbOn : ""}`} onClick={() => { setIndex(i); setZoom(1); setRotate(0); }} title={n.name}>
                <img src={urlFor(n.path)} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        <div className={styles.status}>
          <button className={styles.stripToggle} onClick={() => setFilmstrip((f) => !f)}>{filmstrip ? "Hide filmstrip" : "Show filmstrip"}</button>
          <span style={{ flex: 1 }} />
          {current && <span>{formatBytes(current.size)}</span>}
        </div>
      </div>
    </Window>
  );
}
