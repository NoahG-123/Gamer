"use client";
import React, { useEffect, useState } from "react";
import styles from "./settings.module.css";

interface Prefs { chromeBookmarksBar: boolean; chromeTabGroups: boolean; chromeZoom: number; chromeStartup: "ntp" | "continue" }
interface Profile { displayName: string; accountEmail: string }

const SECTIONS = ["You and Google", "Appearance", "Search engine", "On startup", "Downloads", "About Chrome"] as const;

/**
 * Chrome's settings. The switches here are the same ones the browser's menus use, kept
 * with the rest of the machine's settings, so a change made here shows up in the window
 * straight away and is still there after a restart.
 */
export function SettingsClient() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [downloadDir, setDownloadDir] = useState("");
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Appearance");

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()).then((d) => setPrefs(d.settings)).catch(() => {});
    fetch("/api/profile", { cache: "no-store" }).then((r) => r.json()).then((d) => { setProfile(d.profile); setDownloadDir(`${d.home}\\Downloads`.replace(/\//g, "\\")); }).catch(() => {});
  }, []);

  const save = (patch: Partial<Prefs>) => {
    setPrefs((p) => (p ? { ...p, ...patch } : p));
    fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).catch(() => {});
  };

  const Switch = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
    <button className={`${styles.switch} ${on ? styles.switchOn : ""}`} onClick={() => onChange(!on)}><span className={styles.knob} /></button>
  );

  return (
    <div className={styles.page}>
      <header className={styles.top}><span className={styles.title}>Settings</span></header>
      <div className={styles.body}>
        <nav className={styles.side}>
          {SECTIONS.map((s) => <a key={s} className={s === section ? styles.sideOn : undefined} onClick={() => setSection(s)}>{s}</a>)}
        </nav>
        <main className={styles.main}>
          {!prefs ? <div className={styles.empty}>Loading…</div> : section === "You and Google" ? (
            <section className={styles.card}>
              <h2>You and Google</h2>
              <div className={styles.row}><span>Signed in as</span><span className={styles.value}>{profile?.displayName ?? ""}</span></div>
              <div className={styles.row}><span>Account</span><span className={styles.value}>{profile?.accountEmail ?? ""}</span></div>
              <div className={styles.row}><span>Sync</span><span className={styles.value}>On</span></div>
            </section>
          ) : section === "Appearance" ? (
            <section className={styles.card}>
              <h2>Appearance</h2>
              <div className={styles.row}><span>Show bookmarks bar</span><Switch on={prefs.chromeBookmarksBar} onChange={(v) => save({ chromeBookmarksBar: v })} /></div>
              <div className={styles.row}><span>Show tab groups button</span><Switch on={prefs.chromeTabGroups} onChange={(v) => save({ chromeTabGroups: v })} /></div>
              <div className={styles.row}>
                <span>Page zoom</span>
                <select className={styles.select} value={String(prefs.chromeZoom)} onChange={(e) => save({ chromeZoom: Number(e.target.value) })}>
                  {[0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].map((z) => <option key={z} value={String(z)}>{Math.round(z * 100)}%</option>)}
                </select>
              </div>
            </section>
          ) : section === "Search engine" ? (
            <section className={styles.card}>
              <h2>Search engine</h2>
              <div className={styles.row}><span>Search engine used in the address bar</span><span className={styles.value}>Google</span></div>
              <div className={styles.row}><span>Manage search engines</span><span className={styles.value}>1 engine</span></div>
            </section>
          ) : section === "On startup" ? (
            <section className={styles.card}>
              <h2>On startup</h2>
              <label className={styles.radio}><input type="radio" checked={prefs.chromeStartup === "ntp"} onChange={() => save({ chromeStartup: "ntp" })} /> Open the New Tab page</label>
              <label className={styles.radio}><input type="radio" checked={prefs.chromeStartup === "continue"} onChange={() => save({ chromeStartup: "continue" })} /> Continue where you left off</label>
            </section>
          ) : section === "Downloads" ? (
            <section className={styles.card}>
              <h2>Downloads</h2>
              <div className={styles.row}><span>Location</span><span className={styles.value}>{downloadDir}</span></div>
              <div className={styles.row}><span>Ask where to save each file before downloading</span><span className={styles.value}>Off</span></div>
            </section>
          ) : (
            <section className={styles.card}>
              <h2>About Chrome</h2>
              <div className={styles.row}><span>Google Chrome</span><span className={styles.value}>Version 138.0.7204.101 (Official Build) (64-bit)</span></div>
              <div className={styles.row}><span>Chrome is up to date</span><span className={styles.value} /></div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
