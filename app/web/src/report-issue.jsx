/* ---------------------------------------------------------------------------
   REPORT AN ISSUE — on every page (Bible §17, BP-17-1).
   Owner, 14 Sep 2026: "my bots on the platform now to work too, with us as
   humans — testing and calling out what needs to be fixed, enhanced, and
   reporting issues."

   One small control in the page chrome. A person (or a bot, through the same
   RPC) says what is wrong or what would be better; the page, the role, the
   address and the figures visible on the screen are captured as they stand
   and the report lands in agent_findings (scope qa:<view_key>) — on the
   Findings queue now, in Today when it exists. Nothing invented: a report with
   no words is refused by the database, not padded by the page.

   Built from existing primitives (.btn, .assign popover, .msg). The theme is
   untouched; the bots' Ask bar is not edited (Grok's surface) — this sits
   beside it.
--------------------------------------------------------------------------- */
import React, { useState } from "react";
import { supabase } from "./lib/supabase.js";

/* The figures a reader can see: headline numbers, tiles, totals — captured as text,
   never re-derived. Bounded so a report stays a report, not a page dump. */
function figuresOnScreen() {
  const out = [];
  const pick = (sel, label) => {
    document.querySelectorAll(sel).forEach((el) => {
      const t = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (t && out.length < 24) out.push(`${label}: ${t.slice(0, 80)}`);
    });
  };
  pick(".sbtotals > div, .sbtotals > button", "strip");
  pick(".card .num, .card .val, .tile .num, .kpi .num, .kpi-num, .big", "tile");
  pick("main h1", "page");
  return out.join(" | ");
}

export default function ReportIssue({ view }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("defect");
  const [what, setWhat] = useState("");
  const [better, setBetter] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const viewKey = String(view || "").split(":")[0] || "unknown";

  const send = async () => {
    if (!what.trim() && !better.trim()) { setMsg({ kind: "err", text: "Say what is wrong, or what would be better." }); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("f_report_issue", {
      p: { kind, view_key: viewKey, what, better, href: window.location.href, viewport: `${window.innerWidth}×${window.innerHeight}`, figures: figuresOnScreen(), reporter: "human" },
    });
    setBusy(false);
    if (error || !data?.ok) { setMsg({ kind: "err", text: error?.message || "Not filed." }); return; }
    setMsg({ kind: "ok", text: `Filed as ${data.kind} on ${viewKey} — it is on the Findings queue with the figures as they stood.` });
    setWhat(""); setBetter("");
    setTimeout(() => { setOpen(false); setMsg(null); }, 1800);
  };

  return (
    <>
      <button type="button" className="btn ghost small ri-btn" title="Report a defect or suggest an improvement on this page" onClick={() => setOpen(true)}>Report an issue</button>
      {open && (
        <div className="assignwrap">
          <button type="button" className="ri-scrim" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="assign ri-dialog" role="dialog" aria-label="Report an issue on this page" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
            <b>Report an issue</b>
            <p className="asub">page <code>{viewKey}</code> · the figures on screen are captured with it</p>
            <label htmlFor="ri-kind">Kind</label>
            <select id="ri-kind" className="inp" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="defect">Defect — something is wrong</option>
              <option value="enhancement">Enhancement — something would be better</option>
            </select>
            <label htmlFor="ri-what">What is wrong</label>
            <textarea id="ri-what" className="inp" rows={3} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="The number, the button, the page — what you saw and what you expected" />
            <label htmlFor="ri-better">What would be better</label>
            <textarea id="ri-better" className="inp" rows={2} value={better} onChange={(e) => setBetter(e.target.value)} placeholder="Optional — how it should work" />
            {msg && <div className={`amsg${msg.kind === "err" ? " syncdanger" : ""}`}>{msg.text}</div>}
            <div className="arow2">
              <button type="button" className="btn primary" disabled={busy} onClick={send}>{busy ? "Filing…" : "File it"}</button>
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
