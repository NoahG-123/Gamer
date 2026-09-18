"use client";
import React, { useEffect, useState } from "react";
import styles from "./Taskbar.module.css";
import { useWM, AppId } from "./wm";
import { useMenu } from "./ContextMenu";
import { ExplorerAppIcon, ChromeIcon, WhatsAppIcon, NotepadIcon } from "@/components/icons/apps";
import { Search, TaskView, Wifi, SpeakerMute, Speaker, Battery, ChevronUp, Gear, Cloud, Pin, Close } from "@/components/icons/fluent";
import { Ico } from "@/lib/icons/Ico";
import { useAsset } from "@/lib/client/assets";
import { Profile, formatDate, formatTime } from "@/lib/client/api";
import { SiWhatsapp } from "react-icons/si";

export const APP_META: Record<AppId, { name: string; icon: (size: number) => React.ReactNode }> = {
  explorer: { name: "File Explorer", icon: (s) => <ExplorerAppIcon size={s} /> },
  chrome: { name: "Google Chrome", icon: (s) => <ChromeIcon size={s} /> },
  whatsapp: { name: "WhatsApp", icon: (s) => <WhatsAppIcon size={s} /> },
  notepad: { name: "Notepad", icon: (s) => <NotepadIcon size={s} /> },
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

export function Taskbar({ profile, pins, startOpen, onToggleStart, onLaunch, onShowDesktop }: { profile: Profile; pins: AppId[]; startOpen: boolean; onToggleStart: () => void; onLaunch: (app: AppId) => void; onShowDesktop: () => void }) {
  const wm = useWM();
  const menu = useMenu();
  const clock = useClock(profile);
  const highlight = useAsset("taskbar.searchHighlight");
  const running = wm.windows.filter((w) => w.app !== "dialog");
  const apps: AppId[] = [...pins];
  for (const w of running) if (!apps.includes(w.app)) apps.push(w.app);
  const weather = profile.weather ?? { temp: 21, text: "Partly cloudy", icon: "sun-behind-cloud" };
  const unit = profile.tempUnit ?? "C";

  const clickApp = (app: AppId) => {
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
    menu.open({ x: e.clientX, y: e.clientY, anchorBottom: true, items: [{ label: "Taskbar settings", icon: <Gear size={16} /> }] });
  };

  return (
    <div className={styles.taskbar} onContextMenu={taskbarMenu} data-taskbar>
      <div className={styles.left}>
        <button className={styles.widget} title="Widgets">
          <Ico name={`fluent-emoji-flat:${weather.icon ?? "sun-behind-cloud"}`} size={30} />
          <span className={styles.widgetText}><span className={styles.widgetTemp}>{weather.temp}°{unit}</span><span className={styles.widgetDesc}>{weather.text}</span></span>
        </button>
      </div>
      <div className={styles.center}>
        <button className={`${styles.btn} ${startOpen ? styles.btnPressed : ""}`} title="Start" onClick={onToggleStart} data-start>
          <WindowsLogo size={18} color="#3AA0F3" />
        </button>
        <button className={styles.searchBox} title="Search">
          <Search size={18} />
          <span className={styles.searchText}>Search</span>
          {highlight && <img className={styles.searchHighlight} src={highlight} alt="" />}
        </button>
        <button className={styles.btn} title="Task View"><TaskView size={20} /></button>
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
        <button className={styles.trayBtn} title="Show hidden icons" style={{ width: 22 }}><ChevronUp size={12} /></button>
        {(profile.trayIcons ?? []).map((t) => (
          <button key={t} className={styles.trayBtn} style={{ width: 26 }} title={t === "onedrive" ? "OneDrive - Personal\nUp to date" : "WhatsApp"}>
            {t === "onedrive" ? <Cloud size={16} /> : t === "whatsapp" ? <SiWhatsapp size={15} color="#25D366" /> : null}
          </button>
        ))}
        {profile.inputLanguage && (
          <button className={styles.lang} title="To switch input methods, press Windows key+Space"><span>{profile.inputLanguage[0]}</span><span>{profile.inputLanguage[1]}</span></button>
        )}
        <button className={styles.trayGroup} title={`Internet access\nSpeakers: Muted${profile.laptop ? "\nBattery: 71% remaining" : ""}`}>
          <Wifi size={16} />
          {profile.laptop ? <SpeakerMute size={16} /> : <Speaker size={16} />}
          {profile.laptop && <Battery size={16} />}
        </button>
        <button className={styles.clock} title="Notifications">
          <span className={styles.clockTime} suppressHydrationWarning>{clock.time}</span>
          <span className={styles.clockDate} suppressHydrationWarning>{clock.date}</span>
        </button>
        <button className={styles.showDesktop} title="Show desktop" onClick={onShowDesktop} />
      </div>
    </div>
  );
}
