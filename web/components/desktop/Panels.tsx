"use client";
import React, { useEffect, useRef, useState } from "react";
import styles from "./Panels.module.css";
import { AppId, useWM, WinState } from "./wm";
import { APP_META } from "./Taskbar";
import { api, VfsNode } from "@/lib/client/api";
import * as A from "@/components/icons/apps";
import { DataUsage as TaskMgrIcon } from "@/components/icons/fluent";
import { Search, ChevronRight, Close, Gear, Globe, Wifi, WifiOff, Bluetooth, Airplane, NightLight, Accessibility, Brightness, Speaker, SpeakerMute, Battery, NearbyShare, Cast, Pin } from "@/components/icons/fluent";
import { useSystem } from "@/lib/client/system";
import { Ico } from "@/lib/icons/Ico";
import type { Toast } from "./Toasts";

export interface AppEntry { label: string; icon: React.ReactNode; app?: AppId; url?: string; keywords?: string; page?: string }

/** Everything the Start menu and Search know how to launch. Apps without an `app` are installed-but-not-simulated. */
export const ALL_APPS: AppEntry[] = [
  { label: "Calculator", icon: <A.CalculatorIcon size={24} />, app: "calculator", keywords: "maths math calc" },
  { label: "Clock", icon: <A.ClockIcon size={24} />, app: "clock", keywords: "alarm timer stopwatch world clock" },
  { label: "File Explorer", icon: <A.ExplorerAppIcon size={24} />, app: "explorer", keywords: "files folders" },
  { label: "Gmail", icon: <A.GmailIcon size={24} />, app: "chrome", url: "https://mail.google.com/mail/u/0/#inbox", keywords: "mail email" },
  { label: "Google Calendar", icon: <A.CalendarIcon size={24} />, app: "chrome", url: "https://calendar.google.com/calendar/u/0/r", keywords: "calendar" },
  { label: "Google Chrome", icon: <A.ChromeIcon size={24} />, app: "chrome", keywords: "browser web internet" },
  { label: "Microsoft Edge", icon: <A.EdgeIcon size={24} />, app: "chrome", keywords: "browser web internet" },
  { label: "Microsoft Store", icon: <A.StoreIcon size={24} />, app: "chrome", url: "https://apps.microsoft.com/", keywords: "store apps install" },
  { label: "Notepad", icon: <A.NotepadIcon size={24} />, app: "notepad", keywords: "text editor" },
  { label: "Paint", icon: <A.PaintIcon size={24} />, app: "paint", keywords: "draw image bitmap" },
  { label: "Photos", icon: <A.PhotosIcon size={24} />, app: "photos", keywords: "pictures images gallery viewer" },
  { label: "REAPER", icon: <A.GenericAppIcon size={24} />, app: "audio", keywords: "daw audio wav waveform recording editor" },
  { label: "Settings", icon: <A.SettingsIcon size={24} />, app: "settings", keywords: "settings control panel wallpaper background volume brightness wifi bluetooth theme personalise personalize display sound" },
  { label: "Task Manager", icon: <TaskMgrIcon size={24} />, app: "taskmgr", keywords: "processes performance cpu memory end task" },
  { label: "Terminal", icon: <A.TerminalAppIcon size={24} />, app: "terminal", keywords: "powershell cmd command prompt shell" },
  { label: "WhatsApp", icon: <A.WhatsAppIcon size={24} />, app: "whatsapp", keywords: "messages chat" },
];

const SETTINGS: { label: string; page: string }[] = [
  { label: "Display settings", page: "system" }, { label: "Sound settings", page: "system" }, { label: "Bluetooth & devices", page: "bluetooth" },
  { label: "Network & internet", page: "network" }, { label: "Personalisation", page: "personalisation" }, { label: "Background", page: "personalisation" },
  { label: "Colours", page: "personalisation" }, { label: "Apps", page: "apps" }, { label: "Accounts", page: "accounts" },
  { label: "Time & language", page: "time" }, { label: "Privacy & security", page: "privacy" }, { label: "Windows Update", page: "update" },
  { label: "Accessibility", page: "accessibility" }, { label: "About this PC", page: "system" },
];

export interface SearchLaunch { app: AppEntry }
export function useSearch(q: string) {
  const [files, setFiles] = useState<VfsNode[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setFiles([]); setLoading(false); return; }
    setLoading(true);
    let live = true;
    const id = setTimeout(() => { api.search("C:", q.trim()).then((d) => { if (live) setFiles(d.results.slice(0, 8)); }).catch(() => { if (live) setFiles([]); }).finally(() => { if (live) setLoading(false); }); }, 150);
    return () => { live = false; clearTimeout(id); };
  }, [q]);
  const t = q.trim().toLowerCase();
  const apps = t ? ALL_APPS.filter((a) => a.label.toLowerCase().includes(t) || (a.keywords ?? "").includes(t)) : [];
  const settings = t ? SETTINGS.filter((s) => s.label.toLowerCase().includes(t)).slice(0, 4) : [];
  return { apps, files, settings, loading };
}

/** Windows 11 Search flyout (taskbar search box). */
export function SearchPanel({ open, onClose, initial, onLaunch, onOpenFile, onOpenUrl }: { open: boolean; onClose: () => void; initial?: string; onLaunch: (a: AppEntry) => void; onOpenFile: (n: VfsNode) => void; onOpenUrl: (u: string) => void }) {
  const [q, setQ] = useState(initial ?? "");
  const input = useRef<HTMLInputElement>(null);
  const { apps, files, settings, loading } = useSearch(q);
  const [pendingEnter, setPendingEnter] = useState(false);
  useEffect(() => { if (open) { setQ(initial ?? ""); setPendingEnter(false); setTimeout(() => input.current?.focus(), 30); } }, [open, initial]);
  const best = apps[0] ? { kind: "app" as const, app: apps[0] } : files[0] ? { kind: "file" as const, file: files[0] } : null;
  const runBest = () => {
    if (loading && !apps[0]) { setPendingEnter(true); return; } // results still coming back: act on them, not on the web fallback
    if (best?.kind === "app") { onLaunch(best.app); onClose(); }
    else if (best?.kind === "file") { onOpenFile(best.file); onClose(); }
    else if (q.trim()) { onOpenUrl(`https://www.bing.com/search?q=${encodeURIComponent(q.trim())}`); onClose(); }
  };
  useEffect(() => { if (pendingEnter && !loading) { setPendingEnter(false); runBest(); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEnter, loading]);
  if (!open) return null;
  return (
    <div className={styles.searchWrap} data-search>
      <div className={styles.searchBox}>
        <Search size={18} className={styles.searchIcon} />
        <input ref={input} className={styles.searchInput} placeholder="Search for apps, settings, and documents" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runBest(); if (e.key === "Escape") onClose(); }} />
      </div>
      {!q.trim() ? (
        <div className={styles.searchBody}>
          <div className={styles.col}>
            <div className={styles.h}>Top apps</div>
            <div className={styles.topApps}>
              {ALL_APPS.filter((a) => a.app).slice(0, 6).map((a) => (
                <button key={a.label} className={styles.topApp} onClick={() => { onLaunch(a); onClose(); }}><span className={styles.topAppIcon}>{a.icon}</span><span>{a.label}</span></button>
              ))}
            </div>
            <div className={styles.h} style={{ marginTop: 18 }}>Quick searches</div>
            {["Today in history", "New movies", "Translate"].map((s) => <button key={s} className={styles.row} onClick={() => { onOpenUrl(`https://www.bing.com/search?q=${encodeURIComponent(s)}`); onClose(); }}><Globe size={18} /><span>{s}</span></button>)}
          </div>
          <div className={styles.col}>
            <div className={styles.h}>Recent</div>
            <RecentList onOpenFile={(n) => { onOpenFile(n); onClose(); }} />
          </div>
        </div>
      ) : (
        <div className={styles.searchBody}>
          <div className={styles.col}>
            <div className={styles.h}>Best match</div>
            {best?.kind === "app" && <button className={`${styles.row} ${styles.best}`} onClick={runBest}><span className={styles.rowIcon}>{best.app.icon}</span><span className={styles.rowText}><b>{best.app.label}</b><small>App</small></span></button>}
            {best?.kind === "file" && <button className={`${styles.row} ${styles.best}`} onClick={runBest}><span className={styles.rowIcon}><A.FileTypeIcon ext={best.file.ext} dir={best.file.dir} name={best.file.name} size={24} /></span><span className={styles.rowText}><b>{best.file.name}</b><small>{best.file.dir ? "File folder" : A.typeLabel(best.file.ext, false)}</small></span></button>}
            {!best && <button className={`${styles.row} ${styles.best}`} onClick={runBest}><span className={styles.rowIcon}><Search size={24} /></span><span className={styles.rowText}><b>{q}</b><small>{loading ? "Searching…" : "See web results"}</small></span></button>}
            {apps.length > 1 && <><div className={styles.h}>Apps</div>{apps.slice(1, 5).map((a) => <button key={a.label} className={styles.row} onClick={() => { onLaunch(a); onClose(); }}><span className={styles.rowIcon}>{a.icon}</span><span>{a.label}</span></button>)}</>}
            {settings.length > 0 && <><div className={styles.h}>Settings</div>{settings.map((s) => <button key={s.label} className={styles.row} onClick={() => { onLaunch({ label: s.label, icon: <Gear size={20} />, app: "settings", page: s.page }); onClose(); }}><span className={styles.rowIcon}><Gear size={20} /></span><span>{s.label}</span></button>)}</>}
            {files.length > (best?.kind === "file" ? 1 : 0) && <><div className={styles.h}>Documents</div>{files.slice(best?.kind === "file" ? 1 : 0, 6).map((n) => <button key={n.path} className={styles.row} onClick={() => { onOpenFile(n); onClose(); }}><span className={styles.rowIcon}><A.FileTypeIcon ext={n.ext} dir={n.dir} name={n.name} size={20} /></span><span className={styles.rowText}><span>{n.name}</span><small>{n.path.slice(0, n.path.lastIndexOf("/")).replace(/\//g, "\\")}</small></span></button>)}</>}
            <button className={styles.row} onClick={() => { onOpenUrl(`https://www.bing.com/search?q=${encodeURIComponent(q.trim())}`); onClose(); }}><span className={styles.rowIcon}><Globe size={20} /></span><span className={styles.rowText}><span>{q}</span><small>Search the web</small></span></button>
          </div>
          <div className={`${styles.col} ${styles.preview}`}>
            {best?.kind === "app" && <><div className={styles.previewIcon}>{best.app.icon}</div><div className={styles.previewTitle}>{best.app.label}</div><div className={styles.previewSub}>App</div><button className={styles.previewBtn} onClick={runBest}><ChevronRight size={12} /> Open</button></>}
            {best?.kind === "file" && <><div className={styles.previewIcon}><A.FileTypeIcon ext={best.file.ext} dir={best.file.dir} name={best.file.name} size={48} /></div><div className={styles.previewTitle}>{best.file.name}</div><div className={styles.previewSub}>{best.file.path.replace(/\//g, "\\")}</div><button className={styles.previewBtn} onClick={runBest}><ChevronRight size={12} /> Open</button></>}
          </div>
        </div>
      )}
    </div>
  );
}

function RecentList({ onOpenFile }: { onOpenFile: (n: VfsNode) => void }) {
  const [recent, setRecent] = useState<VfsNode[]>([]);
  useEffect(() => { fetch("/api/fs/recent?limit=7").then((r) => r.json()).then((d) => setRecent(d.recent ?? [])).catch(() => {}); }, []);
  return <>{recent.map((n) => <button key={n.path} className={styles.row} onClick={() => onOpenFile(n)}><span className={styles.rowIcon}><A.FileTypeIcon ext={n.ext} name={n.name} size={20} /></span><span className={styles.rowText}><span>{n.name}</span><small>{n.path.slice(0, n.path.lastIndexOf("/")).replace(/\//g, "\\")}</small></span></button>)}</>;
}

/** Task View: every open window as a card; click to focus. */
export function TaskViewPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wm = useWM();
  if (!open) return null;
  const wins = wm.windows.filter((w) => w.app !== "dialog");
  const title = (w: WinState) => String(w.props.name ?? w.props.title ?? (w.props.path ? String(w.props.path).split("/").pop() : "") ?? "") || APP_META[w.app].name;
  return (
    <div className={styles.taskView} data-taskview onClick={onClose}>
      <div className={styles.taskGrid}>
        {wins.length === 0 && <div className={styles.taskEmpty}>No open windows</div>}
        {wins.map((w) => (
          <button key={w.id} className={styles.taskCard} onClick={(e) => { e.stopPropagation(); wm.focus(w.id); onClose(); }}>
            <span className={styles.taskCardHead}>{APP_META[w.app].icon(16)}<span className={styles.taskCardTitle}>{title(w)}</span><span className={styles.taskCardClose} onClick={(e) => { e.stopPropagation(); wm.close(w.id); }}><Close size={10} /></span></span>
            <span className={styles.taskCardBody}>{APP_META[w.app].icon(48)}</span>
          </button>
        ))}
      </div>
      <div className={styles.taskHint}>Desktop 1</div>
    </div>
  );
}

/** Notification center (clicking the clock). */
export function NotificationPanel({ open, onClose, history, onOpen, onClear }: { open: boolean; onClose: () => void; history: Toast[]; onOpen: (t: Toast) => void; onClear: () => void }) {
  if (!open) return null;
  const name: Record<string, string> = { whatsapp: "WhatsApp", mail: "Google Chrome", chrome: "Google Chrome", terminal: "Terminal", explorer: "File Explorer" };
  const icon = (app: string) => app === "whatsapp" ? <A.WhatsAppIcon size={18} /> : app === "mail" ? <A.GmailIcon size={18} /> : app === "terminal" ? <A.TerminalAppIcon size={18} /> : <A.ChromeIcon size={18} />;
  const when = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "now" : m < 60 ? `${m}m` : `${Math.round(m / 60)}h`; };
  return (
    <div className={styles.notif} data-notif>
      <div className={styles.notifHead}><span>Notifications</span><button className={styles.link} onClick={onClear}>Clear all</button></div>
      {history.length === 0 && <div className={styles.notifEmpty}>No new notifications</div>}
      {[...history].reverse().map((t) => (
        <button key={t.id} className={styles.notifItem} onClick={() => { onOpen(t); onClose(); }}>
          <span className={styles.notifTop}>{icon(t.app)}<span>{name[t.app] ?? t.app}</span><span className={styles.notifWhen}>{when(t.at)}</span></span>
          <span className={styles.notifTitle}>{t.title}</span>
          <span className={styles.notifText}>{t.text}</span>
        </button>
      ))}
    </div>
  );
}

/** Widgets board: weather from the profile plus headlines from a story site. */
export function WidgetsPanel({ open, weather, unit, onOpenUrl }: { open: boolean; weather: { temp: number; text: string; icon?: string }; unit: string; onOpenUrl: (u: string) => void }) {
  const [news, setNews] = useState<{ title: string; url: string }[]>([]);
  useEffect(() => {
    if (!open || news.length) return;
    fetch("/sites/harbourledger.ca/").then((r) => r.text()).then((html) => {
      const out: { title: string; url: string }[] = [];
      for (const m of html.matchAll(/<h2><a href="([^"]*)">([^<]+)<\/a><\/h2>/g)) out.push({ title: m[2], url: `https://harbourledger.ca${m[1]}` });
      setNews(out.slice(0, 4));
    }).catch(() => {});
  }, [open, news.length]);
  if (!open) return null;
  return (
    <div className={styles.widgets} data-widgets>
      <div className={styles.widgetCard}>
        <div className={styles.widgetCardHead}>Weather</div>
        <div className={styles.weatherRow}><Ico name={`fluent-emoji-flat:${weather.icon ?? "sun-behind-cloud"}`} size={48} /><div><div className={styles.weatherTemp}>{weather.temp}°{unit}</div><div className={styles.weatherText}>{weather.text} · Halifax</div></div></div>
        <div className={styles.weatherDays}>{["Fri", "Sat", "Sun", "Mon"].map((d, i) => <span key={d}><b>{d}</b><br />{weather.temp + [1, -2, -1, 2][i]}°</span>)}</div>
      </div>
      <div className={styles.widgetCard}>
        <div className={styles.widgetCardHead}>Top stories</div>
        {news.length === 0 && <div className={styles.widgetMuted}>Loading…</div>}
        {news.map((n) => <button key={n.url} className={styles.newsRow} onClick={() => onOpenUrl(n.url)}>{n.title}<small>The Harbour Ledger</small></button>)}
      </div>
    </div>
  );
}


/**
 * Quick settings (the Windows 11 flyout on the tray). These are real controls: the volume
 * slider changes what the speakers do, brightness dims the screen, and turning Wi-Fi off
 * takes the browser offline until it is turned back on.
 */
export function QuickSettingsPanel({ open, onClose, onOpenSettings }: { open: boolean; onClose: () => void; onOpenSettings: (page?: string) => void }) {
  const sys = useSystem();
  const s = sys.settings;
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (!open) setNote(null); }, [open]);
  if (!open) return null;

  const tile = (key: string, label: string, sub: string, on: boolean, icon: React.ReactNode, onClick: () => void, chevron?: () => void) => (
    <div key={key} className={`${styles.qsTile} ${on ? styles.qsTileOn : ""}`}>
      <button className={styles.qsTileBtn} onClick={onClick}>
        <span className={styles.qsTileIcon}>{icon}</span>
        <span className={styles.qsTileText}><span className={styles.qsTileLabel}>{label}</span><span className={styles.qsTileSub}>{sub}</span></span>
      </button>
      {chevron && <button className={styles.qsChevron} onClick={chevron} aria-label={`${label} settings`}><ChevronRight size={12} /></button>}
    </div>
  );

  return (
    <div className={styles.qs} data-quicksettings>
      <div className={styles.qsTiles}>
        {tile("wifi", "Wi-Fi", s.airplane ? "Airplane mode" : s.wifi ? "Bell-902" : "Not connected", s.wifi && !s.airplane, s.wifi && !s.airplane ? <Wifi size={20} /> : <WifiOff size={20} />, () => { sys.set({ wifi: !s.wifi }); sys.play("click"); }, () => { onClose(); onOpenSettings("network"); })}
        {tile("bt", "Bluetooth", "No adapter", false, <Bluetooth size={20} />, () => { setNote("No Bluetooth adapter found."); sys.play("error"); }, () => { onClose(); onOpenSettings("bluetooth"); })}
        {tile("air", "Airplane mode", s.airplane ? "On" : "Off", s.airplane, <Airplane size={20} />, () => { sys.set({ airplane: !s.airplane }); sys.play("click"); })}
        {tile("night", "Night light", s.nightLight ? "On" : "Off", s.nightLight, <NightLight size={20} />, () => { sys.set({ nightLight: !s.nightLight }); sys.play("click"); })}
        {tile("a11y", "Accessibility", "", false, <Accessibility size={20} />, () => { onClose(); onOpenSettings("accessibility"); })}
        {tile("cast", "Cast", "No displays found", false, <Cast size={20} />, () => { setNote("No wireless displays found."); sys.play("error"); })}
        {tile("near", "Nearby sharing", "Off", false, <NearbyShare size={20} />, () => setNote("Nearby sharing needs Bluetooth. No Bluetooth adapter found."))}
        {tile("proj", "Project", "", false, <Pin size={20} />, () => { setNote("No second display detected."); sys.play("error"); })}
      </div>
      {note && <div className={styles.qsNote}>{note}</div>}
      <div className={styles.qsSlider}>
        <span className={styles.qsSliderIcon}><Brightness size={18} /></span>
        <input type="range" min={30} max={100} value={s.brightness} onChange={(e) => sys.set({ brightness: Number(e.target.value) })} aria-label="Brightness" />
      </div>
      <div className={styles.qsSlider}>
        <button className={styles.qsSliderIcon} onClick={() => { sys.set({ muted: !s.muted }); if (s.muted) sys.play("click"); }} title={s.muted ? "Unmute" : "Mute"}>{s.muted || s.volume === 0 ? <SpeakerMute size={18} /> : <Speaker size={18} />}</button>
        <input type="range" min={0} max={100} value={s.muted ? 0 : s.volume} onChange={(e) => { const v = Number(e.target.value); sys.set({ volume: v, muted: v === 0 }); }} onMouseUp={() => sys.play("click")} aria-label="Volume" />
        <span className={styles.qsSliderVal}>{s.muted ? 0 : s.volume}</span>
      </div>
      <div className={styles.qsFoot}>
        <span className={styles.qsBattery}><Battery size={16} /> 71%</span>
        <span style={{ flex: 1 }} />
        <button className={styles.qsFootBtn} title="Edit quick settings" onClick={() => setNote("Pinning is turned off by your organisation.")}><Pin size={16} /></button>
        <button className={styles.qsFootBtn} title="Settings" onClick={() => { onClose(); onOpenSettings(); }}><Gear size={16} /></button>
      </div>
    </div>
  );
}
