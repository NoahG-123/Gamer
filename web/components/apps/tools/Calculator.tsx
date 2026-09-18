"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./tools.module.css";
import { WinState, useWM } from "@/components/desktop/wm";
import { Window, CaptionButtons } from "@/components/desktop/Window";
import * as F from "@/components/icons/fluent";

type Op = "+" | "-" | "×" | "÷" | null;
interface HistoryItem { expr: string; value: string }

const fmt = (n: number): string => {
  if (!isFinite(n)) return "Cannot divide by zero";
  const s = Math.abs(n) >= 1e16 || (Math.abs(n) < 1e-6 && n !== 0) ? n.toExponential(9) : String(Number(n.toPrecision(16)));
  return s;
};
const group = (s: string): string => {
  if (!/^-?\d/.test(s)) return s;
  const [i, d] = s.split(".");
  return Number(i).toLocaleString("en-US", { maximumFractionDigits: 0 }) + (d !== undefined ? `.${d}` : "");
};

/** Windows Calculator, standard mode: it calculates. Keyboard works the way it does there. */
export function Calculator({ win }: { win: WinState }) {
  const wm = useWM();
  const [display, setDisplay] = useState("0");
  const [expr, setExpr] = useState("");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [fresh, setFresh] = useState(true);
  const [memory, setMemory] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const active = wm.activeId === win.id;
  const value = Number(display.replace(/,/g, ""));

  const apply = (a: number, b: number, o: Op): number => (o === "+" ? a + b : o === "-" ? a - b : o === "×" ? a * b : o === "÷" ? a / b : b);

  const digit = useCallback((d: string) => {
    setDisplay((cur) => {
      if (fresh || cur === "0" || cur === "Cannot divide by zero") return d === "." ? "0." : d;
      if (d === "." && cur.includes(".")) return cur;
      return cur.length < 17 ? cur + d : cur;
    });
    setFresh(false);
  }, [fresh]);

  const chooseOp = useCallback((o: Op) => {
    const v = Number(display.replace(/,/g, ""));
    if (acc !== null && op && !fresh) {
      const r = apply(acc, v, op);
      setAcc(r);
      setDisplay(fmt(r));
      setExpr(`${fmt(r)} ${o} `);
    } else {
      setAcc(v);
      setExpr(`${fmt(v)} ${o} `);
    }
    setOp(o);
    setFresh(true);
  }, [acc, display, fresh, op]);

  const equals = useCallback(() => {
    if (acc === null || !op) return;
    const v = Number(display.replace(/,/g, ""));
    const r = apply(acc, v, op);
    const line = `${fmt(acc)} ${op} ${fmt(v)} =`;
    setHistory((h) => [{ expr: line, value: fmt(r) }, ...h].slice(0, 40));
    setDisplay(fmt(r));
    setExpr("");
    setAcc(null);
    setOp(null);
    setFresh(true);
  }, [acc, display, op]);

  const unary = (kind: "sqr" | "sqrt" | "inv" | "neg" | "pct") => {
    const v = Number(display.replace(/,/g, ""));
    const r = kind === "sqr" ? v * v : kind === "sqrt" ? Math.sqrt(v) : kind === "inv" ? 1 / v : kind === "neg" ? -v : (acc ?? 0) * v / 100;
    setDisplay(fmt(r));
    setFresh(true);
  };
  const clear = (all: boolean) => {
    setDisplay("0");
    setFresh(true);
    if (all) { setAcc(null); setOp(null); setExpr(""); }
  };
  const back = () => setDisplay((c) => (fresh || c.length <= 1 ? "0" : c.slice(0, -1)));

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (/^[0-9]$/.test(k)) { digit(k); e.preventDefault(); }
      else if (k === "." || k === ",") { digit("."); e.preventDefault(); }
      else if (k === "+" || k === "-") { chooseOp(k as Op); e.preventDefault(); }
      else if (k === "*" || k === "x") { chooseOp("×"); e.preventDefault(); }
      else if (k === "/") { chooseOp("÷"); e.preventDefault(); }
      else if (k === "Enter" || k === "=") { equals(); e.preventDefault(); }
      else if (k === "Backspace") { back(); e.preventDefault(); }
      else if (k === "Escape") { clear(true); e.preventDefault(); }
      else if (k === "Delete") { clear(false); e.preventDefault(); }
      else if (k === "%") { unary("pct"); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const mem = (kind: "mc" | "mr" | "m+" | "m-" | "ms") => {
    const v = Number(display.replace(/,/g, ""));
    if (kind === "mc") setMemory(null);
    else if (kind === "mr") { if (memory !== null) { setDisplay(fmt(memory)); setFresh(true); } }
    else if (kind === "ms") setMemory(v);
    else setMemory((m) => (m ?? 0) + (kind === "m+" ? v : -v));
  };

  const Btn = ({ label, on, kind }: { label: React.ReactNode; on: () => void; kind?: "num" | "op" | "eq" }) => (
    <button className={`${styles.key} ${kind === "num" ? styles.keyNum : ""} ${kind === "eq" ? styles.keyEq : ""}`} onClick={on}>{label}</button>
  );

  return (
    <Window win={win} className={styles.win}>
      <div className={styles.frame}>
        <div className={styles.titleBar} data-drag>
          <span className={styles.titleText}>Calculator</span>
          <CaptionButtons win={win} />
        </div>
        <div className={styles.calcMode}>Standard</div>
        <div className={styles.memRow}>
          {(["mc", "mr", "m+", "m-", "ms"] as const).map((m) => (
            <button key={m} className={styles.memBtn} disabled={(m === "mc" || m === "mr") && memory === null} onClick={() => mem(m)}>{m.toUpperCase()}</button>
          ))}
          <span className={styles.memFlag}>{memory !== null ? "M" : ""}</span>
        </div>
        <div className={styles.calcBody}>
          <div className={styles.calcMain}>
            <div className={styles.expr}>{expr}</div>
            <div className={styles.display} title={display}>{group(display)}</div>
            <div className={styles.keys}>
              <Btn label="%" on={() => unary("pct")} />
              <Btn label="CE" on={() => clear(false)} />
              <Btn label="C" on={() => clear(true)} />
              <Btn label={<F.ArrowLeft size={16} />} on={back} />
              <Btn label="1/x" on={() => unary("inv")} />
              <Btn label="x²" on={() => unary("sqr")} />
              <Btn label="√x" on={() => unary("sqrt")} />
              <Btn label="÷" on={() => chooseOp("÷")} />
              {["7", "8", "9"].map((d) => <Btn key={d} label={d} on={() => digit(d)} kind="num" />)}
              <Btn label="×" on={() => chooseOp("×")} />
              {["4", "5", "6"].map((d) => <Btn key={d} label={d} on={() => digit(d)} kind="num" />)}
              <Btn label="−" on={() => chooseOp("-")} />
              {["1", "2", "3"].map((d) => <Btn key={d} label={d} on={() => digit(d)} kind="num" />)}
              <Btn label="+" on={() => chooseOp("+")} />
              <Btn label="+/−" on={() => unary("neg")} kind="num" />
              <Btn label="0" on={() => digit("0")} kind="num" />
              <Btn label="." on={() => digit(".")} kind="num" />
              <Btn label="=" on={equals} kind="eq" />
            </div>
          </div>
          <div className={styles.calcHistory}>
            <div className={styles.histHead}>History{history.length > 0 && <button className={styles.histClear} onClick={() => setHistory([])}><F.Delete size={14} /></button>}</div>
            {!history.length && <div className={styles.histEmpty}>There&apos;s no history yet.</div>}
            {history.map((h, i) => (
              <button key={i} className={styles.histItem} onClick={() => { setDisplay(h.value); setFresh(true); }}>
                <span>{h.expr}</span><b>{group(h.value)}</b>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Window>
  );
}

/** Windows Clock: world clock, stopwatch and timer, all live. */
export function Clock({ win }: { win: WinState }) {
  const wm = useWM();
  const [tab, setTab] = useState<"world" | "stopwatch" | "timer">("world");
  const [now, setNow] = useState<Date | null>(null);
  const [swMs, setSwMs] = useState(0);
  const [swRunning, setSwRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const [timerLeft, setTimerLeft] = useState(5 * 60 * 1000);
  const [timerSet, setTimerSet] = useState(5 * 60 * 1000);
  const [timerRunning, setTimerRunning] = useState(false);
  const last = useRef<number>(0);
  const active = wm.activeId === win.id;

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 500); setNow(new Date()); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (!swRunning && !timerRunning) return;
    last.current = performance.now();
    let raf = 0;
    const step = () => {
      const t = performance.now();
      const dt = t - last.current;
      last.current = t;
      if (swRunning) setSwMs((m) => m + dt);
      if (timerRunning) setTimerLeft((m) => Math.max(0, m - dt));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [swRunning, timerRunning]);
  useEffect(() => { if (timerRunning && timerLeft <= 0) setTimerRunning(false); }, [timerLeft, timerRunning]);

  const hms = (ms: number, withMs = true) => {
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, cs = Math.floor(ms / 10) % 100;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${withMs ? `.${String(cs).padStart(2, "0")}` : ""}`;
  };
  const zones = [
    { city: "Halifax", tz: "America/Halifax" },
    { city: "Montréal", tz: "America/Toronto" },
    { city: "Vancouver", tz: "America/Vancouver" },
    { city: "London", tz: "Europe/London" },
    { city: "Valladolid", tz: "Europe/Madrid" },
  ];

  return (
    <Window win={win} className={styles.win}>
      <div className={styles.frame}>
        <div className={styles.titleBar} data-drag>
          <span className={styles.titleText}>Clock</span>
          <CaptionButtons win={win} />
        </div>
        <div className={styles.clockBody}>
          <div className={styles.clockRail}>
            {([["world", "World clock", <F.Globe key="g" size={18} />], ["stopwatch", "Stopwatch", <F.ClockIcon key="c" size={18} />], ["timer", "Timer", <F.Bell key="b" size={18} />]] as const).map(([id, label, icon]) => (
              <button key={id} className={`${styles.clockTab} ${tab === id ? styles.clockTabOn : ""}`} onClick={() => setTab(id)}>{icon}<span>{label}</span></button>
            ))}
          </div>
          <div className={styles.clockMain}>
            {tab === "world" && (
              <div className={styles.zones}>
                {zones.map((z) => (
                  <div key={z.tz} className={styles.zone}>
                    <span className={styles.zoneCity}>{z.city}</span>
                    <span className={styles.zoneTime} suppressHydrationWarning>{now ? now.toLocaleTimeString("en-CA", { timeZone: z.tz, hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--"}</span>
                    <span className={styles.zoneDate} suppressHydrationWarning>{now ? now.toLocaleDateString("en-CA", { timeZone: z.tz, weekday: "short", month: "short", day: "numeric" }) : ""}</span>
                  </div>
                ))}
              </div>
            )}
            {tab === "stopwatch" && (
              <div className={styles.timerPane}>
                <div className={styles.bigTime}>{hms(swMs)}</div>
                <div className={styles.timerBtns}>
                  <button className={styles.primary} onClick={() => setSwRunning((r) => !r)}>{swRunning ? "Pause" : "Start"}</button>
                  <button className={styles.secondary} onClick={() => { setSwMs(0); setLaps([]); setSwRunning(false); }}>Reset</button>
                  <button className={styles.secondary} disabled={!swRunning} onClick={() => setLaps((l) => [swMs, ...l])}>Lap</button>
                </div>
                <div className={styles.laps}>{laps.map((l, i) => <div key={i}><span>{laps.length - i}</span><b>{hms(l)}</b></div>)}</div>
              </div>
            )}
            {tab === "timer" && (
              <div className={styles.timerPane}>
                <div className={`${styles.bigTime} ${timerLeft === 0 ? styles.timerDone : ""}`}>{hms(timerLeft, false)}</div>
                <input className={styles.range} type="range" min={30} max={3600} step={30} value={Math.round(timerSet / 1000)} disabled={timerRunning} onChange={(e) => { const v = Number(e.target.value) * 1000; setTimerSet(v); setTimerLeft(v); }} />
                <div className={styles.timerBtns}>
                  <button className={styles.primary} disabled={timerLeft === 0} onClick={() => setTimerRunning((r) => !r)}>{timerRunning ? "Pause" : "Start"}</button>
                  <button className={styles.secondary} onClick={() => { setTimerRunning(false); setTimerLeft(timerSet); }}>Reset</button>
                </div>
                {timerLeft === 0 && <div className={styles.timerAlert}>Time&apos;s up.</div>}
              </div>
            )}
          </div>
        </div>
        <span style={{ display: "none" }}>{active ? "" : ""}</span>
      </div>
    </Window>
  );
}
