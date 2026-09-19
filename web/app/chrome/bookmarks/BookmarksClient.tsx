"use client";
import React, { useEffect, useMemo, useState } from "react";
import styles from "./bookmarks.module.css";

interface Bookmark { id: string; title: string; url?: string; folder?: boolean; children?: Bookmark[] }

/** The bookmark manager. The same bookmarks the bar shows, and removing one here removes it there. */
export function BookmarksClient() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(true);

  const load = () => {
    setBusy(true);
    fetch("/api/browser", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setBookmarks(d.bookmarks ?? [])).catch(() => setBookmarks([])).finally(() => setBusy(false));
  };
  useEffect(load, []);

  const folders = useMemo(() => bookmarks.filter((b) => b.folder), [bookmarks]);
  const shown = useMemo(() => {
    const list = folder ? (folders.find((f) => f.id === folder)?.children ?? []) : bookmarks;
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    const all = [...bookmarks, ...folders.flatMap((f) => f.children ?? [])];
    return all.filter((b) => !b.folder && (b.title.toLowerCase().includes(needle) || (b.url ?? "").toLowerCase().includes(needle)));
  }, [bookmarks, folders, folder, q]);

  const host = (u?: string) => { try { return new URL(u ?? "").hostname.replace(/^www\./, ""); } catch { return u ?? ""; } };
  const remove = async (b: Bookmark) => {
    if (!b.url) return;
    await fetch("/api/browser/bookmarks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: b.url, title: b.title, add: false }) });
    load();
  };

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <span className={styles.title}>Bookmarks</span>
        <div className={styles.search}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z" /></svg>
          <input placeholder="Search bookmarks" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </header>
      <div className={styles.body}>
        <nav className={styles.side}>
          <a className={folder === null ? styles.sideOn : undefined} onClick={() => { setFolder(null); setQ(""); }}>Bookmarks bar</a>
          {folders.map((f) => (
            <a key={f.id} className={folder === f.id ? styles.sideOn : undefined} onClick={() => { setFolder(f.id); setQ(""); }}>{f.title}</a>
          ))}
        </nav>
        <main className={styles.list}>
          {busy && <div className={styles.empty}>Loading…</div>}
          {!busy && !shown.length && <div className={styles.empty}>{q ? "No bookmarks match your search" : "This folder is empty"}</div>}
          {shown.map((b) => (
            <div key={b.id} className={styles.row}>
              {b.folder ? (
                <span className={styles.fav}>
                  <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" /></svg>
                </span>
              ) : (
                <img className={styles.fav} src={`https://www.google.com/s2/favicons?domain=${host(b.url)}&sz=32`} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
              )}
              {b.folder
                ? <a className={styles.link} onClick={() => setFolder(b.id)}>{b.title}</a>
                : <a className={styles.link} href={b.url}>{b.title}</a>}
              <span className={styles.host}>{b.folder ? `${b.children?.length ?? 0} items` : host(b.url)}</span>
              {!b.folder && <button className={styles.del} title="Delete" onClick={() => void remove(b)}>Delete</button>}
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
