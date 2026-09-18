"use client";
/**
 * App icons and Explorer file-type icons. Nothing here is hand-drawn: brand marks come
 * from Iconify "logos" / Simple Icons, Windows folders and shell items from
 * Icons8 Flat Color Icons, file types from vscode-icons, colour glyphs from Fluent.
 */
import React from "react";
import * as FI from "@fluentui/react-icons";
import { SiWhatsapp, SiSteam, SiNotepadplusplus, SiVlcmediaplayer, SiDiscord, SiTelegram } from "react-icons/si";
import { Ico } from "@/lib/icons/Ico";

type P = { size?: number; className?: string; style?: React.CSSProperties };

/** Rounded tile with a brand mark on it (how Windows renders most third-party app icons). */
function Tile({ size = 24, bg, radius = 0.22, children, className, style }: P & { bg: string; radius?: number; children: React.ReactNode }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: size * radius, background: bg, flexShrink: 0, ...style }}>
      {children}
    </span>
  );
}
const fluent = (C: React.ComponentType<{ fontSize?: number; style?: React.CSSProperties; className?: string }>) => ({ size = 24, className, style }: P) => <C fontSize={size} className={className} style={{ display: "block", ...style }} />;
const ico = (name: string) => ({ size = 24, className, style }: P) => <Ico name={name} size={size} className={className} style={style} />;

// --- Windows shell / folders ---
export const FolderIcon = ico("flat-color-icons:folder");
export const FolderOpenIcon = ico("flat-color-icons:opened-folder");
export const DesktopFolder = ico("flat-color-icons:display");
export const DownloadsFolder = ico("flat-color-icons:download");
export const DocumentsFolder = ico("flat-color-icons:document");
export const PicturesFolder = ico("flat-color-icons:picture");
export const MusicFolder = ico("flat-color-icons:music");
export const VideosFolder = ico("flat-color-icons:video-file");
export const ThisPC = ico("fluent-emoji-flat:laptop");
export const NetworkIcon = ico("flat-color-icons:globe");
export const OneDriveIcon = ico("logos:microsoft-onedrive");
export const HomeIcon = ico("flat-color-icons:home");
export const GalleryIcon = ico("flat-color-icons:gallery");
export const DriveC = ico("flat-color-icons:data-backup");
export const DriveD = ico("flat-color-icons:filing-cabinet");
export const RecycleBinIcon = ({ full, ...p }: P & { full?: boolean }) => <Ico name={full ? "flat-color-icons:full-trash" : "flat-color-icons:empty-trash"} {...p} />;

// --- Applications ---
export const ExplorerAppIcon = ico("flat-color-icons:folder");
export const ChromeIcon = ico("logos:chrome");
export const WhatsAppIcon = ({ size = 24, ...p }: P) => <Tile size={size} bg="#25D366" {...p}><SiWhatsapp size={size * 0.68} color="#fff" /></Tile>;
export const NotepadIcon = fluent(FI.DocumentTextColor);
export const EdgeIcon = ico("logos:microsoft-edge");
export const StoreIcon = fluent(FI.BuildingStoreColor);
export const SettingsIcon = fluent(FI.SettingsColor);
export const PhotosIcon = fluent(FI.ImageColor);
export const CalculatorIcon = ico("flat-color-icons:calculator");
export const MailIcon = fluent(FI.MailColor);
export const CalendarIcon = fluent(FI.CalendarColor);
export const ClockIcon = fluent(FI.ClockColor);
export const XboxIcon = ({ size = 24, ...p }: P) => <Tile size={size} bg="#107C10" radius={0.5} {...p}><FI.XboxConsole24Regular fontSize={size * 0.62} style={{ color: "#fff" }} /></Tile>;
export const SolitaireIcon = fluent(FI.RewardColor);
export const SpotifyIcon = ico("logos:spotify-icon");
export const WordIcon = fluent(FI.DocumentTextColor);
export const ExcelIcon = fluent(FI.TableColor);
export const PowerPointIcon = fluent(FI.SlideTextSparkleColor);
export const OutlookIcon = fluent(FI.MailColor);
export const PaintIcon = fluent(FI.PaintBrushColor);
export const SnipIcon = ({ size = 24, ...p }: P) => <Tile size={size} bg="#2F6DB5" {...p}><FI.Cut24Regular fontSize={size * 0.62} style={{ color: "#fff" }} /></Tile>;
export const TerminalAppIcon = ({ size = 24, ...p }: P) => <Tile size={size} bg="#2B2B2B" {...p}><FI.WindowConsole20Regular fontSize={size * 0.66} style={{ color: "#fff" }} /></Tile>;
export const TodoIcon = fluent(FI.CheckboxColor);
export const DiscordIcon = ({ size = 24, ...p }: P) => <Tile size={size} bg="#5865F2" {...p}><SiDiscord size={size * 0.66} color="#fff" /></Tile>;
export const SteamIcon = ({ size = 24, ...p }: P) => <Tile size={size} bg="#1B2838" radius={0.5} {...p}><SiSteam size={size * 0.72} color="#fff" /></Tile>;
export const VlcIcon = ({ size = 24, ...p }: P) => <SiVlcmediaplayer size={size} color="#F57C00" {...p} />;
export const ZoomIcon = ico("logos:zoom-icon");
export const NotepadPlusIcon = ({ size = 24, ...p }: P) => <SiNotepadplusplus size={size} color="#90E59A" {...p} />;
export const SevenZipIcon = ico("vscode-icons:file-type-zip");
export const AcrobatIcon = ico("logos:adobe-icon");
export const FirefoxIcon = ico("logos:firefox");
export const TelegramIcon = ({ size = 24, ...p }: P) => <SiTelegram size={size} color="#26A5E4" {...p} />;
export const CameraIcon = fluent(FI.CameraColor);
export const PhoneLinkIcon = fluent(FI.PhoneLaptopColor);
export const GenericAppIcon = fluent(FI.AppsColor);
export const CopilotIcon = fluent(FI.BotSparkleColor);
export const ClaudeIcon = ico("logos:claude-icon");
export const GmailIcon = ico("logos:google-gmail");
export const GoogleIcon = ico("logos:google-icon");
export const YouTubeIcon = ico("logos:youtube-icon");
export const MapsIcon = ico("logos:google-maps");

/** Account picture: uses the owner's photo when present, else Windows' default grey person. */
export const UserAvatar = ({ size = 32, src }: { size?: number; name?: string; src?: string | null }) => (
  src ? <img src={src} width={size} height={size} alt="" style={{ borderRadius: "50%", objectFit: "cover", display: "block" }} /> : <FI.PersonCircle32Regular fontSize={size} style={{ display: "block", color: "rgba(255,255,255,.85)" }} />
);

// --- File type icons (Explorer) ---
const EXT_ICON: Record<string, string> = {
  txt: "vscode-icons:file-type-text", log: "vscode-icons:file-type-log", md: "vscode-icons:file-type-markdown", srt: "vscode-icons:file-type-text", rtf: "vscode-icons:file-type-word", odt: "vscode-icons:file-type-word",
  pdf: "vscode-icons:file-type-pdf2",
  doc: "vscode-icons:file-type-word", docx: "vscode-icons:file-type-word", dotx: "vscode-icons:file-type-word",
  xls: "vscode-icons:file-type-excel", xlsx: "vscode-icons:file-type-excel", csv: "vscode-icons:file-type-excel",
  ppt: "vscode-icons:file-type-powerpoint", pptx: "vscode-icons:file-type-powerpoint",
  jpg: "vscode-icons:file-type-image", jpeg: "vscode-icons:file-type-image", png: "vscode-icons:file-type-image", gif: "vscode-icons:file-type-image", bmp: "vscode-icons:file-type-image", webp: "vscode-icons:file-type-image", svg: "vscode-icons:file-type-image", heic: "vscode-icons:file-type-image", tif: "vscode-icons:file-type-image",
  mp4: "vscode-icons:file-type-video", mkv: "vscode-icons:file-type-video", mov: "vscode-icons:file-type-video", avi: "vscode-icons:file-type-video", webm: "vscode-icons:file-type-video", wmv: "vscode-icons:file-type-video",
  mp3: "vscode-icons:file-type-audio", m4a: "vscode-icons:file-type-audio", wav: "vscode-icons:file-type-audio", flac: "vscode-icons:file-type-audio", aac: "vscode-icons:file-type-audio",
  zip: "vscode-icons:file-type-zip", rar: "vscode-icons:file-type-zip", "7z": "vscode-icons:file-type-zip", gz: "vscode-icons:file-type-zip",
  exe: "vscode-icons:file-type-binary", msi: "vscode-icons:file-type-binary", com: "vscode-icons:file-type-binary", bat: "vscode-icons:file-type-binary", jar: "vscode-icons:file-type-binary",
  dll: "vscode-icons:file-type-binary", sys: "vscode-icons:file-type-binary", dat: "vscode-icons:file-type-binary", bin: "vscode-icons:file-type-binary", pak: "vscode-icons:file-type-binary", db: "vscode-icons:file-type-db", blf: "vscode-icons:file-type-binary", pf: "vscode-icons:file-type-binary", msc: "vscode-icons:file-type-config",
  ini: "vscode-icons:file-type-ini", xml: "vscode-icons:file-type-xml", json: "vscode-icons:file-type-json", cfg: "vscode-icons:file-type-config", vdf: "vscode-icons:file-type-config", manifest: "vscode-icons:file-type-config", ics: "vscode-icons:file-type-config", eml: "vscode-icons:file-type-text", rdp: "vscode-icons:file-type-config",
  html: "logos:chrome", htm: "logos:chrome",
  url: "flat-color-icons:link",
  ttf: "vscode-icons:file-type-font", ttc: "vscode-icons:file-type-font", fon: "vscode-icons:file-type-font", otf: "vscode-icons:file-type-font",
  psd: "vscode-icons:file-type-photoshop",
};

export function FileTypeIcon({ ext, dir, name, size = 16 }: { ext: string; dir?: boolean; name?: string; size?: number }) {
  if (dir) return <Ico name="flat-color-icons:folder" size={size} />;
  if (ext === "lnk") {
    const n = (name ?? "").toLowerCase();
    const inner = n.includes("chrome") ? <ChromeIcon size={size} /> : n.includes("whatsapp") ? <WhatsAppIcon size={size} /> : n.includes("desktop") || n.includes("downloads") ? <FolderIcon size={size} /> : <Ico name="vscode-icons:file-type-binary" size={size} />;
    return (
      <span style={{ position: "relative", display: "inline-block", width: size, height: size }}>
        {inner}
        <span style={{ position: "absolute", left: -1, bottom: -1, width: size * 0.45, height: size * 0.45, background: "#fff", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 1px rgba(0,0,0,.25)" }}>
          <FI.ArrowUpRight12Filled fontSize={size * 0.4} style={{ color: "#2E5BB0" }} />
        </span>
      </span>
    );
  }
  const key = EXT_ICON[ext] ?? "fluent-emoji-flat:page-facing-up";
  return <Ico name={key} size={size} />;
}

/** Explorer "Type" column text for an extension. */
export function typeLabel(ext: string, dir: boolean): string {
  if (dir) return "File folder";
  const map: Record<string, string> = {
    txt: "Text Document", log: "Text Document", md: "MD File", pdf: "Microsoft Edge PDF Document", doc: "Microsoft Word 97 - 2003 Document", docx: "Microsoft Word Document", dotx: "Microsoft Word Template",
    xls: "Microsoft Excel 97-2003 Worksheet", xlsx: "Microsoft Excel Worksheet", csv: "Microsoft Excel Comma Separated Values File", ppt: "Microsoft PowerPoint 97-2003 Presentation", pptx: "Microsoft PowerPoint Presentation",
    jpg: "JPG File", jpeg: "JPEG File", png: "PNG File", gif: "GIF File", bmp: "BMP File", webp: "WEBP File", svg: "SVG Document", heic: "HEIC File", tif: "TIF File",
    mp4: "MP4 File", mkv: "MKV File", mov: "MOV File", avi: "AVI File", webm: "WEBM File", mp3: "MP3 File", m4a: "M4A File", wav: "WAV File", flac: "FLAC File",
    zip: "Compressed (zipped) Folder", rar: "RAR File", "7z": "7Z File", exe: "Application", msi: "Windows Installer Package", com: "MS-DOS Application", bat: "Windows Batch File", jar: "Executable Jar File",
    dll: "Application extension", sys: "System file", dat: "DAT File", bin: "BIN File", ini: "Configuration settings", xml: "XML Document", json: "JSON File", html: "Chrome HTML Document", htm: "Chrome HTML Document",
    url: "Internet Shortcut", lnk: "Shortcut", ttf: "TrueType font file", ttc: "TrueType collection font file", fon: "Font file", ics: "iCalendar File", eml: "E-mail Message", rdp: "Remote Desktop Connection", crdownload: "CRDOWNLOAD File", tmp: "TMP File", rtf: "Rich Text Format", odt: "OpenDocument Text", srt: "SRT File", pf: "PF File", msc: "Microsoft Common Console Document", pak: "PAK File", db: "Data Base File", blf: "BLF File", vdf: "VDF File", itl: "ITL File", manifest: "MANIFEST File", cfg: "CFG File", prx: "PRX File", mui: "MUI File", cat: "Security Catalog", chm: "Compiled HTML Help file", ion: "ION File", qdf: "QDF File", tax2021: "TAX2021 File", tax2022: "TAX2022 File", tax2023: "TAX2023 File", tax2024: "TAX2024 File", tax2025: "TAX2025 File",
  };
  if (map[ext]) return map[ext];
  if (!ext) return "File";
  return `${ext.toUpperCase()} File`;
}
