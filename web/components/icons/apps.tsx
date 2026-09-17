/** Colour app icons and Explorer file-type icons (Windows 11 style, drawn as SVG). */
import React from "react";

type P = { size?: number; className?: string; style?: React.CSSProperties };
const Svg = ({ size = 24, className, style, children, viewBox = "0 0 32 32" }: P & { children: React.ReactNode; viewBox?: string }) => (
  <svg width={size} height={size} viewBox={viewBox} className={className} style={style} xmlns="http://www.w3.org/2000/svg">{children}</svg>
);

// --- Windows 11 folder (yellow) ---
export const FolderIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2 8.5A2.5 2.5 0 0 1 4.5 6h7.2a2.5 2.5 0 0 1 1.8.8L15 8.5h12.5A2.5 2.5 0 0 1 30 11v13.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#E8B33B" />
    <path d="M2 11h28v13.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#FFD25A" />
    <path d="M2 13.5c0-.8.7-1.5 1.5-1.5h25c.8 0 1.5.7 1.5 1.5V24.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#FFC83D" />
  </Svg>
);
export const FolderOpenIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2 8.5A2.5 2.5 0 0 1 4.5 6h7.2a2.5 2.5 0 0 1 1.8.8L15 8.5h12.5A2.5 2.5 0 0 1 30 11v3H2z" fill="#E8B33B" />
    <path d="M4.2 14h24.6a1.5 1.5 0 0 1 1.4 2l-2.9 9.3a2.5 2.5 0 0 1-2.4 1.7H4.5A2.5 2.5 0 0 1 2 24.5V16a2 2 0 0 1 2.2-2z" fill="#FFD25A" />
  </Svg>
);

// --- Explorer navigation icons (Windows 11 coloured glyphs) ---
export const DesktopFolder = (p: P) => (<Svg {...p}><rect x="3" y="6" width="26" height="17" rx="2.5" fill="#2E8BE0" /><rect x="5" y="8" width="22" height="13" rx="1" fill="#63B4F5" /><path d="M11 27h10M16 23v4" stroke="#7A7A7A" strokeWidth="2" strokeLinecap="round" /></Svg>);
export const DownloadsFolder = (p: P) => (<Svg {...p}><path d="M2 8.5A2.5 2.5 0 0 1 4.5 6h7.2a2.5 2.5 0 0 1 1.8.8L15 8.5h12.5A2.5 2.5 0 0 1 30 11v13.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#E8B33B" /><path d="M2 12h28v12.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#FFD25A" /><circle cx="16" cy="19.5" r="6" fill="#2E8BE0" /><path d="M16 16v6M13.2 19.5l2.8 2.8 2.8-2.8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>);
export const DocumentsFolder = (p: P) => (<Svg {...p}><path d="M2 8.5A2.5 2.5 0 0 1 4.5 6h7.2a2.5 2.5 0 0 1 1.8.8L15 8.5h12.5A2.5 2.5 0 0 1 30 11v13.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#E8B33B" /><path d="M2 12h28v12.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#FFD25A" /><rect x="11" y="14" width="10" height="12" rx="1" fill="#fff" stroke="#8A8A8A" strokeWidth=".8" /><path d="M13 17.5h6M13 20h6M13 22.5h4" stroke="#4A90D9" strokeWidth="1" strokeLinecap="round" /></Svg>);
export const PicturesFolder = (p: P) => (<Svg {...p}><path d="M2 8.5A2.5 2.5 0 0 1 4.5 6h7.2a2.5 2.5 0 0 1 1.8.8L15 8.5h12.5A2.5 2.5 0 0 1 30 11v13.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#E8B33B" /><path d="M2 12h28v12.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#FFD25A" /><rect x="9.5" y="14" width="13" height="11" rx="1" fill="#fff" stroke="#8A8A8A" strokeWidth=".8" /><path d="M10.5 23l3.5-4 2.5 2.5 2-2 3.5 3.5z" fill="#4CAF50" /><circle cx="19" cy="17" r="1.3" fill="#FFB300" /></Svg>);
export const MusicFolder = (p: P) => (<Svg {...p}><path d="M2 8.5A2.5 2.5 0 0 1 4.5 6h7.2a2.5 2.5 0 0 1 1.8.8L15 8.5h12.5A2.5 2.5 0 0 1 30 11v13.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#E8B33B" /><path d="M2 12h28v12.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#FFD25A" /><path d="M13.5 22.5V15l7-1.5v7.5" stroke="#3A6DB0" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /><circle cx="11.7" cy="22.7" r="2" fill="#3A6DB0" /><circle cx="18.7" cy="21.2" r="2" fill="#3A6DB0" /></Svg>);
export const VideosFolder = (p: P) => (<Svg {...p}><path d="M2 8.5A2.5 2.5 0 0 1 4.5 6h7.2a2.5 2.5 0 0 1 1.8.8L15 8.5h12.5A2.5 2.5 0 0 1 30 11v13.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#E8B33B" /><path d="M2 12h28v12.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#FFD25A" /><rect x="9.5" y="14.5" width="13" height="10" rx="1.2" fill="#5C5C5C" /><rect x="9.5" y="14.5" width="13" height="10" rx="1.2" fill="none" stroke="#2f2f2f" strokeWidth=".8" /><path d="M14.5 17v5l4.3-2.5z" fill="#fff" /></Svg>);
export const ThisPC = (p: P) => (<Svg {...p}><rect x="3" y="6" width="26" height="16" rx="2" fill="#4B5E73" /><rect x="5" y="8" width="22" height="12" rx="1" fill="#7EC0F2" /><path d="M5 8h22v6a20 12 0 0 1-22 4z" fill="#A6D8FA" opacity=".6" /><path d="M11 27h10M16 22v5" stroke="#6E7B89" strokeWidth="2.2" strokeLinecap="round" /></Svg>);
export const NetworkIcon = (p: P) => (<Svg {...p}><rect x="4" y="6" width="10" height="7" rx="1.2" fill="#5B9BD5" /><rect x="18" y="6" width="10" height="7" rx="1.2" fill="#5B9BD5" /><rect x="11" y="20" width="10" height="7" rx="1.2" fill="#3F7FBF" /><path d="M9 13v3h14v-3M16 16v4" stroke="#6E7B89" strokeWidth="1.5" fill="none" /></Svg>);
export const OneDriveIcon = (p: P) => (<Svg {...p}><path d="M9 24a5 5 0 0 1-.7-9.95A7.5 7.5 0 0 1 22.5 12a5.5 5.5 0 0 1 1.5 10.8" fill="#0A64C4" /><path d="M9 24h15.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1.5A5 5 0 0 0 9 24z" fill="#1490DF" /></Svg>);
export const HomeIcon = (p: P) => (<Svg {...p}><path d="M4 15L16 5l12 10v11a2 2 0 0 1-2 2h-7v-8h-6v8H6a2 2 0 0 1-2-2z" fill="#3B82D6" /><path d="M4 15L16 5l12 10" fill="none" stroke="#2B65B0" strokeWidth="1.5" strokeLinejoin="round" /></Svg>);
export const GalleryIcon = (p: P) => (<Svg {...p}><rect x="4" y="6" width="24" height="20" rx="2.5" fill="#fff" stroke="#7A7A7A" strokeWidth="1" /><path d="M6 23l6-7 4 4.5 3-3 7 5.5z" fill="#4CAF50" /><circle cx="21" cy="12" r="2.3" fill="#FFB300" /></Svg>);
export const DriveC = (p: P) => (<Svg {...p}><rect x="3" y="10" width="26" height="14" rx="2" fill="#8C8C8C" /><rect x="3" y="10" width="26" height="9" rx="2" fill="#B8B8B8" /><circle cx="24.5" cy="21" r="1.2" fill="#3DDC84" /><g transform="translate(6 12) scale(.42)"><rect width="9" height="9" fill="#0078D4" /><rect x="11" width="9" height="9" fill="#0078D4" /><rect y="11" width="9" height="9" fill="#0078D4" /><rect x="11" y="11" width="9" height="9" fill="#0078D4" /></g></Svg>);
export const DriveD = (p: P) => (<Svg {...p}><rect x="3" y="10" width="26" height="14" rx="2" fill="#8C8C8C" /><rect x="3" y="10" width="26" height="9" rx="2" fill="#B8B8B8" /><circle cx="24.5" cy="21" r="1.2" fill="#3DDC84" /></Svg>);
export const RecycleBinIcon = ({ full, ...p }: P & { full?: boolean }) => (
  <Svg {...p} viewBox="0 0 48 48">
    <path d="M12 14h24l-2.4 28a2 2 0 0 1-2 1.8H16.4a2 2 0 0 1-2-1.8z" fill="#E9EEF3" stroke="#7B8794" strokeWidth="1" />
    <path d="M16 18l1.5 22M24 18v22M32 18l-1.5 22" stroke="#B5C0CC" strokeWidth="1.2" />
    <rect x="9" y="10" width="30" height="5" rx="1.5" fill="#D6DEE6" stroke="#7B8794" strokeWidth="1" />
    {full && <path d="M15 12c2-5 6-7 9-6 1-3 6-3 7 0 3-1 6 2 6 5z" fill="#F4F7FA" stroke="#7B8794" strokeWidth="1" />}
    <path d="M22 18h4l-1 3h-2z" fill="#7FB3E6" opacity="0" />
    <path d="M20 26.5a3.5 3.5 0 0 1 6-2.5M27 31.5a3.5 3.5 0 0 1-6 2.5" fill="none" stroke="#2E7D32" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M26.5 22.5l-.5 2.5-2.5-.6M20.5 35.5l.5-2.5 2.5.6" fill="none" stroke="#2E7D32" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// --- Application icons ---
export const ExplorerAppIcon = (p: P) => (<Svg {...p}><path d="M2 8.5A2.5 2.5 0 0 1 4.5 6h7.2a2.5 2.5 0 0 1 1.8.8L15 8.5h12.5A2.5 2.5 0 0 1 30 11v13.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#E8B33B" /><path d="M2 12h28v12.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#FFD25A" /><path d="M4 12h22a2 2 0 0 1 2 2v10.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5V14a2 2 0 0 1 2-2z" fill="#FFC83D" /><path d="M14 17h6l-1.2 8.5a1 1 0 0 1-1 .9h-1.6a1 1 0 0 1-1-.9z" fill="#3A8FE0" /></Svg>);
export const ChromeIcon = (p: P) => (
  <Svg {...p} viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="22" fill="#fff" />
    <path d="M24 2a22 22 0 0 1 19.05 11H24a11 11 0 0 0-9.53 5.5L7.3 7.06A21.95 21.95 0 0 1 24 2z" fill="#DB4437" />
    <path d="M45.4 16.4A22 22 0 0 1 24 46l10.5-18.2a11 11 0 0 0 .1-10.8h10.8z" fill="#FFCD40" />
    <path d="M14.47 18.5A11 11 0 0 0 24 35l-6.4 11.1A22 22 0 0 1 7.3 7.06z" fill="#0F9D58" />
    <path d="M24 46a22 22 0 0 1-6.4-.9L24 35a11 11 0 0 0 10.5-7.2L45.4 16.4A22 22 0 0 1 24 46z" fill="#FFCD40" opacity="0" />
    <circle cx="24" cy="24" r="11" fill="#fff" />
    <circle cx="24" cy="24" r="8.8" fill="#4285F4" />
  </Svg>
);
export const WhatsAppIcon = (p: P) => (
  <Svg {...p} viewBox="0 0 48 48">
    <rect width="48" height="48" rx="11" fill="#25D366" />
    <path d="M24 9.5A14.5 14.5 0 0 0 11.6 31.6L9.5 38.5l7.1-2A14.5 14.5 0 1 0 24 9.5z" fill="#fff" />
    <path d="M24 12a12 12 0 0 0-10.3 18.2l.3.5-1.3 4.5 4.6-1.2.5.3A12 12 0 1 0 24 12z" fill="#25D366" />
    <path d="M18.3 17.4c-.3-.7-.6-.7-.9-.7h-.8c-.3 0-.7.1-1.1.5-.4.4-1.4 1.4-1.4 3.4s1.5 4 1.7 4.2c.2.3 2.9 4.6 7.1 6.3 3.5 1.4 4.2 1.1 5 1 .8-.1 2.4-1 2.8-2 .3-1 .3-1.8.2-2-.1-.2-.4-.3-.8-.5s-2.4-1.2-2.8-1.3c-.4-.1-.6-.2-.9.2-.3.4-1 1.3-1.3 1.6-.2.3-.5.3-.9.1-.4-.2-1.7-.6-3.2-2-1.2-1.1-2-2.4-2.2-2.8-.2-.4 0-.6.2-.8l.6-.7c.2-.2.3-.4.4-.7.1-.3 0-.5 0-.7-.1-.2-.9-2.3-1.3-3.1z" fill="#fff" />
  </Svg>
);
export const NotepadIcon = (p: P) => (<Svg {...p}><rect x="6" y="3" width="20" height="26" rx="2" fill="#fff" stroke="#8A9BAE" strokeWidth="1" /><rect x="6" y="3" width="20" height="5" rx="2" fill="#4E7FC0" /><path d="M10 13h12M10 17h12M10 21h8" stroke="#6B7C93" strokeWidth="1.2" strokeLinecap="round" /></Svg>);
export const EdgeIcon = (p: P) => (<Svg {...p} viewBox="0 0 48 48"><path d="M44 22c0-9-8-16-20-16C12 6 5 14 4 23c3-7 10-9 15-9 6 0 9 3 9 6 0 2-2 3-4 4 8-1 9-5 9-5s3 8-4 13c-6 4-14 3-19-2 4 8 12 12 21 10 8-2 13-9 13-18z" fill="#0C59A4" /><path d="M4 23c-1 8 3 15 11 19 5 2 11 2 16-1-8 1-15-3-18-10-2-5 0-9 2-11-6 1-10 4-11 3z" fill="#35C1F1" /><path d="M24 14c7-1 12 2 15 8-3-3-7-5-11-4-4 1-6 4-6 7 0 4 4 6 8 5-7 5-15 1-16-6 0-5 4-9 10-10z" fill="#2CB56A" opacity=".85" /></Svg>);
export const StoreIcon = (p: P) => (<Svg {...p}><path d="M5 12h22l-1 15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" fill="#0F6CBD" /><path d="M11 12V9a5 5 0 0 1 10 0v3" fill="none" stroke="#0F6CBD" strokeWidth="2" /><rect x="9" y="16" width="5" height="5" fill="#fff" /><rect x="18" y="16" width="5" height="5" fill="#fff" /><rect x="9" y="23" width="5" height="4" fill="#fff" /><rect x="18" y="23" width="5" height="4" fill="#fff" /></Svg>);
export const SettingsIcon = (p: P) => (<Svg {...p}><circle cx="16" cy="16" r="5" fill="none" stroke="#5F6B7A" strokeWidth="2.2" /><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8" stroke="#5F6B7A" strokeWidth="2.6" strokeLinecap="round" /></Svg>);
export const PhotosIcon = (p: P) => (<Svg {...p}><rect x="3" y="3" width="26" height="26" rx="4" fill="#F1F1F1" stroke="#B8B8B8" strokeWidth=".8" /><rect x="6" y="6" width="9.5" height="9.5" rx="1.5" fill="#4CAF50" /><rect x="16.5" y="6" width="9.5" height="9.5" rx="1.5" fill="#2196F3" /><rect x="6" y="16.5" width="9.5" height="9.5" rx="1.5" fill="#FFC107" /><rect x="16.5" y="16.5" width="9.5" height="9.5" rx="1.5" fill="#E91E63" /></Svg>);
export const CalculatorIcon = (p: P) => (<Svg {...p}><rect x="6" y="3" width="20" height="26" rx="2.5" fill="#F3F3F3" stroke="#9A9A9A" strokeWidth=".8" /><rect x="9" y="6" width="14" height="6" rx="1" fill="#3B3B3B" /><g fill="#6B6B6B"><rect x="9" y="15" width="3.5" height="3" rx=".5" /><rect x="14.25" y="15" width="3.5" height="3" rx=".5" /><rect x="19.5" y="15" width="3.5" height="3" rx=".5" fill="#0F6CBD" /><rect x="9" y="20" width="3.5" height="3" rx=".5" /><rect x="14.25" y="20" width="3.5" height="3" rx=".5" /><rect x="19.5" y="20" width="3.5" height="3" rx=".5" fill="#0F6CBD" /><rect x="9" y="25" width="8.75" height="2" rx=".5" /><rect x="19.5" y="25" width="3.5" height="2" rx=".5" fill="#0F6CBD" /></g></Svg>);
export const MailIcon = (p: P) => (<Svg {...p}><rect x="3" y="7" width="26" height="18" rx="2.5" fill="#0F6CBD" /><path d="M4 9l12 9 12-9" fill="none" stroke="#fff" strokeWidth="1.6" /></Svg>);
export const CalendarIcon = (p: P) => (<Svg {...p}><rect x="4" y="5" width="24" height="23" rx="2.5" fill="#fff" stroke="#8A8A8A" strokeWidth=".8" /><rect x="4" y="5" width="24" height="7" rx="2.5" fill="#0F6CBD" /><path d="M4 12h24" stroke="#0F6CBD" /><text x="16" y="24.5" fontSize="11" fontFamily="Segoe UI, Arial" textAnchor="middle" fill="#333" fontWeight="600">17</text></Svg>);
export const ClockIcon = (p: P) => (<Svg {...p}><circle cx="16" cy="16" r="12" fill="#fff" stroke="#5F6B7A" strokeWidth="2" /><path d="M16 9v7l4.5 3" stroke="#0F6CBD" strokeWidth="2" strokeLinecap="round" fill="none" /></Svg>);
export const XboxIcon = (p: P) => (<Svg {...p}><circle cx="16" cy="16" r="13" fill="#107C10" /><path d="M9 8c3 1.5 5.5 4 7 6 1.5-2 4-4.5 7-6-2-1.5-4.5-2-7-2s-5 .5-7 2zM8.5 24c1-5 4-9 7.5-12 3.5 3 6.5 7 7.5 12-2 2-4.5 3-7.5 3s-5.5-1-7.5-3z" fill="#fff" /></Svg>);
export const SolitaireIcon = (p: P) => (<Svg {...p}><rect x="5" y="4" width="15" height="21" rx="2" fill="#fff" stroke="#999" strokeWidth=".8" transform="rotate(-8 12 14)" /><rect x="11" y="6" width="15" height="21" rx="2" fill="#fff" stroke="#999" strokeWidth=".8" /><path d="M18.5 12c-2-3-5 0-2.5 2.5L18.5 17l2.5-2.5c2.5-2.5-.5-5.5-2.5-2.5z" fill="#D32F2F" /></Svg>);
export const SpotifyIcon = (p: P) => (<Svg {...p}><circle cx="16" cy="16" r="13" fill="#1DB954" /><path d="M9 12.5c5-1.5 10-1 14 1.2M10 16.5c4-1.2 8-.8 11.5 1M11 20.3c3-1 6-.7 8.5.7" stroke="#000" strokeWidth="2" strokeLinecap="round" fill="none" /></Svg>);
export const WordIcon = (p: P) => (<Svg {...p}><rect x="10" y="4" width="18" height="24" rx="2" fill="#fff" stroke="#8A8A8A" strokeWidth=".8" /><path d="M13 9h12M13 13h12M13 17h12M13 21h8" stroke="#B4C8E6" strokeWidth="1.2" /><rect x="3" y="9" width="14" height="14" rx="1.5" fill="#185ABD" /><text x="10" y="20" fontSize="10" fontFamily="Segoe UI, Arial" fontWeight="700" textAnchor="middle" fill="#fff">W</text></Svg>);
export const ExcelIcon = (p: P) => (<Svg {...p}><rect x="10" y="4" width="18" height="24" rx="2" fill="#fff" stroke="#8A8A8A" strokeWidth=".8" /><path d="M13 9h12M13 13h12M13 17h12M13 21h12M19 9v12" stroke="#B9D7B9" strokeWidth="1" /><rect x="3" y="9" width="14" height="14" rx="1.5" fill="#107C41" /><text x="10" y="20" fontSize="10" fontFamily="Segoe UI, Arial" fontWeight="700" textAnchor="middle" fill="#fff">X</text></Svg>);
export const PowerPointIcon = (p: P) => (<Svg {...p}><rect x="10" y="4" width="18" height="24" rx="2" fill="#fff" stroke="#8A8A8A" strokeWidth=".8" /><rect x="3" y="9" width="14" height="14" rx="1.5" fill="#C43E1C" /><text x="10" y="20" fontSize="10" fontFamily="Segoe UI, Arial" fontWeight="700" textAnchor="middle" fill="#fff">P</text></Svg>);
export const OutlookIcon = (p: P) => (<Svg {...p}><rect x="10" y="6" width="18" height="20" rx="2" fill="#fff" stroke="#8A8A8A" strokeWidth=".8" /><path d="M12 10l7 5 7-5" fill="none" stroke="#B4C8E6" strokeWidth="1.2" /><rect x="3" y="9" width="14" height="14" rx="1.5" fill="#0F6CBD" /><text x="10" y="20" fontSize="10" fontFamily="Segoe UI, Arial" fontWeight="700" textAnchor="middle" fill="#fff">O</text></Svg>);
export const PaintIcon = (p: P) => (<Svg {...p}><path d="M16 4c7 0 12 4.5 12 10 0 3-2.5 5-5.5 5H20c-1.5 0-2 1-1.5 2 .5 1.5 0 3-2 3C9.5 24 4 19.5 4 14S9 4 16 4z" fill="#F8F8F8" stroke="#7A7A7A" strokeWidth=".8" /><circle cx="10" cy="12" r="2" fill="#E53935" /><circle cx="15" cy="8.5" r="2" fill="#FDD835" /><circle cx="21" cy="9.5" r="2" fill="#43A047" /><circle cx="9.5" cy="18" r="2" fill="#1E88E5" /></Svg>);
export const SnipIcon = (p: P) => (<Svg {...p}><circle cx="10" cy="22" r="4" fill="none" stroke="#5F6B7A" strokeWidth="2" /><circle cx="22" cy="22" r="4" fill="none" stroke="#5F6B7A" strokeWidth="2" /><path d="M12.5 19L24 5M19.5 19L8 5" stroke="#5F6B7A" strokeWidth="2" strokeLinecap="round" /></Svg>);
export const TerminalAppIcon = (p: P) => (<Svg {...p}><rect x="3" y="5" width="26" height="22" rx="3" fill="#2B2B2B" /><path d="M8 11l5 5-5 5M15 21h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>);
export const TodoIcon = (p: P) => (<Svg {...p}><rect x="4" y="4" width="24" height="24" rx="4" fill="#2564CF" /><path d="M9 16l5 5 9-10" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></Svg>);
export const DiscordIcon = (p: P) => (<Svg {...p}><rect x="3" y="3" width="26" height="26" rx="6" fill="#5865F2" /><path d="M21.5 10.5c-1.3-.6-2.6-1-4-1.2l-.5 1c-1.5-.2-2.5-.2-4 0l-.5-1c-1.4.2-2.7.6-4 1.2-2.5 3.7-3.2 7.3-2.9 10.9 1.6 1.2 3.2 1.9 4.7 2.4l1-1.6c-.6-.2-1.1-.5-1.6-.8l.4-.3c3.1 1.4 6.4 1.4 9.5 0l.4.3c-.5.3-1 .6-1.6.8l1 1.6c1.5-.5 3.1-1.2 4.7-2.4.4-4.2-.7-7.8-2.6-10.9zM12.5 19.2c-.9 0-1.7-.9-1.7-1.9s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.9-1.7 1.9zm7 0c-.9 0-1.7-.9-1.7-1.9s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.9-1.7 1.9z" fill="#fff" /></Svg>);
export const SteamIcon = (p: P) => (<Svg {...p}><circle cx="16" cy="16" r="13" fill="#1B2838" /><circle cx="20.5" cy="11.5" r="3.5" fill="none" stroke="#fff" strokeWidth="1.6" /><circle cx="11" cy="21" r="3" fill="none" stroke="#fff" strokeWidth="1.6" /><path d="M13.5 19.5l4.5-5.5M3.5 18.5l5 2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /></Svg>);
export const VlcIcon = (p: P) => (<Svg {...p}><path d="M12 5h8l4 18H8z" fill="#F57C00" /><path d="M13.5 5h5l1 4.5h-7zM11.5 13.5h9l1 4.5h-11z" fill="#FFD54F" /><path d="M6 23h20l1.5 3.5H4.5z" fill="#F57C00" /></Svg>);
export const ZoomIcon = (p: P) => (<Svg {...p}><rect x="3" y="3" width="26" height="26" rx="7" fill="#2D8CFF" /><rect x="8" y="11.5" width="12" height="9" rx="2" fill="#fff" /><path d="M20.5 14.5l4-2.5v8l-4-2.5z" fill="#fff" /></Svg>);
export const NotepadPlusIcon = (p: P) => (<Svg {...p}><rect x="6" y="3" width="20" height="26" rx="2" fill="#fff" stroke="#8A9BAE" strokeWidth="1" /><rect x="6" y="3" width="20" height="5" rx="2" fill="#93C47D" /><path d="M10 13h12M10 17h12M10 21h8" stroke="#6B7C93" strokeWidth="1.2" strokeLinecap="round" /></Svg>);
export const SevenZipIcon = (p: P) => (<Svg {...p}><rect x="5" y="5" width="22" height="22" rx="1" fill="#fff" stroke="#000" strokeWidth="1.2" /><text x="16" y="21" fontSize="11" fontFamily="Arial" fontWeight="700" textAnchor="middle" fill="#000">7z</text></Svg>);
export const AcrobatIcon = (p: P) => (<Svg {...p}><rect x="5" y="4" width="22" height="24" rx="3" fill="#B30B00" /><path d="M11 22c3-4 5-9 5-12 0-2 1-2 1.5 0 .3 2-1 6-3.5 10-2 3-3.5 3-3 2zM16 12c1 4 4 7 8 8-3 1-7 0-8-8z" fill="#fff" /></Svg>);
export const FirefoxIcon = (p: P) => (<Svg {...p}><circle cx="16" cy="16" r="13" fill="#FF7139" /><path d="M8 10c1 5 5 8 10 7 3-1 4-4 3-7 2 3 2 8-1 11-4 4-11 3-14-2-2-3-1-7 2-9z" fill="#FFD200" opacity=".9" /><circle cx="16" cy="17" r="4.5" fill="#3F2AA0" opacity=".85" /></Svg>);
export const GenericAppIcon = (p: P) => (<Svg {...p}><rect x="4" y="6" width="24" height="20" rx="2" fill="#F3F3F3" stroke="#7A7A7A" strokeWidth=".8" /><rect x="4" y="6" width="24" height="5" rx="2" fill="#4E7FC0" /><rect x="7" y="14" width="10" height="7" fill="#C9C9C9" /></Svg>);
export const UserAvatar = ({ size = 32, name = "" }: { size?: number; name?: string }) => (
  <svg width={size} height={size} viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#8C6D4E" /><text x="16" y="21" fontSize="13" fontFamily="Segoe UI, Arial" fontWeight="600" textAnchor="middle" fill="#fff">{name.slice(0, 1).toUpperCase()}</text></svg>
);

// --- File type icons (Explorer 16px column) ---
const Page = ({ children, fill = "#fff" }: { children?: React.ReactNode; fill?: string }) => (
  <>
    <path d="M7 3h11l7 7v18a1.5 1.5 0 0 1-1.5 1.5h-16.5A1.5 1.5 0 0 1 5.5 28V4.5A1.5 1.5 0 0 1 7 3z" fill={fill} stroke="#8F8F8F" strokeWidth=".9" />
    <path d="M18 3v6.5a.5.5 0 0 0 .5.5H25" fill="#E6E6E6" stroke="#8F8F8F" strokeWidth=".9" />
    {children}
  </>
);
export const FileGeneric = (p: P) => (<Svg {...p}><Page /></Svg>);
export const FileTxt = (p: P) => (<Svg {...p}><Page><path d="M9 14h12M9 17.5h12M9 21h12M9 24.5h7" stroke="#6E7C8C" strokeWidth="1.1" strokeLinecap="round" /></Page></Svg>);
export const FilePdf = (p: P) => (<Svg {...p}><Page><rect x="4" y="15" width="18" height="10" rx="1.5" fill="#B30B00" /><text x="13" y="22.6" fontSize="7.2" fontFamily="Arial" fontWeight="700" textAnchor="middle" fill="#fff">PDF</text></Page></Svg>);
export const FileDoc = (p: P) => (<Svg {...p}><Page><path d="M9 14h12M9 17.5h12M9 21h12" stroke="#B4C8E6" strokeWidth="1" /><rect x="3" y="16" width="12" height="12" rx="1.2" fill="#185ABD" /><text x="9" y="25.3" fontSize="9" fontFamily="Segoe UI, Arial" fontWeight="700" textAnchor="middle" fill="#fff">W</text></Page></Svg>);
export const FileXls = (p: P) => (<Svg {...p}><Page><path d="M9 14h12M9 17.5h12M9 21h12M15 14v7" stroke="#B9D7B9" strokeWidth="1" /><rect x="3" y="16" width="12" height="12" rx="1.2" fill="#107C41" /><text x="9" y="25.3" fontSize="9" fontFamily="Segoe UI, Arial" fontWeight="700" textAnchor="middle" fill="#fff">X</text></Page></Svg>);
export const FilePpt = (p: P) => (<Svg {...p}><Page><rect x="3" y="16" width="12" height="12" rx="1.2" fill="#C43E1C" /><text x="9" y="25.3" fontSize="9" fontFamily="Segoe UI, Arial" fontWeight="700" textAnchor="middle" fill="#fff">P</text></Page></Svg>);
export const FileImage = (p: P) => (<Svg {...p}><rect x="3" y="6" width="26" height="20" rx="2" fill="#fff" stroke="#8F8F8F" strokeWidth=".9" /><path d="M5 23l7-8 5 5.5 3-3 7 5.5z" fill="#4CAF50" /><circle cx="22" cy="12" r="2.5" fill="#FFB300" /></Svg>);
export const FileVideo = (p: P) => (<Svg {...p}><rect x="3" y="7" width="26" height="18" rx="2" fill="#3C3C3C" stroke="#222" strokeWidth=".9" /><rect x="3" y="7" width="26" height="18" rx="2" fill="none" /><path d="M13 12v8l7-4z" fill="#fff" /><path d="M6 9h1.5v2H6zM6 13h1.5v2H6zM6 17h1.5v2H6zM6 21h1.5v2H6zM24.5 9H26v2h-1.5zM24.5 13H26v2h-1.5zM24.5 17H26v2h-1.5zM24.5 21H26v2h-1.5z" fill="#9E9E9E" /></Svg>);
export const FileAudio = (p: P) => (<Svg {...p}><Page><path d="M12.5 23V13l8-2v9" stroke="#3A6DB0" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /><circle cx="10.5" cy="23.5" r="2.3" fill="#3A6DB0" /><circle cx="18.5" cy="21" r="2.3" fill="#3A6DB0" /></Page></Svg>);
export const FileZip = (p: P) => (<Svg {...p}><path d="M2 8.5A2.5 2.5 0 0 1 4.5 6h7.2a2.5 2.5 0 0 1 1.8.8L15 8.5h12.5A2.5 2.5 0 0 1 30 11v13.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#E8B33B" /><path d="M2 12h28v12.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 24.5z" fill="#FFD25A" /><path d="M14.5 12h3v2h-3zM14.5 15h3v2h-3zM14.5 18h3v2h-3zM14.5 21h3v2h-3zM14 24h4v3h-4z" fill="#8D6E2F" /></Svg>);
export const FileExe = (p: P) => (<Svg {...p}><rect x="4" y="6" width="24" height="20" rx="2" fill="#F3F3F3" stroke="#7A7A7A" strokeWidth=".8" /><rect x="4" y="6" width="24" height="5" rx="2" fill="#5B7FB4" /><rect x="7" y="14" width="18" height="2" fill="#C0C0C0" /><rect x="7" y="18" width="12" height="2" fill="#C0C0C0" /></Svg>);
export const FileSys = (p: P) => (<Svg {...p}><Page><circle cx="15" cy="20" r="4.5" fill="none" stroke="#6E7C8C" strokeWidth="1.5" /><circle cx="15" cy="20" r="1.5" fill="#6E7C8C" /><path d="M15 13v2M15 25v2M8 20h2M20 20h2M10 15l1.4 1.4M18.6 23.6L20 25M10 25l1.4-1.4M18.6 16.4L20 15" stroke="#6E7C8C" strokeWidth="1.5" strokeLinecap="round" /></Page></Svg>);
export const FileHtml = (p: P) => (<Svg {...p}><Page><g transform="translate(9 13) scale(.29)"><circle cx="24" cy="24" r="22" fill="#fff" /><path d="M24 2a22 22 0 0 1 19.05 11H24a11 11 0 0 0-9.53 5.5L7.3 7.06A21.95 21.95 0 0 1 24 2z" fill="#DB4437" /><path d="M45.4 16.4A22 22 0 0 1 24 46l10.5-18.2a11 11 0 0 0 .1-10.8h10.8z" fill="#FFCD40" /><path d="M14.47 18.5A11 11 0 0 0 24 35l-6.4 11.1A22 22 0 0 1 7.3 7.06z" fill="#0F9D58" /><circle cx="24" cy="24" r="11" fill="#fff" /><circle cx="24" cy="24" r="8.8" fill="#4285F4" /></g></Page></Svg>);
export const FileLnk = ({ children, ...p }: P & { children?: React.ReactNode }) => (<Svg {...p}>{children ?? <Page />}<rect x="3" y="21" width="9" height="9" rx="1" fill="#fff" stroke="#7A7A7A" strokeWidth=".8" /><path d="M5.5 27.5L9.5 23.5M6.5 23.5h3v3" stroke="#2E5BB0" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>);
export const FileIni = (p: P) => (<Svg {...p}><Page><circle cx="15" cy="20" r="4.5" fill="none" stroke="#6E7C8C" strokeWidth="1.5" /><circle cx="15" cy="20" r="1.5" fill="#6E7C8C" /></Page></Svg>);
export const FileUrl = (p: P) => (<Svg {...p}><Page><circle cx="15" cy="20" r="5" fill="none" stroke="#3A8FE0" strokeWidth="1.3" /><path d="M10 20h10M15 15c2.5 2.5 2.5 7.5 0 10M15 15c-2.5 2.5-2.5 7.5 0 10" stroke="#3A8FE0" strokeWidth="1" fill="none" /></Page></Svg>);
export const FileHeic = (p: P) => (<Svg {...p}><rect x="3" y="6" width="26" height="20" rx="2" fill="#fff" stroke="#8F8F8F" strokeWidth=".9" /><path d="M5 23l7-8 5 5.5 3-3 7 5.5z" fill="#4CAF50" /><circle cx="22" cy="12" r="2.5" fill="#FFB300" /></Svg>);

const EXT_ICON: Record<string, (p: P) => React.ReactElement> = {
  txt: FileTxt, log: FileTxt, md: FileTxt, srt: FileTxt, rtf: FileDoc, odt: FileDoc,
  pdf: FilePdf,
  doc: FileDoc, docx: FileDoc, dotx: FileDoc,
  xls: FileXls, xlsx: FileXls, csv: FileXls,
  ppt: FilePpt, pptx: FilePpt,
  jpg: FileImage, jpeg: FileImage, png: FileImage, gif: FileImage, bmp: FileImage, webp: FileImage, svg: FileImage, heic: FileHeic, tif: FileImage,
  mp4: FileVideo, mkv: FileVideo, mov: FileVideo, avi: FileVideo, webm: FileVideo, wmv: FileVideo,
  mp3: FileAudio, m4a: FileAudio, wav: FileAudio, flac: FileAudio, aac: FileAudio,
  zip: FileZip, rar: FileZip, "7z": FileZip, gz: FileZip,
  exe: FileExe, msi: FileExe, com: FileExe, bat: FileExe, jar: FileExe,
  dll: FileSys, sys: FileSys, dat: FileSys, bin: FileSys, pak: FileSys, db: FileSys, blf: FileSys, pf: FileSys, msc: FileSys, cat: FileSys, mui: FileSys, prx: FileSys,
  ini: FileIni, xml: FileIni, json: FileIni, cfg: FileIni, vdf: FileIni, manifest: FileIni, itl: FileIni, ics: FileIni, eml: FileIni, rdp: FileIni, crdownload: FileGeneric, tmp: FileGeneric,
  html: FileHtml, htm: FileHtml,
  url: FileUrl,
  lnk: FileLnk,
  ttf: FileGeneric, ttc: FileGeneric, fon: FileGeneric, otf: FileGeneric,
};

export function FileTypeIcon({ ext, dir, name, size = 16 }: { ext: string; dir?: boolean; name?: string; size?: number }) {
  if (dir) return <FolderIcon size={size} />;
  if (ext === "lnk") {
    const n = (name ?? "").toLowerCase();
    if (n.includes("chrome")) return <FileLnk size={size}><g transform="translate(4 2) scale(.55)"><ChromeIconInner /></g></FileLnk>;
    if (n.includes("whatsapp")) return <FileLnk size={size}><g transform="translate(4 2) scale(.55)"><WhatsAppInner /></g></FileLnk>;
    if (n.includes("desktop") || n.includes("downloads")) return <FileLnk size={size}><FolderIcon size={32} /></FileLnk>;
    return <FileLnk size={size}><FileExe size={32} /></FileLnk>;
  }
  const C = EXT_ICON[ext] ?? FileGeneric;
  return <C size={size} />;
}

const ChromeIconInner = () => (<g transform="scale(.667)"><circle cx="24" cy="24" r="22" fill="#fff" /><path d="M24 2a22 22 0 0 1 19.05 11H24a11 11 0 0 0-9.53 5.5L7.3 7.06A21.95 21.95 0 0 1 24 2z" fill="#DB4437" /><path d="M45.4 16.4A22 22 0 0 1 24 46l10.5-18.2a11 11 0 0 0 .1-10.8h10.8z" fill="#FFCD40" /><path d="M14.47 18.5A11 11 0 0 0 24 35l-6.4 11.1A22 22 0 0 1 7.3 7.06z" fill="#0F9D58" /><circle cx="24" cy="24" r="11" fill="#fff" /><circle cx="24" cy="24" r="8.8" fill="#4285F4" /></g>);
const WhatsAppInner = () => (<g transform="scale(.667)"><rect width="48" height="48" rx="11" fill="#25D366" /><path d="M24 9.5A14.5 14.5 0 0 0 11.6 31.6L9.5 38.5l7.1-2A14.5 14.5 0 1 0 24 9.5z" fill="#fff" /><path d="M24 12a12 12 0 0 0-10.3 18.2l.3.5-1.3 4.5 4.6-1.2.5.3A12 12 0 1 0 24 12z" fill="#25D366" /></g>);

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
