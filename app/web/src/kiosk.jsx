/* ---------------------------------------------------------------------------
   THE WALL TERMINAL
   Owner, 8 Aug 2026: clock in no less than five minutes before shift, be in
   zone ready to work at the start.

   This is not a page in an app. It is a screen bolted to a wall, used with
   gloves on, at 6:52 in the morning, by someone who has thirty seconds. So:

     - No session. A shared terminal must never hold one.
     - Big targets. Gloves do not hit 40px buttons.
     - One question at a time. ID, then PIN. Never a form.
     - It says what happened in words, not a toast that fades.
     - Late is challenged HERE, at the moment, while the reason is fresh —
       not three weeks later in a write-up nobody can now explain.

   Identity is login_id + PIN via f_punch_kiosk(), deliberately separate from
   app_users: a packager with no app login still has to be able to clock in.
--------------------------------------------------------------------------- */
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";

const PIN_LEN = 4;

export default function Kiosk({ deviceId }) {
  const [step, setStep] = useState("id");        /* id → pin → result */
  const [who, setWho] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [clock, setClock] = useState(new Date());
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonErr, setReasonErr] = useState(false);
  const idle = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* A wall terminal left showing someone's name is a wall terminal showing
     everyone their colleague's business. Always return to a blank screen. */
  const resetSoon = (ms) => {
    clearTimeout(idle.current);
    idle.current = setTimeout(reset, ms);
  };
  const reset = () => {
    clearTimeout(idle.current);
    setStep("id"); setWho(""); setPin(""); setResult(null);
    setReason(""); setReasonCode(""); setReasonErr(false);
  };
  useEffect(() => () => clearTimeout(idle.current), []);

  const tapId = (ch) => {
    if (ch === "del") setWho((v) => v.slice(0, -1));
    else if (ch === "clr") setWho("");
    else setWho((v) => (v.length < 20 ? v + ch : v));
    resetSoon(45000);
  };

  const tapPin = async (ch) => {
    if (ch === "del") { setPin((v) => v.slice(0, -1)); resetSoon(45000); return; }
    if (ch === "clr") { setPin(""); resetSoon(45000); return; }
    const next = pin.length < PIN_LEN ? pin + ch : pin;
    setPin(next);
    resetSoon(45000);
    if (next.length === PIN_LEN) await punch(next);
  };

  async function punch(fullPin) {
    setBusy(true);
    const { data, error } = await supabase.rpc("f_punch_kiosk", {
      p_login_id: who.trim(),
      p_pin: fullPin,
      p_device_id: deviceId,
      p_kind: null,
    });
    setBusy(false);
    setPin("");

    if (error) {
      setResult({ ok: false, message: error.message });
      setStep("result");
      resetSoon(6000);
      return;
    }
    setResult({ ok: true, ...(data || {}) });
    setStep("result");
    /* A late punch stays on screen until the person explains it. Everything
       else clears itself. */
    if (!(data && data.late_minutes > 0)) resetSoon(7000);
  }

  async function saveReason() {
    if (!reasonCode || reason.trim().length < 4) { setReasonErr(true); return; }
    setBusy(true);
    await supabase.rpc("f_explain_late", {
      p_time_entry_id: result.time_entry_id,
      p_reason_code: reasonCode,
      p_explanation: reason.trim(),
    }).catch(() => {});
    setBusy(false);
    setResult((r) => ({ ...r, explained: true }));
    resetSoon(4000);
  }

  const pad = (onTap, extra) => (
    <div className="kpad">
      {["1","2","3","4","5","6","7","8","9"].map((n) => (
        <button key={n} onClick={() => onTap(n)}>{n}</button>
      ))}
      <button className="kalt" onClick={() => onTap("clr")}>Clear</button>
      <button onClick={() => onTap("0")}>0</button>
      {extra}
    </div>
  );

  return (
    <div className="kiosk">
      <div className="ktop">
        <div className="kclock">
          {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          <span>{clock.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
      </div>

      {step === "id" && (
        <div className="kbody">
          <h1>Clock in</h1>
          <p className="ksub">Enter your ID, then your PIN</p>
          <div className="kshow">{who || <em>your ID</em>}</div>
          <div className="kletters">
            {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => (
              <button key={c} onClick={() => tapId(c)}>{c}</button>
            ))}
            <button className="kalt" onClick={() => tapId("del")}>←</button>
          </div>
          <button className="kgo" disabled={who.trim().length < 2}
            onClick={() => { setStep("pin"); resetSoon(45000); }}>
            Next
          </button>
        </div>
      )}

      {step === "pin" && (
        <div className="kbody">
          <h1>{who.toUpperCase()}</h1>
          <p className="ksub">Enter your {PIN_LEN}-digit PIN</p>
          <div className="kdots">
            {Array.from({ length: PIN_LEN }).map((_, i) => (
              <i key={i} className={i < pin.length ? "on" : ""} />
            ))}
          </div>
          {pad(tapPin, <button className="kalt" onClick={() => tapPin("del")}>←</button>)}
          <button className="klink" onClick={reset}>Not you? Start again</button>
          {busy && <div className="kbusy">Checking…</div>}
        </div>
      )}

      {step === "result" && result && (
        <div className={`kbody kres ${result.ok ? "ok" : "bad"}`}>
          {!result.ok ? (
            <>
              <div className="kicon">✕</div>
              <h1>That didn't work</h1>
              <p className="ksub">{result.message}</p>
              <button className="kgo" onClick={reset}>Try again</button>
            </>
          ) : result.late_minutes > 0 && !result.explained ? (
            <>
              <div className="kicon warn">!</div>
              <h1>You're {result.late_minutes} minutes late</h1>
              <p className="ksub">
                You are clocked in. Repeated lateness may lead to a disciplinary
                warning. If there is a reason, tell us now — it is recorded with
                your punch and a manager sees it.
              </p>
              <div className="kreason">
                <select value={reasonCode} onChange={(e) => { setReasonCode(e.target.value); setReasonErr(false); }}>
                  <option value="">Choose a reason…</option>
                  <option>Traffic or transport</option>
                  <option>Family emergency</option>
                  <option>Illness</option>
                  <option>Weather</option>
                  <option>Gowning or airlock queue</option>
                  <option>Approved by my lead</option>
                  <option>No excuse</option>
                </select>
                <textarea rows={2} placeholder="What happened?"
                  value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(false); }} />
                {reasonErr && <div className="kerr">Choose a reason and write a short explanation.</div>}
                <div className="krow">
                  <button className="kgo" disabled={busy} onClick={saveReason}>Submit reason</button>
                  <button className="klink" onClick={reset}>Skip — no reason</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="kicon">✓</div>
              <h1>{result.action === "clock_out" ? "Clocked out" : "You're in"}</h1>
              <p className="ksub">
                {result.full_name ? result.full_name + " · " : ""}
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {result.zone ? " · " + result.zone : ""}
              </p>
              {result.explained && <p className="ksub">Reason recorded. Thank you.</p>}
              {result.early_minutes > 0 && (
                <p className="ksub">
                  {result.early_minutes} minutes early — you are not paid before your shift starts.
                </p>
              )}
              <button className="kgo" onClick={reset}>Done</button>
            </>
          )}
        </div>
      )}

      <div className="kfoot">
        Every punch is recorded against your name and this terminal.
      </div>
    </div>
  );
}
