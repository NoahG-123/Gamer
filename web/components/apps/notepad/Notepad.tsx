"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./Notepad.module.css";
import { WinState, useWM } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import { NotepadIcon } from "@/components/icons/apps";
import { Plus, Gear } from "@/components/icons/fluent";
import { useOS } from "@/components/desktop/os";
import { useMenu } from "@/components/desktop/ContextMenu";
import { FilePicker, ConfirmDialog, MessageDialog } from "@/components/desktop/Prompts";
import { api, VfsNode } from "@/lib/client/api";

interface Tab { id: number; name: string; path?: string; initial: string; text: string }
let seq = 1;

/**
 * Windows 11 Notepad. Real tabs (+ / x / middle-click / Ctrl+N / Ctrl+W) and real saving:
 * Ctrl+S writes the file back to this machine, Save As and Open use the file picker, and
 * closing a tab with unsaved work asks first, exactly like Notepad does.
 */
export function Notepad({ win }: { win: WinState }) {
  const wm = useWM();
  const os = useOS();
  const menu = useMenu();
  const [picker, setPicker] = useState<{ mode: "open" | "save"; tabId: number } | null>(null);
  const [ask, setAsk] = useState<{ title: string; text: string; ok: string; onOk: () => void } | null>(null);
  const [message, setMessage] = useState<{ title: string; text: string } | null>(null);
  const make = (name: string, text: string, path?: string): Tab => ({ id: seq++, name, path, initial: text, text });
  const [tabs, setTabs] = useState<Tab[]>(() => [make(String(win.props.name ?? "Untitled"), String(win.props.text ?? ""), win.props.path as string | undefined)]);
  const [activeId, setActiveId] = useState<number>(() => tabs[0].id);
  const [pos, setPos] = useState({ ln: 1, col: 1 });
  const [zoom, setZoom] = useState(100);
  const [wrap, setWrap] = useState(false);
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
  const closeTabNow = (id: number) => {
    setTabs((ts) => {
      const i = ts.findIndex((t) => t.id === id);
      const next = ts.filter((t) => t.id !== id);
      if (!next.length) { setTimeout(() => wm.close(win.id), 0); return ts; }
      setActiveId((cur) => (cur === id ? next[Math.min(i, next.length - 1)].id : cur));
      return next;
    });
  };
  const closeTab = (id: number) => {
    const t = tabs.find((x) => x.id === id);
    if (!t) return;
    closeWithPrompt(t, () => closeTabNow(id));
  };
  const setText = (text: string) => setTabs((ts) => ts.map((t) => (t.id === tab.id ? { ...t, text } : t)));

  const saveTo = async (t: Tab, path: string): Promise<boolean> => {
    try {
      await api.save(path, t.text);
      const name = path.slice(path.lastIndexOf("/") + 1);
      setTabs((ts) => ts.map((x) => (x.id === t.id ? { ...x, path, name, initial: x.text } : x)));
      os.fs.refresh();
      return true;
    } catch {
      setMessage({ title: "Notepad", text: "The file could not be saved. Check that the folder still exists and try again." });
      return false;
    }
  };
  const save = async (t: Tab = tab): Promise<boolean> => {
    if (!t.path) { setPicker({ mode: "save", tabId: t.id }); return false; }
    return saveTo(t, t.path);
  };
  const openFile = async (path: string) => {
    try {
      const res = await api.open(path);
      const text = res.openable && res.viewer === "notepad" ? res.text : "";
      const name = path.slice(path.lastIndexOf("/") + 1);
      const t = make(name, text, path);
      setTabs((ts) => [...ts, t]); setActiveId(t.id);
    } catch {
      setMessage({ title: "Notepad", text: `Cannot find the file.\n\nCheck the file name and try again.` });
    }
  };

  const closeWithPrompt = (t: Tab, andThen: () => void) => {
    if (t.text === t.initial) { andThen(); return; }
    setAsk({
      title: "Notepad",
      text: `Do you want to save changes to ${t.name}?`,
      ok: "Save",
      onOk: async () => { if (await save(t)) andThen(); },
    });
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key.toLowerCase() === "s") { e.preventDefault(); if (e.shiftKey) setPicker({ mode: "save", tabId: tab.id }); else void save(); }
      else if (e.key.toLowerCase() === "o") { e.preventDefault(); setPicker({ mode: "open", tabId: tab.id }); }
      else if (e.key.toLowerCase() === "n") { e.preventDefault(); newTab(); }
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
        <button className={styles.menuItem} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); menu.open({ x: r.left, y: r.bottom + 2, items: [
          { label: "New tab", shortcut: "Ctrl+N", onClick: newTab },
          { label: "Open...", shortcut: "Ctrl+O", onClick: () => setPicker({ mode: "open", tabId: tab.id }) },
          { type: "sep" },
          { label: "Save", shortcut: "Ctrl+S", onClick: () => void save() },
          { label: "Save as...", shortcut: "Ctrl+Shift+S", onClick: () => setPicker({ mode: "save", tabId: tab.id }) },
          { type: "sep" },
          { label: "Page setup...", disabled: true },
          { label: "Print...", shortcut: "Ctrl+P", disabled: true },
          { type: "sep" },
          { label: "Close tab", shortcut: "Ctrl+W", onClick: () => closeTab(tab.id) },
          { label: "Exit", onClick: () => wm.close(win.id) },
        ] }); }}>File</button>
        <button className={styles.menuItem} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); menu.open({ x: r.left, y: r.bottom + 2, items: [
          { label: "Undo", shortcut: "Ctrl+Z", onClick: () => document.execCommand("undo") },
          { type: "sep" },
          { label: "Cut", shortcut: "Ctrl+X", onClick: () => { document.execCommand("cut"); } },
          { label: "Copy", shortcut: "Ctrl+C", onClick: () => { const el = ta.current; if (el) navigator.clipboard?.writeText(el.value.slice(el.selectionStart, el.selectionEnd)).catch(() => {}); } },
          { label: "Paste", shortcut: "Ctrl+V", onClick: async () => { try { const text = await navigator.clipboard.readText(); const el = ta.current; if (el) { const v = el.value; setText(v.slice(0, el.selectionStart) + text + v.slice(el.selectionEnd)); } } catch { /* clipboard blocked */ } } },
          { label: "Delete", shortcut: "Del", onClick: () => { const el = ta.current; if (el && el.selectionEnd > el.selectionStart) setText(el.value.slice(0, el.selectionStart) + el.value.slice(el.selectionEnd)); } },
          { type: "sep" },
          { label: "Select all", shortcut: "Ctrl+A", onClick: () => ta.current?.select() },
          { label: "Time/Date", shortcut: "F5", onClick: () => { const el = ta.current; if (el) { const stamp = new Date().toLocaleString("en-CA", { hour: "numeric", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit" }); setText(el.value.slice(0, el.selectionStart) + stamp + el.value.slice(el.selectionEnd)); } } },
        ] }); }}>Edit</button>
        <button className={styles.menuItem} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); menu.open({ x: r.left, y: r.bottom + 2, items: [
          { label: "Zoom", children: [{ label: "Zoom in", shortcut: "Ctrl+Plus", onClick: () => setZoom((z) => Math.min(300, z + 10)) }, { label: "Zoom out", shortcut: "Ctrl+Minus", onClick: () => setZoom((z) => Math.max(50, z - 10)) }, { label: "Restore default zoom", shortcut: "Ctrl+0", onClick: () => setZoom(100) }] },
          { label: "Status bar", checked: true },
          { label: "Word wrap", checked: wrap, onClick: () => setWrap((w) => !w) },
        ] }); }}>View</button>
        <div style={{ flex: 1 }} />
        <button className={styles.gear} title="Settings" onClick={() => setMessage({ title: "Notepad", text: "Notepad settings are managed by Windows." })}><Gear size={16} /></button>
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
        wrap={wrap ? "soft" : "off"}
        style={{ fontSize: `${(12 * zoom) / 100}px`, whiteSpace: wrap ? "pre-wrap" : "pre" }}
      />
      <div className={styles.status}>
        <span className={styles.statusCell}>Ln {pos.ln}, Col {pos.col}</span>
        <span className={styles.statusCell}>{tab.text.length.toLocaleString("en-US")} characters</span>
        <span style={{ flex: 1 }} />
        <span className={styles.statusCell}>{zoom}%</span>
        <span className={styles.statusCell}>{eol}</span>
        <span className={styles.statusCell}>UTF-8</span>
        <span className={styles.statusCell} style={{ paddingRight: 6, visibility: dirty ? "visible" : "hidden" }}>●</span>
      </div>
      {picker && (
        <FilePicker
          mode={picker.mode}
          start={(tab.path && tab.path.slice(0, tab.path.lastIndexOf("/"))) || `${os.home}/Documents`}
          suggested={picker.mode === "save" ? tab.name.replace(/\*$/, "") : ""}
          onClose={() => setPicker(null)}
          onPick={async (path) => {
            const t = tabs.find((x) => x.id === picker.tabId) ?? tab;
            setPicker(null);
            if (picker.mode === "save") await saveTo(t, path); else await openFile(path);
          }}
        />
      )}
      {ask && <ConfirmDialog title={ask.title} text={ask.text} ok={ask.ok} onOk={ask.onOk} onClose={() => setAsk(null)} />}
      {message && <MessageDialog title={message.title} text={message.text} onClose={() => setMessage(null)} />}
    </Window>
  );
}
