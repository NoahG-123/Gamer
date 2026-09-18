"use client";
import React, { useEffect, useState } from "react";
import styles from "./downloads.module.css";

interface Item { id: number; name: string; url: string; path: string; size: number; state: string; at: string }

const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

export function DownloadsClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const load = () => fetch("/api/downloads", { cache: "no-store" }).then((r) => r.json()).then((d) => setItems(d.downloads ?? [])).catch(() => {}).finally(() => setLoading(false));
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, []);
  const open = (it: Item) => {
    fetch("/api/fs/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: it.path }) })
      .then((r) => r.json())
      .then((d) => { if (d.openable && d.url) location.href = d.url; });
  };
  return (
    <div className={styles.page}>
      <header className={styles.top}><span className={styles.title}>Downloads</span></header>
      <main className={styles.list}>
        {loading && <div className={styles.empty}>Loading…</div>}
        {!loading && !items.length && <div className={styles.empty}><div className={styles.emptyArt}>⭳</div>Files you download appear here</div>}
        {items.map((it) => (
          <div key={it.id} className={styles.card}>
            <div className={styles.icon}>📄</div>
            <div className={styles.meta}>
              <button className={styles.name} onClick={() => open(it)}>{it.name}</button>
              <span className={styles.url}>{(() => { try { return new URL(it.url).hostname; } catch { return it.url; } })()}</span>
              <span className={styles.state}>{bytes(it.size)} — {it.state === "complete" ? "Done" : it.state}</span>
              <span className={styles.path}>{it.path.replace(/\//g, "\\")}</span>
            </div>
            <span className={styles.when}>{new Date(it.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </div>
        ))}
      </main>
    </div>
  );
}
