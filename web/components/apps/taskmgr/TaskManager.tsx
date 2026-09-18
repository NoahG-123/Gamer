"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./TaskManager.module.css";
import { WinState, useWM, AppId } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import { APP_META } from "@/components/desktop/Taskbar";
import { api } from "@/lib/client/api";
import * as F from "@/components/icons/fluent";
import * as A from "@/components/icons/apps";

interface Proc { name: string; pid: number; cpu: number; memMb: number; disk: number; network: number; app: boolean; status?: string; winId?: string }
type Tab = "processes" | "performance" | "apphistory" | "startup" | "users" | "details" | "services";
type Metric = "cpu" | "memory" | "disk" | "network";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "processes", label: "Processes", icon: <F.Grid size={16} /> },
  { id: "performance", label: "Performance", icon: <F.DataUsage size={16} /> },
  { id: "apphistory", label: "App history", icon: <F.History size={16} /> },
  { id: "startup", label: "Startup apps", icon: <F.Rocket size={16} /> },
  { id: "users", label: "Users", icon: <F.Accounts size={16} /> },
  { id: "details", label: "Details", icon: <F.DocumentText size={16} /> },
  { id: "services", label: "Services", icon: <F.ServerIcon size={16} /> },
];

/** Task Manager. The apps listed under "Apps" are the windows really open, and End task really closes them. */
export function TaskManager({ win }: { win: WinState }) {
  const wm = useWM();
  const [tab, setTab] = useState<Tab>("processes");
  const [sys, setSys] = useState<Proc[]>([]);
  const [totals, setTotals] = useState({ cpu: 0, memPct: 0, memUsedGb: 0, memTotalGb: 16, diskPct: 0, netMbps: 0 });
  const [sort, setSort] = useState<{ key: "name" | "cpu" | "memMb" | "disk" | "network"; asc: boolean }>({ key: "cpu", asc: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("cpu");
  const history = useRef<Record<Metric, number[]>>({ cpu: [], memory: [], disk: [], network: [] });
  const active = wm.activeId === win.id;

  useEffect(() => {
    let live = true;
    const tick = () => api.tasks().then((d) => {
      if (!live) return;
      setSys(d.processes as Proc[]);
      setTotals(d.totals);
      const h = history.current;
      h.cpu = [...h.cpu, d.totals.cpu].slice(-60);
      h.memory = [...h.memory, d.totals.memPct].slice(-60);
      h.disk = [...h.disk, d.totals.diskPct].slice(-60);
      h.network = [...h.network, Math.min(100, d.totals.netMbps * 40)].slice(-60);
    }).catch(() => {});
    tick();
    const id = setInterval(tick, 1500);
    return () => { live = false; clearInterval(id); };
  }, []);

  // The windows actually open are the "Apps" group, with figures that depend on what they are.
  const apps: Proc[] = useMemo(() => wm.windows.filter((w) => w.app !== "dialog").map((w, i) => {
    const weight: Partial<Record<AppId, number>> = { chrome: 340, whatsapp: 210, explorer: 78, notepad: 14, terminal: 32, settings: 46, taskmgr: 28 };
    return {
      name: APP_META[w.app]?.name ?? w.app, pid: 9000 + i * 24 + (w.id.length % 90),
      cpu: Number((w.minimized ? 0 : (w.app === "chrome" ? 1.4 : 0.4) + Math.abs(Math.sin(Date.now() / 5000 + i))).toFixed(1)),
      memMb: Number(((weight[w.app] ?? 40) * (1 + (i % 3) * 0.08)).toFixed(1)),
      disk: Number((Math.abs(Math.sin(Date.now() / 7000 + i)) * 0.4).toFixed(1)),
      network: Number((w.app === "chrome" ? Math.abs(Math.sin(Date.now() / 4000)) * 0.6 : 0).toFixed(2)),
      app: true, status: w.minimized ? "" : "", winId: w.id,
    };
  }), [wm.windows]);

  const cmp = (a: Proc, b: Proc) => {
    const k = sort.key;
    const r = k === "name" ? a.name.localeCompare(b.name) : (a[k] as number) - (b[k] as number);
    return sort.asc ? r : -r;
  };
  const endTask = () => {
    if (!selected) return;
    const p = [...apps, ...sys].find((x) => String(x.pid) === selected);
    if (p?.winId) wm.close(p.winId);
    setSelected(null);
  };

  const Header = () => (
    <div className={styles.head}>
      <button className={styles.hName} onClick={() => setSort((s) => ({ key: "name", asc: s.key === "name" ? !s.asc : true }))}>Name</button>
      {(["cpu", "memMb", "disk", "network"] as const).map((k) => (
        <button key={k} className={styles.hCell} onClick={() => setSort((s) => ({ key: k, asc: s.key === k ? !s.asc : false }))}>
          <small>{k === "cpu" ? `${totals.cpu}%` : k === "memMb" ? `${totals.memPct}%` : k === "disk" ? `${totals.diskPct}%` : `${totals.netMbps}%`}</small>
          {k === "cpu" ? "CPU" : k === "memMb" ? "Memory" : k === "disk" ? "Disk" : "Network"}
        </button>
      ))}
    </div>
  );
  const Row = ({ p, icon }: { p: Proc; icon?: React.ReactNode }) => (
    <div className={`${styles.row} ${selected === String(p.pid) ? styles.rowSel : ""}`} onClick={() => setSelected(String(p.pid))} onDoubleClick={endTask}>
      <span className={styles.cName}>{icon ?? <span className={styles.dot} />}<span className={styles.nameText}>{p.name}</span>{p.status && <em className={styles.status}>{p.status}</em>}</span>
      <span className={styles.cell} style={{ background: `rgba(255,180,0,${Math.min(0.32, p.cpu / 30)})` }}>{p.cpu.toFixed(1)}%</span>
      <span className={styles.cell} style={{ background: `rgba(120,160,255,${Math.min(0.32, p.memMb / 900)})` }}>{p.memMb.toFixed(1)} MB</span>
      <span className={styles.cell}>{p.disk.toFixed(1)} MB/s</span>
      <span className={styles.cell}>{p.network.toFixed(1)} Mbps</span>
    </div>
  );

  return (
    <Window win={win} className={styles.win}>
      <div className={`${styles.frame} ${active ? "" : styles.inactive}`}>
        <div className={styles.titleBar} data-drag>
          <span className={styles.titleIcon}><F.DataUsage size={16} /></span>
          <span className={styles.titleText}>Task Manager</span>
          <CaptionButtons win={win} />
        </div>
        <div className={styles.body}>
          <div className={styles.rail}>
            {TABS.map((t) => (
              <button key={t.id} className={`${styles.railBtn} ${tab === t.id ? styles.railOn : ""}`} onClick={() => setTab(t.id)} title={t.label}>
                <span className={styles.railIcon}>{t.icon}</span><span className={styles.railLabel}>{t.label}</span>
              </button>
            ))}
          </div>
          <div className={styles.main}>
            <div className={styles.toolbar}>
              <span className={styles.pageTitle}>{TABS.find((t) => t.id === tab)?.label}</span>
              <span style={{ flex: 1 }} />
              {tab === "processes" && <button className={styles.btn} disabled={!selected} onClick={endTask}><F.Close size={14} /> End task</button>}
              {tab === "performance" && <span className={styles.value}>Up time 4:12:08</span>}
            </div>

            {tab === "processes" && (
              <div className={styles.table}>
                <Header />
                <div className={styles.rows}>
                  <div className={styles.groupRow}>Apps ({apps.length})</div>
                  {[...apps].sort(cmp).map((p) => <Row key={p.pid} p={p} icon={<span className={styles.appIcon}>{APP_META[(wm.windows.find((w) => w.id === p.winId)?.app ?? "explorer") as AppId]?.icon(16)}</span>} />)}
                  <div className={styles.groupRow}>Background processes ({sys.length})</div>
                  {[...sys].sort(cmp).map((p) => <Row key={p.pid} p={p} />)}
                </div>
              </div>
            )}

            {tab === "performance" && (
              <div className={styles.perf}>
                <div className={styles.perfList}>
                  {(["cpu", "memory", "disk", "network"] as Metric[]).map((m) => (
                    <button key={m} className={`${styles.perfItem} ${metric === m ? styles.perfOn : ""}`} onClick={() => setMetric(m)}>
                      <Spark data={history.current[m]} small />
                      <span className={styles.perfText}>
                        <b>{m === "cpu" ? "CPU" : m === "memory" ? "Memory" : m === "disk" ? "Disk 0 (C: D:)" : "Wi-Fi"}</b>
                        <small>{m === "cpu" ? `${totals.cpu}%  3.02 GHz` : m === "memory" ? `${totals.memUsedGb}/${totals.memTotalGb} GB (${totals.memPct}%)` : m === "disk" ? `${totals.diskPct}%` : `S: ${totals.netMbps} R: ${(totals.netMbps * 2.4).toFixed(1)} Mbps`}</small>
                      </span>
                    </button>
                  ))}
                </div>
                <div className={styles.perfMain}>
                  <div className={styles.perfHead}>
                    <b>{metric === "cpu" ? "CPU" : metric === "memory" ? "Memory" : metric === "disk" ? "Disk 0 (C: D:)" : "Wi-Fi"}</b>
                    <span>{metric === "cpu" ? "11th Gen Intel(R) Core(TM) i7-1185G7 @ 3.00GHz" : metric === "memory" ? "16.0 GB DDR4" : metric === "disk" ? "SAMSUNG MZVLB512HBJQ-000L7" : "Intel(R) Wi-Fi 6 AX201 160MHz"}</span>
                  </div>
                  <Spark data={history.current[metric]} />
                  <div className={styles.perfStats}>
                    {metric === "cpu" && <><Stat k="Utilisation" v={`${totals.cpu}%`} /><Stat k="Speed" v="3.02 GHz" /><Stat k="Processes" v={String(sys.length + apps.length)} /><Stat k="Threads" v="2,184" /><Stat k="Handles" v="94,312" /><Stat k="Cores" v="4" /><Stat k="Logical processors" v="8" /><Stat k="Virtualisation" v="Enabled" /></>}
                    {metric === "memory" && <><Stat k="In use" v={`${totals.memUsedGb} GB`} /><Stat k="Available" v={`${(totals.memTotalGb - totals.memUsedGb).toFixed(1)} GB`} /><Stat k="Committed" v={`${(totals.memUsedGb + 2.1).toFixed(1)}/18.6 GB`} /><Stat k="Cached" v="4.9 GB" /><Stat k="Slots used" v="2 of 2" /><Stat k="Speed" v="3200 MT/s" /></>}
                    {metric === "disk" && <><Stat k="Active time" v={`${totals.diskPct}%`} /><Stat k="Average response time" v="0.6 ms" /><Stat k="Read speed" v="1.4 MB/s" /><Stat k="Write speed" v="0.9 MB/s" /><Stat k="Capacity" v="476 GB" /><Stat k="Formatted" v="475 GB" /></>}
                    {metric === "network" && <><Stat k="Send" v={`${totals.netMbps} Mbps`} /><Stat k="Receive" v={`${(totals.netMbps * 2.4).toFixed(1)} Mbps`} /><Stat k="Adapter name" v="Wi-Fi" /><Stat k="SSID" v="Bell-902" /><Stat k="IPv4 address" v="192.168.2.41" /><Stat k="Connection type" v="802.11ax" /></>}
                  </div>
                </div>
              </div>
            )}

            {tab === "startup" && (
              <div className={styles.simple}>
                {[["Microsoft OneDrive", "Microsoft Corporation", "Enabled", "Medium"], ["WhatsApp", "WhatsApp LLC", "Enabled", "Low"], ["Realtek Audio Console", "Realtek", "Enabled", "Low"], ["Steinberg ASIO Host", "Steinberg", "Disabled", "None"], ["Spotify", "Spotify AB", "Disabled", "None"]].map(([n, p, s2, imp]) => (
                  <div key={n} className={styles.srow}><span className={styles.cName}><span className={styles.dot} />{n}</span><span className={styles.cell}>{p}</span><span className={styles.cell}>{s2}</span><span className={styles.cell}>{imp}</span></div>
                ))}
              </div>
            )}
            {tab === "users" && (
              <div className={styles.simple}>
                <div className={styles.srow}><span className={styles.cName}><A.UserAvatar size={16} />wren</span><span className={styles.cell}>{totals.cpu}%</span><span className={styles.cell}>{totals.memUsedGb} GB</span><span className={styles.cell}>{totals.diskPct}%</span></div>
              </div>
            )}
            {tab === "details" && (
              <div className={styles.simple}>
                {[...apps, ...sys].map((p) => (
                  <div key={`d${p.pid}`} className={styles.srow}><span className={styles.cName}><span className={styles.dot} />{p.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14)}.exe</span><span className={styles.cell}>{p.pid}</span><span className={styles.cell}>Running</span><span className={styles.cell}>wren</span><span className={styles.cell}>{p.memMb.toFixed(0)} K</span></div>
                ))}
              </div>
            )}
            {tab === "services" && (
              <div className={styles.simple}>
                {[["Audiosrv", "Windows Audio", "Running"], ["BITS", "Background Intelligent Transfer", "Running"], ["Dhcp", "DHCP Client", "Running"], ["Dnscache", "DNS Client", "Running"], ["Spooler", "Print Spooler", "Stopped"], ["WlanSvc", "WLAN AutoConfig", "Running"], ["bthserv", "Bluetooth Support Service", "Stopped"], ["wuauserv", "Windows Update", "Running"]].map(([n, d, st]) => (
                  <div key={n} className={styles.srow}><span className={styles.cName}><span className={styles.dot} />{n}</span><span className={styles.cell}>{d}</span><span className={styles.cell}>{st}</span></div>
                ))}
              </div>
            )}
            {tab === "apphistory" && (
              <div className={styles.simple}>
                {[["Google Chrome", "14:22:19", "2.1 GB"], ["WhatsApp", "3:04:51", "412 MB"], ["Windows Terminal", "0:41:02", "8 MB"], ["Notepad", "1:12:44", "0 MB"]].map(([n, t, d]) => (
                  <div key={n} className={styles.srow}><span className={styles.cName}><span className={styles.dot} />{n}</span><span className={styles.cell}>{t}</span><span className={styles.cell}>{d}</span></div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Window>
  );
}

const Stat = ({ k, v }: { k: string; v: string }) => <div className={styles.stat}><small>{k}</small><b>{v}</b></div>;

function Spark({ data, small }: { data: number[]; small?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const w = c.width = c.clientWidth * 2, h = c.height = c.clientHeight * 2;
    const g = c.getContext("2d"); if (!g) return;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 1;
    for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(0, (h / 5) * i); g.lineTo(w, (h / 5) * i); g.stroke(); }
    if (!data.length) return;
    const pts = data.slice(-60);
    const step = w / 59;
    g.beginPath();
    g.moveTo(0, h - (pts[0] / 100) * h);
    pts.forEach((v, i) => g.lineTo(i * step, h - (Math.max(0, Math.min(100, v)) / 100) * h));
    g.lineTo((pts.length - 1) * step, h); g.lineTo(0, h); g.closePath();
    g.fillStyle = "rgba(0,120,212,.35)"; g.fill();
    g.beginPath();
    pts.forEach((v, i) => (i ? g.lineTo(i * step, h - (v / 100) * h) : g.moveTo(0, h - (v / 100) * h)));
    g.strokeStyle = "#4CC2FF"; g.lineWidth = small ? 2 : 3; g.stroke();
  });
  return <canvas ref={ref} className={small ? styles.sparkSmall : styles.spark} />;
}
