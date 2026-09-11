"""Manifest Bridge engine-side logic — the full port of 2.0/manifest_bridge.py
minus the Streamlit UI. Every function here is either copied verbatim from the
original (with st.session_state swapped for the shim's global session) or is
the original's on-click handler reshaped to take arguments and return values.

Layout mirrors the original file:
  pack orders (left)  ⇄  METRC manifests (right)
  auto-matching (invoice number first, location name second)
  link persistence  ·  content verification  ·  caches  ·  quick ship
  deal-flow refresh  ·  split order  ·  pricing tiers  ·  pair tools
"""

import atexit
import copy
import json
import os
import re
import difflib
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from functools import lru_cache

from . import deps
from .deps import read_json, write_json, update_json, current_user, DATA_DIR

slc = deps.slc
planner = deps.planner
S = deps.session_state

PLANNER_FILE = os.path.join(DATA_DIR, "apex_planner.json")
LINKS_FILE = os.path.join(DATA_DIR, "apex_manifest_links.json")
ACTIVE_FILE = os.path.join(DATA_DIR, "apex_bridge_active.json")
VERIFY_FILE = os.path.join(DATA_DIR, "apex_bridge_verify.json")
PKG_CACHE_FILE = os.path.join(DATA_DIR, "apex_bridge_pkgcache.json")
ORDER_CACHE_FILE = os.path.join(DATA_DIR, "apex_bridge_ordercache.json")
PLANNER_CACHE_FILE = os.path.join(DATA_DIR, "apex_data_cache.json")
EMAILED_FILE = os.path.join(DATA_DIR, "apex_bridge_emailed.json")

# A name-only auto-match has to be this close before it is suggested at all.
NAME_MATCH_FLOOR = 0.82
ORDER_TTL_S = 600


def load_emailed():
    """Digits of every invoice successfully emailed from the bridge."""
    return set((read_json(EMAILED_FILE, {}) or {}).keys())


def mark_emailed(digits):
    """Record a successful invoice email send (survives restarts)."""
    if digits:
        update_json(EMAILED_FILE, {}, lambda d: d.__setitem__(
            str(digits), {"at": datetime.now().isoformat()}))


def _auto_retire_completed(orders):
    """📧 emailed + stage Delivered ⇒ that invoice is COMPLETE — kick its card
    off the board automatically, same skip-list + purge mechanics the
    deal-flow refresh uses. Runs on every board load; reads only local caches
    (0 network calls), so an order retires on the first poll after both
    conditions become true."""
    emailed = load_emailed()
    if not emailed:
        return orders
    kicked = []
    for o in orders:
        if o["digits"] not in emailed or not o.get("order_id"):
            continue
        od = ((_order_cache_get(o["digits"], copy_out=False) or {}).get("order")) or {}
        s_ = od.get("order_status") or {}
        st_ = ((s_.get("name") if isinstance(s_, dict) else "") or "").lower()
        if any(w in st_ for w in ("deliver", "complete")):
            kicked.append(o)
    if not kicked:
        return orders
    try:
        skip = planner._load_skip_ids()
        for o in kicked:
            try:
                skip.add(int(o["order_id"]))
            except (TypeError, ValueError):
                pass
        planner._save_skip_ids(skip)
        data = planner.load_planner()
        if planner._purge_done_orders(data):
            planner.save_planner(data)
        for o in kicked:
            planner._email_log(f"AUTO-RETIRED {o['invoice']}: "
                               f"emailed + Delivered -> complete")
    except Exception:
        return orders
    kd = {o["digits"] for o in kicked}
    return [o for o in orders if o["digits"] not in kd]


def push_log(entries):
    if entries:
        S["apex_push_log"] = (S.get("apex_push_log") or []) + list(entries)


# ============================================================
# PACK ORDERS (left column) — straight off the planner board
# ============================================================

def load_pack_orders():
    """Every Pack Order card sitting on the planner board, newest day first."""
    data = read_json(PLANNER_FILE, {}) or {}
    out = []
    for ym, days in (data.get("events") or {}).items():
        for dnum, evs in (days or {}).items():
            try:
                y, m = ym.split("-")
                day_iso = f"{y}-{m}-{int(dnum):02d}"
            except Exception:
                day_iso = ym
            for ev in (evs or []):
                if (ev.get("type") or "") != "Pack Order":
                    continue
                label = ev.get("label") or ""
                invoice = label.split(" - ")[0].strip()
                digits = slc._digits(invoice)
                if not digits:
                    continue
                out.append({
                    "uid": ev.get("uid") or f"{day_iso}-{digits}",
                    "invoice": invoice or f"Twiste-{digits}",
                    "digits": digits,
                    "company": ev.get("company") or "",
                    "note": ev.get("note") or "",
                    "order_id": str(ev.get("order_id") or ""),
                    "status": ev.get("status") or "prep",
                    "shipper": ev.get("shipper") or "",
                    "day": day_iso,
                })
    out.sort(key=lambda o: (o["day"], o["digits"]), reverse=True)
    return out


# ============================================================
# MANIFESTS (right column) — slc's cache, same window as slc's own panel
# ============================================================

def load_manifests():
    cache = S.get("mp_cache") or slc.load_manifest_cache()
    S["mp_cache"] = cache
    all_cached = cache.get("manifests", [])
    manifests = slc.manifests_in_window(all_cached) or all_cached
    try:
        slc.enrich_recipients_from_index(manifests)
    except Exception:
        pass
    manifests = [m for m in manifests if not m.get("IsVoided")]
    manifests.sort(key=lambda m: str(m.get("CreatedDateTime") or ""), reverse=True)
    return manifests


def load_active_ids():
    d = read_json(ACTIVE_FILE, {}) or {}
    return set(d.get("ids") or []), d.get("at")


def refresh_active_ids():
    """The ONE honest source of 'still in transit' — METRC's live outgoing list."""
    ids = {str(t.get("Id")) for t in (slc.fetch_active_outgoing_mp() or [])
           if t.get("Id") is not None}
    at = datetime.now().isoformat(timespec="seconds")
    write_json(ACTIVE_FILE, {"ids": sorted(ids), "at": at})
    return ids, at


def _deliveries_of(m):
    """(manifest, deliveries) — thread-pool unit for the METRC fan-outs."""
    try:
        return m, slc.get_transfer_deliveries(str(m.get("Id", "")),
                                              slc.LICENSE_MANUFACTURER)
    except Exception:
        return m, []


def fill_destinations(manifests, limit=20):
    """Backfill destination store + license for manifests still reading '—'.
    Deliveries fetch concurrently (read-only METRC calls); the manifest dicts
    are only mutated back on this thread."""
    todo = [m for m in manifests if slc.recipient_of(m)[0] in ("", "—")][:limit]
    if not todo:
        return 0
    filled = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(_deliveries_of, todo))
    for t, dels in results:
        if dels and isinstance(dels[0], dict):
            nm = dels[0].get("RecipientFacilityName", "")
            lc = dels[0].get("RecipientFacilityLicenseNumber", "")
            if nm:
                t["RecipientFacilityName"] = nm
            if lc:
                t["RecipientFacilityLicenseNumber"] = lc
            if nm or lc:
                filled += 1
    if filled:
        cache = S.get("mp_cache") or slc.load_manifest_cache()
        slc.save_manifest_cache(cache)
        S["mp_cache"] = cache
    return filled


def split_for_board(manifests, edges, active_ids):
    """Cards = manifests ACTIVE right now, plus anything linked. Rest → drawer."""
    linked = {e["manifest_id"] for e in edges}
    cards, drawer = [], []
    for m in manifests:
        if str(m.get("Id")) in linked or is_active(m, active_ids):
            cards.append(m)
        else:
            drawer.append(m)
    return cards, drawer


def is_received(m):
    if m.get("ReceivedDateTime") or m.get("DeliveryReceivedDateTime"):
        return True
    return (m.get("ReceivedDeliveryCount") or 0) >= (m.get("DeliveryCount") or 1)


def _age_days(m):
    for fld in ("EstimatedDepartureDateTime", "CreatedDateTime",
                "LastModifiedDateTime"):
        v = str(m.get(fld) or "")
        if len(v) >= 10:
            try:
                d = datetime.strptime(v[:10], "%Y-%m-%d")
            except Exception:
                continue
            if d.year > 1900:
                return (datetime.now() - d).days
    return 0


def is_active(m, active_ids=frozenset()):
    if str(m.get("Id")) in active_ids:
        return True
    if is_received(m):
        return False
    return _age_days(m) <= 14


def refresh_received_status(manifests, max_checks=30):
    """Cross-check every 'not yet received' manifest against its METRC
    deliveries and bake the real received status into the cache."""
    now = datetime.now()
    todo = []
    for m in manifests:
        if is_received(m):
            continue
        chk = m.get("_recv_checked_at")
        if chk:
            try:
                if (now - datetime.fromisoformat(chk)).total_seconds() < 1800:
                    continue
            except Exception:
                pass
        todo.append(m)
    todo = todo[:max_checks]
    marked = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(_deliveries_of, todo))
    for m, dels in results:
        m["_recv_checked_at"] = now.isoformat(timespec="seconds")
        if dels and isinstance(dels[0], dict):
            rec = [d for d in dels if d.get("ReceivedDateTime")]
            if rec:
                m["ReceivedDateTime"] = rec[0].get("ReceivedDateTime")
                m["ReceivedDeliveryCount"] = len(rec)
                m["DeliveryCount"] = len(dels)
                marked += 1
    if todo:
        cache = S.get("mp_cache") or slc.load_manifest_cache()
        slc.save_manifest_cache(cache)
        S["mp_cache"] = cache
    return marked


def manifest_invoices(m):
    """Every invoice number a manifest carries, as digit strings
    (one manifest can cover several orders: '1569/1568')."""
    raw = str(m.get("InvoiceNumber") or "")
    parts = re.split(r"[/,;&+|]+|\s{2,}", raw)
    out = [slc._digits(p) for p in parts if slc._digits(p)]
    return out or ([slc._digits(raw)] if slc._digits(raw) else [])


def group_siblings(order, manifest, orders, edges):
    """Co-shipped board orders riding the SAME manifest — via METRC's invoice
    field OR a user-made group link."""
    mid = str(manifest.get("Id"))
    toks = set(manifest_invoices(manifest))
    linked = {e["invoice"] for e in edges if e["manifest_id"] == mid}
    return [x for x in orders
            if x["digits"] != order["digits"]
            and (x["digits"] in toks or x["digits"] in linked)]


def manifest_view(m):
    name, lic = slc.recipient_of(m)
    return {
        "id": str(m.get("Id", "")),
        "manifest": str(m.get("ManifestNumber", "")),
        "invoice": str(m.get("InvoiceNumber") or ""),
        "digits": slc._digits(m.get("InvoiceNumber") or ""),
        "invoices": manifest_invoices(m),
        "recipient": name or "—",
        "license": lic or "",
        "packages": m.get("PackageCount") or m.get("DeliveryPackageCount") or 0,
        "created": str(m.get("CreatedDateTime") or "")[:10],
        "status": "Active" if is_active(m) else "Received",
    }


# ============================================================
# MATCHING
# ============================================================

@lru_cache(maxsize=4096)
def _norm_name(s):
    stem = slc._store_stem(s or "")
    return "".join(ch for ch in stem.lower() if ch.isalnum())


@lru_cache(maxsize=8192)
def _name_score(a, b):
    na, nb = _norm_name(a), _norm_name(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if na in nb or nb in na:
        return 0.95
    return difflib.SequenceMatcher(None, na, nb).ratio()


def auto_match(orders, manifests, existing, views=None):
    """Suggest a manifest for every pack order with no MANUAL link yet.
    Invoice number is authoritative; the name fallback only fires when it is
    unambiguous on BOTH sides (the 1505-style wrong-manifest guard)."""
    if views is None:
        views = [manifest_view(m) for m in manifests]
    by_digits = {}
    for v in views:
        for dg in v["invoices"]:
            by_digits.setdefault(dg, []).append(v)

    manual = {k for k, v in existing.items() if v.get("mode") == "manual"}
    claimed = {v["manifest_id"] for k, v in existing.items() if k in manual}
    out = {}

    # Pass 1 — invoice number. Exact and unambiguous only.
    for o in orders:
        if o["digits"] in manual:
            continue
        hits = by_digits.get(o["digits"], [])
        sole = [h for h in hits if h["invoices"] == [o["digits"]]]
        pick = sole[0] if len(sole) == 1 else (hits[0] if len(hits) == 1 else None)
        if pick:
            out[o["digits"]] = {"manifest_id": pick["id"], "basis": "invoice",
                                "score": 1.0}
            claimed.add(pick["id"])

    # Pass 2 — location name, for orders pass 1 could not place.
    leftover = [v for v in views if v["id"] not in claimed]
    for o in orders:
        if o["digits"] in manual or o["digits"] in out:
            continue
        scored = [(v, _name_score(o["company"], v["recipient"])) for v in leftover]
        scored = [(v, s) for v, s in scored if s >= NAME_MATCH_FLOOR]
        if not scored:
            continue
        scored.sort(key=lambda t: -t[1])
        best, best_s = scored[0]
        if len(scored) > 1 and abs(scored[1][1] - best_s) < 0.05:
            continue
        rivals = [x for x in orders
                  if x is not o and x["digits"] not in manual
                  and _name_score(x["company"], best["recipient"]) >= best_s - 0.05]
        if rivals:
            continue
        out[o["digits"]] = {"manifest_id": best["id"], "basis": "name",
                            "score": round(best_s, 3)}
        claimed.add(best["id"])
    return out


# ============================================================
# LINK PERSISTENCE + CONTENT VERIFICATION
# ============================================================

def load_verify_cache():
    return (read_json(VERIFY_FILE, {}) or {}).get("checks", {})


def save_verify_cache(checks):
    write_json(VERIFY_FILE, {"checks": checks,
                             "saved_at": datetime.now().isoformat(timespec="seconds")})


def verify_key(digits, transfer_id):
    return f"{digits}|{transfer_id}"


def split_statuses(statuses):
    """(real_issues, structure_only). A ⚠️ STRUCTURE MISMATCH row has the
    RIGHT total quantity, just split differently across lines/packages
    (invoice 100+100 joints vs one 200 METRC package). Per the house rule
    that is not a real mismatch — the pair stays GREEN, flagged ❗
    structurally incorrect."""
    sts = [str(s) for s in statuses]
    structure = [s for s in sts if "STRUCTURE MISMATCH" in s]
    issues = [s for s in sts
              if not s.startswith("✅") and "STRUCTURE MISMATCH" not in s]
    return issues, structure


def _verdict_detail(statuses, issues, structure):
    if not statuses:
        return "nothing to compare"
    if issues:
        return f"{len(issues)} of {len(statuses)} batches off"
    if structure:
        return (f"quantities agree ❗ {len(structure)} batch(es) "
                f"structurally incorrect")
    return "contents agree"


def verify_pair(order, manifest, siblings=()):
    """Compare invoice contents vs manifest contents — runs slc's own
    create_exact_match_comparison, so this verdict and the review grid can
    never disagree. Siblings' lines fold in for combined shipments."""
    tid = str(manifest.get("Id", ""))
    items, missing, errs = [], [], []
    for o in [order, *siblings]:
        oid, ordr, err = fetch_apex_order(o["invoice"], o["digits"])
        if not ordr:
            missing.append(o["invoice"])
            if err:
                errs.append(err)
            continue
        _order_cache_store(o["digits"], ordr, oid)
        items.extend(ordr.get("items", []))
    if missing and not items:
        return {"state": "error",
                "detail": errs[0] if errs
                else f"no Apex order for {', '.join(missing)}"}

    ent = _pkg_cache_get(manifest)
    if ent:
        mpkgs = ent["mpkgs"]
    else:
        pkgs, _deliveries, lic = slc.load_packages_for_transfer(
            tid, slc.LICENSE_MANUFACTURER)
        if not pkgs:
            return {"state": "error", "detail": "METRC returned no packages"}
        pkgs = slc.enrich_packages_with_pdf(pkgs, tid, lic or slc.LICENSE_MANUFACTURER)
        mpkgs = slc.convert_metrc_packages(pkgs)
        _pkg_cache_store(manifest, mpkgs, pkgs)

    df = slc.create_exact_match_comparison(items, mpkgs)
    statuses = list(df["Status"]) if len(df) else []
    issues, structure = split_statuses(statuses)
    inv_g = sum(w for w, _ in (slc.calculate_total_weight(i) for i in items) if w)
    met_g = sum(p["quantity"] for p in mpkgs)
    shared = (f" (combined with {', '.join(s['invoice'] for s in siblings)})"
              if siblings else "")
    return {
        "state": "match" if (statuses and not issues) else "mismatch",
        "batches": len(statuses),
        "issues": len(issues),
        "structure": len(structure),
        "inv_g": round(inv_g, 1),
        "metrc_g": round(met_g, 1),
        "diff_g": round(inv_g - met_g, 1),
        "shared_with": [s["invoice"] for s in siblings],
        "detail": (_verdict_detail(statuses, issues, structure) + shared),
        "at": datetime.now().isoformat(timespec="seconds"),
    }


def load_links():
    return (read_json(LINKS_FILE, {}) or {}).get("links", {})


def save_links(links):
    write_json(LINKS_FILE, {"links": links,
                            "saved_at": datetime.now().isoformat(timespec="seconds")})


def set_link(digits, manifest_id, mode="manual"):
    links = load_links()
    links[str(digits)] = {
        "manifest_id": str(manifest_id),
        "mode": mode,
        "by": current_user() or "",
        "at": datetime.now().isoformat(timespec="seconds"),
    }
    save_links(links)


def clear_link(digits):
    links = load_links()
    links.pop(str(digits), None)
    save_links(links)


def resolve(orders, manifests, links, suggestions, checks=None, views=None):
    """Fold saved links + live suggestions + content checks into one edge list."""
    checks = checks or {}
    if views is None:
        views = (manifest_view(m) for m in manifests)
    mv = {v["id"]: v for v in views}
    edges = []
    for o in orders:
        rec = links.get(o["digits"])
        basis, mode = None, None
        if rec and rec.get("manifest_id") in mv:
            mid, mode, basis = rec["manifest_id"], rec.get("mode", "manual"), "saved"
        else:
            sug = suggestions.get(o["digits"])
            if not sug:
                continue
            mid, mode, basis = sug["manifest_id"], "auto", sug["basis"]
        v = mv.get(mid)
        if not v:
            continue

        if v["invoices"] and o["digits"] not in v["invoices"] and mode != "manual":
            state, detail = "mismatch", f"manifest is invoice {v['invoice']}"
        else:
            chk = checks.get(verify_key(o["digits"], mid))
            if not chk:
                state, detail = "unknown", "contents not compared yet"
            elif chk.get("state") == "error":
                state, detail = "unknown", chk.get("detail", "check failed")
            else:
                state, detail = chk["state"], chk.get("detail", "")

        edges.append({
            "invoice": o["digits"], "order_uid": o["uid"], "manifest_id": mid,
            "state": state, "detail": detail, "mode": mode, "basis": basis,
            "firm": mode != "auto" or basis == "invoice",
        })
    return edges


# ============================================================
# PKG / ORDER CACHES — in-memory write-through over the JSON files
# ============================================================
# These two files are 10-20 MB. Parsing them from disk on every lookup made a
# single /api/board poll re-parse hundreds of MB (~350 ms × once per order),
# and storing ONE key rewrote the whole file under the 6 s lock — the source
# of the stale .tmp files and prefetch-thread contention. Each file now loads
# into _MEM exactly once per process; gets are dict lookups, stores mutate
# memory and a debounced timer flushes the full file (compact, no indent) off
# the request path. Convention: entries in _MEM are never mutated in place,
# only replaced — stores deepcopy in, gets deepcopy out (copy_out=False for
# read-only callers), so a shallow dict snapshot is safe to dump unlocked.

_MEM = {}
_MEM_LOCK = threading.RLock()
_FLUSH_TIMERS = {}
_FLUSH_DELAY_S = 2.0


def _mem_load(path):
    with _MEM_LOCK:
        d = _MEM.get(path)
        if d is None:
            d = read_json(path, {}) or {}
            _MEM[path] = d
        return d


def _mem_set(path, key, value):
    with _MEM_LOCK:
        _mem_load(path)[str(key)] = copy.deepcopy(value)
        _schedule_flush(path)


def _mem_pop(path, key):
    with _MEM_LOCK:
        if _mem_load(path).pop(str(key), None) is not None:
            _schedule_flush(path)


def _schedule_flush(path):
    t = _FLUSH_TIMERS.get(path)
    if t:
        t.cancel()
    t = threading.Timer(_FLUSH_DELAY_S, _flush_now, args=(path,))
    t.daemon = True
    _FLUSH_TIMERS[path] = t
    t.start()


def _flush_now(path):
    with _MEM_LOCK:
        _FLUSH_TIMERS.pop(path, None)
        data = _MEM.get(path)
        if data is None:
            return
        snapshot = dict(data)
    try:
        write_json(path, snapshot, indent=None)
    except Exception:
        pass


def _flush_all():
    for path in list(_FLUSH_TIMERS):
        _flush_now(path)


atexit.register(_flush_all)


def _pkg_cache_store(manifest, mpkgs, raw):
    try:
        name, lic = slc.recipient_of(manifest)
        entry = {
            "last_modified": str(manifest.get("LastModifiedDateTime") or ""),
            "saved_at": datetime.now().isoformat(timespec="seconds"),
            "manifest_number": str(manifest.get("ManifestNumber") or ""),
            "invoice": (manifest.get("InvoiceNumber") or "").strip(),
            "recipient": name, "recipient_license": lic,
            "mpkgs": mpkgs, "raw": raw,
        }
        _mem_set(PKG_CACHE_FILE, manifest.get("Id"), entry)
    except Exception:
        pass


def _pkg_cache_get(manifest, copy_out=True):
    ent = _mem_load(PKG_CACHE_FILE).get(str(manifest.get("Id")))
    if not ent or not ent.get("mpkgs"):
        return None
    if ent.get("last_modified") != str(manifest.get("LastModifiedDateTime") or ""):
        return None
    row_n = manifest.get("PackageCount") or manifest.get("DeliveryPackageCount")
    if row_n and len(ent["mpkgs"]) != row_n:
        return None
    return copy.deepcopy(ent) if copy_out else ent


def _order_cache_store(digits, order, oid):
    try:
        entry = {"fetched_at": time.time(), "oid": oid, "order": order}
        _mem_set(ORDER_CACHE_FILE, digits, entry)
    except Exception:
        pass


def _order_cache_get(digits, copy_out=True):
    ent = _mem_load(ORDER_CACHE_FILE).get(str(digits))
    if not ent or not ent.get("order"):
        return None
    if time.time() - (ent.get("fetched_at") or 0) > ORDER_TTL_S:
        return None
    return copy.deepcopy(ent) if copy_out else ent


def order_cache_pop(digits):
    """Drop one cached order (force-live re-pull path)."""
    _mem_pop(ORDER_CACHE_FILE, digits)


# ============================================================
# APEX ORDER READS — b-api first (unmetered), v1 fallback
# ============================================================

def _any_session():
    s = S.get("bapi_session") or {}
    return s if slc._session_ready(s) else {}


def _local_order_id(digits):
    digits = str(digits)
    try:
        for o in load_pack_orders():
            if o["digits"] == digits and o.get("order_id"):
                return o["order_id"]
    except Exception:
        pass
    ent = _mem_load(ORDER_CACHE_FILE).get(digits)
    if ent and ent.get("oid"):
        return ent["oid"]
    for o in (read_json(PLANNER_CACHE_FILE, {}) or {}).get("orders") or []:
        if slc._digits(o.get("invoice_number")) == digits:
            return o.get("id")
    return None


def fetch_apex_order(invoice, digits):
    """(oid, order | None, err) — the one way the bridge reads an Apex order.
    b-api FIRST (unmetered browser-session read); v1 bearer API only as the
    fallback (billed per request — the monthly cap ran out 2026-08-04)."""
    sess = _any_session()
    oid = _local_order_id(digits)
    if sess and oid:
        o = slc.bapi_fetch_invoice(sess, oid)
        if o:
            return (o.get("id") or oid), o, ""
    v1_oid = (slc.get_order_by_invoice_number(invoice)
              or slc.get_order_by_invoice_number(digits))
    if v1_oid:
        od = slc.get_order_details(v1_oid)
        o = (od or {}).get("order")
        if o:
            return v1_oid, o, ""
        if sess and v1_oid != oid:
            o = slc.bapi_fetch_invoice(sess, v1_oid)
            if o:
                return v1_oid, o, ""
    status = slc.APEX_V1_LAST.get("status")
    if status and status != 200:
        why = ("monthly API spending cap reached" if status == 429
               else f"HTTP {status}")
        if not sess:
            return oid or v1_oid, None, (
                f"Apex v1 API refused ({why}) — load the 🔑 b-api session; "
                f"its reads are free and don't count against the cap.")
        return oid or v1_oid, None, (
            f"Apex v1 API refused ({why}) and the b-api read of {invoice} "
            f"failed — session expired? Re-grab it under 🔑 Apex session.")
    return oid or v1_oid, None, f"no Apex order for {invoice}"


def _apply_apex_order(o, oid, num_hint=""):
    """Mirror of the session writes in slc.load_apex_invoice."""
    items = o.get("items", [])
    bo = o.get("buyer")
    buyer = bo.get("name", "") if isinstance(bo, dict) else ""
    ship_name = (o.get("ship_name") or "").strip()
    ship_city = (o.get("ship_city") or "").strip()
    buyer = buyer or ship_name or o.get("buyer_contact_name", "") or "N/A"
    tiw = 0
    for it in items:
        w, _ = slc.calculate_total_weight(it)
        if w:
            tiw += w
    status_obj = o.get("order_status") or {}
    S.update({
        "invoice_items": items,
        "buyer_name": buyer,
        "order_total": o.get("total"),
        "selected_invoice": o.get("invoice_number", "") or num_hint,
        "total_invoice_weight": tiw,
        "order_status_name": (status_obj.get("name", "")
                              if isinstance(status_obj, dict) else ""),
        "apex_buyer_license": slc._buyer_license(o),
        "apex_ship_stem": slc._store_stem(ship_name),
        "apex_store_stem": slc._store_stem(buyer),
        "apex_ship_city": ship_city,
        "apex_order_id": oid,
        "apex_order_raw": o,
    })
    S["invoice_items_original"] = [dict(x) for x in items]
    S["removed_items"] = []
    for k in ("apex_push_log", "comparison_df",
              "inv_pdf_blob", "inv_bundle_blob", "coa_zip_blob"):
        S.pop(k, None)


# ============================================================
# BOOT PREFETCH — background workers warm every linked pair
# ============================================================

_PF = {"active": False, "done": 0, "total": 0, "bump": 0}
_PF_LOCK = threading.Lock()

# One attempt per pair per manifest-version: a pair whose METRC fetch fails
# permanently (no packages, no session) must NOT re-arm on every board load —
# that loops the frontend's prefetch poll into endless METRC retries. Keyed by
# verify_key, valued by the manifest signature; the pair re-arms only when the
# manifest actually changes.
_PF_ATTEMPTED = {}


def _pf_signature(m):
    return (str(m.get("LastModifiedDateTime") or ""),
            m.get("PackageCount") or m.get("DeliveryPackageCount") or 0)


def score_fresh_compare(prev_state, res, invoice):
    """Make.com-style metering for comparisons, from ANY path (Compare all,
    review open, boot prefetch): +1 per line item scanned & confirmed on a
    FRESH compare. A green invoice scores every line; a red one scores only
    the lines that individually matched. A pair that already had a verdict
    scores 0 — re-comparing earns nothing."""
    try:
        if prev_state in ("match", "mismatch"):
            return
        if not isinstance(res, dict) or res.get("state") not in ("match", "mismatch"):
            return                       # error results score nothing
        n_total = int(res.get("batches") or 0)
        n_bad = int(res.get("issues") or 0)
        n = n_total if res.get("state") == "match" else max(n_total - n_bad, 0)
        if n <= 0:
            return
        from . import tasklog
        tasklog.log_many("invoice_compared",
                         [f"line {j + 1}/{n_total} confirmed" for j in range(n)],
                         invoice=invoice)
    except Exception:
        pass


def _prefetch_pair(o, m, sibs):
    try:
        res = verify_pair(o, m, sibs)
    except Exception as ex:
        res = {"state": "error", "detail": f"{type(ex).__name__}: {ex}"}

    key = verify_key(o["digits"], str(m.get("Id")))
    prev = {"state": None}

    def _mut(d):
        checks = d.setdefault("checks", {})
        prev["state"] = (checks.get(key) or {}).get("state")
        checks[key] = res
    update_json(VERIFY_FILE, {}, _mut)
    score_fresh_compare(prev["state"], res, o.get("invoice") or o["digits"])


def maybe_start_prefetch(pairs):
    with _PF_LOCK:
        if _PF["active"] or not pairs:
            return
        _PF.update(active=True, done=0, total=len(pairs))

    def run():
        try:
            with ThreadPoolExecutor(max_workers=3) as ex:
                futs = [ex.submit(_prefetch_pair, o, m, s) for o, m, s in pairs]
                for fu in futs:
                    try:
                        fu.result()
                    except Exception:
                        pass
                    with _PF_LOCK:
                        _PF["done"] += 1
        finally:
            with _PF_LOCK:
                _PF.update(active=False, bump=_PF["bump"] + 1)

    threading.Thread(target=run, daemon=True).start()


def prefetch_status():
    with _PF_LOCK:
        return dict(_PF)


# ============================================================
# ⚡ POPULAR DELIVERIES — one-click post-delivery routine
# ============================================================

QS_TERMS = {
    "net30": {"name": "Net 30", "days": 30, "discount": 0.0},
    "cod":   {"name": "COD",    "days": 0,  "discount": 0.05},
}
QS_COD_MEMO = "COD 5% discount"


def quick_ship(order, day, terms_key):
    """Returns (ok, message). Everything verified against the PATCH echo."""
    spec = QS_TERMS.get(terms_key)
    if not spec:
        return False, f"Unknown terms preset '{terms_key}'."
    sess = S.get("bapi_session") or {}
    if not slc._session_ready(sess):
        return False, ("⚡ needs the Apex b-api session (terms/dates/credits are "
                       "browser-session writes) — grab it in 🔑 Apex session first.")

    dt = datetime.now().date() + timedelta(days=1 if day == "tomorrow" else 0)
    due = dt + timedelta(days=spec["days"])
    log = []
    prev_raw = S.get("apex_order_raw")

    try:
        oid, o, err = fetch_apex_order(order["invoice"], order["digits"])
        if not o:
            return False, (err or f"No Apex order found for {order['invoice']}.")

        statuses = ((o.get("deal_flow") or {}).get("order_statuses")) or []
        if not statuses:
            src = slc.bapi_get_order(sess, o.get("uuid"), log) or {}
            statuses = ((src.get("deal_flow") or {}).get("order_statuses")) or []
        deliv = next((s for s in statuses
                      if "deliver" in str(s.get("name", "")).lower()
                      and not s.get("archived")), None)

        updates = {"delivery_date": dt.strftime("%Y-%m-%d"),
                   "due_date": due.strftime("%Y-%m-%d")}
        if deliv:
            updates["order_status_id"] = deliv["id"]
        tid = slc._match_net_terms_id(spec["name"], [])
        if tid is None:
            tid = slc._match_net_terms_id(spec["name"],
                                          slc.bapi_list_net_terms(sess, log))
        if tid is not None:
            updates["net_terms_id"] = tid
        else:
            updates["net_terms"] = spec["name"]

        ok, fresh = slc.bapi_update_order_fields(sess, o, updates, log)
        fresh = fresh or {}
        if not ok:
            return False, f"Apex rejected the update for {order['invoice']} — see the push log."

        problems = []
        if fresh:
            if str(fresh.get("delivery_date") or "")[:10] != updates["delivery_date"]:
                problems.append("delivery date")
            if str(fresh.get("due_date") or "")[:10] != updates["due_date"]:
                problems.append("due date")
            if "net_terms_id" in updates and fresh.get("net_terms_id") != updates["net_terms_id"]:
                problems.append("terms")
            if deliv and (fresh.get("order_status_id") or
                          (fresh.get("order_status") or {}).get("id")) != deliv["id"]:
                problems.append("stage")
            slc._learn_net_terms_from_order(fresh)

        credit_note = ""
        if spec["discount"]:
            base = fresh or o
            already = any(QS_COD_MEMO in str(p.get("note") or "")
                          for p in (base.get("payments") or []))
            total = slc._order_money(base, "total")
            if already:
                credit_note = " · COD credit already on the order (skipped)"
            elif not total:
                problems.append("5% credit (order shows no total)")
            else:
                amt = round(total * spec["discount"], 2)
                pok = slc.bapi_add_payment(sess, base, {
                    "amount": amt, "memo": QS_COD_MEMO,
                    "accounting_method": "ad hoc credit", "payment_type": "",
                    "payment_date": dt.strftime("%Y-%m-%d")}, log)
                if pok:
                    credit_note = f" · 💵 5% COD credit −${amt:,.2f} ✓"
                else:
                    problems.append("5% credit (post failed)")

        final = S.get("apex_order_raw") or fresh
        if final and slc._digits(final.get("invoice_number", "")) == order["digits"]:
            _order_cache_store(order["digits"], final, oid)

        stage_note = ("Delivered ✓" if deliv and "stage" not in problems
                      else "stage unchanged (no Delivered stage in this deal flow)"
                      if not deliv else "stage FAILED")
        msg = (f"⚡ {order['invoice']}: {stage_note} · 🚚 {dt:%a %b} {dt.day} · "
               f"{spec['name']} · due {due:%b} {due.day}{credit_note}")
        if problems:
            return False, msg + f" — ⚠️ didn't stick: {', '.join(problems)}."
        return True, msg
    except Exception as ex:
        return False, f"⚡ {order['invoice']} failed: {type(ex).__name__}: {ex}"
    finally:
        push_log(log)
        cur = S.get("apex_order_raw")
        if (prev_raw is not None and cur is not None
                and slc._digits(str(prev_raw.get("invoice_number") or ""))
                    != slc._digits(str(cur.get("invoice_number") or ""))):
            S["apex_order_raw"] = prev_raw


# ============================================================
# 🧾 APEX DEAL-FLOW REFRESH — b-api only, 0 metered v1 calls
# ============================================================

def refresh_apex_orders():
    sess = _any_session()
    if not slc._session_ready(sess):
        return False, ("Apex refresh failed: needs the 🔑 b-api session "
                       "loaded — grab it above, then retry.")
    deps.progress("🧾 Refresh orders — pulling the Apex deal-flow list…", 10)
    try:
        r = slc._HTTP.get(f"{slc.BAPI_BASE}/shipping-orders",
                         headers=slc._bapi_headers(sess), timeout=90)
    except Exception as e:
        return False, f"Apex refresh failed: b-api list — {type(e).__name__}"
    if r.status_code != 200:
        return False, f"Apex refresh failed: b-api list HTTP {r.status_code}"
    try:
        rows = r.json() or []
    except Exception:
        return False, "Apex refresh failed: b-api list returned non-JSON"

    # same list the deal-flow section reads — re-bank its cache for free
    try:
        save_dealflow_cache(*_dealflow_parse(rows))
    except Exception:
        pass

    active = {"Accepted", "Pending Shipment", "In-Transit"}
    try:
        with open(os.path.join(DATA_DIR, "apex_invoice_floor.json")) as fh:
            floor = int((json.load(fh) or {}).get("invoice_floor", 0))
    except Exception:
        floor = 0

    emailed = load_emailed()
    slim, done_ids = [], []
    for o in rows:
        osd = o.get("order_status") or {}
        parent = ((osd.get("parent_order_status") or {}).get("name")
                  or osd.get("name") or "Unknown") if isinstance(osd, dict) \
            else "Unknown"
        # Done-check BOTH the parent status and the deal-flow stage name:
        # a custom stage like "Order Cancelled" can sit under an active
        # parent (seen live: parent "Submitted"), and the cancelled flag
        # stays False when an order is merely moved into such a stage.
        # Cancel/void stage names count done unconditionally; a Delivered/
        # complete stage name counts done only once the invoice has been
        # EMAILED (emailed + Delivered = complete).
        stage_l = ((osd.get("name") if isinstance(osd, dict) else "") or "").lower()
        inv = (o.get("invoiceNumber") or o.get("custom_invoice_number")
               or o.get("invoice_number") or str(o.get("id")))
        dg = slc._digits(str(inv or ""))
        cancelish = any(w in stage_l for w in ("cancel", "void"))
        deliverish = any(w in stage_l for w in ("deliver", "complete"))
        if (o.get("cancelled")
                or planner._is_done_status(str(parent).lower())
                or cancelish
                or (deliverish and dg in emailed)):
            done_ids.append(o.get("id"))
            continue
        items = o.get("items") or []
        if not items or parent not in active:
            continue
        nums = re.findall(r"\d+", str(inv or ""))
        if floor > 0 and nums and int(nums[-1]) < floor:
            continue
        buyer = o.get("buyer") or {}
        try:
            total = float(o.get("total") or 0) / 100.0
        except (TypeError, ValueError):
            total = 0.0
        slim.append({"id": str(o.get("id")),
                     "invoice_number": inv,
                     "buyer_name": (buyer.get("name", "Unknown")
                                    if isinstance(buyer, dict) else "Unknown"),
                     "total": total,
                     "status": parent,
                     "item_count": len(items)})

    try:
        skip = planner._load_skip_ids()
        changed = False
        act = set()
        for s in slim:
            try:
                act.add(int(s["id"]))
            except (TypeError, ValueError):
                pass
        if act & skip:
            skip.difference_update(act)
            changed = True
        new_done = {i for i in done_ids if i is not None} - skip
        if new_done:
            skip.update(new_done)
            changed = True
        if changed:
            planner._save_skip_ids(skip)
    except Exception:
        pass

    deps.progress("🧾 Refresh orders — syncing the planner board…", 45)
    slim = planner.filter_active_orders(slim)
    data = planner.load_planner()
    planner.ensure_uids(data)
    added, removed, purged = planner.sync_board_with_apex(data, slim)
    if added:
        from . import tasklog
        tasklog.log_many("order_added", [""] * int(added))

    # Re-bank FRESH full copies of every board order in one unmetered bulk
    # call. The row snapshots (stage/terms/dates) and the next review open
    # read the order cache — without this, an edit made in the Apex UI from
    # another browser stays invisible here until the 600s TTL happens to
    # lapse, which made this button look like it "wasn't refreshing".
    refreshed = 0
    try:
        ids = {}
        for bo in load_pack_orders():
            oid = bo.get("order_id") or _local_order_id(bo["digits"])
            if oid:
                ids[str(oid)] = bo["digits"]
        if ids:
            deps.progress(f"🧾 Refresh orders — re-pulling {len(ids)} board "
                          f"order(s) fresh from Apex…", 70)
            for fo in slc.bapi_bulk_fetch_invoices(sess, list(ids.keys()),
                                                   log=[]) or []:
                dg = ids.get(str(fo.get("id")))
                if dg and fo.get("id"):
                    _order_cache_store(dg, fo, fo.get("id"))
                    refreshed += 1
    except Exception:
        pass
    return True, (f"🧾 Apex refresh (🔑 b-api, 0 metered calls): board "
                  f"+{added} auto-added / {removed} retired / {purged} "
                  f"purged · {len(slim)} active · {refreshed} board order(s) "
                  f"re-pulled fresh.")


# ============================================================
# ✂️ SPLIT ORDER
# ============================================================

def bapi_split_order(session, order, items, add_to_new=True, target_order=None):
    """Returns (ok, new_order_dict_or_None, message). Payload shape proven live
    2026-07-22 (split_probe.py → Twiste-1607)."""
    log = []
    body = {
        "addToNewOrder": bool(add_to_new and not target_order),
        "itemsSelected": [
            {"key": next((p + 1 for p, oi in
                          enumerate(order.get("items") or [])
                          if oi.get("id") == it.get("id")), i + 1),
             "item": dict(it)}
            for i, it in enumerate(items)],
        "newOrder": {
            "buyer_contact_email": order.get("buyer_contact_email"),
            "buyer_contact_name": order.get("buyer_contact_name"),
            "buyer_contact_phone": order.get("buyer_contact_phone"),
            "buyer_id": order.get("buyer_id"),
            "buyer_state_license": order.get("buyer_state_license"),
            "operation_group_id": None,
            "selectedBuyerUuid": (order.get("buyer") or {}).get("uuid"),
            "selectedDealFlowId": order.get("deal_flow_id"),
            "seller_operation_id": None,
            "ship_city": order.get("ship_city"),
            "ship_country": order.get("ship_country"),
            "ship_line_one": order.get("ship_line_one"),
            "ship_line_two": order.get("ship_line_two"),
            "ship_name": order.get("ship_name"),
            "ship_state": order.get("ship_state"),
            "ship_zip": order.get("ship_zip"),
        },
        "order": dict(order),
        "orderSelected": dict(target_order) if target_order else None,
    }
    url = f"{slc.BAPI_BASE}/shipping-orders/split-order"
    try:
        r = slc._HTTP.post(url, headers=slc._bapi_headers(session), json=body,
                          timeout=90)
    except Exception as ex:
        return False, None, f"Split request failed: {type(ex).__name__}: {ex}"
    try:
        j = r.json()
    except Exception:
        j = {}
    try:
        write_json(os.path.join(DATA_DIR, "apex_split_debug.json"), {
            "at": datetime.now().isoformat(timespec="seconds"),
            "url": url,
            "status": r.status_code,
            "response": (j if j else r.text[:3000]),
            "request_body": body,
        })
    except Exception:
        pass
    log.append({"step": "SPLIT-ORDER", "method": "POST", "url": url,
                "status": r.status_code,
                "note": str(j.get("message") or r.text[:300])})
    push_log(log)
    if r.status_code == 200 and (j.get("code") == 200 or "data" in j):
        data = j.get("data") or {}
        new_o = data.get("orderSplittingInto") or {}
        orig = data.get("originalOrder") or {}
        if orig.get("id"):
            _order_cache_store(slc._digits(orig.get("invoiceNumber")
                                           or orig.get("custom_invoice_number")
                                           or ""), orig, orig.get("id"))
        if new_o.get("id"):
            _order_cache_store(slc._digits(new_o.get("invoiceNumber")
                                           or new_o.get("custom_invoice_number")
                                           or ""), new_o, new_o.get("id"))
        return True, new_o, str(j.get("message") or "Order Split Successfully")
    err = j.get("errors") or j.get("message") or r.text[:300]
    return False, None, (f"Split rejected [{r.status_code}]: {err} — full "
                         f"request+response dumped to apex_split_debug.json.")


# ============================================================
# 💲 PRICING TIERS
# ============================================================

def bapi_list_pricing_tiers(session):
    try:
        r = slc._HTTP.get(f"{slc.BAPI_BASE}/pricing-tiers",
                         headers=slc._bapi_headers(session), timeout=30)
        j = r.json()
        tiers = j if isinstance(j, list) else (j.get("data") or [])
        return [t for t in tiers if isinstance(t, dict) and t.get("id")
                and not t.get("deleted_at")]
    except Exception:
        return []


def bapi_change_pricing_tier(session, order, tier_id):
    """Apply (or clear, tier_id=None) a pricing tier. Returns (ok, message)."""
    oid = order.get("id") or S.get("apex_order_id")
    url = f"{slc.BAPI_BASE}/shipping-orders/change-pricing-tier/{oid}"
    body = {"id": oid, "pricing_tier_id": tier_id}
    try:
        r = slc._HTTP.patch(url, headers=slc._bapi_headers(session), json=body,
                           timeout=60)
    except Exception as ex:
        return False, f"Tier change failed: {type(ex).__name__}: {ex}"
    try:
        j = r.json()
    except Exception:
        j = {}
    push_log([{"step": "PRICING-TIER", "method": "PATCH", "url": url,
               "status": r.status_code,
               "note": f"pricing_tier_id -> {tier_id}"}])
    if r.status_code == 200:
        fresh = j.get("order") if isinstance(j, dict) and "order" in j else j
        newtot = None
        if isinstance(fresh, dict) and fresh.get("id"):
            S["apex_order_raw"] = fresh
            _order_cache_store(
                slc._digits(fresh.get("invoiceNumber")
                            or fresh.get("custom_invoice_number") or ""),
                fresh, fresh.get("id"))
            newtot = (fresh.get("total") or 0) / 100.0
        tn = ((fresh.get("pricing_tier") or {}).get("name")
              if isinstance(fresh, dict) else None)
        return True, (f"💲 {'Tier removed' if tier_id is None else f'Tier applied: {tn or tier_id}'} ✓"
                      + (f" — order total now ${newtot:,.2f}" if newtot is not None else ""))
    return False, (f"Tier change rejected [{r.status_code}]: "
                   f"{j.get('message') or r.text[:200]}")


# ============================================================
# 👯 PAIR TOOLS — one manifest covering several invoices
# ============================================================

def _fetch_order_for(order):
    """(order_dict, oid) for any board order — cache first, live second."""
    ent = _order_cache_get(order["digits"])
    if ent and ent.get("order"):
        return ent["order"], ent.get("oid")
    try:
        oid, o, _err = fetch_apex_order(order["invoice"], order["digits"])
        if o:
            _order_cache_store(order["digits"], o, oid)
        return (o or None), oid
    except Exception:
        return None, None


def pair_copy_meta(src, sib_order):
    """Push src's live delivery/due/terms/stage onto the sibling order."""
    sess = S.get("bapi_session") or {}
    if not slc._session_ready(sess):
        return False, "Needs the Apex b-api session (🔑 up top)."
    tgt, oid = _fetch_order_for(sib_order)
    if not tgt:
        return False, f"Couldn't read {sib_order['invoice']} from Apex."
    updates = {}
    dd = str(src.get("delivery_date") or "")[:10]
    du = str(src.get("due_date") or "")[:10]
    if dd:
        updates["delivery_date"] = dd
    if du:
        updates["due_date"] = du
    if src.get("net_terms_id") is not None:
        updates["net_terms_id"] = src.get("net_terms_id")
    sid = src.get("order_status_id") or (src.get("order_status") or {}).get("id")
    if sid:
        updates["order_status_id"] = sid
    if not updates:
        return False, "Nothing is set on this invoice yet — save it first."
    log = []
    ok, fresh = slc.bapi_update_order_fields(sess, tgt, updates, log)
    push_log(log)
    if ok and fresh:
        _order_cache_store(sib_order["digits"], fresh, fresh.get("id") or oid)
    return ok, (f"↷ {sib_order['invoice']}: applied "
                f"{', '.join(k.replace('_', ' ') for k in updates)}."
                if ok else f"Apex rejected the update for {sib_order['invoice']} "
                           f"— see the push log.")


def pair_mirror_payment(rec, sib_order):
    """Post the same payment/credit record onto the sibling order."""
    sess = S.get("bapi_session") or {}
    if not slc._session_ready(sess):
        return False, "Needs the Apex b-api session (🔑 up top)."
    tgt, oid = _fetch_order_for(sib_order)
    if not tgt:
        return False, f"Couldn't read {sib_order['invoice']} from Apex."
    raw_amt = rec.get("amount") or 0
    try:
        amt = float(raw_amt) / 100.0 if isinstance(raw_amt, (int, float)) \
            else float(str(raw_amt).replace(",", "").replace("$", ""))
    except Exception:
        return False, "Couldn't parse the amount on that record."
    prev_raw = S.get("apex_order_raw")
    log = []
    try:
        ok = slc.bapi_add_payment(sess, tgt, {
            "amount": amt,
            "memo": rec.get("note") or "",
            "accounting_method": rec.get("type") or "payment",
            "payment_type": rec.get("pay_type") or "",
            "payment_date": str(rec.get("payment_date") or
                                datetime.now().date())[:10],
        }, log)
    finally:
        push_log(log)
        cur = S.get("apex_order_raw")
        if (cur is not None and slc._digits(str(cur.get("invoice_number") or ""))
                == sib_order["digits"]):
            _order_cache_store(sib_order["digits"], cur, cur.get("id") or oid)
            if prev_raw is not None:
                S["apex_order_raw"] = prev_raw
    return ok, (f"⇄ {sib_order['invoice']}: posted ${amt:,.2f} "
                f"{rec.get('type') or 'payment'} ✓" if ok
                else f"Post to {sib_order['invoice']} failed — see the push log.")


# ============================================================
# LOADING A PAIR INTO THE ENGINE SESSION
# ============================================================

def load_pair(order, manifest, force_live=False):
    """Put the chosen invoice + manifest into the exact session keys slc's
    comparison / payments / email code reads."""
    if (not force_live
            and slc._digits(S.get("selected_invoice", "")) == order["digits"]
            and str(S.get("selected_manifest_number", ""))
                == str(manifest.get("ManifestNumber", ""))
            and S.get("manifest_packages")):
        return True, ""

    S.pop("_pay_synced_for", None)

    ent_o = None if force_live else _order_cache_get(order["digits"])
    if ent_o:
        _apply_apex_order(ent_o["order"], ent_o.get("oid"), order["invoice"])
        S["_apex_cached_at"] = ent_o.get("fetched_at")
    else:
        deps.progress(f"📡 Fetching Apex order {order['invoice']} live…", 35)
        oid, o, err = fetch_apex_order(order["invoice"], order["digits"])
        if not o:
            return False, (err or f"No Apex order for {order['invoice']}.")
        _apply_apex_order(o, oid, order["invoice"])
        S.pop("_apex_cached_at", None)
        _order_cache_store(order["digits"], o, oid)

    ent = None if force_live else _pkg_cache_get(manifest)
    if ent:
        S.update({
            "manifest_packages": ent["mpkgs"],
            "raw_metrc_packages": ent.get("raw") or [],
            "total_manifest_weight": sum(p["quantity"] for p in ent["mpkgs"]),
            "selected_manifest_number": str(manifest.get("ManifestNumber", "")),
            "selected_manifest_invoice": (manifest.get("InvoiceNumber") or "").strip(),
            "selected_recipient": ent.get("recipient", ""),
            "selected_recipient_license": ent.get("recipient_license", ""),
            "metrc_source": "api",
        })
        S.pop("comparison_df", None)
    else:
        deps.progress("📦 Pulling manifest packages from METRC…", 65)
        ok2, msg2 = slc.load_metrc_from_manifest(manifest, autofill_apex=False)
        if not ok2:
            return False, msg2 or "Could not load manifest packages from METRC."
        _pkg_cache_store(manifest, S.get("manifest_packages"),
                         S.get("raw_metrc_packages"))
    deps.progress("⚖️ Comparing invoice vs manifest…", 88)
    slc.maybe_autocompare()
    return True, ""


def load_order_only(invoice, digits, force_live=False):
    """Load JUST the Apex order into the review session — no manifest.
    For Submitted / Accepted deal-flow orders that have no manifest yet:
    the panel opens with Order details + item editing live; the compare
    side stays empty until a manifest exists and is linked."""
    S.pop("_pay_synced_for", None)
    ent_o = None if force_live else _order_cache_get(digits)
    if ent_o:
        _apply_apex_order(ent_o["order"], ent_o.get("oid"), invoice)
        S["_apex_cached_at"] = ent_o.get("fetched_at")
    else:
        deps.progress(f"📡 Fetching Apex order {invoice} live…", 35)
        oid, o, err = fetch_apex_order(invoice, digits)
        if not o:
            return False, (err or f"No Apex order for {invoice}.")
        _apply_apex_order(o, oid, invoice)
        S.pop("_apex_cached_at", None)
        _order_cache_store(digits, o, oid)
    # blank the manifest side so nothing stale bleeds into the panel
    S.update({"manifest_packages": [], "raw_metrc_packages": [],
              "total_manifest_weight": 0.0, "selected_manifest_number": "",
              "selected_manifest_invoice": "", "selected_recipient": "",
              "selected_recipient_license": ""})
    for k in ("comparison_df", "_cmp_sig"):
        S.pop(k, None)
    return True, ""


DEALFLOW_FILE = os.path.join(DATA_DIR, "apex_dealflow_orders.json")


def _dealflow_parse(rows):
    """shipping-orders list → the three Submitted/Accepted/Finalized slims."""
    out = {"Submitted": [], "Accepted": [], "Finalized": []}
    for o in rows:
        if o.get("cancelled"):
            continue
        osd = o.get("order_status") or {}
        parent = (((osd.get("parent_order_status") or {}).get("name")
                   or osd.get("name") or "") if isinstance(osd, dict) else "")
        if parent not in out:
            continue
        # a cancel/void STAGE can sit under an active parent (same trap the
        # board sync guards against) — those aren't workable orders
        stage_l = ((osd.get("name") if isinstance(osd, dict) else "") or "").lower()
        if any(w in stage_l for w in ("cancel", "void")):
            continue
        inv = (o.get("invoiceNumber") or o.get("custom_invoice_number")
               or o.get("invoice_number") or str(o.get("id")))
        buyer = o.get("buyer") or {}
        try:
            total = float(o.get("total") or 0) / 100.0
        except (TypeError, ValueError):
            total = 0.0
        out[parent].append({
            "digits": slc._digits(str(inv or "")),
            "id": str(o.get("id") or ""),
            "invoice": inv,
            "buyer": (buyer.get("name", "?") if isinstance(buyer, dict) else "?"),
            "total": total,
            "stage": ((osd.get("name") if isinstance(osd, dict) else "")
                      or parent),
            "parent": parent,
            "items": len(o.get("items") or []),
            "delivery_date": str(o.get("delivery_date") or "")[:10],
        })
    for lst in out.values():
        lst.sort(key=lambda x: x["digits"], reverse=True)
    return out["Submitted"], out["Accepted"], out["Finalized"]


def save_dealflow_cache(sub, acc, fin):
    write_json(DEALFLOW_FILE, {
        "submitted": sub, "accepted": acc, "finalized": fin,
        "at": datetime.now().isoformat(timespec="seconds")})


def load_dealflow_cache():
    d = read_json(DEALFLOW_FILE, None)
    return d if isinstance(d, dict) and "submitted" in d else None


UNPAID_FILE = os.path.join(DATA_DIR, "apex_unpaid_vendors.json")


def load_unpaid_cache():
    d = read_json(UNPAID_FILE, None)
    return d if isinstance(d, dict) and "vendors" in d else None


def unpaid_delivered():
    """💰 Every order in the DELIVERED parent status with payment_status
    'unpaid', grouped per vendor with their invoices + best-known emails
    (order contact first, then the matched vendor contact list).

    SAVED to disk like every other cache (the panel loads instantly; ↻
    re-pulls live). Scoring: +1 invoice_linked per invoice NEWLY attached to
    a vendor by this scan — links already made by a previous refresh never
    re-score."""
    sess = _any_session()
    if not slc._session_ready(sess):
        return [], "Needs the 🔑 b-api session — grab it up top.", ""
    try:
        r = slc._HTTP.get(f"{slc.BAPI_BASE}/shipping-orders",
                          headers=slc._bapi_headers(sess), timeout=90)
    except Exception as e:
        return [], f"Apex list failed — {type(e).__name__}", ""
    if r.status_code != 200:
        return [], f"Apex list HTTP {r.status_code}", ""
    try:
        rows = r.json() or []
    except Exception:
        return [], "Apex list returned non-JSON.", ""

    try:
        clists = slc._load_contact_lists()
    except Exception:
        clists = {}

    vendors = {}
    for o in rows:
        if o.get("cancelled"):
            continue
        osd = o.get("order_status") or {}
        parent = (((osd.get("parent_order_status") or {}).get("name")
                   or osd.get("name") or "") if isinstance(osd, dict) else "")
        if parent != "Delivered":
            continue
        if str(o.get("payment_status") or "").lower() != "unpaid":
            continue
        inv = (o.get("invoiceNumber") or o.get("custom_invoice_number")
               or o.get("invoice_number") or str(o.get("id")))
        buyer = o.get("buyer") or {}
        bname = ((buyer.get("name") if isinstance(buyer, dict) else None)
                 or o.get("ship_name") or "?")
        try:
            due = float(o.get("payment_currently_due") or 0) / 100.0
        except (TypeError, ValueError):
            due = 0.0
        try:
            total = float(o.get("total") or 0) / 100.0
        except (TypeError, ValueError):
            total = 0.0

        ent = vendors.setdefault(bname, {
            "store": bname, "emails": [], "invoices": [], "due": 0.0})
        ent["invoices"].append({
            "id": str(o.get("id")), "digits": slc._digits(str(inv or "")),
            "invoice": inv, "due": due, "total": total,
            "date": str(o.get("delivery_date") or o.get("order_date") or "")[:10],
            "stage": ((osd.get("name") if isinstance(osd, dict) else "")
                      or parent),
        })
        ent["due"] += due

        # emails: the order's own contact + the matched vendor contact list
        seen = {e.lower() for e in ent["emails"]}
        for em in [o.get("buyer_contact_email")]:
            em = (em or "").strip()
            if em and em.lower() not in seen:
                ent["emails"].append(em)
                seen.add(em.lower())
        try:
            matched = slc._match_contact_list(
                clists, bname, o.get("ship_name", ""), o.get("ship_city", ""), "")
            for m in (clists.get(matched) or []):
                em = (m.get("email") or "").strip()
                if em and em.lower() not in seen:
                    ent["emails"].append(em)
                    seen.add(em.lower())
        except Exception:
            pass

    out = sorted(vendors.values(), key=lambda v: -v["due"])
    for v in out:
        v["invoices"].sort(key=lambda x: x["digits"], reverse=True)
        v["due"] = round(v["due"], 2)

    # +1 per invoice NEWLY linked to a vendor — the scan labor scores once
    # per link, ever (the linked set persists across refreshes)
    prev = load_unpaid_cache() or {}
    seen = set(prev.get("linked") or [])
    new_links = []
    for v in out:
        for iv in v["invoices"]:
            key = f"{iv['digits'] or iv['id']}|{v['store']}"
            if key not in seen:
                new_links.append((v["store"], iv["invoice"]))
                seen.add(key)
    at = datetime.now().isoformat(timespec="seconds")
    write_json(UNPAID_FILE, {"vendors": out, "linked": sorted(seen), "at": at})
    if new_links:
        from . import tasklog
        for store, inv in new_links:
            tasklog.log_task("invoice_linked", invoice=inv, detail=f"→ {store}")
    return out, "", at


def fetch_dealflow_order(dg):
    """(order | None, err) for a deal-flow order that may NOT be on the pack
    board: the banked Apex id + b-api read first (0 metered), then the
    bridge's normal order fetch as fallback."""
    sess = _any_session()
    cached = load_dealflow_cache() or {}
    oid = None
    for key in ("submitted", "accepted", "finalized"):
        for o in cached.get(key) or []:
            if o.get("digits") == dg and o.get("id"):
                oid = o["id"]
                break
        if oid:
            break
    if oid and sess:
        try:
            od = slc.bapi_fetch_invoice(sess, oid)
            if od:
                return od, ""
        except Exception:
            pass
    try:
        _oid, od, err = fetch_apex_order(f"Twiste-{dg}", dg)
        return od, (err or "")
    except Exception as ex:
        return None, f"{type(ex).__name__}"


def deal_flow_orders():
    """Orders sitting in Submitted / Accepted / Finalized parent statuses —
    the ones NOT on the pack board yet. Read off the b-api list (0 metered
    calls) and SAVED to disk like every other cache, so the section survives
    refreshes and reloads; 🧾 Refresh orders re-banks it too."""
    sess = _any_session()
    if not slc._session_ready(sess):
        return False, "Needs the 🔑 b-api session — grab it up top.", [], [], []
    try:
        r = slc._HTTP.get(f"{slc.BAPI_BASE}/shipping-orders",
                          headers=slc._bapi_headers(sess), timeout=90)
    except Exception as e:
        return False, f"Apex list failed — {type(e).__name__}", [], [], []
    if r.status_code != 200:
        return False, f"Apex list HTTP {r.status_code}", [], [], []
    try:
        rows = r.json() or []
    except Exception:
        return False, "Apex list returned non-JSON.", [], [], []
    sub, acc, fin = _dealflow_parse(rows)
    save_dealflow_cache(sub, acc, fin)
    return True, "", sub, acc, fin


# ============================================================
# BACKGROUND WARM — network refreshes OFF the click path
# ============================================================
# One daemon thread owns every periodic network refresh the board used to run
# inline: received-status checks, destination backfill, the active-outgoing
# pull, and a bulk b-api re-pull of all board orders (keeps the snapshots and
# review opens permanently warm). /api/board only ever reads local state now.

_BG = {"at": None, "received_marked": 0, "dest_filled": 0, "orders_warmed": 0}
_BG_INTERVAL_S = 480
_BG_STARTED = threading.Event()


def _bg_warm_once():
    orders = load_pack_orders()
    manifests = load_manifests()
    marked = refresh_received_status(manifests)
    active_ids, _at = refresh_active_ids()
    links = load_links()
    views = [manifest_view(m) for m in manifests]
    suggestions = auto_match(orders, manifests, links, views=views)
    edges = resolve(orders, manifests, links, suggestions,
                    load_verify_cache(), views=views)
    cards, _drawer = split_for_board(manifests, edges, active_ids)
    got = fill_destinations(cards)

    warmed = 0
    sess = _any_session()
    if sess:
        ids = {}
        for bo in orders:
            oid = bo.get("order_id") or _local_order_id(bo["digits"])
            if oid:
                ids[str(oid)] = bo["digits"]
        if ids:
            for fo in slc.bapi_bulk_fetch_invoices(sess, list(ids.keys()),
                                                   log=[]) or []:
                dg = ids.get(str(fo.get("id")))
                if dg and fo.get("id"):
                    _order_cache_store(dg, fo, fo.get("id"))
                    warmed += 1
    _BG.update(at=datetime.now().isoformat(timespec="seconds"),
               received_marked=marked, dest_filled=got, orders_warmed=warmed)


def start_background_warm():
    if _BG_STARTED.is_set():
        return
    _BG_STARTED.set()

    def run():
        time.sleep(5)          # let the server finish booting first
        while True:
            try:
                _bg_warm_once()
            except Exception:
                pass
            time.sleep(_BG_INTERVAL_S)

    threading.Thread(target=run, daemon=True).start()


# ============================================================
# BOARD SNAPSHOT — everything the frontend needs in one payload
# ============================================================

def board_payload(run_received_check=True):
    """run_received_check is kept for API compat but no longer does inline
    network work — the background warm loop owns those refreshes now."""
    orders = _auto_retire_completed(load_pack_orders())
    manifests = load_manifests()
    marked = _BG["received_marked"]

    active_ids, active_at = load_active_ids()
    if active_at is None:
        active_ids, active_at = refresh_active_ids()

    links = load_links()
    # One manifest_view pass reused by auto_match, resolve, and the payload
    # (it was recomputed 4× per board load).
    views = [manifest_view(m) for m in manifests]
    vmap = {v["id"]: v for v in views}
    suggestions = auto_match(orders, manifests, links, views=views)
    checks = load_verify_cache()
    edges = resolve(orders, manifests, links, suggestions, checks, views=views)
    cards, drawer = split_for_board(manifests, edges, active_ids)

    got = _BG["dest_filled"]   # backfill runs in the background warm loop

    o_by_dg = {x["digits"]: x for x in orders}
    m_by_id = {str(x.get("Id")): x for x in manifests}

    # Warm every linked pair whose verdict is missing or whose manifest changed
    pairs = []
    for e in edges:
        o = o_by_dg.get(e["invoice"])
        m = m_by_id.get(e["manifest_id"])
        if not o or not m:
            continue
        k = verify_key(o["digits"], e["manifest_id"])
        needs = (k not in checks or not _pkg_cache_get(m, copy_out=False))
        if needs and _PF_ATTEMPTED.get(k) != _pf_signature(m):
            _PF_ATTEMPTED[k] = _pf_signature(m)
            pairs.append((o, m, group_siblings(o, m, orders, edges)))
    maybe_start_prefetch(pairs)

    # Order snapshots off the order cache (prefetch keeps them warm)
    snaps = {}
    for o in orders:
        od = ((_order_cache_get(o["digits"], copy_out=False) or {}).get("order")) or {}
        t_ = od.get("term")
        s_ = od.get("order_status") or {}
        snaps[o["digits"]] = {
            "stage": (s_.get("name") if isinstance(s_, dict) else "") or "—",
            "terms": ((t_.get("name") if isinstance(t_, dict) else t_) or "—"),
            "delivery": str(od.get("delivery_date") or "—")[:10],
            "due": str(od.get("due_date") or "—")[:10],
        }

    e_by_inv = {e["invoice"]: e for e in edges}
    rank = {"match": 0, "mismatch": 1, "unknown": 2}
    orders = sorted(orders, key=lambda o: (
        rank.get((e_by_inv.get(o["digits"]) or {}).get("state"), 3),
        -(int(o["digits"]) if o["digits"].isdigit() else 0)))

    sess = S.get("bapi_session") or {}
    sess_ok = slc._session_ready(sess)
    sess_summary = slc._session_summary(sess) if sess_ok else None

    return {
        "orders": orders,
        "snapshots": snaps,
        "cards": [vmap[str(m.get("Id", ""))] for m in cards],
        "drawer": [vmap[str(m.get("Id", ""))] for m in drawer],
        "edges": edges,
        "counts": {
            "orders": len(orders),
            "manifests": len(manifests),
            "match": sum(1 for e in edges if e["state"] == "match"),
            "mismatch": sum(1 for e in edges if e["state"] == "mismatch"),
            "unknown": sum(1 for e in edges if e["state"] == "unknown"),
            "unlinked": len(orders) - len(edges),
            "received_marked": marked,
            "destinations_filled": got,
            "missing_dest": sum(1 for m in manifests
                                if slc.recipient_of(m)[0] in ("", "—")),
        },
        "active_at": active_at,
        "prefetch": prefetch_status(),
        "session": {"loaded": sess_ok, "summary": sess_summary},
    }
