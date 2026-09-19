"use client";
import React, { useEffect, useMemo, useState } from "react";
import styles from "./Settings.module.css";
import { WinState, useWM } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import { useOS } from "@/components/desktop/os";
import { useSystem } from "@/lib/client/system";
import { useAssets } from "@/lib/client/assets";
import { api, VfsNode } from "@/lib/client/api";
import * as F from "@/components/icons/fluent";
import * as A from "@/components/icons/apps";

type PageId = "system" | "bluetooth" | "network" | "personalisation" | "apps" | "accounts" | "time" | "accessibility" | "privacy" | "update";

const PAGES: { id: PageId; label: string; icon: React.ReactNode }[] = [
  { id: "system", label: "System", icon: <F.Monitor size={18} /> },
  { id: "bluetooth", label: "Bluetooth & devices", icon: <F.Bluetooth size={18} /> },
  { id: "network", label: "Network & internet", icon: <F.Wifi size={18} /> },
  { id: "personalisation", label: "Personalisation", icon: <F.PaintBrush size={18} /> },
  { id: "apps", label: "Apps", icon: <F.AppFolder size={18} /> },
  { id: "accounts", label: "Accounts", icon: <F.Accounts size={18} /> },
  { id: "time", label: "Time & language", icon: <F.ClockIcon size={18} /> },
  { id: "accessibility", label: "Accessibility", icon: <F.Accessibility size={18} /> },
  { id: "privacy", label: "Privacy & security", icon: <F.LockClosed size={18} /> },
  { id: "update", label: "Windows Update", icon: <F.SyncIcon size={18} /> },
];

const ACCENTS = ["#0067C0", "#4CC2FF", "#00B7C3", "#10893E", "#7A7574", "#8764B8", "#C239B3", "#E74856", "#F7630C", "#FFB900", "#498205", "#744DA9"];

/** Windows 11 Settings. The controls on the System, Network and Personalisation pages are live. */
export function Settings({ win }: { win: WinState }) {
  const wm = useWM();
  const os = useOS();
  const sys = useSystem();
  const assets = useAssets();
  const s = sys.settings;
  const [page, setPage] = useState<PageId>((win.props.page as PageId) || "system");
  const [pictures, setPictures] = useState<VfsNode[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const active = wm.activeId === win.id;

  useEffect(() => { if (win.props.page) setPage(win.props.page as PageId); }, [win.props.page]);
  useEffect(() => {
    if (page !== "personalisation") return;
    api.search(os.home, ".").then((d) => setPictures(d.results.filter((n) => !n.dir && /^(jpg|jpeg|png|bmp|webp|heic)$/.test(n.ext)).slice(0, 60))).catch(() => {});
  }, [page, os.home]);

  const wallpaperUrl = (v: string | null): string | null => {
    if (!v) return null;
    if (/^[A-Za-z]:\//.test(v)) return `/lf/${encodeURIComponent(v).replace(/%2F/g, "/")}`;
    return assets[v]?.url ?? null;
  };

  const Toggle = ({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
    <button className={`${styles.toggle} ${on ? styles.toggleOn : ""} ${disabled ? styles.toggleDisabled : ""}`} onClick={() => !disabled && onChange(!on)} role="switch" aria-checked={on} disabled={disabled}>
      <span className={styles.toggleKnob} />
    </button>
  );
  const Row = ({ icon, title, sub, right, onClick }: { icon?: React.ReactNode; title: string; sub?: string; right?: React.ReactNode; onClick?: () => void }) => (
    <div className={`${styles.card} ${onClick ? styles.cardClickable : ""}`} onClick={onClick}>
      {icon && <span className={styles.cardIcon}>{icon}</span>}
      <span className={styles.cardText}><span className={styles.cardTitle}>{title}</span>{sub && <span className={styles.cardSub}>{sub}</span>}</span>
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );

  const body = () => {
    switch (page) {
      case "system": return (
        <>
          <h2 className={styles.h2}>System</h2>
          <div className={styles.group}>Display</div>
          <div className={styles.card}>
            <span className={styles.cardIcon}><F.Brightness size={20} /></span>
            <span className={styles.cardText}><span className={styles.cardTitle}>Brightness</span><span className={styles.cardSub}>Adjust the brightness of the built-in display</span></span>
            <input className={styles.slider} type="range" min={30} max={100} value={s.brightness} onChange={(e) => sys.set({ brightness: Number(e.target.value) })} />
          </div>
          <Row title="Display resolution" sub="1920 × 1080 (Recommended)" right={<span className={styles.value}>100% scaling</span>} />
          <Row title="Multiple displays" sub="Choose the presentation mode for your displays" right={<span className={styles.value}>1 display detected</span>} />
          <div className={styles.group}>Sound</div>
          <div className={styles.card}>
            <span className={styles.cardIcon}>{s.muted ? <F.SpeakerOff size={20} /> : <F.Speaker size={20} />}</span>
            <span className={styles.cardText}><span className={styles.cardTitle}>Volume</span><span className={styles.cardSub}>Realtek(R) Audio — Speakers</span></span>
            <button className={styles.linkBtn} onClick={() => sys.set({ muted: !s.muted })}>{s.muted ? "Unmute" : "Mute"}</button>
            <input className={styles.slider} type="range" min={0} max={100} value={s.muted ? 0 : s.volume} onChange={(e) => { const v = Number(e.target.value); sys.set({ volume: v, muted: v === 0 }); }} onMouseUp={() => sys.play("click")} />
          </div>
          <Row title="Output device" sub="Speakers (Realtek(R) Audio)" right={<span className={styles.value}>Default</span>} />
          <Row title="Input device" sub="No microphone is connected to this computer." right={<span className={styles.value}>None</span>} />
          <div className={styles.group}>About</div>
          <div className={styles.about}>
            <div><b>Device name</b><span>{os.profile.machineName}</span></div>
            <div><b>Processor</b><span>11th Gen Intel(R) Core(TM) i7-1185G7 @ 3.00GHz</span></div>
            <div><b>Installed RAM</b><span>16.0 GB (15.7 GB usable)</span></div>
            <div><b>Device ID</b><span>7C1F0A3E-5B94-4A2D-9E67-2F80C1D4A115</span></div>
            <div><b>System type</b><span>64-bit operating system, x64-based processor</span></div>
            <div><b>Pen and touch</b><span>No pen or touch input is available for this display</span></div>
            <div><b>Edition</b><span>Windows 11 Pro</span></div>
            <div><b>Version</b><span>23H2</span></div>
            <div><b>OS build</b><span>22631.4169</span></div>
          </div>
        </>
      );
      case "bluetooth": return (
        <>
          <h2 className={styles.h2}>Bluetooth &amp; devices</h2>
          <div className={styles.card}>
            <span className={styles.cardIcon}><F.Bluetooth size={20} /></span>
            <span className={styles.cardText}><span className={styles.cardTitle}>Bluetooth</span><span className={styles.cardSub}>No Bluetooth adapter found.</span></span>
            <span style={{ flex: 1 }} />
            <Toggle on={false} onChange={() => {}} disabled />
          </div>
          <div className={styles.note}>This device does not have a Bluetooth adapter, so Bluetooth cannot be turned on. Connect a Bluetooth adapter to use Bluetooth devices.</div>
          <div className={styles.group}>Devices</div>
          <Row icon={<F.Monitor size={20} />} title="Generic PnP Monitor" sub="Display" right={<span className={styles.value}>Connected</span>} />
          <Row icon={<F.Keyboard size={20} />} title="Standard PS/2 Keyboard" sub="Keyboard" right={<span className={styles.value}>Connected</span>} />
          <Row icon={<F.PlugConnected size={20} />} title="USB Composite Device" sub="Audio interface" right={<span className={styles.value}>Not present</span>} />
          <div className={styles.group}>Printers &amp; scanners</div>
          <div className={styles.note}>No printers or scanners are installed. Printing is not available on this computer.</div>
        </>
      );
      case "network": return (
        <>
          <h2 className={styles.h2}>Network &amp; internet</h2>
          <div className={styles.card}>
            <span className={styles.cardIcon}>{sys.online ? <F.Wifi size={20} /> : <F.WifiOff size={20} />}</span>
            <span className={styles.cardText}><span className={styles.cardTitle}>Wi-Fi</span><span className={styles.cardSub}>{sys.online ? "Connected to Bell-902" : s.airplane ? "Unavailable — airplane mode is on" : "Not connected"}</span></span>
            <span style={{ flex: 1 }} />
            <Toggle on={s.wifi && !s.airplane} onChange={(v) => sys.set({ wifi: v })} />
          </div>
          <div className={styles.card}>
            <span className={styles.cardIcon}><F.Airplane size={20} /></span>
            <span className={styles.cardText}><span className={styles.cardTitle}>Airplane mode</span><span className={styles.cardSub}>Stop all wireless communication</span></span>
            <span style={{ flex: 1 }} />
            <Toggle on={s.airplane} onChange={(v) => sys.set({ airplane: v })} />
          </div>
          <Row icon={<F.PlugConnected size={20} />} title="Ethernet" sub="No network adapter is connected" right={<span className={styles.value}>Not connected</span>} />
          <div className={styles.group}>Properties</div>
          <div className={styles.about}>
            <div><b>SSID</b><span>{sys.online ? "Bell-902" : "—"}</span></div>
            <div><b>Protocol</b><span>Wi-Fi 6 (802.11ax)</span></div>
            <div><b>IPv4 address</b><span>{sys.online ? "192.168.2.41" : "—"}</span></div>
            <div><b>DNS servers</b><span>{sys.online ? "192.168.2.1, 8.8.8.8" : "—"}</span></div>
            <div><b>Physical address (MAC)</b><span>B4-6B-FC-1A-07-D2</span></div>
          </div>
        </>
      );
      case "personalisation": return (
        <>
          <h2 className={styles.h2}>Personalisation</h2>
          <div className={styles.preview} style={{ backgroundImage: wallpaperUrl(s.wallpaper) ? `url(${wallpaperUrl(s.wallpaper)})` : undefined }}>
            <div className={styles.previewBar} style={{ background: s.accent }} />
          </div>
          <div className={styles.group}>Background</div>
          <div className={styles.thumbs}>
            {assets["wallpaper.desktop"]?.url && (
              <button className={`${styles.thumb} ${s.wallpaper === "wallpaper.desktop" ? styles.thumbOn : ""}`} title="Windows default" onClick={() => sys.set({ wallpaper: "wallpaper.desktop" })}>
                <img src={assets["wallpaper.desktop"].url!} alt="" />
              </button>
            )}
            {(browsing ? pictures : pictures.slice(0, 11)).map((p) => (
              <button key={p.path} className={`${styles.thumb} ${s.wallpaper === p.path ? styles.thumbOn : ""}`} title={p.name} onClick={() => { sys.set({ wallpaper: p.path }); sys.play("click"); }}>
                <img src={`/lf/${encodeURIComponent(p.path).replace(/%2F/g, "/")}`} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <div className={styles.rowBtns}>
            <button className={styles.btn} onClick={() => setBrowsing((b) => !b)}>{browsing ? "Show fewer" : `Browse photos (${pictures.length})`}</button>
            <span className={styles.value}>Choose a fit</span>
            <select className={styles.select} value={s.wallpaperFit} onChange={(e) => sys.set({ wallpaperFit: e.target.value as typeof s.wallpaperFit })}>
              {["fill", "fit", "stretch", "tile", "centre", "span"].map((f) => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}
            </select>
          </div>
          <div className={styles.group}>Colours</div>
          <div className={styles.card}>
            <span className={styles.cardIcon}><F.ColorIcon size={20} /></span>
            <span className={styles.cardText}><span className={styles.cardTitle}>Choose your mode</span></span>
            <span style={{ flex: 1 }} />
            <select className={styles.select} value={s.theme} onChange={(e) => sys.set({ theme: e.target.value as "dark" | "light" })}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div className={styles.group}>Accent colour</div>
          <div className={styles.swatches}>
            {ACCENTS.map((c) => <button key={c} className={`${styles.swatch} ${s.accent.toLowerCase() === c.toLowerCase() ? styles.swatchOn : ""}`} style={{ background: c }} onClick={() => { sys.set({ accent: c }); sys.play("click"); }} aria-label={c} />)}
          </div>
          <div className={styles.group}>Lock screen</div>
          <Row title="Lock screen status" sub="Weather" right={<span className={styles.value}>On</span>} />
        </>
      );
      case "apps": return (
        <>
          <h2 className={styles.h2}>Apps</h2>
          <div className={styles.group}>Installed apps</div>
          {[["Google Chrome", "138.0.7204.101", "412 MB"], ["WhatsApp", "2.2440.8", "284 MB"], ["Windows Terminal", "1.20.11781.0", "48.2 MB"], ["Notepad", "11.2402.22.0", "12.1 MB"], ["REAPER (x64)", "7.16", "63.4 MB"], ["7-Zip 23.01", "23.01", "5.12 MB"], ["Microsoft Edge", "129.0.2792.52", "512 MB"], ["Python 3.11.7 (64-bit)", "3.11.7", "112 MB"], ["Git", "2.45.1", "318 MB"]].map(([n, v, sz]) => (
            <Row key={n} icon={<A.GenericAppIcon size={20} />} title={n} sub={`${sz} — installed`} right={<span className={styles.value}>{v}</span>} />
          ))}
        </>
      );
      case "accounts": return (
        <>
          <h2 className={styles.h2}>Accounts</h2>
          <Row icon={<A.UserAvatar size={20} />} title={os.profile.displayName} sub={os.profile.accountEmail} right={<span className={styles.value}>Administrator</span>} />
          <div className={styles.group}>Sign-in options</div>
          <Row title="Password" sub="This account signs in automatically. Locking the screen does not ask for one." right={<span className={styles.value}>Not required</span>} />
          <Row title="Windows Hello" sub="This device does not have a camera or fingerprint reader." right={<span className={styles.value}>Unavailable</span>} />
          <div className={styles.note}>This account has no password, so there is nothing to change.</div>
        </>
      );
      case "time": return (
        <>
          <h2 className={styles.h2}>Time &amp; language</h2>
          <Row title="Time zone" sub={os.profile.timezone.replace("_", " ")} right={<span className={styles.value}>(UTC−04:00)</span>} />
          <Row title="Set time automatically" sub="The clock follows this computer's time." right={<span className={styles.value}>On</span>} />
          <Row title="Language" sub={os.profile.locale === "en-CA" ? "English (Canada)" : os.profile.locale} right={<span className={styles.value}>Default</span>} />
          <Row title="Keyboard layout" sub="Canadian Multilingual Standard" />
        </>
      );
      case "accessibility": return (
        <>
          <h2 className={styles.h2}>Accessibility</h2>
          <Row title="Text size" right={<input className={styles.slider} type="range" min={100} max={140} defaultValue={100} onChange={(e) => document.documentElement.style.setProperty("--ui-scale", String(Number(e.target.value) / 100))} />} />
          <Row title="Visual effects — transparency" right={<Toggle on onChange={(v) => document.documentElement.style.setProperty("--shell-blur", v ? "60px" : "0px")} />} />
          <Row title="Colour filters" sub="Night light is on the quick settings panel" right={<Toggle on={s.nightLight} onChange={(v) => sys.set({ nightLight: v })} />} />
        </>
      );
      case "privacy": return (
        <>
          <h2 className={styles.h2}>Privacy &amp; security</h2>
          <Row icon={<F.LockClosed size={20} />} title="Windows Security" sub="No action needed" right={<span className={styles.value}>Protected</span>} />
          <Row title="Find my device" sub="Off" />
          <Row title="Device encryption" sub="BitLocker is not enabled on this device" right={<span className={styles.value}>Off</span>} />
          <div className={styles.group}>App permissions</div>
          <Row title="Location" sub="No location services are available on this device." right={<Toggle on={false} onChange={() => {}} disabled />} />
          <Row title="Camera" sub="No camera is attached to this device." right={<Toggle on={false} onChange={() => {}} disabled />} />
          <Row title="Microphone" sub="No microphone is attached to this device." right={<Toggle on={false} onChange={() => {}} disabled />} />
        </>
      );
      case "update": return (
        <>
          <h2 className={styles.h2}>Windows Update</h2>
          <div className={styles.card}>
            <span className={styles.cardIcon}><F.SyncIcon size={20} /></span>
            <span className={styles.cardText}><span className={styles.cardTitle}>{sys.online ? "You're up to date" : "Updates are unavailable while offline"}</span><span className={styles.cardSub}>Last checked: today</span></span>
            <span style={{ flex: 1 }} />
            <button className={styles.btnAccent} onClick={() => setNote(sys.online ? "Checking for updates… You're up to date." : "Can't check for updates. Connect to a network and try again.")}>Check for updates</button>
          </div>
          <Row title="Pause updates" right={<span className={styles.value}>Pause for 1 week</span>} />
          <Row title="Update history" sub="2026-08-19 — 2026-08 Cumulative Update for Windows 11 (KB5041585)" />
        </>
      );
    }
  };

  return (
    <Window win={win} className={styles.win}>
      <div className={`${styles.frame} ${active ? "" : styles.inactive}`}>
        <div className={styles.titleBar} data-drag>
          <span className={styles.titleIcon}><A.SettingsIcon size={16} /></span>
          <span className={styles.titleText}>Settings</span>
          <CaptionButtons win={win} />
        </div>
        <div className={styles.body}>
          <div className={styles.nav}>
            <div className={styles.account}>
              <span className={styles.accountAvatar}><A.UserAvatar size={32} /></span>
              <span className={styles.accountText}><b>{os.profile.displayName}</b><small>{os.profile.accountEmail}</small></span>
            </div>
            <div className={styles.navSearch}><F.Search size={14} /><input placeholder="Find a setting" onChange={(e) => { const q = e.target.value.toLowerCase(); const hit = PAGES.find((p) => p.label.toLowerCase().includes(q)); if (q.length > 2 && hit) setPage(hit.id); }} /></div>
            {PAGES.map((p) => (
              <button key={p.id} className={`${styles.navItem} ${page === p.id ? styles.navActive : ""}`} onClick={() => setPage(p.id)}>
                <span className={styles.navIcon}>{p.icon}</span><span>{p.label}</span>
              </button>
            ))}
          </div>
          <div className={styles.content}>
            {note && <div className={styles.toast} onClick={() => setNote(null)}>{note}</div>}
            {body()}
          </div>
        </div>
      </div>
    </Window>
  );
}
