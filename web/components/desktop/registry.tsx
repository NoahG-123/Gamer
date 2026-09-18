"use client";
import React from "react";
import { AppId, WinState } from "./wm";
import { Explorer } from "@/components/apps/explorer/Explorer";
import { Chrome } from "@/components/apps/chrome/Chrome";
import { WhatsApp } from "@/components/apps/whatsapp/WhatsApp";
import { Notepad } from "@/components/apps/notepad/Notepad";
import { Terminal } from "@/components/apps/terminal/Terminal";
import { Settings } from "@/components/apps/settings/Settings";
import { TaskManager } from "@/components/apps/taskmgr/TaskManager";
import { Calculator, Clock } from "@/components/apps/tools/Calculator";
import { Photos } from "@/components/apps/photos/Photos";
import { Paint } from "@/components/apps/paint/Paint";
import { AudioEditor } from "@/components/apps/audio/AudioEditor";
import { DialogWindow } from "./Dialogs";

export const APP_COMPONENTS: Record<AppId, React.ComponentType<{ win: WinState }>> = {
  explorer: Explorer,
  chrome: Chrome,
  whatsapp: WhatsApp,
  notepad: Notepad,
  terminal: Terminal,
  settings: Settings,
  taskmgr: TaskManager,
  calculator: Calculator,
  clock: Clock,
  photos: Photos,
  paint: Paint,
  audio: AudioEditor,
  dialog: DialogWindow,
};
