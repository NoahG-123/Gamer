// Pulls only the icons the UI references out of the installed Iconify collections
// (logos, flat-color-icons, vscode-icons, fluent-emoji-flat) into one small JSON so
// the client bundle doesn't ship thousands of unused icons. Re-run after editing NEEDED.
import fs from "node:fs";
import { createRequire } from "node:module";
import { getIconData } from "@iconify/utils";
const require = createRequire(import.meta.url);

const NEEDED = {
  logos: ["chrome", "whatsapp-icon", "spotify-icon", "microsoft-edge", "discord-icon", "steam", "zoom-icon", "firefox", "microsoft-windows-icon", "microsoft-onedrive", "microsoft-icon", "google-gmail", "google-maps", "youtube-icon", "reddit-icon", "telegram", "python", "visual-studio-code", "claude-icon", "adobe-icon", "google-icon", "microsoft-teams", "github-icon"],
  "flat-color-icons": ["folder", "opened-folder", "document", "image-file", "video-file", "audio-file", "file", "download", "home", "gallery", "music", "picture", "settings", "calculator", "clock", "calendar", "camera", "globe", "full-trash", "empty-trash", "vlc", "steam", "google", "wikipedia", "reddit", "display", "smartphone-tablet", "data-backup", "filing-cabinet", "phone", "print", "link", "sms", "contacts", "wi-fi-logo", "portrait-mode", "manager", "businesswoman"],
  "vscode-icons": ["default-folder", "default-folder-opened", "file-type-pdf2", "file-type-word", "file-type-excel", "file-type-powerpoint", "file-type-text", "file-type-image", "file-type-video", "file-type-audio", "file-type-zip", "file-type-binary", "file-type-html", "file-type-config", "file-type-ini", "file-type-log", "file-type-font", "file-type-db", "file-type-xml", "file-type-json", "file-type-markdown", "file-type-sql", "file-type-photoshop", "folder-type-windows"],
  "fluent-emoji-flat": ["sun-behind-cloud", "cloud", "sun", "cloud-with-rain", "fog", "cloud-with-lightning", "cloud-with-lightning-and-rain", "cloud-with-snow", "wastebasket", "laptop", "desktop-computer", "file-folder", "open-file-folder", "page-facing-up"],
};

const out = {};
for (const [set, names] of Object.entries(NEEDED)) {
  const json = require(`@iconify-json/${set}/icons.json`);
  for (const n of names) {
    const data = getIconData(json, n);
    if (!data) { console.warn(`missing ${set}:${n}`); continue; }
    out[`${set}:${n}`] = { body: data.body, width: data.width ?? json.width ?? 24, height: data.height ?? json.height ?? 24 };
  }
}
fs.writeFileSync("web/lib/icons/iconify-data.json", JSON.stringify(out));
console.log("extracted", Object.keys(out).length, "icons");
