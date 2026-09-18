"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Terminal.module.css";
import { WinState, useWM } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import { useOS } from "@/components/desktop/os";
import { TerminalAppIcon } from "@/components/icons/apps";
import { Plus, ChevronDown } from "@/components/icons/fluent";

interface Line { text: string; color?: string; delayMs?: number }
type Mode = { kind: "ssh"; host: string; cwd: string } | { kind: "python" } | null;
interface ExecResult { lines: Line[]; cwd: string; mode?: Mode; prompt?: string; clear?: boolean; exit?: boolean; open?: { app: string; props: Record<string, unknown> }; askSecret?: { prompt: string } }

const BANNER = ["Windows PowerShell", "Copyright (C) Microsoft Corporation. All rights reserved.", "", "Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows", ""];
const winPath = (p: string) => (/^[A-Z]:$/.test(p) ? p + "\\" : p.replace(/\//g, "\\"));
let tabSeq = 1;
interface TabInfo { id: number; title: string }

/** Windows Terminal: a tab strip of independent PowerShell sessions. Each pane keeps its own cwd, mode and scrollback. */
export function Terminal({ win }: { win: WinState }) {
  const wm = useWM();
  const os = useOS();
  const [tabs, setTabs] = useState<TabInfo[]>(() => [{ id: tabSeq++, title: "Windows PowerShell" }]);
  const [activeId, setActiveId] = useState<number>(() => tabs[0].id);
  const active = wm.activeId === win.id;
  const firstId = useRef(tabs[0].id);

  const newTab = () => { const t = { id: tabSeq++, title: "Windows PowerShell" }; setTabs((ts) => [...ts, t]); setActiveId(t.id); };
  const closeTab = useCallback((id: number) => {
    setTabs((ts) => {
      const i = ts.findIndex((t) => t.id === id);
      const next = ts.filter((t) => t.id !== id);
      if (!next.length) { setTimeout(() => wm.close(win.id), 0); return ts; }
      setActiveId((cur) => (cur === id ? next[Math.min(i, next.length - 1)].id : cur));
      return next;
    });
  }, [wm, win.id]);
  const setTitle = useCallback((id: number, title: string) => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, title } : t))), []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.shiftKey)) return;
      if (e.key.toLowerCase() === "t") { e.preventDefault(); newTab(); }
      else if (e.key.toLowerCase() === "w") { e.preventDefault(); closeTab(activeId); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeId, closeTab]);

  return (
    <Window win={win} className={styles.win}>
      <div className={styles.titleBar} data-drag>
        {tabs.map((t) => (
          <div key={t.id} className={`${styles.tab} ${t.id === activeId ? "" : styles.tabIdle}`} data-nodrag onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(t.id); } else if (e.button === 0) setActiveId(t.id); }}>
            <TerminalAppIcon size={16} />
            <span className={styles.tabTitle}>{t.title}</span>
            <button className={styles.tabClose} onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} onMouseDown={(e) => e.stopPropagation()} aria-label="Close tab"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.1" /></svg></button>
          </div>
        ))}
        <button className={styles.newTab} data-nodrag title="New tab (Ctrl+Shift+T)" onClick={newTab}><Plus size={14} /></button>
        <button className={styles.newTabDrop} data-nodrag onClick={newTab}><ChevronDown size={10} /></button>
        <div className={styles.dragSpace} />
        <CaptionButtons win={win} />
      </div>
      {tabs.map((t) => (
        <Pane key={t.id} id={t.id} visible={t.id === activeId} winActive={active} initialCwd={String(win.props.cwd ?? os.home)} script={t.id === firstId.current ? (win.props.script as string[] | undefined) : undefined} autoClose={t.id === firstId.current ? Number(win.props.autoClose ?? 0) : 0}
          onExit={() => closeTab(t.id)} onTitle={(s) => setTitle(t.id, s)} />
      ))}
    </Window>
  );
}

function Pane({ id, visible, winActive, initialCwd, script, autoClose, onExit, onTitle }: { id: number; visible: boolean; winActive: boolean; initialCwd: string; script?: string[]; autoClose: number; onExit: () => void; onTitle: (s: string) => void }) {
  const os = useOS();
  const [cwd, setCwd] = useState<string>(initialCwd);
  const [mode, setMode] = useState<Mode>(null);
  const [out, setOut] = useState<Line[]>(BANNER.map((t) => ({ text: t })));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ prompt: string; line: string } | null>(null);
  const [hist, setHist] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sshPrompt = useRef<string>("");
  const exitRef = useRef(onExit); exitRef.current = onExit;
  const titleRef = useRef(onTitle); titleRef.current = onTitle;

  const prompt = mode?.kind === "python" ? ">>> " : mode?.kind === "ssh" ? sshPrompt.current || `${mode.host}:~$ ` : `PS ${winPath(cwd)}> `;

  useEffect(() => { if (winActive && visible) inputRef.current?.focus(); }, [winActive, visible, busy, secret]);
  useEffect(() => { const el = bodyRef.current; if (el) el.scrollTop = el.scrollHeight; }, [out, input, busy]);
  useEffect(() => { titleRef.current(mode?.kind === "ssh" ? sshPrompt.current.replace(/:.*$/, "") : mode?.kind === "python" ? "python" : "Windows PowerShell"); }, [mode]);

  const append = useCallback(async (lines: Line[]) => {
    for (const l of lines) {
      if (l.delayMs) await new Promise((r) => setTimeout(r, l.delayMs));
      setOut((o) => [...o, l]);
    }
  }, []);

  const run = useCallback(async (line: string, stdin?: string) => {
    setBusy(true);
    try {
      const r = await fetch("/api/terminal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ line, cwd, stdin, mode }) });
      const res = (await r.json()) as ExecResult;
      if (res.clear) setOut([]);
      await append(res.lines);
      setCwd(res.cwd);
      if (res.mode !== undefined) {
        setMode(res.mode);
        if (res.mode?.kind === "ssh") sshPrompt.current = res.prompt ?? `${res.mode.host}:~$ `;
      }
      if (res.askSecret) { setSecret({ prompt: res.askSecret.prompt, line }); setBusy(false); return; }
      if (res.open) {
        if (res.open.app === "file" && res.open.props.path) { const p = String(res.open.props.path); fetch(`/api/fs/list?path=${encodeURIComponent(p.slice(0, p.lastIndexOf("/")))}&record=0`).then((x) => x.json()).then((d) => { const n = d.children.find((c: { path: string }) => c.path === p); if (n) os.openFile(n); }).catch(() => {}); }
        else if (res.open.app === "file") os.launch("notepad", { name: String(res.open.props.newFile ?? "Untitled").split("/").pop(), text: "" });
        else os.launch(res.open.app as "explorer" | "chrome" | "whatsapp" | "notepad", res.open.props);
      }
      if (res.exit) { exitRef.current(); return; }
    } catch {
      setOut((o) => [...o, { text: "The connection to the shell was lost.", color: "red" }]);
    }
    setBusy(false);
  }, [cwd, mode, append, os]);

  // Scripted launch (a trigger can open the terminal and type for the owner's automation).
  const scripted = useRef(false);
  useEffect(() => {
    if (!script?.length || scripted.current) return;
    scripted.current = true;
    (async () => {
      for (const s of script) {
        await new Promise((r) => setTimeout(r, 350));
        setOut((o) => [...o, { text: `PS ${winPath(cwd)}> ${s}` }]);
        await run(s);
      }
      if (autoClose) setTimeout(() => exitRef.current(), autoClose);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (busy) return;
    if (secret) {
      const pw = input; setInput("");
      setOut((o) => [...o, { text: secret.prompt }]);
      const line = secret.line; setSecret(null);
      await run(line, pw);
      return;
    }
    const line = input;
    setOut((o) => [...o, { text: prompt + line }]);
    setInput(""); setHistIdx(-1);
    if (line.trim()) setHist((h) => [...h, line]);
    await run(line);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); const i = histIdx < 0 ? hist.length - 1 : Math.max(0, histIdx - 1); if (hist[i] !== undefined) { setHistIdx(i); setInput(hist[i]); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); if (histIdx < 0) return; const i = histIdx + 1; if (i >= hist.length) { setHistIdx(-1); setInput(""); } else { setHistIdx(i); setInput(hist[i]); } return; }
    if (e.key === "l" && e.ctrlKey) { e.preventDefault(); setOut([]); return; }
    if (e.key === "c" && e.ctrlKey && !window.getSelection()?.toString()) { e.preventDefault(); if (secret) { setSecret(null); } setOut((o) => [...o, { text: prompt + input + "^C" }]); setInput(""); return; }
    if (e.key === "d" && e.ctrlKey && mode) { e.preventDefault(); setInput(""); run(mode.kind === "python" ? "exit()" : "exit"); return; }
    if (e.key === "Tab") { e.preventDefault(); }
  };

  return (
    <div className={`${styles.pane} ${visible ? "" : styles.paneHidden}`} data-pane={id}>
      <div className={styles.body} ref={bodyRef} onMouseUp={() => { if (!window.getSelection()?.toString()) inputRef.current?.focus(); }}>
        {out.map((l, i) => <div key={i} className={`${styles.line} ${l.color ? styles["c_" + l.color] : ""}`}>{l.text || " "}</div>)}
        {!busy && (
          <div className={styles.promptRow}>
            <span className={styles.prompt}>{secret ? secret.prompt : prompt}</span>
            <input ref={inputRef} className={styles.input} value={input} type={secret ? "password" : "text"} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} spellCheck={false} autoComplete="off" autoCapitalize="off" />
          </div>
        )}
        {busy && <div className={styles.line}>&nbsp;</div>}
      </div>
    </div>
  );
}
