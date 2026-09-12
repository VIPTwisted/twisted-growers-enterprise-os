/* OS-wide Ask. Owner, 11 Sep 2026: "wire all ai for entire OS".
   Bots desk, Brain and Budz already share askBudzFull. Every other page was
   mute. This bar sits in the chrome so Cultivation, Metrc, invoices, HR — any
   live page — can ask without leaving. The desk is the page you are on. The
   model is the Grok / Claude / ChatGPT tab this computer already pays for.
   Paid API stays off. Metrc stays read-only. Theme tokens only. */
import React, { useEffect, useRef, useState } from "react";
import { askBudzFull } from "./budz.jsx";
import { CHAT_VIEWS, deskForView } from "./lib/os-desk.js";
import { extProviderNow, pingTgBots, providerLabel, topGConnected } from "./lib/topg-connect.js";

export default function OsAsk({ view, go }) {
  const desk = deskForView(view);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState([]);
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(() => topGConnected());
  const inputRef = useRef(null);
  const deskRef = useRef(desk);
  const threadRef = useRef(thread);
  const busyRef = useRef(busy);
  const sendRef = useRef(null);
  deskRef.current = desk;
  threadRef.current = thread;
  busyRef.current = busy;

  useEffect(() => {
    const n = () => setOn(topGConnected());
    window.addEventListener("tg-topg", n);
    pingTgBots().then((p) => { if (p.installed) n(); });
    return () => window.removeEventListener("tg-topg", n);
  }, []);

  async function send(raw) {
    const value = String(raw ?? q).trim();
    if (!value || busyRef.current) return;
    const deskNow = deskRef.current;
    setQ("");
    setOpen(true);
    setThread((m) => [...m, { role: "user", text: value }]);
    setBusy(true);
    busyRef.current = true;
    try {
      const history = threadRef.current
        .filter((m) => m.text && !m.thinking)
        .slice(-8)
        .map((m) => ({ who: m.role === "user" ? "me" : "bot", text: m.text }));
      const out = await askBudzFull(value, history, {
        surface: "os-" + (view || "page"),
        desk: deskNow,
      });
      const body = out.composed
        || out.askErr
        || out.headline
        || `${deskNow.name} could not reach the live assistant. Tap Grok on Bots desk, stay signed in.`;
      setThread((m) => [...m, {
        role: "agent",
        text: body,
        via: out.via || null,
        open: deskNow.open,
      }]);
    } catch (e) {
      setThread((m) => [...m, {
        role: "agent",
        text: `${deskRef.current.name} could not answer: ${String(e?.message ?? e).slice(0, 180)}`,
      }]);
    }
    busyRef.current = false;
    setBusy(false);
  }
  sendRef.current = send;

  useEffect(() => {
    function onAsk(e) {
      const text = String(e.detail?.text || "").trim();
      if (!text) return;
      setOpen(true);
      inputRef.current?.focus();
      sendRef.current?.(text);
    }
    window.addEventListener("tg-os-ask", onAsk);
    return () => window.removeEventListener("tg-os-ask", onAsk);
  }, []);

  if (CHAT_VIEWS.has(view)) return null;

  const who = providerLabel(extProviderNow());

  return (
    <div className={`osask${open ? " open" : ""}`}>
      <form
        className="osask-bar"
        onSubmit={(e) => { e.preventDefault(); send(); }}
      >
        <span className="osask-desk">{desk.name}</span>
        <label className="sr-only" htmlFor="osask-q">Ask {desk.name} about this page</label>
        <input
          id="osask-q"
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={`Ask ${desk.name} about this page`}
          placeholder={`Ask ${desk.name} — weather, this page, anything`}
          disabled={busy}
        />
        <button type="submit" disabled={busy}>{busy ? "…" : "Ask"}</button>
        <span className={`osask-pill${on ? " on" : ""}`} title={on ? `${who} answers from the tab you already pay for` : "Tap Grok on Bots desk first"}>
          {on ? `${who} on` : "tap Grok"}
        </span>
        {thread.length > 0 ? (
          <button type="button" className="osask-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Show"}
          </button>
        ) : null}
      </form>
      {open && thread.length > 0 ? (
        <div className="osask-thread" role="log" aria-live="polite">
          {thread.slice(-6).map((m, i) => (
            <div key={i} className={m.role === "user" ? "osask-bubble me" : "osask-bubble"}>
              {String(m.text || "").split("\n").slice(0, 40).map((line, li) => <p key={li}>{line}</p>)}
              {m.via ? <p className="osask-via">{m.via}</p> : null}
            </div>
          ))}
          {busy ? <div className="osask-bubble"><p>Asking Grok…</p></div> : null}
          <div className="osask-actions">
            {desk.open && go ? (
              <button type="button" onClick={() => go(desk.open)}>Open {desk.name} desk</button>
            ) : null}
            {go ? (
              <button type="button" onClick={() => go("os_staff")}>Open Bots</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
