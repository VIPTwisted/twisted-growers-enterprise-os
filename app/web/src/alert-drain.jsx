/* Alert drain. Unsent email clones close in families. Findings stay. CERTIFIED 0. */
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";

function n(v) {
  if (v == null) return "—";
  const x = Number(v);
  return Number.isFinite(x) ? x.toLocaleString() : "—";
}

export default function AlertDrain({ go, session }) {
  const [groups, setGroups] = useState(null);
  const [live, setLive] = useState(null);
  const [err, setErr] = useState(null);
  const [role, setRole] = useState(null);
  const [note, setNote] = useState("");
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const uid = session && session.user && session.user.id;
    const [out, inv, me] = await Promise.all([
      supabase.from("alert_outbox")
        .select("id, source, severity, subject, raised_on, days_open")
        .is("sent_at", null)
        .is("resolved_at", null)
        .order("severity")
        .limit(2000),
      supabase.from("v_inventory_alerts").select("headline, severity, area, detail, what_to_do, drill, days_open, times_seen, pounds"),
      uid
        ? supabase.from("app_users").select("role").eq("user_id", uid).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const errs = [out.error && out.error.message, inv.error && inv.error.message, me.error && me.error.message].filter(Boolean);
    setErr(errs.length ? errs.join(" · ") : null);
    const rows = Array.isArray(out.data) ? out.data : [];
    const map = new Map();
    rows.forEach((r) => {
      const k = `${r.source || "no source"}|${r.severity || "no severity"}`;
      const g = map.get(k) || { source: r.source || "no source", severity: r.severity || "no severity", n: 0, subjects: [], first: r.raised_on, last: r.raised_on };
      g.n += 1;
      if (g.subjects.length < 4 && r.subject && !g.subjects.includes(r.subject)) g.subjects.push(r.subject);
      if (r.raised_on && (!g.first || r.raised_on < g.first)) g.first = r.raised_on;
      if (r.raised_on && (!g.last || r.raised_on > g.last)) g.last = r.raised_on;
      map.set(k, g);
    });
    setGroups(Array.from(map.values()).sort((a, b) => b.n - a.n));
    setLive(Array.isArray(inv.data) ? inv.data : []);
    setRole(me.data && me.data.role ? me.data.role : null);
  }, [session]);

  useEffect(() => { load(); }, [load]);

  const mayClose = role === "owner" || role === "executive" || role === "cfo";

  async function closeFamily() {
    if (!pick) return;
    const why = (note || "").trim();
    if (why.length < 16) {
      setMsg("Write why this family of unsent clones is being closed. Sixteen characters minimum. The finding stays.");
      return;
    }
    setBusy(true); setMsg(null);
    const now = new Date().toISOString();
    const { error } = await supabase.from("alert_outbox")
      .update({
        resolved_at: now,
        resolved_note: why,
        email_suppressed_at: now,
        email_suppressed_why: why,
      })
      .eq("source", pick.source)
      .eq("severity", pick.severity)
      .is("sent_at", null)
      .is("resolved_at", null);
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setMsg(`Closed unsent clones for ${pick.source} · ${pick.severity}. Rows were not deleted. Findings were not certified.`);
    setPick(null); setNote("");
    await load();
  }

  const unsent = (groups || []).reduce((a, g) => a + g.n, 0);

  return (
    <div className="ccpage">
      <div className="pagehead">
        <div>
          <h1>Alerts</h1>
          <p className="dashsub">
            Unsent email clones close in families so nobody sits through a thousand rows.
            Closing a family stops the email. It does not fix Metrc, Apex, or the finding.
            CERTIFIED still 0. Cycle 56.
          </p>
        </div>
      </div>

      {err ? <div className="empty" role="alert">{err}</div> : null}
      {msg ? <div className="vrmsg">{msg}</div> : null}

      <h2 style={{ fontSize: 16, marginTop: 8 }}>Unsent email clones — {groups == null ? "…" : n(unsent)}</h2>
      <p className="dashsub">
        These never left the outbox. Grouped by source and severity. Owner, executive, or CFO writes a reason, then the family is resolved and suppressed. No DELETE. No trigger off.
      </p>
      {groups == null ? <p className="cc-fine">Reading the outbox…</p> : null}
      {groups && groups.length === 0 ? (
        <p className="cc-fine">No unsent unresolved clones. The outbox is not empty of history — it is empty of things still waiting to send.</p>
      ) : null}
      {groups && groups.length > 0 ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Severity</th>
                <th>Unsent</th>
                <th>Raised</th>
                <th>Sample</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={`${g.source}|${g.severity}`}>
                  <td>{g.source}</td>
                  <td>{g.severity}</td>
                  <td>{n(g.n)}</td>
                  <td>{`${String(g.first || "").slice(0, 10)} → ${String(g.last || "").slice(0, 10)}`}</td>
                  <td>{g.subjects[0] || "no subject"}</td>
                  <td>
                    <button
                      type="button"
                      className="cc-btn"
                      disabled={!mayClose}
                      onClick={() => { setPick(g); setMsg(null); }}
                    >
                      Close family
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!mayClose ? (
        <p className="dashsub">Closing a family needs owner, executive, or CFO. Your role is {role || "not set"}.</p>
      ) : null}

      {pick ? (
        <div className="vrform" style={{ marginTop: 12 }}>
          <b>Close unsent clones: {pick.source} · {pick.severity} · {n(pick.n)} rows</b>
          <p className="dashsub">
            This does not certify phantom weight, failed tests, or COA disagreement. It only stops cloning email that never sent.
          </p>
          <label>
            Why this family is being closed
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              aria-label="Why this family of unsent clones is being closed"
              placeholder="Example: reminder clones of a known open finding. Finding stays on the live list. Email will not send."
              style={{ width: "100%", minHeight: 72 }}
            />
          </label>
          <div className="vractions">
            <button type="button" className="vrbtn primary" disabled={busy} onClick={closeFamily}>
              {busy ? "Closing…" : `Close ${n(pick.n)} unsent clones`}
            </button>
            <button type="button" className="vrbtn" onClick={() => { setPick(null); setNote(""); }}>Cancel</button>
          </div>
        </div>
      ) : null}

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Live findings — {live == null ? "…" : n(live.length)}</h2>
      <p className="dashsub">
        These are not email clones. They stay until the underlying record changes. No bulk close. Click through.
      </p>
      {live && live.length === 0 ? <p className="cc-fine">No open inventory findings.</p> : null}
      {live && live.length > 0 ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Area</th>
                <th>Headline</th>
                <th>Days</th>
                <th>Seen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {live.map((a, i) => (
                <tr key={`${a.headline || "row"}-${i}`}>
                  <td>{a.severity || "not recorded"}</td>
                  <td>{a.area || "not recorded"}</td>
                  <td>{a.headline || "not recorded"}</td>
                  <td>{a.days_open == null ? "not recorded" : n(a.days_open)}</td>
                  <td>{a.times_seen == null ? "not recorded" : n(a.times_seen)}</td>
                  <td>
                    {a.drill ? (
                      <button type="button" className="cc-btn" onClick={() => go && go(a.drill)}>Open</button>
                    ) : (
                      "no drill on this row"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
