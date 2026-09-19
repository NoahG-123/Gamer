"use client";
import React, { useEffect, useRef, useState } from "react";
import styles from "./LockScreen.module.css";
import { useAssets } from "@/lib/client/assets";
import { Profile } from "@/lib/client/api";
import { useSystem } from "@/lib/client/system";
import { Ico } from "@/lib/icons/Ico";
import * as F from "@/components/icons/fluent";
import { GmailIcon } from "@/components/icons/apps";

interface Status { icon: React.ReactNode; text: string }

/**
 * The Windows lock screen. Locking is real — the desktop is covered until you sign back
 * in. This account signs in without a password (Settings shows the same thing), so
 * getting back is a click or a key, exactly as it would be on a machine set up that way.
 *
 * The status line under the clock and the three icons in the corner are live: the status
 * follows the Lock screen status setting and reads the real weather, calendar or mail;
 * the Wi-Fi corner icon turns this computer's Wi-Fi on and off; the battery and power
 * icons open their own small flyouts, the way they do on the real lock screen.
 */
export function LockScreen({ profile, wallpaper, onUnlock }: { profile: Profile; wallpaper: string | null; onUnlock: () => void }) {
  const assets = useAssets();
  const sys = useSystem();
  const avatar = assets["people.owner"]?.url ?? null;
  const [now, setNow] = useState<Date | null>(null);
  const [raised, setRaised] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [flyout, setFlyout] = useState<"net" | "battery" | "power" | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const raise = () => setRaised(true);
    window.addEventListener("keydown", raise);
    window.addEventListener("wheel", raise);
    return () => { window.removeEventListener("keydown", raise); window.removeEventListener("wheel", raise); };
  }, []);

  // What the Lock screen status setting asks for, read from the machine itself.
  const kind = sys.settings.lockScreenStatus;
  useEffect(() => {
    let live = true;
    if (kind === "none") { setStatus(null); return; }
    if (kind === "weather") {
      const w = profile.weather ?? { temp: 17, text: "Fog", icon: "fog" };
      setStatus({ icon: <Ico name={`fluent-emoji-flat:${w.icon ?? "sun-behind-cloud"}`} size={20} />, text: `${w.temp}°${profile.tempUnit ?? "C"} ${w.text}` });
      return;
    }
    if (kind === "calendar") {
      const from = new Date(); const to = new Date(Date.now() + 7 * 86400000);
      fetch(`/api/calendar?from=${from.toISOString()}&to=${to.toISOString()}&record=0`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { events?: { title: string; start: string; allDay?: boolean }[] }) => {
          if (!live) return;
          const next = (d.events ?? []).find((e) => new Date(e.start).getTime() >= Date.now()) ?? (d.events ?? [])[0];
          setStatus({
            icon: <F.ClockIcon size={18} />,
            text: next
              ? `${next.title} · ${next.allDay ? new Date(next.start).toLocaleDateString("en-CA", { weekday: "short", day: "numeric", month: "short" }) : new Date(next.start).toLocaleString("en-CA", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })}`
              : "Nothing else this week",
          });
        })
        .catch(() => { if (live) setStatus({ icon: <F.ClockIcon size={18} />, text: "Calendar unavailable" }); });
      return () => { live = false; };
    }
    fetch("/api/mail?record=0", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { threads?: { unread?: boolean; trashed?: boolean; labels?: string[] }[] }) => {
        if (!live) return;
        const n = (d.threads ?? []).filter((t) => t.unread && !t.trashed && (t.labels ?? []).includes("inbox")).length;
        setStatus({ icon: <GmailIcon size={18} />, text: n ? `${n} unread message${n === 1 ? "" : "s"}` : "No new mail" });
      })
      .catch(() => { if (live) setStatus({ icon: <GmailIcon size={18} />, text: "Mail unavailable" }); });
    return () => { live = false; };
  }, [kind, profile.weather, profile.tempUnit]);

  useEffect(() => {
    if (!flyout) return;
    const onDown = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.("[data-lock-corner]")) setFlyout(null); };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [flyout]);

  const online = sys.online;
  const time = now ? now.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: !sys.settings.time24 }) : "";

  return (
    <div ref={root} className={styles.lock} style={{ backgroundImage: wallpaper ? `url(${wallpaper})` : undefined }} onClick={(e) => { if (!(e.target as HTMLElement).closest("[data-lock-corner]")) setRaised(true); }}>
      <div className={`${styles.curtain} ${raised ? styles.raised : ""}`}>
        <div className={styles.clock} suppressHydrationWarning>{time}</div>
        <div className={styles.date} suppressHydrationWarning>{now ? now.toLocaleDateString("en-CA", { weekday: "long", day: "numeric", month: "long" }) : ""}</div>
        {status && <div className={styles.status}>{status.icon}<span>{status.text}</span></div>}
        {sys.settings.lockScreenTips && <div className={styles.hint}>Click or press a key to sign in</div>}
      </div>
      <div className={`${styles.signIn} ${raised ? styles.signInShown : ""}`}>
        <div className={styles.avatar}>{avatar ? <img src={avatar} alt="" /> : <F.Accounts size={44} />}</div>
        <div className={styles.name}>{profile.displayName}</div>
        <button className={styles.button} autoFocus onClick={onUnlock}>Sign in</button>
        <div className={styles.note}>This account signs in automatically.</div>
      </div>

      <div className={styles.corner} data-lock-corner>
        <button
          className={styles.cornerBtn}
          title={online ? `Connected to ${sys.settings.ssid}` : sys.settings.airplane ? "Airplane mode is on" : "Wi-Fi is off"}
          onClick={(e) => { e.stopPropagation(); setFlyout((f) => (f === "net" ? null : "net")); }}
        >{online ? <F.Wifi size={18} /> : <F.WifiOff size={18} />}</button>
        <button className={styles.cornerBtn} title="Battery" onClick={(e) => { e.stopPropagation(); setFlyout((f) => (f === "battery" ? null : "battery")); }}><F.Battery size={18} /></button>
        <button className={styles.cornerBtn} title="Power" onClick={(e) => { e.stopPropagation(); setFlyout((f) => (f === "power" ? null : "power")); }}><F.Power size={18} /></button>

        {flyout === "net" && (
          <div className={styles.flyout} onClick={(e) => e.stopPropagation()}>
            <div className={styles.flyHead}>{online ? sys.settings.ssid : "Not connected"}</div>
            <div className={styles.flySub}>{online ? "Connected, secured" : sys.settings.airplane ? "Airplane mode is on" : "Wi-Fi is off"}</div>
            <button className={styles.flyBtn} onClick={() => { sys.set(online ? { wifi: false } : { wifi: true, airplane: false }); sys.play("click"); }}>
              {online ? "Turn Wi-Fi off" : "Turn Wi-Fi on"}
            </button>
            <button className={styles.flyBtn} onClick={() => { sys.set({ airplane: !sys.settings.airplane }); sys.play("click"); }}>
              {sys.settings.airplane ? "Turn airplane mode off" : "Turn airplane mode on"}
            </button>
          </div>
        )}
        {flyout === "battery" && (
          <div className={styles.flyout} onClick={(e) => e.stopPropagation()}>
            <div className={styles.flyHead}>71% remaining</div>
            <div className={styles.flySub}>About 3 hr 20 min left · not plugged in</div>
            <div className={styles.flySub}>Battery saver turns on automatically at 20%.</div>
          </div>
        )}
        {flyout === "power" && (
          <div className={styles.flyout} onClick={(e) => e.stopPropagation()}>
            <button className={styles.flyBtn} onClick={() => { setFlyout(null); onUnlock(); }}>Sign in</button>
            <button className={styles.flyBtn} onClick={() => { setFlyout(null); setRaised(false); }}>Sleep</button>
            <div className={styles.flySub}>Shutting this computer down is not available from the lock screen.</div>
          </div>
        )}
      </div>
    </div>
  );
}
