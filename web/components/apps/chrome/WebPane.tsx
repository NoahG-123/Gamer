"use client";
import React, { useEffect, useRef } from "react";
import { host } from "@/lib/client/host";

export interface PaneEvents {
  onStartLoading?: () => void;
  onStopLoading?: () => void;
  onNavigate?: (url: string, inPage: boolean) => void;
  onTitle?: (title: string) => void;
  onFavicon?: (url: string | null) => void;
  onContextMenu?: (params: { x: number; y: number; linkURL?: string; srcURL?: string; selectionText?: string; isEditable?: boolean; mediaType?: string }) => void;
  onFocus?: () => void;
}

export interface PaneHandle {
  loadURL: (url: string) => void;
  reload: () => void;
  stop: () => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getURL: () => string;
  focus: () => void;
  /** Chromium id of this tab, used to open devtools on it. */
  webContentsId: () => number | null;
}

type WebviewEl = HTMLElement & {
  loadURL: (u: string) => Promise<void>; reload: () => void; stop: () => void; goBack: () => void; goForward: () => void; canGoBack: () => boolean; canGoForward: () => boolean; getURL: () => string; src: string; focus: () => void; getWebContentsId: () => number;
};

/**
 * One browser tab's content. In Electron this is a <webview> in the persistent
 * browser partition (real internet, intercepted story hosts). In a plain browser
 * it degrades to an <iframe> so the shell can be exercised without Electron.
 */
export const WebPane = React.forwardRef<PaneHandle, { initialUrl: string; visible: boolean; events: PaneEvents; resolveForFrame: (url: string) => string }>(function WebPane({ initialUrl, visible, events, resolveForFrame }, ref) {
  const h = host();
  const wvRef = useRef<WebviewEl | null>(null);
  const ifRef = useRef<HTMLIFrameElement | null>(null);
  const ev = useRef(events); ev.current = events;
  const iframeUrl = useRef(resolveForFrame(initialUrl));
  const canBackRef = useRef(false);

  React.useImperativeHandle(ref, () => ({
    loadURL: (u) => { if (h.isElectron) wvRef.current?.loadURL(u).catch(() => {}); else { iframeUrl.current = resolveForFrame(u); if (ifRef.current) ifRef.current.src = iframeUrl.current; ev.current.onStartLoading?.(); ev.current.onNavigate?.(u, false); canBackRef.current = true; } },
    reload: () => { if (h.isElectron) wvRef.current?.reload(); else if (ifRef.current) ifRef.current.src = iframeUrl.current; },
    stop: () => { if (h.isElectron) wvRef.current?.stop(); },
    goBack: () => { if (h.isElectron) wvRef.current?.goBack(); else try { ifRef.current?.contentWindow?.history.back(); } catch { /* cross-origin */ } },
    goForward: () => { if (h.isElectron) wvRef.current?.goForward(); else try { ifRef.current?.contentWindow?.history.forward(); } catch { /* cross-origin */ } },
    canGoBack: () => (h.isElectron ? !!wvRef.current?.canGoBack() : canBackRef.current),
    canGoForward: () => (h.isElectron ? !!wvRef.current?.canGoForward() : false),
    getURL: () => (h.isElectron ? wvRef.current?.getURL() ?? "" : iframeUrl.current),
    focus: () => { if (h.isElectron) wvRef.current?.focus(); else ifRef.current?.focus(); },
    webContentsId: () => { try { return h.isElectron ? wvRef.current?.getWebContentsId() ?? null : null; } catch { return null; } },
  }), [h.isElectron, resolveForFrame]);

  useEffect(() => {
    if (!h.isElectron) return;
    const el = wvRef.current;
    if (!el) return;
    const on = (name: string, fn: (e: never) => void) => { el.addEventListener(name, fn as EventListener); return () => el.removeEventListener(name, fn as EventListener); };
    const offs = [
      on("did-start-loading", () => ev.current.onStartLoading?.()),
      on("did-stop-loading", () => ev.current.onStopLoading?.()),
      on("did-fail-load", () => ev.current.onStopLoading?.()),
      on("did-navigate", (e: { url: string }) => ev.current.onNavigate?.(e.url, false)),
      on("did-navigate-in-page", (e: { url: string; isMainFrame: boolean }) => { if (e.isMainFrame) ev.current.onNavigate?.(e.url, true); }),
      on("page-title-updated", (e: { title: string }) => ev.current.onTitle?.(e.title)),
      on("page-favicon-updated", (e: { favicons: string[] }) => ev.current.onFavicon?.(e.favicons?.[0] ?? null)),
      on("context-menu", (e: { params: { x: number; y: number; linkURL: string; srcURL: string; selectionText: string; isEditable: boolean; mediaType: string } }) => ev.current.onContextMenu?.(e.params)),
      on("focus", () => ev.current.onFocus?.()),
    ];
    return () => offs.forEach((f) => f());
  }, [h.isElectron]);

  const style: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, display: visible ? "flex" : "none", background: "#fff" };
  if (h.isElectron) {
    return <webview ref={(el: HTMLElement | null) => { wvRef.current = el as WebviewEl | null; }} src={initialUrl} partition={h.webviewPartition} style={style} {...({ allowpopups: "true" } as object)} />;
  }
  return (
    <iframe
      ref={ifRef}
      src={iframeUrl.current}
      style={style}
      title="tab"
      onLoad={(e) => {
        const f = e.currentTarget;
        ev.current.onStopLoading?.();
        try {
          const doc = f.contentDocument;
          if (doc) {
            ev.current.onTitle?.(doc.title);
            const icon = doc.querySelector<HTMLLinkElement>("link[rel~='icon']");
            ev.current.onFavicon?.(icon ? icon.href : null);
            if (f.contentWindow) { iframeUrl.current = f.contentWindow.location.href; ev.current.onNavigate?.(iframeUrl.current, false); }
            doc.addEventListener("contextmenu", (ce) => { ce.preventDefault(); const r = f.getBoundingClientRect(); const a = (ce.target as HTMLElement).closest?.("a"); ev.current.onContextMenu?.({ x: r.left + ce.clientX, y: r.top + ce.clientY, linkURL: a ? (a as HTMLAnchorElement).href : "", selectionText: doc.getSelection()?.toString() ?? "" }); });
            doc.addEventListener("mousedown", () => ev.current.onFocus?.());
          }
        } catch { /* cross-origin frame */ }
      }}
    />
  );
});
