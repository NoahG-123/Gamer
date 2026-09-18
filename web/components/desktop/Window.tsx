"use client";
import React, { useCallback, useEffect, useRef } from "react";
import { useWM, WinState } from "./wm";
import styles from "./Window.module.css";

/**
 * Generic Windows 11 window frame: rounded corners, 1px border, shadow, drag on any
 * element marked data-drag, edge/corner resize, snap-to-maximize on drag to top edge.
 * Apps render their own title bars (each real app looks different).
 */
export function Window({ win, children, className, frameless }: { win: WinState; children: React.ReactNode; className?: string; frameless?: boolean }) {
  const wm = useWM();
  const ref = useRef<HTMLDivElement>(null);
  const active = wm.activeId === win.id;
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean; wasMax: boolean } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    wm.focus(win.id);
    const target = e.target as HTMLElement;
    const dragEl = target.closest("[data-drag]");
    if (!dragEl || target.closest("[data-nodrag]") || e.button !== 0) return;
    if (e.detail === 2) { if (win.resizable !== false) wm.toggleMax(win.id); return; }
    drag.current = { sx: e.clientX, sy: e.clientY, ox: win.x, oy: win.y, moved: false, wasMax: win.maximized };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [wm, win]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    if (d.wasMax) {
      // Dragging a maximized window restores it under the cursor.
      const r = win.restore ?? { x: win.x, y: win.y, w: Math.round(win.w * 0.7), h: Math.round(win.h * 0.7) };
      const ratio = e.clientX / win.w;
      d.ox = Math.round(e.clientX - r.w * ratio);
      d.oy = 0;
      d.sx = e.clientX; d.sy = e.clientY;
      d.wasMax = false;
      wm.setGeom(win.id, { x: d.ox, y: d.oy, w: r.w, h: r.h });
      wm.toggleMax(win.id);
      return;
    }
    d.moved = true;
    const sc = wm.screen();
    const ny = Math.max(-4, Math.min(sc.h - 60, d.oy + dy));
    wm.setGeom(win.id, { x: d.ox + dx, y: ny });
  }, [wm, win]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved && e.clientY <= 0 && win.resizable !== false) wm.toggleMax(win.id);
  }, [wm, win]);

  // Resize handles
  const resize = useRef<{ dir: string; sx: number; sy: number; x: number; y: number; w: number; h: number } | null>(null);
  const onResizeDown = (dir: string) => (e: React.PointerEvent) => {
    if (win.maximized || win.resizable === false) return;
    e.stopPropagation();
    wm.focus(win.id);
    resize.current = { dir, sx: e.clientX, sy: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resize.current;
    if (!r) return;
    const dx = e.clientX - r.sx, dy = e.clientY - r.sy;
    const minW = win.minW ?? 200, minH = win.minH ?? 120;
    let { x, y, w, h } = r;
    if (r.dir.includes("e")) w = Math.max(minW, r.w + dx);
    if (r.dir.includes("s")) h = Math.max(minH, r.h + dy);
    if (r.dir.includes("w")) { w = Math.max(minW, r.w - dx); x = r.x + (r.w - w); }
    if (r.dir.includes("n")) { h = Math.max(minH, r.h - dy); y = r.y + (r.h - h); }
    wm.setGeom(win.id, { x, y, w, h });
  };
  const onResizeUp = () => { resize.current = null; };

  useEffect(() => {
    if (active) ref.current?.focus({ preventScroll: true });
  }, [active]);

  const style: React.CSSProperties = {
    left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z,
    display: win.minimized ? "none" : undefined,
  };
  const dirs = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  return (
    <div
      ref={ref}
      className={`${styles.window} ${win.maximized ? styles.maximized : ""} ${active ? styles.active : styles.inactive} ${frameless ? styles.frameless : ""} ${className ?? ""}`}
      style={style}
      tabIndex={-1}
      data-window={win.app}
      data-window-id={win.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className={styles.content}>{children}</div>
      {!win.maximized && win.resizable !== false && dirs.map((d) => (
        <div key={d} className={`${styles.handle} ${styles["h_" + d]}`} onPointerDown={onResizeDown(d)} onPointerMove={onResizeMove} onPointerUp={onResizeUp} onPointerCancel={onResizeUp} />
      ))}
    </div>
  );
}

/** Windows 11 caption buttons (minimize / maximize-restore / close). */
export function CaptionButtons({ win, dark, closeOnly, className }: { win: WinState; dark?: boolean; closeOnly?: boolean; className?: string }) {
  const wm = useWM();
  return (
    <div className={`${styles.caption} ${dark ? styles.captionDark : ""} ${className ?? ""}`} data-nodrag>
      {!closeOnly && (
        <button className={styles.capBtn} aria-label="Minimize" onClick={() => wm.minimize(win.id)}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" /></svg>
        </button>
      )}
      {!closeOnly && (
        <button className={styles.capBtn} aria-label={win.maximized ? "Restore" : "Maximize"} onClick={() => wm.toggleMax(win.id)} disabled={win.resizable === false}>
          {win.maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 2.5V1a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H7.5" fill="none" stroke="currentColor" strokeWidth="1" /><rect x="0.5" y="2.5" width="7" height="7" rx=".8" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          )}
        </button>
      )}
      <button className={`${styles.capBtn} ${styles.capClose}`} aria-label="Close" onClick={() => wm.close(win.id)}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1" /></svg>
      </button>
    </div>
  );
}
