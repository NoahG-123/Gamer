import { NextRequest } from "next/server";
import { getThread } from "@/lib/mail";
import { mimeFor } from "@/lib/http";
import { synthPdf, synthPng, junkText, dressingKind } from "@/lib/synth";
import { synthText } from "@/lib/synthtext";
import { recordEvent } from "@/lib/state";
export const dynamic = "force-dynamic";

/**
 * An attachment that is not a file on this machine still opens, the way it would in a
 * mail client: the bytes are made from its name and the thread it belongs to, so the
 * same attachment always looks the same.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("thread") ?? "";
  const name = req.nextUrl.searchParams.get("name") ?? "";
  if (!id || !name) return new Response("Not found", { status: 404 });
  const thread = getThread(id);
  const att = thread?.messages.flatMap((m) => m.attachments ?? []).find((a) => a.name === name);
  if (!att) return new Response("Not found", { status: 404 });
  recordEvent("mail.attachment.opened", `${id}/${name}`);
  const seed = `${id}/${name}`;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  const headers = { "cache-control": "no-store", "content-disposition": `inline; filename="${name.replace(/"/g, "")}"` };
  const kind = dressingKind(ext);
  if (kind === "pdf") return new Response(new Uint8Array(synthPdf(seed, att.size > 300_000 ? 3 : 1)), { headers: { ...headers, "content-type": "application/pdf" } });
  if (kind === "image") return new Response(new Uint8Array(synthPng(seed)), { headers: { ...headers, "content-type": "image/png" } });
  if (kind === "text") return new Response(synthText(seed, ext, att.size), { headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
  return new Response(junkText(seed, ext, att.size), { headers: { ...headers, "content-type": mimeFor(name) === "application/octet-stream" ? "text/plain; charset=utf-8" : mimeFor(name) } });
}
