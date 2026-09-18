"use client";
import React from "react";

/** Chrome's "No internet" page, shown when Wi-Fi is off on this machine. */
export default function OfflinePage() {
  const [host, setHost] = React.useState("");
  React.useEffect(() => {
    const u = new URLSearchParams(location.search).get("u") ?? "";
    try { setHost(u ? new URL(u).hostname : ""); } catch { setHost(""); }
  }, []);
  return (
    <div style={{ minHeight: "100vh", background: "#202124", color: "#e8eaed", fontFamily: '"Segoe UI", Roboto, Arial, sans-serif', display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 600 }}>
        <svg width="72" height="72" viewBox="0 0 24 24" style={{ marginBottom: 28, opacity: 0.55 }}><path fill="#9aa0a6" d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zM3.53 2.71L2.12 4.12l2.11 2.11C2.4 7.09 1.1 8.05.36 8.62L12 23l3.91-4.86 2.97 2.97 1.41-1.41L3.53 2.71z" /></svg>
        <h1 style={{ fontSize: 22, fontWeight: 400, margin: "0 0 16px" }}>No internet</h1>
        <p style={{ color: "#9aa0a6", lineHeight: 1.7, margin: "0 0 20px" }}>
          Try:<br />• Checking the network cables, modem and router<br />• Reconnecting to Wi-Fi<br />• Running Windows Network Diagnostics
        </p>
        <p style={{ color: "#9aa0a6", fontSize: 12 }}>ERR_INTERNET_DISCONNECTED{host ? ` — ${host}` : ""}</p>
        <button onClick={() => location.reload()} style={{ marginTop: 24, background: "#8ab4f8", color: "#202124", border: 0, borderRadius: 4, padding: "9px 18px", fontSize: 13 }}>Reload</button>
      </div>
    </div>
  );
}
