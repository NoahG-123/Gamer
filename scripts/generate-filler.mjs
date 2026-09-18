// Generates the boring volume that makes a mailbox, a calendar and a browser history
// feel lived-in: receipts, newsletters, notifications, recurring events, search history.
// Deterministic for a given seed. Output: content/mail/threads/90-filler.json,
// content/calendar/extra/filler.json, content/browser/history-filler.json.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
let s = Number(process.argv[2] ?? 2026) >>> 0;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const END = Date.UTC(2026, 7, 30, 13, 0);
const START = Date.UTC(2024, 0, 10);
const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
const when = () => { const t = START + rnd() * (END - START); const d = new Date(t); d.setUTCHours(int(11, 23), int(0, 59), int(0, 59), 0); return d.getTime(); };
const ME = { email: "wren.castellanos@gmail.com" };

const senders = {
  payhip: { name: "Payhip", email: "no-reply@payhip.com" },
  bh: { name: "B&H Photo Video", email: "orders@bhphotovideo.com" },
  sd: { name: "Sound Devices", email: "news@sounddevices.com" },
  reaper: { name: "REAPER", email: "no-reply@cockos.com" },
  eastlink: { name: "Eastlink", email: "billing@eastlink.ca" },
  nspower: { name: "Nova Scotia Power", email: "customerservice@nspower.ca" },
  cra: { name: "Canada Revenue Agency", email: "no-reply@cra-arc.gc.ca" },
  canadapost: { name: "Canada Post", email: "noreply@canadapost.ca" },
  netflix: { name: "Netflix", email: "info@account.netflix.com" },
  spotify: { name: "Spotify", email: "no-reply@spotify.com" },
  github: { name: "GitHub", email: "noreply@github.com" },
  google: { name: "Google", email: "no-reply@accounts.google.com" },
  linkedin: { name: "LinkedIn", email: "messages-noreply@linkedin.com" },
  cbc: { name: "CBC Docs", email: "docs@cbc.ca" },
  nsi: { name: "Nova Scotia Independent Filmmakers", email: "hello@nsindiefilm.ca" },
  thecoast: { name: "The Coast", email: "newsletter@thecoast.ca" },
  ledger: { name: "The Harbour Ledger", email: "newsletter@harbourledger.ca" },
  substack: { name: "A Closer Listen", email: "acloserlisten@substack.com" },
  lom: { name: "LOM", email: "shop@lom.audio" },
  mec: { name: "MEC", email: "orders@mec.ca" },
  bikes: { name: "Halifax Cycles", email: "service@halifaxcycles.ca" },
  dental: { name: "Agricola Dental", email: "reminders@agricoladental.ca" },
  bank: { name: "RBC Royal Bank", email: "notifications@rbc.com" },
  wealthsimple: { name: "Wealthsimple", email: "support@wealthsimple.com" },
  audible: { name: "Audible", email: "do-not-reply@audible.ca" },
  libro: { name: "Libro.fm", email: "hello@libro.fm" },
  dal: { name: "Dalhousie Libraries", email: "library@dal.ca" },
  hrm: { name: "Halifax Regional Municipality", email: "noreply@halifax.ca" },
  ff: { name: "Freesound", email: "noreply@freesound.org" },
  forum: { name: "fieldrecordists.net", email: "notify@fieldrecordists.net" },
};

const packNames = ["Room Tones Vol. 3 — Institutional", "North End Nights", "Fundy: Tide Cycles", "Kitchens", "Room Tones Vol. 1 & 2 (bundle)"];
const buyers = ["m.okafor", "sfx_jules", "kdt.audio", "lisboa.post", "hannahrecords", "tj_foley", "oslo.sound", "bwnoise", "a.fernandes", "quietdept", "mrsvolume", "leo.k", "ddavies.post", "jjcinema", "tobias.m"];
const searches = ["ortf spacing mkh 8040", "mixpre-6 ii firmware 3.20", "how loud is 30 dbA", "edge tone duct resonance", "formant hum building", "whisper large-v3 timestamps", "gpg symmetric encryption aes256 windows", "seahorse tavern halifax history", "1971 halifax missing woman", "colleen mahar", "colleen mahar halifax 1971", "northwest arm depth chart", "dingle tower northwest arm", "halifax regional police historical case unit", "can a lawyer make you destroy a recording", "cease and desist recording evidence canada", "substitute decision maker consent recording nova scotia", "dementia confabulation vs memory", "lucid interval dementia late stage", "1968 pontiac parisienne", "gerard doucette sydney obituary 2003", "maureen mahar-lyle sackville", "how to make a torrent from a folder", "qbittorrent create torrent private tracker", "electron portable app single exe", "wix bundle portable exe", "how to fake an installer icon", "vps cheap canada ovh beauharnois", "ubuntu setup fail2ban", "self hosted counter api tiny", "flask counter increment endpoint", "moncton weather", "moncton to halifax drive time fog", "cheapest replacement mixpre", "zoom f6 vs mixpre 6", "renters insurance theft claim nova scotia", "police report number insurance halifax", "how to stop a hum in a recording", "izotope rx spectral repair hum", "rx 11 de-hum", "reaper render region matrix", "sox stat rms", "librosa spectral centroid", "python soundfile read 24 bit", "numpy find peaks", "scipy welch psd", "oakmount manor bedford", "oakmount manor reviews", "long term care nova scotia complaints", "recording consent capacity assessment", "the hum taos", "windsor hum ontario", "infrasound anxiety", "why do old buildings hum", "hvac beating frequency", "seagulls fat as ministers", "300 pierogi", "sober anniversary gift ideas", "maison jean lapointe montreal", "what to say to someone who relapsed", "cbc last boat out of canso stream", "aiff screening halifax 2026", "nocturne halifax 2026", "dalhousie library hours", "agricola st parking", "the coast halifax best pho", "north end halifax coffee open late", "dave corkum properties", "lock change cost halifax", "ring doorbell vs eufy", "how to disappear for a while legally", "burner phone canada prepaid", "public mobile prepaid sim", "moncton library", "spanish rice recipe mom", "bizcocho de yogur", "oilers 2018 radio", "pier 21 1971", "halifax longshoremen association history", "furey marine services", "derek furey dartmouth", "hanley roche halifax", "stewart mckelvey marguerite doiron", "rcmp retired sergeant paul kavanagh", "harbour ledger archive", "how long can you hold a secret", "what happens when a suspect dies before charges", "no body homicide canada conviction", "sonar survey harbour cost", "navy dive unit halifax civilian request", "green wool coat 1971", "garnet ring 1960s", "photo booth halifax shopping centre 1970"];

const mailThreads = [];
let n = 0;
const T = (id, subject, labels, from, at, body, extra = {}) => mailThreads.push({ id: `f-${id}-${n++}`, subject, labels, messages: [{ from, to: [ME], at: iso(at), body }], ...extra });

for (let i = 0; i < 46; i++) { const p = pick(packNames); const b = pick(buyers); const amt = { "Room Tones Vol. 3 — Institutional": 24, "North End Nights": 18, "Fundy: Tide Cycles": 28, "Kitchens": 16, "Room Tones Vol. 1 & 2 (bundle)": 30 }[p]; T("order", `You made a sale: ${p}`, ["inbox", "packs"], senders.payhip, when(), `Hi Wren,\n\nGood news, you've made a sale on Payhip.\n\nProduct: ${p}\nCustomer: ${b}@${pick(["gmail.com", "proton.me", "outlook.com", "icloud.com"])}\nAmount: $${amt}.00 CAD\nPayhip fee: $${(amt * 0.05).toFixed(2)}\nNet: $${(amt * 0.95).toFixed(2)}\n\nThe customer has been sent their download link.\n\nPayhip`); }
for (let i = 0; i < 8; i++) T("bh", pick(["Your B&H order has shipped", "Your B&H order confirmation", "Back in stock: Rycote Cyclone Small"]), ["inbox", "gear"], senders.bh, when(), `Thank you for your order.\n\nOrder #: 12${int(10000000, 99999999)}\n${pick(["Rycote Windjammer for Cyclone", "Sennheiser MKH 8040 Compact C