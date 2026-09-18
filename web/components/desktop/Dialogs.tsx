"use client";
import React, { useEffect, useState } from "react";
import styles from "./Dialogs.module.css";
import { WinState, useWM } from "./wm";
import { Window, CaptionButtons } from "./Window";
import { useOS } from "./os";
import * as A from "@/components/icons/apps";
import { ChevronDown } from "@/components/icons/fluent";
import type { OpenWith, VfsNode } from "@/lib/client/api";
import { formatBytes, formatDateTime, toWindowsPath } from "@/lib/client/api";

/**
 * Realistic Windows responses for files that cannot be opened:
 *  - "open-with": Windows 11 "Select an app to open this .xyz file" flyout. Picking an
 *    app really opens the file in it (Notepad shows the raw bytes, Chrome renders it,
 *    the media player plays it), like Windows would.
 *  - "cant-run": "This app can't run on your PC"
 *  - "shortcut": "Problem with Shortcut"
 *  - "bad-zip": "Compressed (zipped) Folders Error"
 */
export type DialogKind = "open-with" | "cant-run" | "shortcut" | "bad-zip" | "properties";

export function dialogForFile(name: string, ext: string): { kind: DialogKind; w: number; h: number } {
  if (ext === "exe" || ext === "msi" || ext === "com" || ext === "bat" || ext === "jar") return { kind: "cant-run", w: 428, h: 178 };
  if (ext === "lnk" || ext === "url") return { kind: "shortcut", w: 440, h: 190 };
  if (ext === "zip") return { kind: "bad-zip", w: 440, h: 170 };
  return { kind: "open-with", w: 460, h: 560 };
}

interface AppChoice { label: string; icon: React.ReactNode; open: OpenWith | "store" | "photos" | "paint" | "audio" }
const CHROME: AppChoice = { label: "Google Chrome", icon: <A.ChromeIcon size={28} />, open: "chrome" };
const EDGE: AppChoice = { label: "Microsoft Edge", icon: <A.EdgeIcon size={28} />, open: "chrome" };
const NOTEPAD: AppChoice = { label: "Notepad", icon: <A.NotepadIcon size={28} />, open: "notepad" };
const NPP: AppChoice = { label: "Notepad++ : a free (GNU) source code editor", icon: <A.NotepadPlusIcon size={28} />, open: "notepad" };
const VLC: AppChoice = { label: "Windows Media Player", icon: <A.VlcIcon size={28} />, open: "player" };
const REAPER: AppChoice = { label: "REAPER", icon: <A.GenericAppIcon size={28} />, open: "audio" };
const PAINT: AppChoice = { label: "Paint", icon: <A.PaintIcon size={28} />, open: "paint" };
const PHOTOS: AppChoice = { label: "Photos", icon: <A.PhotosIcon size={28} />, open: "photos" };
const MORE: AppChoice[] = [VLC, PAINT, PHOTOS, REAPER, NOTEPAD, CHROME];

function appsFor(ext: string): AppChoice[] {
  // 7-Zip on this machine is the command-line build (Settings lists it, the shell has `7z`),
  // so there is no window for it to open in.
  if (["7z", "rar", "tar", "gz", "iso"].includes(ext)) return [NOTEPAD, CHROME];
  if (["jpg", "jpeg", "png", "gif", "bmp", "webp", "heic", "tif", "svg"].includes(ext)) return [PHOTOS, PAINT, CHROME, EDGE];
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf", "odt", "rtf", "csv"].includes(ext)) return [CHROME, EDGE, NOTEPAD, NPP];
  if (["mp3", "mp4", "mkv", "mov", "m4a", "wav", "avi", "webm", "flac", "aif", "aiff"].includes(ext)) return [VLC, REAPER, CHROME, EDGE];
  return [NOTEPAD, NPP, CHROME];
}

export function DialogWindow({ win }: { win: WinState }) {
  const wm = useWM();
  const os = useOS();
  const kind = win.props.kind as DialogKind;
  const name = String(win.props.name ?? "");
  const ext = String(win.props.ext ?? "");
  const path = String(win.props.path ?? "");
  const close = () => wm.close(win.id);
  const isActive = wm.activeId === win.id;
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") wm.close(win.id); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, wm, win.id]);

  if (kind === "properties") {
    const node = win.props.node as VfsNode | undefined;
    const round = (n: number) => Math.ceil(n / 4096) * 4096;
    return (
      <Window win={win} className={styles.dialogWin}>
        <div className={styles.dialog}>
          <div className={styles.titleBar} data-drag>
            <span className={styles.titleText}>{name} Properties</span>
            <CaptionButtons win={win} closeOnly className={styles.captionSmall} />
          </div>
          <div className={styles.propTabs}>
            {["General", "Security", "Details", "Previous Versions"].map((t, i) => <span key={t} className={`${styles.propTab} ${i === 0 ? styles.propTabOn : ""}`}>{t}</span>)}
          </div>
          <div className={styles.propBody}>
            <div className={styles.propHead}><A.FileTypeIcon ext={ext} dir={node?.dir} name={name} size={32} /><span>{name}</span></div>
            <div className={styles.propRows}>
              <div><b>Type of file:</b><span>{A.typeLabel(ext, !!node?.dir)}{ext ? ` (.${ext})` : ""}</span></div>
              <div><b>Opens with:</b><span>{["jpg", "jpeg", "png", "heic", "gif", "bmp"].includes(ext) ? "Photos" : ["wav", "mp3", "mp4", "m4a", "mkv", "mov"].includes(ext) ? "VLC media player" : ext === "pdf" ? "Google Chrome" : "Notepad"}</span></div>
              <div><b>Location:</b><span>{toWindowsPath(path.slice(0, path.lastIndexOf("/")))}</span></div>
              <div><b>Size:</b><span>{node ? `${formatBytes(node.size)} (${node.size.toLocaleString("en-US")} bytes)` : "—"}</span></div>
              <div><b>Size on disk:</b><span>{node ? `${formatBytes(round(node.size))} (${round(node.size).toLocaleString("en-US")} bytes)` : "—"}</span></div>
              <div className={styles.propSep} />
              <div><b>Created:</b><span>{node?.created ? formatDateTime(node.created, os.profile.locale, os.profile.dateFormat) : "—"}</span></div>
              <div><b>Modified:</b><span>{node?.modified ? formatDateTime(node.modified, os.profile.locale, os.profile.dateFormat) : "—"}</span></div>
              <div><b>Accessed:</b><span>{node?.modified ? formatDateTime(node.modified, os.profile.locale, os.profile.dateFormat) : "—"}</span></div>
              <div className={styles.propSep} />
              <div><b>Attributes:</b><span>{[node?.hidden ? "Hidden" : "", node?.system ? "System" : "", "Read-only"].filter(Boolean).join(", ")}</span></div>
            </div>
          </div>
          <div className={styles.buttons}><button className={styles.btn} onClick={close} autoFocus>OK</button><button className={styles.btn} onClick={close}>Cancel</button></div>
        </div>
      </Window>
    );
  }

  if (kind === "open-with") return (
    <Window win={win} className={styles.flyoutWin}>
      <div className={styles.flyout} data-drag>
        <div className={styles.flyoutTitle}>Select an app to open this .{ext} file</div>
        <OpenWithList apps={appsFor(ext)} ext={ext} onChoose={(c) => {
          close();
          if (c.open === "store") os.openUrl(`https://apps.microsoft.com/search?query=${encodeURIComponent("." + ext)}`);
          else if (c.open === "photos" || c.open === "paint" || c.open === "audio") os.launch(c.open, { path, nonce: Date.now() });
          else os.openWith(path, c.open);
        }} />
      </div>
    </Window>
  );

  const title = kind === "cant-run" ? "" : kind === "shortcut" ? "Problem with Shortcut" : "Compressed (zipped) Folders Error";
  return (
    <Window win={win} className={styles.dialogWin}>
      <div className={styles.dialog}>
        <div className={styles.titleBar} data-drag>
          {kind !== "cant-run" && <span className={styles.titleIcon}><A.FileTypeIcon ext={kind === "shortcut" ? "lnk" : "zip"} size={16} /></span>}
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
              <div className={styles.text}>Windows cannot open the folder.<br /><br />The Compressed (zipped) Folder &apos;{(path || name).replace(/\//g, "\\")}&apos; is invalid.</div>
            </div>
            <div className={styles.buttons}><button className={styles.btn} onClick={close} autoFocus>OK</button></div>
          </div>
        )}
      </div>
    </Window>
  );
}

function OpenWithList({ apps, ext, onChoose }: { apps: AppChoice[]; ext: string; onChoose: (c: AppChoice) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const list: AppChoice[] = [...apps, ...(more ? MORE.filter((m) => !apps.some((a) => a.label === m.label)) : [])];
  const store: AppChoice = { label: "Look for an app in the Microsoft Store", icon: <A.StoreIcon size={28} />, open: "store" };
  const all = [...list, store];
  const go = () => { if (sel !== null && all[sel]) onChoose(all[sel]); };
  return (
    <>
      <div className={styles.appList} data-nodrag>
        {all.map((a, i) => (
          <button key={a.label} className={`${styles.appRow} ${sel === i ? styles.appRowSel : ""}`} onClick={() => setSel(i)} onDoubleClick={() => onChoose(a)}>
            <span className={styles.appIcon}>{a.icon}</span><span className={styles.appLabel}>{a.label}</span>
          </button>
        ))}
        {!more && <button className={styles.moreApps} onClick={() => setMore(true)}><ChevronDown size={12} /> More apps</button>}
      </div>
      <div className={styles.flyoutButtons} data-nodrag>
        <button className={`${styles.btn} ${styles.btnAccent}`} disabled={sel === null} onClick={go}>Always</button>
        <button className={styles.btn} disabled={sel === null} onClick={go}>Just once</button>
      </div>
      <span style={{ display: "none" }}>{A.typeLabel(ext, false)}</span>
    </>
  );
}

const WarningGlyph = () => <svg width="32" height="32" viewBox="0 0 32 32" style={{ flexShrink: 0 }}><path d="M16 3L30 28H2z" fill="#F3C400" /><path d="M16 11v9M16 23.5v1.5" stroke="#000" strokeWidth="2.6" strokeLinecap="round" /></svg>;
const ErrorGlyph = () => <svg width="32" height="32" viewBox="0 0 32 32" style={{ flexShrink: 0 }}><circle cx="16" cy="16" r="14" fill="#E02020" /><path d="M10.5 10.5l11 11M21.5 10.5l-11 11" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" /></svg>;
