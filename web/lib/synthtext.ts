/**
 * Plausible bodies for "dressing" text files (the hundreds of filler files that make the
 * machine feel lived-in but carry no story). A real computer never opens a .txt into an
 * empty window, so every text-ish filler file gets deterministic, mundane content chosen
 * from its extension and its name. Seeded by path: the same file always reads the same.
 *
 * Nothing here is story content. Keep it boring on purpose.
 */
import crypto from "node:crypto";

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
function dateStr(r: () => number, year = 2024 + Math.floor(r() * 3)): string {
  return `${year}-${pad2(1 + Math.floor(r() * 12))}-${pad2(1 + Math.floor(r() * 28))}`;
}
function timeStr(r: () => number): string {
  return `${pad2(Math.floor(r() * 24))}:${pad2(Math.floor(r() * 60))}:${pad2(Math.floor(r() * 60))}`;
}

const GROCERIES = ["milk", "eggs", "oat milk", "coffee beans", "bread", "butter", "rice", "onions", "garlic", "olive oil", "tinned tomatoes", "frozen peas", "lemons", "apples", "chicken thighs", "yoghurt", "dish soap", "toilet paper", "batteries", "tape"];
const CHORES = ["book the car in", "renew parking pass", "return the library books", "call about the invoice", "back up the card reader", "clean the filters", "water the plants", "descale the kettle", "chase the deposit", "print the form"];

function recipe(r: () => number, name: string): string {
  const title = name.replace(/\.[^.]+$/, "");
  const oven = pick(r, [175, 180, 190, 200, 220]);
  const mins = 20 + Math.floor(r() * 45);
  const ing = some(r, ["2 cups flour", "1 tsp baking soda", "1/2 tsp salt", "3 ripe bananas", "125 g butter, melted", "150 g sugar", "2 eggs", "1 tsp vanilla", "200 ml stock", "1 onion, diced", "2 cloves garlic", "400 g tinned tomatoes", "1 cup rice", "olive oil", "black pepper", "handful of parsley"], 6 + Math.floor(r() * 3));
  const steps = some(r, ["Heat the oven.", "Mix the dry ingredients in the big bowl.", "Beat the wet ingredients separately, then fold in.", "Don't overmix, it goes rubbery.", "Tip into the tin, level the top.", "Bake until a skewer comes out clean.", "Let it sit 10 minutes before turning out.", "Salt at the end, not the start.", "Rest it, covered, off the heat.", "Tastes better the next day."], 5 + Math.floor(r() * 3));
  return [`${title}`, "=".repeat(title.length), "", `Oven ${oven}C. About ${mins} minutes.`, "", "Ingredients", ...ing.map((i) => `  - ${i}`), "", "Method", ...steps.map((s, i) => `  ${i + 1}. ${s}`), "", pick(r, ["(from mum, adjusted)", "(from the back of the packet)", "(halved this last time, was plenty)", "(double the garlic)", ""]), ""].join("\r\n");
}

function notes(r: () => number, name: string): string {
  const kind = r();
  if (kind < 0.35) return ["shopping", "--------", ...some(r, GROCERIES, 6 + Math.floor(r() * 7)).map((g) => g), "", ...some(r, CHORES, 2 + Math.floor(r() * 3)).map((c) => `- ${c}`), ""].join("\r\n");
  if (kind < 0.6) return [`notes ${dateStr(r)}`, "", ...some(r, ["call back re: quote", "they want it in 48k not 96", "invoice number is on the second page", "the van needs an oil change before october", "ask about the weekend rate", "he said he'd email, he did not email", "check whether the warranty covers the cable", "bring the short XLRs", "confirm the parking", "they pay net 30, allegedly"], 4 + Math.floor(r() * 5)).map((s) => `- ${s}`), ""].join("\r\n");
  if (kind < 0.8) {
    const rows = 3 + Math.floor(r() * 5);
    return ["item\tqty\tprice", ...Array.from({ length: rows }, () => `${pick(r, ["cable", "adapter", "windjammer", "clamp", "case", "battery", "sd card", "stand"])}\t${1 + Math.floor(r() * 4)}\t${(8 + r() * 120).toFixed(2)}`), ""].join("\r\n");
  }
  return [pick(r, ["draft — do not send", "scratch", "temp"]), "", ...some(r, ["the second paragraph is doing too much work", "cut the opening line", "ask for the deposit up front this time", "be polite about it", "keep it to five sentences", "don't apologise twice"], 3 + Math.floor(r() * 3)).map((s) => s), ""].join("\r\n");
}

function logFile(r: () => number, name: string): string {
  const n = 14 + Math.floor(r() * 30);
  const app = pick(r, ["setup", "updater", "crashpad", "service", "renderer", "audio-engine", "sync"]);
  const out: string[] = [`# ${app} log — ${dateStr(r)}`];
  for (let i = 0; i < n; i++) {
    const lvl = r() < 0.08 ? "WARN" : r() < 0.03 ? "ERROR" : "INFO";
    out.push(`${dateStr(r)} ${timeStr(r)} [${lvl}] ${pick(r, ["init", "handshake ok", "cache hit", "cache miss, refetching", "device enumerated", "buffer underrun recovered", "config reloaded", "heartbeat", "session resumed", "shutdown requested", "flush complete", "no update available", `${(r() * 200).toFixed(1)} ms`])}`);
  }
  out.push("");
  void name;
  return out.join("\r\n");
}

function ini(r: () => number, name: string): string {
  if (/desktop\.ini/i.test(name)) return ["[.ShellClassInfo]", `LocalizedResourceName=@%SystemRoot%\\system32\\shell32.dll,-${21769 + Math.floor(r() * 30)}`, "[ViewState]", "Mode=", "Vid=", "FolderType=Generic", ""].join("\r\n");
  return [`[${pick(r, ["General", "Settings", "Options", "Paths"])}]`, `version=${1 + Math.floor(r() * 4)}.${Math.floor(r() * 12)}.${Math.floor(r() * 40)}`, `lastRun=${dateStr(r)}`, `theme=${pick(r, ["dark", "light", "system"])}`, `autoUpdate=${pick(r, ["true", "false"])}`, "", "[Window]", `width=${900 + Math.floor(r() * 700)}`, `height=${500 + Math.floor(r() * 500)}`, `maximized=${pick(r, ["0", "1"])}`, ""].join("\r\n");
}

function jsonFile(r: () => number): string {
  return JSON.stringify({
    version: `${1 + Math.floor(r() * 3)}.${Math.floor(r() * 9)}.${Math.floor(r() * 20)}`,
    updated: `${dateStr(r)}T${timeStr(r)}Z`,
    settings: { theme: pick(r, ["dark", "light"]), autosave: r() > 0.5, recentLimit: 10 + Math.floor(r() * 20) },
    recent: Array.from({ length: 2 + Math.floor(r() * 4) }, () => `C:/Users/…/${pick(r, ["session", "take", "mix", "render", "export"])}_${Math.floor(r() * 900) + 100}`),
  }, null, 2) + "\n";
}

function csv(r: () => number): string {
  const cols = pick(r, [["date", "description", "amount"], ["name", "qty", "unit", "total"], ["timestamp", "channel", "peak_db", "rms_db"]]);
  const rows = 6 + Math.floor(r() * 18);
  const out = [cols.join(",")];
  for (let i = 0; i < rows; i++) {
    out.push(cols.map((c) => {
      if (/date|timestamp/.test(c)) return dateStr(r);
      if (/amount|total|price/.test(c)) return (r() * 400).toFixed(2);
      if (/qty|channel/.test(c)) return String(1 + Math.floor(r() * 8));
      if (/db/.test(c)) return (-(r() * 40 + 3)).toFixed(1);
      if (/unit/.test(c)) return pick(r, ["ea", "hr", "day", "kg"]);
      return pick(r, ["misc", "supplies", "fuel", "parking", "coffee", "hardware", "shipping", "meals"]);
    }).join(","));
  }
  out.push("");
  return out.join("\r\n");
}

function xml(r: () => number): string {
  return ['<?xml version="1.0" encoding="UTF-8"?>', "<configuration>", `  <appSettings lastWrite="${dateStr(r)}T${timeStr(r)}Z">`, ...some(r, ["cachePath", "logLevel", "sampleRate", "bufferSize", "deviceId", "retries"], 4).map((k) => `    <add key="${k}" value="${pick(r, ["default", "2", "48000", "512", "auto", "3"])}" />`), "  </appSettings>", "</configuration>", ""].join("\r\n");
}

function srt(r: () => number): string {
  const n = 4 + Math.floor(r() * 8);
  const out: string[] = [];
  let t = 2 + r() * 6;
  for (let i = 1; i <= n; i++) {
    const end = t + 1.5 + r() * 3;
    const f = (x: number) => `00:${pad2(Math.floor(x / 60))}:${pad2(Math.floor(x % 60))},${String(Math.floor((x % 1) * 1000)).padStart(3, "0")}`;
    out.push(String(i), `${f(t)} --> ${f(end)}`, pick(r, ["[wind]", "[door closes]", "— it's fine, honestly", "[traffic]", "— say that again?", "[laughter]", "— no, the other one", "[room tone]"]), "");
    t = end + 0.4 + r();
  }
  return out.join("\r\n");
}

function code(r: () => number, ext: string): string {
  if (ext === "py") return ["#!/usr/bin/env python3", '"""helper. nothing clever."""', "import sys, os, json", "", "def main(argv):", "    if len(argv) < 2:", '        print("usage: %s PATH" % os.path.basename(argv[0]))', "        return 1", "    path = argv[1]", "    with open(path) as fh:", "        data = json.load(fh)", '    print(len(data), "records")', "    return 0", "", 'if __name__ == "__main__":', "    sys.exit(main(sys.argv))", ""].join("\n");
  if (ext === "ps1") return ["# quick backup", `$src = "D:\\Backup"`, `$dst = "\\\\nas\\share"`, "if (-not (Test-Path $dst)) { Write-Host 'target offline'; exit 1 }", "robocopy $src $dst /MIR /R:1 /W:1 | Out-Null", "Write-Host 'done'", ""].join("\r\n");
  if (ext === "sh") return ["#!/bin/sh", "set -e", 'cd "$(dirname "$0")"', "for f in *.wav; do", '  [ -e "$f" ] || continue', '  ffmpeg -hide_banner -loglevel error -i "$f" -ar 48000 "out/$f"', "done", 'echo "ok"', ""].join("\n");
  if (ext === "html" || ext === "htm") return ["<!doctype html>", '<html><head><meta charset="utf-8"><title>Saved page</title></head>', "<body><h1>Saved page</h1><p>This page was saved from the browser.</p></body></html>", ""].join("\n");
  if (ext === "css") return [":root { --bg: #111; --fg: #eee; }", "body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); }", ".row { display: flex; gap: 8px; align-items: center; }", ""].join("\n");
  return ["// scratch", "export function clamp(v, lo, hi) {", "  return Math.max(lo, Math.min(hi, v));", "}", ""].join("\n");
}

const NAME_HINTS: { test: RegExp; make: (r: () => number, name: string) => string }[] = [
  { test: /recipe|bread|cake|soup|rice|pasta|cookie|chili|curry|stew|pie/i, make: (r, n) => recipe(r, n) },
  { test: /shopping|grocer|list/i, make: (r) => ["shopping", "--------", ...some(r, GROCERIES, 8).join("\r\n").split("\r\n"), ""].join("\r\n") },
  { test: /todo|to do|tasks/i, make: (r) => [...some(r, CHORES, 6).map((c) => `- [ ] ${c}`), "- [x] " + pick(r, CHORES), ""].join("\r\n") },
  { test: /readme/i, make: (r) => ["README", "", pick(r, ["Unzip, run the installer, restart.", "Drop the folder anywhere. No installer.", "Requires the redistributable. Included."]), "", "Changelog", `  ${dateStr(r)}  ${pick(r, ["fixes", "maintenance release", "first public build"])}`, ""].join("\r\n") },
  { test: /licen[cs]e|eula/i, make: () => ["Permission is hereby granted, free of charge, to any person obtaining a copy of this", "software and associated documentation files (the \"Software\"), to deal in the Software", "without restriction, including without limitation the rights to use, copy, modify, merge,", "publish, distribute, sublicense, and/or sell copies of the Software.", "", "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.", ""].join("\r\n") },
  { test: /invoice|receipt|quote/i, make: (r) => [`INVOICE ${2000 + Math.floor(r() * 900)}`, `Date: ${dateStr(r)}`, "", "Description                         Amount", "-".repeat(44), ...Array.from({ length: 2 + Math.floor(r() * 4) }, () => `${pick(r, ["Day rate", "Kit rental", "Travel", "Editing", "Delivery"]).padEnd(36)}${(120 + r() * 900).toFixed(2).padStart(8)}`), "-".repeat(44), `${"Total".padEnd(36)}${(400 + r() * 2000).toFixed(2).padStart(8)}`, "", "Payable net 30.", ""].join("\r\n") },
  { test: /password|passwd|creds/i, make: (r) => ["(not the real ones, obviously)", "", ...some(r, ["router admin — on the sticker", "wifi — the one on the fridge", "nas — same as the router", "spare key code — ask dave", "printer pin — 0000"], 4).map((s) => `- ${s}`), ""].join("\r\n") },
];

/** Deterministic, mundane body for a filler text file. Never story content. */
export function synthText(path: string, ext: string, size = 0): string {
  const r = rng(`text:${path}`);
  const name = path.slice(path.lastIndexOf("/") + 1);
  for (const h of NAME_HINTS) if (h.test.test(name)) return h.make(r, name);
  switch (ext) {
    case "log": return logFile(r, name);
    case "ini": case "cfg": case "conf": return ini(r, name);
    case "json": return jsonFile(r);
    case "csv": return csv(r);
    case "xml": case "manifest": return xml(r);
    case "srt": case "vtt": case "sub": return srt(r);
    case "py": case "ps1": case "sh": case "js": case "ts": case "mjs": case "cjs": case "css": case "html": case "htm": return code(r, ext);
    case "md": return [`# ${name.replace(/\.[^.]+$/, "")}`, "", pick(r, ["Notes to self.", "Rough outline.", "Working file."]), "", ...some(r, ["- fix the levels on take 3", "- ask for the wide shot", "- the timecode drifts after an hour", "- rename before delivery", "- check the sample rate"], 3 + Math.floor(r() * 3)), ""].join("\n");
    case "nfo": return ["                    .-------------------------------.", "                    |   installed. read the txt.    |", "                    '-------------------------------'", "", `  release ...... ${dateStr(r)}`, `  size ......... ${Math.max(1, Math.round((size || 4_000_000) / 1024 / 1024))} MB`, "  notes ........ works fine. block it in the firewall.", ""].join("\r\n");
    case "eml": return [`From: ${pick(r, ["noreply@updates.example", "billing@example.com", "no-reply@shop.example"])}`, `Date: ${dateStr(r)}`, `Subject: ${pick(r, ["Your order has shipped", "Statement available", "Password changed", "Welcome"])}`, "", "This message was saved from the mail client.", ""].join("\r\n");
    case "ics": return ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `DTSTART:${dateStr(r).replace(/-/g, "")}T${timeStr(r).replace(/:/g, "")}Z`, `SUMMARY:${pick(r, ["Pickup", "Service appointment", "Call", "Delivery window"])}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
    case "pub": return `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${Buffer.from(String(r())).toString("base64").replace(/[^A-Za-z0-9]/g, "").padEnd(20, "x").slice(0, 20)} user@machine\n`;
    case "txt": case "": default: return notes(r, name);
  }
}
