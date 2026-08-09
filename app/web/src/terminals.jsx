/* ---------------------------------------------------------------------------
   TERMINALS & CREDENTIALS
   The screen that was missing, and the whole reason nobody could clock in.

   f_set_punch_pin() and punch_devices existed from the first day of this
   build. What did not exist was anywhere to call them from — so the clock
   sat at zero punches while every page above it was finished and tested.
   A capability with no interface is a capability nobody has.

   Two jobs, deliberately on one page, because they are the same job:
     1. Register the tablet or door scanner  (the instrument)
     2. Give a person a PIN or a badge       (the credential)
   Neither is any use without the other.

   Rules this page holds to:
     - A PIN is never displayed after it is set. It is bcrypt in the database
       and cannot be read back; showing it once and never again is the only
       honest thing the interface can do.
     - The device token is shown ONCE, at registration. It goes in the tablet.
     - Deactivating a device refuses its punches immediately. Losing a tablet
       must not mean losing control of the clock.
--------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";

const nameOf = (n) => { const [l = "", r = ""] = String(n || "").split(","); return r.trim() ? `${r.trim()} ${l.trim()}` : l.trim(); };
const initials = (n) => { const [l = "", r = ""] = String(n || "").split(","); return ((r.trim()[0] || "") + (l.trim()[0] || "")).toUpperCase() || "?"; };
const ago = (t) => {
  if (!t) return "never";
  const m = Math.floor((Date.now() - new Date(t)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)} h ago`;
  return `${Math.floor(m / 1440)} d ago`;
};

export default function Terminals({ go }) {
  const [devices, setDevices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [canDo, setCanDo] = useState(false);
  const [tab, setTab] = useState("devices");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [newToken, setNewToken] = useState(null);

  const [dLabel, setDLabel] = useState("");
  const [dKind, setDKind] = useState("kiosk");
  const [dLocation, setDLocation] = useState("");

  const [pinFor, setPinFor] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [badgeFor, setBadgeFor] = useState("");
  const [badge, setBadge] = useState("");

  const load = useCallback(async () => {
    const [d, s, c] = await Promise.all([
      supabase.from("punch_devices").select("*").order("kind").order("label"),
      supabase.from("employees")
        .select("id, full_name, employee_code, login_id, status, pin_set_at, badge_code")
        .eq("status", "active").order("full_name"),
      supabase.rpc("f_can_decide_hr"),
    ]);
    setDevices(d.data ?? []);
    setStaff(s.data ?? []);
    setCanDo(!!c.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => ({
    kiosks: devices.filter(d => d.kind === "kiosk" && d.active).length,
    scanners: devices.filter(d => d.kind === "scanner" && d.active).length,
    withPin: staff.filter(s => s.pin_set_at).length,
    withBadge: staff.filter(s => s.badge_code).length,
    total: staff.length,
  }), [devices, staff]);

  async function addDevice(e) {
    e.preventDefault();
    if (dLabel.trim().length < 3) { setMsg("Give the terminal a name people will recognise."); return; }
    setBusy(true); setMsg(null); setNewToken(null);
    /* Generated in the browser, stored once, shown once. */
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabase.from("punch_devices").insert({
      label: dLabel.trim(), kind: dKind, location: dLocation.trim() || null,
      device_token: token, active: true,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setNewToken({ label: dLabel.trim(), token });
    setDLabel(""); setDLocation("");
    load();
  }

  async function toggleDevice(d) {
    setBusy(true);
    const { error } = await supabase.from("punch_devices")
      .update({ active: !d.active }).eq("id", d.id);
    setBusy(false);
    setMsg(error ? error.message
      : d.active ? `${d.label} deactivated — it will refuse punches immediately.`
                 : `${d.label} reactivated.`);
    load();
  }

  async function savePin(e) {
    e.preventDefault();
    if (!pinFor) { setMsg("Choose who the PIN is for."); return; }
    if (!/^[0-9]{4,8}$/.test(pin)) { setMsg("A PIN is 4 to 8 digits."); return; }
    if (pin !== pin2) { setMsg("The two PINs do not match."); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("f_set_punch_pin", {
      p_employee_id: pinFor, p_pin: pin,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    const who = staff.find(s => s.id === pinFor);
    setMsg(`PIN set for ${nameOf(who?.full_name)} (${who?.login_id}). Tell them in person — it cannot be read back from here.`);
    setPin(""); setPin2(""); setPinFor("");
    load();
  }

  async function saveBadge(e) {
    e.preventDefault();
    if (!badgeFor || badge.trim().length < 3) { setMsg("Choose a person and scan or type the badge."); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("employees")
      .update({ badge_code: badge.trim() }).eq("id", badgeFor);
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setMsg(`Badge linked. It will open the door clock immediately.`);
    setBadge(""); setBadgeFor("");
    load();
  }

  return (
    <div className="tm">
      <div className="tmhead">
        <div>
          <h1>Terminals &amp; credentials</h1>
          <div className="tmsub">
            Register the instrument, then give people the credential. <b>Nobody can clock in until both exist.</b>
          </div>
        </div>
        <button className="btn ghost small" onClick={() => go?.("kiosk")}>Open the wall terminal</button>
      </div>

      <div className="tmstats">
        <div className={stats.kiosks ? "" : "hot"}><b>{stats.kiosks}</b><span>wall terminals</span></div>
        <div><b>{stats.scanners}</b><span>door scanners</span></div>
        <div className={stats.withPin ? "" : "hot"}><b>{stats.withPin}</b><span>of {stats.total} have a PIN</span></div>
        <div><b>{stats.withBadge}</b><span>have a badge</span></div>
      </div>

      {!canDo && (
        <div className="tmwarn">
          You can see this page but not change it. Registering a terminal or setting
          a PIN is limited to owner, executive, admin, HR and CFO.
        </div>)}

      {msg && <div className="tmmsg">{msg}</div>}

      {newToken && (
        <div className="tmtoken">
          <b>Device token for {newToken.label}</b>
          <code>{newToken.token}</code>
          <span>
            Copy this into the tablet now. It is shown <b>once</b> — it is the only
            thing proving that terminal is yours, and it is not stored anywhere you
            can read it back.
          </span>
          <button className="btn small" onClick={() => setNewToken(null)}>I have copied it</button>
        </div>)}

      <div className="tmtabs">
        {[["devices","Terminals"],["pins","PINs"],["badges","Badges"]].map(([k,l]) => (
          <button key={k} className={tab===k?"on":""} onClick={() => { setTab(k); setMsg(null); }}>{l}</button>))}
      </div>

      {tab === "devices" && (
        <>
          <form className="tmform" onSubmit={addDevice}>
            <div className="tmf">
              <label>Name</label>
              <input value={dLabel} onChange={(e) => setDLabel(e.target.value)}
                placeholder="Packaging wall terminal" disabled={!canDo} />
            </div>
            <div className="tmf">
              <label>Kind</label>
              <select value={dKind} onChange={(e) => setDKind(e.target.value)} disabled={!canDo}>
                <option value="kiosk">Wall terminal — ID and PIN</option>
                <option value="scanner">Door scanner — badge only</option>
              </select>
            </div>
            <div className="tmf">
              <label>Where it is</label>
              <input value={dLocation} onChange={(e) => setDLocation(e.target.value)}
                placeholder="Room B, by the gowning door" disabled={!canDo} />
            </div>
            <button className="btn" disabled={busy || !canDo}>Register</button>
          </form>

          {devices.length === 0 ? (
            <div className="tmempty">
              <b>No terminals registered</b>
              <span>This is why the clock is empty. Register one above and the wall
                terminal, the offline queue and every attendance report start working.</span>
            </div>
          ) : (
            <div className="tmlist">
              {devices.map(d => (
                <div className={`tmrow ${d.active ? "" : "off"}`} key={d.id}>
                  <span className={`tmk ${d.kind}`}>{d.kind === "kiosk" ? "terminal" : "scanner"}</span>
                  <span className="tmn"><b>{d.label}</b><i>{d.location || "no location set"}</i></span>
                  <span className="tmseen">{ago(d.last_seen_at)}</span>
                  <span className={`schip ${d.active ? "ok" : "mute"}`}>{d.active ? "active" : "off"}</span>
                  <button className="btn ghost small" disabled={busy || !canDo}
                    onClick={() => toggleDevice(d)}>{d.active ? "Deactivate" : "Reactivate"}</button>
                </div>))}
            </div>)}
        </>)}

      {tab === "pins" && (
        <>
          <form className="tmform" onSubmit={savePin}>
            <div className="tmf wide">
              <label>Who</label>
              <select value={pinFor} onChange={(e) => setPinFor(e.target.value)} disabled={!canDo}>
                <option value="">Choose a person…</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>
                    {nameOf(s.full_name)} · {s.login_id ?? s.employee_code}
                    {s.pin_set_at ? " — has a PIN" : ""}
                  </option>))}
              </select>
            </div>
            <div className="tmf">
              <label>PIN</label>
              <input type="password" inputMode="numeric" value={pin} maxLength={8}
                onChange={(e) => setPin(e.target.value)} placeholder="4–8 digits" disabled={!canDo} />
            </div>
            <div className="tmf">
              <label>Again</label>
              <input type="password" inputMode="numeric" value={pin2} maxLength={8}
                onChange={(e) => setPin2(e.target.value)} disabled={!canDo} />
            </div>
            <button className="btn" disabled={busy || !canDo}>Set PIN</button>
          </form>

          <div className="tmnote">
            The PIN is hashed the moment it is saved and <b>cannot be read back</b> —
            not by you, not by me, not from the database. Tell the person in the room.
            If it is forgotten, set a new one; there is nothing to look up.
          </div>

          <div className="tmlist">
            {staff.map(s => (
              <div className="tmrow" key={s.id}>
                <span className="tmav">{initials(s.full_name)}</span>
                <span className="tmn"><b>{nameOf(s.full_name)}</b><i>{s.login_id ?? "no login ID"}</i></span>
                <span className={`schip ${s.pin_set_at ? "ok" : "mute"}`}>
                  {s.pin_set_at ? "PIN set" : "no PIN"}</span>
              </div>))}
          </div>
        </>)}

      {tab === "badges" && (
        <>
          <form className="tmform" onSubmit={saveBadge}>
            <div className="tmf wide">
              <label>Who</label>
              <select value={badgeFor} onChange={(e) => setBadgeFor(e.target.value)} disabled={!canDo}>
                <option value="">Choose a person…</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>
                    {nameOf(s.full_name)} · {s.login_id ?? s.employee_code}
                    {s.badge_code ? " — has a badge" : ""}
                  </option>))}
              </select>
            </div>
            <div className="tmf wide">
              <label>Badge or fob</label>
              <input value={badge} onChange={(e) => setBadge(e.target.value)}
                placeholder="Scan the badge, or type its number" disabled={!canDo} />
            </div>
            <button className="btn" disabled={busy || !canDo}>Link badge</button>
          </form>

          <div className="tmnote">
            This is the physical fob presented at a door — <b>not</b> the Cannabis
            Agent Registration number, which is the state licence and lives on the
            employee record.
          </div>

          <div className="tmlist">
            {staff.filter(s => s.badge_code).map(s => (
              <div className="tmrow" key={s.id}>
                <span className="tmav">{initials(s.full_name)}</span>
                <span className="tmn"><b>{nameOf(s.full_name)}</b><i>{s.badge_code}</i></span>
                <span className="schip ok">linked</span>
              </div>))}
          </div>
        </>)}
    </div>
  );
}
