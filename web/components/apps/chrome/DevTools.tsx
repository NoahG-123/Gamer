"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./DevTools.module.css";
import { PaneHandle } from "./WebPane";
import * as M from "@/components/icons/material";

/**
 * Chrome's Inspect, built into the browser rather than handed to Chromium.
 *
 * Electron will open its own devtools on a tab, but they arrive as a separate top-level
 * window, which is invisible behind a fullscreen frameless shell — so from inside the
 * machine, Inspect did nothing at all. This panel docks to the bottom of the tab the way
 * Chrome's does and runs everything through one expression evaluated in the page, so it
 * works identically in Electron and in the plain-browser fallback.
 *
 * Elements walks the live DOM, Styles reads the computed style of the selected node,
 * Console evaluates what you type, and Network lists what the page actually loaded.
 */

type TabId = "elements" | "styles" | "console" | "network";
const TABS: { id: TabId; label: string }[] = [
  { id: "elements", label: "Elements" },
  { id: "styles", label: "Styles" },
  { id: "console", label: "Console" },
  { id: "network", label: "Network" },
];

interface DomNode { i: number; depth: number; tag: string; id: string; cls: string; text: string; kids: number; closing?: boolean }
interface Entry { name: string; type: string; size: number; ms: number }
interface Line { kind: "in" | "out" | "err"; text: string }

/** Serialised once inside the page: the whole panel is driven by these three expressions. */
const SNAPSHOT = `(function(){
  var out=[],n=0;
  function label(el){return {tag:el.tagName.toLowerCase(),id:el.id||"",cls:(typeof el.className==="string"?el.className:"").trim()};}
  function walk(el,depth){
    if(n>1200) return;
    var kids=[].slice.call(el.children);
    var text="";
    for(var j=0;j<el.childNodes.length;j++){var c=el.childNodes[j];if(c.nodeType===3&&c.nodeValue.trim())text+=c.nodeValue.trim()+" ";}
    var L=label(el);
    out.push({i:n++,depth:depth,tag:L.tag,id:L.id,cls:L.cls,text:text.trim().slice(0,120),kids:kids.length});
    if(depth<14){for(var k=0;k<kids.length;k++)walk(kids[k],depth+1);}
    if(kids.length&&depth<14)out.push({i:-1,depth:depth,tag:L.tag,id:"",cls:"",text:"",kids:0,closing:true});
  }
  walk(document.documentElement,0);
  window.__foundNodes=[];
  (function collect(el){window.__foundNodes.push(el);var k=[].slice.call(el.children);if(window.__foundNodes.length<1300)k.forEach(collect);} )(document.documentElement);
  return JSON.stringify({nodes:out,title:document.title,url:location.href});
})()`;

const NETWORK = `(function(){
  try{
    var es=performance.getEntriesByType("resource").concat(performance.getEntriesByType("navigation"));
    return JSON.stringify(es.slice(-200).map(function(e){
      return {name:e.name,type:e.initiatorType||"document",size:Math.round(e.transferSize||e.encodedBodySize||0),ms:Math.round(e.duration)};
    }));
  }catch(e){return "[]";}
})()`;

function stylesFor(index: number): string {
  return `(function(){
    var el=(window.__foundNodes||[])[${index}];
    if(!el) return JSON.stringify({error:"That element is no longer on the page."});
    var cs=getComputedStyle(el), want=["display","position","top","left","width","height","margin","padding","border","box-sizing","color","background-color","font-family","font-size","font-weight","line-height","opacity","z-index","overflow","flex","grid-template-columns","transform"];
    var props={};
    for(var i=0;i<want.length;i++) props[want[i]]=cs.getPropertyValue(want[i]);
    var attrs={};
    for(var j=0;j<el.attributes.length;j++) attrs[el.attributes[j].name]=el.attributes[j].value;
    var r=el.getBoundingClientRect();
    return JSON.stringify({props:props,attrs:attrs,box:{w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.left),y:Math.round(r.top)},html:el.outerHTML.slice(0,2000)});
  })()`;
}

function highlight(index: number, on: boolean): string {
  return `(function(){
    var id="__found_inspect_overlay";
    var old=document.getElementById(id); if(old) old.remove();
    if(!${on ? "true" : "false"}) return "";
    var el=(window.__foundNodes||[])[${index}]; if(!el) return "";
    var r=el.getBoundingClientRect();
    var d=document.createElement("div"); d.id=id;
    d.style.cssText="position:fixed;pointer-events:none;z-index:2147483647;background:rgba(111,168,220,.35);outline:1px solid rgba(111,168,220,.9);top:"+r.top+"px;left:"+r.left+"px;width:"+r.width+"px;height:"+r.height+"px";
    document.documentElement.appendChild(d);
    return "";
  })()`;
}

export function DevTools({ pane, url, onClose }: { pane: PaneHandle | null | undefined; url: string; onClose: () => void }) {
  const [tab, setTab] = useState<TabId>("elements");
  const [nodes, setNodes] = useState<DomNode[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ props?: Record<string, string>; attrs?: Record<string, string>; box?: { w: number; h: number; x: number; y: number }; html?: string; error?: string } | null>(null);
  const [net, setNet] = useState<Entry[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const consoleEnd = useRef<HTMLDivElement>(null);

  const run = useCallback(async (code: string): Promise<unknown> => {
    if (!pane) throw new Error("This tab is not ready yet.");
    return pane.eval(code);
  }, [pane]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const raw = (await run(SNAPSHOT)) as string;
      const d = JSON.parse(raw) as { nodes: DomNode[] };
      setNodes(d.nodes);
    } catch (e) {
      // A page from the live internet is another origin, and its DOM is not ours to read.
      setNodes([]);
      setError(`This page will not let the inspector read it: ${(e as Error).message}`);
    }
  }, [run]);

  useEffect(() => { void refresh(); setSelected(null); setDetail(null); }, [refresh, url]);
  useEffect(() => {
    if (tab !== "network") return;
    run(NETWORK).then((raw) => setNet(JSON.parse(String(raw)) as Entry[])).catch(() => setNet([]));
  }, [tab, run, url]);
  useEffect(() => { consoleEnd.current?.scrollIntoView(); }, [lines]);
  // Leave nothing painted on the page when the panel closes.
  useEffect(() => () => { void pane?.eval(highlight(0, false)).catch(() => {}); }, [pane]);

  const select = async (i: number) => {
    setSelected(i);
    setTab((t) => (t === "elements" ? t : "styles"));
    void run(highlight(i, true)).catch(() => {});
    try { setDetail(JSON.parse(String(await run(stylesFor(i))))); } catch (e) { setDetail({ error: (e as Error).message }); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = input.trim();
    if (!code) return;
    setInput("");
    setLines((l) => [...l, { kind: "in", text: code }]);
    try {
      const v = await run(`(function(){try{var r=eval(${JSON.stringify(code)});return typeof r==="object"?JSON.stringify(r):String(r);}catch(e){return "\\u0000"+e.message;}})()`);
      const s = String(v);
      setLines((l) => [...l, s.startsWith("\u0000") ? { kind: "err", text: s.slice(1) } : { kind: "out", text: s }]);
    } catch (err) {
      setLines((l) => [...l, { kind: "err", text: (err as Error).message }]);
    }
  };

  const visible = nodes.filter((n) => !n.closing);

  return (
    <div className={styles.dt}>
      <div className={styles.bar}>
        {TABS.map((t) => (
          <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabOn : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
        <span className={styles.spacer} />
        <button className={styles.iconBtn} title="Re-read the page" onClick={() => void refresh()}><M.MRefresh size={14} /></button>
        <button className={styles.iconBtn} title="Close DevTools" onClick={onClose}><M.MClose size={14} /></button>
      </div>

      {error && <div className={styles.note}>{error}</div>}

      {tab === "elements" && (
        <div className={styles.body}>
          <div className={styles.tree}>
            {visible.map((n) => (
              <div
                key={n.i}
                className={`${styles.node} ${selected === n.i ? styles.nodeOn : ""}`}
                style={{ paddingLeft: 8 + n.depth * 12 }}
                onClick={() => void select(n.i)}
              >
                <span className={styles.punct}>&lt;</span>
                <span className={styles.tag}>{n.tag}</span>
                {n.id && <><span className={styles.attr}> id</span><span className={styles.punct}>=</span><span className={styles.val}>&quot;{n.id}&quot;</span></>}
                {n.cls && <><span className={styles.attr}> class</span><span className={styles.punct}>=</span><span className={styles.val}>&quot;{n.cls.slice(0, 60)}&quot;</span></>}
                <span className={styles.punct}>&gt;</span>
                {n.text && <span className={styles.text}>{n.text}</span>}
                {n.kids > 0 && <span className={styles.kids}>{n.kids}</span>}
              </div>
            ))}
            {!visible.length && !error && <div className={styles.note}>Nothing to show yet.</div>}
          </div>
        </div>
      )}

      {tab === "styles" && (
        <div className={styles.body}>
          <div className={styles.pane}>
            {!detail && <div className={styles.note}>Pick an element on the Elements tab.</div>}
            {detail?.error && <div className={styles.note}>{detail.error}</div>}
            {detail?.box && <div className={styles.box}>{detail.box.w} × {detail.box.h} at {detail.box.x}, {detail.box.y}</div>}
            {detail?.attrs && Object.keys(detail.attrs).length > 0 && (
              <>
                <div className={styles.head}>Attributes</div>
                {Object.entries(detail.attrs).map(([k, v]) => (
                  <div key={k} className={styles.prop}><span className={styles.attr}>{k}</span><span className={styles.val}>{String(v).slice(0, 200)}</span></div>
                ))}
              </>
            )}
            {detail?.props && (
              <>
                <div className={styles.head}>Computed</div>
                {Object.entries(detail.props).map(([k, v]) => (
                  <div key={k} className={styles.prop}><span className={styles.attr}>{k}</span><span className={styles.val}>{v || "—"}</span></div>
                ))}
              </>
            )}
            {detail?.html && (
              <>
                <div className={styles.head}>HTML</div>
                <pre className={styles.pre}>{detail.html}</pre>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "console" && (
        <div className={styles.body}>
          <div className={styles.console}>
            {lines.map((l, i) => <div key={i} className={`${styles.line} ${styles[l.kind]}`}>{l.kind === "in" ? "› " : l.kind === "err" ? "✕ " : "‹ "}{l.text}</div>)}
            <div ref={consoleEnd} />
          </div>
          <form className={styles.prompt} onSubmit={submit}>
            <span className={styles.caret}>›</span>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Run an expression against this page" spellCheck={false} />
          </form>
        </div>
      )}

      {tab === "network" && (
        <div className={styles.body}>
          <div className={styles.pane}>
            <div className={styles.netHead}><span>Name</span><span>Type</span><span>Size</span><span>Time</span></div>
            {net.map((e, i) => (
              <div key={i} className={styles.netRow}>
                <span title={e.name}>{e.name.replace(/^https?:\/\/[^/]+/, "") || e.name}</span>
                <span>{e.type}</span>
                <span>{e.size ? `${(e.size / 1024).toFixed(1)} kB` : "—"}</span>
                <span>{e.ms} ms</span>
              </div>
            ))}
            {!net.length && <div className={styles.note}>Nothing recorded for this page.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
