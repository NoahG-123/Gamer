// Renders a Windows 11 "Bloom"-style dark wallpaper (flowing ribbon on navy) to a JPEG using headless Chromium.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const W = 2560, H = 1440;
const out = path.resolve("web/public/wallpaper/bloom-dark.jpg");
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="42%" cy="50%" r="80%">
      <stop offset="0" stop-color="#0b1a3a"/><stop offset=".5" stop-color="#060f26"/><stop offset="1" stop-color="#02050f"/>
    </radialGradient>
    <linearGradient id="l1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1d4ed8" stop-opacity="0"/><stop offset=".25" stop-color="#3b82f6"/><stop offset=".6" stop-color="#7dd3fc"/><stop offset=".85" stop-color="#2563eb"/><stop offset="1" stop-color="#1e3a8a" stop-opacity="0"/></linearGradient>
    <linearGradient id="l2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0ea5e9" stop-opacity="0"/><stop offset=".3" stop-color="#38bdf8"/><stop offset=".7" stop-color="#a5f3fc"/><stop offset="1" stop-color="#0369a1" stop-opacity="0"/></linearGradient>
    <linearGradient id="l3" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6d28d9" stop-opacity="0"/><stop offset=".4" stop-color="#8b5cf6"/><stop offset=".75" stop-color="#c4b5fd"/><stop offset="1" stop-color="#4c1d95" stop-opacity="0"/></linearGradient>
    <filter id="b8" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="b24" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="24"/></filter>
    <filter id="b70" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="70"/></filter>
    <filter id="b2" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.6"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g transform="translate(0 40)">
    <!-- ambient glow -->
    <path d="M200 900 C 700 300, 1300 1150, 1800 560 S 2500 700, 2600 500" fill="none" stroke="#1e40af" stroke-width="420" stroke-linecap="round" opacity=".28" filter="url(#b70)"/>
    <!-- main trails -->
    <g filter="url(#b24)" opacity=".7">
      <path d="M120 940 C 640 260, 1240 1200, 1760 600 S 2420 720, 2600 480" fill="none" stroke="url(#l1)" stroke-width="150" stroke-linecap="round"/>
      <path d="M-100 760 C 520 420, 1060 1080, 1540 760 S 2180 320, 2700 640" fill="none" stroke="url(#l3)" stroke-width="110" stroke-linecap="round" opacity=".55"/>
    </g>
    <g filter="url(#b8)" opacity=".85">
      <path d="M140 930 C 650 270, 1230 1180, 1740 610 S 2400 720, 2580 490" fill="none" stroke="url(#l1)" stroke-width="46" stroke-linecap="round"/>
      <path d="M200 890 C 690 330, 1180 1120, 1700 640 S 2340 760, 2560 540" fill="none" stroke="url(#l2)" stroke-width="22" stroke-linecap="round" opacity=".75"/>
      <path d="M-60 770 C 540 440, 1050 1060, 1520 770 S 2160 340, 2680 650" fill="none" stroke="url(#l3)" stroke-width="30" stroke-linecap="round" opacity=".6"/>
    </g>
    <g filter="url(#b2)">
      <path d="M170 915 C 660 290, 1215 1160, 1725 620 S 2380 730, 2570 500" fill="none" stroke="#e0f2fe" stroke-width="3" stroke-linecap="round" opacity=".7"/>
      <path d="M230 875 C 700 350, 1170 1100, 1690 650 S 2330 770, 2550 550" fill="none" stroke="#bae6fd" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
      <path d="M-40 765 C 550 450, 1040 1045, 1510 775 S 2150 350, 2660 655" fill="none" stroke="#ddd6fe" stroke-width="1.8" stroke-linecap="round" opacity=".5"/>
    </g>
  </g>
  <rect width="${W}" height="${H}" fill="#000" opacity=".08"/>
</svg>`;
const html = `<html><body style="margin:0;background:#000">${svg}</body></html>`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html);
await page.screenshot({ path: out, type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();
console.log("wrote", out, fs.statSync(out).size, "bytes");
