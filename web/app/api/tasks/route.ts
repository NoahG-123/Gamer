import { json } from "@/lib/http";
import { loadProfile } from "@/lib/content";
export const dynamic = "force-dynamic";

/**
 * Task Manager's process table. The desktop merges the windows actually open into this
 * list; everything here is the background of a working Windows install, with figures
 * that drift the way real ones do.
 */
const BASE: { name: string; pid: number; cpuBase: number; memBase: number; status?: string }[] = [
  { name: "System", pid: 4, cpuBase: 0.4, memBase: 0.1 },
  { name: "System interrupts", pid: 0, cpuBase: 0.3, memBase: 0 },
  { name: "Registry", pid: 132, cpuBase: 0, memBase: 12.4 },
  { name: "Client Server Runtime Process", pid: 704, cpuBase: 0.1, memBase: 1.6 },
  { name: "Windows Logon Application", pid: 812, cpuBase: 0, memBase: 2.9 },
  { name: "Desktop Window Manager", pid: 1204, cpuBase: 1.8, memBase: 96.2 },
  { name: "Windows Explorer", pid: 6440, cpuBase: 0.6, memBase: 78.4 },
  { name: "Service Host: Network Service", pid: 1932, cpuBase: 0.1, memBase: 9.8 },
  { name: "Service Host: Local System", pid: 1064, cpuBase: 0.2, memBase: 22.6 },
  { name: "Antimalware Service Executable", pid: 3388, cpuBase: 1.2, memBase: 214.7 },
  { name: "Windows Audio Device Graph Isolation", pid: 4128, cpuBase: 0.4, memBase: 18.1 },
  { name: "Realtek Audio Console", pid: 5012, cpuBase: 0, memBase: 14.3 },
  { name: "Microsoft OneDrive", pid: 7320, cpuBase: 0.2, memBase: 64.9 },
  { name: "Steinberg ASIO Host", pid: 5880, cpuBase: 0.3, memBase: 31.5, status: "Suspended" },
  { name: "Windows Security notification icon", pid: 6912, cpuBase: 0, memBase: 6.7 },
  { name: "Print Spooler", pid: 2280, cpuBase: 0, memBase: 8.2 },
];

export async function GET() {
  const t = Date.now() / 1000;
  const wobble = (seed: number, amt: number) => (Math.sin(t / (7 + (seed % 5)) + seed) + 1) / 2 * amt;
  const processes = BASE.map((p, i) => ({
    name: p.name, pid: p.pid,
    cpu: Number((p.cpuBase + wobble(i, p.cpuBase > 0 ? 1.4 : 0.2)).toFixed(1)),
    memMb: Number((p.memBase + wobble(i + 30, p.memBase * 0.06)).toFixed(1)),
    disk: Number(wobble(i + 60, p.name.includes("Antimalware") ? 2.4 : 0.3).toFixed(1)),
    network: Number(wobble(i + 90, p.name.includes("OneDrive") ? 0.4 : 0.05).toFixed(2)),
    app: false, status: p.status,
  }));
  const memTotalGb = 16;
  const memUsedGb = Number((5.2 + wobble(3, 1.1)).toFixed(1));
  return json({
    processes,
    totals: {
      cpu: Number((9 + wobble(1, 22)).toFixed(0)),
      memPct: Math.round((memUsedGb / memTotalGb) * 100),
      memUsedGb, memTotalGb,
      diskPct: Number((2 + wobble(2, 9)).toFixed(0)),
      netMbps: Number(wobble(5, 1.2).toFixed(1)),
      machine: loadProfile().machineName,
    },
  });
}
