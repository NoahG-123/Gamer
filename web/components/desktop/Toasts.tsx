"use client";
import React, { useEffect, useState } from "react";
import styles from "./Toasts.module.css";
import { WhatsAppIcon, GmailIcon, ChromeIcon, TerminalAppIcon, ExplorerAppIcon } from "@/components/icons/apps";
import { Close } from "@/components/icons/fluent";

export interface Toast { id: number; app: string; title: string; text: string; props: Record<string, unknown>; at: number }

const APP_NAME: Record<string, string> = { whatsapp: "WhatsApp", mail: "Google Chrome", chrome: "Google Chrome", terminal: "Terminal", explorer: "File Explorer" };
function icon(app: string) {
  if (app === "whatsapp") return <WhatsAppIcon size={20} />;
  if (app === "mail") return <GmailIcon size={20} />;
  if (app === "terminal") return <TerminalAppIcon size={20} />;
  if (app === "explorer") return <ExplorerAppIcon size={20} />;
  return <ChromeIcon size={20} />;
}

/** Windows 11 notification toasts (bottom-right). */
export function Toasts({ toasts, onDismiss, onOpen }: { toasts: Toast[]; onDismiss: (id: number) => void; onOpen: (t: Toast) => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((t) => t + 1), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const now = Date.now();
    for (const t of toasts) if (now - t.at > 9000) onDismiss(t.id);
  });
  return (
    <div className={styles.wrap}>
      {toasts.slice(-3).map((t) => (
        <div key={t.id} className={styles.toast} onClick={() => { onOpen(t); onDismiss(t.id); }}>
          <div className={styles.head}>
            <span className={styles.appIcon}>{icon(t.app)}</span>
            <span className={styles.appName}>{APP_NAME[t.app] ?? t.app}</span>
            <span className={styles.spacer} />
            <button className={styles.close} onClick={(e) => { e.stopPropagation(); onDismiss(t.id); }} aria-label="Dismiss"><Close size={12} /></button>
          </div>
          <div className={styles.body}>
            <div className={styles.title}>{t.title}</div>
            <div className={styles.text}>{t.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
