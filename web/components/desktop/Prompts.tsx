"use client";
import React, { useEffect, useRef, useState } from "react";
import styles from "./Prompts.module.css";
import { api, VfsNode } from "@/lib/client/api";

/** The small modal Windows shows when you rename something, with its real error text. */
export function RenameDialog({ node, onClose, onDone }: { node: VfsNode; onClose: () => void; onDone: (path: string) => void }) {
  const dot = node.name.lastIndexOf(".");
  const [value, setValue] = useState(node.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, node.dir || dot <= 0 ? node.name.length : dot);
  }, [node, dot]);

  const commit = async () => {
    if (busy) return;
    const name = value.trim();
    if (!name || name === node.name) { onClose(); return; }
    setBusy(true);
    try {
      const r = await api.rename(node.path, name);
      onDone(r.path);
    } catch (e) {
      setError(String((e as Error).message).includes("409") ? `There is already a file with the name you specified.` : `A file name can't contain any of the following characters:\n      \\ / : * ? " < > |`);
      setBusy(false);
    }
  };

  return (
    <div className={styles.scrim} onMouseDown={onClose}>
      <div className={styles.dialog} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.title}>Rename</div>
        <input
          ref={input}
          className={styles.input}
          value={value}
          spellCheck={false}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") void commit(); if (e.key === "Escape") onClose(); }}
        />
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.buttons}>
          <button className={`${styles.btn} ${styles.btnAccent}`} onClick={() => void commit()} disabled={busy}>Rename</button>
          <button className={styles.btn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** Windows' confirm box (deleting, emptying the bin). */
export function ConfirmDialog({ title, text, ok, onOk, onClose }: { title: string; text: string; ok: string; onOk: () => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "Enter") { onOk(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOk, onClose]);
  return (
    <div className={styles.scrim} onMouseDown={onClose}>
      <div className={styles.dialog} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.title}>{title}</div>
        <div className={styles.text}>{text}</div>
        <div className={styles.buttons}>
          <button className={`${styles.btn} ${styles.btnAccent}`} autoFocus onClick={() => { onOk(); onClose(); }}>{ok}</button>
          <button className={styles.btn} onClick={onClose}>No</button>
        </div>
      </div>
    </div>
  );
}

/** A plain message box, used where Windows would simply tell you something and stop. */
export function MessageDialog({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <div className={styles.scrim} onMouseDown={onClose}>
      <div className={styles.dialog} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.title}>{title}</div>
        <div className={styles.text}>{text}</div>
        <div className={styles.buttons}><button className={`${styles.btn} ${styles.btnAccent}`} autoFocus onClick={onClose}>OK</button></div>
      </div>
    </div>
  );
}

/** Windows' Open / Save As dialog, over the real virtual filesystem. */
export function FilePicker({ mode, start, suggested, filter, onPick, onClose }: { mode: "open" | "save"; start: string; suggested?: string; filter?: (n: VfsNode) => boolean; onPick: (path: string) => void; onClose: () => void }) {
  const [path, setPath] = useState(start);
  const [items, setItems] = useState<VfsNode[]>([]);
  const [name, setName] = useState(suggested ?? "");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => { api.list(path, { record: false }).then((d) => setItems(d.children)).catch(() => setItems([])); }, [path]);

  const shown = items.filter((n) => n.dir || !filter || filter(n));
  const up = () => { const i = path.lastIndexOf("/"); if (i > 2) setPath(path.slice(0, i)); };
  const go = () => {
    const n = name.trim();
    if (!n) return;
    onPick(/^[A-Za-z]:[\\/]/.test(n) ? n.replace(/\\/g, "/") : `${path}/${n}`);
  };

  return (
    <div className={styles.scrim} onMouseDown={onClose}>
      <div className={`${styles.dialog} ${styles.picker}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.title}>{mode === "open" ? "Open" : "Save As"}</div>
        <div className={styles.pickerBar}>
          <button className={styles.btn} onClick={up} disabled={path.length <= 3}>Up</button>
          <span className={styles.pickerPath}>{path.replace(/\//g, "\\")}</span>
        </div>
        <div className={styles.pickerList}>
          {shown.map((n) => (
            <button
              key={n.path}
              className={`${styles.pickerRow} ${selected === n.path ? styles.pickerRowSel : ""}`}
              onClick={() => { setSelected(n.path); if (!n.dir) setName(n.name); }}
              onDoubleClick={() => { if (n.dir) { setPath(n.path); setSelected(null); } else onPick(n.path); }}
            >
              <span className={styles.pickerIcon}>{n.dir ? "📁" : "📄"}</span>{n.name}
            </button>
          ))}
          {!shown.length && <div className={styles.pickerEmpty}>This folder is empty.</div>}
        </div>
        <div className={styles.pickerName}>
          <label>File name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} autoFocus spellCheck={false} />
        </div>
        <div className={styles.buttons}>
          <button className={`${styles.btn} ${styles.btnAccent}`} onClick={go}>{mode === "open" ? "Open" : "Save"}</button>
          <button className={styles.btn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
