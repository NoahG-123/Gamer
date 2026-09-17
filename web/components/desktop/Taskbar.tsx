"use client";
import React, { useEffect, useState } from "react";
import styles from "./Taskbar.module.css";
import { useWM, AppId } from "./wm";
import { useMenu } from "./ContextMenu";
import { ExplorerAppIcon, ChromeIcon, WhatsAppIcon, NotepadIcon } from "@/components/icons/apps";
import { Search, TaskView, Wifi, Speaker, ChevronUp, Bell, Gear } from "@/components/icons/fluent";

export const APP_META: Record<AppId, { name: string; icon: (size: number) => React.ReactNode }> = {
  explorer: { name: "File Explorer", icon: (s) => <ExplorerAppIcon size={s} /> },
  chrome: { name: "Google Chrome", icon: (s) => <ChromeIcon size={s} /> },
  whatsapp: { name: "WhatsApp", icon: (s) => <WhatsAppIcon size={s} /> },
  notepad: { name: "Notepad", icon: (s) => <NotepadIcon size={s} /> },
  dialog: { name: "", icon: () => null },
};

export const WindowsLogo = ({ size = 16, color = "#0078D4" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16"><rect x="0" y="0" width="7.4" height="7.4" fill={color} /><rect x="8.6" y="0" width="7.4" height="7.4" fill={color} /><rect x="0" y="8.6" width="7.4" height="7.4" fill={color} /><rect x="8.6" y="8.6" width="7.4" height="7.4" fill={color} /></svg>
);

function useClock(locale: string) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return { time: "", date: "" };
  return {
    time: now.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
    date: now.toLocaleDateString(locale, { month: "numeric", day: "numeric", year: "numeric" }),
  };
}

export function Taskbar({ pins, startOpen, onToggleStart, onLaunch, locale, onShowDesktop }: { pins: AppId[]; startOpen: boolean; onToggleStart: () => void; onLaunch: (app: AppId) => void; locale: string; onShowDesktop: () => void }) {
  const wm = useWM();
  const menu = useMenu();
  const clock = useClock(locale);
  const running = wm.windows.filter((w) => w.app !== "dialog");
  const apps: AppId[] = [...pins];
  for (const w of running) if (!apps.includes(w.app)) apps.push(w.app);

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
    menu.open({
      x: e.clientX, y: e.clientY, anchorBottom: true,
      items: [
        { label: meta.name, icon: meta.icon(16), onClick: () => onLaunch(app) },
        { label: pins.includes(app) ? "Unpin from taskbar" : "Pin to taskbar", icon: <PinGlyph /> },
        ...(wins.length ? [{ label: wins.length > 1 ? "Close all windows" : "Close window", icon: <CloseGlyph />, onClick: () => wins.forEach((w) => wm.close(w.id)) }] : []),
      ],
    });
  };

  const taskbarMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-app]")) return;
    e.preventDefault();
    menu.open({ x: e.clientX, y: e.clientY, anchorBottom: true, items: [
      { label: "Taskbar settings", icon: <Gear size={16} /> },
    ] });
  };

  return (
    <div className={styles.taskbar} onContextMenu={taskbarMenu} data-taskbar>
      <div className={styles.left}>
        <button className={styles.widget} title="Widgets">
          <svg width="22" height="22" viewBox="0 0 24 24"><path d="M6 14a6 6 0 0 1 1.3-11.7A5 5 0 0 1 17 5a4.5 4.5 0 0 1 .5 9z" fill="#B9C6D6" /><circle cx="17" cy="7" r="3.5" fill="#F4C542" /><path d="M6 15a6 6 0 0 1 1.3-11.7A5 5 0 0 1 17 6a4.5 4.5 0 0 1 .5 9z" fill="#fff" opacity=".85" /></svg>
          <span className={styles.widgetText}><span className={styles.widgetTemp}>71°F</span><span className={styles.widgetDesc}>Partly cloudy</span></span>
        </button>
      </div>
      <div className={styles.center}>
        <button className={`${styles.btn} ${startOpen ? styles.btnPressed : ""}`} title="Start" onClick={onToggleStart} data-start>
          <WindowsLogo size={17} />
        </button>
        <button className={styles.searchBox} title="Search">
          <Search size={17} />
          <span>Search</span>
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
        <button className={styles.trayBtn} title="Show hidden icons" style={{ width: 24 }}><ChevronUp size={12} /></button>
        <button className={styles.trayBtn} title="Internet access&#10;Speakers: 32%" style={{ gap: 6, padding: "0 6px" }}>
          <Wifi size={16} /><Speaker size={16} />
        </button>
        <button className={styles.clock} title="Notifications">
          <span className={styles.clockTime} suppressHydrationWarning>{clock.time}</span>
          <span className={styles.clockDate} suppressHydrationWarning>{clock.date}</span>
        </button>
        <button className={styles.trayBtn} title="No new notifications" style={{ width: 30 }}><Bell size={16} /></button>
        <button className={styles.showDesktop} title="Show desktop" onClick={onShowDesktop} />
      </div>
    </div>
  );
}

const PinGlyph = () => <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l5 5-3 1-3 3 .5 3.5L7 11l-4 4M8.5 8.5L9 5l3-2" /></svg>;
const CloseGlyph = () => <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>;
