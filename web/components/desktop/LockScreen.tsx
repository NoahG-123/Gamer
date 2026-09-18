"use client";
import React, { useEffect, useState } from "react";
import styles from "./LockScreen.module.css";
import { useAssets } from "@/lib/client/assets";
import { Profile } from "@/lib/client/api";
import * as F from "@/components/icons/fluent";

/**
 * The Windows lock screen. Locking is real — the desktop is covered until you sign back
 * in. This account signs in without a password (Settings shows the same thing), so
 * getting back is a click or a key, exactly as it would be on a machine set up that way.
 */
export function LockScreen({ profile, wallpaper, onUnlock }: { profile: Profile; wallpaper: string | null; onUnlock: () => void }) {
  const assets = useAssets();
  const avatar = assets["people.owner"]?.url ?? null;
  const [now, setNow] = useState<Date | null>(null);
  const [raised, setRaised] = useState(false);

  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const raise = () => setRaised(true);
    window.addEventListener("keydown", raise);
    window.addEventListener("wheel", raise);
    return () => { window.removeEventListener("keydown", raise); window.removeEventListener("wheel", raise); };
  }, []);

  return (
    <div className={styles.lock} style={{ backgroundImage: wallpaper ? `url(${wallpaper})` : undefined }} onClick={() => setRaised(true)}>
      <div className={`${styles.curtain} ${raised ? styles.raised : ""}`}>
        <div className={styles.clock} suppressHydrationWarning>{now ? now.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false }) : ""}</div>
        <div className={styles.date} suppressHydrationWarning>{now ? now.toLocaleDateString("en-CA", { weekday: "long", day: "numeric", month: "long" }) : ""}</div>
        <div className={styles.hint}>Click or press a key to sign in</div>
      </div>
      <div className={`${styles.signIn} ${raised ? styles.signInShown : ""}`}>
        <div className={styles.avatar}>{avatar ? <img src={avatar} alt="" /> : <F.Accounts size={44} />}</div>
        <div className={styles.name}>{profile.displayName}</div>
        <button className={styles.button} autoFocus onClick={onUnlock}>Sign in</button>
        <div className={styles.note}>This account signs in automatically.</div>
      </div>
      <div className={styles.corner}>
        <F.Wifi size={18} />
        <F.Battery size={18} />
        <F.Power size={18} />
      </div>
    </div>
  );
}
