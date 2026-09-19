"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./WhatsApp.module.css";
import { WinState, useWM } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import { useMenu } from "@/components/desktop/ContextMenu";
import { useOS } from "@/components/desktop/os";
import { useSystem } from "@/lib/client/system";
import { api, ChatSummary, Contact, Message, useLiveEvents, LiveEvent } from "@/lib/client/api";
import { FilePicker } from "@/components/desktop/Prompts";
import { useAssets } from "@/lib/client/assets";
import * as W from "@/components/icons/wa";

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
function dayLabel(iso: string): string {
  const d = new Date(iso), now = new Date();
  if (sameDay(d, now)) return "Today";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  const days = (now.getTime() - d.getTime()) / 86400000;
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}
function listTime(iso: string): string {
  const d = new Date(iso), now = new Date();
  if (sameDay(d, now)) return timeOf(iso);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  const days = (now.getTime() - d.getTime()) / 86400000;
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}
function lastSeenLabel(c: Contact): string {
  if (c.isGroup) return "";
  if (c.presence === "online") return "online";
  if (c.presence === "lastSeen" && c.lastSeen) {
    const d = new Date(c.lastSeen), now = new Date();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (sameDay(d, now)) return `last seen today at ${timeOf(c.lastSeen)}`;
    if (sameDay(d, y)) return `last seen yesterday at ${timeOf(c.lastSeen)}`;
    return `last seen ${d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })} at ${timeOf(c.lastSeen)}`;
  }
  return "";
}

function Avatar({ contact, size }: { contact: Contact; size: number }) {
  const assets = useAssets();
  const url = assets[`people.contact.${contact.id}`]?.url ?? null;
  if (url) return <img src={url} alt="" width={size} height={size} className={styles.avatarImg} />;
  return contact.isGroup ? <W.WaGroupAvatar size={size} color="#6b7c85" /> : <W.WaDefaultAvatar size={size} color="#6b7c85" />;
}

function Ticks({ status }: { status: Message["status"] }) {
  if (status === "sent") return <W.WaCheck size={16} className={styles.tick} />;
  return <W.WaDoubleCheck size={16} className={`${styles.tick} ${status === "read" ? styles.tickRead : ""}`} />;
}

export function WhatsApp({ win }: { win: WinState }) {
  const wm = useWM();
  const os = useOS();
  const menu = useMenu();
  const sys = useSystem();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "favourites" | "groups">("all");
  const [search, setSearch] = useState("");
  const [nav, setNav] = useState<"chats" | "calls" | "status" | "communities" | "channels" | "starred" | "archived" | "settings" | "profile">("chats");
  const [emoji, setEmoji] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [attach, setAttach] = useState(false);
  const [info, setInfo] = useState(false);
  const [convSearch, setConvSearch] = useState<string | null>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const currentRef = useRef<string | null>(null); currentRef.current = current;
  const active = wm.activeId === win.id;

  const refreshChats = useCallback(() => api.chats().then((d) => setChats(d.chats)).catch(() => {}), []);
  useEffect(() => { refreshChats(); }, [refreshChats]);
  useEffect(() => {
    const first = (win.props.chatId as string) || null;
    if (first) setCurrent(first);
  }, [win.props.chatId]);
  // "Share with WhatsApp" from Explorer drops the file name into the box, ready to send.
  useEffect(() => {
    const share = win.props.share as string | undefined;
    if (share) setText((t) => (t ? `${t} ` : "") + `[file] ${share}`);
  }, [win.props.share]);

  const openChat = useCallback((id: string) => {
    setCurrent(id);
    api.messages(id).then((d) => { setContact(d.contact); setMessages(d.messages); return api.markRead(id); }).then(refreshChats).catch(() => {});
    setTimeout(() => input.current?.focus(), 50);
  }, [refreshChats]);
  useEffect(() => { if (current) openChat(current); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [current]);

  const onLive = useCallback((ev: LiveEvent) => {
    if (ev.type === "message") {
      const m = ev.message as Message;
      if (m.chatId === currentRef.current) { setMessages((ms) => (ms.some((x) => x.id === m.id) ? ms : [...ms, m])); if (m.sender !== "me") api.markRead(m.chatId).then(refreshChats).catch(() => {}); else refreshChats(); }
      else refreshChats();
    } else if (ev.type === "message.status") {
      const ids = ev.ids as number[], status = ev.status as Message["status"];
      setMessages((ms) => ms.map((m) => (ids.includes(m.id) ? { ...m, status } : m)));
      refreshChats();
    } else if (ev.type === "typing") {
      setTyping((t) => ({ ...t, [ev.chatId as string]: !!ev.typing }));
    } else if (ev.type === "contact.unlocked" || ev.type === "presence") {
      refreshChats();
    }
  }, [refreshChats]);
  useLiveEvents(onLive);

  useEffect(() => { listEnd.current?.scrollIntoView({ block: "end" }); }, [messages, typing, current]);

  const send = () => {
    const t = text.trim();
    if (!t || !current) return;
    setText("");
    api.send(current, t).catch(() => {});
    input.current?.focus();
  };

  const flags = sys.settings.chatFlags ?? {};
  const flagsOf = (id: string) => flags[id] ?? {};
  const setFlag = (id: string, patch: Partial<(typeof flags)[string]>) =>
    sys.set({ chatFlags: { ...flags, [id]: { ...flagsOf(id), ...patch } } });

  const visibleChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    const f = (id: string) => flags[id] ?? {};
    const list = chats.filter((c) => {
      const fl = f(c.contact.id);
      if (nav === "archived" ? !fl.archived : !!fl.archived) return false;
      if (filter === "unread" && !c.unread && !fl.unread) return false;
      if (filter === "groups" && !c.contact.isGroup) return false;
      if (filter === "favourites" && !fl.favourite && !c.contact.pinned) return false;
      if (q && !c.contact.name.toLowerCase().includes(q) && !(c.last?.text ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
    // Pinned chats sit at the top, as they do in WhatsApp.
    return [...list].sort((a, b) => Number(!!f(b.contact.id).pinned) - Number(!!f(a.contact.id).pinned));
  }, [chats, filter, search, flags, nav]);

  const starred = sys.settings.starredMessages ?? [];
  const isStarred = (id: number) => starred.some((x) => x.id === id);
  const toggleStar = (m: Message) => {
    if (isStarred(m.id)) { sys.set({ starredMessages: starred.filter((x) => x.id !== m.id) }); return; }
    const name = m.sender === "me" ? "You" : contact?.name ?? m.sender;
    sys.set({ starredMessages: [...starred, { id: m.id, chatId: contact?.id ?? "", name, text: m.text, at: m.at }] });
  };

  const chatMenu = (e: React.MouseEvent, c: ChatSummary) => {
    e.preventDefault();
    menu.open({ x: e.clientX, y: e.clientY, variant: "wa", items: [
      { label: flagsOf(c.contact.id).archived ? "Unarchive chat" : "Archive chat", onClick: () => setFlag(c.contact.id, { archived: !flagsOf(c.contact.id).archived }) },
      { label: flagsOf(c.contact.id).muted ? "Unmute notifications" : "Mute notifications", onClick: () => setFlag(c.contact.id, { muted: !flagsOf(c.contact.id).muted }) },
      { label: flagsOf(c.contact.id).pinned ? "Unpin chat" : "Pin chat", onClick: () => setFlag(c.contact.id, { pinned: !flagsOf(c.contact.id).pinned }) },
      { label: c.unread || flagsOf(c.contact.id).unread ? "Mark as read" : "Mark as unread",
        onClick: () => { if (c.unread) { void api.markRead(c.contact.id).then(refreshChats); setFlag(c.contact.id, { unread: false }); } else setFlag(c.contact.id, { unread: !flagsOf(c.contact.id).unread }); } },
      { label: flagsOf(c.contact.id).favourite ? "Remove from favourites" : "Add to favourites", onClick: () => setFlag(c.contact.id, { favourite: !flagsOf(c.contact.id).favourite }) },
    ] });
  };
  const msgMenu = (e: React.MouseEvent, m: Message) => {
    e.preventDefault();
    menu.open({ x: e.clientX, y: e.clientY, variant: "wa", items: [
      { label: "Copy", onClick: () => navigator.clipboard?.writeText(m.text).catch(() => {}) },
      { label: isStarred(m.id) ? "Unstar" : "Star", onClick: () => toggleStar(m) },
    ] });
  };
  const headerMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    menu.open({ x: r.right - 200, y: r.bottom + 4, variant: "wa", items: [
      { label: "Contact info", onClick: () => setInfo(true) },
      { label: contact && flagsOf(contact.id).muted ? "Unmute notifications" : "Mute notifications", disabled: !contact, onClick: () => contact && setFlag(contact.id, { muted: !flagsOf(contact.id).muted }) },
      { label: contact && flagsOf(contact.id).favourite ? "Remove from favourites" : "Add to favourites", disabled: !contact, onClick: () => contact && setFlag(contact.id, { favourite: !flagsOf(contact.id).favourite }) },
      { label: contact && flagsOf(contact.id).archived ? "Unarchive chat" : "Archive chat", disabled: !contact, onClick: () => contact && setFlag(contact.id, { archived: !flagsOf(contact.id).archived }) },
      { label: "Close chat", onClick: () => { setCurrent(null); setContact(null); setMessages([]); setInfo(false); } },
    ] });
  };

  const groupNames = (c: Contact) => (c.participants ?? []).map((p) => (p === "me" ? "You" : chats.find((x) => x.contact.id === p)?.contact.name ?? p)).join(", ");
  const status = contact ? (typing[contact.id] ? "typing..." : contact.isGroup ? groupNames(contact) : lastSeenLabel(contact)) : "";

  return (
    <Window win={win} className={styles.win}>
      <div className={`${styles.frame} ${active ? "" : styles.inactive}`}>
        <div className={styles.titleBar} data-drag>
          <span className={styles.titleText}>WhatsApp</span>
          <CaptionButtons win={win} dark />
        </div>
        <div className={styles.body}>
          <div className={styles.rail}>
            {([["chats", "Chats", <W.WaChats key="c" size={24} />], ["calls", "Calls", <W.WaCalls key="ca" size={24} />], ["status", "Status", <W.WaStatus key="s" size={24} />], ["channels", "Channels", <W.WaChannels key="ch" size={24} />], ["communities", "Communities", <W.WaCommunities key="co" size={24} />]] as const).map(([id, label, icon]) => (
              <button key={id} className={`${styles.railBtn} ${nav === id ? styles.railActive : ""}`} title={label} onClick={() => setNav(id)}>{icon}{id === "chats" && chats.some((c) => c.unread) && <span className={styles.railDot} />}</button>
            ))}
            <div className={styles.railSpacer} />
            <button className={`${styles.railBtn} ${nav === "starred" ? styles.railActive : ""}`} title="Starred messages" onClick={() => setNav("starred")}><W.WaStarred size={24} /></button>
            <button className={`${styles.railBtn} ${nav === "archived" ? styles.railActive : ""}`} title="Archived" onClick={() => setNav("archived")}><W.WaArchive size={24} /></button>
            <button className={`${styles.railBtn} ${nav === "settings" ? styles.railActive : ""}`} title="Settings" onClick={() => setNav("settings")}><W.WaSettings size={24} /></button>
            <button className={`${styles.railBtn} ${nav === "profile" ? styles.railActive : ""}`} title="Profile" onClick={() => setNav("profile")}><OwnerAvatar size={28} /></button>
          </div>
          <div className={styles.list}>
            <div className={styles.listHead}>
              <span className={styles.listTitle}>{nav === "chats" ? "Chats" : nav === "calls" ? "Calls" : nav === "status" ? "Status" : nav === "channels" ? "Channels" : nav === "communities" ? "Communities" : nav === "starred" ? "Starred messages" : nav === "archived" ? "Archived" : nav === "profile" ? "Profile" : "Settings"}</span>
              {nav === "chats" && <><button className={styles.iconBtn} title="New chat" onClick={() => setNewChat((v) => !v)}><W.WaNewChat size={22} /></button><button className={styles.iconBtn} title="Menu" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); menu.open({ x: r.left, y: r.bottom + 4, variant: "wa", items: [
                  { label: "Starred messages", onClick: () => setNav("starred") },
                  { label: "Archived", onClick: () => setNav("archived") },
                  { label: "Read all", onClick: () => { for (const c of chats) if (c.unread) void api.markRead(c.contact.id); setTimeout(refreshChats, 150); } },
                  { type: "sep" },
                  { label: "Settings", onClick: () => setNav("settings") },
                ] }); }}><W.WaMenu size={22} /></button></>}
            </div>
            <div className={styles.searchWrap}>
              <W.WaSearch size={20} className={styles.searchIcon} />
              <input className={styles.search} placeholder="Search or start a new chat" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {nav === "chats" && newChat && (
              <div className={styles.newChat}>
                <div className={styles.newChatHead}>Start a chat</div>
                {chats.map((c) => (
                  <button key={c.contact.id} className={styles.newChatRow} onClick={() => { setNewChat(false); setCurrent(c.contact.id); }}>
                    <Avatar contact={c.contact} size={36} />
                    <span><b>{c.contact.name}</b><small>{c.contact.about || c.contact.phone || ""}</small></span>
                  </button>
                ))}
              </div>
            )}
            {nav === "chats" && !newChat && (
              <>
                <div className={styles.filters}>
                  {(["all", "unread", "favourites", "groups"] as const).map((f) => (
                    <button key={f} className={`${styles.chip} ${filter === f ? styles.chipOn : ""}`} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
                  ))}
                </div>
                <div className={styles.rows}>
                  {visibleChats.map((c) => {
                    const preview = typing[c.contact.id] ? "typing..." : c.last ? `${c.contact.isGroup && c.last.sender !== "me" ? (chats.find((x) => x.contact.id === c.last!.sender)?.contact.name ?? c.last.sender) + ": " : ""}${c.last.text}` : "";
                    return (
                      <div key={c.contact.id} className={`${styles.row} ${current === c.contact.id ? styles.rowSel : ""}`} onClick={() => setCurrent(c.contact.id)} onContextMenu={(e) => chatMenu(e, c)}>
                        <Avatar contact={c.contact} size={49} />
                        <div className={styles.rowText}>
                          <div className={styles.rowTop}><span className={styles.rowName}>{c.contact.name}</span><span className={`${styles.rowTime} ${c.unread ? styles.rowTimeUnread : ""}`}>{c.last ? listTime(c.last.at) : ""}</span></div>
                          <div className={styles.rowBottom}>
                            {c.last?.sender === "me" && !typing[c.contact.id] && <Ticks status={c.last.status} />}
                            <span className={`${styles.rowPreview} ${typing[c.contact.id] ? styles.typing : ""}`}>{preview}</span>
                            {c.unread > 0 && <span className={styles.badge}>{c.unread}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!visibleChats.length && <div className={styles.emptyList}>{filter === "unread" ? "No unread chats" : filter === "favourites" ? "No favourites yet" : filter === "groups" ? "No groups" : "No chats"}</div>}
                </div>
              </>
            )}
            {nav === "starred" && (
              <div className={styles.rows}>
                {starred.map((m) => (
                  <div key={m.id} className={styles.row} onClick={() => { if (m.chatId) { setCurrent(m.chatId); setNav("chats"); } }}>
                    <div className={styles.rowText}>
                      <div className={styles.rowTop}><span className={styles.rowName}>{m.name}</span><span className={styles.rowTime}>{listTime(m.at)}</span></div>
                      <div className={styles.rowBottom}><span className={styles.rowPreview}>{m.text}</span></div>
                    </div>
                  </div>
                ))}
                {!starred.length && <div className={styles.emptyList}>No starred messages</div>}
              </div>
            )}
            {(nav === "settings" || nav === "profile") && (
              <div className={styles.settingsPane}>
                <div className={styles.settingsMe}>
                  <OwnerAvatar size={100} />
                  <div className={styles.settingsName}>{os.profile.displayName}</div>
                  <div className={styles.settingsSub}>{os.profile.accountEmail}</div>
                </div>
                {nav === "settings" && (
                  <>
                    <div className={styles.settingsGroup}>Notifications</div>
                    <label className={styles.settingsRow}>
                      <span>Message sounds</span>
                      <input type="checkbox" checked={sys.settings.waSounds !== false} onChange={(e) => sys.set({ waSounds: e.target.checked })} />
                    </label>
                    <div className={styles.settingsGroup}>Chats</div>
                    <button className={styles.settingsRow} onClick={() => setNav("archived")}>
                      <span>Archived</span><span className={styles.settingsValue}>{Object.values(flags).filter((f) => f.archived).length}</span>
                    </button>
                    <div className={styles.settingsRow}><span>Chats on this device</span><span className={styles.settingsValue}>{chats.length}</span></div>
                    <div className={styles.settingsGroup}>Help</div>
                    <div className={styles.settingsRow}><span>Version</span><span className={styles.settingsValue}>2.2440.8</span></div>
                  </>
                )}
              </div>
            )}
            {nav !== "chats" && nav !== "archived" && nav !== "settings" && nav !== "profile" && nav !== "starred" && <div className={styles.emptyList}>{nav === "calls" ? "To start calling contacts who have WhatsApp, click the new call button." : nav === "status" ? "No recent updates" : nav === "channels" ? "No channels" : "No communities"}</div>}
          </div>
          <div className={styles.conv}>
            {!contact ? (
              <div className={styles.landing}>
                <div className={styles.landingLogo}><W.WaChats size={64} /></div>
                <div className={styles.landingTitle}>WhatsApp for Windows</div>
                <div className={styles.landingText}>Send and receive messages without keeping your phone online.<br />Use WhatsApp on up to 4 linked devices and 1 phone at the same time.</div>
                <div className={styles.landingLock}><W.WaLock size={12} /> Your personal messages are end-to-end encrypted</div>
              </div>
            ) : (
              <>
                <div className={styles.convHead}>
                  <button className={styles.convWho} onClick={() => setInfo((v) => !v)}>
                    <Avatar contact={contact} size={40} />
                    <div className={styles.convTitle}><span className={styles.convName}>{contact.name}</span><span className={`${styles.convStatus} ${typing[contact.id] ? styles.typing : ""}`}>{status}</span></div>
                  </button>
                  <button className={styles.iconBtn} title="Video call" onClick={() => setNotice("No camera or microphone is attached to this computer, so calls are not available.")}><W.WaVideo size={22} /></button>
                  <button className={styles.iconBtn} title="Voice call" onClick={() => setNotice("No microphone is attached to this computer, so calls are not available.")}><W.WaPhone size={22} /></button>
                  <button className={styles.iconBtn} title="Search" onClick={() => setConvSearch((v) => (v === null ? "" : null))}><W.WaSearch size={22} /></button>
                  <button className={styles.iconBtn} title="Menu" onClick={headerMenu}><W.WaMenu size={22} /></button>
                </div>
                {convSearch !== null && (
                  <div className={styles.convSearch}>
                    <W.WaSearch size={18} />
                    <input autoFocus placeholder="Search in this chat" value={convSearch} onChange={(e) => setConvSearch(e.target.value)} />
                    <button className={styles.iconBtn} onClick={() => setConvSearch(null)}>Close</button>
                  </div>
                )}
                <div className={styles.messages}>
                  <div className={styles.msgInner}>
                    <div className={styles.e2e}><W.WaLock size={11} /> Messages are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Click to learn more.</div>
                    {(convSearch?.trim() ? messages.filter((m) => m.text.toLowerCase().includes(convSearch.trim().toLowerCase())) : messages).map((m, i, shown) => {
                      const prev = shown[i - 1];
                      const newDay = !prev || !sameDay(new Date(prev.at), new Date(m.at));
                      const first = newDay || !prev || prev.sender !== m.sender;
                      const mine = m.sender === "me";
                      const senderName = contact.isGroup && !mine && first ? (chats.find((x) => x.contact.id === m.sender)?.contact.name ?? m.sender) : null;
                      return (
                        <React.Fragment key={m.id}>
                          {newDay && <div className={styles.dayChip}><span>{dayLabel(m.at)}</span></div>}
                          <div className={`${styles.msgRow} ${mine ? styles.mine : ""} ${first ? styles.first : ""}`} onContextMenu={(e) => msgMenu(e, m)}>
                            <div className={styles.bubble}>
                              {first && <span className={styles.tail} />}
                              {senderName && <div className={styles.senderName}>{senderName}</div>}
                              <span className={styles.msgText}>{m.text}</span>
                              <span className={styles.meta}>{isStarred(m.id) && <W.WaStarred size={11} />}<span className={styles.metaTime}>{timeOf(m.at)}</span>{mine && <Ticks status={m.status} />}</span>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                    {typing[contact.id] && (
                      <div className={`${styles.msgRow} ${styles.first}`}><div className={styles.bubble}><span className={styles.tail} /><span className={styles.dots}><i /><i /><i /></span></div></div>
                    )}
                    <div ref={listEnd} />
                  </div>
                </div>
                {emoji && (
                  <div className={styles.emojiPicker}>
                    {["😀","😂","🙂","😉","😊","😍","😘","🤔","😐","😴","😢","😭","😤","😱","🤝","👍","👎","🙏","👏","💪","❤️","🧡","💛","💚","💙","💜","🖤","✨","🔥","🎉","☕","🍺","🍕","🎂","🎧","🎙️","📻","📷","🚗","✈️","🌧️","⛅","🌙","⭐","🌊","🐈","🐕","🦉","🫡","🤷"].map((e) => (
                      <button key={e} className={styles.emojiBtn} onClick={() => { setText((t) => t + e); input.current?.focus(); }}>{e}</button>
                    ))}
                  </div>
                )}
                {notice && <div className={styles.notice} onClick={() => setNotice(null)}>{notice}</div>}
                <div className={styles.composer}>
                  <button className={styles.iconBtn} title="Emoji" onClick={() => setEmoji((v) => !v)}><W.WaEmoji size={24} /></button>
                  <button className={styles.iconBtn} title="Attach" onClick={() => setAttach(true)}><W.WaPlus size={24} /></button>
                  <textarea ref={input} className={styles.input} placeholder="Type a message" rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                  {text.trim()
                    ? <button className={`${styles.iconBtn} ${styles.sendBtn}`} title="Send" onClick={send}><W.WaSend size={22} /></button>
                    : <button className={styles.iconBtn} title="Voice message" onClick={() => setNotice("No microphone is attached to this computer, so voice messages are not available.")}><W.WaMic size={24} /></button>}
                </div>
              </>
            )}
            {info && contact && (
              <aside className={styles.infoPane}>
                <div className={styles.infoHead}><span>Contact info</span><button className={styles.iconBtn} onClick={() => setInfo(false)}><W.WaClose size={20} /></button></div>
                <div className={styles.infoTop}>
                  <Avatar contact={contact} size={140} />
                  <div className={styles.infoName}>{contact.name}</div>
                  {contact.phone && <div className={styles.infoSub}>{contact.phone}</div>}
                </div>
                {contact.about && <div className={styles.infoBlock}><span className={styles.infoLabel}>About</span><span>{contact.about}</span></div>}
                {contact.isGroup && <div className={styles.infoBlock}><span className={styles.infoLabel}>Participants</span><span>{contact.participants?.length ?? 0}</span></div>}
                <div className={styles.infoBlock}><span className={styles.infoLabel}>Messages</span><span>{messages.length}</span></div>
                <button className={styles.infoRow} onClick={() => setFlag(contact.id, { muted: !flagsOf(contact.id).muted })}>
                  <span>Mute notifications</span><span className={styles.infoValue}>{flagsOf(contact.id).muted ? "On" : "Off"}</span>
                </button>
                <button className={styles.infoRow} onClick={() => setFlag(contact.id, { favourite: !flagsOf(contact.id).favourite })}>
                  <span>Favourite</span><span className={styles.infoValue}>{flagsOf(contact.id).favourite ? "Yes" : "No"}</span>
                </button>
              </aside>
            )}
          </div>
        </div>
      </div>
      {attach && current && (
        <FilePicker
          mode="open"
          start={`${os.home}/Documents`}
          onClose={() => setAttach(false)}
          onPick={(p) => {
            setAttach(false);
            const name = p.slice(p.lastIndexOf("/") + 1);
            api.send(current, `[file] ${name}`).catch(() => {});
            setTimeout(() => openChat(current), 300);
          }}
        />
      )}
      <span style={{ display: "none" }}>{os.profile.displayName}</span>
    </Window>
  );
}

function OwnerAvatar({ size }: { size: number }) {
  const assets = useAssets();
  const url = assets["people.owner"]?.url ?? null;
  if (url) return <img src={url} alt="" width={size} height={size} className={styles.avatarImg} />;
  return <W.WaDefaultAvatar size={size} color="#6b7c85" />;
}
