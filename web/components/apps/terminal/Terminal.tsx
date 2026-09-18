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

/** Windows Terminal with a PowerShell tab. The shell itself runs server-side over the virtual filesystem. */
export function Terminal({ win }: { win: WinState }) {
  const wm = useWM();
  const os = useOS();
  const [cwd, setCwd] = useState<string>(String(win.props.cwd ?? os.home));
  const [mode, setMode] = useState<Mode>(null);
  const [out, setOut] = useState<Line[]>(BANNER.map((t) => ({ text: t })));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ prompt: string; line: string } | null>(null);
  const [hist, setHist] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const active = wm.activeId === win.id;
  const sshPrompt = useRef<string>("");

  const prompt = mode?.kind === "python" ? ">>> " : mode?.kind === "ssh" ? sshPrompt.current || `${mode.host}:~$ ` : `PS ${winPath(cwd)}> `;

  useEffect(() => { if (active) inputRef.current?.focus(); }, [active, busy, secret]);
  useEffect(() => { const el = bodyRef.current; if (el) el.scrollTop = el.scrollHeight; }, [out, input, busy]);

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
      if (res.exit) { wm.close(win.id); return; }
    } catch {
      setOut((o) => [...o, { text: "The connection to the shell was lost.", color: "red" }]);
    }
    setBusy(false);
  }, [cwd, mode, append, os, wm, win.id]);

  // Scripted launch (a trigger can open the terminal and type for the owner's automation).
  const scripted = useRef(false);
  useEffect(() => {
    const script = win.props.script as string[] | undefined;
    if (!script?.length || scripted.current) return;
    scripted.current = true;
    (async () => {
      for (const s of script) {
        await new Promise((r) => setTimeout(r, 350));
        setOut((o) => [...o, { text: `PS ${winPath(cwd)}> ${s}` }]);
        await run(s);
      }
      const autoClose = Number(win.props.autoClose ?? 0);
      if (autoClose) setTimeout(() => wm.close(win.id), autoClose);
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

  const title = mode?.kind === "ssh" ? `${sshPrompt.current.replace(/:.*$/, "")}` : "Windows PowerShell";

  return (
    <Window win={win} className={styles.win}>
      <div className={styles.titleBar} data-drag>
        <div className={styles.tab}>
          <TerminalAppIcon size={16} />
          <span className={styles.tabTitle}>{title}</span>
          <button className={styles.tabClose} data-nodrag aria-label="Close tab" onClick={() => wm.close(win.id)}><svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.1" /></svg></button>
        </div>
        <button className={styles.newTab} data-nodrag title="New tab (Ctrl+Shift+T)"><Plus size={14} /></button>
        <button className={styles.newTabDrop} data-nodrag><ChevronDown size={10} /></button>
        <div className={styles.dragSpace} />
        <CaptionButtons win={win} />
      </div>
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
    </Window>
  );
}
