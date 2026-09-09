"""Review panel operations — the FastAPI-side equivalent of the four sections
of manifest_bridge's inline review panel (🔍 Compare & edit · 💵 Payments &
Credit · 📝 Order details · 📧 Email invoice), each reshaped from a Streamlit
widget flow into request/response functions over the same engine calls.
"""

import base64
import re
from datetime import datetime

from . import bridge, deps, tasklog

slc = deps.slc
S = deps.session_state

ALWAYS_TO_EMAIL = "twistedgrowersaccting@gmail.com"


# ============================================================
# SERIALIZATION HELPERS
# ============================================================

def _money(v):
    """b-api money is CENTS; v1 is dollars. slc._order_money handles orders —
    this handles a bare payment record amount."""
    if isinstance(v, (int, float)):
        return round(float(v) / 100.0, 2)
    try:
        return float(str(v).replace(",", "").replace("$", ""))
    except Exception:
        return None


def comparison_rows():
    slc.maybe_autocompare()
    df = S.get("comparison_df")
    if df is None or not len(df):
        return []
    return df.to_dict(orient="records")


def grid_rows():
    """Comparison rows enriched exactly like render_comparison_section's grid:
    each row carries the invoice-line uids for its batch (♻️/❌ remove), and a
    single-line batch carries its live qty/unit + the batch's Apex on-hand
    (override-aware, 0 network calls thanks to the cached batches index)."""
    rows = comparison_rows()
    items = slc._ensure_line_uids()
    batch_to_uid = {}
    for it in items:
        bn = (it.get("batch_name") or "").strip()
        if bn:
            batch_to_uid.setdefault(slc.normalize_batch_name(bn), []).append(it["_uid"])
    line_by_uid = {it["_uid"]: it for it in items if it.get("_uid")}
    pkgs = S.get("manifest_packages") or []

    out = []
    for row in rows:
        bk = slc.normalize_batch_name(str(row.get("Batch") or "").strip())
        uids = batch_to_uid.get(bk, [])
        entry = dict(row)
        entry["uids"] = uids
        entry["line"] = None
        if len(uids) == 1 and uids[0] in line_by_uid:
            it = line_by_uid[uids[0]]
            oum = it.get("order_unit_measurement") or {}
            uname = ((oum.get("alias") or oum.get("name") or "qty")
                     if isinstance(oum, dict) else str(oum))
            try:
                curq = int(float(it.get("order_quantity") or 0))
            except (TypeError, ValueError):
                curq = 0
            avail, untracked = slc._batch_avail_units(it.get("product_id"),
                                                      it.get("batch_id"))
            entry["line"] = {"uid": uids[0], "qty": curq, "unit": uname,
                             "avail": avail, "untracked": untracked}
        if str(row.get("Status")) == "❌ NOT IN INVOICE":
            entry["man_item"] = next(
                (p.get("item_name", "") for p in pkgs
                 if slc.normalize_batch_name((p.get("batch_name") or "").strip()) == bk),
                "")
        out.append(entry)
    return out


def _items_payload():
    items = slc._ensure_line_uids()
    out = []
    for it in items:
        w, calc = slc.calculate_total_weight(it)
        out.append({
            "uid": it.get("_uid"),
            "id": it.get("id"),
            "product_id": it.get("product_id"),
            "batch_id": it.get("batch_id"),
            "product_name": it.get("product_name") or "",
            "batch_name": it.get("batch_name") or "",
            "qty": it.get("order_quantity"),
            "unit": ((it.get("order_unit_measurement") or {}).get("name")
                     or (it.get("order_unit_measurement") or {}).get("alias")
                     or ""),
            "weight_g": round(w, 1) if w else 0,
            "added": bool(it.get("_added")),
        })
    return out


def _payment_amount(p, order):
    """v1 payments: amount '100.00' (dollars) + amount_raw 10000 (cents);
    b-api payments: amount 10000 (cents int). Prefer the raw cents —
    same rule as slc.render_payments_editor."""
    if isinstance(p.get("amount_raw"), (int, float)):
        return round(float(p["amount_raw"]) / 100.0, 2)
    if isinstance(p.get("amount"), (int, float)):
        return round(float(p["amount"]) / 100.0, 2)
    s = str(p.get("amount") or "")
    val = slc._parse_money(s) or 0.0
    if "." not in s and slc._is_bapi_order(order):
        return round(val / 100.0, 2)
    return round(val, 2)


def _payments_payload(order):
    out = []
    for p in sorted((order.get("payments") or []),
                    key=lambda x: str(x.get("payment_date") or ""), reverse=True):
        out.append({
            "id": p.get("id"),
            "amount": _payment_amount(p, order),
            "type": str(p.get("type") or "").title(),
            "pay_type": p.get("pay_type") or "",
            "note": p.get("note") or "",
            "date": str(p.get("payment_date") or "")[:10],
        })
    return out


def _money_payload(order):
    """Same money derivations as slc.render_payments_editor."""
    buyer = order.get("buyer") or {}
    # buyer.credit_total is ALWAYS integer cents, regardless of order shape.
    bc = buyer.get("credit_total")
    buyer_credit = (round(float(bc) / 100.0, 2)
                    if isinstance(bc, (int, float)) else None)
    order_credit = buyer_credit
    if order_credit is None:
        order_credit = slc._order_money(order, "total_credits")
    return {
        "total": slc._order_money(order, "total"),
        "due": slc._order_due(order),
        "paid": slc._order_money(order, "total_payments"),
        "credits": slc._order_money(order, "total_credits"),
        "write_offs": slc._order_money(order, "total_write_offs"),
        "buyer_credit": buyer_credit,
        "apply_credit": order_credit,
        "buyer_id": buyer.get("id") or order.get("buyer_id"),
    }


def _stages_of(order):
    return [{"id": s.get("id"), "name": s.get("name"),
             "archived": bool(s.get("archived"))}
            for s in (((order.get("deal_flow") or {}).get("order_statuses")) or [])]


def loaded_digits():
    if S.get("invoice_items") or S.get("apex_order_raw"):
        return slc._digits(S.get("selected_invoice", ""))
    return None


def review_payload(orders=None, edges=None, manifests=None):
    """Everything the review panel shows, in one JSON-safe payload."""
    dg = loaded_digits()
    if not dg:
        return None
    order_raw = S.get("apex_order_raw") or {}
    inv_now = S.get("selected_invoice", "")
    man_now = S.get("selected_manifest_number", "")
    man_inv = S.get("selected_manifest_invoice", "")

    rows = grid_rows()
    _iss, _struct = bridge.split_statuses(
        [str(r.get("Status", "")) for r in rows])
    bad = len(_iss)
    wrong_manifest = bool(man_inv and slc._digits(man_inv) != slc._digits(inv_now))

    # 👯 siblings — other board orders riding this same manifest
    sibs = []
    if orders is not None and edges is not None and manifests is not None:
        e_cur = next((x for x in edges if x["invoice"] == dg), None)
        m_cur = next((x for x in manifests
                      if str(x.get("Id")) == (e_cur or {}).get("manifest_id")), None)
        if m_cur is not None:
            sibs = bridge.group_siblings({"digits": dg}, m_cur, orders, edges)

    verdict = S.get("apex_push_verdict")
    removed = []
    for j, rm in enumerate(S.get("removed_items") or []):
        removed.append({
            "index": j,
            "product_name": rm.get("product_name") or "",
            "batch_name": rm.get("batch_name") or "",
            "weight": rm.get("weight") or 0,
            "disposition": rm.get("disposition"),
            "pushed": bool(rm.get("pushed")),
            "ts": rm.get("ts"),
        })

    term = order_raw.get("term")
    graph_ok = all(slc._graph_creds()[:3]) and bool(slc._graph_creds()[3])
    return {
        "digits": dg,
        "invoice": inv_now,
        "buyer": S.get("buyer_name", ""),
        "order_id": order_raw.get("id") or S.get("apex_order_id"),
        "uuid": order_raw.get("uuid"),
        "manifest_number": man_now,
        "manifest_invoice": man_inv,
        "recipient": S.get("selected_recipient", ""),
        "recipient_license": S.get("selected_recipient_license", ""),
        "wrong_manifest": wrong_manifest,
        "cached_at": S.get("_apex_cached_at"),
        "items": _items_payload(),
        "removed": removed,
        "comparison": rows,
        "issues": bad,
        "structure": len(_struct),
        "total_invoice_weight": round(S.get("total_invoice_weight") or 0, 1),
        "total_manifest_weight": round(S.get("total_manifest_weight") or 0, 1),
        "money": _money_payload(order_raw),
        "payments": _payments_payload(order_raw),
        "meta": {
            "delivery_date": str(order_raw.get("delivery_date") or "")[:10],
            "due_date": str(order_raw.get("due_date") or "")[:10],
            "net_terms": ((term.get("name") if isinstance(term, dict) else term) or ""),
            "net_terms_id": order_raw.get("net_terms_id"),
            "stage": ((order_raw.get("order_status") or {}).get("name")
                      or S.get("order_status_name") or ""),
            "stage_id": (order_raw.get("order_status_id")
                         or (order_raw.get("order_status") or {}).get("id")),
            "stages": _stages_of(order_raw),
            "pricing_tier": (order_raw.get("pricing_tier") or {}).get("name") or "",
            "pricing_tier_id": (order_raw.get("pricing_tier") or {}).get("id"),
        },
        "siblings": [{"digits": s["digits"], "invoice": s["invoice"],
                      "company": s.get("company", "")} for s in sibs],
        "push_verdict": ({"kind": verdict[0], "message": verdict[1]}
                         if verdict else None),
        "graph_configured": graph_ok,
        "session_loaded": slc._session_ready(S.get("bapi_session") or {}),
    }


def close_review():
    for k in ("invoice_items", "invoice_items_original",
              "apex_order_raw", "apex_order_id", "manifest_packages",
              "raw_metrc_packages", "comparison_df", "_cmp_sig",
              "_pay_synced_for", "_apex_cached_at", "_split_src", "_split_tgt",
              "selected_invoice", "selected_manifest_number",
              "selected_manifest_invoice", "apex_push_verdict",
              "inv_pdf_blob", "inv_bundle_blob", "coa_zip_blob"):
        S.pop(k, None)


def fold_open_comparison_into_checks(digits, manifest_id):
    """Opening a pair already produced the full comparison — bank the verdict
    so the board line recolours without a second METRC pull."""
    rows = comparison_rows()
    if not rows:
        return
    sts = [str(r.get("Status", "")) for r in rows]
    iss, structure = bridge.split_statuses(sts)
    checks = bridge.load_verify_cache()
    prev_state = (checks.get(bridge.verify_key(digits, manifest_id)) or {}).get("state")
    res = {
        "state": "mismatch" if iss else "match",
        "batches": len(sts), "issues": len(iss), "structure": len(structure),
        "detail": bridge._verdict_detail(sts, iss, structure),
        "at": datetime.now().isoformat(timespec="seconds"),
    }
    checks[bridge.verify_key(digits, manifest_id)] = res
    bridge.save_verify_cache(checks)
    bridge.score_fresh_compare(prev_state, res,
                               S.get("selected_invoice") or f"Twiste-{digits}")


# ============================================================
# 🔍 COMPARE & EDIT operations
# ============================================================

def set_line_quantity(uid, typed, handle="inventory"):
    """The API version of slc._set_line_quantity: negative = relative
    adjustment, positive = new absolute qty, 0 result = full removal."""
    items = S.get("invoice_items", [])
    it = next((x for x in items if x.get("_uid") == uid), None)
    if it is None:
        return False, "❌ Quantity edit failed — that line is no longer on the invoice."
    try:
        typed = int(typed)
    except (TypeError, ValueError):
        return False, f"❌ Quantity edit failed — '{typed}' isn't a whole number."
    try:
        cur = int(float(it.get("order_quantity") or 0))
    except (TypeError, ValueError):
        cur = 0

    nq = cur + typed if typed < 0 else typed
    if nq < 0:
        return False, (f"❌ {typed:+d} would take the line below zero "
                       f"(current qty is {cur}).")
    if nq == cur:
        return True, f"Quantity unchanged — the line is already at {cur}."
    if nq == 0:
        slc._finalize_remove(uid, "return" if handle == "inventory" else "delete")
        verdict = S.get("apex_push_verdict") or ("info", "removed")
        if verdict[0] != "error":
            tasklog.log_task("item_returned" if handle == "inventory"
                             else "item_deleted",
                             invoice=S.get("selected_invoice"),
                             detail=it.get("batch_name") or "")
        return verdict[0] != "error", verdict[1]

    log = slc.push_line_quantity(uid, nq, handle=handle, live=True)
    S["apex_push_log"] = (S.get("apex_push_log") or []) + log
    if nq > cur:
        where = "added from inventory"
    else:
        where = ("returned to inventory" if handle == "inventory" else "written off")
    slc._apply_push_verdict(log, verb=f"Qty {cur} → {nq} ({abs(nq - cur)} {where})")

    S["total_invoice_weight"] = sum(
        (slc.calculate_total_weight(x)[0] or 0) for x in items)
    S.pop("comparison_df", None)
    S.pop("_cmp_sig", None)
    slc._patch_batches_in_view([(it.get("product_id"), it.get("batch_id"))])
    verdict = S.get("apex_push_verdict") or ("info", "done")
    if verdict[0] != "error":
        tasklog.log_task("inventory_adjustment",
                         invoice=S.get("selected_invoice"),
                         detail=f"{it.get('batch_name') or ''} {cur}→{nq}")
    return verdict[0] != "error", verdict[1]


def remove_lines(uids, disposition):
    items = {it.get("_uid"): it for it in (S.get("invoice_items") or [])}
    names = [(items.get(u) or {}).get("batch_name") or "" for u in (uids or [])]
    slc._finalize_remove(uids, disposition)
    verdict = S.get("apex_push_verdict") or ("info", "removed")
    if verdict[0] != "error":
        tasklog.log_many("item_returned" if disposition == "return"
                         else "item_deleted",
                         names, invoice=S.get("selected_invoice"))
    return verdict[0] != "error", verdict[1]


def undo_removed(index):
    slc._undo_removed(int(index))
    verdict = S.get("apex_push_verdict") or ("info", "restored")
    return verdict[0] != "error", verdict[1]


def inventory_candidates(batch, item_name=""):
    """Ranked inventory (product, batch) pairs for a manifest-only batch —
    with per-candidate on-hand and the suggested qty/unit from the manifest
    grams + the product's packaging, exactly like the original ➕ row."""
    cands = slc._find_inventory_candidates(batch, item_name)
    out = []
    for c in cands:
        p, b = c["product"], c["batch"]
        pid = b.get("product_id") or p.get("id")
        bid = b.get("id")
        avail, untracked = slc._batch_avail_units(pid, bid)
        out.append({
            "label": c["label"],
            "product_id": pid,
            "batch_id": bid,
            "product_name": p.get("name") or "",
            "batch_name": b.get("name") or "",
            "units_per_case": p.get("units_per_case"),
            "avail": avail,
            "untracked": untracked,
        })
    return out


def _find_candidate(product_id, batch_id):
    inv = S.get("inv_cache") or slc.load_inventory_cache()
    S["inv_cache"] = inv
    products = {str(p.get("id")): p for p in (inv.get("products") or [])}
    idx = slc.fetch_all_batches_indexed()
    p = products.get(str(product_id)) or {}
    for pid, blist in idx.items():
        if str(pid) != str(product_id):
            continue
        for b in blist:
            if str(b.get("id")) == str(batch_id):
                return {"label": p.get("name") or "", "product": p, "batch": b}
    return None


def suggest_add_qty(product_id, batch_id, grams):
    cand = _find_candidate(product_id, batch_id)
    if not cand:
        return None
    qty, unit, units, upc, gpu = slc._suggest_add_qty(cand["product"], grams or 0)
    return {"qty": qty, "unit": unit, "units_total": units,
            "units_per_case": upc, "grams_per_unit": gpu}


def add_line(product_id, batch_id, qty, unit_name):
    cand = _find_candidate(product_id, batch_id)
    if not cand:
        return False, "❌ Couldn't find that product/batch in the Apex inventory cache."
    slc._cmp_add_to_invoice("api", cand, qty, unit_name)
    verdict = S.get("apex_push_verdict") or ("info", "added")
    if verdict[0] != "error":
        tasklog.log_task("item_added", invoice=S.get("selected_invoice"),
                         detail=(cand.get("batch") or {}).get("name") or "")
    return verdict[0] != "error", verdict[1]


def add_all_missing():
    """The whole ➕ column in one call: every ❌ NOT IN INVOICE batch gets its
    top-ranked inventory candidate added at the engine-suggested qty/unit —
    identical to clicking each row's ➕ with its defaults untouched.

    All lines are STAGED first, then pushed through ONE
    push_invoice_changes cycle — not one full push (diff + cache clears +
    on-hand re-read) per batch, which is what made the first version crawl."""
    missing = [r for r in grid_rows()
               if str(r.get("Status")) == "❌ NOT IN INVOICE"]
    if not missing:
        return True, "Nothing to add — no ❌ NOT IN INVOICE batches on this pair."

    staged, topped_n, no_match, failed = [], 0, [], []
    for row in missing:
        batch = str(row.get("Batch") or "").strip()
        try:
            grams = float(str(row.get("METRC Total", "")).replace("g", ""))
        except (TypeError, ValueError):
            grams = 0.0
        cands = slc._find_inventory_candidates(batch, row.get("man_item") or "")
        if not cands:
            no_match.append(batch)
            continue
        cand = cands[0]
        qty, unit, _units, _upc, _gpu = slc._suggest_add_qty(cand["product"],
                                                             grams or 0)
        line, topped, err = slc._cmp_stage_line(batch, cand, qty, unit)
        if err:
            failed.append(f"{batch} — {err}")
            continue
        staged.append((line, f"cmpadd_{batch}"))
        if topped:
            topped_n += 1

    push_msg = ""
    if staged:
        slc._post_staged_to_invoice(staged)   # ONE push for every line
        verdict = S.get("apex_push_verdict") or ("info", "added")
        push_msg = verdict[1]
        if verdict[0] == "error":
            return False, f"❌ Bulk add push failed — {push_msg}"
        tasklog.log_many("item_added",
                         [(ln.get("batch_name") or "") for ln, _k in staged],
                         invoice=S.get("selected_invoice"))

    parts = [f"➕ Added {len(staged)}/{len(missing)} missing batch(es) "
             f"in one push."]
    if push_msg:
        parts.append(push_msg)
    if topped_n:
        parts.append(f"({topped_n} short batch(es) topped up first.)")
    if no_match:
        parts.append(f"⚠️ No inventory match for {len(no_match)}: "
                     + ", ".join(no_match[:8])
                     + ("…" if len(no_match) > 8 else "")
                     + " — load/refresh inventory in ⚙️ Data Sources, then use "
                       "the row's own ➕.")
    if failed:
        parts.append(f"❌ {len(failed)} failed: " + " · ".join(failed[:5])
                     + ("…" if len(failed) > 5 else ""))
    return not failed, " ".join(parts)


def pair_scan(sibs):
    """Combined scan — this invoice + siblings vs the loaded manifest."""
    merged = list(S.get("invoice_items") or [])
    missing = []
    for s in sibs:
        so, _o = bridge._fetch_order_for(s)
        if so:
            merged += so.get("items", [])
        else:
            missing.append(s["invoice"])
    pkgs_now = S.get("manifest_packages") or []
    if not merged or not pkgs_now:
        return {"rows": [], "missing": missing,
                "note": "Load the pair first — packages or items missing."}
    df = slc.create_exact_match_comparison(merged, pkgs_now)
    sts = [str(x) for x in df["Status"]]
    iss, structure = bridge.split_statuses(sts)
    return {"rows": df.to_dict(orient="records"), "missing": missing,
            "batches": len(sts), "perfect": len(sts) - len(iss) - len(structure),
            "issues": len(iss), "structure": len(structure)}


# ============================================================
# 💵 PAYMENTS
# ============================================================

def sync_payments():
    """Pull slc's authoritative b-api order read (money-blind v1/cache copies
    show Due 0.00 on orders with real balances)."""
    sess = S.get("bapi_session") or {}
    if not slc._session_ready(sess):
        return False, "Needs the Apex b-api session — grab it in 🔑 Apex session."
    cur = S.get("apex_order_raw") or {}
    oid_now = cur.get("id") or S.get("apex_order_id")
    if S.get("_pay_synced_for") == oid_now:
        return True, "already synced"
    fresh_b = slc.bapi_get_order(sess, cur.get("uuid")) or {}
    if fresh_b.get("id"):
        S["apex_order_raw"] = fresh_b
        slc._learn_net_terms_from_order(fresh_b)
        S["_pay_synced_for"] = oid_now
        return True, "synced"
    return False, "Couldn't pull the b-api order copy — showing the cached one."


def add_payment(amount, memo, accounting_method, payment_type, payment_date):
    sess = S.get("bapi_session") or {}
    if not slc._session_ready(sess):
        return False, "Needs the Apex b-api session — grab it in 🔑 Apex session."
    order = S.get("apex_order_raw") or {}
    log = []
    # Apex type strings are lowercase words WITH SPACES ("Write-Off" → "write off")
    method = re.sub(r"[\s-]+", " ", str(accounting_method or "payment").lower())
    ok = slc.bapi_add_payment(sess, order, {
        "amount": round(float(amount), 2),
        "memo": memo or "",
        "accounting_method": method,
        "payment_type": payment_type or "",
        "payment_date": str(payment_date or datetime.now().date())[:10],
    }, log)
    bridge.push_log(log)
    if ok:
        fresh = S.get("apex_order_raw") or order
        bridge._order_cache_store(slc._digits(fresh.get("invoice_number") or ""),
                                  fresh, fresh.get("id"))
        return True, f"💵 Posted ${float(amount):,.2f} {accounting_method or 'payment'} ✓"
    return False, "Post failed — see the push log."


def adjust_buyer_credit(amount, memo):
    """Change the buyer's stored credit (wallet) — separate from applying a
    credit to this order. Positive adds, negative subtracts."""
    sess = S.get("bapi_session") or {}
    if not slc._session_ready(sess):
        return False, "Needs the Apex b-api session — grab it in 🔑 Apex session."
    order = S.get("apex_order_raw") or {}
    buyer_id = (order.get("buyer") or {}).get("id") or order.get("buyer_id")
    if not buyer_id:
        return False, "Couldn't read the buyer id off this order."
    oid = order.get("id") or S.get("apex_order_id")
    log = []
    ok = slc.bapi_adjust_buyer_credit(sess, buyer_id, float(amount),
                                      memo or "Manual credit adjustment", log)
    if ok:
        fresh = slc.bapi_fetch_invoice(sess, oid, log=log) or {}
        if fresh.get("id"):
            S["apex_order_raw"] = fresh
    bridge.push_log(log)
    if ok:
        verb = "added to" if float(amount) > 0 else "subtracted from"
        return True, (f"✅ ${abs(float(amount)):,.2f} {verb} the buyer's "
                      f"stored credit.")
    return False, "❌ Credit adjustment didn't land — see the Apex log."


def delete_payment(payment_id):
    sess = S.get("bapi_session") or {}
    if not slc._session_ready(sess):
        return False, "Needs the Apex b-api session — grab it in 🔑 Apex session."
    order = S.get("apex_order_raw") or {}
    log = []
    ok = slc.bapi_delete_payment(sess, order, payment_id, log)
    bridge.push_log(log)
    if ok:
        S.pop("_pay_synced_for", None)
        sync_payments()
        return True, "🗑️ Payment deleted ✓"
    return False, "Delete failed — see the push log."


# ============================================================
# 📝 ORDER DETAILS
# ============================================================

def save_meta(delivery_date=None, due_date=None, net_terms_name=None,
              stage_id=None):
    """Save terms / dates / stage — same discipline as slc's editor:
    diff against the live order (Apex's own UI PATCHes only what changed),
    resolve terms via the learned name→id map FIRST (0 network calls; the
    list endpoint is hit once only for a never-seen term), then verify every
    field against the PATCH echo so a silent drop is reported, not hidden."""
    sess = S.get("bapi_session") or {}
    if not slc._session_ready(sess):
        return False, "Needs the Apex b-api session — grab it in 🔑 Apex session."
    order = S.get("apex_order_raw") or {}
    slc._learn_net_terms_from_order(order)
    log = []
    live = order
    updates = {}

    if delivery_date and str(delivery_date)[:10] != str(live.get("delivery_date") or "")[:10]:
        updates["delivery_date"] = str(delivery_date)[:10]
    if due_date and str(due_date)[:10] != str(live.get("due_date") or "")[:10]:
        updates["due_date"] = str(due_date)[:10]
    cur_sid = live.get("order_status_id") or (live.get("order_status") or {}).get("id")
    if stage_id and str(stage_id) != str(cur_sid):
        updates["order_status_id"] = stage_id

    term_name = net_terms_name
    if term_name == "(none)":
        # "(none)" clears the terms with net_terms_id: null — exactly what
        # Apex's own UI sends.
        if live.get("net_terms_id") is not None:
            updates["net_terms_id"] = None
            log.append({"step": "NET-TERMS",
                        "note": "clearing terms (net_terms_id → null)"})
    elif term_name:
        tid = slc._match_net_terms_id(term_name, [])   # learned map — instant
        if tid is None:
            tid = slc._match_net_terms_id(term_name,
                                          slc.bapi_list_net_terms(sess, log))
        if tid is not None:
            if tid != live.get("net_terms_id"):
                updates["net_terms_id"] = tid
                log.append({"step": "NET-TERMS",
                            "note": f"resolved '{term_name}' → net_terms_id {tid}"})
        else:
            updates["net_terms"] = term_name
            log.append({"step": "NET-TERMS",
                        "note": (f"couldn't resolve an id for '{term_name}' — sent "
                                 "the name. Set these terms once in the Apex UI and "
                                 "reload; the id is learned from the order read.")})

    if not updates:
        bridge.push_log(log)
        return True, "No changes — everything already matches what's on the invoice."

    ok, fresh = slc.bapi_update_order_fields(sess, order, updates, log)
    fresh = fresh or {}
    if not fresh and slc._session_ready(sess):
        fresh = slc.bapi_get_order(sess, order.get("uuid"), log) or {}

    problems = []
    if fresh:
        slc._learn_net_terms_from_order(fresh)
        if "net_terms_id" in updates and fresh.get("net_terms_id") != updates["net_terms_id"]:
            problems.append("terms")
        elif "net_terms_id" in updates and term_name and term_name != "(none)":
            ft = fresh.get("term")
            fname = ft.get("name") if isinstance(ft, dict) else None
            if fname and slc._term_key(fname) != slc._term_key(term_name):
                problems.append(f"terms (Apex shows '{fname}', not '{term_name}' — "
                                "the learned id map was corrected; save again)")
        if ("order_status_id" in updates
                and fresh.get("order_status_id") != updates["order_status_id"]
                and (fresh.get("order_status") or {}).get("id") != updates["order_status_id"]):
            problems.append("stage")
        if ("delivery_date" in updates
                and str(fresh.get("delivery_date") or "")[:10] != updates["delivery_date"]):
            problems.append("delivery date")
        if ("due_date" in updates
                and str(fresh.get("due_date") or "")[:10] != updates["due_date"]):
            problems.append("due date")
        log.append({"step": "VERIFY",
                    "note": ("✅ live order re-read — every field stuck"
                             if not problems else
                             "❌ did NOT stick: " + ", ".join(problems))})
        S["apex_order_raw"] = fresh
        # b-api orders carry invoiceNumber (camelCase) — the snake_case-only
        # read banked these under digits "" and the real key stayed stale.
        fresh_dg = slc._digits(str(fresh.get("invoice_number")
                                   or fresh.get("invoiceNumber")
                                   or fresh.get("custom_invoice_number")
                                   or S.get("selected_invoice") or ""))
        bridge._order_cache_store(fresh_dg, fresh, fresh.get("id"))
    bridge.push_log(log)

    if ok and not problems:
        inv_now = S.get("selected_invoice")
        if "delivery_date" in updates:
            tasklog.log_task("delivery_date_set", invoice=inv_now,
                             detail=updates["delivery_date"])
        if "due_date" in updates:
            tasklog.log_task("due_date_set", invoice=inv_now,
                             detail=updates["due_date"])
        if "net_terms_id" in updates or "net_terms" in updates:
            tasklog.log_task("terms_set", invoice=inv_now,
                             detail=str(term_name or ""))
        if "order_status_id" in updates:
            tasklog.log_task("deal_flow_updated", invoice=inv_now,
                             detail=str(((fresh.get("order_status") or {})
                                         .get("name")) or updates["order_status_id"]))
        return True, ("📝 Saved & verified on the live order: "
                      + ", ".join(k.replace("_", " ") for k in updates) + " ✓")
    if ok:
        return False, ("❌ Apex accepted the request but these did NOT stick: "
                       + ", ".join(problems) + " — see the Apex update log.")
    return False, "❌ Save didn't land — see the Apex update log."


# ============================================================
# ✂️ SPLIT
# ============================================================

def split_source():
    """Line items for the split picker — b-api read (the rich shape)."""
    sess = S.get("bapi_session") or {}
    if not slc._session_ready(sess):
        return None, "Splitting needs the Apex b-api session — 🔑 up top."
    cur_o = S.get("apex_order_raw") or {}
    if not cur_o.get("uuid"):
        return None, "Order not fully loaded — hit 📡 Re-pull Apex."
    src = slc.bapi_get_order(sess, cur_o.get("uuid")) or {}
    if not src.get("items"):
        src = slc.bapi_fetch_invoice(sess, cur_o.get("id")) or src
    S["_split_src"] = src
    rows = src.get("items") or []
    if not rows:
        okT, _c, msgT = slc.bapi_test_session(sess)
        return None, ("Couldn't read this order's line items over the b-api"
                      + ("" if okT else f" — {msgT}"))

    # METRC totals per batch, straight off the comparison
    metrc_g = {}
    for r in comparison_rows():
        try:
            metrc_g[str(r.get("Batch", "")).strip()] = float(
                str(r.get("METRC Total", "")).replace("g", ""))
        except Exception:
            pass

    out = []
    for it in rows:
        mg = metrc_g.get(str(it.get("batch_name") or "").strip())
        out.append({
            "id": it.get("id"),
            "batch_name": it.get("batch_name") or "—",
            "product_name": str(it.get("product_name") or ""),
            "qty": int(it.get("order_quantity") or 0) or 1,
            "unit": ((it.get("order_unit_measurement") or {}).get("alias") or "u"),
            "metrc_g": mg,
        })
    return out, ""


def split_target_lookup(invoice):
    """Validate an existing invoice as a split destination (same buyer)."""
    sess = S.get("bapi_session") or {}
    tdig = slc._digits(invoice)
    if not tdig:
        return None, "Type the invoice number of an existing order for this buyer."
    cur_o = S.get("apex_order_raw") or {}
    try:
        _toid, t_od, t_err = bridge.fetch_apex_order(f"Twiste-{tdig}", tdig)
        t_od = t_od or {}
        tgt = None
        if t_od.get("uuid"):
            tgt = slc.bapi_get_order(sess, t_od["uuid"]) or None
        if not tgt:
            return None, (t_err or f"No order found for Twiste-{tdig}.")
    except Exception as ex:
        return None, str(ex)
    if tgt.get("id") == cur_o.get("id"):
        return None, "That's THIS order — pick a different target."
    if tgt.get("buyer_id") != cur_o.get("buyer_id"):
        return None, (f"Twiste-{tdig} belongs to a DIFFERENT customer "
                      f"({(tgt.get('buyer') or {}).get('name', '?')}) "
                      f"— splits stay within one buyer.")
    S["_split_tgt"] = {"digits": tdig, "tgt": tgt}
    return {
        "digits": tdig,
        "invoice": tgt.get("invoiceNumber") or f"Twiste-{tdig}",
        "buyer": (tgt.get("buyer") or {}).get("name", ""),
        "items": len(tgt.get("items") or []),
        "due": (tgt.get("payment_currently_due") or 0) / 100.0,
    }, ""


def split_available(term=""):
    """Apex's OWN split-target picker list — every order the platform deems
    an eligible destination (any buyer), searchable. 0 metered calls."""
    sess = S.get("bapi_session") or {}
    if not slc._session_ready(sess):
        return [], "Needs the Apex b-api session — grab it in 🔑 up top."
    try:
        r = slc._HTTP.get(
            f"{slc.BAPI_BASE}/shipping-orders/split-order/available-orders",
            params={"search-term": term or ""},
            headers=slc._bapi_headers(sess), timeout=30)
    except Exception as e:
        return [], f"Apex picker failed — {type(e).__name__}"
    if r.status_code != 200:
        return [], f"Apex picker HTTP {r.status_code}"
    try:
        rows = r.json() or []
    except Exception:
        return [], "Apex picker returned non-JSON."
    out = []
    for o in (rows if isinstance(rows, list) else []):
        buyer = o.get("buyer") or {}
        inv = (o.get("invoiceNumber") or o.get("custom_invoice_number")
               or str(o.get("id")))
        try:
            total = float(o.get("total") or 0) / 100.0
        except (TypeError, ValueError):
            total = 0.0
        out.append({
            "id": o.get("id"), "uuid": o.get("uuid"),
            "digits": slc._digits(str(inv or "")),
            "invoice": inv,
            "buyer": (buyer.get("name") if isinstance(buyer, dict) else None)
                     or o.get("ship_name") or "?",
            "buyer_id": o.get("buyer_id"),
            "total": total,
            "date": str(o.get("delivery_date") or o.get("order_date") or "")[:10],
        })
    return out, ""


def split_target_pick(uuid, digits):
    """Lock in a split target chosen from Apex's own picker list — reads the
    full order by uuid, so it works for ANY eligible order (not just board
    orders), including a different buyer (Apex lists those as eligible; we
    surface a warning instead of blocking)."""
    sess = S.get("bapi_session") or {}
    if not slc._session_ready(sess):
        return None, "Needs the Apex b-api session — 🔑 up top."
    cur = S.get("apex_order_raw") or {}
    tgt = slc.bapi_get_order(sess, uuid) or {}
    if not tgt.get("id"):
        return None, "Couldn't read that order over the b-api."
    if tgt.get("id") == cur.get("id"):
        return None, "That's THIS order — pick a different target."
    warn = ""
    if cur.get("buyer_id") and tgt.get("buyer_id") != cur.get("buyer_id"):
        warn = ("⚠️ DIFFERENT buyer — Apex lists it as an eligible target, "
                "but double-check before splitting.")
    tdig = slc._digits(str(digits or tgt.get("invoiceNumber")
                           or tgt.get("custom_invoice_number") or ""))
    S["_split_tgt"] = {"digits": tdig, "tgt": tgt}
    return {
        "digits": tdig,
        "invoice": (tgt.get("invoiceNumber")
                    or tgt.get("custom_invoice_number") or f"Twiste-{tdig}"),
        "buyer": (tgt.get("buyer") or {}).get("name", ""),
        "items": len(tgt.get("items") or []),
        "due": (tgt.get("payment_currently_due") or 0) / 100.0,
        "warn": warn,
    }, ""


def do_split(selections, target_digits=None):
    """selections: [{id, qty}] — move those lines off this invoice."""
    sess = S.get("bapi_session") or {}
    if not slc._session_ready(sess):
        return False, None, "Splitting needs the Apex b-api session — 🔑 up top."
    src = S.get("_split_src") or {}
    if not src.get("items"):
        _rows, err = split_source()
        src = S.get("_split_src") or {}
        if not src.get("items"):
            return False, None, err or "Couldn't read the order's line items."
    by_id = {str(it.get("id")): it for it in (src.get("items") or [])}
    items_send = []
    for sel in selections:
        it = by_id.get(str(sel.get("id")))
        if not it:
            continue
        entry = dict(it)
        entry["order_quantity"] = int(sel.get("qty") or it.get("order_quantity") or 1)
        items_send.append(entry)
    if not items_send:
        return False, None, "No valid lines picked."

    tgt_order = None
    if target_digits:
        st = S.get("_split_tgt") or {}
        if st.get("digits") == str(target_digits):
            tgt_order = st.get("tgt")
        if not tgt_order:
            res, err = split_target_lookup(str(target_digits))
            if not res:
                return False, None, err
            tgt_order = (S.get("_split_tgt") or {}).get("tgt")

    ok, new_o, msg = bridge.bapi_split_order(sess, src, items_send,
                                             target_order=tgt_order)
    if ok:
        S.pop("_split_src", None)
        S.pop("_split_tgt", None)
        S.pop("comparison_df", None)
        S.pop("_cmp_sig", None)
        new_inv = ((new_o or {}).get("invoiceNumber")
                   or (new_o or {}).get("custom_invoice_number") or "new order")
        # +1 PER LINE ITEM split — same rule for both destinations
        # (🆕 new order and 📄 existing order)
        tasklog.log_many(
            "item_split",
            [f"{it.get('batch_name') or it.get('product_name') or '?'} → {new_inv}"
             for it in items_send],
            invoice=S.get("selected_invoice"))
        return True, new_inv, (f"✂️ Split ✓ — {len(items_send)} item(s) moved to "
                               f"{new_inv}. Reload the invoice live; hit 🧾 Refresh "
                               f"orders to bring {new_inv} onto the board.")
    return False, None, msg


# ============================================================
# 📧 EMAIL + DOWNLOADS
# ============================================================

def email_prepare():
    order = S.get("apex_order_raw") or {}
    oid = order.get("id") or S.get("apex_order_id")
    inv = str(S.get("selected_invoice", "") or oid or "")
    graph = slc._graph_creds()
    if not all(graph):
        return {"configured": False,
                "note": ("Email sending needs [graph] credentials in "
                         "backend/engine/.streamlit/secrets.toml")}

    default_to = order.get("buyer_contact_email") or ""
    if not default_to:
        b = order.get("buyer") or {}
        c0 = (b.get("contacts") or [{}])[0] if b.get("contacts") else {}
        default_to = c0.get("email") or ""

    clists = slc._load_contact_lists()
    buyer_o = order.get("buyer") or {}
    matched = slc._match_contact_list(
        clists,
        buyer_o.get("name", "") if isinstance(buyer_o, dict) else "",
        order.get("ship_name", ""), order.get("ship_city", ""),
        S.get("buyer_name", ""))

    emails, seen = [], set()
    if default_to:
        emails.append(default_to)
        seen.add(default_to.lower())
    if matched:
        for m in (clists.get(matched) or []):
            em = (m.get("email") or "").strip()
            if em and em.lower() not in seen:
                emails.append(em)
                seen.add(em.lower())
    if ALWAYS_TO_EMAIL.lower() not in seen:
        emails.append(ALWAYS_TO_EMAIL)

    return {
        "configured": True,
        "sender": graph[3],
        "to": emails,
        "cc": [],
        "always_to": ALWAYS_TO_EMAIL,
        "matched_list": matched,
        "contact_lists": {k: [{"name": m.get("name", ""),
                               "email": m.get("email", "")} for m in v]
                          for k, v in clists.items()},
        "subject": (f"Twisted Growers invoice: ({inv})" if inv
                    else "Twisted Growers invoice"),
        "body": slc._default_email_body(),
    }


def _invoice_blob():
    order = S.get("apex_order_raw") or {}
    inv = str(S.get("selected_invoice", "") or order.get("id") or "")
    return slc._ensure_invoice_email_blob(order, inv)


def build_bundle():
    """Invoice + all COAs, one zip — same construction as slc's bundle button."""
    order = S.get("apex_order_raw") or {}
    sess = S.get("bapi_session") or {}
    oid = order.get("id") or S.get("apex_order_id")
    order_uuid = order.get("uuid")
    log = []
    src_order = {}
    if slc._session_ready(sess):
        src_order = slc.bapi_fetch_invoice(sess, oid, log=log) or {}
    if not src_order:
        v1_order, _m = slc.fetch_invoice_order(oid)
        src_order = v1_order or order
        order_uuid = order_uuid or src_order.get("uuid")

    inv = str(S.get("selected_invoice", "") or oid or "")
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", inv) or "invoice"
    inv_bytes, ext, _mime, _src_label = slc.build_best_invoice_file(src_order)
    inv_name = f"{safe}{ext}"

    coa_zip, coa_msg = (None, "no Apex browser session — invoice only")
    if order_uuid and slc._session_ready(sess):
        coa_zip, coa_msg = slc.fetch_order_coa_zip(sess, order_uuid)
    bridge.push_log(log)
    bundle = slc.build_invoice_bundle_zip(inv_bytes, inv_name, coa_zip)
    return bundle, f"Bundle_{safe}.zip", coa_msg


def coa_zip():
    order = S.get("apex_order_raw") or {}
    sess = S.get("bapi_session") or {}
    inv = str(S.get("selected_invoice", "") or order.get("id") or "")
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", inv) or "order"
    data, msg = slc.fetch_order_coa_zip(sess, order.get("uuid"))
    return data, f"COAs_{safe}.zip", msg


def send_email(to, cc, subject, body, attach="pdf", extra=None,
               send_at_utc=None):
    if attach == "bundle":
        deps.progress("📧 Building the invoice + COA bundle…", 20)
        data, name, _coa = build_bundle()
        mime = "application/zip"
    else:
        deps.progress("📧 Building the invoice PDF attachment…", 20)
        blob = _invoice_blob()
        data, name, mime = blob["data"], blob["name"], blob.get(
            "mime", "application/pdf")
    # ── user-picked extra files (e.g. a back-order sheet) ride along ──
    # send_graph_mail takes a LIST of (name, bytes, mime); the invoice is
    # always first, then each extra in the order it was attached. A file that
    # fails base64 decode aborts the send — a silent partial attach would look
    # like everything went out.
    attachments = [(name, data, mime)]
    for a in (extra or []):
        fname = (getattr(a, "name", "") or "").strip() or "attachment"
        try:
            blob_b = base64.b64decode(getattr(a, "b64", "") or "",
                                      validate=True)
        except Exception:
            return False, f"Couldn't decode the attached file '{fname}' — re-attach it."
        if not blob_b:
            return False, f"The attached file '{fname}' came through empty — re-attach it."
        attachments.append((fname,
                            blob_b,
                            getattr(a, "mime", "") or "application/octet-stream"))
    n_extra = len(attachments) - 1
    deps.progress(
        f"📧 Sending to {len(to or [])} recipient(s) via Outlook…"
        + (f" ({n_extra} extra file(s) attached)" if n_extra else ""), 70)
    ok, msg = slc.send_graph_mail(to, subject, body, attachments, cc_addrs=cc,
                                  send_at_utc=send_at_utc)
    if ok and n_extra:
        msg = f"{msg} — with {n_extra} extra file(s) attached"
    if ok:
        # Emailed + Delivered = complete: the board auto-retires the card
        # once both are true (see bridge._auto_retire_completed).
        bridge.mark_emailed(slc._digits(str(S.get("selected_invoice") or "")))
        inv_now = S.get("selected_invoice")
        tasklog.log_task("email_sent", invoice=inv_now,
                         detail=f"{len(to or [])} recipient(s)")
        # the invoice PDF/bundle always rides the email; extras add to the count
        tasklog.log_task("pdf_attached", invoice=inv_now, detail=attach)
        if n_extra:
            tasklog.log_many("pdf_attached",
                             [a[0] for a in attachments[1:]], invoice=inv_now)
    return ok, msg
