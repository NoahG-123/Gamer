"use client";
import React, { useEffect, useState } from "react";
import styles from "./StartMenu.module.css";
import { AppId } from "./wm";
import { Search, ChevronRight, ChevronUp, Power, Phone } from "@/components/icons/fluent";
import * as A from "@/components/icons/apps";
import { api, VfsNode } from "@/lib/client/api";
import { useAsset } from "@/lib/client/assets";

interface Tile { label: string; icon: React.ReactNode; app?: AppId; url?: string }

const TILES: Tile[] = [
  { label: "Spotify", icon: <A.SpotifyIcon size={32} /> },
  { label: "Microsoft Edge", icon: <A.EdgeIcon size={32} /> },
  { label: "Word", icon: <A.WordIcon size={32} /> },
  { label: "Excel", icon: <A.ExcelIcon size={32} /> },
  { label: "PowerPoint", icon: <A.PowerPointIcon size={32} /> },
  { label: "Gmail", icon: <A.GmailIcon size={32} />, app: "chrome", url: "https://mail.google.com/mail/u/0/#inbox" },
  { label: "Google Calendar", icon: <A.CalendarIcon size={32} />, app: "chrome", url: "https://calendar.google.com/calendar/u/0/r" },
  { label: "Microsoft Store", icon: <A.StoreIcon size={32} /> },
  { label: "Photos", icon: <A.PhotosIcon size={32} /> },
  { label: "Settings", icon: <A.SettingsIcon size={32} /> },
  { label: "Google Chrome", icon: <A.ChromeIcon size={32} />, app: "chrome" },
  { label: "WhatsApp", icon: <A.WhatsAppIcon size={32} />, app: "whatsapp" },
  { label: "Xbox", icon: <A.XboxIcon size={32} /> },
  { label: "Calculator", icon: <A.CalculatorIcon size={32} /> },
  { label: "Clock", icon: <A.ClockIcon size={32} /> },
  { label: "Notepad", icon: <A.NotepadIcon size={32} />, app: "notepad" },
  { label: "Terminal", icon: <A.TerminalAppIcon size={32} />, app: "terminal" },
  { label: "REAPER", icon: <A.GenericAppIcon size={32} /> },
  { label: "Paint", icon: <A.PaintIcon size={32} /> },
  { label: "File Explorer", icon: <A.ExplorerAppIcon size={32} />, app: "explorer" },
];

function whenLabel(iso: string): string {
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, now)) {
    const mins = Math.round((now.getTime() - d.getTime()) / 60000);
    if (mins < 2) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.round(mins / 60)}h ago`;
  }
  if (sameDay(d, y)) return `Yesterday at ${time}`;
  const days = Math.round((now.getTime() - d.getTime()) / 86400000);
  if (days < 7) return `${d.toLocaleDateString("en-US", { weekday: "long" })} at ${time}`;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

export function StartMenu({ open, displayName, onLaunch, onOpenFile, onClose }: { open: boolean; displayName: string; onLaunch: (app: AppId, props?: Record<string, unknown>) => void; onOpenFile: (n: VfsNode) => void; onClose: () => void }) {
  const [recent, setRecent] = useState<VfsNode[]>([]);
  const [phonePane, setPhonePane] = useState(true);
  const owner = useAsset("people.owner");
  const illo = useAsset("start.phoneLinkIllustration");
  useEffect(() => { if (open) fetch("/api/fs/recent?limit=6").then((r) => r.json()).then((d) => setRecent(d.recent ?? [])).catch(() => {}); }, [open]);
  return (
    <div className={`${styles.wrap} ${open ? styles.open : ""} ${phonePane ? styles.withPane : ""}`} data-startmenu>
      <div className={styles.start}>
        <div className={styles.searchRow}>
          <div className={styles.searchWrap}>
            <Search size={16} className={styles.searchIcon} />
            <input className={styles.search} placeholder="Search for apps, settings, and documents" readOnly />
          </div>
          <button className={`${styles.phoneToggle} ${phonePane ? styles.phoneToggleOn : ""}`} title="Phone Link" onClick={() => setPhonePane((p) => !p)}><Phone size={18} /></button>
        </div>
        <div className={styles.sectionHead}><span>Pinned</span><button className={styles.pill}>All apps <ChevronRight size={12} /></button></div>
        <div className={styles.grid}>
          {TILES.map((t) => (
            <button key={t.label} className={styles.tile} onClick={() => { if (t.app) onLaunch(t.app, t.url ? { openUrl: t.url } : undefined); onClose(); }}>
              <span className={styles.tileIcon}>{t.icon}</span>
              <span className={styles.tileLabel}>{t.label}</span>
            </button>
          ))}
        </div>
        <div className={styles.sectionHead}><span>Recommended</span><button className={styles.pill}>More <ChevronRight size={12} /></button></div>
        <div className={styles.recent}>
          {recent.map((n) => (
            <button key={n.path} className={styles.recentItem} onClick={() => { onOpenFile(n); onClose(); }}>
              <span className={styles.recentIcon}><A.FileTypeIcon ext={n.ext} name={n.name} size={26} /></span>
              <span className={styles.recentText}><span className={styles.recentName}>{n.name}</span><span className={styles.recentWhen}>{whenLabel(n.modified)}</span></span>
            </button>
          ))}
        </div>
        <div className={styles.footer}>
          <button className={styles.user}><A.UserAvatar size={32} src={owner} /><span>{displayName}</span></button>
          <button className={styles.powerBtn} title="Power"><Power size={18} /></button>
        </div>
      </div>
      {phonePane && (
        <div className={styles.pane}>
          <div className={styles.paneIllo}>{illo ? <img src={illo} alt="" /> : <A.PhoneLinkIcon size={120} />}</div>
          <div className={styles.paneTitle}>Access your mobile device here</div>
          <div className={styles.paneText}>Keep up with calls, messages, and recent activity here in the Start menu.</div>
          <div className={styles.paneSelect}>Select device</div>
          <div className={styles.paneButtons}><button className={styles.paneBtn}>Android™</button><button className={styles.paneBtn}>iPhone®</button></div>
          <button className={styles.paneHide} onClick={() => setPhonePane(false)}>Hide this pane</button>
        </div>
      )}
      <span style={{ display: "none" }}><ChevronUp size={10} /></span>
    </div>
  );
}
