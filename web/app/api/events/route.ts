import { bus, BusEvent } from "@/lib/bus";
export const dynamic = "force-dynamic";

/** Server-sent events stream of live state changes for the desktop UI. */
export async function GET() {
  const encoder = new TextEncoder();
  let listener: ((ev: BusEvent) => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ } };
      listener = (ev) => send(ev);
      bus().on("event", listener);
      send({ type: "hello", at: new Date().toISOString() });
      ping = setInterval(() => { try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { /* closed */ } }, 15000);
    },
    cancel() {
      if (listener) bus().off("event", listener);
      if (ping) clearInterval(ping);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
