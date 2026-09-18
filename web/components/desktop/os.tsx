"use client";
import React, { createContext, useContext } from "react";
import { AppId } from "./wm";
import { VfsNode, Profile, OpenWith } from "@/lib/client/api";

/** OS-level services shared by all apps: launching apps and opening files through the story engine. */
export interface OS {
  profile: Profile;
  home: string;
  launch: (app: AppId, props?: Record<string, unknown>) => string;
  openFile: (node: VfsNode) => Promise<void>;
  /** Open a path in a specific app (the "Open with" choice). */
  openWith: (path: string, app: OpenWith) => Promise<void>;
  openFolder: (path: string) => void;
  openUrl: (url: string) => void;
  refreshTick: number;
}
const Ctx = createContext<OS | null>(null);
export const OSProvider = Ctx.Provider;
export function useOS(): OS { const v = useContext(Ctx); if (!v) throw new Error("useOS outside provider"); return v; }
