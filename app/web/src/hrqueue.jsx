/* ---------------------------------------------------------------------------
   HR REVIEW QUEUE — where "ALL HR REQUIRES HUMAN" is actually enforced.

   Owner's ruling, 8 Aug 2026: no standing approvals, no pre-authorised
   actions, reminders included. An agent drafts; a person decides.

   The risk that ruling carries, and the reason this page looks the way it
   does: a queue nobody can keep up with gets bulk-approved unread, which is
   worse than no queue because it manufactures a record of review that never
   happened. The defence is not autonomy — it is that routine and consequential
   must never look alike.

   So this page refuses to make them look alike:
     - order comes from v_hr_waiting_on_a_person: urgent first, then "unsure"
     - how_to_treat_it is printed on the card, not inferred by the reader
     - a write-up cannot be sent until its draft has been opened
     - no bulk approve. There is no button that sends more than one thing.
     - ignoring requires a reason and a note, and files both to the record

   policy_basis is shown on every card. An item with no basis is an opinion,
   and an opinion about somebody's employment is not actionable.
--------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
/* The one date control and the one catalogue — imported, never rebuilt. */
import { DateRangeSelect } from "./App.jsx";
import { useDefaultRange } from "./dashkit.jsx";

const VIEW_KEY = "hr_review_queue";

const AGE = (t) => {
  const m = Math.floor((Date.now() - new Date(t)) / 60000);
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h`;
  return `${Math.floor(m / 1440)} d`;
};

const CONFIDENCE = {
  certain: { tone: "ok",   note: "The agent is confident." },
  likely:  { tone: "warn", note: "The agent thinks so — check the basis." },
  unsure:  { tone: "bad",  note: "The agent flagged itself unsure. Read every line." },
};

const IGNORE_REASONS = [
  "Evidence is unreliable or disputed",
  "Already handled in person",
  "Mitigating circumstances known to me",
  "Policy does not apply in this case",
  "Duplicate of an existing action",
  "Agent drew the wrong conclusion",
  "Deferring to the department lead",
  "Other",
];

export default function HrQueue({ go, session }) {
  /* Governed by nav_registry.default_range for hr_review_queue (this_month_td).
     The frame is created_at — when the item was RAISED. A queue item decided
     late still belongs to the day somebody raised it, and filing it by the
     decision date would move work out of the week it landed in. */
  const [range, setRange] = useState({ from: "", to: "" });
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);        /* id whose draft is expanded */
  const [seen, setSeen] = useState(new Set());   /* drafts actually opened */
  const [body, setBody] = useState({});          /* id → edited text */
  const [ignoring, setIgnoring] = useState(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [canDecide, setCanDecide] = useState(false);

  const load = useCallback(async () => {
    const [q, d] = await Promise.all([
      supabase.from("v_hr_waiting_on_a_person").select("*"),
      supabase.rpc("f_can_decide_hr"),
    ]);
    setRows(q.data ?? []);
    setCanDecide(!!d.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function openDraft(id) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    setSeen((s) => new Set(s).add(id));
    if (body[id] === undefined) {
      const { data } = await supabase.from("hr_review_queue")
        .select("draft_body, edited_body, rationale, evidence").eq("id", id).maybeSingle();
      setBody((b) => ({ ...b, [id]: data?.edited_body ?? data?.draft_body ?? "",
                        [`${id}:why`]: data?.rationale ?? "" }));
    }
  }

  async function decide(row, status) {
    setBusy(true); setMsg(null);
    const patch = { status, decided_at: new Date().toISOString(), decided_by: (await supabase.auth.getUser()).data?.user?.id ?? null };
    if (status === "sent") { patch.filed_at = new Date().toISOString(); patch.edited_body = body[row.id] ?? null; }
    if (status === "deferred") patch.defer_until = new Date(Date.now() + 864e5).toISOString();
    const { error } = await supabase.from("hr_review_queue").update(patch).eq("id", row.id);
    setBusy(false);
    setMsg(error ? error.message
      : status === "sent" ? "Sent, and filed to the employee record."
      : status === "deferred" ? "Deferred 24 hours. The delay is recorded."
      : "Updated.");
    if (!error) load();
  }

  async function confirmIgnore(row) {
    if (!reason || note.trim().length < 8) { setErr(true); return; }
    setBusy(true);
    const { error } = await supabase.from("hr_review_queue").update({
      status: "ignored",
      decision_reason: reason,
      decision_note: note.trim(),
      decided_at: new Date().toISOString(),
      filed_at: new Date().toISOString(),
      decided_by: (await supabase.auth.getUser()).data?.user?.id ?? null,
    }).eq("id", row.id);
    setBusy(false);
    setIgnoring(null); setReason(""); setNote(""); setErr(false);
    setMsg(error ? error.message
      : "Ignored, and filed. Nothing was sent — the draft, your reason and your name are on the record.");
    if (!error) load();
  }

  const counts = useMemo(() => {
    const r = rows ?? [];
    return {
      total: r.length,
      unsure: r.filter(x => x.agent_confidence === "unsure").length,
      noBasis: r.filter(x => !x.policy_basis).length,
      urgent: r.filter(x => x.severity === "high").length,
    };
  }, [rows]);

  /* SEARCH SETS THE RANGE ASIDE — the Orders rule. Somebody typing a name is
     asking about that person's item, not about this month, and a queue that
     answers "nothing waiting" because of a frame nobody chose is how an item
     sits unactioned. An item with no created_at is never dropped by the frame. */
  const searching = q.trim().length > 0;
  const needle = q.trim().toLowerCase();
  const inFrame = (r) => {
    if (!range.from && !range.to) return true;
    if (!r.created_at) return true;
    const d0 = String(r.created_at).slice(0, 10);
    if (range.from && d0 < range.from) return false;
    if (range.to && d0 > range.to) return false;
    return true;
  };
  const shownRows = (rows ?? []).filter((r) => (searching
    ? `${r.full_name ?? ""} ${r.employee_code ?? ""} ${r.headline ?? ""} ${r.kind ?? ""}`
        .toLowerCase().includes(needle)
    : inFrame(r)));

  if (rows === null) return <div className="hqload">Loading the queue…</div>;

  return (
    <div className="hq">
      <div className="hqhead">
        <div>
          <h1>Review queue</h1>
          <div className="hqtools">
            <input className="cc-input" value={q} onChange={(e) => setQ(e.target.value)}
              aria-label="Find a person or reason" placeholder="find a person or reason — any period" />
            {q.trim() && <button className="btn ghost small" onClick={() => setQ("")}>clear</button>}
            <DateRangeSelect label="Raised between" from={range.from} to={range.to}
              onFrom={(v) => setRange((prev) => ({ ...prev, from: v }))}
              onTo={(v) => setRange((prev) => ({ ...prev, to: v }))}
              presetKey={dateDefault.presetKey} session={session}
              viewKey={VIEW_KEY} allowSave />
            {dateDefault.error && <span className="note bad" role="alert">{dateDefault.error}</span>}
            {q.trim() && (range.from || range.to) && (
              <span className="note" title="A search asks about one person, so the date range is set aside for it. Clear the search to return to the range.">
                date range set aside while searching — every period is being searched
              </span>
            )}
          </div>
          <div className="hqsub">
            An agent drafted these. <b>Nothing reaches an employee until you send it.</b>
          </div>
        </div>
        <button className="btn ghost small" onClick={() => go?.("dept_dash_hr")}>HR dashboard</button>
      </div>

      <div className="hqstats">
        <div><b>{counts.total}</b><span>waiting on you</span></div>
        <div className={counts.urgent ? "hot" : ""}><b>{counts.urgent}</b><span>urgent</span></div>
        <div className={counts.unsure ? "warn" : ""}><b>{counts.unsure}</b><span>agent unsure</span></div>
        <div className={counts.noBasis ? "hot" : ""}><b>{counts.noBasis}</b><span>no policy basis</span></div>
      </div>

      <div className="hqnote">
        There is deliberately no bulk approve. Sending is one item at a time, because
        a queue approved in a single click manufactures a record of review that did
        not happen — and that record is worse than none.
      </div>

      {msg && <div className="hqmsg">{msg}</div>}

      {rows.length === 0 ? (
        <div className="hqempty">
          <b>Nothing waiting</b>
          <span>The agents have drafted nothing that needs a decision. This is the
            normal state — the queue fills when something changes.</span>
        </div>
      ) : shownRows.map((r) => {
        const conf = CONFIDENCE[r.agent_confidence] ?? CONFIDENCE.likely;
        const mustRead = /write.?up|warning|discipl|terminat/i.test(r.kind + " " + r.headline);
        const canSend = !mustRead || seen.has(r.id);
        return (
          <article key={r.id} className={`hqcard ${r.severity === "high" ? "hot" : ""} ${r.agent_confidence === "unsure" ? "unsure" : ""}`}>
            <div className="hqtop">
              <span className="hqagent">{r.agent}</span>
              <span className={`schip ${conf.tone}`}>{r.agent_confidence ?? "likely"}</span>
              {r.severity && <span className={`schip ${r.severity === "high" ? "bad" : "mute"}`}>{r.severity}</span>}
              <span className="hqage">{AGE(r.created_at)} old</span>
            </div>

            <h2>{r.headline}</h2>

            {/* The label the view computes, printed rather than inferred. */}
            {r.how_to_treat_it && <div className="hqtreat">{r.how_to_treat_it}</div>}

            <div className={`hqbasis ${r.policy_basis ? "" : "none"}`}>
              {r.policy_basis
                ? <><b>Policy basis</b> {r.policy_basis}</>
                : <><b>No policy basis</b> — this rests on nothing written down. An
                     opinion about somebody&rsquo;s employment is not actionable. Send it back.</>}
            </div>

            <div className="hqconf">{conf.note}</div>

            {r.has_a_draft && (
              <details className="hqdraft" open={open === r.id}>
                <summary onClick={(e) => { e.preventDefault(); openDraft(r.id); }}>
                  {open === r.id ? "Hide the draft" : mustRead && !seen.has(r.id)
                    ? "Read every line — this becomes part of an employment record"
                    : "Read the draft"}
                </summary>
                {open === r.id && (
                  <>
                    {body[`${r.id}:why`] && <div className="hqwhy"><b>Why the agent raised it</b>{body[`${r.id}:why`]}</div>}
                    <textarea value={body[r.id] ?? ""} rows={12}
                      aria-label="The letter as it will be filed. Edit it before you act."
                      onChange={(e) => setBody((b) => ({ ...b, [r.id]: e.target.value }))} />
                    <div className="hqedit">Edits are saved with the item. The original agent draft is kept beside it.</div>
                  </>)}
              </details>)}

            {ignoring === r.id ? (
              <div className="hqignore">
                <div className="hqwarn">
                  Nothing is sent — but the decision <b>is</b> filed to this person&rsquo;s
                  record with your name, the draft you declined, and your reason. That
                  is what makes enforcement provably consistent if it is ever questioned.
                </div>
                <select value={reason} aria-label="Reason for not acting on this item"
                  onChange={(e) => { setReason(e.target.value); setErr(false); }}>
                  <option value="">Choose a reason…</option>
                  {IGNORE_REASONS.map(x => <option key={x}>{x}</option>)}
                </select>
                <textarea rows={3} placeholder="Why you are not acting on this."
                  aria-label="Note explaining why you are not acting on this item"
                  value={note} onChange={(e) => { setNote(e.target.value); setErr(false); }} />
                {err && <div className="hqerr">Pick a reason and write a note — both are required.</div>}
                <div className="hqacts">
                  <button className="btn ghost small" onClick={() => { setIgnoring(null); setErr(false); }}>Cancel</button>
                  <button className="btn small hqwarnb" disabled={busy}
                    onClick={() => confirmIgnore(r)}>Ignore &amp; file the decision</button>
                </div>
              </div>
            ) : (
              <div className="hqacts">
                <button className="btn small" disabled={busy || !canDecide || !canSend}
                  title={!canSend ? "Open and read the draft first" : "Send to the employee"}
                  onClick={() => decide(r, "sent")}>Send</button>
                <button className="btn ghost small" disabled={busy || !canDecide}
                  onClick={() => decide(r, "deferred")}>Review later</button>
                <button className="btn ghost small hqwarnb" disabled={busy || !canDecide}
                  onClick={() => { setIgnoring(r.id); setReason(""); setNote(""); }}>Ignore</button>
                {!canDecide && <span className="hqro">You can read this queue but not decide on it.</span>}
              </div>
            )}
          </article>);
      })}
    </div>
  );
}
