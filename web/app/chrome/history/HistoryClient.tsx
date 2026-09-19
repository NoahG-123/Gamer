"use client";
import React, { useEffect, useMemo, useState } from "react";
import styles from "./history.module.css";

interface Visit { url: string; title: string; at: string }

const dayLabel = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (same(d, now)) return "Today - " + d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (same(d, y)) return "Yesterday - " + d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
};

export function HistoryClient() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(true);

  const load = (query = "") => {
    setBusy(true);
    fetch(`/api/browser/history?q=${encodeURIComponent(query)}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => setVisits(d.visits ?? [])).catch(() => setVisits([])).finally(() => setBusy(false));
  };
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    const out: { label: string; items: Visit[] }[] = [];
    for (const v of visits) {
      const label = dayLabel(v.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(v); else out.push({ label, items: [v] });
    }
    return out;
  }, [visits]);

  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <span className={styles.title}>History</span>
        <div className={styles.search}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z" /></svg>
          <input placeholder="Search history" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(q); }} />
        </div>
      </header>
      <div className={styles.body}>
        <nav className={styles.side}>
          <a className={styles.sideOn}>Chrome history</a>
          <button className={styles.clear} onClick={() => { if (confirm("Clear all browsing history from this device?")) fetch("/api/browser/history", { method: "DELETE" }).then(() => load(q)); }}>Clear browsing data</button>
        </nav>
        <main className={styles.list}>
          {busy && <div className={styles.empty}>Loading…</div>}
          {!busy && !groups.length && <div className={styles.empty}>{q ? "No search results found" : "No history"}</div>}
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className={styles.day}>{g.label}</h2>
              {g.items.map((v, i) => (
                <div key={v.url + i} className={styles.row}>
                  <span className={styles.time}>{new Date(v.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                  <img className={styles.fav} src={`/api/favicon?host=${encodeURIComponent(host(v.url))}`} alt="" />
                  <a className={styles.link} href={v.url}>{v.title || v.url}</a>
                  <span className={styles.host}>{host(v.url)}</span>
                </div>
              ))}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
