/* PER-ITEM SYNC — owner, 9 Aug 2026: "EVERYTHING INDIVIDUALLY WE ONLY HAVE SYNC ALL
   BUTTON", "LIST ALL SPREADSHEETS WITH A BUTTON", and then the one that matters most:
   "AUTOMATICALLY MAKE IT SO ALL ITEMS WE SYNC, API OR INTEGRATE WILL ALWAYS BE ADDED
   HERE AUTOMATICALLY".
 *
 * The Sync Center had one button per SOURCE, and a source is not an item: "Metrc" is
 * nine endpoints across two licences, the Finished-Goods workbook is ten tabs, and
 * Apex is forty-four entities. Refreshing one product sheet re-fetched the other nine;
 * on Apex it would have spent credits on forty-three things nobody asked for.
 *
 * NOTHING IS HARD-CODED HERE. The first version listed the endpoints and tabs in JSX,
 * which meant every new integration was a code change, a review and a deploy - so it
 * would not have happened, and this screen would have quietly stopped matching
 * reality. It now renders v_sync_item and nothing else. Registering a new integration
 * is an INSERT; Apex entities are UNIONed live from apex_entity so they cannot drift
 * from the connector. No deploy either way.
 *
 * A BUTTON IS ONLY RENDERED WHERE THE FUNCTION HONOURS ITS PARAMETER (supported).
 * A button that appears to sync one thing while running everything is a dead control,
 * and this repo has a gate against those. supported=false renders the row greyed with
 * its reason instead.
 *
 * Its own file because App.jsx is 9,700 lines and the owner has ruled against files
 * big enough that one break takes everything down. HR set the precedent.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, FUNCTIONS_URL } from "./lib/supabase.js";

export default function SyncItems({ session, licences = [] }) {
  const [items, setItems] = useState(null);
  const [running, setRunning] = useState(null);
  const [out, setOut] = useState({});
  const [open, setOpen] = useState({});

  const headers = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  }), [session]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("v_sync_item")
      .select("*").eq("enabled", true).order("sort").order("item_label");
    /* Say why it is empty. An empty list with no explanation reads as "nothing to
       sync", which is the same shape as every silent failure found here. */
    if (error) { setItems([]); setOut((o) => ({ ...o, _load: { ok: false, text: error.message } })); return; }
    setItems(data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  /* Grouped by source, so the screen has structure rather than one long list. */
  const groups = useMemo(() => {
    const m = new Map();
    for (const it of items ?? []) {
      if (!m.has(it.source_key)) m.set(it.source_key, { label: it.source_label, items: [] });
      m.get(it.source_key).items.push(it);
    }
    return [...m.entries()];
  }, [items]);

  async function runOne(key, it, licence) {
    setRunning(key);
    setOut((o) => ({ ...o, [key]: { pending: true } }));
    const qp = new URLSearchParams();
    if (it.query_param && it.query_param !== "none") qp.set(it.query_param, it.item_key);
    for (const [k, v] of Object.entries(it.extra_params ?? {})) qp.set(k, String(v));
    if (licence) qp.set("license", licence);
    const qs = qp.toString() ? `?${qp}` : "";
    try {
      const r = await fetch(`${FUNCTIONS_URL}/${it.fn}${qs}`, { method: "POST", headers: headers() });
      const j = await r.json();
      /* Report the per-item detail, not just ok. A run that returns ok having skipped
         the thing you asked for must not read as success. */
      const detail = j.results
        ? Object.entries(j.results).filter(([k]) => !k.startsWith("_"))
            .map(([k, v]) => `${k}: ${v}`).join(" · ").slice(0, 400)
        : (j.error ?? "");
      setOut((o) => ({ ...o, [key]: {
        ok: !!j.ok,
        text: detail || (j.ok ? "done" : "failed"),
        extra: j.results?._credits ?? j.results?._skipped ?? null,
      } }));
    } catch (e) {
      setOut((o) => ({ ...o, [key]: { ok: false, text: String(e) } }));
    }
    setRunning(null);
    load();
  }

  if (items === null) return <div className="panel" style={{ maxWidth: "none" }}>Loading syncable items…</div>;

  return (
    <div className="panel" style={{ maxWidth: "none" }}>
      <div className="ptitle">Sync individual items</div>
      <div className="sub" style={{ marginBottom: 12 }}>
        Every button runs <b>one item only</b>. New integrations appear here on their own —
        this list is read from the database, not written into the page. Apex bills by API
        credit, so pulling one entity instead of forty-four is the difference between a few
        credits and a bill.
      </div>
      {out._load && <div className="pill err">Could not load the item list: {out._load.text}</div>}

      {groups.map(([key, g]) => {
        const isOpen = open[key] ?? (key === "apex" ? false : true);
        const head = g.items[0] ?? {};
        return (
          <div key={key} style={{ marginTop: 20, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            {/* CATEGORY HEADER. Owner: "PUT IN CATEGORY ALL METRC TOGETHER ALL APEX
                TOGETHER". Names the SYSTEM and the specific SOURCE, because on a
                screen mixing three systems a spreadsheet tab and a state-regulator
                endpoint otherwise look identical. */}
            <div style={{ cursor: "pointer" }} onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}>
              <div className="ptitle" style={{ fontSize: 14, marginBottom: 2 }}>
                {isOpen ? "▾" : "▸"} {head.system_label ?? g.label}
                <span className="pill" style={{ marginLeft: 8 }}>
                  {g.items.length} item{g.items.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="sub" style={{ margin: "0 0 8px 16px" }}>{head.source_name ?? g.label}</div>
            </div>
            {isOpen && g.items.map((it) => {
              /* Metrc scopes per licence as well as per endpoint, so one row becomes
                 one button per licence when licences are known. */
              const perLicence = it.source_key === "metrc" && licences.length ? licences : [null];
              return perLicence.map((lic) => {
                const k = `${it.source_key}:${it.item_key}:${lic ?? "all"}`;
                const r = out[k];
                return (
                  <div className="sprow" key={k} style={{ paddingLeft: 16 }}>
                    <div className="spmain">
                      {/* WHAT — named, with the system it comes from, never a bare
                          API slug like "shipping-orders". */}
                      <div className="spname">
                        <span style={{ opacity: 0.6, fontWeight: 400 }}>{it.system_label} · </span>
                        {it.item_label}
                        {lic && <span className="pill" style={{ marginLeft: 6 }}>{lic}</span>}
                        {it.due === true && <span className="pill" style={{ marginLeft: 6 }}>due now</span>}
                        {it.rows_stored != null && (
                          <span className="pill" style={{ marginLeft: 6 }}>{it.rows_stored} held</span>
                        )}
                      </div>
                      {/* WHAT IT ACTUALLY CONTAINS, then WHERE IT LANDS. A person
                          who wants to check the result needs the table name. */}
                      <div className="spdesc">
                        {r?.pending ? "Running…"
                          : r ? <span style={{ color: r.ok ? "var(--ok)" : "var(--red)" }}>{r.text}{r.extra ? ` · ${r.extra}` : ""}</span>
                          : <>
                              {it.pulls}
                              {it.target && <> <span style={{ opacity: 0.6 }}>→ lands in <code>{it.target}</code></span></>}
                              {it.due === false && it.due_text && <span style={{ opacity: 0.6 }}> · {it.due_text}</span>}
                              {it.last_status && it.last_status !== "ok" && (
                                <span style={{ color: "var(--red)" }}> · last run: {it.last_status}</span>
                              )}
                            </>}
                      </div>
                    </div>
                    {it.supported ? (
                      <button className="btn small" disabled={!!running}
                        title={it.due === false
                          ? "Runs only this item — forced, so it spends credits even though it is not due yet."
                          : "Runs only this item."}
                        onClick={() => runOne(k, it, lic)}>
                        {running === k ? "…" : "Sync"}
                      </button>
                    ) : (
                      <span className="pill" title={it.note ?? ""}>not scopable yet</span>
                    )}
                  </div>
                );
              });
            })}
            {/* WHOLE-CATEGORY BUTTON. Owner: "A BUTTON FULL APEX, FULL METRC, ALL
                SPREADSHEETS AT THE BOTTOM OF EACH". Calls the function with NO scope
                parameter, which every one of these already treats as "everything".
                Apex still honours its per-entity refresh windows on a full run, so
                this does not become a way to spend credits by accident. */}
            {isOpen && (
              <div className="sprow" style={{ paddingLeft: 16, borderTop: "1px dashed var(--line)" }}>
                <div className="spmain">
                  <div className="spname">Everything above</div>
                  <div className="spdesc">
                    {out[`all:${key}`]?.pending ? "Running…"
                      : out[`all:${key}`]
                        ? <span style={{ color: out[`all:${key}`].ok ? "var(--ok)" : "var(--red)" }}>
                            {out[`all:${key}`].text}{out[`all:${key}`].extra ? ` · ${out[`all:${key}`].extra}` : ""}
                          </span>
                        : `Runs all ${g.items.length} ${head.system_label} item(s) in one pass.`
                          + (key === "apex" ? " Entities still inside their refresh window are skipped and cost nothing." : "")}
                  </div>
                </div>
                <button className="btn small" disabled={!!running}
                  onClick={() => runOne(`all:${key}`, { fn: head.fn, query_param: "none", item_key: "", extra_params: {} }, null)}>
                  {running === `all:${key}` ? "…" : `Full ${head.system_label}`}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
