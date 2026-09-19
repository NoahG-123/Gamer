/**
 * Bodies for the "dressing" office documents — the stray .docx, .xlsx, .pptx and .rtf
 * files a used computer accumulates.
 *
 * A real machine never opens one of these into an empty white page. Before this they had
 * no body at all, so the viewer drew nothing and they looked broken rather than dull.
 * Each one now gets deterministic, mundane content chosen from its name and extension:
 * a letter, a set of notes, a spreadsheet of numbers, a handful of slides.
 *
 * Nothing here is story content. Keep it boring on purpose.
 */
import crypto from "node:crypto";

export type DocKind = "word" | "excel" | "powerpoint";

export interface DocBlock { type: "h1" | "h2" | "p" | "list" | "table" | "slide"; text?: string; items?: string[]; rows?: string[][] }
export interface SynthDoc { kind: DocKind; title: string; subtitle: string; blocks: DocBlock[] }

export const DOC_EXTS = new Set(["doc", "docx", "dot", "dotx", "odt", "rtf", "wps"]);
export const SHEET_EXTS = new Set(["xls", "xlsx", "xlsm", "ods"]);
export const SLIDE_EXTS = new Set(["ppt", "pptx", "odp"]);
export function isOfficeExt(ext: string): boolean {
  return DOC_EXTS.has(ext) || SHEET_EXTS.has(ext) || SLIDE_EXTS.has(ext);
}
export function docKind(ext: string): DocKind {
  return SHEET_EXTS.has(ext) ? "excel" : SLIDE_EXTS.has(ext) ? "powerpoint" : "word";
}

function rng(seed: string): () => number {
  let s = crypto.createHash("sha256").update(seed).digest().readUInt32LE(0) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
}
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length) % xs.length];
const some = <T,>(r: () => number, xs: T[], n: number): T[] => {
  const pool = [...xs], out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
};
const pad2 = (n: number) => String(n).padStart(2, "0");
const dateStr = (r: () => number) => `${2024 + Math.floor(r() * 3)}-${pad2(1 + Math.floor(r() * 12))}-${pad2(1 + Math.floor(r() * 28))}`;

const SENTENCES = [
  "Attached is the summary we talked about on the phone.",
  "Everything below is provisional until the final numbers come back.",
  "Please check the dates against your own diary before I send it on.",
  "There is nothing urgent here; it can wait until next week.",
  "I have kept it short because most of it is in the spreadsheet.",
  "Let me know if you want the longer version with the workings in it.",
  "The figures are rounded to the nearest dollar throughout.",
  "This supersedes the copy circulated last month.",
  "No changes were made to the schedule since the last draft.",
  "Sorry for the delay getting this over to you.",
];
const BULLETS = [
  "confirm the delivery window",
  "get the invoice numbers onto one sheet",
  "chase the outstanding quote",
  "book the van for the Thursday",
  "renew the insurance before it lapses",
  "back up the cards before reformatting",
  "return the borrowed cable",
  "update the contact list",
  "print two copies for the file",
  "check the totals add up",
];

function letter(r: () => number, title: string): SynthDoc {
  return {
    kind: "word",
    title,
    subtitle: `Last saved ${dateStr(r)}`,
    blocks: [
      { type: "h1", text: title },
      { type: "p", text: pick(r, ["Dear Sir or Madam,", "Hello,", "Hi,", "To whom it may concern,"]) },
      ...some(r, SENTENCES, 3 + Math.floor(r() * 3)).map((t) => ({ type: "p" as const, text: t })),
      { type: "list", items: some(r, BULLETS, 3 + Math.floor(r() * 3)) },
      { type: "p", text: pick(r, SENTENCES) },
      { type: "p", text: pick(r, ["Kind regards,", "Best wishes,", "Thanks,", "Yours sincerely,"]) },
    ],
  };
}

function report(r: () => number, title: string): SynthDoc {
  const sections = some(r, ["Background", "Scope", "Method", "Findings", "Costs", "Next steps", "Appendix"], 3 + Math.floor(r() * 3));
  const blocks: DocBlock[] = [{ type: "h1", text: title }, { type: "p", text: `Prepared ${dateStr(r)}. Draft — not for circulation.` }];
  for (const sec of sections) {
    blocks.push({ type: "h2", text: sec });
    blocks.push({ type: "p", text: some(r, SENTENCES, 2).join(" ") });
    if (r() < 0.4) blocks.push({ type: "list", items: some(r, BULLETS, 3) });
  }
  return { kind: "word", title, subtitle: `Last saved ${dateStr(r)}`, blocks };
}

function sheet(r: () => number, title: string): SynthDoc {
  const cols = pick(r, [
    ["Date", "Description", "Category", "Amount"],
    ["Item", "Qty", "Unit", "Total"],
    ["Week", "Hours", "Rate", "Due"],
  ]);
  const rows: string[][] = [cols];
  const n = 8 + Math.floor(r() * 16);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const amount = Number((8 + r() * 420).toFixed(2));
    total += amount;
    rows.push(cols.map((c) => {
      if (/date/i.test(c)) return dateStr(r);
      if (/week/i.test(c)) return `W${1 + Math.floor(r() * 52)}`;
      if (/qty|hours/i.test(c)) return String(1 + Math.floor(r() * 9));
      if (/rate|unit/i.test(c)) return (20 + r() * 60).toFixed(2);
      if (/amount|total|due/i.test(c)) return amount.toFixed(2);
      if (/category/i.test(c)) return pick(r, ["Travel", "Kit", "Supplies", "Fuel", "Meals", "Postage"]);
      return pick(r, ["Cable", "Adapter", "Case", "Battery", "Card", "Clamp", "Stand", "Windjammer"]);
    }));
  }
  rows.push(cols.map((c, i) => (i === 0 ? "Total" : /amount|total|due/i.test(c) ? total.toFixed(2) : "")));
  return { kind: "excel", title, subtitle: `Sheet1 — ${n} rows`, blocks: [{ type: "table", rows }] };
}

function deck(r: () => number, title: string): SynthDoc {
  const n = 4 + Math.floor(r() * 4);
  const blocks: DocBlock[] = [{ type: "slide", text: title, items: [`Prepared ${dateStr(r)}`] }];
  const heads = some(r, ["Where we are", "What changed", "The numbers", "Risks", "What we need", "Timeline", "Questions"], n);
  for (const h of heads) blocks.push({ type: "slide", text: h, items: some(r, BULLETS, 2 + Math.floor(r() * 3)) });
  return { kind: "powerpoint", title, subtitle: `${blocks.length} slides`, blocks };
}

const NAME_HINTS: { test: RegExp; make: (r: () => number, title: string) => SynthDoc }[] = [
  { test: /letter|covering|reference|complaint/i, make: letter },
  { test: /report|review|summary|minutes|notes|proposal|brief/i, make: report },
  { test: /budget|accounts|expenses|invoice|timesheet|hours|stock|inventory/i, make: sheet },
  { test: /deck|slides|pitch|presentation/i, make: deck },
];

/** Deterministic, mundane content for a filler office document. Never story content. */
export function synthDoc(path: string, ext: string): SynthDoc {
  const r = rng(`doc:${path}`);
  const name = path.slice(path.lastIndexOf("/") + 1);
  const title = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Document";
  const kind = docKind(ext);
  if (kind === "excel") return sheet(r, title);
  if (kind === "powerpoint") return deck(r, title);
  for (const h of NAME_HINTS) if (h.test.test(name)) { const d = h.make(r, title); if (d.kind === "word") return d; }
  return r() < 0.5 ? letter(r, title) : report(r, title);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CHROME: Record<DocKind, { app: string; accent: string; ribbon: string }> = {
  word: { app: "Word", accent: "#185abd", ribbon: "#2b579a" },
  excel: { app: "Excel", accent: "#107c41", ribbon: "#217346" },
  powerpoint: { app: "PowerPoint", accent: "#c43e1c", ribbon: "#b7472a" },
};

/**
 * The document as a page the browser can render: a sheet of A4 (or a grid, or slides)
 * inside the usual Office frame, read-only, the way a viewer shows a file the machine has
 * no licence to edit.
 */
export function renderDoc(doc: SynthDoc, filename: string): string {
  const c = CHROME[doc.kind];
  const body = doc.blocks.map((b) => {
    switch (b.type) {
      case "h1": return `<h1>${esc(b.text ?? "")}</h1>`;
      case "h2": return `<h2>${esc(b.text ?? "")}</h2>`;
      case "p": return `<p>${esc(b.text ?? "")}</p>`;
      case "list": return `<ul>${(b.items ?? []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
      case "table": {
        const rows = b.rows ?? [];
        const head = rows[0] ?? [];
        return `<table><thead><tr><th class="rh"></th>${head.map((h, i) => `<th>${String.fromCharCode(65 + i)}</th>`).join("")}</tr>`
          + `<tr><th class="rh">1</th>${head.map((h) => `<th class="hd">${esc(h)}</th>`).join("")}</tr></thead><tbody>`
          + rows.slice(1).map((row, ri) => `<tr><th class="rh">${ri + 2}</th>${row.map((cell) => `<td class="${/^[\d.,]+$/.test(cell) ? "num" : ""}">${esc(cell)}</td>`).join("")}</tr>`).join("")
          + "</tbody></table>";
      }
      case "slide": return `<section class="slide"><h3>${esc(b.text ?? "")}</h3><ul>${(b.items ?? []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul></section>`;
      default: return "";
    }
  }).join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(filename)}</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#f3f2f1;font-family:"Segoe UI",system-ui,Arial,sans-serif;color:#201f1e}
header{position:sticky;top:0;z-index:2;background:${c.ribbon};color:#fff;padding:10px 20px;display:flex;align-items:center;gap:12px;font-size:13px}
header b{font-weight:600}
header .sp{flex:1}
header .ro{font-size:11px;opacity:.85;border:1px solid rgba(255,255,255,.4);border-radius:3px;padding:2px 8px}
main{padding:24px 16px 64px;display:flex;flex-direction:column;align-items:center;gap:20px}
.page{width:min(820px,100%);background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18);padding:64px 72px;line-height:1.6;font-size:15px;font-family:Cambria,Georgia,serif}
.page h1{font-size:24px;font-weight:600;margin:0 0 6px;color:${c.accent};font-family:"Segoe UI",system-ui,sans-serif}
.page h2{font-size:17px;font-weight:600;margin:26px 0 6px;color:${c.accent};font-family:"Segoe UI",system-ui,sans-serif}
.page p{margin:0 0 12px}
.page ul{margin:0 0 14px;padding-left:22px}
.page li{margin:0 0 4px}
.grid{width:min(980px,100%);background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18);overflow:auto}
table{border-collapse:collapse;width:100%;font-size:13px;font-family:Calibri,"Segoe UI",sans-serif}
th,td{border:1px solid #d0cece;padding:4px 8px;text-align:left;white-space:nowrap}
thead th{background:#f3f2f1;font-weight:400;color:#605e5c;text-align:center}
thead th.hd{font-weight:600;color:#201f1e;text-align:left;background:#e7f1ec}
th.rh{background:#f3f2f1;color:#605e5c;font-weight:400;width:42px;text-align:center;position:sticky;left:0}
td.num{text-align:right;font-variant-numeric:tabular-nums}
tbody tr:last-child td{font-weight:600;background:#faf9f8}
.slide{width:min(820px,100%);aspect-ratio:16/9;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18);padding:48px 56px;display:flex;flex-direction:column;gap:14px}
.slide h3{margin:0;font-size:28px;font-weight:600;color:${c.accent}}
.slide ul{margin:0;padding-left:24px;font-size:17px;line-height:1.8;color:#3b3a39}
footer{padding:0 0 40px;text-align:center;color:#605e5c;font-size:12px}
@media (max-width:640px){.page{padding:32px 24px}.slide{padding:28px 24px}.slide h3{font-size:20px}.slide ul{font-size:14px}}
</style></head>
<body>
<header><b>${esc(filename)}</b><span>${c.app}</span><span class="sp"></span><span class="ro">Read-only</span></header>
<main>
${doc.kind === "excel" ? `<div class="grid">${body}</div>` : doc.kind === "powerpoint" ? body : `<article class="page">${body}</article>`}
</main>
<footer>Opened in the ${esc(c.app)} viewer. This computer has no licence to edit it.</footer>
</body></html>`;
}
