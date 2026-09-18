"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, SettingsState } from "./api";

/**
 * Machine-level state every app shares: volume, brightness, the radios, theme and
 * wallpaper. These are real controls — the volume slider changes what comes out of the
 * speakers, brightness dims the screen, turning Wi-Fi off takes the browser offline.
 */
export interface System {
  settings: SettingsState;
  set: (patch: Partial<SettingsState>) => void;
  /** Play a UI sound at the current volume (silent while muted). */
  play: (name: SoundName) => void;
  /** Register a media element so the volume slider controls it too. */
  attachMedia: (el: HTMLMediaElement | null) => void;
  online: boolean;
}

export type SoundName = "notify" | "message" | "error" | "unlock" | "click" | "empty-bin" | "device-connect" | "discovery";

const DEFAULTS: SettingsState = { volume: 34, muted: true, brightness: 100, wifi: true, bluetooth: false, airplane: false, nightLight: false, theme: "dark", accent: "#0067C0", wallpaper: "wallpaper.desktop", wallpaperFit: "fill" };
const Ctx = createContext<System | null>(null);

export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(DEFAULTS);
  const media = useRef(new Set<HTMLMediaElement>());
  const audioCtx = useRef<AudioContext | null>(null);
  const settingsRef = useRef(settings); settingsRef.current = settings;

  useEffect(() => { api.settings().then((d) => setSettings(d.settings)).catch(() => {}); }, []);

  // Volume applies to everything already playing, and to anything that starts later.
  useEffect(() => {
    const v = settings.muted ? 0 : settings.volume / 100;
    for (const el of media.current) el.volume = v;
  }, [settings.volume, settings.muted]);

  const set = useCallback((patch: Partial<SettingsState>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      // Airplane mode owns the radios, the way it does on a real machine.
      if (patch.airplane === true) { next.wifi = false; next.bluetooth = false; }
      if (patch.wifi === true || patch.bluetooth === true) next.airplane = false;
      return next;
    });
    api.setSettings(patch).then((d) => setSettings(d.settings)).catch(() => {});
  }, []);

  const attachMedia = useCallback((el: HTMLMediaElement | null) => {
    if (!el) return;
    media.current.add(el);
    el.volume = settingsRef.current.muted ? 0 : settingsRef.current.volume / 100;
    el.addEventListener("emptied", () => media.current.delete(el), { once: true });
  }, []);

  const play = useCallback((name: SoundName) => {
    const s = settingsRef.current;
    if (s.muted || s.volume <= 0) return;
    try {
      audioCtx.current = audioCtx.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") void ctx.resume();
      renderSound(ctx, name, (s.volume / 100) * 0.5);
    } catch { /* no audio device */ }
  }, []);

  const value = useMemo<System>(() => ({ settings, set, play, attachMedia, online: settings.wifi && !settings.airplane }), [settings, set, play, attachMedia]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSystem(): System {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSystem outside SystemProvider");
  return v;
}

/**
 * The interface sounds, synthesised in the browser: short, soft, Windows-ish. Building
 * them from oscillators keeps them exactly in step with the volume slider and adds no
 * files to carry around.
 */
function renderSound(ctx: AudioContext, name: SoundName, gain: number): void {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(ctx.destination);

  const tone = (freq: number, start: number, dur: number, type: OscillatorType = "sine", peak = 1) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + start);
    g.gain.setValueAtTime(0, now + start);
    g.gain.linearRampToValueAtTime(peak, now + start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(g); g.connect(out);
    osc.start(now + start); osc.stop(now + start + dur + 0.05);
  };
  const noise = (start: number, dur: number, peak = 0.5, hp = 800) => {
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.value = peak;
    src.connect(f); f.connect(g); g.connect(out);
    src.start(now + start);
  };

  switch (name) {
    case "notify": tone(880, 0, 0.18, "sine", 0.5); tone(1318.5, 0.09, 0.32, "sine", 0.38); break;
    case "message": tone(1174.7, 0, 0.13, "sine", 0.42); tone(1567.98, 0.07, 0.26, "sine", 0.3); break;
    case "unlock": tone(659.25, 0, 0.2, "sine", 0.4); tone(987.77, 0.1, 0.3, "sine", 0.32); tone(1318.5, 0.2, 0.45, "sine", 0.22); break;
    case "error": tone(311.13, 0, 0.26, "triangle", 0.5); tone(233.08, 0.16, 0.34, "triangle", 0.42); break;
    case "discovery": tone(392, 0, 0.5, "sine", 0.3); tone(587.33, 0.18, 0.6, "sine", 0.24); tone(783.99, 0.36, 0.9, "sine", 0.16); break;
    case "device-connect": tone(523.25, 0, 0.14, "sine", 0.4); tone(784, 0.08, 0.22, "sine", 0.3); break;
    case "empty-bin": noise(0, 0.5, 0.35, 500); tone(180, 0.02, 0.3, "triangle", 0.2); break;
    case "click": default: noise(0, 0.05, 0.22, 2000); break;
  }
}
