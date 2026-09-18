"use client";
import React, { createContext, useCallback, useContext, useMemo, useReducer, useRef } from "react";

export type AppId = "explorer" | "chrome" | "whatsapp" | "notepad" | "terminal" | "dialog";

export interface WinState {
  id: string;
  app: AppId;
  x: number; y: number; w: number; h: number;
  minimized: boolean;
  maximized: boolean;
  z: number;
  props: Record<string, unknown>;
  /** Restore geometry while maximized. */
  restore?: { x: number; y: number; w: number; h: number };
  singleton?: boolean;
  minW?: number; minH?: number;
  resizable?: boolean;
}

interface State { windows: WinState[]; nextZ: number; activeId: string | null; seq: number }

type Action =
  | { type: "open"; win: WinState }
  | { type: "close"; id: string }
  | { type: "focus"; id: string }
  | { type: "minimize"; id: string }
  | { type: "toggleMax"; id: string; screen: { w: number; h: number } }
  | { type: "setGeom"; id: string; geom: Partial<Pick<WinState, "x" | "y" | "w" | "h">> }
  | { type: "setProps"; id: string; props: Record<string, unknown> }
  | { type: "blurAll" };

const TASKBAR_H = 48;

function topWindow(wins: WinState[]): string | null {
  const vis = wins.filter((w) => !w.minimized);
  if (!vis.length) return null;
  return vis.reduce((a, b) => (a.z > b.z ? a : b)).id;
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "open": {
      const z = state.nextZ + 1;
      return { ...state, windows: [...state.windows, { ...a.win, z }], nextZ: z, activeId: a.win.id, seq: state.seq + 1 };
    }
    case "close": {
      const windows = state.windows.filter((w) => w.id !== a.id);
      return { ...state, windows, activeId: state.activeId === a.id ? topWindow(windows) : state.activeId };
    }
    case "focus": {
      const w = state.windows.find((x) => x.id === a.id);
      if (!w) return state;
      const z = state.nextZ + 1;
      return { ...state, nextZ: z, activeId: a.id, windows: state.windows.map((x) => (x.id === a.id ? { ...x, z, minimized: false } : x)) };
    }
    case "minimize": {
      const windows = state.windows.map((x) => (x.id === a.id ? { ...x, minimized: true } : x));
      return { ...state, windows, activeId: topWindow(windows) };
    }
    case "toggleMax": {
      return {
        ...state,
        windows: state.windows.map((x) => {
          if (x.id !== a.id) return x;
          if (x.maximized) return { ...x, maximized: false, ...(x.restore ?? {}), restore: undefined };
          return { ...x, maximized: true, restore: { x: x.x, y: x.y, w: x.w, h: x.h }, x: 0, y: 0, w: a.screen.w, h: a.screen.h - TASKBAR_H };
        }),
      };
    }
    case "setGeom":
      return { ...state, windows: state.windows.map((x) => (x.id === a.id ? { ...x, ...a.geom } : x)) };
    case "setProps":
      return { ...state, windows: state.windows.map((x) => (x.id === a.id ? { ...x, props: { ...x.props, ...a.props } } : x)) };
    case "blurAll":
      return { ...state, activeId: null };
  }
}

export interface OpenOptions { props?: Record<string, unknown>; w?: number; h?: number; x?: number; y?: number; singleton?: boolean; minW?: number; minH?: number; resizable?: boolean; maximized?: boolean }

export interface WM {
  windows: WinState[];
  activeId: string | null;
  open: (app: AppId, opts?: OpenOptions) => string;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  toggleMax: (id: string) => void;
  setGeom: (id: string, geom: Partial<Pick<WinState, "x" | "y" | "w" | "h">>) => void;
  setProps: (id: string, props: Record<string, unknown>) => void;
  blurAll: () => void;
  screen: () => { w: number; h: number };
  find: (app: AppId) => WinState | undefined;
}

const Ctx = createContext<WM | null>(null);

const DEFAULTS: Record<AppId, { w: number; h: number; minW: number; minH: number }> = {
  explorer: { w: 1030, h: 660, minW: 520, minH: 320 },
  chrome: { w: 1200, h: 760, minW: 500, minH: 300 },
  whatsapp: { w: 1090, h: 720, minW: 780, minH: 520 },
  notepad: { w: 900, h: 620, minW: 320, minH: 200 },
  terminal: { w: 980, h: 560, minW: 400, minH: 220 },
  dialog: { w: 420, h: 220, minW: 200, minH: 100 },
};

export function WMProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { windows: [], nextZ: 10, activeId: null, seq: 0 });
  const cascade = useRef(0);
  const screen = useCallback(() => ({ w: typeof window !== "undefined" ? window.innerWidth : 1920, h: typeof window !== "undefined" ? window.innerHeight : 1080 }), []);
  const stateRef = useRef(state);
  stateRef.current = state;

  const open = useCallback((app: AppId, opts: OpenOptions = {}) => {
    const existing = opts.singleton ? stateRef.current.windows.find((w) => w.app === app) : undefined;
    if (existing) {
      if (opts.props) dispatch({ type: "setProps", id: existing.id, props: opts.props });
      dispatch({ type: "focus", id: existing.id });
      return existing.id;
    }
    const d = DEFAULTS[app];
    const sc = screen();
    const w = Math.min(opts.w ?? d.w, sc.w - 40);
    const h = Math.min(opts.h ?? d.h, sc.h - TASKBAR_H - 20);
    const n = cascade.current++ % 8;
    const x = opts.x ?? Math.max(0, Math.round((sc.w - w) / 2) + n * 26 - 60);
    const y = opts.y ?? Math.max(0, Math.round((sc.h - TASKBAR_H - h) / 2) + n * 26 - 40);
    const id = `${app}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const win: WinState = { id, app, x, y, w, h, minimized: false, maximized: false, z: 0, props: opts.props ?? {}, singleton: opts.singleton, minW: opts.minW ?? d.minW, minH: opts.minH ?? d.minH, resizable: opts.resizable ?? true };
    dispatch({ type: "open", win });
    if (opts.maximized) dispatch({ type: "toggleMax", id, screen: sc });
    return id;
  }, [screen]);

  const wm = useMemo<WM>(() => ({
    windows: state.windows,
    activeId: state.activeId,
    open,
    close: (id) => dispatch({ type: "close", id }),
    focus: (id) => dispatch({ type: "focus", id }),
    minimize: (id) => dispatch({ type: "minimize", id }),
    toggleMax: (id) => dispatch({ type: "toggleMax", id, screen: screen() }),
    setGeom: (id, geom) => dispatch({ type: "setGeom", id, geom }),
    setProps: (id, props) => dispatch({ type: "setProps", id, props }),
    blurAll: () => dispatch({ type: "blurAll" }),
    screen,
    find: (app) => state.windows.find((w) => w.app === app),
  }), [state, open, screen]);

  return <Ctx.Provider value={wm}>{children}</Ctx.Provider>;
}

export function useWM(): WM {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWM outside WMProvider");
  return v;
}
