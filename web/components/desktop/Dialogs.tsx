"use client";
import React, { useState } from "react";
import styles from "./Dialogs.module.css";
import { WinState, useWM } from "./wm";
import { Window, CaptionButtons } from "./Window";
import * as A from "@/components/icons/apps";
import { typeLabel } from "@/components/icons/apps";
import { ChevronDown } from "@/components/icons/fluent";

/**
 * Realistic Windows responses for files that cannot be opened:
 *  - "open-with": Windows 11 "Select an app to open this .xyz file" flyout
 *  - "cant-run": "This app can't run on your PC"
 *  - "shortcut": "Problem with Shortcut"
 *  - "bad-zip": "Compressed (zipped) Folders Error"
 */
export type DialogKind = "open-with" | "cant-run" | "shortcut" | "bad-zip";

export function dialogForFile(name: string, ext: string): { kind: DialogKind; w: number; h: number } {
  if (ext === "exe" || ext === "msi" || ext === "com" || ext === "bat" || ext === "jar") return { kind: "cant-run", w: 428, h: 178 };
  if (ext === "lnk" || ext === "url") return { kind: "shortcut", w: 440, h: 190 };
  if (ext === "zip" || ext === "rar" || ext === "7z") return { kind: "bad-zip", w: 440, h: 170 };
  return { kind: "open-with", w: 460, h: 530 };
}

const APPS_FOR: Record<string, { label: string; icon: React.ReactNode }[]> = {
  image: [{ label: "Paint", icon: <A.PaintIcon size={28} /> }, { label: "Snipping Tool", icon: <A.SnipIcon size={28} /> }, { label: "Google Chrome", icon: <A.ChromeIcon size={28} /> }, { label: "Microsoft Edge", icon: <A.EdgeIcon size={28} /> }],
  doc: [{ label: "Google Chrome", icon: <A.ChromeIcon size={28} /> }, { label: "Microsoft Edge", icon: <A.EdgeIcon size={28} /> }, { label: "Notepad", icon: <A.NotepadIcon size={28} /> }, { label: "Notepad++ : a free (GNU) source code editor", icon: <A.NotepadPlusIcon size={28} /> }],
  media: [{ label: "VLC media player", icon: <A.VlcIcon size={28} /> }, { label: "Google Chrome", icon: <A.ChromeIcon size={28} /> }, { label: "Microsoft Edge", icon: <A.EdgeIcon size={28} /> }],
  other: [{ label: "Notepad", icon: <A.NotepadIcon size={28} /> }, { label: "Notepad++ : a free (GNU) source code editor", icon: <A.NotepadPlusIcon size={28} /> }, { label: "Google Chrome", icon: <A.ChromeIcon size={28} /> }],
};
function appsFor(ext: string) {
  if (["jpg", "jpeg", "png", "gif", "bmp", "webp", "heic", "tif", "svg"].includes(ext)) return APPS_FOR.image;
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf", "odt", "rtf", "csv"].includes(ext)) return APPS_FOR.doc;
  if (["mp3", "mp4", "mkv", "mov", "m4a", "wav", "avi", "webm"].includes(ext)) return APPS_FOR.media;
  return APPS_FOR.other;
}

export function DialogWindow({ win }: { win: WinState }) {
  const wm = useWM();
  const kind = win.props.kind as DialogKind;
  const name = String(win.props.name ?? "");
  const ext = String(win.props.ext ?? "");
  const path = String(win.props.path ?? "");
  const close = () => wm.close(win.id);

  if (kind === "open-with") return (
    <Window win={win} className={styles.flyoutWin}>
      <div className={styles.flyout} data-drag>
        <div className={styles.flyoutTitle}>Select an app to open this .{ext} file</div>
        <OpenWithList apps={appsFor(ext)} ext={ext} onDone={close} />
      </div>
    </Window>
  );

  const title = kind === "cant-run" ? "" : kind === "shortcut" ? "Problem with Shortcut" : "Compressed (zipped) Folders Error";
  return (
    <Window win={win} className={styles.dialogWin}>
      <div className={styles.dialog}>
        <div className={styles.titleBar} data-drag>
          {kind !== "cant-run" && <span className={styles.titleIcon}>{kind === "shortcut" ? <A.FileLnk size={16} /> : <A.FileZip size={16} />}</span>}
          <span className={styles.titleText}>{title}</span>
          <CaptionButtons win={win} closeOnly className={styles.captionSmall} />
        </div>
        {kind === "cant-run" && (
          <div className={styles.body}>
            <div className={styles.bodyMain}>
              <div className={styles.bigTitle}>This app can&apos;t run on your PC</div>
              <div className={styles.text}>To find a version for your PC, check with the software publisher.</div>
            </div>
            <div className={styles.buttons}><button className={styles.btn} onClick={close} autoFocus>Close</button></div>
          </div>
        )}
        {kind === "shortcut" && (
          <div className={styles.body}>
            <div className={styles.bodyMain} style={{ display: "flex", gap: 14 }}>
              <WarningGlyph />
              <div className={styles.text}>The item that this shortcut refers to has been changed or moved, so this shortcut will no longer work correctly.<br /><br />Do you want to delete this shortcut?</div>
            </div>
            <div className={styles.buttons}><button className={styles.btn} onClick={close}>Delete</button><button className={styles.btn} onClick={close} autoFocus>Cancel</button></div>
          </div>
        )}
        {kind === "bad-zip" && (
          <div className={styles.body}>
            <div className={styles.bodyMain} style={{ display: "flex", gap: 14 }}>
              <ErrorGlyph />
              <div className={styles.text}>Windows cannot open the folder.<br /><br />The Compressed (zipped) Folder &apos;{path.replace(/\//g, "\\")}&apos; is invalid.</div>
            </div>
            <div className={styles.buttons}><button className={styles.btn} onClick={close} autoFocus>OK</button></div>
          </div>
        )}
      </div>
    </Window>
  );
}

function OpenWithList({ apps, ext, onDone }: { apps: { label: string; icon: React.ReactNode }[]; ext: string; onDone: () => void }) {
  const [sel, setSel] = useState<number | null>(null);
  return (
    <>
      <div className={styles.appList} data-nodrag>
        {apps.map((a, i) => (
          <button key={a.label} className={`${styles.appRow} ${sel === i ? styles.appRowSel : ""}`} onClick={() => setSel(i)}>
            <span className={styles.appIcon}>{a.icon}</span><span className={styles.appLabel}>{a.label}</span>
          </button>
        ))}
        <button className={styles.appRow} onClick={() => setSel(99)}>
          <span className={styles.appIcon}><A.StoreIcon size={28} /></span><span className={styles.appLabel}>Look for an app in the Microsoft Store</span>
        </button>
        <button className={styles.moreApps}><ChevronDown size={12} /> More apps</button>
      </div>
      <div className={styles.flyoutButtons} data-nodrag>
        <button className={`${styles.btn} ${styles.btnAccent}`} disabled={sel === null} onClick={onDone}>Always</button>
        <button className={styles.btn} disabled={sel === null} onClick={onDone}>Just once</button>
      </div>
      <span style={{ display: "none" }}>{typeLabel(ext, false)}</span>
    </>
  );
}

const WarningGlyph = () => <svg width="32" height="32" viewBox="0 0 32 32" style={{ flexShrink: 0 }}><path d="M16 3L30 28H2z" fill="#F3C400" /><path d="M16 11v9M16 23.5v1.5" stroke="#000" strokeWidth="2.6" strokeLinecap="round" /></svg>;
const ErrorGlyph = () => <svg width="32" height="32" viewBox="0 0 32 32" style={{ flexShrink: 0 }}><circle cx="16" cy="16" r="14" fill="#E02020" /><path d="M10.5 10.5l11 11M21.5 10.5l-11 11" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" /></svg>;
