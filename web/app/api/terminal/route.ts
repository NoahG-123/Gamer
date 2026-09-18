import { NextRequest } from "next/server";
import { exec, ExecRequest } from "@/lib/terminal";
import { userHome } from "@/lib/vfs";
import { loadProfile } from "@/lib/content";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  const p = loadProfile();
  return json({ home: userHome(), username: p.username, machineName: p.machineName });
}
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<ExecRequest>;
  try {
    return json(exec({ line: body.line ?? "", cwd: body.cwd ?? userHome(), stdin: body.stdin, mode: body.mode ?? null }));
  } catch (e) {
    return json({ lines: [{ text: String((e as Error).message), color: "red" }], cwd: body.cwd ?? userHome() });
  }
}
