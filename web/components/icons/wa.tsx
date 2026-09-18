"use client";
/** WhatsApp UI icons via react-icons (Material + Lucide) — WhatsApp's own glyphs are Material-derived. */
import React from "react";
import * as Md from "react-icons/md";
import * as Lu from "react-icons/lu";
import type { IconType } from "react-icons";

type P = { size?: number; className?: string; style?: React.CSSProperties };
const w = (C: IconType) => ({ size = 24, className, style }: P) => <C size={size} className={className} style={{ display: "block", ...style }} />;

export const WaChats = w(Md.MdOutlineChat);
export const WaCalls = w(Md.MdOutlineCall);
export const WaStatus = w(Md.MdOutlineDonutLarge);
export const WaCommunities = w(Md.MdOutlineGroups);
export const WaChannels = w(Md.MdOutlineCampaign);
export const WaStarred = w(Md.MdOutlineStarOutline);
export const WaArchive = w(Md.MdOutlineArchive);
export const WaSettings = w(Md.MdOutlineSettings);
export const WaNewChat = w(Md.MdOutlineAddComment);
export const WaFilter = w(Md.MdFilterList);
export const WaMenu = w(Md.MdMoreVert);
export const WaSearch = w(Md.MdSearch);
export const WaVideo = w(Md.MdOutlineVideocam);
export const WaPhone = w(Md.MdOutlineCall);
export const WaEmoji = w(Md.MdOutlineEmojiEmotions);
export const WaPlus = w(Md.MdAdd);
export const WaMic = w(Md.MdOutlineMic);
export const WaSend = w(Md.MdSend);
export const WaCheck = w(Md.MdDone);
export const WaDoubleCheck = w(Md.MdDoneAll);
export const WaBack = w(Md.MdArrowBack);
export const WaClose = w(Md.MdClose);
export const WaLock = w(Lu.LuLock);
export const WaDefaultAvatar = ({ size = 40, color = "#DFE5E7" }: { size?: number; color?: string }) => (
  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0 }}>
    <Md.MdPerson size={size * 0.7} color="#fff" style={{ marginTop: size * 0.06 }} />
  </span>
);
export const WaGroupAvatar = ({ size = 40, color = "#DFE5E7" }: { size?: number; color?: string }) => (
  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0 }}>
    <Md.MdGroups size={size * 0.62} color="#fff" />
  </span>
);
