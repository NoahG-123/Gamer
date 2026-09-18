import { EventEmitter } from "node:events";

/** In-process event bus for live UI updates (SSE). Survives dev HMR via globalThis. */
export type BusEvent =
  | { type: "message"; chatId: string; message: unknown }
  | { type: "message.status"; chatId: string; ids: number[]; status: string }
  | { type: "typing"; chatId: string; typing: boolean }
  | { type: "presence"; contactId: string; presence: string; lastSeen?: string }
  | { type: "contact.unlocked"; contactId: string }
  | { type: "fs.changed"; paths: string[] }
  | { type: "trigger.fired"; triggerId: string }
  | { type: "flag"; key: string; value: unknown }
  | { type: "mail.changed"; ids: string[] }
  | { type: "calendar.changed"; ids: string[] }
  | { type: "ui.open"; app: string; props: Record<string, unknown> }
  | { type: "ui.notify"; app: string; title: string; text: string; props: Record<string, unknown> }
  | { type: "settings"; settings: Record<string, unknown> }
  | { type: "sound"; name: string };

type G = typeof globalThis & { __foundBus?: EventEmitter };

export function bus(): EventEmitter {
  const g = globalThis as G;
  if (!g.__foundBus) {
    g.__foundBus = new EventEmitter();
    g.__foundBus.setMaxListeners(100);
  }
  return g.__foundBus;
}

export function publish(ev: BusEvent): void {
  bus().emit("event", ev);
}
