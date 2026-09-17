"use client";
import React from "react";
import { WinState } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
export function Explorer({ win }: { win: WinState }) {
  return <Window win={win}><div data-drag style={{ height: 40, display: "flex", alignItems: "center", paddingLeft: 12, background: "#f3f3f3" }}><span style={{ flex: 1 }}>Explorer (stub)</span><CaptionButtons win={win} /></div><div style={{ flex: 1 }} /></Window>;
}
