"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./Notepad.module.css";
import { WinState, useWM } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import { NotepadIcon } from "@/components/icons/apps";
import { Plus, Gear } from "@/components/icons/fluent";

interface Tab { id: number; name: string; path?: string; initial: string; text: string }
let seq = 1;

/** Windows 11 Notepad: real tabs (+ / x / middle-click / Ctrl+N / Ctrl+W), closing the last tab closes the window. Edits are never saved. */
export function Notepad({ win }: { win: WinState }) {
  const wm = useWM();
  const make = (name: string, text: string, path?: string): Tab => ({ id: seq++, name, path, initial: text, text });
  const [tabs, setTabs] = useState<Tab[]>(() => [make(String(win.props.name ?? "Untitled"), String(win.props.text ?? ""), win.props.path as string | undefined)]);
  const [activeId, setActiveId] = useState<number>(() => tabs[0].id);
  const [pos, setPos] = useState({ ln: 1, col: 1 });
  const ta = useRef<HTMLTextAreaElement>(null);
  const active = wm.activeId === win.id;
  const tab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  // A second file opened into this window arrives as new props with a fresh nonce.
  const seen = useRef<unknown>(win.props.nonce);
  useEffect(() => {
    if (win.props.nonce === undefined || win.props.nonce === seen.current) return;
    seen.current = win.props.nonce;
    const t = make(String(win.props.name ?? "Untitled"), String(win.props.text ?? ""), win.props.path as string | undefined);
    setTabs((ts) => [...ts, t]); setActiveId(t.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.props.nonce]);

  const newTab = () => { const t = make("Untitled", ""); setTabs((ts) => [...ts, t]); setActiveId(t.id); };
  const closeTab = (id: number) => {
    setTabs((ts) => {
      const i = ts.findIndex((t) => t.id === id);
      const next = ts.filter((t) => t.id !== id);
      if (!next.length) { setTimeout(() => wm.close(win.id), 0); return ts; }
      setActiveId((cur) => (cur === id ? next[Math.min(i, next.length - 1)].id : cur));
      return next;
    });
  };
  const setText = (text: string) => setTabs((ts) => ts.map((t) => (t.id === tab.id ? { ...t, text } : t)));

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key.toLowerCase() === "n") { e.preventDefault(); newTab(); }
      else if (e.key.toLowerCase() === "w") { e.preventDefault(); closeTab(tab.id); }
      else if (e.key === "Tab") { e.preventDefault(); const i = tabs.findIndex((t) => t.id === tab.id); setActiveId(tabs[(i + (e.shiftKey ? tabs.length - 1 : 1)) % tabs.length].id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tab.id, tabs]);

  useEffect(() => { if (active) ta.current?.focus(); }, [active, activeId]);

  const dirty = tab.text !== tab.initial;
  const eol = useMemo(() => (tab.initial.includes("\r\n") || !tab.initial.includes("\n") ? "Windows (CRLF)" : "Unix (LF)"), [tab.initial]);
  const updatePos = () => {
    const el = ta.current; if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const lines = before.split("\n");
    setPos({ ln: lines.length, col: lines[lines.length - 1].length + 1 });
  };
  return (
    <Window win={win} className={styles.win}>
      <div className={styles.titleBar} data-drag>
        {tabs.map((t) => (
          <div key={t.id} className={`${styles.tab} ${t.id === tab.id ? styles.tabActive : styles.tabIdle}`} data-nodrag onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(t.id); } else if (e.button === 0) setActiveId(t.id); }} title={t.path ? t.path.replace(/\//g, "\\") : t.name}>
            <NotepadIcon size={16} />
            <span className={styles.tabTitle}>{t.text !== t.initial ? "*" : ""}{t.name}</span>
            <button className={styles.tabClose} onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} onMouseDown={(e) => e.stopPropagation()} aria-label="Close tab"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.1" /></svg></button>
          </div>
        ))}
        <button className={styles.newTab} data-nodrag title="Add new tab (Ctrl+N)" onClick={newTab}><Plus size={14} /></button>
        <div className={styles.dragSpace} />
        <CaptionButtons win={win} />
      </div>
      <div className={styles.menuBar}>
        <button className={styles.menuItem}>File</button>
        <button className={styles.menuItem}>Edit</button>
        <button className={styles.menuItem}>View</button>
        <div style={{ flex: 1 }} />
        <button className={styles.gear} title="Settings"><Gear size={16} /></button>
      </div>
      <textarea
        key={tab.id}
        ref={ta}
        className={styles.editor}
        value={tab.text}
        spellCheck={false}
        onChange={(e) => { setText(e.target.value); updatePos(); }}
        onKeyUp={updatePos}
        onClick={updatePos}
        wrap="off"
      />
      <div className={styles.status}>
        <span className={styles.statusCell}>Ln {pos.ln}, Col {pos.col}</span>
        <span className={styles.statusCell}>{tab.text.length.toLocaleString("en-US")} characters</span>
        <span style={{ flex: 1 }} />
        <span className={styles.statusCell}>100%</span>
        <span className={styles.statusCell}>{eol}</span>
        <span className={styles.statusCell}>UTF-8</span>
        <span className={styles.statusCell} style={{ paddingRight: 6, visibility: dirty ? "visible" : "hidden" }}>●</span>
      </div>
    </Window>
  );
}
