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

   ── WHICH TERMINAL THIS IS, ADDED 15 AUG 2026 ──────────────────────────────
   f_punch_kiosk's first act is `select * from punch_devices where id =
   p_device_id and active and kind = 'kiosk'`, and it raises if that finds
   nothing. So a screen that does not know which registered terminal it is
   cannot clock anybody in — every punch comes back "This terminal is not
   registered or has been deactivated", which reads as the person's fault.

   Nothing in the application shell knows which tablet is on which wall, so the
   screen asks once and remembers the answer in this browser's own storage.
   That is what a wall tablet is: set up once, then left alone. The choice is
   always visible in the header and always changeable from the footer, because
   a punch is recorded against a terminal and the person has a right to see
   which one is about to be named.

   The `deviceId` prop still wins where a caller knows — a dedicated tablet
   build can pass it and the screen never asks.
--------------------------------------------------------------------------- */
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";
import "./kiosk.css";

const PIN_LEN = 4;
/* Where this browser remembers which terminal it is. Per device by definition:
   it is a property of the tablet, not of any person, and no person signs in. */
const DEVICE_KEY = "tg.kiosk.device";

/* Storage is unavailable in a locked-down browser and throws rather than
   returning null. A terminal that cannot remember still has to work. */
function rememberedDevice() {
  try { return window.localStorage.getItem(DEVICE_KEY) || ""; } catch { return ""; }
}
function rememberDevice(id) {
  try { window.localStorage.setItem(DEVICE_KEY, id); } catch { /* nothing to do; it will ask again next time */ }
}

export default function Kiosk({ deviceId }) {
  /* null while the read is in flight — distinct from [], which means the read
     succeeded and no terminal has been registered. Those are opposite facts. */
  const [devices, setDevices] = useState(null);
  const [devErr, setDevErr] = useState(null);
  const [chosenId, setChosenId] = useState(() => deviceId || rememberedDevice());
  const [step, setStep] = useState("id");        /* id → pin → result */
  const [who, setWho] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [clock, setClock] = useState(new Date());
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonErr, setReasonErr] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const idle = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* THE REGISTERED TERMINALS. `error` is bound and shown. A read that returns
     null on a permission denial, a dropped table or a statement timeout would
     otherwise be indistinguishable from "no terminals have been registered" —
     and this screen would then tell somebody to go and register one that is
     already there. Loading, failed and genuinely empty are three states. */
  useEffect(() => {
    let live = true;
    supabase.from("punch_devices")
      .select("id, label, location, kind, active")
      .eq("kind", "kiosk").eq("active", true).order("label")
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setDevErr(error.message); return; }
        setDevices(Array.isArray(data) ? data : []);
      });
    return () => { live = false; };
  }, []);

  /* The terminal this screen is acting as, resolved against what is actually
     registered and active RIGHT NOW. A remembered identifier for a terminal
     that has since been deactivated is not silently ignored: f_punch_kiosk
     would refuse the punch and blame the person, so the screen says it. */
  const device = devices ? devices.find((d) => d.id === chosenId) || null : null;
  const staleChoice = !!(devices && chosenId && !device);

  const chooseDevice = (d) => { setChosenId(d.id); rememberDevice(d.id); reset(); };

  /* A wall terminal left showing someone's name is a wall terminal showing
     everyone their colleague's business. Always return to a blank screen. */
  const resetSoon = (ms) => {
    clearTimeout(idle.current);
    idle.current = setTimeout(reset, ms);
  };
  const reset = () => {
    clearTimeout(idle.current);
    setStep("id"); setWho(""); setPin(""); setResult(null);
    setReason(""); setReasonCode(""); setReasonErr(false); setSaveErr(null);
    /* Deliberately NOT the terminal. Which tablet this is survives every reset;
       it is a property of the wall, not of whoever last stood in front of it. */
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
      /* The terminal resolved above, never the raw prop: the prop may be absent
         and the remembered identifier may be for a terminal since deactivated.
         Both are handled before this screen ever offers a keypad. */
      p_device_id: device.id,
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
    /* THE ERROR IS BOUND AND SHOWN. This was `.catch(() => {})`, so a refused
       write — f_explain_late raises on an older punch, on a punch that is not
       late, and on a missing code — produced "Reason recorded. Thank you."
       against nothing having been recorded. The person then walks away
       believing they explained themselves and the manager sees an unexplained
       occurrence. A screen that thanks somebody for a write that failed is the
       worst shape a silent failure takes, because it actively misleads. */
    const { error } = await supabase.rpc("f_explain_late", {
      p_time_entry_id: result.time_entry_id,
      p_reason_code: reasonCode,
      p_explanation: reason.trim(),
    });
    setBusy(false);
    if (error) { setSaveErr(error.message); return; }
    setSaveErr(null);
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

  /* WHICH TERMINAL THIS IS COMES FIRST, and it is a gate rather than a banner.
     Every punch below needs it, and offering a keypad that cannot possibly
     succeed is how a working system gets blamed on the person using it. */
  const noTerminal = !device;

  return (
    <div className="kiosk">
      {/* THIS TERMINAL DECLARES ITSELF UNDATED, AND THAT IS THE CORRECT ANSWER.
        *
        * docs/REMAINING_PAGES.md: "Declare (no fake range) if there is no list."
        * This page lists no records. Its only repeated markup is a numeric keypad,
        * an alphabet picker, the PIN dots, and — when no terminal is configured —
        * a chooser of devices to BE. It reads punch_devices to know which terminal
        * it is and calls f_punch_kiosk to write one punch. Nothing on it is a
        * result set, so a date range would narrow nothing and a search would find
        * nothing, and mounting either puts a control on a wall-mounted screen that
        * changes no number on it.
        *
        * What it writes is stamped as of the moment somebody taps it, which is
        * what the line below says — on the terminal itself, where the person
        * clocking in can read it. */}
      <div className="kasof">
        This is a punch terminal, not a record list. Your punch is stamped as of
        the moment you tap it.
      </div>
      <div className="ktop">
        <div className="kclock">
          {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          <span>{clock.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
        {device && (
          <div className="kwhich">
            <b>{device.label}</b>
            <i>{device.location || "No location recorded for this terminal"}</i>
          </div>
        )}
      </div>

      {/* ── THE READ FAILED ─────────────────────────────────────────────────
          Not an empty screen and not "no terminals registered", which would be
          a different fact and would send somebody to register a second one. */}
      {noTerminal && devErr && (
        <div className="kbody">
          <h1>This terminal cannot check itself</h1>
          <div className="kfail">
            <b>The list of registered terminals could not be read.</b>
            Nobody can clock in from this screen until it can. Show this to whoever
            looks after the system — it is the database&rsquo;s own words.
            <code>{devErr}</code>
          </div>
        </div>
      )}

      {/* ── STILL READING ───────────────────────────────────────────────── */}
      {noTerminal && !devErr && devices === null && (
        <div className="kbody"><p className="ksub">Checking which terminal this screen is&hellip;</p></div>
      )}

      {/* ── THE READ SUCCEEDED AND THERE ARE NONE ───────────────────────────
          The honest empty state. It names the page that fixes it rather than
          leaving somebody staring at a keypad that refuses every punch. */}
      {noTerminal && !devErr && devices !== null && devices.length === 0 && (
        <div className="kbody">
          <h1>This screen is not a terminal yet</h1>
          <div className="knone">
            <b>No wall terminal has been registered.</b>
            Clocking in is recorded against a named terminal, so until one exists
            every punch from this screen would be refused. An owner, executive,
            administrator, Human Resources or finance chief can register this
            screen on <b>Terminals &amp; Credentials</b>, under Human Resources.
            Nobody needs a PIN before that is done.
          </div>
        </div>
      )}

      {/* ── CHOOSE, OR CHOOSE AGAIN ───────────────────────────────────────── */}
      {noTerminal && !devErr && devices !== null && devices.length > 0 && (
        <div className="kbody">
          <h1>Which terminal is this?</h1>
          <p className="ksub">
            Choose once. This screen remembers, and every punch made here is recorded
            against the terminal you pick.
          </p>
          {staleChoice && (
            <div className="knone">
              <b>The terminal this screen was set to is no longer active.</b>
              It has been deactivated or removed on Terminals &amp; Credentials, so
              punches made against it would be refused. Pick a current one below.
            </div>
          )}
          <div className="kpick">
            {devices.map((d) => (
              <button key={d.id} className="kpickrow" onClick={() => chooseDevice(d)}>
                <b>{d.label}</b>
                <i>{d.location || "No location recorded for this terminal"}</i>
              </button>
            ))}
          </div>
        </div>
      )}

      {!noTerminal && step === "id" && (
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

      {!noTerminal && step === "pin" && (
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

      {!noTerminal && step === "result" && result && (
        <div className={`kbody kres ${result.ok ? "ok" : "bad"}`}>
          {!result.ok ? (
            <>
              <div className="kicon">✕</div>
              <h1>That didn&rsquo;t work</h1>
              <p className="ksub">{result.message}</p>
              <button className="kgo" onClick={reset}>Try again</button>
            </>
          ) : result.late_minutes > 0 && !result.explained ? (
            <>
              <div className="kicon warn">!</div>
              <h1>You&rsquo;re {result.late_minutes} minutes late</h1>
              <p className="ksub">
                You are clocked in. Repeated lateness may lead to a disciplinary
                warning. If there is a reason, tell us now — it is recorded with
                your punch and a manager sees it.
              </p>
              <div className="kreason">
                <select aria-label="Reason" value={reasonCode} onChange={(e) => { setReasonCode(e.target.value); setReasonErr(false); }}>
                  <option value="">Choose a reason…</option>
                  <option>Traffic or transport</option>
                  <option>Family emergency</option>
                  <option>Illness</option>
                  <option>Weather</option>
                  <option>Gowning or airlock queue</option>
                  <option>Approved by my lead</option>
                  <option>No excuse</option>
                </select>
                <textarea aria-label="Note" rows={2} placeholder="What happened?"
                  value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(false); }} />
                {reasonErr && <div className="kerr">Choose a reason and write a short explanation.</div>}
                {/* The refusal in the database's own words. It is specific — a
                    reason may only be given on the day, and only on a punch that
                    was actually late — and a person who is told which of those
                    applied can act on it. "Something went wrong" cannot be. */}
                {saveErr && (
                  <div className="kerr">
                    Your reason was <b>not</b> recorded: {saveErr}
                  </div>
                )}
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
              {/* f_punch composes a sentence about what it just did — which
                  shift it matched, whether it opened or closed an entry — and
                  this screen used to throw it away on the one path where it is
                  good news. The system's own words, shown as its words. */}
              {result.message && <div className="kmsg">{result.message}</div>}
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
        <span>
          {device
            ? <>Every punch is recorded against your name and <b>{device.label}</b>.</>
            : "Every punch is recorded against your name and the terminal it was made on."}
        </span>
        {/* Only offered once there is something to change, and only when nobody
            is mid-punch: a terminal that can be re-pointed while a PIN is on
            screen is a terminal whose record of who punched where is arguable.
            `deviceId` given by a caller is that caller's decision, not this
            screen's, so it is not offered for change here. */}
        {device && !deviceId && step === "id" && who === "" && (
          <button onClick={() => { setChosenId(""); rememberDevice(""); reset(); }}>
            This is a different terminal
          </button>
        )}
      </div>
    </div>
  );
}
