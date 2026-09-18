// Generates content/filesystem/dressing.json: hundreds of plausible, unopenable
// files across a used Windows profile. Deterministic for a given seed so the
// output is stable and can be hand-edited afterwards.
import fs from "node:fs";
import path from "node:path";

const SEED = Number(process.argv[2] ?? 4171);
let s = SEED >>> 0;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p) => rnd() < p;
const pad = (n, w = 2) => String(n).padStart(w, "0");

// Dates: cluster activity into "eras" so timestamps look like a real machine.
// Nothing on this machine is dated after the "current day" of the story.
const NOW = Date.UTC(2026, 8, 16, 23, 30);
function dateBetween(y0, y1) {
  const t0 = Math.min(Date.UTC(y0, 0, 1), NOW - 86400000), t1 = Math.min(Date.UTC(y1, 11, 31), NOW);
  const d = new Date(t0 + rnd() * (t1 - t0));
  // Skew to waking hours, local-ish
  d.setUTCHours(int(7, 23), int(0, 59), int(0, 59), 0);
  return d;
}
const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
function createdModified(y0, y1) {
  const c = dateBetween(y0, y1);
  // modified is usually the same or later; sometimes earlier (copied file keeps mtime)
  let m = new Date(c);
  if (chance(0.55)) m = new Date(c.getTime() + rnd() * 1000 * 3600 * 24 * int(0, 400));
  if (m.getTime() > NOW) m = new Date(NOW - rnd() * 1000 * 3600 * 24 * int(1, 40));
  if (chance(0.12)) m = new Date(c.getTime() - rnd() * 1000 * 3600 * 24 * int(1, 900));
  return { created: iso(c), modified: iso(m) };
}
const kb = (lo, hi) => int(lo * 1024, hi * 1024);
const mb = (lo, hi) => int(lo * 1024 * 1024, hi * 1024 * 1024);

const entries = [];
const folders = new Set();
function add(p, size, years, extra = {}) {
  const { created, modified } = createdModified(years[0], years[1]);
  entries.push({ path: p, size, created, modified, ...extra });
}
function folder(p, years = [2019, 2024], extra = {}) {
  const { created, modified } = createdModified(years[0], years[1]);
  folders.add(p);
  entries.push({ path: p, dir: true, created, modified, ...extra });
}

const U = "C:/Users/{user}";

// ---------- Desktop ----------
folder(`${U}/Desktop`, [2021, 2021]);
add(`${U}/Desktop/Google Chrome.lnk`, 2300, [2021, 2022]);
add(`${U}/Desktop/New folder`, 0, [2023, 2024], { dir: true });
add(`${U}/Desktop/stuff to print.txt`, 412, [2024, 2025], { dressing: true });
add(`${U}/Desktop/IMG_4471.HEIC`, mb(1, 4), [2024, 2025]);
add(`${U}/Desktop/Untitled document.docx`, kb(11, 14), [2025, 2025]);
add(`${U}/Desktop/WhatsApp.lnk`, 1800, [2023, 2023]);
add(`${U}/Desktop/passport scan (2).pdf`, kb(800, 2400), [2022, 2023]);
add(`${U}/Desktop/desktop.ini`, 282, [2021, 2021], { hidden: true, system: true });

// ---------- Documents ----------
folder(`${U}/Documents`, [2021, 2021]);
add(`${U}/Documents/desktop.ini`, 402, [2021, 2021], { hidden: true, system: true });
folder(`${U}/Documents/Taxes`, [2022, 2022]);
for (const y of [2021, 2022, 2023, 2024, 2025]) {
  folder(`${U}/Documents/Taxes/${y}`, [y + 1, y + 1]);
  add(`${U}/Documents/Taxes/${y}/W-2 ${y}.pdf`, kb(90, 260), [y + 1, y + 1]);
  if (chance(0.7)) add(`${U}/Documents/Taxes/${y}/1099-INT ${y}${chance(0.3) ? " (1)" : ""}.pdf`, kb(40, 120), [y + 1, y + 1]);
  if (chance(0.5)) add(`${U}/Documents/Taxes/${y}/turbotax ${y}.tax${y}`, kb(200, 900), [y + 1, y + 1]);
  if (chance(0.6)) add(`${U}/Documents/Taxes/${y}/receipts.xlsx`, kb(14, 60), [y, y + 1]);
}
folder(`${U}/Documents/Resume`, [2019, 2019]);
for (const n of ["resume.docx", "resume_v2.docx", "resume_v3_FINAL.docx", "resume_v3_FINAL (1).docx", "Resume 2023.pdf", "cover letter template.docx", "cover_letter_generic.docx", "references.docx"])
  add(`${U}/Documents/Resume/${n}`, kb(18, 140), [2019, 2024]);
folder(`${U}/Documents/Recipes`, [2020, 2020]);
for (const n of ["banana bread.txt", "moms chili.docx", "Instant pot rice.txt", "sourdough schedule.xlsx", "pasta bake (from Jen).pdf", "smoothie stuff.txt", "thanksgiving 2022 plan.docx", "ratios.txt"])
  add(`${U}/Documents/Recipes/${n}`, kb(1, 80), [2020, 2024]);
folder(`${U}/Documents/Scans`, [2021, 2021]);
for (let i = 1; i <= 14; i++) add(`${U}/Documents/Scans/scan${pad(i, 4)}.pdf`, kb(300, 4200), [2021, 2025]);
add(`${U}/Documents/Scans/scan0007 (copy).pdf`, kb(300, 4200), [2023, 2023]);
folder(`${U}/Documents/Old Laptop`, [2021, 2021]);
folder(`${U}/Documents/Old Laptop/Downloads`, [2021, 2021]);
folder(`${U}/Documents/Old Laptop/school`, [2021, 2021]);
for (const n of ["essay draft 2.doc", "bio notes.doc", "presentation final.ppt", "group project.zip", "lab report 3.docx", "citations.txt", "syllabus.pdf", "Untitled.odt", "stats hw4.xlsx", "stats hw5.xlsx", "stats hw6 (autosaved).xlsx"])
  add(`${U}/Documents/Old Laptop/school/${n}`, kb(9, 3000), [2014, 2017]);
for (const n of ["Firefox Setup 52.0.exe", "spotify_installer.exe", "photo.jpg", "photo (1).jpg", "IMG_0033.JPG", "Skype-8.10.0.exe", "utorrent.exe", "minecraft.jar", "song.mp3", "ticket.pdf"])
  add(`${U}/Documents/Old Laptop/Downloads/${n}`, kb(30, 90000), [2014, 2018]);
add(`${U}/Documents/Old Laptop/thumbs.db`, kb(30, 200), [2016, 2016], { hidden: true, system: true });
folder(`${U}/Documents/Apartment`, [2022, 2022]);
for (const n of ["lease 2022-2023.pdf", "lease renewal.pdf", "move in checklist.docx", "renters insurance policy.pdf", "wifi.txt", "landlord contact.txt", "photos of damage.zip"])
  add(`${U}/Documents/Apartment/${n}`, kb(2, 9000), [2022, 2024]);
folder(`${U}/Documents/Car`, [2019, 2019]);
for (const n of ["insurance card.pdf", "registration 2024.pdf", "oil change log.xlsx", "carmax offer.pdf", "title (scan).pdf", "IMG_2210.jpg"])
  add(`${U}/Documents/Car/${n}`, kb(40, 3400), [2019, 2025]);
folder(`${U}/Documents/Medical`, [2020, 2020]);
for (const n of ["insurance summary 2024.pdf", "EOB_03-14-2023.pdf", "EOB_07-02-2023.pdf", "EOB_11-19-2024.pdf", "referral.pdf", "pharmacy receipts.xlsx", "allergy list.txt"])
  add(`${U}/Documents/Medical/${n}`, kb(30, 400), [2020, 2025]);
folder(`${U}/Documents/Custom Office Templates`, [2021, 2021]);
folder(`${U}/Documents/Zoom`, [2020, 2020]);
folder(`${U}/Documents/My Games`, [2022, 2022]);
folder(`${U}/Documents/My Games/Stardew Valley`, [2022, 2022]);
add(`${U}/Documents/My Games/Stardew Valley/SaveGameInfo`, kb(1, 2), [2022, 2023]);
folder(`${U}/Documents/Sound Recordings`, [2022, 2022]);
add(`${U}/Documents/Sound Recordings/Recording.m4a`, kb(200, 3000), [2022, 2022]);
add(`${U}/Documents/Sound Recordings/Recording (2).m4a`, kb(200, 3000), [2023, 2023]);
for (const n of ["budget.xlsx", "budget 2024.xlsx", "budget2025.xlsx", "Book1.xlsx", "Book2.xlsx", "Document1.docx", "grocery list.txt", "passwords.txt.txt", "To do.txt", "notes.txt", "packing list.docx", "wedding gift ideas.docx", "Untitled document (1).docx", "reading list.txt", "Untitled.pdf", "Default.rdp", "Amazon return label.pdf", "gift card codes.txt", "phone numbers.txt"])
  add(`${U}/Documents/${n}`, kb(0.4, 90), [2021, 2026]);

// ---------- Downloads (very messy) ----------
folder(`${U}/Downloads`, [2021, 2021]);
add(`${U}/Downloads/desktop.ini`, 282, [2021, 2021], { hidden: true, system: true });
const dl = [
  ["ChromeSetup.exe", mb(1, 2)], ["ChromeSetup (1).exe", mb(1, 2)], ["ChromeSetup (2).exe", mb(1, 2)],
  ["WhatsAppSetup.exe", mb(120, 160)], ["Discord Setup.exe", mb(90, 110)], ["SpotifySetup.exe", kb(1600, 2400)],
  ["vlc-3.0.20-win64.exe", mb(40, 45)], ["7z2301-x64.exe", kb(1500, 1700)], ["npp.8.6.2.Installer.x64.exe", mb(4, 5)],
  ["zoomInstallerFull.exe", mb(60, 80)], ["Steam setup.exe", kb(2000, 2400)], ["EpicInstaller-15.17.1.msi", mb(150, 180)],
  ["HP Smart Setup.exe", mb(20, 30)], ["printer driver.exe", mb(80, 200)], ["Canon_IJ_Setup.exe", mb(20, 40)],
  ["invoice_8823.pdf", kb(40, 180)], ["invoice_8823 (1).pdf", kb(40, 180)], ["Invoice-INV0042.pdf", kb(40, 180)],
  ["receipt.pdf", kb(30, 90)], ["receipt (1).pdf", kb(30, 90)], ["receipt (2).pdf", kb(30, 90)], ["Receipt_2024-06-11.pdf", kb(30, 90)],
  ["boarding pass.pdf", kb(120, 400)], ["boardingpass_DL1187.pdf", kb(120, 400)], ["e-ticket.pdf", kb(120, 400)], ["itinerary.pdf", kb(100, 300)],
  ["hotel confirmation.pdf", kb(60, 200)], ["Airbnb receipt.pdf", kb(60, 200)],
  ["bank statement.pdf", kb(200, 600)], ["statement_2024_03.pdf", kb(200, 600)], ["statement_2024_04.pdf", kb(200, 600)], ["statement_2024_05.pdf", kb(200, 600)], ["eStatement (4).pdf", kb(200, 600)],
  ["paystub.pdf", kb(50, 120)], ["paystub (1).pdf", kb(50, 120)], ["paystub (2).pdf", kb(50, 120)],
  ["image.png", kb(100, 2000)], ["image (1).png", kb(100, 2000)], ["image (2).png", kb(100, 2000)], ["image (3).png", kb(100, 2000)],
  ["unnamed.jpg", kb(60, 700)], ["unnamed (1).jpg", kb(60, 700)], ["download.jpg", kb(60, 700)], ["download (1).jpg", kb(60, 700)], ["download.jpeg", kb(60, 700)],
  ["IMG_20230812_142233.jpg", mb(2, 5)], ["IMG_20230812_142240.jpg", mb(2, 5)], ["20240102_183355.jpg", mb(2, 5)],
  ["PXL_20240915_201144382.jpg", mb(2, 5)], ["PXL_20240915_201150011.MP.jpg", mb(2, 5)],
  ["meme.gif", kb(800, 4000)], ["giphy.gif", kb(800, 4000)], ["video-1699382744.mp4", mb(4, 30)], ["VID_20231107_193112.mp4", mb(20, 120)],
  ["Screenshot 2024-11-03 213311.png", kb(100, 900)], ["Screenshot 2025-01-22 094502.png", kb(100, 900)],
  ["form.pdf", kb(100, 400)], ["form (1).pdf", kb(100, 400)], ["W9.pdf", kb(100, 200)], ["fw9.pdf", kb(100, 200)], ["i9.pdf", kb(200, 500)],
  ["Untitled spreadsheet.xlsx", kb(6, 12)], ["export.csv", kb(2, 400)], ["export (1).csv", kb(2, 400)], ["data.csv", kb(2, 400)],
  ["Order confirmation.eml", kb(20, 70)], ["Ticket_49281.pdf", kb(100, 300)], ["Membership card.pdf", kb(100, 300)],
  ["manual.pdf", mb(2, 14)], ["user_manual_en.pdf", mb(2, 14)], ["quick start guide.pdf", kb(300, 2000)],
  ["font.zip", kb(100, 600)], ["Fonts.zip", kb(100, 600)], ["photos.zip", mb(30, 600)], ["backup.zip", mb(100, 900)], ["archive (1).zip", mb(1, 40)],
  ["Untitled.png", kb(20, 300)], ["Untitled (1).png", kb(20, 300)], ["logo.svg", kb(4, 40)], ["headshot.jpg", kb(400, 3000)], ["headshot edited.jpg", kb(400, 3000)],
  ["song.mp3", mb(3, 9)], ["ringtone.mp3", kb(100, 500)], ["Voice 001.m4a", kb(200, 3000)],
  ["Movie.mkv", mb(700, 2200)], ["S01E01.mkv", mb(700, 2200)], ["subtitles.srt", kb(30, 90)],
  ["Setup.exe", mb(2, 40)], ["setup (1).exe", mb(2, 40)], ["install.msi", mb(2, 40)], ["update.exe", mb(2, 40)], ["driver.zip", mb(20, 100)],
  ["Adobe Reader.exe", mb(1, 2)], ["readerdc64_en_xa_cra_install.exe", mb(1, 2)], ["Java.exe", mb(50, 80)], ["python-3.11.4-amd64.exe", mb(24, 26)],
  ["shopping list.txt", kb(0.3, 2)], ["New Text Document.txt", 0], ["notes (from phone).txt", kb(0.3, 8)],
  ["chrome_bookmarks_4_13_24.html", kb(20, 200)], ["Bookmarks.html", kb(20, 200)],
  ["Doc1.pdf", kb(50, 400)], ["document.pdf", kb(50, 400)], ["document (1).pdf", kb(50, 400)], ["scan.pdf", kb(400, 3000)],
  ["schedule.xlsx", kb(10, 40)], ["roster.xlsx", kb(10, 40)], ["calendar.ics", kb(1, 4)], ["invite.ics", kb(1, 4)],
  ["tracking.png", kb(20, 200)], ["qr.png", kb(5, 40)], ["qrcode (1).png", kb(5, 40)],
  ["wallpaper.jpg", mb(1, 6)], ["wallpaper (1).jpg", mb(1, 6)], ["4k wallpaper.png", mb(4, 12)],
  ["signed.pdf", kb(100, 500)], ["signed (1).pdf", kb(100, 500)], ["contract.pdf", kb(100, 500)],
  ["cert.pdf", kb(100, 500)], ["certificate.pdf", kb(100, 500)], ["IMG_4471.HEIC", mb(1, 4)],
  ["ChromeSetup.exe.crdownload", kb(300, 900)], ["Unconfirmed 481923.crdownload", mb(2, 40)],
];
for (const [n, size] of dl) add(`${U}/Downloads/${n}`, size, [2021, 2026]);
folder(`${U}/Downloads/Compressed`, [2022, 2022]);
folder(`${U}/Downloads/Programs`, [2022, 2022]);
folder(`${U}/Downloads/photos`, [2023, 2023]);
for (let i = 0; i < 26; i++) add(`${U}/Downloads/photos/IMG_${int(3000, 6999)}.JPG`, mb(2, 6), [2023, 2023]);
folder(`${U}/Downloads/photos (1)`, [2023, 2023]);
for (let i = 0; i < 9; i++) add(`${U}/Downloads/photos (1)/DSC_${pad(int(1, 9999), 4)}.JPG`, mb(4, 9), [2022, 2023]);
folder(`${U}/Downloads/font`, [2024, 2024]);
for (const n of ["OFL.txt", "Inter-Regular.ttf", "Inter-Bold.ttf", "README.md"]) add(`${U}/Downloads/font/${n}`, kb(2, 400), [2024, 2024]);

// ---------- Pictures ----------
folder(`${U}/Pictures`, [2021, 2021]);
add(`${U}/Pictures/desktop.ini`, 504, [2021, 2021], { hidden: true, system: true });
folder(`${U}/Pictures/Camera Roll`, [2021, 2021]);
for (let i = 0; i < 48; i++) {
  const y = int(2021, 2026), m = int(1, 12), d = int(1, 28);
  add(`${U}/Pictures/Camera Roll/WIN_${y}${pad(m)}${pad(d)}_${pad(int(0, 23))}_${pad(int(0, 59))}_${pad(int(0, 59))}_Pro.jpg`, kb(200, 900), [y, y]);
}
folder(`${U}/Pictures/Screenshots`, [2022, 2022]);
for (let i = 0; i < 40; i++) {
  const y = int(2022, 2026), m = int(1, 12), d = int(1, 28);
  add(`${U}/Pictures/Screenshots/Screenshot ${y}-${pad(m)}-${pad(d)} ${pad(int(0, 23))}${pad(int(0, 59))}${pad(int(0, 59))}.png`, kb(60, 2400), [y, y]);
}
for (let i = 1; i <= 7; i++) add(`${U}/Pictures/Screenshots/Screenshot (${i}).png`, kb(60, 2400), [2022, 2024]);
folder(`${U}/Pictures/Saved Pictures`, [2021, 2021]);
for (const n of ["cat.jpg", "cat (1).jpg", "recipe card.png", "inspo.jpg", "inspo2.jpg", "Screenshot_20230311-095512_Instagram.jpg", "FB_IMG_1665439821111.jpg", "FB_IMG_1690038181920.jpg", "image0.jpeg", "image1.jpeg", "image2.jpeg", "birthday.png", "map.png", "directions.png", "haircut ref.jpg"])
  add(`${U}/Pictures/Saved Pictures/${n}`, kb(40, 3000), [2021, 2025]);
folder(`${U}/Pictures/Phone backup`, [2023, 2023]);
folder(`${U}/Pictures/Phone backup/DCIM`, [2023, 2023]);
folder(`${U}/Pictures/Phone backup/DCIM/Camera`, [2023, 2023]);
for (let i = 0; i < 90; i++) {
  const y = int(2019, 2023), m = int(1, 12), d = int(1, 28);
  const ext = chance(0.12) ? "mp4" : "jpg";
  add(`${U}/Pictures/Phone backup/DCIM/Camera/${y}${pad(m)}${pad(d)}_${pad(int(0, 23))}${pad(int(0, 59))}${pad(int(0, 59))}.${ext}`, ext === "mp4" ? mb(10, 200) : mb(2, 6), [y, 2023]);
}
folder(`${U}/Pictures/Phone backup/WhatsApp Images`, [2023, 2023]);
for (let i = 0; i < 30; i++) {
  const y = int(2020, 2023), m = int(1, 12), d = int(1, 28);
  add(`${U}/Pictures/Phone backup/WhatsApp Images/IMG-${y}${pad(m)}${pad(d)}-WA${pad(int(0, 60), 4)}.jpg`, kb(60, 400), [y, 2023]);
}
folder(`${U}/Pictures/2019 Denver`, [2019, 2019]);
for (let i = 0; i < 22; i++) add(`${U}/Pictures/2019 Denver/IMG_${int(6100, 6300)}.JPG`, mb(3, 7), [2019, 2019]);
folder(`${U}/Pictures/Lake house`, [2022, 2022]);
for (let i = 0; i < 17; i++) add(`${U}/Pictures/Lake house/DSC_${pad(int(1, 500), 4)}.JPG`, mb(3, 9), [2022, 2022]);
add(`${U}/Pictures/Lake house/edited`, 0, [2022, 2022], { dir: true });
folder(`${U}/Pictures/Wallpapers`, [2021, 2021]);
for (const n of ["mountains.jpg", "img1.jpg", "windows spotlight.jpg", "wallpaper.jpg", "wallpaper (2).jpg", "3840x2160.jpg"]) add(`${U}/Pictures/Wallpapers/${n}`, mb(1, 7), [2021, 2024]);
folder(`${U}/Pictures/Scanned Documents`, [2021, 2021]);
add(`${U}/Pictures/Scanned Documents/Welcome Scan.jpg`, kb(200, 800), [2021, 2021]);

// ---------- Music / Videos ----------
folder(`${U}/Music`, [2021, 2021]);
add(`${U}/Music/desktop.ini`, 504, [2021, 2021], { hidden: true, system: true });
folder(`${U}/Music/iTunes`, [2021, 2021]);
folder(`${U}/Music/iTunes/iTunes Media`, [2021, 2021]);
folder(`${U}/Music/iTunes/iTunes Media/Music`, [2021, 2021]);
add(`${U}/Music/iTunes/iTunes Library.itl`, kb(200, 3000), [2021, 2023]);
add(`${U}/Music/iTunes/iTunes Music Library.xml`, kb(200, 3000), [2021, 2023]);
folder(`${U}/Music/Old mp3s`, [2021, 2021]);
for (let i = 1; i <= 24; i++) add(`${U}/Music/Old mp3s/Track ${pad(i)}.mp3`, mb(3, 9), [2012, 2016]);
for (const n of ["01 - Intro.mp3", "unknown artist - unknown album - 04.mp3", "AUD-20221104-WA0003.mp3", "voice memo.m4a"]) add(`${U}/Music/${n}`, mb(1, 8), [2016, 2023]);
folder(`${U}/Videos`, [2021, 2021]);
add(`${U}/Videos/desktop.ini`, 504, [2021, 2021], { hidden: true, system: true });
folder(`${U}/Videos/Captures`, [2022, 2022]);
for (let i = 0; i < 6; i++) add(`${U}/Videos/Captures/Stardew Valley ${int(2022, 2024)}-${pad(int(1, 12))}-${pad(int(1, 28))} ${pad(int(10, 23))}-${pad(int(0, 59))}-${pad(int(0, 59))}.mp4`, mb(30, 400), [2022, 2024]);
add(`${U}/Videos/Captures/Desktop 2024.03.02 - 21.14.55.01.mp4`, mb(30, 400), [2024, 2024]);
for (const n of ["VID_20230804_190322.mp4", "birthday 2023.mp4", "wedding (phone).mov", "clip.mp4", "Untitled video.mp4", "Untitled video (1).mp4", "graduation.MOV"]) add(`${U}/Videos/${n}`, mb(20, 900), [2021, 2025]);

// ---------- Other profile folders ----------
for (const f of ["Contacts", "Favorites", "Links", "Saved Games", "Searches", "3D Objects"]) {
  folder(`${U}/${f}`, [2021, 2021]);
  add(`${U}/${f}/desktop.ini`, int(200, 600), [2021, 2021], { hidden: true, system: true });
}
add(`${U}/Favorites/Bing.url`, 200, [2021, 2021]);
add(`${U}/Links/Desktop.lnk`, 500, [2021, 2021]);
add(`${U}/Links/Downloads.lnk`, 900, [2021, 2021]);
folder(`${U}/OneDrive`, [2021, 2021]);
for (const n of ["Documents", "Pictures", "Attachments"]) folder(`${U}/OneDrive/${n}`, [2021, 2021]);
add(`${U}/OneDrive/Getting started with OneDrive.pdf`, kb(1100, 1300), [2021, 2021]);
for (const f of ["NTUSER.DAT", "ntuser.dat.LOG1", "ntuser.dat.LOG2", "ntuser.ini", "NTUSER.DAT{1c3790b4-b8ad-11e8-aa21-e41d2d101530}.TM.blf"]) add(`${U}/${f}`, f.startsWith("NTUSER.DAT") ? mb(4, 30) : kb(1, 300), [2021, 2026], { hidden: true, system: true });
folder(`${U}/AppData`, [2021, 2021], { hidden: true });
for (const f of ["Local", "LocalLow", "Roaming"]) folder(`${U}/AppData/${f}`, [2021, 2021]);
for (const f of ["Google", "Google/Chrome", "Google/Chrome/User Data", "Google/Chrome/User Data/Default", "Microsoft", "Microsoft/Windows", "Microsoft/Windows/Explorer", "Microsoft/Windows/INetCache", "Packages", "Packages/5319275A.WhatsAppDesktop_cv1g1gvanyjgm", "Temp", "Programs", "Discord", "Spotify", "CrashDumps", "D3DSCache", "ConnectedDevicesPlatform", "Comms", "NVIDIA", "Adobe", "Steam", "Zoom"]) folder(`${U}/AppData/Local/${f}`, [2021, 2024]);
for (const n of ["Bookmarks", "Bookmarks.bak", "History", "Cookies", "Login Data", "Preferences", "Web Data", "Favicons", "Top Sites", "Visited Links", "Shortcuts", "Network Action Predictor"]) add(`${U}/AppData/Local/Google/Chrome/User Data/Default/${n}`, kb(20, 40000), [2025, 2026]);
add(`${U}/AppData/Local/Google/Chrome/User Data/Local State`, kb(40, 200), [2026, 2026]);
add(`${U}/AppData/Local/IconCache.db`, mb(1, 30), [2024, 2026], { hidden: true });
for (let i = 0; i < 18; i++) add(`${U}/AppData/Local/Temp/${pick(["tmp", "~DF", "wct", "MSI", "Adobe", "dd_", "chrome_"])}${int(1000, 99999).toString(16).toUpperCase()}.${pick(["tmp", "tmp", "log", "TMP", "txt"])}`, kb(0.1, 4000), [2025, 2026]);
for (const f of ["Microsoft", "Microsoft/Windows", "Microsoft/Windows/Start Menu", "Microsoft/Windows/Recent", "Microsoft/Windows/Themes", "Microsoft/Crypto", "Adobe", "Discord", "Spotify", "Zoom", "Notepad++", "Mozilla", "VLC", "Code", "WhatsApp", ".minecraft"]) folder(`${U}/AppData/Roaming/${f}`, [2021, 2024]);
for (const n of ["config.xml", "session.xml", "shortcuts.xml", "contextMenu.xml", "stylers.xml", "langs.xml"]) add(`${U}/AppData/Roaming/Notepad++/${n}`, kb(2, 300), [2023, 2025]);
add(`${U}/AppData/Roaming/VLC/vlcrc`, kb(80, 110), [2022, 2024]);
add(`${U}/AppData/Roaming/VLC/vlc-qt-interface.ini`, kb(2, 6), [2022, 2026]);
add(`${U}/AppData/Roaming/Microsoft/Windows/Themes/TranscodedWallpaper`, mb(1, 4), [2024, 2024]);
for (let i = 0; i < 20; i++) add(`${U}/AppData/Roaming/Microsoft/Windows/Recent/${pick(["invoice", "resume", "budget", "Screenshot", "IMG_", "scan", "receipt", "notes", "photo", "Untitled"])}${chance(0.5) ? " " + int(1, 99) : ""}.${pick(["pdf", "docx", "xlsx", "png", "jpg", "txt"])}.lnk`, kb(1, 3), [2025, 2026]);
folder(`${U}/AppData/LocalLow/Microsoft`, [2021, 2021]);
folder(`${U}/AppData/LocalLow/Unity`, [2022, 2022]);

// ---------- Public / other users ----------
folder("C:/Users/Public", [2021, 2021]);
for (const f of ["Documents", "Downloads", "Music", "Pictures", "Videos", "Desktop", "Libraries", "AccountPictures", "Roaming"]) folder(`C:/Users/Public/${f}`, [2021, 2021]);
add("C:/Users/Public/desktop.ini", 174, [2021, 2021], { hidden: true, system: true });
folder("C:/Users/Default", [2021, 2021], { hidden: true });
folder("C:/Users/All Users", [2021, 2021], { hidden: true, system: true });
add("C:/Users/desktop.ini", 174, [2021, 2021], { hidden: true, system: true });

// ---------- Program Files ----------
folder("C:/Program Files", [2021, 2021]);
const pf = {
  "7-Zip": ["7z.dll", "7z.exe", "7zFM.exe", "7zG.exe", "7-zip.dll", "7-zip.chm", "History.txt", "License.txt", "readme.txt", "Uninstall.exe", "descript.ion"],
  "Google/Chrome/Application": ["chrome.exe", "chrome_proxy.exe", "chrome.VisualElementsManifest.xml", "master_preferences"],
  "Google/Chrome/Application/140.0.7339.128": ["chrome.dll", "chrome_elf.dll", "d3dcompiler_47.dll", "dxcompiler.dll", "icudtl.dat", "libEGL.dll", "libGLESv2.dll", "resources.pak", "chrome_100_percent.pak", "chrome_200_percent.pak", "v8_context_snapshot.bin", "vk_swiftshader.dll", "vulkan-1.dll", "notification_helper.exe", "elevation_service.exe", "chrome_pwa_launcher.exe", "chrome_wer.dll", "mojo_core.dll", "snapshot_blob.bin"],
  "VideoLAN/VLC": ["vlc.exe", "vlc-cache-gen.exe", "libvlc.dll", "libvlccore.dll", "uninstall.exe", "AUTHORS.txt", "COPYING.txt", "NEWS.txt", "README.txt", "THANKS.txt", "axvlc.dll", "npvlc.dll"],
  "Notepad++": ["notepad++.exe", "SciLexer.dll", "change.log", "license.txt", "readme.txt", "uninstall.exe", "config.model.xml", "langs.model.xml", "stylers.model.xml", "shortcuts.xml", "contextMenu.xml", "doLocalConf.xml", "NppShell.dll"],
  "Common Files": [], "Common Files/microsoft shared": [], "Common Files/System": [], "Common Files/Adobe": [],
  "Microsoft Update Health Tools": ["uhssvc.exe", "MicrosoftUpdateHealthTools.exe"],
  "Windows Defender": ["MsMpEng.exe", "MpCmdRun.exe", "MSASCui.exe", "ConfigSecurityPolicy.exe", "NisSrv.exe"],
  "Windows Mail": [], "Windows Media Player": ["wmplayer.exe", "wmpnscfg.exe", "wmpshare.exe", "setup_wm.exe"], "Windows NT": [], "Windows NT/Accessories": ["wordpad.exe"], "Windows Photo Viewer": ["PhotoViewer.dll", "ImagingDevices.exe"],
  "WindowsApps": [], "WindowsPowerShell": [], "ModifiableWindowsApps": [], "Internet Explorer": ["iexplore.exe", "ieinstal.exe", "ielowutil.exe", "ExtExport.exe"], "MSBuild": [], "dotnet": ["dotnet.exe", "LICENSE.txt", "ThirdPartyNotices.txt"],
  "Zoom": [], "Zoom/bin": ["Zoom.exe", "Installer.exe", "zTscoder.exe", "zCrashReport.exe", "CptHost.exe", "airhost.exe", "aomhost64.exe", "zVideoApp.exe"],
  "Adobe": [], "Adobe/Acrobat DC": [], "Adobe/Acrobat DC/Acrobat": ["Acrobat.exe", "AcroBroker.exe", "AcroCEF", "Eula.exe"],
  "Intel": [], "NVIDIA Corporation": [], "Realtek": [], "HP": [], "HP/HP Smart": ["HPSmart.exe", "HP.Smart.dll", "hpsmartDeviceAgent.exe"],
  "Mozilla Firefox": ["firefox.exe", "crashreporter.exe", "updater.exe", "xul.dll", "nss3.dll", "mozglue.dll", "omni.ja", "platform.ini", "application.ini"],
};
for (const [dir, files] of Object.entries(pf)) {
  folder(`C:/Program Files/${dir}`, [2021, 2025]);
  for (const f of files) add(`C:/Program Files/${dir}/${f}`, f.endsWith(".txt") || f.endsWith(".xml") || f.endsWith(".ini") ? kb(1, 200) : f.endsWith(".dll") ? kb(100, 15000) : mb(0.3, 200), [2021, 2026]);
}
add("C:/Program Files/desktop.ini", 174, [2021, 2021], { hidden: true, system: true });
folder("C:/Program Files (x86)", [2021, 2021]);
for (const f of ["Common Files", "Common Files/Adobe", "Google", "Google/Update", "Internet Explorer", "Microsoft", "Microsoft/Edge", "Microsoft/EdgeUpdate", "Microsoft/EdgeWebView", "Microsoft/Temp", "Microsoft.NET", "MSBuild", "Reference Assemblies", "Windows Defender", "Windows Mail", "Windows Media Player", "Windows NT", "Windows Photo Viewer", "WindowsPowerShell", "Steam", "Steam/steamapps", "Steam/steamapps/common", "Steam/steamapps/common/Stardew Valley", "Epic Games", "Epic Games/Launcher", "Intel", "Discord Inc", "Spotify", "Mozilla Maintenance Service", "Java"]) folder(`C:/Program Files (x86)/${f}`, [2021, 2025]);
for (const f of ["steam.exe", "steam.dll", "steamclient.dll", "tier0_s.dll", "vstdlib_s.dll", "GameOverlayUI.exe", "steamerrorreporter.exe", "uninstall.exe", "Steam.log", "config", "logs", "userdata", "bin", "package"]) add(`C:/Program Files (x86)/Steam/${f}`, f.includes(".") ? mb(0.2, 60) : 0, [2022, 2026], f.includes(".") ? {} : { dir: true });
add("C:/Program Files (x86)/desktop.ini", 174, [2021, 2021], { hidden: true, system: true });

// ---------- Windows (partial) ----------
folder("C:/Windows", [2021, 2021]);
for (const f of ["System32", "SysWOW64", "Fonts", "Logs", "Temp", "WinSxS", "assembly", "Boot", "Cursors", "debug", "diagnostics", "Help", "IME", "INF", "Installer", "L2Schemas", "LiveKernelReports", "Media", "Microsoft.NET", "Minidump", "Panther", "Performance", "PolicyDefinitions", "Prefetch", "Provisioning", "Registration", "rescache", "Resources", "SchCache", "schemas", "security", "ServiceProfiles", "ServiceState", "servicing", "Setup", "ShellComponents", "ShellExperiences", "SoftwareDistribution", "Speech", "Speech_OneCore", "System", "SystemApps", "SystemResources", "SystemTemp", "TAPI", "Tasks", "tracing", "twain_32", "Vss", "Web", "WaaS", "appcompat", "apppatch", "AppReadiness", "bcastdvr", "BitLockerDiscoveryVolumeContents", "Branding", "CbsTemp", "Containers", "CSC", "DiagTrack", "DigitalLocker", "Downloaded Program Files", "en-US", "GameBarPresenceWriter", "Globalization", "ImmersiveControlPanel", "InputMethod", "Migration", "ModemLogs", "OCR", "Offline Web Pages", "PrintDialog", "PCHEALTH", "PLA", "TextInput", "UUS", "Vss/Writers"]) folder(`C:/Windows/${f}`, [2021, 2025]);
for (const f of ["explorer.exe", "notepad.exe", "regedit.exe", "win.ini", "system.ini", "WindowsUpdate.log", "bootstat.dat", "DtcInstall.log", "HelpPane.exe", "hh.exe", "lsasetup.log", "mib.bin", "PFRO.log", "Professional.xml", "setupact.log", "setuperr.log", "splwow64.exe", "twain_32.dll", "WMSysPr9.prx", "write.exe", "winhlp32.exe", "bfsvc.exe", "diagerr.xml", "diagwrn.xml", "DPINST.LOG", "mib.bin", "regedit.exe", "WindowsShell.Manifest"])
  add(`C:/Windows/${f}`, f.endsWith(".log") || f.endsWith(".ini") || f.endsWith(".xml") ? kb(0.2, 3000) : kb(30, 6000), [2021, 2026]);
const sys32 = ["cmd.exe", "calc.exe", "mspaint.exe", "notepad.exe", "taskmgr.exe", "control.exe", "conhost.exe", "csrss.exe", "dwm.exe", "explorer.exe", "lsass.exe", "mmc.exe", "msconfig.exe", "mstsc.exe", "ntoskrnl.exe", "rundll32.exe", "services.exe", "svchost.exe", "winlogon.exe", "wininit.exe", "WindowsPowerShell", "drivers", "config", "catroot", "catroot2", "CodeIntegrity", "DriverStore", "en-US", "LogFiles", "Microsoft", "oobe", "Recovery", "Speech", "spool", "Tasks", "wbem", "WinBioDatabase", "WinBioPlugIns", "winevt", "WindowsPowerShell", "AdvancedInstallers", "AppLocker", "BestPractices", "Boot", "Bthprops", "Com", "Configuration", "Dism", "DiagSvcs", "IME", "InputMethod", "LogFiles", "migration", "MRT", "MUI", "NDF", "networklist", "NetworkList", "Printing_Admin_Scripts", "ras", "Setup", "ShellExperiences", "SleepStudy", "SMI", "sppui", "Sysprep", "SystemResetPlatform", "Tasks_Migrated", "wfp", "WirelessDisplay", "XPSViewer", "zh-CN", "ntdll.dll", "kernel32.dll", "kernelbase.dll", "user32.dll", "gdi32.dll", "advapi32.dll", "shell32.dll", "ole32.dll", "comctl32.dll", "comdlg32.dll", "msvcrt.dll", "ws2_32.dll", "crypt32.dll", "wininet.dll", "urlmon.dll", "d3d11.dll", "dxgi.dll", "opengl32.dll", "msi.dll", "shlwapi.dll", "imm32.dll", "uxtheme.dll", "dwmapi.dll", "winmm.dll", "version.dll", "setupapi.dll", "cfgmgr32.dll", "bcrypt.dll", "ncrypt.dll", "sechost.dll", "rpcrt4.dll", "combase.dll", "ucrtbase.dll", "vcruntime140.dll", "msvcp140.dll", "shellstyle.dll", "twinui.dll", "twinui.pcshell.dll", "SystemSettings.exe", "WWAHost.exe", "SearchIndexer.exe", "SecurityHealthSystray.exe", "OneDriveSetup.exe", "dllhost.exe", "sihost.exe", "smss.exe", "spoolsv.exe", "taskhostw.exe", "RuntimeBroker.exe", "ShellExperienceHost.exe", "StartMenuExperienceHost.exe", "TextInputHost.exe", "ctfmon.exe", "fontdrvhost.exe", "MsMpEng.exe", "wuauclt.exe", "UsoClient.exe", "MoUsoCoreWorker.exe", "WerFault.exe", "werfaultsecure.exe", "wermgr.exe", "WMIC.exe", "ipconfig.exe", "ping.exe", "netstat.exe", "tasklist.exe", "taskkill.exe", "reg.exe", "sc.exe", "net.exe", "net1.exe", "certutil.exe", "cipher.exe", "chkdsk.exe", "diskpart.exe", "format.com", "more.com", "tree.com", "xcopy.exe", "robocopy.exe", "where.exe", "whoami.exe", "hostname.exe", "systeminfo.exe", "msinfo32.exe", "dxdiag.exe", "perfmon.exe", "resmon.exe", "eventvwr.exe", "compmgmt.msc", "devmgmt.msc", "diskmgmt.msc", "services.msc", "gpedit.msc", "secpol.msc", "lusrmgr.msc", "taskschd.msc"];
folder("C:/Windows/System32", [2021, 2021]);
for (const f of sys32) { const isDir = !f.includes("."); if (isDir) folder(`C:/Windows/System32/${f}`, [2021, 2025]); else add(`C:/Windows/System32/${f}`, f.endsWith(".dll") ? kb(20, 9000) : kb(10, 4000), [2021, 2026]); }
for (const f of ["arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf", "ARIALN.TTF", "ariblk.ttf", "bahnschrift.ttf", "calibri.ttf", "calibrib.ttf", "calibrii.ttf", "calibril.ttf", "cambria.ttc", "cambriab.ttf", "Candara.ttf", "comic.ttf", "comicbd.ttf", "consola.ttf", "consolab.ttf", "constan.ttf", "corbel.ttf", "cour.ttf", "courbd.ttf", "ebrima.ttf", "framd.ttf", "Gabriola.ttf", "gadugi.ttf", "georgia.ttf", "georgiab.ttf", "impact.ttf", "Inkfree.ttf", "javatext.ttf", "l_10646.ttf", "lucon.ttf", "malgun.ttf", "marlett.ttf", "micross.ttf", "mmrtext.ttf", "monbaiti.ttf", "msgothic.ttc", "msyh.ttc", "mvboli.ttf", "Nirmala.ttc", "ntailu.ttf", "pala.ttf", "phagspa.ttf", "segoepr.ttf", "segoesc.ttf", "segoeui.ttf", "segoeuib.ttf", "segoeuii.ttf", "segoeuil.ttf", "segoeuisl.ttf", "seguibl.ttf", "seguiemj.ttf", "seguihis.ttf", "seguisb.ttf", "seguisym.ttf", "SegUIVar.ttf", "SegoeIcons.ttf", "simsun.ttc", "sitka.ttc", "sylfaen.ttf", "symbol.ttf", "tahoma.ttf", "tahomabd.ttf", "taile.ttf", "times.ttf", "timesbd.ttf", "trebuc.ttf", "verdana.ttf", "verdanab.ttf", "webdings.ttf", "wingding.ttf", "YuGothR.ttc", "8514fix.fon", "8514oem.fon", "app850.fon", "coure.fon", "dosapp.fon", "modern.fon", "roman.fon", "script.fon", "serife.fon", "smalle.fon", "sserife.fon", "vgafix.fon", "vgaoem.fon", "vgasys.fon"]) add(`C:/Windows/Fonts/${f}`, kb(3, 22000), [2021, 2025]);
for (const f of ["CBS", "DISM", "DPX", "MeasuredBoot", "MoSetup", "NetSetup", "SIH", "waasmedic", "WindowsUpdate", "SystemRestore", "StorGroupPolicy", "WinREAgent"]) folder(`C:/Windows/Logs/${f}`, [2021, 2025]);
for (let i = 0; i < 12; i++) add(`C:/Windows/Logs/CBS/CbsPersist_${int(2023, 2026)}${pad(int(1, 12))}${pad(int(1, 28))}${pad(int(0, 23))}${pad(int(0, 59))}${pad(int(0, 59))}.log`, mb(1, 40), [2023, 2026]);
add("C:/Windows/Logs/CBS/CBS.log", mb(2, 60), [2026, 2026]);
for (let i = 0; i < 20; i++) add(`C:/Windows/Prefetch/${pick(["CHROME", "EXPLORER", "SVCHOST", "NOTEPAD", "WHATSAPP", "DISCORD", "SPOTIFY", "VLC", "TASKMGR", "CMD", "MSEDGE", "STEAM", "SEARCHINDEXER", "RUNTIMEBROKER", "DLLHOST"])}.EXE-${int(0x10000000, 0xffffffff).toString(16).toUpperCase()}.pf`, kb(10, 300), [2026, 2026]);
add("C:/Windows/Prefetch/Layout.ini", kb(500, 3000), [2026, 2026]);
for (const f of ["MDM", "Bluetooth", "Nvidia", "ATI", "Intel", "Realtek"]) folder(`C:/Windows/Temp/${f}`, [2023, 2026]);
for (let i = 0; i < 8; i++) add(`C:/Windows/Temp/${pick(["MpCmdRun", "WinSAT", "dd_vcredist", "setup", "DMI", "tmp"])}${int(100, 99999).toString(16).toUpperCase()}.${pick(["log", "tmp", "txt"])}`, kb(1, 2000), [2025, 2026]);
add("C:/Windows/Temp/silconfig.log", kb(1, 4), [2026, 2026]);

// ---------- Root of C: ----------
for (const f of ["$Recycle.Bin", "$WinREAgent", "Documents and Settings", "ProgramData", "Recovery", "System Volume Information", "Config.Msi", "$SysReset"]) folder(`C:/${f}`, [2021, 2024], { hidden: true, system: true });
for (const f of ["PerfLogs", "Intel", "Users", "OneDriveTemp", "inetpub", "Temp", "Drivers", "HP", "AMD", "NVIDIA"]) if (f !== "Users") folder(`C:/${f}`, [2021, 2024]);
folder("C:/Users", [2021, 2021]);
folder(`${U}`, [2021, 2021]);
for (const f of ["hiberfil.sys", "pagefile.sys", "swapfile.sys", "DumpStack.log.tmp", "DumpStack.log"]) add(`C:/${f}`, f.endsWith(".sys") ? mb(256, 12000) : kb(1, 12), [2026, 2026], { hidden: true, system: true });
add("C:/bootmgr", kb(400, 420), [2021, 2021], { hidden: true, system: true });
add("C:/BOOTNXT", 1, [2021, 2021], { hidden: true, system: true });
add("C:/hp.log", kb(1, 3), [2021, 2021]);
for (const f of ["Microsoft", "Microsoft/Windows", "Microsoft/Windows Defender", "Microsoft/Windows/Start Menu", "Microsoft/Windows/Start Menu/Programs", "Package Cache", "Packages", "USOPrivate", "USOShared", "regid.1991-06.com.microsoft", "ssh", "SoftwareDistribution", "Adobe", "NVIDIA Corporation", "Intel", "HP", "Google", "Epic", "Steam", "VideoLAN", "Zoom"]) folder(`C:/ProgramData/${f}`, [2021, 2025]);
folder("C:/ProgramData/Microsoft/Windows/Start Menu/Programs/Accessories", [2021, 2021]);
for (const n of ["Google Chrome.lnk", "VLC media player.lnk", "7-Zip File Manager.lnk", "Notepad++.lnk", "Steam.lnk", "Zoom.lnk", "Adobe Acrobat.lnk", "Discord Inc.lnk", "Firefox.lnk", "Firefox Private Browsing.lnk"]) add(`C:/ProgramData/Microsoft/Windows/Start Menu/Programs/${n}`, kb(1, 3), [2021, 2025]);

// ---------- Second drive ----------
folder("D:", [2019, 2019]);
folder("D:/Backup", [2019, 2019]);
folder("D:/Backup/Old PC", [2019, 2019]);
folder("D:/Backup/Old PC/Documents", [2019, 2019]);
folder("D:/Backup/Old PC/Pictures", [2019, 2019]);
folder("D:/Backup/Old PC/Desktop", [2019, 2019]);
for (let i = 0; i < 30; i++) add(`D:/Backup/Old PC/Pictures/${pick(["IMG_", "DSC_", "DSCN", "P", "Photo "])}${pad(int(1, 9999), 4)}.JPG`, mb(1, 5), [2012, 2019]);
for (const n of ["old resume.doc", "budget 2018.xls", "letter.doc", "addresses.xls", "Untitled.rtf", "notes.txt", "wedding list.xls", "dads stuff.zip", "misc.zip", "Quicken backup.QDF"]) add(`D:/Backup/Old PC/Documents/${n}`, kb(10, 50000), [2010, 2019]);
for (const n of ["shortcut to Photos.lnk", "todo.txt", "IMG_0001.JPG", "IMG_0002.JPG", "New folder", "New folder (2)"]) add(`D:/Backup/Old PC/Desktop/${n}`, n.includes(".") ? kb(1, 4000) : 0, [2015, 2019], n.includes(".") ? {} : { dir: true });
folder("D:/Backup/Phone", [2021, 2021]);
add("D:/Backup/Phone/backup_2021-08-14.zip", mb(4000, 9000), [2021, 2021]);
add("D:/Backup/Phone/backup_2023-02-02.zip", mb(6000, 14000), [2023, 2023]);
folder("D:/Games", [2022, 2022]);
folder("D:/Games/SteamLibrary", [2022, 2022]);
folder("D:/Games/SteamLibrary/steamapps", [2022, 2022]);
folder("D:/Games/SteamLibrary/steamapps/common", [2022, 2022]);
for (const g of ["Stardew Valley", "Slay the Spire", "The Sims 4", "Baldurs Gate 3", "Valheim", "Cities Skylines"]) folder(`D:/Games/SteamLibrary/steamapps/common/${g}`, [2022, 2025]);
add("D:/Games/SteamLibrary/libraryfolder.vdf", 200, [2022, 2022]);
add("D:/Games/SteamLibrary/steamapps/libraryfolders.vdf", kb(1, 2), [2022, 2025]);
folder("D:/Movies", [2020, 2020]);
for (const n of ["Movie (2019) 1080p.mkv", "Movie.2021.WEB-DL.mkv", "home video.mp4", "concert 2018.mp4", "wedding_final.mp4", "wedding_final (1).mp4"]) add(`D:/Movies/${n}`, mb(700, 4200), [2019, 2023]);
folder("D:/$RECYCLE.BIN", [2019, 2019], { hidden: true, system: true });
folder("D:/System Volume Information", [2019, 2019], { hidden: true, system: true });

const out = { _comment: "GENERATED PLACEHOLDER DRESSING. Regenerate with `npm run generate:dressing [seed]` or hand-edit. Every entry here is unopenable window dressing unless a story file in story.json overrides the same path.", seed: SEED, entries };
const outPath = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "content", "filesystem", "dressing.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`wrote ${entries.length} entries (${entries.filter((e) => !e.dir).length} files, ${entries.filter((e) => e.dir).length} folders) to ${outPath}`);
