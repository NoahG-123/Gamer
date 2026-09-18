"use client";
/** Renders an icon from the extracted Iconify collections (see scripts/extract-icons.mjs). */
import React from "react";
import { Icon } from "@iconify/react";
import data from "./iconify-data.json";

const ICONS = data as Record<string, { body: string; width: number; height: number }>;

export function Ico({ name, size = 24, className, style }: { name: string; size?: number; className?: string; style?: React.CSSProperties }) {
  const d = ICONS[name];
  if (!d) return <span style={{ display: "inline-block", width: size, height: size }} className={className} />;
  return <Icon icon={d} width={size} height={size} className={className} style={{ display: "block", ...style }} />;
}
export const hasIcon = (name: string) => !!ICONS[name];
