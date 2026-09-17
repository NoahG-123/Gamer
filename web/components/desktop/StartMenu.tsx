"use client";
import React, { useEffect, useState } from "react";
import styles from "./StartMenu.module.css";
import { AppId } from "./wm";
import { Search, ChevronRight, Power } from "@/components/icons/fluent";
import * as A from "@/components/icons/apps";
import { api, VfsNode } from "@/lib/client/api";

interface Tile { label: string; icon: React.ReactNode; app?: AppId }

const TILES: Tile[] = [
  { label: "Microsoft Edge", icon: <A.EdgeIcon size={32} /> },
  { label: "Word", icon: <A.WordIcon size={32} /> },
  { label: "Excel", icon: <A.ExcelIcon size={32} /> },
  { label: "PowerPoint", icon: <A.PowerPointIcon size={32} /> },
  { label: "Mail", icon: <A.MailIcon size={32} /> },
  { label: "Calendar", icon: <A.CalendarIcon size={32} /> },
  { label: "Microsoft Store", icon: <A.StoreIcon size={32} /> },
  { label: "Photos", icon: <A.PhotosIcon size={32} /> },
  { label: "Settings", icon: <A.SettingsIcon size={32} /> },
  { label: "Google Chrome", icon: <A.ChromeIcon size={32} />, app: "chrome" },
  { label: "WhatsApp", icon: <A.WhatsAppIcon size={32} />, app: "whatsapp" },
  { label: "Spotify", icon: <A.SpotifyIcon size={32} /> },
  { label: "Calculator", icon: <A.CalculatorIcon size={32} /> },
  { label: "Clock", icon: <A.ClockIcon size={32} /> },
  { label: "Notepad", icon: <A.NotepadIcon size={32} />, app: "notepad" },
  { label: "Paint", icon: <A.PaintIcon size={32} /> },
  { label: "Snipping Tool", icon: <A.SnipIcon size={32} /> },
  { label: "Xbox", icon: <A.XboxIcon size={32} /> },
];

function relTime(iso: string): string {
  const d = new Date(iso), now = new Date();
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + (d.getFullYear() !== now.getFullYear() ? `, ${d.getFullYear()}` : "");
}

export function StartMenu({ open, displayName, onLaunch, onOpenFile, onClose }: { open: boolean; displayName: string; onLaunch: (app: AppId) => void; onOpenFile: (n: VfsNode) => void; onClose: () => void }) {
  const [recent, setRecent] = useState<VfsNode[]>([]);
  useEffect(() => { if (open) fetch("/api/fs/recent").then((r) => r.json()).then((d) => setRecent(d.recent ?? [])).catch(() => {}); }, [open]);
  return (
    <div className={`${styles.start} ${open ? styles.open : ""}`} data-startmenu>
      <div className={styles.searchWrap}>
        <Search size={16} className={styles.searchIcon} />
        <input className={styles.search} placeholder="Search for apps, settings, and documents" readOnly />
      </div>
      <div className={styles.sectionHead}><span>Pinned</span><button className={styles.pill}>All apps <ChevronRight size={12} /></button></div>
      <div className={styles.grid}>
        {TILES.map((t) => (
          <button key={t.label} className={styles.tile} onClick={() => { if (t.app) onLaunch(t.app); onClose(); }}>
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
            <span className={styles.recentText}><span className={styles.recentName}>{n.name}</span><span className={styles.recentWhen}>{relTime(n.modified)}</span></span>
          </button>
        ))}
      </div>
      <div className={styles.footer}>
        <button className={styles.user}><A.UserAvatar size={32} name={displayName} /><span>{displayName}</span></button>
        <button className={styles.powerBtn} title="Power"><Power size={16} /></button>
      </div>
    </div>
  );
}
