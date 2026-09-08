/* OS chrome: Back / Forward / Home + Spotlight.
   History is in-app so Back never dumps you out of the OS.
   Home is Command Center. Spotlight reads live nav_registry — no frozen page list. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const HOME_VIEW = "dept_dash_command";

export function useOsHistory() {
  const initial = window.location.hash.slice(1) || HOME_VIEW;
  const [view, setViewRaw] = useState(() => window.location.hash.slice(1) || HOME_VIEW);
  const [tick, setTick] = useState(0);
  const st = useRef({ stack: [initial], i: 0 });

  const bump = () => setTick((n) => n + 1);

  const setView = useCallback((next) => {
    if (!next) return;
    const s = st.current;
    if (next === s.stack[s.i]) return;
    const nextStack = s.stack.slice(0, s.i + 1);
    nextStack.push(next);
    if (nextStack.length > 80) nextStack.shift();
    s.stack = nextStack;
    s.i = nextStack.length - 1;
    setViewRaw(next);
    bump();
  }, []);

  const goBack = useCallback(() => {
    const s = st.current;
    if (s.i <= 0) return;
    s.i -= 1;
    setViewRaw(s.stack[s.i]);
    bump();
  }, []);

  const goForward = useCallback(() => {
    const s = st.current;
    if (s.i >= s.stack.length - 1) return;
    s.i += 1;
    setViewRaw(s.stack[s.i]);
    bump();
  }, []);

  const goHome = useCallback(() => {
    setView(HOME_VIEW);
  }, [setView]);

  useEffect(() => {
    if (window.location.hash.slice(1) !== view) {
      window.history.pushState({ os: true, view }, "", `#${view}`);
    }
  }, [view]);

  useEffect(() => {
    const onNav = () => {
      const h = window.location.hash.slice(1) || HOME_VIEW;
      const s = st.current;
      if (h === s.stack[s.i]) return;
      if (s.i > 0 && h === s.stack[s.i - 1]) {
        s.i -= 1;
        setViewRaw(h);
        bump();
        return;
      }
      if (s.i < s.stack.length - 1 && h === s.stack[s.i + 1]) {
        s.i += 1;
        setViewRaw(h);
        bump();
        return;
      }
      setView(h);
    };
    window.addEventListener("popstate", onNav);
    window.addEventListener("hashchange", onNav);
    return () => {
      window.removeEventListener("popstate", onNav);
      window.removeEventListener("hashchange", onNav);
    };
  }, [setView]);

  const canBack = st.current.i > 0;
  const canForward = st.current.i < st.current.stack.length - 1;

  return { view, setView, goBack, goForward, goHome, canBack, canForward, tick };
}

function IcoBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6 9 12l6 6" />
    </svg>
  );
}
function IcoFwd() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
function IcoHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M7 10.5V20h10v-9.5" />
    </svg>
  );
}

function IcoFind() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 5 5" />
    </svg>
  );
}

export function OsNavBtns({ canBack, canForward, goBack, goForward, goHome, onFind }) {
  useEffect(() => {
    function onKey(e) {
      const k = e.key;
      const inField = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (k === "k" || k === "K")) {
        e.preventDefault();
        if (onFind) onFind();
        return;
      }
      if (e.altKey && k === "ArrowLeft") { e.preventDefault(); goBack(); return; }
      if (e.altKey && k === "ArrowRight") { e.preventDefault(); goForward(); return; }
      if (e.altKey && (k === "Home" || k === "h" || k === "H")) { e.preventDefault(); goHome(); return; }
      if (!inField && k === "Backspace") {
        e.preventDefault();
        goBack();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goBack, goForward, goHome, onFind]);

  return (
    <div className="osnav" role="toolbar" aria-label="OS navigation">
      <button type="button" className="tibtn" disabled={!canBack} aria-label="Back" title="Back (Alt+Left)" onClick={goBack}><IcoBack /></button>
      <button type="button" className="tibtn" disabled={!canForward} aria-label="Forward" title="Forward (Alt+Right)" onClick={goForward}><IcoFwd /></button>
      <button type="button" className="tibtn" aria-label="Home — Command Center" title="Home — Command Center (Alt+Home)" onClick={goHome}><IcoHome /></button>
      <button type="button" className="tibtn" aria-label="Find a page" title="Find (Ctrl/Cmd+K)" onClick={() => onFind && onFind()}><IcoFind /></button>
    </div>
  );
}

export function OsFind({ open, onClose, go, pages }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
    if (!open) setQ("");
  }, [open]);

  const list = useMemo(() => {
    const rows = Array.isArray(pages) ? pages : [];
    const needle = q.trim().toLowerCase();
    const hit = needle
      ? rows.filter((p) => {
        const blob = ((p.label || "") + " " + (p.category || "") + " " + (p.view_key || "")).toLowerCase();
        return blob.indexOf(needle) !== -1;
      })
      : rows.slice(0, 18);
    return hit.slice(0, 24);
  }, [pages, q]);

  if (!open) return null;

  function pick(viewKey) {
    if (!viewKey) return;
    go(viewKey);
    onClose();
  }

  return (
    <div className="osfind">
      <button type="button" className="osfind-scrim" aria-label="Close find" onClick={onClose} />
      <div className="osfind-box" role="dialog" aria-label="Find a page">
        <input
          ref={inputRef}
          className="osfind-q"
          aria-label="Find any page in the OS"
          placeholder="Find any page — Command Center, harvests, invoices…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && list[0]) pick(list[0].view_key);
          }}
        />
        <div className="osfind-list">
          {list.length === 0 ? (
            <p className="osfind-empty">No page matches. Nothing invented.</p>
          ) : list.map((p) => (
            <button
              key={p.view_key + (p.label || "")}
              type="button"
              className="osfind-row"
              onClick={() => pick(p.view_key)}
            >
              <b>{p.label}</b>
              <span>{p.category || p.view_key}</span>
            </button>
          ))}
        </div>
        <p className="osfind-hint">Enter opens the first match · Esc closes · Ctrl/Cmd+K</p>
      </div>
    </div>
  );
}
