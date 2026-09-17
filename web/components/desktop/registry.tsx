"use client";
import React from "react";
import { AppId, WinState } from "./wm";
import { Explorer } from "@/components/apps/explorer/Explorer";
import { Chrome } from "@/components/apps/chrome/Chrome";
import { WhatsApp } from "@/components/apps/whatsapp/WhatsApp";
import { Notepad } from "@/components/apps/notepad/Notepad";
import { DialogWindow } from "./Dialogs";

export const APP_COMPONENTS: Record<AppId, React.ComponentType<{ win: WinState }>> = {
  explorer: Explorer,
  chrome: Chrome,
  whatsapp: WhatsApp,
  notepad: Notepad,
  dialog: DialogWindow,
};
