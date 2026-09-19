"use client";
import React, { useCallback, useEffect, useState } from "react";
import styles from "./ntp.module.css";
import { MdMic, MdOutlineAdd, MdApps, MdAutoAwesome, MdEdit, MdClose, MdCheck, MdSearch } from "react-icons/md";
import { MdOutlinePhotoCamera } from "react-icons/md";

interface Shortcut { title: string; url: string; host: string; custom?: boolean }
interface Asset { key: string; url: string | null; title?: string; wallpaper?: boolean }
interface Picture { name: string; path: string }

const CUSTOM_KEY = "chrome.ntp.shortcuts";
const HIDDEN_KEY = "chrome.ntp.hidden";

function readList<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function writeList(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** A site's icon, answered by this machine rather than fetched from google.com. */
function Tile({ host }: { host: string }) {
  return <img src={`/api/favicon?host=${encodeURIComponent(host)}`} alt="" width={24} height={24} />;
}

export function NtpClient() {
  const [q, setQ] = useState("");
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [custom, setCustom] = useState<Shortcut[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [assets, setAssets] = useState<Record<string, Asset>>({});
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [bgKey, setBgKey] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const say = (t: string) => { setNote(t); window.setTimeout(() => setNote((n) => (n === t ? null : n)), 4000); };

  const loadSettings = useCallback(() => {
    fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()).then((d) => setBgKey(d.settings?.chromeNtpBackground ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    setCustom(readList<Shortcut[]>(CUSTOM_KEY, []));
    setHidden(readList<string[]>(HIDDEN_KEY, []));
    fetch("/api/browser").then((r) => r.json()).then((d) => {
      const seen = new Set<string>();
      const out: Shortcut[] = [];
      for (const h of d.history ?? []) {
        try { const u = new URL(h.url); if (seen.has(u.hostname)) continue; seen.add(u.hostname); out.push({ title: (h.title || u.hostname).replace(/ - .*$/, "").slice(0, 24), url: h.url, host: u.hostname }); } catch { /* not a URL */ }
        if (out.length >= 9) break;
      }
      setShortcuts(out);
    }).catch(() => {});
    fetch("/api/assets").then((r) => r.json()).then((d) => setAssets(d.assets ?? {})).catch(() => {});
    loadSettings();
  }, [loadSettings]);

  // Pictures on this machine, so the new tab page can use one the same way the desktop does.
  useEffect(() => {
    if (!customizing || pictures.length) return;
    fetch("/api/profile").then((r) => r.json()).then((d: { home: string }) =>
      fetch(`/api/fs/search?path=${encodeURIComponent(d.home)}&q=.`).then((r) => r.json()).then((s: { results: { name: string; path: string; dir: boolean; ext: string }[] }) =>
        setPictures(s.results.filter((n) => !n.dir && /^(jpg|jpeg|png|bmp|webp|heic)$/.test(n.ext)).slice(0, 40).map((n) => ({ name: n.name, path: n.path })))),
    ).catch(() => {});
  }, [customizing, pictures.length]);

  const setBackground = (key: string | null) => {
    setBgKey(key);
    fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chromeNtpBackground: key }) }).catch(() => {});
  };

  const bg = bgKey ? (/^[A-Za-z]:\//.test(bgKey) ? `/lf/${encodeURIComponent(bgKey).replace(/%2F/g, "/")}` : assets[bgKey]?.url ?? null) : null;
  const presets = Object.values(assets).filter((a) => a.wallpaper && a.url);

  const visible = [...custom, ...shortcuts.filter((s) => !hidden.includes(s.url))].slice(0, 10);

  const addShortcut = () => {
    const name = window.prompt("Shortcut name");
    if (name === null) return;
    const url = window.prompt("URL", "https://");
    if (!url) return;
    let host = url;
    try { host = new URL(url.includes("://") ? url : `https://${url}`).hostname; } catch { /* keep the raw text */ }
    const next = [...custom, { title: name.trim() || host, url: url.includes("://") ? url : `https://${url}`, host, custom: true }];
    setCustom(next); writeList(CUSTOM_KEY, next);
  };
  const removeShortcut = (s: Shortcut) => {
    if (s.custom) { const next = custom.filter((c) => c.url !== s.url); setCustom(next); writeList(CUSTOM_KEY, next); }
    else { const next = [...hidden, s.url]; setHidden(next); writeList(HIDDEN_KEY, next); }
  };

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
        <a className={styles.topLink} href="https://calendar.google.com/">Calendar</a>
        <button className={styles.iconBtn} title="Google apps" onClick={() => say("Gmail and Calendar are the only Google apps set up on this computer.")}><MdApps size={22} /></button>
        <a className={styles.avatar} href="https://myaccount.google.com/" title="Google Account" />
      </div>

      <div className={styles.center}>
        <div className={styles.logo}><GoogleLogo /></div>
        <form className={styles.searchBox} onSubmit={submit}>
          <button type="submit" className={styles.searchIconBtn} title="Search"><MdSearch size={22} /></button>
          <input className={styles.searchInput} placeholder="Search Google or type a URL" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <button type="button" className={styles.searchIconBtn} title="Search by voice" onClick={() => say("Voice search needs a microphone. No microphone is attached to this computer.")}><MdMic size={22} /></button>
          <button type="button" className={styles.searchIconBtn} title="Search by image" onClick={() => say("Search by image needs a camera or a picture to upload, and this copy cannot upload.")}><MdOutlinePhotoCamera size={22} /></button>
          <button type="button" className={styles.aiChip} onClick={() => { window.location.href = `https://www.google.com/search?q=${encodeURIComponent(q.trim() || "AI Mode")}&udm=50`; }}><MdAutoAwesome size={18} />AI Mode</button>
        </form>

        <div className={styles.shortcuts}>
          {visible.map((s) => (
            <div key={s.url} className={styles.shortcutWrap}>
              <a className={styles.shortcut} href={s.url} title={s.title}>
                <span className={styles.shortcutIcon}><Tile host={s.host} /></span>
                <span className={styles.shortcutLabel}>{s.title}</span>
              </a>
              <button className={styles.shortcutX} title="Remove" onClick={(e) => { e.preventDefault(); removeShortcut(s); }}><MdClose size={14} /></button>
            </div>
          ))}
          {visible.length < 10 && (
            <button className={styles.shortcut} onClick={addShortcut}>
              <span className={styles.shortcutIcon}><MdOutlineAdd size={24} /></span>
              <span className={styles.shortcutLabel}>Add shortcut</span>
            </button>
          )}
        </div>
      </div>

      {note && <div className={styles.note}>{note}</div>}

      <div className={styles.bottomRight}>
        <button className={styles.customize} title="Customise Chrome" onClick={() => setCustomizing((c) => !c)}><MdEdit size={18} /></button>
      </div>

      {customizing && (
        <aside className={styles.panel}>
          <div className={styles.panelHead}>
            <span>Customise Chrome</span>
            <button className={styles.iconBtn} title="Close" onClick={() => setCustomizing(false)}><MdClose size={18} /></button>
          </div>

          <div className={styles.panelSection}>Background</div>
          <div className={styles.grid}>
            <button className={`${styles.swatch} ${styles.noneSwatch} ${bgKey === null ? styles.swatchOn : ""}`} title="No background" onClick={() => setBackground(null)}>
              {bgKey === null && <MdCheck size={18} />}
            </button>
            {presets.map((a) => (
              <button key={a.key} className={`${styles.swatch} ${bgKey === a.key ? styles.swatchOn : ""}`} title={a.title ?? a.key} onClick={() => setBackground(a.key)}>
                <img src={a.url!} alt="" loading="lazy" />
                {bgKey === a.key && <span className={styles.tick}><MdCheck size={16} /></span>}
              </button>
            ))}
          </div>

          <div className={styles.panelSection}>From this computer</div>
          {pictures.length === 0 && <div className={styles.panelNote}>No pictures found yet. Anything you save out of the browser turns up here.</div>}
          <div className={styles.grid}>
            {pictures.map((p) => (
              <button key={p.path} className={`${styles.swatch} ${bgKey === p.path ? styles.swatchOn : ""}`} title={p.name} onClick={() => setBackground(p.path)}>
                <img src={`/lf/${encodeURIComponent(p.path).replace(/%2F/g, "/")}`} alt="" loading="lazy" />
                {bgKey === p.path && <span className={styles.tick}><MdCheck size={16} /></span>}
              </button>
            ))}
          </div>

          <div className={styles.panelNote}>
            The desktop background is set in Settings → Personalisation. This one is only the new tab page.
          </div>
        </aside>
      )}
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
