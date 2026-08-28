/* ---------------------------------------------------------------------------
   DOCUMENT READER — read, progress, sign.

   hr_documents, hr_document_sections, hr_document_progress and
   hr_document_acknowledgements have existed since the documents migration.
   Nothing could read a document or sign one, so the whole evidence chain was
   a set of empty tables. Same failure as the missing PIN screen: a capability
   with no interface is a capability nobody has.

   What this page refuses to do, and why:

     - It will not let you sign a section you have not opened. Progress is
       recorded per section with the seconds spent, because "I signed the
       handbook" and "I read the handbook" are different claims and only one
       of them survives a tribunal.

     - It signs the VERSION, not the title. Signing last year's manual is not
       signing this year's, and a system that treats them alike produces a
       signature that is worthless on the day it is needed.

     - The signature box states plainly what signing means and what it does
       not. Receipt is not agreement. A person who signs believing they have
       waived something they have not is a problem for everyone.
--------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { DkRangeSearch } from "./dashkit.jsx";
import { rangeSearch } from "./lib/range-search.js";

const when = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function DocReader({ go }) {
  const [me, setMe] = useState(null);
  const [docs, setDocs] = useState([]);
  const [doc, setDoc] = useState(null);
  const [sections, setSections] = useState([]);
  const [read, setRead] = useState(new Set());
  const [ack, setAck] = useState(null);
  const [sig, setSig] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const openedAt = useRef({});

  const load = useCallback(async () => {
    const { data: id } = await supabase.rpc("f_my_employee_id");
    setMe(id ?? null);
    const { data: d } = await supabase.from("v_document_compliance").select("*");
    setDocs(d ?? []);
    if (id) {
      const { data: e } = await supabase.from("employees").select("full_name").eq("id", id).maybeSingle();
      const [l = "", r = ""] = String(e?.full_name || "").split(",");
      setName(r.trim() ? `${r.trim()} ${l.trim()}` : l.trim());
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function openDoc(row) {
    setBusy(true); setMsg(null); setSig("");
    const [full, secs, prog, acked] = await Promise.all([
      supabase.from("hr_documents").select("*").eq("id", row.document_id).maybeSingle(),
      supabase.from("hr_document_sections").select("*").eq("document_id", row.document_id).order("ordinal"),
      supabase.from("hr_document_progress").select("section_id").eq("document_id", row.document_id).eq("employee_id", me),
      supabase.from("hr_document_acknowledgements").select("*")
        .eq("document_id", row.document_id).eq("employee_id", me).maybeSingle(),
    ]);
    setDoc({ ...full.data, _row: row });
    setSections(secs.data ?? []);
    setRead(new Set((prog.data ?? []).map(p => p.section_id)));
    setAck(acked.data ?? null);
    setBusy(false);
  }

  /* Progress is recorded when a section is OPENED and again when it closes,
     carrying how long it was open. A section marked read in under a couple of
     seconds is recorded honestly as exactly that. */
  async function toggleSection(s) {
    const isOpen = openedAt.current[s.id];
    if (isOpen) {
      const secs = Math.round((Date.now() - isOpen) / 1000);
      delete openedAt.current[s.id];
      await supabase.from("hr_document_progress").upsert({
        document_id: doc.id, section_id: s.id, employee_id: me,
        read_at: new Date().toISOString(), seconds_spent: secs,
      }, { onConflict: "section_id,employee_id" });
      setRead(r => new Set(r).add(s.id));
    } else {
      openedAt.current[s.id] = Date.now();
      setRead(r => new Set(r));
    }
  }

  const allRead = sections.length > 0 && sections.every(s => read.has(s.id));
  const canSign = doc && (sections.length === 0 || allRead) && sig.trim().length >= 3;

  async function sign() {
    if (!canSign) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("hr_document_acknowledgements").insert({
      document_id: doc.id,
      document_version: doc.version,        /* bound to the version, never the title */
      employee_id: me,
      read_at: new Date().toISOString(),
      signed_at: new Date().toISOString(),
      signature_name: sig.trim(),
      user_agent: navigator.userAgent.slice(0, 300),
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setMsg(`Signed. Your signature is bound to version ${doc.version} — if this document is revised you will be asked again, which is the point.`);
    openDoc(doc._row); load();
  }

  const mine = useMemo(() => docs.filter(d => d.employee_id === me), [docs, me]);

  /* THE PERIOD BUS: THIS PAGE DECLARES, AND ON A COMPLIANCE LIST THE ALTERNATIVE
     IS DANGEROUS.
     docs/TODO_EVERY_PAGE.md gives two roads — take the active frame, or declare
     as-of with a visible chip. v_document_compliance does carry real dates
     (due_on, signed_at, read_at), so a range COULD be applied here, and that is
     exactly why the choice has to be argued rather than assumed.

     This list answers one question: what do I still owe. A document that fell due
     last month and is still unsigned is the most important row on the page, and
     any range ending today or starting this month hides it. The page would then
     show an employee a clean list while they are overdue — a compliance screen
     lying by omission, which is worse than no screen. So the dates stay as facts
     on every card, driving the overdue chip, and none of them is a filter.

     Search is the half worth having: it finds a policy by name whatever its due
     date or state. */
  const [q, setQ] = useState("");
  const found = useMemo(
    () => rangeSearch(mine, { q, fields: ["title", "kind", "version", "state", "department"] }),
    [mine, q],
  );

  if (!me) return (
    <div className="drempty"><b>No employee record linked to this login</b>
      <span>Ask HR to link your account before signing anything.</span></div>);

  return (
    <div className="dr">
      <div className="drhead">
        <div>
          <h1>Documents to read</h1>
          <div className="drsub">
            Your signature binds to the <b>version</b> you read. A revised document asks again.
          </div>
        </div>
        {doc && <button className="btn ghost small" onClick={() => { setDoc(null); setMsg(null); }}>Back to the list</button>}
      </div>

      {msg && <div className="drmsg">{msg}</div>}

      {/* Only over the list. Inside a document the reader is reading one thing,
          and a search box there would be chrome with nothing to search. */}
      {!doc && mine.length > 0 && (
        <DkRangeSearch
          id="dr-q" label="Find a document by title, kind or state"
          placeholder="handbook, safety, overdue"
          q={q} onQ={setQ} result={found} noun="documents"
          source="v_document_compliance"
          asOf="what you owe now — no date range, so nothing overdue is hidden" />
      )}

      {!doc ? (
        mine.length === 0 ? (
          <div className="drempty">
            <b>Nothing assigned to you</b>
            <span>When HR assigns the manual or a policy it appears here with a due date.</span>
          </div>
        ) : found.rows.length === 0 ? (
          /* Assigned-nothing and matched-nothing are different facts. The card
             above must never be shown to someone who simply mistyped. */
          <div className="drempty">
            <b>No document matches “{q.trim()}”</b>
            <span>
              All {mine.length} document{mine.length === 1 ? "" : "s"} assigned to you {mine.length === 1 ? "was" : "were"} searched,
              including anything overdue — there is no date range on this page that could have hidden one.
            </span>
          </div>
        ) : (
          <div className="drlist">
            {found.rows.map(d => (
              <button className="drcard" key={d.document_id} onClick={() => openDoc(d)} disabled={busy}>
                <div className="drct">
                  <b>{d.title}</b>
                  <i>version {d.version}{d.due_on ? ` · due ${when(d.due_on)}` : ""}</i>
                </div>
                {d.sections > 0 && (
                  <span className="drprog">
                    <span style={{ width: `${(d.sections_read / d.sections) * 100}%` }} />
                  </span>)}
                <span className={`schip ${d.state === "signed" ? "ok" : d.state === "overdue" ? "bad" : "warn"}`}>
                  {d.state}</span>
              </button>))}
          </div>)
      ) : (
        <>
          <div className="drdoc">
            <div className="drtop">
              <h2>{doc.title}</h2>
              <span className="schip mute">version {doc.version}</span>
              {doc.kind && <span className="schip info">{doc.kind}</span>}
            </div>
            {doc.effective_from && <div className="drfrom">Effective {when(doc.effective_from)}</div>}

            {sections.length === 0 ? (
              <div className="drbody">{doc.body || "This document has no text on file — ask HR."}</div>
            ) : (
              <>
                <div className="drcount">
                  {read.size} of {sections.length} sections read
                  {!allRead && <b> — read every section before signing</b>}
                </div>
                {sections.map(s => {
                  const isOpen = !!openedAt.current[s.id];
                  const done = read.has(s.id);
                  return (
                    <div className={`drsec ${done ? "done" : ""}`} key={s.id}>
                      <button className="drsechead" onClick={() => toggleSection(s)}>
                        <span className="drnum">{s.ordinal}</span>
                        <span className="drtitle">{s.heading}</span>
                        <span className={`schip ${done ? "ok" : "mute"}`}>{done ? "read" : isOpen ? "open" : "unread"}</span>
                      </button>
                      {(isOpen || done) && <div className="drsecbody">{s.body}</div>}
                    </div>);
                })}
              </>)}
          </div>

          {ack?.signed_at ? (
            <div className="drsigned">
              <b>You signed this on {when(ack.signed_at)}</b>
              <span className="drsigname">{ack.signature_name}</span>
              <span>Bound to version {ack.document_version}. If this document is revised you will be asked again.</span>
            </div>
          ) : (
            <div className="drsign">
              <div className="drwhat">
                <b>What signing means</b>
                Signing records that you have <b>read and received</b> this document at
                version {doc.version}. It is not agreement, and it waives nothing. If you
                disagree with any part, sign and then add a written response — HR files
                both together.
              </div>
              <label className="drlab">Type your full name to sign</label>
              <input value={sig} onChange={(e) => setSig(e.target.value)}
                placeholder={name || "Your full name"} />
              <div className="dracts">
                <button className="btn" disabled={!canSign || busy} onClick={sign}
                  title={!allRead && sections.length > 0 ? "Read every section first" : "Sign"}>
                  Sign as read and received
                </button>
                <button className="btn ghost" onClick={() => go?.("hr_documents")}>Add a written response</button>
              </div>
              {!allRead && sections.length > 0 && (
                <div className="drblock">
                  You cannot sign yet. {sections.length - read.size} section
                  {sections.length - read.size === 1 ? "" : "s"} still unread — and the
                  system records which, and for how long each was open.
                </div>)}
            </div>)}
        </>)}
    </div>
  );
}
