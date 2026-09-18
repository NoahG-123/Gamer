"use client";
import React, { useEffect, useState } from "react";
import styles from "./ntp.module.css";
import { MdMic, MdOutlineAdd, MdApps, MdAutoAwesome, MdEdit, MdMoreVert } from "react-icons/md";
import { MdOutlinePhotoCamera } from "react-icons/md";

interface Shortcut { title: string; url: string; host: string }

export function NtpClient() {
  const [q, setQ] = useState("");
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [bg, setBg] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/browser").then((r) => r.json()).then((d) => {
      const seen = new Set<string>();
      const out: Shortcut[] = [];
      for (const h of d.history ?? []) {
        try { const u = new URL(h.url); if (seen.has(u.hostname)) continue; seen.add(u.hostname); out.push({ title: (h.title || u.hostname).replace(/ - .*$/, "").slice(0, 24), url: h.url, host: u.hostname }); } catch { /* ignore */ }
        if (out.length >= 9) break;
      }
      setShortcuts(out);
    }).catch(() => {});
    fetch("/api/assets").then((r) => r.json()).then((d) => setBg(d.assets?.["chrome.ntpBackground"]?.url ?? null)).catch(() => {});
  }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = q.trim();
    if (!t) return;
    const isUrl = /^[a-z]+:\/\//i.test(t) || (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) && !t.includes(" "));
    window.location.href = isUrl ? (/^[a-z]+:\/\//i.test(t) ? t : `https://${t}`) : `https://www.google.com/search?q=${encodeURIComponent(t)}&sourceid=chrome&ie=UTF-8`;
  };
  return (
    <div className={`${styles.body} ${bg ? styles.hasBg : ""}`} style={bg ? { backgroundImage: `url(${bg})` } : undefined}>
      <div className={styles.topRight}>
        <a className={styles.topLink} href="https://mail.google.com/mail/">Gmail</a>
        <a className={styles.topLink} href="https://www.google.com/imghp">Images</a>
        <button className={styles.iconBtn} title="Google apps"><MdApps size={22} /></button>
        <button className={styles.avatar} title="Google Account" />
      </div>
      <div className={styles.center}>
        <div className={styles.logo}><GoogleLogo /></div>
        <form className={styles.searchBox} onSubmit={submit}>
          <button type="button" className={styles.searchIconBtn} title="Add"><MdOutlineAdd size={22} /></button>
          <input className={styles.searchInput} placeholder="Ask Google" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <button type="button" className={styles.searchIconBtn} title="Search by voice"><MdMic size={22} /></button>
          <button type="button" className={styles.searchIconBtn} title="Search by image"><MdOutlinePhotoCamera size={22} /></button>
          <button type="button" className={styles.aiChip}><MdAutoAwesome size={18} />AI Mode</button>
        </form>
        <div className={styles.shortcuts}>
          {shortcuts.map((s) => (
            <a key={s.url} className={styles.shortcut} href={s.url} title={s.title}>
              <span className={styles.shortcutIcon}><img src={`https://www.google.com/s2/favicons?domain=${s.host}&sz=32`} alt="" width={24} height={24} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} /></span>
              <span className={styles.shortcutLabel}>{s.title}</span>
            </a>
          ))}
          <button className={styles.shortcut}><span className={styles.shortcutIcon}><MdOutlineAdd size={24} /></span><span className={styles.shortcutLabel}>Add shortcut</span></button>
        </div>
      </div>
      <div className={styles.bottomRight}><button className={styles.customize}><MdEdit size={18} /></button></div>
      <span style={{ display: "none" }}><MdMoreVert /></span>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="272" height="92" viewBox="0 0 272 92" aria-label="Google">
      <text x="0" y="72" fontFamily="Product Sans, 'Google Sans', Arial, sans-serif" fontSize="82" fill="#e8eaed" letterSpacing="-2">Google</text>
    </svg>
  );
}
