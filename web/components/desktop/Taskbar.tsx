"use client";
import React, { useEffect, useState } from "react";
import styles from "./Taskbar.module.css";
import { useWM, AppId } from "./wm";
import { useMenu } from "./ContextMenu";
import { ExplorerAppIcon, ChromeIcon, WhatsAppIcon, NotepadIcon, TerminalAppIcon, SettingsIcon, CalculatorIcon, ClockIcon as ClockAppIcon, PhotosIcon, PaintIcon, GenericAppIcon } from "@/components/icons/apps";
import { DataUsage as TaskMgrIcon } from "@/components/icons/fluent";
import { Search, TaskView, Wifi, WifiOff, SpeakerMute, Speaker, Battery, ChevronUp, Gear, Cloud, Pin, Close } from "@/components/icons/fluent";
import { useSystem } from "@/lib/client/system";
import { Ico } from "@/lib/icons/Ico";
import { useAsset } from "@/lib/client/assets";
import { Profile, formatDate, formatTime } from "@/lib/client/api";
import { SiWhatsapp } from "react-icons/si";

export const APP_META: Record<AppId, { name: string; icon: (size: number) => React.ReactNode }> = {
  explorer: { name: "File Explorer", icon: (s) => <ExplorerAppIcon size={s} /> },
  chrome: { name: "Google Chrome", icon: (s) => <ChromeIcon size={s} /> },
  whatsapp: { name: "WhatsApp", icon: (s) => <WhatsAppIcon size={s} /> },
  notepad: { name: "Notepad", icon: (s) => <NotepadIcon size={s} /> },
  terminal: { name: "Terminal", icon: (s) => <TerminalAppIcon size={s} /> },
  settings: { name: "Settings", icon: (s) => <SettingsIcon size={s} /> },
  taskmgr: { name: "Task Manager", icon: (s) => <TaskMgrIcon size={s} /> },
  calculator: { name: "Calculator", icon: (s) => <CalculatorIcon size={s} /> },
  clock: { name: "Clock", icon: (s) => <ClockAppIcon size={s} /> },
  photos: { name: "Photos", icon: (s) => <PhotosIcon size={s} /> },
  paint: { name: "Paint", icon: (s) => <PaintIcon size={s} /> },
  audio: { name: "REAPER", icon: (s) => <GenericAppIcon size={s} /> },
  dialog: { name: "", icon: () => null },
};

export const WindowsLogo = ({ size = 16, color = "#0078D4" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{ display: "block" }}><rect x="0" y="0" width="7.4" height="7.4" fill={color} /><rect x="8.6" y="0" width="7.4" height="7.4" fill={color} /><rect x="0" y="8.6" width="7.4" height="7.4" fill={color} /><rect x="8.6" y="8.6" width="7.4" height="7.4" fill={color} /></svg>
);

function useClock(profile: Profile) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const tick = () => setNow(new Date()); tick(); const id = setInterval(tick, 1000); return () => clearInterval(id); }, []);
  if (!now) return { time: "", date: "" };
  return { time: formatTime(now, profile.locale), date: formatDate(now, profile.dateFormat, profile.locale) };
}

export type Panel = "start" | "search" | "taskview" | "notif" | "widgets" | "quick" | null;

export function Taskbar({ profile, pins, panel, onPanel, onLaunch, onShowDesktop, unreadCount }: { profile: Profile; pins: AppId[]; panel: Panel; onPanel: (p: Panel) => void; onLaunch: (app: AppId) => void; onShowDesktop: () => void; unreadCount: number }) {
  const wm = useWM();
  const menu = useMenu();
  const clock = useClock(profile);
  const sys = useSystem();
  const highlight = useAsset("taskbar.searchHighlight");
  const running = wm.windows.filter((w) => w.app !== "dialog");
  const apps: AppId[] = [...pins];
  for (const w of running) if (!apps.includes(w.app)) apps.push(w.app);
  const weather = profile.weather ?? { temp: 21, text: "Partly cloudy", icon: "sun-behind-cloud" };
  const unit = profile.tempUnit ?? "C";
  const toggle = (p: Panel) => onPanel(panel === p ? null : p);

  const clickApp = (app: AppId) => {
    onPanel(null);
    const wins = running.filter((w) => w.app === app);
    if (!wins.length) { onLaunch(app); return; }
    const top = wins.reduce((a, b) => (a.z > b.z ? a : b));
    if (wm.activeId === top.id && !top.minimized) wm.minimize(top.id);
    else wm.focus(top.id);
  };

  const appMenu = (e: React.MouseEvent, app: AppId) => {
    e.preventDefault();
    const wins = running.filter((w) => w.app === app);
    const meta = APP_META[app];
    menu.open({ x: e.clientX, y: e.clientY, anchorBottom: true, items: [
      { label: meta.name, icon: meta.icon(16), onClick: () => onLaunch(app) },
      { label: pins.includes(app) ? "Unpin from taskbar" : "Pin to taskbar", icon: <Pin size={16} /> },
      ...(wins.length ? [{ label: wins.length > 1 ? "Close all windows" : "Close window", icon: <Close size={16} />, onClick: () => wins.forEach((w) => wm.close(w.id)) }] : []),
    ] });
  };

  const taskbarMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-app]")) return;
    e.preventDefault();
    menu.open({ x: e.clientX, y: e.clientY, anchorBottom: true, items: [{ label: "Task Manager", onClick: () => onLaunch("taskmgr") }, { type: "sep" }, { label: "Taskbar settings", icon: <Gear size={16} />, onClick: () => onLaunch("settings") }] });
  };

  return (
    <div className={styles.taskbar} onContextMenu={taskbarMenu} data-taskbar>
      <div className={styles.left}>
        <button className={`${styles.widget} ${panel === "widgets" ? styles.btnPressed : ""}`} title="Widgets" onClick={() => toggle("widgets")} data-widgets-btn>
          <Ico name={`fluent-emoji-flat:${weather.icon ?? "sun-behind-cloud"}`} size={30} />
          <span className={styles.widgetText}><span className={styles.widgetTemp}>{weather.temp}°{unit}</span><span className={styles.widgetDesc}>{weather.text}</span></span>
        </button>
      </div>
      <div className={styles.center}>
        <button className={`${styles.btn} ${panel === "start" ? styles.btnPressed : ""}`} title="Start" onClick={() => toggle("start")} data-start>
          <WindowsLogo size={18} color="#3AA0F3" />
        </button>
        <button className={`${styles.searchBox} ${panel === "search" ? styles.btnPressed : ""}`} title="Search" onClick={() => toggle("search")} data-search-btn>
          <Search size={18} />
          <span className={styles.searchText}>Search</span>
          {highlight && <img className={styles.searchHighlight} src={highlight} alt="" />}
        </button>
        <button className={`${styles.btn} ${panel === "taskview" ? styles.btnPressed : ""}`} title="Task View" onClick={() => toggle("taskview")} data-taskview-btn><TaskView size={20} /></button>
        {apps.map((app) => {
          const wins = running.filter((w) => w.app === app);
          const top = wins.length ? wins.reduce((a, b) => (a.z > b.z ? a : b)) : null;
          const active = !!top && wm.activeId === top.id;
          return (
            <button key={app} data-app={app} className={`${styles.btn} ${wins.length ? styles.btnRunning : ""} ${active ? styles.btnActive : ""}`} title={APP_META[app].name} onClick={() => clickApp(app)} onContextMenu={(e) => appMenu(e, app)}>
              {APP_META[app].icon(24)}
              <span className={styles.indicator} />
            </button>
          );
        })}
      </div>
      <div className={styles.right}>
        <button className={styles.trayBtn} title="Show hidden icons" style={{ width: 22 }} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); menu.open({ x: r.left - 60, y: r.top - 4, anchorBottom: true, items: [
          { label: "REAPER", onClick: () => onLaunch("audio") },
          { label: "Realtek Audio Console", onClick: () => onLaunch("settings") },
          { label: "Windows Security — No action needed", onClick: () => onLaunch("settings") },
          { label: "Task Manager", onClick: () => onLaunch("taskmgr") },
        ] }); }}><ChevronUp size={12} /></button>
        {(profile.trayIcons ?? []).map((t) => (
          <button key={t} className={styles.trayBtn} style={{ width: 26 }} title={t === "onedrive" ? (sys.online ? "OneDrive - Personal\nUp to date" : "OneDrive - Personal\nNot connected") : "WhatsApp"} onClick={() => { if (t === "whatsapp") onLaunch("whatsapp"); else if (t === "onedrive") onLaunch("explorer"); }}>
            {t === "onedrive" ? <Cloud size={16} /> : t === "whatsapp" ? <SiWhatsapp size={15} color="#25D366" /> : null}
          </button>
        ))}
        {profile.inputLanguage && (
          <button className={styles.lang} title="To switch input methods, press Windows key+Space" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); menu.open({ x: r.left - 120, y: r.top - 90, items: [ { label: `${profile.inputLanguage![0]} ${profile.inputLanguage![1]}  Canadian Multilingual Standard`, checked: true }, { type: "sep" }, { label: "Language preferences", onClick: () => onLaunch("settings") },] }); }}><span>{profile.inputLanguage[0]}</span><span>{profile.inputLanguage[1]}</span></button>
        )}
        <button
          className={`${styles.trayGroup} ${panel === "quick" ? styles.btnPressed : ""}`}
          data-quick-btn
          title={`${sys.online ? "Internet access" : sys.settings.airplane ? "Airplane mode" : "Not connected"}\nSpeakers: ${sys.settings.muted ? "Muted" : `${sys.settings.volume}%`}${profile.laptop ? "\nBattery: 71% remaining" : ""}`}
          onClick={() => toggle("quick")}
        >
          {sys.online ? <Wifi size={16} /> : <WifiOff size={16} />}
          {sys.settings.muted || sys.settings.volume === 0 ? <SpeakerMute size={16} /> : <Speaker size={16} />}
          {profile.laptop && <Battery size={16} />}
        </button>
        <button className={`${styles.clock} ${panel === "notif" ? styles.btnPressed : ""}`} title="Notifications" onClick={() => toggle("notif")} data-notif-btn>
          <span className={styles.clockTime} suppressHydrationWarning>{clock.time}</span>
          <span className={styles.clockDate} suppressHydrationWarning>{clock.date}</span>
          {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
        </button>
        <button className={styles.showDesktop} title="Show desktop" onClick={onShowDesktop} />
      </div>
    </div>
  );
}
