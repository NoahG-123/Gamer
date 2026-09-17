"use client";
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./ContextMenu.module.css";
import { ChevronRight } from "@/components/icons/fluent";

export type MenuItem =
  | { type: "sep" }
  | { type?: "item"; label: string; icon?: React.ReactNode; shortcut?: string; disabled?: boolean; checked?: boolean; onClick?: () => void; children?: MenuItem[]; danger?: boolean }
  | { type: "iconRow"; buttons: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean }[] }
  | { type: "custom"; render: () => React.ReactNode };

export interface MenuSpec { x: number; y: number; items: MenuItem[]; variant?: "win" | "chrome" | "wa"; width?: number; onClose?: () => void; anchorBottom?: boolean }

interface MenuApi { open: (spec: MenuSpec) => void; close: () => void; isOpen: boolean }
const Ctx = createContext<MenuApi | null>(null);
export const useMenu = () => { const v = useContext(Ctx); if (!v) throw new Error("useMenu outside MenuProvider"); return v; };

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const [spec, setSpec] = useState<MenuSpec | null>(null);
  const close = useCallback(() => { setSpec((s) => { s?.onClose?.(); return null; }); }, []);
  const open = useCallback((s: MenuSpec) => setSpec(s), []);
  useEffect(() => {
    if (!spec) return;
    const onDown = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.("[data-menu-root]")) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onBlur = () => close();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onBlur);
    return () => { window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("keydown", onKey); window.removeEventListener("blur", onBlur); window.removeEventListener("resize", onBlur); };
  }, [spec, close]);
  return (
    <Ctx.Provider value={{ open, close, isOpen: !!spec }}>
      {children}
      {spec && <MenuPanel spec={spec} items={spec.items} x={spec.x} y={spec.y} root onClose={close} />}
    </Ctx.Provider>
  );
}

function MenuPanel({ spec, items, x, y, root, onClose, sub }: { spec: MenuSpec; items: MenuItem[]; x: number; y: number; root?: boolean; onClose: () => void; sub?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [subPos, setSubPos] = useState({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight - (root && spec.variant !== "chrome" ? 48 : 0);
    let left = x, top = y;
    if (sub) { if (left + r.width > vw) left = x - r.width - (spec.width ?? 0) + 4; }
    else if (left + r.width > vw) left = Math.max(0, vw - r.width - 2);
    if (spec.anchorBottom && root) top = y - r.height;
    else if (top + r.height > vh) top = Math.max(0, (sub ? vh - r.height : y - r.height));
    setPos({ left, top, ready: true });
  }, [x, y, root, sub, spec]);
  const variant = spec.variant ?? "win";
  return (
    <div ref={ref} data-menu-root className={`${styles.menu} ${styles[variant]}`} style={{ left: pos.left, top: pos.top, visibility: pos.ready ? "visible" : "hidden", width: spec.width, zIndex: 100000 + (sub ? 1 : 0) }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => {
        if (it.type === "sep") return <div key={i} className={styles.sep} />;
        if (it.type === "custom") return <div key={i}>{it.render()}</div>;
        if (it.type === "iconRow") return (
          <div key={i} className={styles.iconRow}>
            {it.buttons.map((b, j) => (
              <button key={j} className={styles.iconBtn} title={b.label} disabled={b.disabled} onClick={() => { b.onClick?.(); onClose(); }}>{b.icon}</button>
            ))}
          </div>
        );
        const hasSub = !!it.children?.length;
        return (
          <div
            key={i}
            className={`${styles.item} ${it.disabled ? styles.disabled : ""} ${openSub === i ? styles.itemOpen : ""}`}
            onMouseEnter={(e) => {
              if (timer.current) clearTimeout(timer.current);
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              timer.current = setTimeout(() => { setOpenSub(hasSub ? i : null); setSubPos({ x: r.right - 4, y: r.top - 4 }); }, hasSub ? 180 : 250);
            }}
            onClick={(e) => { e.stopPropagation(); if (it.disabled || hasSub) return; it.onClick?.(); onClose(); }}
          >
            <span className={styles.iconCol}>{it.checked ? <CheckMark /> : it.icon}</span>
            <span className={styles.label}>{it.label}</span>
            {it.shortcut && <span className={styles.shortcut}>{it.shortcut}</span>}
            {hasSub && <span className={styles.arrow}><ChevronRight size={12} /></span>}
            {hasSub && openSub === i && <MenuPanel spec={spec} items={it.children!} x={subPos.x} y={subPos.y} onClose={onClose} sub />}
          </div>
        );
      })}
    </div>
  );
}

const CheckMark = () => <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
