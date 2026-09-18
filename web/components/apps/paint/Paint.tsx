"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./paint.module.css";
import { WinState, useWM } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import { useOS } from "@/components/desktop/os";
import { useMenu } from "@/components/desktop/ContextMenu";
import { FilePicker, MessageDialog } from "@/components/desktop/Prompts";
import { api } from "@/lib/client/api";
import * as F from "@/components/icons/fluent";

type Tool = "pencil" | "brush" | "eraser" | "line" | "rect" | "ellipse" | "fill" | "picker" | "text";
const COLOURS = ["#000000", "#7f7f7f", "#880015", "#ed1c24", "#ff7f27", "#fff200", "#22b14c", "#00a2e8", "#3f48cc", "#a349a4", "#ffffff", "#c3c3c3", "#b97a57", "#ffaec9", "#ffc90e", "#efe4b0", "#b5e61d", "#99d9ea", "#7092be", "#c8bfe7"];

/** Paint: a real canvas. It draws, it undoes, and it saves a PNG onto this machine. */
export function Paint({ win }: { win: WinState }) {
  const wm = useWM();
  const os = useOS();
  const menu = useMenu();
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [colour, setColour] = useState("#000000");
  const [size, setSize] = useState(6);
  const [path, setPath] = useState<string | null>((win.props.path as string) ?? null);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<"open" | "save" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const undo = useRef<ImageData[]>([]);
  const drawing = useRef<{ x: number; y: number } | null>(null);
  const active = wm.activeId === win.id;

  // A white sheet, or the picture that was opened.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext("2d");
    if (!g) return;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, c.width, c.height);
    const p = win.props.path as string | undefined;
    if (!p) return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, c.width / img.width, c.height / img.height);
      g.drawImage(img, 0, 0, img.width * scale, img.height * scale);
      setStatus(`${img.width} × ${img.height}px`);
    };
    img.src = `/lf/${encodeURIComponent(p).replace(/%2F/g, "/")}`;
  }, [win.props.path]);

  const snapshot = () => {
    const c = canvas.current, g = c?.getContext("2d");
    if (!c || !g) return;
    undo.current.push(g.getImageData(0, 0, c.width, c.height));
    if (undo.current.length > 24) undo.current.shift();
  };
  const stepBack = () => {
    const c = canvas.current, g = c?.getContext("2d");
    const last = undo.current.pop();
    if (c && g && last) { g.putImageData(last, 0, 0); setDirty(true); }
  };

  const pos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: Math.round(((e.clientX - r.left) / r.width) * c.width), y: Math.round(((e.clientY - r.top) / r.height) * c.height) };
  };

  const floodFill = (x: number, y: number, hex: string) => {
    const c = canvas.current!, g = c.getContext("2d")!;
    const img = g.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const at = (px: number, py: number) => (py * c.width + px) * 4;
    const start = at(x, y);
    const target = [d[start], d[start + 1], d[start + 2], d[start + 3]];
    const rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
    if (target.every((v, i) => v === rgb[i])) return;
    const stack = [[x, y]];
    const close = (o: number) => Math.abs(d[o] - target[0]) < 18 && Math.abs(d[o + 1] - target[1]) < 18 && Math.abs(d[o + 2] - target[2]) < 18 && Math.abs(d[o + 3] - target[3]) < 18;
    while (stack.length) {
      const [px, py] = stack.pop()!;
      if (px < 0 || py < 0 || px >= c.width || py >= c.height) continue;
      const o = at(px, py);
      if (!close(o)) continue;
      d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    g.putImageData(img, 0, 0);
  };

  const onDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = pos(e);
    const c = canvas.current!, g = c.getContext("2d")!;
    if (tool === "picker") {
      const d = g.getImageData(p.x, p.y, 1, 1).data;
      setColour(`#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
      setTool("brush");
      return;
    }
    snapshot();
    if (tool === "fill") { floodFill(p.x, p.y, colour); setDirty(true); return; }
    drawing.current = p;
    if (tool === "pencil" || tool === "brush" || tool === "eraser") {
      g.strokeStyle = tool === "eraser" ? "#ffffff" : colour;
      g.lineWidth = tool === "pencil" ? 1 : size;
      g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath();
      g.moveTo(p.x, p.y);
    }
  };
  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = pos(e);
    setStatus(`${p.x}, ${p.y}px`);
    if (!drawing.current) return;
    const c = canvas.current!, g = c.getContext("2d")!;
    if (tool === "pencil" || tool === "brush" || tool === "eraser") {
      g.lineTo(p.x, p.y);
      g.stroke();
      setDirty(true);
      return;
    }
    // Shapes preview on the overlay so the sheet is only touched on release.
    const pv = preview.current!;
    const pg = pv.getContext("2d")!;
    pg.clearRect(0, 0, pv.width, pv.height);
    pg.strokeStyle = colour; pg.lineWidth = size;
    const s = drawing.current;
    pg.beginPath();
    if (tool === "line") { pg.moveTo(s.x, s.y); pg.lineTo(p.x, p.y); }
    else if (tool === "rect") pg.rect(s.x, s.y, p.x - s.x, p.y - s.y);
    else pg.ellipse((s.x + p.x) / 2, (s.y + p.y) / 2, Math.abs(p.x - s.x) / 2, Math.abs(p.y - s.y) / 2, 0, 0, Math.PI * 2);
    pg.stroke();
  };
  const onUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = drawing.current;
    drawing.current = null;
    if (!s) return;
    const p = pos(e);
    const pv = preview.current!;
    pv.getContext("2d")!.clearRect(0, 0, pv.width, pv.height);
    if (tool === "line" || tool === "rect" || tool === "ellipse") {
      const g = canvas.current!.getContext("2d")!;
      g.strokeStyle = colour; g.lineWidth = size;
      g.beginPath();
      if (tool === "line") { g.moveTo(s.x, s.y); g.lineTo(p.x, p.y); }
      else if (tool === "rect") g.rect(s.x, s.y, p.x - s.x, p.y - s.y);
      else g.ellipse((s.x + p.x) / 2, (s.y + p.y) / 2, Math.abs(p.x - s.x) / 2, Math.abs(p.y - s.y) / 2, 0, 0, Math.PI * 2);
      g.stroke();
      setDirty(true);
    }
  };

  const saveTo = useCallback(async (target: string) => {
    const c = canvas.current;
    if (!c) return;
    const data = c.toDataURL("image/png");
    try {
      await fetch("/api/fs/mutate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "save", path: target, text: data, kind: "image" }) });
      setPath(target);
      setDirty(false);
      os.fs.refresh();
    } catch {
      setMessage("The picture could not be saved. Check that the folder still exists and try again.");
    }
  }, [os.fs]);

  const save = useCallback(() => { if (path) void saveTo(path); else setPicker("save"); }, [path, saveTo]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); if (e.shiftKey) setPicker("save"); else save(); }
      else if (k === "o") { e.preventDefault(); setPicker("open"); }
      else if (k === "z") { e.preventDefault(); stepBack(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, save]);

  const TOOLS: [Tool, React.ReactNode, string][] = [
    ["pencil", <F.Rename key="p" size={16} />, "Pencil"],
    ["brush", <F.PaintBrush key="b" size={16} />, "Brush"],
    ["eraser", <F.Close key="e" size={16} />, "Eraser"],
    ["fill", <F.ColorIcon key="f" size={16} />, "Fill with colour"],
    ["picker", <F.Eye key="k" size={16} />, "Colour picker"],
    ["line", <F.More key="l" size={16} />, "Line"],
    ["rect", <F.Grid key="r" size={16} />, "Rectangle"],
    ["ellipse", <F.Globe key="o" size={16} />, "Ellipse"],
  ];

  return (
    <Window win={win} className={styles.win}>
      <div className={styles.frame}>
        <div className={styles.titleBar} data-drag>
          <span className={styles.titleText}>{(path ? path.slice(path.lastIndexOf("/") + 1) : "Untitled") + (dirty ? " *" : "")} - Paint</span>
          <CaptionButtons win={win} />
        </div>
        <div className={styles.menuBar}>
          <button className={styles.menuItem} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); menu.open({ x: r.left, y: r.bottom + 2, items: [
            { label: "New", shortcut: "Ctrl+N", onClick: () => { snapshot(); const c = canvas.current!, g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); setPath(null); setDirty(false); } },
            { label: "Open...", shortcut: "Ctrl+O", onClick: () => setPicker("open") },
            { label: "Save", shortcut: "Ctrl+S", onClick: save },
            { label: "Save as...", shortcut: "Ctrl+Shift+S", onClick: () => setPicker("save") },
            { type: "sep" },
            { label: "Set as desktop background", disabled: !path, onClick: () => path && os.fs.setWallpaper(path) },
            { type: "sep" },
            { label: "Exit", onClick: () => wm.close(win.id) },
          ] }); }}>File</button>
          <button className={styles.menuItem} onClick={stepBack}>Undo</button>
        </div>
        <div className={styles.ribbon}>
          <div className={styles.group}>
            {TOOLS.map(([t, icon, label]) => (
              <button key={t} className={`${styles.tool} ${tool === t ? styles.toolOn : ""}`} title={label} onClick={() => setTool(t)}>{icon}</button>
            ))}
          </div>
          <div className={styles.group}>
            <span className={styles.groupLabel}>Size</span>
            <input className={styles.size} type="range" min={1} max={48} value={size} onChange={(e) => setSize(Number(e.target.value))} />
            <span className={styles.sizeVal}>{size}px</span>
          </div>
          <div className={styles.group}>
            <span className={styles.swatchCurrent} style={{ background: colour }} />
            <div className={styles.palette}>
              {COLOURS.map((c) => <button key={c} className={styles.swatch} style={{ background: c }} onClick={() => setColour(c)} aria-label={c} />)}
            </div>
            <input className={styles.colourInput} type="color" value={colour} onChange={(e) => setColour(e.target.value)} title="Edit colours" />
          </div>
        </div>
        <div className={styles.sheetWrap}>
          <div className={styles.sheet}>
            <canvas ref={canvas} className={styles.canvas} width={1000} height={620} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} />
            <canvas ref={preview} className={styles.overlay} width={1000} height={620} />
          </div>
        </div>
        <div className={styles.status}>
          <span>{status || "1000 × 620px"}</span>
          <span style={{ flex: 1 }} />
          <span>{path ? path.replace(/\//g, "\\") : "Not saved"}</span>
        </div>
      </div>
      {picker && (
        <FilePicker
          mode={picker}
          start={(path && path.slice(0, path.lastIndexOf("/"))) || `${os.home}/Pictures`}
          suggested={picker === "save" ? (path ? path.slice(path.lastIndexOf("/") + 1) : "Untitled.png") : ""}
          filter={(n) => /^(png|jpg|jpeg|bmp|gif|webp)$/.test(n.ext)}
          onClose={() => setPicker(null)}
          onPick={async (p) => {
            const mode = picker;
            setPicker(null);
            if (mode === "save") await saveTo(p.endsWith(".png") ? p : `${p}.png`);
            else {
              const c = canvas.current!, g = c.getContext("2d")!;
              const img = new Image();
              img.onload = () => { snapshot(); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); const s = Math.min(1, c.width / img.width, c.height / img.height); g.drawImage(img, 0, 0, img.width * s, img.height * s); setPath(p); setDirty(false); };
              img.onerror = () => setMessage("Paint cannot read this file.");
              img.src = `/lf/${encodeURIComponent(p).replace(/%2F/g, "/")}`;
            }
          }}
        />
      )}
      {message && <MessageDialog title="Paint" text={message} onClose={() => setMessage(null)} />}
    </Window>
  );
}
