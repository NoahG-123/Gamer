"use client";
import React, { useMemo, useRef, useState } from "react";
import styles from "./Notepad.module.css";
import { WinState } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import { NotepadIcon } from "@/components/icons/apps";
import { Plus, Gear, ChevronDown } from "@/components/icons/fluent";

/** Windows 11 Notepad, as a viewer for text files (read-only editing is deliberately allowed but never saved). */
export function Notepad({ win }: { win: WinState }) {
  const initial = String(win.props.text ?? "");
  const name = String(win.props.name ?? "Untitled");
  const [text, setText] = useState(initial);
  const [pos, setPos] = useState({ ln: 1, col: 1 });
  const ta = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== initial;
  const eol = useMemo(() => (initial.includes("\r\n") || !initial.includes("\n") ? "Windows (CRLF)" : "Unix (LF)"), [initial]);
  const updatePos = () => {
    const el = ta.current; if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const lines = before.split("\n");
    setPos({ ln: lines.length, col: lines[lines.length - 1].length + 1 });
  };
  return (
    <Window win={win} className={styles.win}>
      <div className={styles.titleBar} data-drag>
        <div className={styles.tab}>
          <NotepadIcon size={16} />
          <span className={styles.tabTitle}>{dirty ? "*" : ""}{name}</span>
          <button className={styles.tabClose} data-nodrag aria-label="Close tab"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.1" /></svg></button>
        </div>
        <button className={styles.newTab} data-nodrag title="Add new tab (Ctrl+N)"><Plus size={14} /></button>
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
        ref={ta}
        className={styles.editor}
        value={text}
        spellCheck={false}
        onChange={(e) => { setText(e.target.value); updatePos(); }}
        onKeyUp={updatePos}
        onClick={updatePos}
        wrap="off"
      />
      <div className={styles.status}>
        <span className={styles.statusCell}>Ln {pos.ln}, Col {pos.col}</span>
        <span className={styles.statusCell}>{text.length.toLocaleString("en-US")} characters</span>
        <span style={{ flex: 1 }} />
        <span className={styles.statusCell}>100%</span>
        <span className={styles.statusCell}>{eol}</span>
        <span className={styles.statusCell}>UTF-8</span>
        <span className={styles.statusCell} style={{ paddingRight: 6 }}><ChevronDown size={10} style={{ display: "none" }} /></span>
      </div>
    </Window>
  );
}
