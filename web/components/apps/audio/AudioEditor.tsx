"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./audio.module.css";
import { WinState, useWM } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import { useOS } from "@/components/desktop/os";
import { useSystem } from "@/lib/client/system";
import { FilePicker } from "@/components/desktop/Prompts";
import { api, VfsNode, formatBytes } from "@/lib/client/api";
import * as F from "@/components/icons/fluent";

interface Peaks { peaks: [number, number][]; seconds: number; sampleRate: number; clips: number[]; name: string; unsupported?: boolean }

const hms = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 1000);
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
};
const urlFor = (p: string) => `/lf/${encodeURIComponent(p).replace(/%2F/g, "/")}`;

/**
 * The audio editor on this machine. It opens a recording, draws its waveform, plays it,
 * and lets you move around inside it — which is what the files on here are for.
 */
export function AudioEditor({ win }: { win: WinState }) {
  const wm = useWM();
  const os = useOS();
  const sys = useSystem();
  const [path, setPath] = useState<string | null>((win.props.path as string) ?? null);
  const [data, setData] = useState<Peaks | null>(null);
  const [node, setNode] = useState<VfsNode | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(0); // seconds at the left edge
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<number | null>(null);
  const active = wm.activeId === win.id;

  const load = useCallback(async (p: string) => {
    setLoading(true); setError(null); setSel(null); setTime(0); setOffset(0); setZoom(1);
    try {
      const [peaks, listed] = await Promise.all([
        fetch(`/api/audio/peaks?path=${encodeURIComponent(p)}&buckets=2000`, { cache: "no-store" }).then((r) => r.json()),
        api.list(p.slice(0, p.lastIndexOf("/")), { record: false }).catch(() => null),
      ]);
      setNode(listed?.children.find((c) => c.path === p) ?? null);
      if (peaks.unsupported) { setError("This file has no waveform data on this machine."); setData(null); }
      else setData(peaks);
    } catch {
      setError("The file could not be opened.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (path) void load(path); }, [path, load]);
  useEffect(() => { const p = win.props.path as string | undefined; if (p && p !== path) setPath(p); }, [win.props.path, path]);

  // Draw the waveform, the playhead and any selection.
  useEffect(() => {
    const c = cv.current;
    if (!c || !data) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = (c.width = Math.floor(c.clientWidth * dpr));
    const h = (c.height = Math.floor(c.clientHeight * dpr));
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#14181c";
    g.fillRect(0, 0, w, h);

    const visible = data.seconds / zoom;
    const from = Math.max(0, Math.min(data.seconds - visible, offset));
    const i0 = Math.floor((from / data.seconds) * data.peaks.length);
    const i1 = Math.ceil(((from + visible) / data.seconds) * data.peaks.length);
    const slice = data.peaks.slice(i0, Math.max(i0 + 1, i1));

    // selection
    if (sel) {
      const x0 = ((sel[0] - from) / visible) * w, x1 = ((sel[1] - from) / visible) * w;
      g.fillStyle = "rgba(76,194,255,.14)";
      g.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), h);
    }
    // grid every 30s
    g.strokeStyle = "rgba(255,255,255,.07)";
    g.lineWidth = 1;
    const stepSec = visible > 900 ? 300 : visible > 300 ? 60 : visible > 60 ? 15 : visible > 10 ? 5 : 1;
    for (let t = Math.ceil(from / stepSec) * stepSec; t < from + visible; t += stepSec) {
      const x = ((t - from) / visible) * w;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      g.fillStyle = "rgba(255,255,255,.35)";
      g.font = `${11 * dpr}px system-ui`;
      g.fillText(hms(t).replace(/\.\d+$/, ""), x + 4 * dpr, 13 * dpr);
    }
    // waveform
    const mid = h / 2;
    g.fillStyle = "#4bd08b";
    const bw = w / slice.length;
    for (let i = 0; i < slice.length; i++) {
      const [lo, hi] = slice[i];
      const y0 = mid - hi * mid * 0.92;
      const y1 = mid - lo * mid * 0.92;
      g.fillRect(i * bw, y0, Math.max(1, bw), Math.max(1, y1 - y0));
    }
    g.strokeStyle = "rgba(255,255,255,.18)";
    g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
    // playhead
    if (time >= from && time <= from + visible) {
      const x = ((time - from) / visible) * w;
      g.strokeStyle = "#ff5f56"; g.lineWidth = 2 * dpr;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
  }, [data, zoom, offset, time, sel]);

  const seekTo = (t: number) => {
    setTime(t);
    if (audio.current) audio.current.currentTime = t;
  };
  const xToTime = (clientX: number) => {
    const c = cv.current!;
    const r = c.getBoundingClientRect();
    const visible = (data?.seconds ?? 0) / zoom;
    const from = Math.max(0, Math.min((data?.seconds ?? 0) - visible, offset));
    return Math.max(0, Math.min(data?.seconds ?? 0, from + ((clientX - r.left) / r.width) * visible));
  };

  const play = () => {
    const a = audio.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    sys.attachMedia(a);
    a.currentTime = time;
    void a.play().then(() => setPlaying(true)).catch(() => setError("Playback was blocked. Click the window and try again."));
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); play(); }
      else if (e.key === "Home") seekTo(0);
      else if (e.key === "ArrowRight") seekTo(Math.min(data?.seconds ?? 0, time + (e.shiftKey ? 30 : 5)));
      else if (e.key === "ArrowLeft") seekTo(Math.max(0, time - (e.shiftKey ? 30 : 5)));
      else if (e.ctrlKey && e.key.toLowerCase() === "o") { e.preventDefault(); setPicker(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Window win={win} className={styles.win}>
      <div className={styles.frame}>
        <div className={styles.titleBar} data-drag>
          <span className={styles.titleText}>{data?.name ?? node?.name ?? "REAPER"}{path ? "" : " — no file open"}</span>
          <CaptionButtons win={win} />
        </div>
        <div className={styles.toolbar}>
          <button className={styles.tb} title="Open (Ctrl+O)" onClick={() => setPicker(true)}><F.Folder size={16} /></button>
          <span className={styles.sep} />
          <button className={styles.tb} title="Go to start (Home)" onClick={() => seekTo(0)}><F.ArrowLeft size={16} /></button>
          <button className={`${styles.tb} ${playing ? styles.tbOn : ""}`} title="Play / pause (Space)" disabled={!path} onClick={play}>{playing ? <F.Pause size={16} /> : <F.Play size={16} />}</button>
          <button className={styles.tb} title="Stop" disabled={!path} onClick={() => { audio.current?.pause(); setPlaying(false); seekTo(0); }}><F.Close size={14} /></button>
          <span className={styles.sep} />
          <span className={styles.time}>{hms(time)}</span>
          <span className={styles.total}>/ {data ? hms(data.seconds) : "--:--"}</span>
          <span style={{ flex: 1 }} />
          {sel && <span className={styles.selInfo}>selection {hms(Math.abs(sel[1] - sel[0]))}</span>}
          <button className={styles.tb} title="Zoom out" onClick={() => setZoom((z) => Math.max(1, z / 2))}>−</button>
          <span className={styles.zoomVal}>{zoom}×</span>
          <button className={styles.tb} title="Zoom in" onClick={() => setZoom((z) => Math.min(512, z * 2))}>+</button>
        </div>
        <div className={styles.track}>
          <div className={styles.trackHead}>
            <span className={styles.trackName}>{data?.name ?? "—"}</span>
            <span className={styles.trackMeta}>{node ? formatBytes(node.size) : ""}</span>
            <span className={styles.trackMeta}>{data ? `${(data.sampleRate / 1000).toFixed(2)} kHz mono` : ""}</span>
          </div>
          <div className={styles.canvasWrap}>
            <canvas
              ref={cv}
              className={styles.canvas}
              onMouseDown={(e) => { const t = xToTime(e.clientX); dragging.current = t; setSel(null); seekTo(t); }}
              onMouseMove={(e) => { if (dragging.current !== null) { const t = xToTime(e.clientX); setSel([Math.min(dragging.current, t), Math.max(dragging.current, t)]); } }}
              onMouseUp={() => { dragging.current = null; }}
              onMouseLeave={() => { dragging.current = null; }}
              onWheel={(e) => {
                if (!data) return;
                if (e.ctrlKey) { setZoom((z) => Math.max(1, Math.min(512, e.deltaY < 0 ? z * 1.3 : z / 1.3))); return; }
                const visible = data.seconds / zoom;
                setOffset((o) => Math.max(0, Math.min(data.seconds - visible, o + (e.deltaY > 0 ? visible * 0.15 : -visible * 0.15))));
              }}
            />
            {loading && <div className={styles.overlayMsg}>Reading file…</div>}
            {!path && !loading && <div className={styles.overlayMsg}>Open a recording to see it.</div>}
            {error && <div className={styles.overlayMsg}>{error}</div>}
          </div>
          {data && (
            <input
              className={styles.scroll}
              type="range"
              min={0}
              max={Math.max(0, data.seconds - data.seconds / zoom)}
              step={0.1}
              value={Math.min(offset, Math.max(0, data.seconds - data.seconds / zoom))}
              onChange={(e) => setOffset(Number(e.target.value))}
              disabled={zoom === 1}
            />
          )}
        </div>
        <div className={styles.status}>
          <span>{path ? path.replace(/\//g, "\\") : "No file"}</span>
          <span style={{ flex: 1 }} />
          <span>{sys.settings.muted ? "output muted" : `output ${sys.settings.volume}%`}</span>
        </div>
      </div>
      <audio
        ref={audio}
        src={path ? urlFor(path) : undefined}
        preload="none"
        onTimeUpdate={(e) => {
          const t = (e.currentTarget as HTMLAudioElement).currentTime;
          setTime(t);
          if (data && zoom > 1) {
            const visible = data.seconds / zoom;
            if (t < offset || t > offset + visible * 0.92) setOffset(Math.max(0, Math.min(data.seconds - visible, t - visible * 0.1)));
          }
          if (sel && t >= sel[1]) { (e.currentTarget as HTMLAudioElement).pause(); setPlaying(false); }
        }}
        onEnded={() => setPlaying(false)}
        onError={() => setError("This file could not be played.")}
      />
      {picker && (
        <FilePicker
          mode="open"
          start={(path && path.slice(0, path.lastIndexOf("/"))) || `${os.home}/Documents`}
          filter={(n) => /^(wav|mp3|m4a|flac|aif|aiff|ogg)$/.test(n.ext)}
          onClose={() => setPicker(false)}
          onPick={(p) => { setPicker(false); setPath(p); }}
        />
      )}
    </Window>
  );
}
