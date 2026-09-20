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
const RESOLUTIONS = ["1920 x 1080", "1680 x 1050", "1600 x 900", "1440 x 900", "1366 x 768", "1280 x 720"];
const SCALINGS = [100, 125, 150];
const PICTURE_EXT = /^(jpg|jpeg|png|bmp|webp|heic|gif)$/;

/**
 * Windows 11 Settings.
 *
 * Every control on every page is one of three things and nothing else: it works, or it
 * says in one flat sentence why this computer cannot do it, or it is not offered at all.
 * The hardware this machine does not have (Bluetooth radio, camera, microphone, printer,
 * second display) always answers the same way however many times it is asked.
 */
export function Settings({ win }: { win: WinState }) {
  const wm = useWM();
  const os = useOS();
  const sys = useSystem();
  const assets = useAssets();
  const s = sys.settings;
  const net = sys.network;
  const [page, setPage] = useState<PageId>((win.props.page as PageId) || "system");
  const [pictures, setPictures] = useState<VfsNode[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [checking, setChecking] = useState(false);
  const active = wm.activeId === win.id;

  const say = (text: string) => { setNote(text); window.setTimeout(() => setNote((n) => (n === text ? null : n)), 6000); };

  useEffect(() => { if (win.props.page) setPage(win.props.page as PageId); }, [win.props.page]);
  useEffect(() => {
    if (page !== "personalisation") return;
    // Everything on this machine that is a picture, Downloads included, so anything the
    // player has saved out of the browser can be used as the background.
    api.search(os.home, ".").then((d) => setPictures(d.results.filter((n) => !n.dir && PICTURE_EXT.test(n.ext)).slice(0, 120))).catch(() => {});
  }, [page, os.home, os.refreshTick]);

  /** Wallpaper presets shipped in the asset manifest, newest-looking first. */
  const presets = useMemo(
    () => Object.values(assets).filter((a) => a.wallpaper && a.url).map((a) => ({ key: a.key, title: a.title ?? a.key, url: a.url! })),
    [assets],
  );

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
  const Pick = <T extends string | number,>({ value, options, onChange, format }: { value: T; options: readonly T[]; onChange: (v: T) => void; format?: (v: T) => string }) => (
    <select className={styles.select} value={String(value)} onChange={(e) => onChange((typeof value === "number" ? Number(e.target.value) : e.target.value) as T)}>
      {options.map((o) => <option key={String(o)} value={String(o)}>{format ? format(o) : String(o)}</option>)}
    </select>
  );

  const joined = s.wifi && !s.airplane;

  const body = () => {
    switch (page) {
      case "system": return (
        <>
          <h2 className={styles.h2}>System</h2>
          <div className={styles.group}>Display</div>
          <div className={styles.card}>
            <span className={styles.cardIcon}><F.Brightness size={20} /></span>
            <span className={styles.cardText}><span className={styles.cardTitle}>Brightness</span><span className={styles.cardSub}>Adjust the brightness of the built-in display</span></span>
            <span style={{ flex: 1 }} />
            <span className={styles.value}>{s.brightness}%</span>
            <input className={styles.slider} type="range" min={30} max={100} value={s.brightness} onChange={(e) => sys.set({ brightness: Number(e.target.value) })} />
          </div>
          <Row title="Display resolution" sub="Changing this changes how much fits on the screen" right={<Pick value={s.resolution} options={RESOLUTIONS} onChange={(v) => sys.set({ resolution: v })} />} />
          <Row title="Scale" sub="Make text and apps bigger or smaller" right={<Pick value={s.scaling} options={SCALINGS} onChange={(v) => sys.set({ scaling: v, textScale: v })} format={(v) => `${v}%${v === 100 ? " (Recommended)" : ""}`} />} />
          <Row title="Night light" sub="Warm the colours on the screen after dark" right={<Toggle on={s.nightLight} onChange={(v) => sys.set({ nightLight: v })} />} />
          <Row title="Multiple displays" sub="No second display is connected to this computer." right={<span className={styles.value}>1 display detected</span>} />
          <div className={styles.group}>Sound</div>
          <div className={styles.card}>
            <span className={styles.cardIcon}>{s.muted ? <F.SpeakerOff size={20} /> : <F.Speaker size={20} />}</span>
            <span className={styles.cardText}><span className={styles.cardTitle}>Volume</span><span className={styles.cardSub}>Realtek(R) Audio — Speakers</span></span>
            <span style={{ flex: 1 }} />
            <button className={styles.linkBtn} onClick={() => sys.set({ muted: !s.muted })}>{s.muted ? "Unmute" : "Mute"}</button>
            <input className={styles.slider} type="range" min={0} max={100} value={s.muted ? 0 : s.volume} onChange={(e) => { const v = Number(e.target.value); sys.set({ volume: v, muted: v === 0 }); }} onMouseUp={() => sys.play("click")} />
          </div>
          <Row title="Output device" sub="Speakers (Realtek(R) Audio)" right={<button className={styles.btn} onClick={() => { sys.play("device-connect"); say("Speakers (Realtek(R) Audio) is the only output device on this computer."); }}>Test</button>} />
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
            <span className={styles.cardIcon}>{joined ? <F.Wifi size={20} /> : <F.WifiOff size={20} />}</span>
            <span className={styles.cardText}>
              <span className={styles.cardTitle}>Wi-Fi</span>
              <span className={styles.cardSub}>{joined ? `Connected to ${s.ssid}, secured` : s.airplane ? "Unavailable — airplane mode is on" : "Not connected"}</span>
            </span>
            <span style={{ flex: 1 }} />
            <Toggle on={joined} onChange={(v) => { sys.set(v ? { wifi: true, airplane: false } : { wifi: false }); sys.play("click"); }} />
          </div>
          <div className={styles.card}>
            <span className={styles.cardIcon}><F.Airplane size={20} /></span>
            <span className={styles.cardText}><span className={styles.cardTitle}>Airplane mode</span><span className={styles.cardSub}>Stop all wireless communication</span></span>
            <span style={{ flex: 1 }} />
            <Toggle on={s.airplane} onChange={(v) => { sys.set({ airplane: v }); sys.play("click"); }} />
          </div>
          <Row icon={<F.PlugConnected size={20} />} title="Ethernet" sub="No network cable is plugged in." right={<span className={styles.value}>Not connected</span>} />

          <div className={styles.group}>Available networks</div>
          {!joined && <div className={styles.note}>{s.airplane ? "Turn airplane mode off to see networks." : "Wi-Fi is off. Turn it on to see networks."}</div>}
          {joined && (
            <>
              {net.known.map((k) => (
                <div key={k.ssid} className={styles.card}>
                  <span className={styles.cardIcon}><F.Wifi size={20} /></span>
                  <span className={styles.cardText}>
                    <span className={styles.cardTitle}>{k.ssid}</span>
                    <span className={styles.cardSub}>{s.ssid === k.ssid ? `Connected, ${k.security.toLowerCase()}` : `Saved${k.auto ? ", connects automatically" : ""}`}</span>
                  </span>
                  <span style={{ flex: 1 }} />
                  {s.ssid === k.ssid
                    ? <button className={styles.btn} onClick={() => { sys.set({ wifi: false }); sys.play("click"); say(`Disconnected from ${k.ssid}.`); }}>Disconnect</button>
                    : <button className={styles.btn} onClick={() => { sys.set({ ssid: k.ssid, wifi: true, airplane: false }); sys.play("device-connect"); say(`Connected to ${k.ssid}.`); }}>Connect</button>}
                </div>
              ))}
              {net.nearby.map((n) => (
                <div key={n.ssid} className={styles.card}>
                  <span className={styles.cardIcon} style={{ opacity: 0.4 + n.bars * 0.2 }}><F.Wifi size={20} /></span>
                  <span className={styles.cardText}><span className={styles.cardTitle}>{n.ssid}</span><span className={styles.cardSub}>{n.secure ? "Secured" : "Open"}</span></span>
                  <span style={{ flex: 1 }} />
                  <button className={styles.btn} onClick={() => say(n.secure ? `${n.ssid} needs a network security key, and this computer does not have one saved.` : `Could not connect to ${n.ssid}.`)}>Connect</button>
                </div>
              ))}
              <div className={styles.rowBtns}>
                <button className={styles.btn} disabled={scanning} onClick={() => { setScanning(true); window.setTimeout(() => { setScanning(false); say("Network list refreshed."); }, 1200); }}>{scanning ? "Scanning…" : "Refresh"}</button>
              </div>
            </>
          )}

          <div className={styles.group}>Properties</div>
          <div className={styles.about}>
            <div><b>SSID</b><span>{joined ? s.ssid : "—"}</span></div>
            <div><b>Security type</b><span>{joined ? net.security : "—"}</span></div>
            <div><b>Band</b><span>{joined ? net.band : "—"}</span></div>
            <div><b>Protocol</b><span>{net.protocol}</span></div>
            <div><b>Router</b><span>{net.router}</span></div>
            <div><b>IPv4 address</b><span>{joined ? net.ipv4 : "—"}</span></div>
            <div><b>Default gateway</b><span>{joined ? net.gateway : "—"}</span></div>
            <div><b>DNS servers</b><span>{joined ? net.dns : "—"}</span></div>
            <div><b>Physical address (MAC)</b><span>{net.mac}</span></div>
          </div>
        </>
      );
      case "personalisation": return (
        <>
          <h2 className={styles.h2}>Personalisation</h2>
          <div className={styles.preview} style={{ backgroundImage: wallpaperUrl(s.wallpaper) ? `url(${wallpaperUrl(s.wallpaper)})` : undefined, backgroundSize: s.wallpaperFit === "fit" ? "contain" : s.wallpaperFit === "stretch" ? "100% 100%" : "cover" }}>
            <div className={styles.previewBar} style={{ background: s.accent }} />
          </div>
          <div className={styles.group}>Background</div>
          <div className={styles.thumbs}>
            {presets.map((p) => (
              <button key={p.key} className={`${styles.thumb} ${s.wallpaper === p.key ? styles.thumbOn : ""}`} title={p.title} onClick={() => { sys.set({ wallpaper: p.key }); sys.play("click"); }}>
                <img src={p.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <div className={styles.group}>Your pictures</div>
          {pictures.length === 0 && <div className={styles.note}>No pictures found on this computer yet. Anything saved out of the browser turns up here.</div>}
          <div className={styles.thumbs}>
            {(browsing ? pictures : pictures.slice(0, 11)).map((p) => (
              <button key={p.path} className={`${styles.thumb} ${s.wallpaper === p.path ? styles.thumbOn : ""}`} title={p.path.replace(/\//g, "\\")} onClick={() => { sys.set({ wallpaper: p.path }); sys.play("click"); }}>
                <img src={`/lf/${encodeURIComponent(p.path).replace(/%2F/g, "/")}`} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <div className={styles.rowBtns}>
            {pictures.length > 11 && <button className={styles.btn} onClick={() => setBrowsing((b) => !b)}>{browsing ? "Show fewer" : `Browse photos (${pictures.length})`}</button>}
            <button className={styles.btn} onClick={() => os.launch("explorer", { path: `${os.home}/Pictures` })}>Open Pictures</button>
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
          <Row title="Transparency effects" sub="Make windows and surfaces translucent" right={<Toggle on={s.transparency} onChange={(v) => sys.set({ transparency: v })} />} />
          <Row title="Animation effects" sub="Fade and slide when things open and close" right={<Toggle on={s.animations} onChange={(v) => sys.set({ animations: v })} />} />
          <div className={styles.group}>Accent colour</div>
          <div className={styles.swatches}>
            {ACCENTS.map((c) => <button key={c} className={`${styles.swatch} ${s.accent.toLowerCase() === c.toLowerCase() ? styles.swatchOn : ""}`} style={{ background: c }} onClick={() => { sys.set({ accent: c }); sys.play("click"); }} aria-label={c} />)}
          </div>
          <div className={styles.group}>Lock screen</div>
          <Row
            title="Lock screen status"
            sub="What shows under the clock on the lock screen"
            right={<Pick
              value={s.lockScreenStatus}
              options={["weather", "calendar", "mail", "none"] as const}
              onChange={(v) => sys.set({ lockScreenStatus: v })}
              format={(v) => ({ weather: "Weather", calendar: "Calendar", mail: "Mail", none: "None" })[v]}
            />}
          />
          <Row title="Show tips on the lock screen" right={<Toggle on={s.lockScreenTips} onChange={(v) => sys.set({ lockScreenTips: v })} />} />
          <div className={styles.rowBtns}>
            <button className={styles.btn} onClick={() => os.lock?.()}>Lock the screen now</button>
          </div>
        </>
      );
      case "apps": return (
        <>
          <h2 className={styles.h2}>Apps</h2>
          <div className={styles.group}>Installed apps</div>
          {([
            ["Google Chrome", "138.0.7204.101", "412 MB", "chrome"],
            ["WhatsApp", "2.2440.8", "284 MB", "whatsapp"],
            ["Windows Terminal", "1.20.11781.0", "48.2 MB", "terminal"],
            ["Notepad", "11.2402.22.0", "12.1 MB", "notepad"],
            ["Paint", "11.2308.18.0", "14.9 MB", "paint"],
            ["Photos", "2024.11080.19005.0", "96.4 MB", "photos"],
            ["Calculator", "11.2405.2.0", "8.71 MB", "calculator"],
            ["REAPER (x64)", "7.16", "63.4 MB", "audio"],
            ["7-Zip 23.01", "23.01", "5.12 MB", ""],
            ["Microsoft Edge", "129.0.2792.52", "512 MB", ""],
            ["Python 3.11.7 (64-bit)", "3.11.7", "112 MB", ""],
            ["Git", "2.45.1", "318 MB", ""],
          ] as [string, string, string, string][]).map(([n, v, sz, app]) => (
            <Row
              key={n}
              icon={<A.GenericAppIcon size={20} />}
              title={n}
              sub={`${sz} — installed`}
              right={
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className={styles.value}>{v}</span>
                  {app
                    ? <button className={styles.btn} onClick={() => os.launch(app as Parameters<typeof os.launch>[0])}>Open</button>
                    : <button className={styles.btn} onClick={() => say(`${n} is installed, but it does not run from here.`)}>Open</button>}
                </span>
              }
            />
          ))}
          <div className={styles.note}>Uninstalling is not available on this computer.</div>
        </>
      );
      case "accounts": return (
        <>
          <h2 className={styles.h2}>Accounts</h2>
          <Row icon={<A.UserAvatar size={20} />} title={os.profile.displayName} sub={os.profile.accountEmail} right={<span className={styles.value}>Administrator</span>} />
          <div className={styles.group}>Sign-in options</div>
          <Row title="Password" sub="This account signs in automatically. Locking the screen does not ask for one." right={<span className={styles.value}>Not required</span>} />
          <Row title="Windows Hello" sub="This device does not have a camera or fingerprint reader." right={<span className={styles.value}>Unavailable</span>} />
          <div className={styles.group}>Other people</div>
          <div className={styles.note}>This account has no password, so there is nothing to change, and no other accounts are set up on this computer.</div>
          <div className={styles.rowBtns}>
            <button className={styles.btn} onClick={() => os.lock?.()}>Sign out</button>
          </div>
        </>
      );
      case "time": return (
        <>
          <h2 className={styles.h2}>Time &amp; language</h2>
          <Row title="Set time automatically" sub="This computer has no manual clock to fall back to, so it always follows its own time." right={<Toggle on onChange={() => {}} disabled />} />
          <Row title="Time zone" sub={os.profile.timezone.replace("_", " ")} right={<span className={styles.value}>(UTC−04:00)</span>} />
          <Row title="24-hour clock" sub={new Date().toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: !s.time24 })} right={<Toggle on={s.time24} onChange={(v) => sys.set({ time24: v })} />} />
          <div className={styles.group}>Language &amp; region</div>
          <Row title="Language" sub={os.profile.locale === "en-CA" ? "English (Canada)" : os.profile.locale} right={<span className={styles.value}>Windows display language</span>} />
          <Row title="Keyboard layout" sub="Canadian Multilingual Standard" right={<span className={styles.value}>Default</span>} />
          <div className={styles.note}>No other language packs are installed on this computer.</div>
        </>
      );
      case "accessibility": return (
        <>
          <h2 className={styles.h2}>Accessibility</h2>
          <div className={styles.group}>Vision</div>
          <div className={styles.card}>
            <span className={styles.cardIcon}><F.Accessibility size={20} /></span>
            <span className={styles.cardText}><span className={styles.cardTitle}>Text size</span><span className={styles.cardSub}>Make text bigger everywhere</span></span>
            <span style={{ flex: 1 }} />
            <span className={styles.value}>{s.textScale}%</span>
            <input className={styles.slider} type="range" min={100} max={150} step={5} value={s.textScale} onChange={(e) => sys.set({ textScale: Number(e.target.value) })} />
          </div>
          <Row title="Visual effects — transparency" sub="Make windows and surfaces translucent" right={<Toggle on={s.transparency} onChange={(v) => sys.set({ transparency: v })} />} />
          <Row title="Visual effects — animation" sub="Fade and slide when things open and close" right={<Toggle on={s.animations} onChange={(v) => sys.set({ animations: v })} />} />
          <Row title="Colour filters — night light" sub="Warm the colours on the screen" right={<Toggle on={s.nightLight} onChange={(v) => sys.set({ nightLight: v })} />} />
          <div className={styles.group}>Hearing</div>
          <Row title="Mono audio" sub="This computer's speakers are already a single channel." right={<Toggle on onChange={() => {}} disabled />} />
          <div className={styles.group}>Speech</div>
          <div className={styles.note}>Speech recognition needs a microphone. No microphone is attached to this device.</div>
        </>
      );
      case "privacy": return (
        <>
          <h2 className={styles.h2}>Privacy &amp; security</h2>
          <Row icon={<F.LockClosed size={20} />} title="Windows Security" sub="No action needed" right={<span className={styles.value}>Protected</span>} />
          <Row title="Find my device" sub="Needs a Microsoft account signed in on this computer." right={<Toggle on={false} onChange={() => {}} disabled />} />
          <Row title="Device encryption" sub="BitLocker is not enabled on this device" right={<span className={styles.value}>Off</span>} />
          <div className={styles.group}>App permissions</div>
          <Row title="Location" sub="No location services are available on this device." right={<Toggle on={false} onChange={() => {}} disabled />} />
          <Row title="Camera" sub="No camera is attached to this device." right={<Toggle on={false} onChange={() => {}} disabled />} />
          <Row title="Microphone" sub="No microphone is attached to this device." right={<Toggle on={false} onChange={() => {}} disabled />} />
          <div className={styles.group}>Browsing data</div>
          <Row
            title="Clear browsing history"
            sub="Everything Chrome has recorded on this computer"
            right={<button className={styles.btn} onClick={async () => { const r = await fetch("/api/browser/history", { method: "DELETE" }); const d = await r.json().catch(() => ({})); say(r.ok ? "Browsing history cleared." : (d.error || "Browsing history could not be cleared.")); }}>Clear</button>}
          />
        </>
      );
      case "update": return (
        <>
          <h2 className={styles.h2}>Windows Update</h2>
          <div className={styles.card}>
            <span className={styles.cardIcon}><F.SyncIcon size={20} /></span>
            <span className={styles.cardText}>
              <span className={styles.cardTitle}>{checking ? "Checking for updates…" : sys.online ? "You're up to date" : "Updates are unavailable while offline"}</span>
              <span className={styles.cardSub}>Last checked: today</span>
            </span>
            <span style={{ flex: 1 }} />
            <button
              className={styles.btnAccent}
              disabled={checking}
              onClick={() => {
                if (!sys.online) { say("Can't check for updates. Connect to a network and try again."); return; }
                setChecking(true);
                window.setTimeout(() => { setChecking(false); say("You're up to date."); }, 1800);
              }}
            >Check for updates</button>
          </div>
          <Row title="Pause updates" sub="Updates will resume on their own afterwards" right={<button className={styles.btn} onClick={() => say("Updates paused for 1 week.")}>Pause for 1 week</button>} />
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
