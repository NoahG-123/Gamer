/**
 * Windows Terminal (PowerShell) emulator over the virtual filesystem.
 *
 * The shell is stateless per request: the client sends the line, its cwd and any
 * mode (an ssh session, a python REPL). Real story files are readable, git history
 * comes from content/repos/*.json, scripted programs from content/terminal/scripts.json,
 * decryption checks passphrases against content/terminal/secrets.json, and ssh hosts
 * from content/terminal/ssh.json. Everything the player types is recorded.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { loadContent, loadProfile, contentPath } from "./content";
import { getNode, listDir, getStoryFile, normalizePath, parentPath, userHome, allStoryFiles, VfsNode, toWindowsPath, resolveText, contentSeed } from "./vfs";
import { recordEvent, reveal, setFlag, allFlags } from "./state";
import { writeFile, mkdir as fsMkdir, remove as fsRemove, purge as fsPurge, rename as fsRename, copyTo, getOverlay } from "./fsmut";
import { db } from "./db";

export interface Line { text: string; color?: "red" | "yellow" | "green" | "cyan" | "dim" | "white"; delayMs?: number }
export type Mode = { kind: "ssh"; host: string; cwd: string } | { kind: "python" } | null;
export interface ExecRequest { line: string; cwd: string; stdin?: string; mode?: Mode }
export interface ExecResult { lines: Line[]; cwd: string; mode?: Mode; prompt?: string; clear?: boolean; exit?: boolean; open?: { app: string; props: Record<string, unknown> }; askSecret?: { prompt: string } }

interface ScriptsFile { scripts: { path: string; runs?: { argsMatch?: string; lines: (string | Line)[]; flag?: string; event?: string }[]; default?: (string | Line)[] }[] }
interface SecretsFile { files: Record<string, { sha256: string; tool: "gpg" | "7z" | "openssl"; outputs: string[]; flag?: string; okLines?: string[] }> }
interface SshHost { aliases: string[]; banner: string[]; prompt: string; cwd: string; files?: Record<string, string>; commands?: Record<string, (string | Line)[]>; flagOnConnect?: string; motd?: string[] }
interface SshFile { hosts: Record<string, SshHost>; unreachable?: string[] }
export interface Repo { root: string; branch: string; remote?: string; commits: { hash: string; author: string; email: string; date: string; message: string; files?: string[]; diff?: string }[]; status?: { modified?: string[]; untracked?: string[]; staged?: string[] }; branches?: string[]; tags?: string[]; stash?: string[] }

const L = (text: string, color?: Line["color"], delayMs?: number): Line => ({ text, color, delayMs });
const red = (t: string) => L(t, "red");
const toLine = (l: string | Line): Line => (typeof l === "string" ? L(l) : l);

function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function resolve(cwd: string, arg: string | undefined): string {
  if (!arg || arg === ".") return cwd;
  let a = arg.replace(/\\/g, "/").replace(/^["']|["']$/g, "");
  if (a === "~" || a.startsWith("~/")) a = userHome() + a.slice(1);
  if (a.startsWith("$HOME") || a.startsWith("$env:USERPROFILE")) a = userHome() + a.replace(/^\$HOME|^\$env:USERPROFILE/, "");
  if (/^[a-zA-Z]:/.test(a)) return normalizePath(a);
  if (a.startsWith("/")) return normalizePath(cwd.slice(0, 2) + a);
  const parts = normalizePath(cwd).split("/");
  for (const seg of a.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") { if (parts.length > 1) parts.pop(); continue; }
    parts.push(seg);
  }
  return normalizePath(parts.join("/"));
}

function loadRepos(): Repo[] {
  const dir = contentPath("repos");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => loadContent<Repo>(`repos/${f}`));
}
function repoFor(cwd: string): Repo | null {
  const n = normalizePath(cwd);
  return loadRepos().find((r) => { const root = normalizePath(r.root); return n === root || n.startsWith(root + "/"); }) ?? null;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const tz = loadProfile().timezone;
  const date = d.toLocaleDateString("en-CA", { timeZone: tz });
  const time = d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  return `${date}  ${time.padStart(8)}`;
}

function gciLines(dir: string, nodes: VfsNode[]): Line[] {
  const out: Line[] = [L(""), L(`    Directory: ${toWindowsPath(dir)}`), L(""), L("Mode                 LastWriteTime         Length Name"), L("----                 -------------         ------ ----")];
  for (const n of nodes) {
    const mode = n.dir ? (n.hidden ? "d--h--" : "d-----") : n.hidden ? "-a-h--" : "-a----";
    const len = n.dir ? "" : String(n.size);
    out.push(L(`${mode.padEnd(21)}${fmtTime(n.modified).padEnd(22)}${len.padStart(6)} ${n.name}`));
  }
  out.push(L(""));
  return out;
}

/** What `cat` reads: the story body, what the player saved, or a filler body. */
function fileText(p: string): string | null {
  const f = getStoryFile(p);
  if (f) return f.body ?? "";
  return resolveText(p);
}

function walk(root: string, showHidden: boolean, depth = 0, max = 6, acc: VfsNode[] = []): VfsNode[] {
  const r = listDir(root, { showHidden });
  if (!r || depth > max) return acc;
  for (const c of r.children) { acc.push(c); if (c.dir) walk(c.path, showHidden, depth + 1, max, acc); }
  return acc;
}

function binaryJunk(seed: string): string {
  const h = crypto.createHash("md5").update(seed).digest();
  let s = "";
  for (let i = 0; i < 64; i++) { const b = h[i % 16] ^ (i * 31); s += b < 32 || b > 126 ? String.fromCharCode(0x2500 + (b % 96)) : String.fromCharCode(b); }
  return s;
}

function recordCmd(line: string, first: string): void {
  db().prepare("INSERT INTO terminal_history(line) VALUES (?)").run(line);
  recordEvent("terminal.cmd", first, { line });
}

export function runtimeHistory(): string[] {
  return (db().prepare("SELECT line FROM terminal_history ORDER BY id").all() as { line: string }[]).map((r) => r.line);
}

export function exec(req: ExecRequest): ExecResult {
  const raw = req.line ?? "";
  const line = raw.trim();
  const cwd = normalizePath(req.cwd || userHome());
  if (req.mode?.kind === "ssh") return sshExec(req.mode, line, cwd);
  if (req.mode?.kind === "python") return pyExec(line, cwd);
  if (!line) return { lines: [], cwd };

  // Output redirection: `command > file` and `command >> file` really write the file.
  const redirect = line.match(/^(.*?)\s*(>>|>)\s*("[^"]+"|'[^']+'|\S+)\s*$/);
  if (redirect && !/^\s*(7z|gpg|git)\b/i.test(redirect[1])) {
    const inner = exec({ ...req, line: redirect[1] });
    const target = resolve(cwd, redirect[3].replace(/^["']|["']$/g, ""));
    const parent = parentPath(target);
    if (!parent || !getNode(parent)?.dir) return { cwd, lines: [red(`Could not find a part of the path '${toWindowsPath(target)}'.`), L("")] };
    const text = inner.lines.map((l) => l.text).join("\r\n");
    const existing = redirect[2] === ">>" ? resolveText(target) ?? "" : "";
    writeFile(target, existing ? `${existing}\r\n${text}` : text);
    recordEvent("file.saved", target, { via: "terminal" });
    return { cwd, lines: [] };
  }

  const argv = tokenize(line);
  const cmd = argv[0].toLowerCase();
  const args = argv.slice(1);
  recordCmd(line, cmd);
  const profile = loadProfile();
  const home = userHome();
  const flags = allFlags();
  const machine = profile.machineName.toLowerCase();
  const notRecognized = (t: string): ExecResult => ({ cwd, lines: [red(`${t} : The term '${t}' is not recognized as the name of a cmdlet, function, script file, or operable program.`), red("Check the spelling of the name, or if a path was included, verify that the path is correct and try again."), red("At line:1 char:1"), red(`+ ${line}`), red("+ " + "~".repeat(Math.max(1, t.length))), red("    + CategoryInfo          : ObjectNotFound: (" + t + ":String) [], CommandNotFoundException"), red("    + FullyQualifiedErrorId : CommandNotFoundException"), L("")] });
  const notFound = (p: string, c = "Get-ChildItem"): Line[] => [red(`${c} : Cannot find path '${toWindowsPath(p)}' because it does not exist.`), red("At line:1 char:1"), red(`+ ${line}`), red("+ " + "~".repeat(Math.max(1, line.length))), red(`    + CategoryInfo          : ObjectNotFound: (${toWindowsPath(p)}:String) [${c}], ItemNotFoundException`), red(`    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.${c}Command`), L("")];

  switch (cmd) {
    case "cls": case "clear": case "clear-host": return { cwd, lines: [], clear: true };
    case "exit": return { cwd, lines: [], exit: true };
    case "pwd": case "get-location": case "gl": return { cwd, lines: [L(""), L("Path"), L("----"), L(toWindowsPath(cwd)), L("")] };
    case "cd": case "set-location": case "sl": case "chdir": case "pushd": {
      const a = args.filter((x) => !x.startsWith("-"))[0];
      const target = a === undefined || a === "~" ? home : resolve(cwd, a);
      const n = getNode(target);
      if (!n || !n.dir) return { cwd, lines: notFound(target, "Set-Location") };
      recordEvent("folder.opened", n.path, { via: "terminal" });
      return { cwd: n.path, lines: [] };
    }
    case "ls": case "dir": case "gci": case "get-childitem": case "ll": {
      const showHidden = args.some((a) => /^-(force|a|fo)$/i.test(a) || /^\/a/i.test(a));
      const recurse = args.some((a) => /^-(recurse|r)$/i.test(a) || a === "/s");
      const nameOnly = args.some((a) => /^-name$/i.test(a) || a === "/b");
      const a = args.filter((x) => !x.startsWith("-") && !x.startsWith("/"))[0];
      const target = resolve(cwd, a);
      const n = getNode(target);
      if (!n) return { cwd, lines: notFound(target) };
      if (!n.dir) return { cwd, lines: gciLines(parentPath(n.path) ?? n.path, [n]) };
      recordEvent("folder.opened", n.path, { via: "terminal" });
      if (recurse) {
        const all = walk(n.path, showHidden);
        if (nameOnly) return { cwd, lines: all.map((x) => L(toWindowsPath(x.path).slice(toWindowsPath(n.path).length + 1))) };
        const byDir = new Map<string, VfsNode[]>();
        for (const x of all) { const p = parentPath(x.path)!; if (!byDir.has(p)) byDir.set(p, []); byDir.get(p)!.push(x); }
        const out: Line[] = [];
        for (const [d, kids] of byDir) out.push(...gciLines(d, kids));
        return { cwd, lines: out.slice(0, 400) };
      }
      const r = listDir(n.path, { showHidden })!;
      if (nameOnly) return { cwd, lines: r.children.map((x) => L(x.name)) };
      return { cwd, lines: gciLines(n.path, r.children) };
    }
    case "tree": {
      const target = resolve(cwd, args.filter((x) => !x.startsWith("-") && !x.startsWith("/"))[0]);
      const n = getNode(target);
      if (!n || !n.dir) return { cwd, lines: [L("Invalid path - " + toWindowsPath(target)), L("No subfolders exist"), L("")] };
      const files = args.some((a) => a.toLowerCase() === "/f");
      const out: Line[] = [L(`Folder PATH listing for volume ${n.path.startsWith("D") ? "Data" : "Windows"}`), L("Volume serial number is 9C3E-51A7"), L(toWindowsPath(n.path).toUpperCase())];
      const rec = (p: string, prefix: string, depth: number) => {
        const r = listDir(p); if (!r || depth > 5) return;
        const kids = r.children.filter((c) => c.dir || files);
        kids.forEach((c, i) => { const last = i === kids.length - 1; out.push(L(`${prefix}${last ? "└───" : "├───"}${c.name}`)); if (c.dir) rec(c.path, prefix + (last ? "    " : "│   "), depth + 1); });
      };
      rec(n.path, "", 0);
      out.push(L(""));
      return { cwd, lines: out.slice(0, 500) };
    }
    case "cat": case "type": case "gc": case "get-content": case "more": case "less": case "head": case "tail": {
      const tailN = (() => { const i = args.findIndex((a) => /^-tail$/i.test(a) || a === "-n"); return i >= 0 ? Number(args[i + 1]) : cmd === "tail" ? 10 : cmd === "head" ? 10 : 0; })();
      const a = args.filter((x, i) => !x.startsWith("-") && !(i > 0 && /^-(tail|n|head)$/i.test(args[i - 1])))[0];
      if (!a) return { cwd, lines: [red("cmdlet Get-Content at command pipeline position 1"), red("Supply values for the following parameters:"), red("Path[0]: "), L("")] };
      const target = resolve(cwd, a);
      const n = getNode(target);
      if (!n) return { cwd, lines: notFound(target, "Get-Content") };
      if (n.dir) return { cwd, lines: [red(`Get-Content : Access to the path '${toWindowsPath(target)}' is denied.`), L("")] };
      recordEvent("file.opened", n.path, { via: "terminal", openable: n.openable, ext: n.ext });
      const text = fileText(n.path);
      if (text === null) {
        if (["txt", "md", "log", "ini", "csv", "json", "py", "js", "ts", "yml", "yaml", "cfg", "conf", "sh", "ps1", "bat", ""].includes(n.ext)) return { cwd, lines: [] };
        return { cwd, lines: [L(binaryJunk(n.path)), L(binaryJunk(n.path + "2")), L("")] };
      }
      let lines = text.replace(/\r\n/g, "\n").split("\n");
      if (tailN && cmd !== "head") lines = lines.slice(-tailN);
      if (cmd === "head") lines = lines.slice(0, tailN || 10);
      return { cwd, lines: lines.map((t) => L(t)) };
    }
    case "select-string": case "sls": case "findstr": case "grep": case "rg": {
      let pattern = "";
      let pathArg: string | undefined;
      const rest = [...args];
      const pi = rest.findIndex((a) => /^-pattern$/i.test(a) || a === "-e");
      if (pi >= 0) { pattern = rest[pi + 1] ?? ""; rest.splice(pi, 2); }
      const pa = rest.findIndex((a) => /^-path$/i.test(a));
      if (pa >= 0) { pathArg = rest[pa + 1]; rest.splice(pa, 2); }
      const positional = rest.filter((a) => !a.startsWith("-") && !a.startsWith("/"));
      if (!pattern) pattern = positional.shift() ?? "";
      if (!pathArg) pathArg = positional[0];
      if (!pattern) return { cwd, lines: [red("Select-String : Cannot bind argument to parameter 'Pattern' because it is an empty string."), L("")] };
      const ci = cmd !== "grep" || args.includes("-i") || args.includes("/i") || true;
      const root = pathArg ? resolve(cwd, pathArg.replace(/[*?].*$/, "")) : cwd;
      const rootNode = getNode(root);
      const targets = rootNode?.dir ? walk(root, false).filter((n) => !n.dir) : rootNode ? [rootNode] : [];
      const re = new RegExp(pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"), ci ? "i" : "");
      const out: Line[] = [];
      recordEvent("terminal.search", pattern.toLowerCase(), { root });
      for (const n of targets) {
        const text = fileText(n.path);
        if (text === null) continue;
        text.replace(/\r\n/g, "\n").split("\n").forEach((t, i) => { if (re.test(t)) out.push(L(`${toWindowsPath(n.path)}:${i + 1}:${t}`)); });
        if (out.length > 300) break;
      }
      if (!out.length) return { cwd, lines: [] };
      return { cwd, lines: [L(""), ...out, L("")] };
    }
    case "echo": case "write-output": case "write-host": return { cwd, lines: [L(args.join(" ").replace(/\$env:USERNAME/gi, profile.username).replace(/\$env:COMPUTERNAME/gi, profile.machineName).replace(/\$HOME|\$env:USERPROFILE/gi, toWindowsPath(home)))] };
    case "whoami": return { cwd, lines: [L(`${machine}\\${profile.username}`)] };
    case "hostname": return { cwd, lines: [L(profile.machineName)] };
    case "ver": return { cwd, lines: [L(""), L("Microsoft Windows [Version 10.0.26100.4652]")] };
    case "date": case "get-date": return { cwd, lines: [L(""), L(new Date().toLocaleString("en-US", { timeZone: profile.timezone, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })), L("")] };
    case "history": case "get-history": case "h": {
      const stored = fileText(`${home}/AppData/Roaming/Microsoft/Windows/PowerShell/PSReadLine/ConsoleHost_history.txt`) ?? "";
      const all = [...stored.replace(/\r\n/g, "\n").split("\n").filter(Boolean), ...runtimeHistory()];
      const n = args[0] && /^\d+$/.test(args[0]) ? Number(args[0]) : all.length;
      const start = Math.max(0, all.length - n);
      return { cwd, lines: [L(""), L("  Id CommandLine"), L("  -- -----------"), ...all.slice(start).map((t, i) => L(`${String(start + i + 1).padStart(4)} ${t}`)), L("")] };
    }
    case "ipconfig": return { cwd, lines: ["", "Windows IP Configuration", "", "", "Wireless LAN adapter Wi-Fi:", "", "   Connection-specific DNS Suffix  . : home", "   Link-local IPv6 Address . . . . . : fe80::a1c4:7e2f:9b3d:14c0%12", "   IPv4 Address. . . . . . . . . . . : 192.168.2.36", "   Subnet Mask . . . . . . . . . . . : 255.255.255.0", "   Default Gateway . . . . . . . . . : 192.168.2.1", "", "Ethernet adapter Bluetooth Network Connection:", "", "   Media State . . . . . . . . . . . : Media disconnected", "   Connection-specific DNS Suffix  . : ", ""].map((t) => L(t)) };
    case "ping": {
      const host = args.filter((a) => !a.startsWith("-"))[0];
      if (!host) return { cwd, lines: [L(""), L("Usage: ping [-t] [-a] [-n count] [-l size] target_name"), L("")] };
      const ssh = loadSsh();
      const known = Object.values(ssh.hosts).find((h) => h.aliases.map((x) => x.replace(/^.*@/, "")).includes(host.toLowerCase()));
      if (known || /^(google\.com|1\.1\.1\.1|8\.8\.8\.8|192\.168\.2\.\d+)$/i.test(host)) {
        const ip = known ? "142.44.187.209" : host.match(/^\d/) ? host : "142.251.41.78";
        return { cwd, lines: [L(""), L(`Pinging ${host} [${ip}] with 32 bytes of data:`, undefined, 200), ...[0, 1, 2, 3].map(() => L(`Reply from ${ip}: bytes=32 time=${18 + Math.floor(Math.random() * 30)}ms TTL=54`, undefined, 900)), L(""), L(`Ping statistics for ${ip}:`), L("    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),"), L("Approximate round trip times in milli-seconds:"), L("    Minimum = 19ms, Maximum = 47ms, Average = 31ms"), L("")] };
      }
      return { cwd, lines: [L(`Ping request could not find host ${host}. Please check the name and try again.`, undefined, 1500)] };
    }
    case "nslookup": return { cwd, lines: [L("Server:  UnKnown"), L("Address:  192.168.2.1"), L(""), L("*** UnKnown can't find " + (args[0] ?? "") + ": Non-existent domain"), L("")] };
    case "netstat": return { cwd, lines: ["", "Active Connections", "", "  Proto  Local Address          Foreign Address        State", "  TCP    127.0.0.1:4127         DESKTOP:0              LISTENING", "  TCP    192.168.2.36:50213     142.44.187.209:443     ESTABLISHED", "  TCP    192.168.2.36:50388     157.240.226.60:443     ESTABLISHED", "  TCP    192.168.2.36:50402     142.251.41.101:443     TIME_WAIT", ""].map((t) => L(t)) };
    case "systeminfo": return { cwd, lines: ["", `Host Name:                 ${profile.machineName}`, "OS Name:                   Microsoft Windows 11 Pro", "OS Version:                10.0.26100 N/A Build 26100", "OS Manufacturer:           Microsoft Corporation", `Registered Owner:          ${profile.displayName}`, "Original Install Date:     2021-06-14, 9:12:41 AM", "System Manufacturer:       LENOVO", "System Model:              21CB0069US", "System Type:               x64-based PC", "Processor(s):              1 Processor(s) Installed.", "                           [01]: Intel64 Family 6 Model 154 Stepping 3 GenuineIntel ~2100 Mhz", "Total Physical Memory:     32,478 MB", `Time Zone:                 (UTC-04:00) Atlantic Time (Canada)`, ""].map((t) => L(t)) };
    case "get-process": case "ps": case "tasklist": return { cwd, lines: ["", "Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName", "-------  ------    -----      -----     ------     --  -- -----------", "   1421      58   187644     232180      41.20   9812   1 chrome", "    612      31    68120      92448       3.14  11204   1 chrome", "    288      19    24140      44716       0.55   6420   1 explorer", "    401      22    49920      61228       2.03   7712   1 WhatsApp", "    133      11    21876      33640       0.31  12088   1 WindowsTerminal", "    102       9     9788      19204       0.08   3376   1 pwsh", "    884      44   211008     183340      88.62   4120   1 REAPER", "     93       8     6112      14020       0.02   5600   0 witness", ""].map((t) => L(t)) };
    case "git": return gitExec(cwd, args, repoFor(cwd), line);
    case "python": case "python3": case "py": {
      if (!args.length || args[0] === "-i") return { cwd, mode: { kind: "python" }, lines: [L("Python 3.12.4 (tags/v3.12.4:8e8a4ba, Jun  6 2024, 19:30:16) [MSC v.1940 64 bit (AMD64)] on win32"), L('Type "help", "copyright", "credits" or "license" for more information.')] };
      if (args[0] === "--version" || args[0] === "-V") return { cwd, lines: [L("Python 3.12.4")] };
      if (args[0] === "-c") return { cwd, lines: pyEval(args.slice(1).join(" ")) };
      if (args[0] === "-m") { if (args[1] === "pip") return { cwd, lines: [L("Requirement already satisfied: numpy in c:\\users\\" + profile.username + "\\appdata\\local\\programs\\python\\python312\\lib\\site-packages (2.0.1)")] }; return { cwd, lines: [red(`C:\\Users\\${profile.username}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe: No module named ${args[1]}`)] }; }
      const target = resolve(cwd, args[0]);
      const n = getNode(target);
      if (!n) return { cwd, lines: [red(`C:\\Users\\${profile.username}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe: can't open file '${toWindowsPath(target)}': [Errno 2] No such file or directory`)] };
      recordEvent("file.opened", n.path, { via: "python" });
      const scripts = loadContent<ScriptsFile>("terminal/scripts.json").scripts;
      const s = scripts.find((x) => normalizePath(x.path.replace(/\{user\}/g, profile.username)) === n.path);
      const argStr = args.slice(1).join(" ");
      if (s) {
        const run = (s.runs ?? []).find((r) => !r.argsMatch || new RegExp(r.argsMatch, "i").test(argStr));
        if (run) { if (run.flag) setFlag(run.flag, true); if (run.event) recordEvent("custom", run.event, { args: argStr }); recordEvent("script.ran", n.path, { args: argStr }); return { cwd, lines: run.lines.map(toLine) }; }
        if (s.default) { recordEvent("script.ran", n.path, { args: argStr }); return { cwd, lines: s.default.map(toLine) }; }
      }
      const text = fileText(n.path);
      if (text === null || !n.name.endsWith(".py")) return { cwd, lines: [red(`  File "${toWindowsPath(n.path)}", line 1`), red("SyntaxError: source code cannot contain null bytes")] };
      const imp = text.match(/^\s*(?:import|from)\s+([A-Za-z_][\w.]*)/m);
      return { cwd, lines: [red("Traceback (most recent call last):"), red(`  File "${toWindowsPath(n.path)}", line ${imp ? text.slice(0, imp.index).split("\n").length : 1}, in <module>`), red(imp ? `    ${imp[0].trim()}` : "    main()"), red(imp ? `ModuleNotFoundError: No module named '${imp[1].split(".")[0]}'` : "NameError: name 'main' is not defined")] };
    }
    case "pip": case "pip3": return { cwd, lines: args[0] === "list" ? ["Package        Version", "-------------- -------", "librosa        0.10.2", "numpy          2.0.1", "openai-whisper 20240930", "paramiko       3.4.1", "requests       2.32.3", "scipy          1.14.0", "soundfile      0.12.1", "torch          2.4.0", ""].map((t) => L(t)) : [L("Usage:"), L("  pip <command> [options]"), L("")] };
    case "node": case "npm": case "code": case "docker": case "wsl": case "choco": case "winget": return notRecognized(cmd);
    case "gpg": case "gpg2": return gpgExec(cwd, args, req.stdin, line);
    case "7z": case "7za": return sevenZipExec(cwd, args, req.stdin, line);
    case "openssl": return { cwd, lines: [red("openssl : The term 'openssl' is not recognized as the name of a cmdlet, function, script file, or operable program."), L("")] };
    case "ssh": {
      const target = args.filter((a) => !a.startsWith("-"))[0];
      if (!target) return { cwd, lines: [L("usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-B bind_interface] [-b bind_address]"), L("           [-c cipher_spec] [-D [bind_address:]port] [-E log_file]"), L("           [-e escape_char] [-F configfile] [-I pkcs11] [-i identity_file]"), L("           [-J destination] [-L address] [-l login_name] [-m mac_spec]"), L("           [-O ctl_cmd] [-o option] [-P tag] [-p port] [-R address]"), L("           [-S ctl_path] [-W host:port] [-w local_tun[:remote_tun]]"), L("           destination [command [argument ...]]")] };
      const ssh = loadSsh();
      const entry = Object.entries(ssh.hosts).find(([, h]) => h.aliases.map((x) => x.toLowerCase()).includes(target.toLowerCase()));
      if (!entry) {
        if ((ssh.unreachable ?? []).some((u) => target.toLowerCase().includes(u.toLowerCase()))) return { cwd, lines: [L(`ssh: connect to host ${target.replace(/^.*@/, "")} port 22: Connection timed out`, undefined, 4000)] };
        return { cwd, lines: [L(`ssh: Could not resolve hostname ${target.replace(/^.*@/, "")}: No such host is known.`, undefined, 800)] };
      }
      const [hostId, h] = entry;
      recordEvent("terminal.ssh", hostId, { target });
      if (h.flagOnConnect) setFlag(h.flagOnConnect, true);
      return { cwd, mode: { kind: "ssh", host: hostId, cwd: h.cwd }, prompt: h.prompt, lines: h.banner.map((t, i) => L(t, undefined, i === 0 ? 1200 : 60)) };
    }
    case "scp": case "sftp": return { cwd, lines: [L("ssh: connect to host " + (args[0] ?? "").replace(/^.*@/, "").replace(/:.*$/, "") + " port 22: Connection timed out", undefined, 4000)] };
    case "notepad": case "notepad.exe": {
      const target = args[0] ? resolve(cwd, args[0]) : null;
      const n = target ? getNode(target) : null;
      return { cwd, lines: [], open: { app: "file", props: n ? { path: n.path } : target ? { newFile: target } : {} } };
    }
    case "start": case "ii": case "invoke-item": case "explorer": case "explorer.exe": {
      const a = args.filter((x) => !x.startsWith("-"))[0];
      if (!a || a === ".") return { cwd, lines: [], open: { app: "explorer", props: { path: cwd } } };
      if (/^https?:\/\//i.test(a)) return { cwd, lines: [], open: { app: "chrome", props: { openUrl: a } } };
      const target = resolve(cwd, a);
      const n = getNode(target);
      if (!n) return { cwd, lines: [red(`Start-Process : This command cannot be run due to the error: The system cannot find the file specified.`), L("")] };
      return { cwd, lines: [], open: { app: n.dir ? "explorer" : "file", props: { path: n.path } } };
    }
    case "help": case "get-help": case "man": return { cwd, lines: ["", "TOPIC", "    Windows PowerShell Help System", "", "SHORT DESCRIPTION", "    Displays help about Windows PowerShell cmdlets and concepts.", "", "LONG DESCRIPTION", "    Windows PowerShell Help describes Windows PowerShell cmdlets,", "    functions, scripts, and modules, and explains concepts, including", "    the elements of the Windows PowerShell language.", "", "    Get-Help <cmdlet-name>", ""].map((t) => L(t)) };
    case "get-command": case "gcm": return { cwd, lines: ["", "CommandType     Name                                               Version    Source", "-----------     ----                                               -------    ------", "Application     git.exe                                            2.47.1.1   C:\\Program Files\\Git\\cmd\\git.exe", "Application     gpg.exe                                            2.4.5.0    C:\\Program Files (x86)\\GnuPG\\bin\\gpg.exe", "Application     python.exe                                         3.12.41... C:\\Users\\" + profile.username + "\\AppData\\Local\\Programs\\Python\\Python312\\python.exe", "Application     ssh.exe                                            9.5.0.0    C:\\Windows\\System32\\OpenSSH\\ssh.exe", "Application     7z.exe                                             24.8.0.0   C:\\Program Files\\7-Zip\\7z.exe", "Application     ffmpeg.exe                                         7.0.2.0    C:\\ffmpeg\\bin\\ffmpeg.exe", "Application     sox.exe                                            14.4.2.0   C:\\Program Files (x86)\\sox-14-4-2\\sox.exe", ""].map((t) => L(t)) };
    case "ffmpeg": case "ffprobe": case "sox": case "soxi": {
      const a = args.filter((x) => !x.startsWith("-"))[0];
      const target = a ? resolve(cwd, a) : null;
      const n = target ? getNode(target) : null;
      if (!n) return { cwd, lines: [L(`${cmd} version ${cmd.startsWith("ff") ? "7.0.2-full_build-www.gyan.dev" : "14.4.2"}`), L(a ? `${toWindowsPath(target!)}: No such file or directory` : "")] };
      recordEvent("file.opened", n.path, { via: cmd });
      const dur = Math.max(4, Math.round(n.size / 192000));
      if (cmd.startsWith("sox")) return { cwd, lines: ["", `Input File     : '${n.name}'`, "Channels       : 2", "Sample Rate    : 48000", "Precision      : 24-bit", `Duration       : ${String(Math.floor(dur / 3600)).padStart(2, "0")}:${String(Math.floor((dur % 3600) / 60)).padStart(2, "0")}:${String(dur % 60).padStart(2, "0")}.00 = ${dur * 48000} samples = ${dur * 3600} CDDA sectors`, `File Size      : ${(n.size / 1e6).toFixed(2)}M`, "Bit Rate       : 2.30M", "Sample Encoding: 24-bit Signed Integer PCM", ""].map((t) => L(t)) };
      return { cwd, lines: [`ffprobe version 7.0.2-full_build-www.gyan.dev Copyright (c) 2007-2024 the FFmpeg developers`, `Input #0, wav, from '${n.name}':`, "  Metadata:", "    encoder         : REAPER", `  Duration: ${String(Math.floor(dur / 3600)).padStart(2, "0")}:${String(Math.floor((dur % 3600) / 60)).padStart(2, "0")}:${String(dur % 60).padStart(2, "0")}.00, bitrate: 2304 kb/s`, "  Stream #0:0: Audio: pcm_s24le ([1][0][0][0] / 0x0001), 48000 Hz, 2 channels, s32 (24 bit), 2304 kb/s", ""].map((t) => L(t)) };
    }
    case "get-filehash": case "sha256sum": case "certutil": {
      const a = args.filter((x) => !x.startsWith("-") && !/^sha\d+$/i.test(x) && !/^-hashfile$/i.test(x))[0];
      const target = a ? resolve(cwd, a) : null;
      const n = target ? getNode(target) : null;
      if (!n) return { cwd, lines: notFound(target ?? cwd, "Get-FileHash") };
      const hash = crypto.createHash("sha256").update(n.path + n.size).digest("hex").toUpperCase();
      return { cwd, lines: [L(""), L("Algorithm       Hash                                                                   Path"), L("---------       ----                                                                   ----"), L(`SHA256          ${hash} ${toWindowsPath(n.path)}`), L("")] };
    }
    case "set": case "get-childitem env:": case "env": return { cwd, lines: [L(`COMPUTERNAME=${profile.machineName}`), L(`HOMEPATH=\\Users\\${profile.username}`), L("OS=Windows_NT"), L(`USERNAME=${profile.username}`), L(`USERPROFILE=${toWindowsPath(home)}`), L("WITNESS_RELAY=relay.wrn.sh"), L("")] };
    case "shutdown": case "restart-computer": case "stop-computer": return { cwd, lines: [red("shutdown : Access is denied.(5)")] };
    case "mkdir": case "md": {
      const a = args.filter((x) => !x.startsWith("-"))[0];
      if (!a) return { cwd, lines: [red("mkdir : Cannot process command because of one or more missing mandatory parameters: Path."), L("")] };
      const target = resolve(cwd, a);
      if (getNode(target)) return { cwd, lines: [red(`mkdir : An item with the specified name ${toWindowsPath(target)} already exists.`), L("")] };
      const parent = parentPath(target);
      if (!parent || !getNode(parent)?.dir) return { cwd, lines: notFound(parent ?? target, "New-Item") };
      fsMkdir(target);
      recordEvent("folder.created", target, { via: "terminal" });
      const node = getNode(target);
      return { cwd, lines: node ? gciLines(parent, [node]) : [] };
    }
    case "new-item": case "ni": case "touch": {
      const a = args.filter((x) => !x.startsWith("-"))[0];
      if (!a) return { cwd, lines: [red(`${cmd} : Cannot process command because of one or more missing mandatory parameters: Path.`), L("")] };
      const target = resolve(cwd, a);
      const wantDir = /directory/i.test(line);
      const parent = parentPath(target);
      if (!parent || !getNode(parent)?.dir) return { cwd, lines: notFound(parent ?? target, "New-Item") };
      if (getNode(target) && !/-force/i.test(line)) return { cwd, lines: [red(`${cmd} : The file '${toWindowsPath(target)}' already exists.`), L("")] };
      if (wantDir) fsMkdir(target); else writeFile(target, "");
      recordEvent(wantDir ? "folder.created" : "file.created", target, { via: "terminal" });
      const node = getNode(target);
      return { cwd, lines: node ? gciLines(parent, [node]) : [] };
    }
    case "set-content": case "sc": case "add-content": case "ac": case "out-file": {
      const positional = args.filter((x) => !x.startsWith("-"));
      const target = resolve(cwd, positional[0]);
      const value = line.match(/-value\s+("([^"]*)"|'([^']*)'|(\S+))/i);
      const text = value ? (value[2] ?? value[3] ?? value[4] ?? "") : positional.slice(1).join(" ");
      const parent = parentPath(target);
      if (!parent || !getNode(parent)?.dir) return { cwd, lines: notFound(parent ?? target, "Set-Content") };
      const prev = cmd.startsWith("a") ? resolveText(target) ?? "" : "";
      writeFile(target, prev ? `${prev}\r\n${text}` : text);
      recordEvent("file.saved", target, { via: "terminal" });
      return { cwd, lines: [] };
    }
    case "rm": case "del": case "erase": case "remove-item": case "ri": case "rmdir": case "rd": {
      const targets = args.filter((x) => !x.startsWith("-"));
      if (!targets.length) return { cwd, lines: [red(`${cmd} : Cannot process command because of one or more missing mandatory parameters: Path.`), L("")] };
      const force = /(^|\s)(-f|-force|-rf|-fr)(\s|$)/i.test(line);
      const out: Line[] = [];
      for (const t of targets) {
        const target = resolve(cwd, t);
        const node = getNode(target);
        if (!node) { out.push(...notFound(target, "Remove-Item")); continue; }
        if (node.dir && (listDir(target, { showHidden: true })?.children.length ?? 0) > 0 && !/(-r|-recurse|-rf|-fr)/i.test(line)) {
          out.push(red(`${cmd} : The directory is not empty: '${toWindowsPath(target)}'`), red("Use -Recurse to remove it and everything in it."), L(""));
          continue;
        }
        fsRemove(target, { seed: contentSeed(target), dir: node.dir });
        if (force) fsPurge(target);
        recordEvent("file.deleted", target, { via: "terminal", permanent: force });
      }
      return { cwd, lines: out };
    }
    case "mv": case "move": case "move-item": case "ren": case "rename": case "rename-item": {
      const positional = args.filter((x) => !x.startsWith("-"));
      if (positional.length < 2) return { cwd, lines: [red(`${cmd} : Cannot process command because of one or more missing mandatory parameters: Destination.`), L("")] };
      const from = resolve(cwd, positional[0]);
      const node = getNode(from);
      if (!node) return { cwd, lines: notFound(from, "Move-Item") };
      const destRaw = positional[1];
      const destNode = getNode(resolve(cwd, destRaw));
      const to = destNode?.dir ? `${resolve(cwd, destRaw)}/${node.name}` : resolve(cwd, destRaw);
      if (getNode(to)) return { cwd, lines: [red(`${cmd} : Cannot create a file when that file already exists.`), L("")] };
      const ov = getOverlay(from);
      fsRename(from, to, { dir: node.dir, seed: contentSeed(from), body: ov?.body ?? null, disk: ov?.disk ?? null, kind: (node.kind as string) ?? null });
      recordEvent("file.renamed", from, { to, via: "terminal" });
      return { cwd, lines: [] };
    }
    case "cp": case "copy": case "copy-item": case "cpi": {
      const positional = args.filter((x) => !x.startsWith("-"));
      if (positional.length < 2) return { cwd, lines: [red(`${cmd} : Cannot process command because of one or more missing mandatory parameters: Destination.`), L("")] };
      const from = resolve(cwd, positional[0]);
      const node = getNode(from);
      if (!node) return { cwd, lines: notFound(from, "Copy-Item") };
      const destNode = getNode(resolve(cwd, positional[1]));
      const to = destNode?.dir ? `${resolve(cwd, positional[1])}/${node.name}` : resolve(cwd, positional[1]);
      const ov = getOverlay(from);
      copyTo(to, { dir: node.dir, seed: contentSeed(from), body: ov?.body ?? resolveText(from), disk: ov?.disk ?? null, kind: (node.kind as string) ?? null });
      recordEvent("file.copied", from, { to, via: "terminal" });
      return { cwd, lines: [] };
    }
    default: {
      // Running a file directly: .\script.py, .\thing.exe, a bare path
      if (/^[.~a-zA-Z]/.test(argv[0]) && (argv[0].includes("/") || argv[0].includes("\\") || argv[0].startsWith("."))) {
        const target = resolve(cwd, argv[0]);
        const n = getNode(target);
        if (n && !n.dir) {
          if (n.ext === "py") return exec({ ...req, line: `python ${line}` });
          if (n.ext === "ps1") { const t = fileText(n.path); recordEvent("file.opened", n.path, { via: "terminal" }); return { cwd, lines: t === null ? [] : [red(`${toWindowsPath(n.path)} : File ${toWindowsPath(n.path)} cannot be loaded because running scripts is disabled on this system. For more information, see about_Execution_Policies at https:/go.microsoft.com/fwlink/?LinkID=135170.`), L("")] }; }
          if (n.ext === "exe") return { cwd, lines: [red(`Program '${n.name}' failed to run: The specified executable is not a valid application for this OS platform.`), L("")] };
          return { cwd, lines: [], open: { app: "file", props: { path: n.path } } };
        }
        if (n && n.dir) return { cwd, lines: [red(`${toWindowsPath(target)} : The term '${toWindowsPath(target)}' is not recognized as the name of a cmdlet, function, script file, or operable program.`), L("")] };
      }
      void flags;
      return notRecognized(argv[0]);
    }
  }
}

// ---------------- git ----------------
function gitExec(cwd: string, args: string[], repo: Repo | null, line: string): ExecResult {
  const sub = args[0];
  if (!sub || sub === "--help") return { cwd, lines: ["usage: git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>]", "           [--exec-path[=<path>]] [--html-path] [--man-path] [--info-path]", "           [-p | --paginate | -P | --no-pager] [--no-replace-objects] [--bare]", "           [--git-dir=<path>] [--work-tree=<path>] [--namespace=<name>]", "           [--config-env=<name>=<envvar>] <command> [<args>]", "", "These are common Git commands used in various situations:", "", "start a working area (see also: git help tutorial)", "   clone     Clone a repository into a new directory", "   init      Create an empty Git repository or reinitialize an existing one", ""].map((t) => L(t)) };
  if (sub === "--version" || sub === "version") return { cwd, lines: [L("git version 2.47.1.windows.1")] };
  if (sub === "clone") return { cwd, lines: [L(`Cloning into '${(args[1] ?? "").split("/").pop()?.replace(/\.git$/, "") ?? "repo"}'...`), L("fatal: unable to access '" + (args[1] ?? "") + "': Could not resolve host: " + (args[1] ?? "").replace(/^https?:\/\//, "").split("/")[0], "red", 3000)] };
  if (!repo) return { cwd, lines: [red("fatal: not a git repository (or any of the parent directories): .git")] };
  recordEvent("git.cmd", `${repo.root}#${sub}`, { line });
  const commits = [...repo.commits].sort((a, b) => b.date.localeCompare(a.date));
  const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: loadProfile().timezone, weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, year: "numeric" }).replace(",", "").replace(",", "") + " -0300";
  switch (sub) {
    case "status": {
      const st = repo.status ?? {};
      const out: Line[] = [L(`On branch ${repo.branch}`)];
      if (repo.remote) out.push(L(`Your branch is up to date with 'origin/${repo.branch}'.`), L(""));
      if (st.staged?.length) { out.push(L("Changes to be committed:"), L('  (use "git restore --staged <file>..." to unstage)')); st.staged.forEach((f) => out.push(L(`\tmodified:   ${f}`, "green"))); out.push(L("")); }
      if (st.modified?.length) { out.push(L("Changes not staged for commit:"), L('  (use "git add <file>..." to update what will be committed)'), L('  (use "git restore <file>..." to discard changes in working directory)')); st.modified.forEach((f) => out.push(L(`\tmodified:   ${f}`, "red"))); out.push(L("")); }
      if (st.untracked?.length) { out.push(L("Untracked files:"), L('  (use "git add <file>..." to include in what will be committed)')); st.untracked.forEach((f) => out.push(L(`\t${f}`, "red"))); out.push(L("")); }
      if (!st.staged?.length && !st.modified?.length && !st.untracked?.length) out.push(L(""), L("nothing to commit, working tree clean"));
      else if (!st.staged?.length) out.push(L('no changes added to commit (use "git add" and/or "git commit -a")'));
      return { cwd, lines: out };
    }
    case "log": {
      const oneline = args.includes("--oneline");
      const ni = args.findIndex((a) => a === "-n" || a === "--max-count");
      let n = ni >= 0 ? Number(args[ni + 1]) : commits.length;
      const dash = args.find((a) => /^-\d+$/.test(a)); if (dash) n = Number(dash.slice(1));
      const grep = args.find((a) => a.startsWith("--grep="))?.slice(7);
      const list = commits.filter((c) => !grep || c.message.toLowerCase().includes(grep.toLowerCase())).slice(0, n);
      if (oneline) return { cwd, lines: list.map((c, i) => L(`${c.hash.slice(0, 7)}${i === 0 ? ` (HEAD -> ${repo.branch}${repo.remote ? `, origin/${repo.branch}` : ""})` : ""} ${c.message.split("\n")[0]}`)) };
      const out: Line[] = [];
      list.forEach((c, i) => {
        out.push(L(`commit ${c.hash}${i === 0 ? ` (HEAD -> ${repo.branch}${repo.remote ? `, origin/${repo.branch}` : ""})` : ""}`, "yellow"));
        out.push(L(`Author: ${c.author} <${c.email}>`), L(`Date:   ${fmtDate(c.date)}`), L(""));
        c.message.split("\n").forEach((m) => out.push(L(`    ${m}`)));
        out.push(L(""));
      });
      return { cwd, lines: out };
    }
    case "show": {
      const ref = args.find((a) => !a.startsWith("-"));
      const c = ref && ref !== "HEAD" ? commits.find((x) => x.hash.startsWith(ref)) : commits[0];
      if (!c) return { cwd, lines: [red(`fatal: ambiguous argument '${ref}': unknown revision or path not in the working tree.`), red("Use '--' to separate paths from revisions, like this:"), red("'git <command> [<revision>...] -- [<file>...]'")] };
      const out: Line[] = [L(`commit ${c.hash}`, "yellow"), L(`Author: ${c.author} <${c.email}>`), L(`Date:   ${fmtDate(c.date)}`), L("")];
      c.message.split("\n").forEach((m) => out.push(L(`    ${m}`)));
      out.push(L(""));
      if (c.diff) c.diff.split("\n").forEach((d) => out.push(L(d, d.startsWith("+") && !d.startsWith("+++") ? "green" : d.startsWith("-") && !d.startsWith("---") ? "red" : d.startsWith("@@") ? "cyan" : undefined)));
      else (c.files ?? []).forEach((f) => out.push(L(`diff --git a/${f} b/${f}`), L(`--- a/${f}`), L(`+++ b/${f}`), L("Binary files differ")));
      recordEvent("git.show", c.hash);
      return { cwd, lines: out };
    }
    case "branch": return { cwd, lines: [L(`* ${repo.branch}`, "green"), ...(repo.branches ?? []).filter((b) => b !== repo.branch).map((b) => L(`  ${b}`)), ...(args.includes("-a") && repo.remote ? [L(`  remotes/origin/HEAD -> origin/${repo.branch}`, "red"), L(`  remotes/origin/${repo.branch}`, "red")] : [])] };
    case "remote": return { cwd, lines: repo.remote ? (args.includes("-v") ? [L(`origin\t${repo.remote} (fetch)`), L(`origin\t${repo.remote} (push)`)] : [L("origin")]) : [] };
    case "tag": return { cwd, lines: (repo.tags ?? []).map((t) => L(t)) };
    case "stash": return { cwd, lines: args[1] === "list" ? (repo.stash ?? []).map((s, i) => L(`stash@{${i}}: ${s}`)) : [L("No local changes to save")] };
    case "diff": return { cwd, lines: (repo.status?.modified ?? []).flatMap((f) => [L(`diff --git a/${f} b/${f}`), L(`index 3b1c9e2..7d0af41 100644`), L(`--- a/${f}`), L(`+++ b/${f}`), L("@@ -1,3 +1,4 @@", "cyan"), L("+# WIP", "green")]) };
    case "fetch": case "pull": case "push": return { cwd, lines: [L(`fatal: unable to access '${repo.remote ?? "origin"}': Could not resolve host: ${(repo.remote ?? "github.com").replace(/^https?:\/\//, "").split("/")[0]}`, "red", 2500)] };
    case "add": case "commit": case "checkout": case "switch": case "reset": case "restore": case "merge": case "rebase": return { cwd, lines: [red(`fatal: Unable to create '${toWindowsPath(repo.root)}\\.git\\index.lock': Permission denied`)] };
    case "blame": return { cwd, lines: [red("fatal: no such path '" + (args[1] ?? "") + "' in HEAD")] };
    case "reflog": return { cwd, lines: commits.slice(0, 8).map((c, i) => L(`${c.hash.slice(0, 7)} HEAD@{${i}}: commit: ${c.message.split("\n")[0]}`)) };
    case "config": return { cwd, lines: args.includes("user.email") ? [L(commits[0]?.email ?? "")] : args.includes("user.name") ? [L(commits[0]?.author ?? "")] : [L("user.name=" + (commits[0]?.author ?? "")), L("user.email=" + (commits[0]?.email ?? "")), L("core.autocrlf=true")] };
    default: return { cwd, lines: [red(`git: '${sub}' is not a git command. See 'git --help'.`)] };
  }
}

// ---------------- decryption ----------------
function secretFor(p: string) {
  const f = loadContent<SecretsFile>("terminal/secrets.json").files;
  const user = loadProfile().username;
  const n = normalizePath(p);
  for (const [k, v] of Object.entries(f)) if (normalizePath(k.replace(/\{user\}/g, user)) === n) return v;
  return null;
}
function unlock(target: string, s: NonNullable<ReturnType<typeof secretFor>>): void {
  for (const o of s.outputs) reveal("file", normalizePath(o));
  if (s.flag) setFlag(s.flag, true);
  recordEvent("custom", `decrypted:${target}`, null);
}

function gpgExec(cwd: string, args: string[], stdin: string | undefined, line: string): ExecResult {
  const isDecrypt = args.some((a) => a === "-d" || a === "--decrypt") || args.some((a) => /\.(gpg|asc|pgp)$/i.test(a));
  if (args.includes("--version")) return { cwd, lines: [L("gpg (GnuPG) 2.4.5"), L("libgcrypt 1.10.3"), L("Copyright (C) 2024 g10 Code GmbH")] };
  if (args.includes("--list-keys") || args.includes("-k")) return { cwd, lines: [L("C:\\Users\\" + loadProfile().username + "\\AppData\\Roaming\\gnupg\\pubring.kbx"), L("--------------------------------------------------------------"), L("pub   ed25519 2024-02-11 [SC]"), L("      7F2A9C1D44E0B8A31C6D5E2F90AB47C3D1E8F6A2"), L("uid           [ultimate] Wren Castellanos <wren.castellanos@gmail.com>"), L("sub   cv25519 2024-02-11 [E]"), L("")] };
  const file = args.filter((a) => !a.startsWith("-"))[0];
  if (!file) return { cwd, lines: [L("gpg: Go ahead and type your message ...")] };
  const target = resolve(cwd, file);
  const n = getNode(target);
  if (!n) return { cwd, lines: [red(`gpg: can't open '${file}': No such file or directory`), red(`gpg: decrypt_message failed: No such file or directory`)] };
  const s = secretFor(n.path);
  if (!s || !isDecrypt) return { cwd, lines: [red("gpg: no valid OpenPGP data found."), red("gpg: decrypt_message failed: Unknown system error")] };
  if (stdin === undefined) return { cwd, lines: [], askSecret: { prompt: `Enter passphrase for '${n.name}': ` } };
  recordEvent("terminal.decrypt", n.path, { ok: null });
  const ok = crypto.createHash("sha256").update(stdin.trim().toLowerCase().replace(/[^a-z0-9]/g, "")).digest("hex") === s.sha256;
  if (!ok) return { cwd, lines: [L("gpg: AES256.CFB encrypted data"), red("gpg: encrypted with 1 passphrase"), red("gpg: decryption failed: Bad session key")] };
  unlock(n.path, s);
  const outs = s.outputs.map((o) => o.slice(o.lastIndexOf("/") + 1));
  return { cwd, lines: [L("gpg: AES256.CFB encrypted data"), L("gpg: encrypted with 1 passphrase"), ...(s.okLines ?? []).map((t) => L(t)), ...outs.map((o) => L(`gpg: original file name='${o}'`))] };
}

function sevenZipExec(cwd: string, args: string[], stdin: string | undefined, line: string): ExecResult {
  const header = [L(""), L("7-Zip 24.08 (x64) : Copyright (c) 1999-2024 Igor Pavlov : 2024-08-11"), L("")];
  const sub = args[0];
  const file = args.slice(1).filter((a) => !a.startsWith("-"))[0];
  const passArg = args.find((a) => a.startsWith("-p"))?.slice(2);
  if (!sub || !file) return { cwd, lines: [...header, L("Usage: 7z <command> [<switches>...] <archive_name> [<file_names>...]"), L(""), L("<Commands>"), L("  a : Add files to archive"), L("  e : Extract files from archive (without using directory names)"), L("  l : List contents of archive"), L("  x : eXtract files with full paths"), L("")] };
  const target = resolve(cwd, file);
  const n = getNode(target);
  if (!n) return { cwd, lines: [...header, L(`Scanning the drive for archives:`), red(`ERROR: The system cannot find the file specified.`), red(toWindowsPath(target)), L(""), L("System ERROR:"), L("The system cannot find the file specified."), L("")] };
  const s = secretFor(n.path);
  if (!s) return { cwd, lines: [...header, L(`Scanning the drive for archives:`), L(`1 file, ${n.size} bytes`), L(""), L(`Extracting archive: ${n.name}`), L(""), red("ERROR: " + n.name), red("Can not open the file as archive"), L(""), L("Can't open as archive: 1"), L("")] };
  if (sub === "l") return { cwd, lines: [...header, L(`Listing archive: ${n.name}`), L(""), L("--"), L(`Path = ${n.name}`), L("Type = 7z"), L("Method = LZMA2:24 7zAES"), L("Solid = -"), L("Blocks = 1"), L(""), L("   Date      Time    Attr         Size   Compressed  Name"), L("------------------- ----- ------------ ------------  ------------------------"), ...s.outputs.map((o) => L(`2026-08-29 23:41:07 ....A      1849230      1662004  ${o.slice(o.lastIndexOf("/") + 1)}`)), L("------------------- ----- ------------ ------------  ------------------------"), L("")] };
  const pw = passArg ?? stdin;
  if (pw === undefined) return { cwd, lines: [...header, L(`Scanning the drive for archives:`), L(`1 file, ${n.size} bytes`), L(""), L(`Extracting archive: ${n.name}`), L("--"), L(`Path = ${n.name}`), L("Type = 7z"), L(""), L("")], askSecret: { prompt: "Enter password (will not be echoed):" } };
  recordEvent("terminal.decrypt", n.path, { ok: null });
  const ok = crypto.createHash("sha256").update(pw.trim().toLowerCase().replace(/[^a-z0-9]/g, "")).digest("hex") === s.sha256;
  if (!ok) return { cwd, lines: [L(""), red(`ERROR: Data Error in encrypted file. Wrong password? : ${s.outputs[0]?.slice(s.outputs[0].lastIndexOf("/") + 1)}`), L(""), L("Sub items Errors: 1"), L(""), L("Archives with Errors: 1"), L(""), L("Sub items Errors: 1"), L("")] };
  unlock(n.path, s);
  return { cwd, lines: [L(""), L("Everything is Ok"), L(""), L(`Files: ${s.outputs.length}`), L("Size:       1849230"), L("Compressed: " + n.size), L("")] };
}

// ---------------- ssh ----------------
function loadSsh(): SshFile { try { return loadContent<SshFile>("terminal/ssh.json"); } catch { return { hosts: {} }; } }

function sshExec(mode: { kind: "ssh"; host: string; cwd: string }, line: string, localCwd: string): ExecResult {
  const h = loadSsh().hosts[mode.host];
  if (!h) return { cwd: localCwd, lines: [L("Connection closed by remote host.")], mode: null };
  if (!line) return { cwd: localCwd, lines: [], mode };
  recordEvent("terminal.ssh.cmd", `${mode.host}#${line.split(/\s+/)[0]}`, { line });
  if (line === "exit" || line === "logout" || line === "\x04") return { cwd: localCwd, lines: [L("logout"), L(`Connection to ${h.aliases[h.aliases.length - 1].replace(/^.*@/, "")} closed.`)], mode: null };
  const cmds = h.commands ?? {};
  const exact = cmds[line];
  if (exact) return { cwd: localCwd, lines: exact.map(toLine), mode };
  const [c, ...rest] = line.split(/\s+/);
  const wildcard = Object.entries(cmds).find(([k]) => k.endsWith(" *") && k.slice(0, -2) === c);
  if (wildcard) return { cwd: localCwd, lines: wildcard[1].map((l) => toLine(typeof l === "string" ? l.replace(/\$1/g, rest.join(" ")) : l)), mode };
  const files = h.files ?? {};
  if (c === "ls" || c === "ll" || c === "dir") return { cwd: localCwd, lines: [L(Object.keys(files).join("  "))], mode };
  if (c === "pwd") return { cwd: localCwd, lines: [L(h.cwd)], mode };
  if (c === "whoami") return { cwd: localCwd, lines: [L(h.prompt.split("@")[0])], mode };
  if (c === "hostname") return { cwd: localCwd, lines: [L(h.prompt.split("@")[1]?.split(":")[0] ?? "relay")], mode };
  if (c === "cat" || c === "less" || c === "more" || c === "head" || c === "tail") {
    const f = rest.filter((r) => !r.startsWith("-"))[0] ?? "";
    const body = files[f] ?? files[f.replace(/^\.\//, "")];
    if (body === undefined) return { cwd: localCwd, lines: [L(`${c}: ${f}: No such file or directory`)], mode };
    recordEvent("terminal.ssh.read", `${mode.host}#${f}`);
    return { cwd: localCwd, lines: body.split("\n").map((t) => L(t)), mode };
  }
  if (c === "cd") return { cwd: localCwd, lines: rest[0] && rest[0] !== "~" && rest[0] !== "." ? [L(`-bash: cd: ${rest[0]}: No such file or directory`)] : [], mode };
  if (c === "clear") return { cwd: localCwd, lines: [], mode, clear: true };
  if (c === "sudo") return { cwd: localCwd, lines: [L(`${h.prompt.split("@")[0]} is not in the sudoers file.  This incident will be reported.`)], mode };
  if (c === "rm" || c === "mv" || c === "nano" || c === "vim" || c === "vi" || c === "touch" || c === "chmod") return { cwd: localCwd, lines: [L(`-bash: ${c}: Permission denied`)], mode };
  if (c === "uptime") return { cwd: localCwd, lines: [L(` ${new Date().toLocaleTimeString("en-GB", { timeZone: "UTC" })} up 61 days,  4:17,  1 user,  load average: 0.03, 0.04, 0.00`)], mode };
  if (c === "uname") return { cwd: localCwd, lines: [L("Linux relay 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux")], mode };
  if (c === "df" || c === "free" || c === "top" || c === "htop") return { cwd: localCwd, lines: [L("Filesystem      Size  Used Avail Use% Mounted on"), L("/dev/vda1        25G  6.1G   18G  26% /")], mode };
  return { cwd: localCwd, lines: [L(`-bash: ${c}: command not found`)], mode };
}

// ---------------- python REPL ----------------
function pyEval(src: string): Line[] {
  const s = src.trim();
  if (!s) return [];
  const m = s.match(/^print\((.*)\)$/);
  const expr = m ? m[1] : s;
  const str = expr.match(/^(['"])(.*)\1$/);
  if (str) return [L(m ? str[2] : `'${str[2]}'`)];
  if (/^[\d\s+\-*/().%]+$/.test(expr) && expr.trim()) { try { const v = Function(`"use strict";return (${expr.replace(/\/\//g, "/")})`)(); return [L(String(Number.isInteger(v) ? v : Number(v.toFixed(12))))]; } catch { /* fall through */ } }
  if (/^(import|from)\s/.test(s)) { const mod = s.split(/\s+/)[1]; return ["os", "sys", "json", "math", "hashlib", "numpy", "scipy", "librosa", "soundfile", "requests", "paramiko", "whisper", "time", "datetime", "re"].includes(mod.split(".")[0]) ? [] : [red("Traceback (most recent call last):"), red('  File "<stdin>", line 1, in <module>'), red(`ModuleNotFoundError: No module named '${mod}'`)]; }
  if (/^help\(\)?$/.test(s)) return [L("Type help() for interactive help, or help(object) for help about object.")];
  if (/^[A-Za-z_]\w*$/.test(s)) return [red("Traceback (most recent call last):"), red('  File "<stdin>", line 1, in <module>'), red(`NameError: name '${s}' is not defined`)];
  return [red("  File \"<stdin>\", line 1"), red(`    ${s}`), red("    ^"), red("SyntaxError: invalid syntax")];
}
function pyExec(line: string, cwd: string): ExecResult {
  if (/^(exit\(\)|quit\(\)|exit|quit)$/.test(line.trim())) return { cwd, lines: [], mode: null };
  recordEvent("terminal.py", line.slice(0, 40), { line });
  return { cwd, lines: pyEval(line), mode: { kind: "python" } };
}
