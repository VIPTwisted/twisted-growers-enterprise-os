"""
Apex Trading - Planner Module (full-screen order board)
Plugs into app8.py:  from planner import render_planner
Test standalone:     streamlit run planner.py

Deal-flow auto-sync:
  * Pending Shipment (Order Packed + Scheduled)  -> auto-lands in READY
  * Invoice Finalized                            -> lives in Outstanding Orders
  * Delivered / complete / cancelled             -> never shown anywhere
The board has its own \U0001F504 Refresh (same incremental pull as app21's) so a
click re-syncs everything straight from Apex. Each ticket also has a
\U0001F6D2\U0001F6AB Out of Stock Items button that emails what's missing.
"""

import streamlit as st
import streamlit.components.v1 as components
import json, os, smtplib
from email.message import EmailMessage
from datetime import datetime, date, timedelta, timezone

# ============================================================================
# EMAIL NOTIFICATIONS (Gmail via app password, stored in .streamlit/secrets.toml)
# ============================================================================

def send_ready_email(ev: dict, all_ready: list = None) -> bool:
    """Fire a pick-up notice when an order flips prep -> ready, with the full
    ready board pictured beneath it. Never raises."""
    cfg = _load_email_config()
    if not cfg:
        _email_log("SKIPPED: couldn't find gmail_address / gmail_app_password "
                   "in st.secrets or in .streamlit/secrets.toml next to planner.py")
        return False
    gmail_addr, gmail_pass, to_addr = cfg

    invoice = (ev.get("label") or "").split(" - ")[0]
    company = ev.get("company", "") or "â€”"
    pickup  = ev.get("time") or "Not set"
    shipper = ev.get("shipper", "") or "TBD"
    note    = ev.get("note", "")
    stamp   = datetime.now().strftime("%A, %B %d Â· %I:%M %p")

    msg = EmailMessage()
    msg["Subject"] = f"\u2705 {invoice} is packed & ready for shipment"
    msg["From"] = f"Apex Order Board <{gmail_addr}>"
    msg["To"] = to_addr

    # Plain-text fallback (some clients / previews use this)
    msg.set_content(
        f"READY FOR SHIPMENT \u2705\n"
        f"\nInvoice:  {invoice}"
        f"\nCompany:  {company}"
        f"\nPick-up:  {pickup}"
        f"\nShipper:  {shipper}"
        + (f"\nNote:     {note}" if note else "")
        + f"\n\n\U0001F4E4 Ready for you to send the invoice to the customer."
        + _board_text(all_ready, ev)
        + f"\n\nMarked ready on the Apex Order Board \u00b7 {stamp}\n"
    )

    # Crispy HTML version
    note_row = (
        f'<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">\U0001F4DD Note</td>'
        f'<td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">{note}</td></tr>'
    ) if note else ""
    html = f"""\
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:24px auto;padding:0 12px;">
    <div style="background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.12);">
      <div style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:26px 28px;text-align:center;">
        <div style="font-size:38px;line-height:1;">\U0001F4E6\u2705</div>
        <div style="color:#ffffff;font-size:21px;font-weight:800;letter-spacing:2px;margin-top:8px;">READY FOR SHIPMENT</div>
        <div style="color:rgba(255,255,255,0.85);font-size:13px;font-weight:600;margin-top:4px;">Packed &amp; staged on the board</div>
      </div>
      <div style="padding:26px 28px 8px;">
        <div style="text-align:center;margin-bottom:18px;">
          <span style="display:inline-block;background:#f0fdf4;border:1.5px solid #86efac;color:#15803d;
                       font-size:17px;font-weight:800;padding:8px 20px;border-radius:999px;letter-spacing:0.5px;">
            \U0001F9FE {invoice}</span>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;">
          <tr><td style="padding:12px 0 6px;color:#64748b;font-size:13px;">\U0001F3E2 Company</td>
              <td style="padding:12px 0 6px;color:#0f172a;font-size:14px;font-weight:700;text-align:right;">{company}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">\U0001F552 Pick-up window</td>
              <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:700;text-align:right;">{pickup}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">\U0001F69A Shipper</td>
              <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:700;text-align:right;">{shipper}</td></tr>
          {_packed_in_row(ev)}
          {note_row}
        </table>
        <div style="margin:20px 0 22px;background:#fff7ed;border:1.5px solid #fdba74;border-radius:14px;padding:16px 18px;text-align:center;">
          <div style="font-size:15px;font-weight:800;color:#c2410c;">\U0001F4E4 Ready for you to send the invoice to the customer</div>
        </div>
        {_board_html(all_ready, ev)}
      </div>
      <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 28px;text-align:center;">
        <span style="color:#94a3b8;font-size:11.5px;font-weight:600;">\U0001F525 Apex Order Board \u00b7 marked ready {stamp}</span>
      </div>
    </div>
  </div>
</body></html>"""
    msg.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as s:
            s.login(gmail_addr, gmail_pass)
            s.send_message(msg)
        _email_log(f"SENT {invoice} -> {to_addr}")
        return True
    except Exception as e:
        _email_log(f"FAILED {invoice} -> {to_addr} :: {type(e).__name__}: {e}")
        return False  # never let a mail failure break the board


APEX_BASE = "https://app.apextrading.com/api/v1"

def _apex_headers():
    token = None
    try:
        token = st.secrets.get("apex_api_token")
    except Exception:
        pass
    if not token:
        _email_log("APEX SKIPPED: no apex_api_token in .streamlit/secrets.toml")
        return None
    return {"Authorization": f"Bearer {token}", "Accept": "application/json",
            "Content-Type": "application/json"}


def _apex_catalog():
    """Fetch and cache every order status (with its deal flow) once per session."""
    if "apex_status_catalog" in st.session_state:
        return st.session_state.apex_status_catalog
    catalog = []
    headers = _apex_headers()
    if not headers:
        st.session_state.apex_status_catalog = catalog
        return catalog
    try:
        from slc import _HTTP
        r = _HTTP.get(f"{APEX_BASE}/deal-flows", headers=headers,
                         params={"with_order_statuses": "true", "per_page": 100}, timeout=20)
        if r.status_code == 200:
            for df in r.json().get("dealflows", []):
                fname = str(df.get("name", ""))
                for s in (df.get("order_statuses") or df.get("statuses") or []):
                    catalog.append({"id": s.get("id"), "name": str(s.get("name", "")),
                                    "flow": fname})
        else:
            _email_log(f"APEX deal-flows lookup HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        _email_log(f"APEX deal-flows lookup failed: {type(e).__name__}: {e}")
    st.session_state.apex_status_catalog = catalog
    return catalog


def _apex_find_status(*keywords):
    """First order status whose name contains any keyword (checked in order)."""
    catalog = _apex_catalog()
    for kw in keywords:
        for s in catalog:
            if kw in s["name"].lower():
                return s
    if catalog:
        _email_log("APEX lookup: no status matching " + "/".join(keywords)
                   + ". Available: " + ", ".join(s["name"] for s in catalog)[:500])
    return None


def _apex_set_status(ev: dict, status: dict, why: str) -> bool:
    oid = ev.get("order_id")
    if not oid or not status:
        if oid:
            _email_log(f"APEX SKIPPED order {oid} ({why}): target status not found")
        return False
    headers = _apex_headers()
    if not headers:
        return False
    try:
        from slc import _HTTP
        r = _HTTP.patch(f"{APEX_BASE}/shipping-orders/{oid}", headers=headers,
                           json={"order_status_id": status["id"]}, timeout=20)
        if r.status_code in (200, 201):
            _email_log(f"APEX UPDATED order {oid} -> '{status['name']}' (id {status['id']}) [{why}]")
            return True
        _email_log(f"APEX FAILED order {oid} ({why}): HTTP {r.status_code} {r.text[:300]}")
    except Exception as e:
        _email_log(f"APEX FAILED order {oid} ({why}): {type(e).__name__}: {e}")
    return False


def update_apex_stage(ev: dict) -> bool:
    """READY: set Apex status to 'Order Packed | Pending Shipment'."""
    return _apex_set_status(ev, _apex_find_status("packed"), "ready")


def update_apex_stage_prep(ev: dict) -> bool:
    """Back to Prep: set Apex status to 'Invoice Finalized | Accepted'."""
    return _apex_set_status(ev, _apex_find_status("invoice finalized", "finalized"), "back-to-prep")


# â”€â”€ Deal-flow status tests (the strings app21 passes are parent statuses) â”€â”€â”€

_DONE_WORDS = ("delivered", "complete", "completed", "cancelled", "canceled", "void")

def _is_done_status(s: str) -> bool:
    """Delivered / complete / cancelled â€” finished orders. Never shown."""
    return any(w in s for w in _DONE_WORDS)

def _is_pending_shipment_status(s: str) -> bool:
    """The 'Order Packed + Scheduled / Pending Shipment' deal-flow stage."""
    return ("pending shipment" in s) or ("packed" in s and "scheduled" in s)

def _is_finalized_status(s: str) -> bool:
    """The 'Invoice Finalized | Accepted' deal-flow stage."""
    return ("finalized" in s) or ("accept" in s)


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# \U0001F504 BOARD REFRESH â€” the planner's own incremental Apex pull.
# Mirrors app21's Refresh button exactly: same shared cache / skip-list /
# sync-state files, same delta window, so both tabs stay in perfect lockstep.
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

DATA_CACHE_FILE = "apex_data_cache.json"     # shared with app21.py
SKIP_LIST_FILE = "apex_skip_list.json"       # delivered/complete orders to hide
SYNC_STATE_FILE = "apex_sync_state.json"     # last incremental sync time
ORDER_WINDOW_DAYS = 31
SYNC_OVERLAP_MINUTES = 15


def _load_skip_ids() -> set:
    try:
        with open(SKIP_LIST_FILE) as f:
            return set(json.load(f).get("skip_ids", []))
    except Exception:
        return set()


def _save_skip_ids(ids: set):
    try:
        with open(SKIP_LIST_FILE, "w") as f:
            json.dump({"skip_ids": list(ids),
                       "last_updated": datetime.now().isoformat(),
                       "count": len(ids)}, f, indent=2)
    except Exception:
        pass


def _refresh_start_iso() -> str:
    """Delta start: last sync minus a safety overlap, floored at the window."""
    floor = datetime.now(timezone.utc) - timedelta(days=ORDER_WINDOW_DAYS)
    start = floor
    try:
        with open(SYNC_STATE_FILE) as f:
            rawts = str(json.load(f).get("last_sync") or "")
        base = rawts.replace("Z", "").split(".")[0].strip()
        last = datetime.strptime(base, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        start = max(floor, last - timedelta(minutes=SYNC_OVERLAP_MINUTES))
    except Exception:
        pass
    return start.strftime("%Y-%m-%dT%H:%M:%SZ")


def _save_last_sync_now():
    try:
        with open(SYNC_STATE_FILE, "w") as f:
            json.dump({"last_sync": datetime.now(timezone.utc)
                       .strftime("%Y-%m-%dT%H:%M:%SZ")}, f)
    except Exception:
        pass


def _order_is_done(order: dict) -> bool:
    """Raw API order: is its status (or parent) delivered/complete/etc?"""
    st_obj = order.get("order_status") or {}
    name = parent = ""
    if isinstance(st_obj, dict):
        name = str(st_obj.get("name", "")).lower()
        p = st_obj.get("parent_status") or {}
        if isinstance(p, dict):
            parent = str(p.get("name", "")).lower()
    return any(w in name or w in parent for w in _DONE_WORDS)


def planner_refresh_from_apex() -> dict:
    """One click = fully in sync with Apex. Pulls every order updated since
    the last sync, skip-lists anything now delivered/complete (so it can NEVER
    sit in the Outstanding tray), and merges the rest into the shared session
    + cache used by the Orders & Picking tab. Returns a small result dict."""
    headers = _apex_headers()
    if not headers:
        return {"ok": False, "err": "no apex_api_token in secrets.toml"}
    try:
        from slc import _HTTP
    except Exception:
        return {"ok": False, "err": "requests not installed"}

    start = _refresh_start_iso()
    fresh, delivered_ids = [], []
    try:
        page, last_page = 1, 1
        while page <= last_page and page <= 40:
            r = _HTTP.get(f"{APEX_BASE}/shipping-orders", headers=headers,
                             params={"with_items": "true",
                                     "updated_at_from": start,
                                     "per_page": 100, "page": page}, timeout=30)
            if r.status_code != 200:
                _email_log(f"REFRESH FAILED: HTTP {r.status_code} {r.text[:200]}")
                return {"ok": False, "err": f"HTTP {r.status_code}"}
            body = r.json()
            meta = body.get("meta", {}) or {}
            try:
                last_page = int(meta.get("last_page", page) or page)
            except (TypeError, ValueError):
                last_page = page
            for o in body.get("orders", []) or []:
                if _order_is_done(o):
                    delivered_ids.append(o.get("id"))
                else:
                    fresh.append(o)
            page += 1
    except Exception as e:
        _email_log(f"REFRESH FAILED: {type(e).__name__}: {e}")
        return {"ok": False, "err": type(e).__name__}

    # Reconcile the skip list against what Apex says NOW, both directions:
    #   \u2022 an order that came BACK from Delivered (e.g. flipped to Finalized)
    #     is REVIVED â€” pulled off the skip list so it reappears in Outstanding
    #   \u2022 anything newly delivered/complete joins the skip list â€” gone
    skip = _load_skip_ids()
    revived = [o.get("id") for o in fresh if o.get("id") in skip]
    if revived:
        skip.difference_update(revived)
    if delivered_ids:
        skip.update(i for i in delivered_ids if i is not None)
    if revived or delivered_ids:
        _save_skip_ids(skip)

    # Merge fresh over current (session first, disk cache as fallback)
    cache = {}
    try:
        if os.path.exists(DATA_CACHE_FILE):
            with open(DATA_CACHE_FILE) as f:
                cache = json.load(f) or {}
    except Exception:
        cache = {}
    try:
        current = st.session_state.get("orders") or cache.get("orders") or []
    except Exception:
        current = cache.get("orders") or []
    by_id = {o.get("id"): o for o in current if o.get("id") not in skip}
    for o in fresh:
        oid = o.get("id")
        if oid in skip:
            by_id.pop(oid, None)
        else:
            by_id[oid] = o
    merged = list(by_id.values())

    # Push into the live session so BOTH tabs update on the next rerun
    try:
        st.session_state.orders = merged
        st.session_state.loading_complete = True
        st.session_state.pop("selected_orders", None)
        deal_flows = st.session_state.get("deal_flows") or cache.get("deal_flows") or []
    except Exception:
        deal_flows = cache.get("deal_flows") or []

    try:
        cache.update({
            "orders": merged,
            "deal_flows": deal_flows,
            "company": cache.get("company", {}),
            "last_updated": datetime.now().isoformat(),
            "order_count": len(merged),
            "orders_with_items": sum(1 for o in merged if o.get("items")),
            "total_pages": cache.get("total_pages", 0),
        })
        with open(DATA_CACHE_FILE, "w") as f:
            json.dump(cache, f, default=str)
    except Exception as e:
        _email_log(f"REFRESH cache write failed: {type(e).__name__}: {e}")
    _save_last_sync_now()
    _email_log(f"REFRESH OK: {len(fresh)} updated, {len(delivered_ids)} delivered skip-listed, "
               f"{len(revived)} revived from delivered")
    return {"ok": True, "fresh": len(fresh), "delivered": len(delivered_ids),
            "revived": len(revived)}


def _on_back_to_prep(ev: dict):
    """A ready order was pulled back to PREPARING: revert Apex, void the pack
    record from the stats, and restart the ready clock."""
    inv = (ev.get("label") or "").split(" - ")[0]
    if update_apex_stage_prep(ev):
        try:
            st.toast(f"\u21A9 Apex set back to Invoice Finalized for {inv}")
        except Exception:
            pass
    elif ev.get("order_id"):
        try:
            st.toast(f"\u26A0\uFE0F Apex revert for {inv} failed \u2014 see apex_email_log.txt")
        except Exception:
            pass
    # Void the timing record for the aborted ready â€” auto-exclude it
    try:
        rec_id = f"{ev.get('order_id') or 'x'}-{ev.get('ready_at')}"
        state = {"hit": False}
        def _mut(stats):
            for r in stats:
                if r.get("id") == rec_id and not r.get("excluded"):
                    r["excluded"] = True
                    state["hit"] = True
            return state["hit"]
        update_json(PACK_STATS_FILE, [], _mut)
        if state["hit"]:
            _email_log(f"PACKSTAT VOIDED {inv} (sent back to prep)")
    except Exception:
        pass
    # Clear stamps so the next READY records a fresh, full time
    ev.pop("ready_at", None)
    ev.pop("stat_recorded", None)


def _on_ready(ev: dict):
    """Everything that happens when an order lands in READY by user action:
    email notice + push the Apex deal flow to Order Packed + Scheduled."""
    _notify_and_toast(ev)
    inv = (ev.get("label") or "").split(" - ")[0]
    if update_apex_stage(ev):
        try:
            st.toast(f"\U0001F535 Apex deal flow updated for {inv}", icon="\u2705")
        except Exception:
            pass
    elif ev.get("order_id"):
        try:
            st.toast(f"\u26A0\uFE0F Apex update for {inv} failed \u2014 see apex_email_log.txt")
        except Exception:
            pass


def _collect_ready_events(data: dict) -> list:
    out = []
    for _mk, days in data.get("events", {}).items():
        for _dk, evs in days.items():
            for ev in evs:
                if ev.get("status") == "ready":
                    out.append(ev)
    out.sort(key=lambda e: (e.get("rank") if isinstance(e.get("rank"), (int, float)) else 10**6))
    return out


def send_ready_digest(ready_events: list, added_n: int) -> bool:
    """One styled email showing EVERY order currently in READY â€” sent when
    the auto-sync places new Packed+Scheduled orders on the board."""
    cfg = _load_email_config()
    if not cfg or not ready_events:
        return False
    gmail_addr, gmail_pass, to_addr = cfg
    stamp = datetime.now().strftime("%A, %B %d \u00b7 %I:%M %p")

    msg = EmailMessage()
    msg["Subject"] = f"\U0001F4E6 Ready board update \u2014 {len(ready_events)} order{'s' if len(ready_events)!=1 else ''} ready for shipment"
    msg["From"] = f"Apex Order Board <{gmail_addr}>"
    msg["To"] = to_addr

    lines = [f"READY BOARD UPDATE \u2014 {added_n} auto-placed, {len(ready_events)} total in READY\n"]
    for i, ev in enumerate(ready_events, 1):
        inv = (ev.get("label") or "").split(" - ")[0]
        lines.append(f"{i}. {inv} \u00b7 {ev.get('company','')} \u00b7 pick-up: {ev.get('time') or 'Not set'} \u00b7 shipper: {ev.get('shipper') or 'TBD'}")
    lines.append("\n\U0001F4E4 Ready for you to send the invoices to the customers.")
    msg.set_content("\n".join(lines))

    rows = ""
    for i, ev in enumerate(ready_events, 1):
        inv = (ev.get("label") or "").split(" - ")[0]
        auto = "auto" in str(ev.get("note", "")).lower()
        rows += f"""
      <div style="background:#ffffff;border:1.5px solid #e2e8f0;border-radius:14px;padding:14px 16px;margin-bottom:10px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="width:34px;vertical-align:top;">
            <div style="width:26px;height:26px;border-radius:50%;background:#16a34a;color:#fff;font-size:12px;font-weight:800;text-align:center;line-height:26px;">{i}</div></td>
          <td>
            <div style="font-size:15px;font-weight:800;color:#0f172a;font-family:'SF Mono',Menlo,Consolas,monospace;">\U0001F9FE {inv}
              {'<span style="font-size:10px;font-weight:800;color:#2563eb;background:#eff6ff;border:1px solid #bfdbfe;border-radius:999px;padding:1px 8px;margin-left:6px;">AUTO</span>' if auto else ''}</div>
            <div style="font-size:13px;font-weight:700;color:#334155;margin-top:2px;">\U0001F3E2 {ev.get('company','')}</div>
            <div style="font-size:12px;color:#64748b;margin-top:4px;">\U0001F552 {ev.get('time') or 'Pick-up not set'} &nbsp;\u00b7&nbsp; \U0001F69A {ev.get('shipper') or 'Shipper TBD'}</div>
          </td></tr></table>
      </div>"""

    html = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:24px auto;padding:0 12px;">
    <div style="background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.12);">
      <div style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:24px 28px;text-align:center;">
        <div style="font-size:36px;line-height:1;">\U0001F4E6\u2728</div>
        <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:2px;margin-top:8px;">READY BOARD UPDATE</div>
        <div style="color:rgba(255,255,255,0.9);font-size:13px;font-weight:700;margin-top:5px;">
          {added_n} new order{'s' if added_n!=1 else ''} auto-placed \u00b7 {len(ready_events)} total ready for shipment</div>
      </div>
      <div style="padding:22px 22px 6px;background:#f8fafc;">{rows}</div>
      <div style="margin:14px 22px 20px;background:#fff7ed;border:1.5px solid #fdba74;border-radius:14px;padding:15px 18px;text-align:center;">
        <div style="font-size:14.5px;font-weight:800;color:#c2410c;">\U0001F4E4 Ready for you to send the invoices to the customers</div>
      </div>
      <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:13px 28px;text-align:center;">
        <span style="color:#94a3b8;font-size:11.5px;font-weight:600;">\U0001F525 Apex Order Board \u00b7 {stamp}</span>
      </div>
    </div>
  </div>
</body></html>"""
    msg.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as s:
            s.login(gmail_addr, gmail_pass)
            s.send_message(msg)
        _email_log(f"DIGEST SENT ({len(ready_events)} ready, {added_n} auto-placed) -> {to_addr}")
        return True
    except Exception as e:
        _email_log(f"DIGEST FAILED :: {type(e).__name__}: {e}")
        return False


def send_cart_blocked_email(ev: dict, items_text: str) -> bool:
    """\U0001F6D2\U0001F6AB OUT OF STOCK ITEMS â€” fired from the button on a board
    ticket. Sends a styled out-of-stock notice (same crispy look as the
    ready notices) listing the items typed into the prompt. Never raises."""
    cfg = _load_email_config()
    if not cfg:
        _email_log("OUTOFSTOCK SKIPPED: couldn't find gmail_address / "
                   "gmail_app_password in st.secrets or secrets.toml")
        return False
    gmail_addr, gmail_pass, to_addr = cfg

    import re as _re
    from html import escape as _esc
    items = [p.strip() for p in _re.split(r"[,;\n]+", items_text or "") if p.strip()]
    if not items:
        items = ["(no items listed)"]
    n = len(items)

    invoice = (ev.get("label") or "").split(" - ")[0] or "Order"
    company = ev.get("company", "") or "\u2014"
    pickup  = ev.get("time") or "Not set"
    shipper = ev.get("shipper", "") or "TBD"
    who     = current_user() or "the packing team"
    stamp   = datetime.now().strftime("%A, %B %d \u00b7 %I:%M %p")

    msg = EmailMessage()
    msg["Subject"] = (f"\U0001F6D2\U0001F6AB {invoice} \u2014 "
                      f"{n} item{'s' if n != 1 else ''} OUT OF STOCK")
    msg["From"] = f"Apex Order Board <{gmail_addr}>"
    msg["To"] = to_addr

    # Plain-text fallback
    msg.set_content(
        f"OUT OF STOCK ITEMS \U0001F6D2\U0001F6AB\n"
        f"\nInvoice:  {invoice}"
        f"\nCompany:  {company}"
        f"\nPick-up:  {pickup}"
        f"\nShipper:  {shipper}"
        f"\nFlagged:  by {who}"
        + f"\n\n\U0001F6AB OUT OF STOCK \u2014 {n} item{'s' if n != 1 else ''}:\n"
        + "\n".join(f"  \u2715 {it}" for it in items)
        + f"\n\n\u26D4 Packing is paused on {invoice} until these items are "
          f"restocked, substituted, or pulled off the invoice."
        + f"\n\nFlagged on the Apex Order Board \u00b7 {stamp}\n"
    )

    # Crispy HTML version (matches the ready-notice styling, in red)
    item_rows = ""
    for i, it in enumerate(items, 1):
        item_rows += f"""
        <tr>
          <td style="padding:9px 12px;border-top:1px solid #fee2e2;width:28px;">
            <div style="width:21px;height:21px;border-radius:50%;background:#dc2626;color:#fff;font-size:11px;font-weight:800;text-align:center;line-height:21px;">\u2715</div></td>
          <td style="padding:9px 8px 9px 0;border-top:1px solid #fee2e2;">
            <span style="font-size:13.5px;font-weight:700;color:#7f1d1d;">{_esc(it)}</span></td>
        </tr>"""

    html = f"""\
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:24px auto;padding:0 12px;">
    <div style="background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.12);">
      <div style="background:linear-gradient(135deg,#ef4444,#b91c1c);padding:26px 28px;text-align:center;">
        <div style="font-size:38px;line-height:1;">\U0001F6D2\U0001F6AB</div>
        <div style="color:#ffffff;font-size:21px;font-weight:800;letter-spacing:2px;margin-top:8px;">OUT OF STOCK ITEMS</div>
        <div style="color:rgba(255,255,255,0.88);font-size:13px;font-weight:600;margin-top:4px;">These items are holding up this order</div>
      </div>
      <div style="padding:26px 28px 8px;">
        <div style="text-align:center;margin-bottom:18px;">
          <span style="display:inline-block;background:#fef2f2;border:1.5px solid #fca5a5;color:#b91c1c;
                       font-size:17px;font-weight:800;padding:8px 20px;border-radius:999px;letter-spacing:0.5px;">
            \U0001F9FE {invoice}</span>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;">
          <tr><td style="padding:12px 0 6px;color:#64748b;font-size:13px;">\U0001F3E2 Company</td>
              <td style="padding:12px 0 6px;color:#0f172a;font-size:14px;font-weight:700;text-align:right;">{company}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">\U0001F552 Pick-up window</td>
              <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:700;text-align:right;">{pickup}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">\U0001F69A Shipper</td>
              <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:700;text-align:right;">{shipper}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">\U0001F464 Flagged by</td>
              <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:700;text-align:right;">{who}</td></tr>
        </table>
        <div style="margin:18px 0 0;">
          <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#b91c1c;text-transform:uppercase;
                      padding-bottom:8px;text-align:center;">\U0001F6AB Out of stock \u00b7 {n} item{'s' if n != 1 else ''}</div>
          <div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:14px;overflow:hidden;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">{item_rows}</table>
          </div>
        </div>
        <div style="margin:20px 0 22px;background:#fff7ed;border:1.5px solid #fdba74;border-radius:14px;padding:16px 18px;text-align:center;">
          <div style="font-size:15px;font-weight:800;color:#c2410c;">\u26D4 Packing is paused until these are restocked, subbed, or pulled off the invoice</div>
        </div>
      </div>
      <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 28px;text-align:center;">
        <span style="color:#94a3b8;font-size:11.5px;font-weight:600;">\U0001F525 Apex Order Board \u00b7 flagged {stamp}</span>
      </div>
    </div>
  </div>
</body></html>"""
    msg.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as s:
            s.login(gmail_addr, gmail_pass)
            s.send_message(msg)
        _email_log(f"OUTOFSTOCK SENT {invoice} ({n} items) -> {to_addr}")
        return True
    except Exception as e:
        _email_log(f"OUTOFSTOCK FAILED {invoice} -> {to_addr} :: {type(e).__name__}: {e}")
        return False


PACK_STATS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "apex_pack_stats.json")
WORK_DAY_START, WORK_DAY_END = 8, 16   # packing team default: Mon-Fri 8am-4pm
_DAY_IDX = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}

def _work_window():
    """Shift window, overridable in .streamlit/secrets.toml:
       pack_day_start = 8        # hour, 0-23
       pack_day_end   = 16
       pack_days      = "mon-fri"   (e.g. "mon-sat", "mon-sun")"""
    ds, de, days = WORK_DAY_START, WORK_DAY_END, set(range(5))
    try:
        ds = int(st.secrets.get("pack_day_start", ds))
        de = int(st.secrets.get("pack_day_end", de))
        span = str(st.secrets.get("pack_days", "mon-fri")).lower().split("-")
        if len(span) == 2 and span[0][:3] in _DAY_IDX and span[1][:3] in _DAY_IDX:
            days = set(range(_DAY_IDX[span[0][:3]], _DAY_IDX[span[1][:3]] + 1))
    except Exception:
        pass
    return ds, de, days


def working_minutes(start_iso: str, end_iso: str) -> float:
    """Minutes between two timestamps counting ONLY shift hours (default
    Mon-Fri 8am-4pm), so nights/weekends don't pollute packing times."""
    try:
        start = datetime.fromisoformat(start_iso)
        end = datetime.fromisoformat(end_iso)
    except Exception:
        return 0.0
    if end <= start:
        return 0.0
    day_start, day_end, work_days = _work_window()
    total = 0.0
    d = start.date()
    while d <= end.date():
        if d.weekday() in work_days:
            midnight = datetime(d.year, d.month, d.day)
            ws = midnight + timedelta(hours=day_start)
            we = midnight + timedelta(hours=day_end)
            seg_s = max(start, ws)
            seg_e = min(end, we)
            if seg_e > seg_s:
                total += (seg_e - seg_s).total_seconds() / 60.0
        d += timedelta(days=1)
    return round(total, 1)


def _parse_total(ev: dict) -> float:
    import re
    m = re.search(r"\$([\d,]+(?:\.\d+)?)", ev.get("label") or "")
    if m:
        try:
            return float(m.group(1).replace(",", ""))
        except ValueError:
            pass
    return 0.0


def _parse_items(ev: dict) -> int:
    import re
    m = re.search(r"(\d+)\s*items", ev.get("note") or "")
    return int(m.group(1)) if m else 0


def _record_pack_stat(ev: dict):
    """Append a completed-pack record when an order with a prep timestamp
    lands in READY. Never raises."""
    try:
        start, end = ev.get("entered_prep_at"), ev.get("ready_at")
        if not end:
            return
        untimed = not start
        wm = 0.0 if untimed else working_minutes(start, end)
        wall = 0.0
        if not untimed:
            try:
                wall = round((datetime.fromisoformat(end) - datetime.fromisoformat(start)).total_seconds() / 60.0, 1)
            except Exception:
                pass
        rec = {
            "id": f"{ev.get('order_id') or 'x'}-{end}",
            "order_id": ev.get("order_id", ""),
            "invoice": (ev.get("label") or "").split(" - ")[0],
            "company": ev.get("company", ""),
            "total": _parse_total(ev),
            "items": _parse_items(ev),
            "shipper": ev.get("shipper", ""),
            "entered_prep_at": start or "",
            "untimed": untimed,
            "ready_at": end,
            "work_minutes": wm,
            "wall_minutes": wall,
            "packer": current_user(),
            "excluded": False,
        }
        def _mut(stats):
            if any(r.get("id") == rec["id"] for r in stats):
                return False
            stats.append(rec)
            return True
        update_json(PACK_STATS_FILE, [], _mut)
        _email_log(f"PACKSTAT {rec['invoice']}: {wm} work-min ({wall} wall-min)")
    except Exception as e:
        _email_log(f"PACKSTAT FAILED: {type(e).__name__}: {e}")


def _stamp_and_record_ready(ev: dict):
    """Set ready_at (once) and record the pack stat (once)."""
    now = datetime.now().isoformat(timespec="seconds")
    if not ev.get("ready_at"):
        ev["ready_at"] = now
    if not ev.get("stat_recorded"):
        _record_pack_stat(ev)
        ev["stat_recorded"] = True


def _stamp_prep(evs):
    """Give any un-stamped prep event its clock-start timestamp."""
    now = datetime.now().isoformat(timespec="seconds")
    for ev in evs:
        if ev.get("status", "prep") != "ready" and not ev.get("entered_prep_at"):
            ev["entered_prep_at"] = now


def _load_email_config():
    """Get (gmail_address, app_password, notify_email). Tries st.secrets first,
    then reads .streamlit/secrets.toml sitting next to planner.py â€” so email
    works even if the app was launched from a different directory."""
    # 1) Streamlit-managed secrets (works when launched from the project folder)
    try:
        addr = st.secrets["gmail_address"]
        pw   = str(st.secrets["gmail_app_password"]).replace(" ", "")
        to   = st.secrets.get("notify_email", "Vincent@TwistedGrowers.com")
        if addr and pw:
            return addr, pw, to
    except Exception:
        pass
    # 2) Direct read of the file next to this script
    path = os.path.join(BASE_DIR, ".streamlit", "secrets.toml")
    try:
        try:
            import tomllib
            with open(path, "rb") as f:
                s = tomllib.load(f)
        except ImportError:
            import toml
            s = toml.load(path)
        addr = s.get("gmail_address", "")
        pw   = str(s.get("gmail_app_password", "")).replace(" ", "")
        to   = s.get("notify_email", "Vincent@TwistedGrowers.com")
        if addr and pw:
            return addr, pw, to
    except Exception:
        pass
    return None


def _packed_in_row(ev: dict) -> str:
    s, e = ev.get("entered_prep_at"), ev.get("ready_at")
    if not s or not e:
        return ""
    wm = working_minutes(s, e)
    if wm <= 0:
        return ""
    disp = f"{int(wm//60)}h {int(wm%60)}m" if wm >= 60 else f"{int(wm)}m"
    return (f'<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">\u23F1 Packed in</td>'
            f'<td style="padding:6px 0;color:#16a34a;font-size:14px;font-weight:800;text-align:right;">{disp}'
            f' <span style="font-size:10px;color:#94a3b8;font-weight:600;">(working hrs)</span></td></tr>')


def _same_order(a: dict, b: dict) -> bool:
    if a.get("order_id") and b.get("order_id"):
        return str(a["order_id"]) == str(b["order_id"])
    return a.get("label") == b.get("label")


def _board_text(all_ready, hero) -> str:
    if not all_ready or len(all_ready) < 2:
        return ""
    lines = [f"\n\n\U0001F4CB THE FULL READY BOARD \u2014 {len(all_ready)} orders waiting:"]
    for i, ev in enumerate(all_ready, 1):
        inv = (ev.get("label") or "").split(" - ")[0]
        tag = "  <\u2014 NEW" if _same_order(ev, hero) else ""
        lines.append(f"  {i}. {inv} \u00b7 {ev.get('company','')} \u00b7 "
                     f"{ev.get('time') or 'pick-up not set'} \u00b7 {ev.get('shipper') or 'shipper TBD'}{tag}")
    return "\n".join(lines)


def _board_html(all_ready, hero) -> str:
    if not all_ready or len(all_ready) < 2:
        return ""
    rows = ""
    for i, ev in enumerate(all_ready, 1):
        inv = (ev.get("label") or "").split(" - ")[0]
        is_new = _same_order(ev, hero)
        rows += f"""
        <tr>
          <td style="padding:8px 10px;border-top:1px solid #e2e8f0;width:26px;">
            <div style="width:20px;height:20px;border-radius:50%;background:{'#16a34a' if is_new else '#cbd5e1'};color:#fff;font-size:10.5px;font-weight:800;text-align:center;line-height:20px;">{i}</div></td>
          <td style="padding:8px 6px;border-top:1px solid #e2e8f0;">
            <span style="font-size:12.5px;font-weight:800;color:#0f172a;font-family:'SF Mono',Menlo,Consolas,monospace;">{inv}</span>
            {'<span style="font-size:9px;font-weight:800;color:#16a34a;background:#f0fdf4;border:1px solid #86efac;border-radius:999px;padding:1px 7px;margin-left:5px;vertical-align:middle;">NEW</span>' if is_new else ''}
            <div style="font-size:11.5px;font-weight:600;color:#475569;">{ev.get('company','')}</div></td>
          <td style="padding:8px 10px;border-top:1px solid #e2e8f0;text-align:right;white-space:nowrap;">
            <div style="font-size:11.5px;font-weight:700;color:#334155;">\U0001F552 {ev.get('time') or 'Not set'}</div>
            <div style="font-size:11px;font-weight:600;color:#64748b;">\U0001F69A {ev.get('shipper') or 'TBD'}</div></td>
        </tr>"""
    return f"""
        <div style="margin:0 0 22px;">
          <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#64748b;text-transform:uppercase;
                      padding-bottom:8px;text-align:center;">\U0001F4CB The full ready board \u00b7 {len(all_ready)} orders waiting</div>
          <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">{rows}</table>
          </div>
        </div>"""


def _notify_and_toast(ev: dict):
    """Send the ready email (with the full board pictured) + on-screen feedback."""
    try:
        all_ready = _collect_ready_events(load_planner())
    except Exception:
        all_ready = None
    ok = send_ready_email(ev, all_ready)
    inv = (ev.get("label") or "").split(" - ")[0]
    try:
        if ok:
            st.toast(f"\U0001F4E7 Ready email sent for {inv}", icon="\u2705")
        else:
            st.toast(f"\u26A0\uFE0F Email for {inv} did not send \u2014 check apex_email_log.txt")
    except Exception:
        pass  # older Streamlit without st.toast


def _email_log(line: str):
    """Append actions/attempts to apex_email_log.txt so failures aren't invisible."""
    try:
        who = current_user()
        tag = f" [{who}]" if who else ""
        with open(EMAIL_LOG_FILE, "a") as f:
            f.write(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{tag}  {line}\n")
    except Exception:
        pass

# ============================================================================
# PERSISTENCE
# ============================================================================

# Anchor all files to this file's folder so it works no matter what
# directory the app is launched from.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PLANNER_FILE = os.path.join(BASE_DIR, "apex_planner.json")
EMAIL_LOG_FILE = os.path.join(BASE_DIR, "apex_email_log.txt")

try:
    from apex_core import read_json, write_json, update_json, current_user
except Exception:
    # fallback if apex_core.py is missing: unlocked but still atomic-ish
    def read_json(path, default):
        try:
            if os.path.exists(path):
                with open(path, "r") as f:
                    return json.load(f)
        except Exception:
            pass
        return default
    def write_json(path, data):
        tmp = path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, path)
    def update_json(path, default, mutate):
        data = read_json(path, default)
        if mutate(data) is not False:
            write_json(path, data)
        return data
    def current_user():
        return ""


def load_planner() -> dict:
    return read_json(PLANNER_FILE, {"events": {}})

def save_planner(data: dict):
    write_json(PLANNER_FILE, data)


def get_prep_order_ids() -> list:
    """Order IDs of every card currently sitting in the PREPARING column
    (status 'prep'). Used by the app to build one combined picking list for
    everything staged in prep. Order is preserved by rank then day."""
    data = load_planner()
    rows = []
    for _mk, days in data.get("events", {}).items():
        for dk, evs in days.items():
            for ev in evs:
                if (ev.get("status") or "prep") != "prep":
                    continue
                oid = ev.get("order_id")
                if oid:
                    rank = ev.get("rank")
                    rank = rank if isinstance(rank, (int, float)) else 10 ** 6
                    rows.append((rank, str(dk), str(oid)))
    rows.sort(key=lambda r: (r[0], r[1]))
    # de-dupe while preserving order
    seen, out = set(), []
    for _rank, _dk, oid in rows:
        if oid not in seen:
            seen.add(oid)
            out.append(oid)
    return out


import uuid as _uuid

def _new_uid() -> str:
    return _uuid.uuid4().hex[:12]

def ensure_uids(data: dict) -> bool:
    """Give every event a permanent unique id (multi-user safe targeting)."""
    changed = False
    for _mk, days in data.get("events", {}).items():
        for _dk, evs in days.items():
            for ev in evs:
                if not ev.get("uid"):
                    ev["uid"] = _new_uid()
                    changed = True
    return changed

def _uid_map(data: dict) -> dict:
    """uid -> (month_key, day_key, event dict)"""
    out = {}
    for mk, days in data.get("events", {}).items():
        for dk, evs in days.items():
            for ev in evs:
                if ev.get("uid"):
                    out[ev["uid"]] = (mk, dk, ev)
    return out

def _apply_add(data: dict, y: int, m: int, d: int, ev: dict) -> dict:
    """Append ONE event â€” never touches anything else (no clobbering)."""
    if not ev.get("uid"):
        ev["uid"] = _new_uid()
    ev.setdefault("created_by", current_user())
    _stamp_prep([ev])
    if ev.get("status") == "ready":
        _stamp_and_record_ready(ev)
    data.setdefault("events", {}).setdefault(f"{y}-{m:02d}", {}).setdefault(str(d), []).append(ev)
    return ev


def _apply_delete(data: dict, uid: str) -> bool:
    loc = _uid_map(data).get(uid)
    if not loc:
        return False
    mk, dk, ev = loc
    try:
        data["events"][mk][dk].remove(ev)
        if not data["events"][mk][dk]:
            data["events"][mk].pop(dk, None)
        return True
    except (KeyError, ValueError):
        return False


def _apply_board(data: dict, updates: list):
    """Apply per-event status/rank changes by uid. Returns
    (newly_ready, back_to_prep) event lists."""
    umap = _uid_map(data)
    newly_ready, back_to_prep = [], []
    for u in updates or []:
        loc = umap.get(u.get("uid"))
        if not loc:
            continue
        ev = loc[2]
        old_status = ev.get("status", "prep")
        new_status = u.get("status", "prep")
        if old_status != "ready" and new_status == "ready":
            newly_ready.append(ev)
        if old_status == "ready" and new_status != "ready":
            back_to_prep.append(ev)
        ev["status"] = new_status
        if new_status != "ready" and not ev.get("entered_prep_at"):
            ev["entered_prep_at"] = datetime.now().isoformat(timespec="seconds")
        if u.get("rank") is not None:
            ev["rank"] = u["rank"]
    for ev in newly_ready:
        _stamp_and_record_ready(ev)
        ev["readied_by"] = current_user()
    return newly_ready, back_to_prep


def _apply_edit(data: dict, uid: str, patch: dict = None, new_ymd=None):
    """Update one event's dispatch fields (shipper / time / etc.) in place, and
    optionally move it to a different day bucket if the pick-up date changed.
    Returns the event dict, or None if the uid wasn't found."""
    loc = _uid_map(data).get(uid)
    if not loc:
        return None
    mk, dk, ev = loc
    if patch:
        for k in ("shipper", "time", "company", "note"):
            if k in patch:
                ev[k] = patch[k]
    if new_ymd:
        y, m, d = new_ymd
        new_mk, new_dk = f"{y}-{m:02d}", str(d)
        if (new_mk, new_dk) != (mk, dk):
            try:
                data["events"][mk][dk].remove(ev)
                if not data["events"][mk][dk]:
                    data["events"][mk].pop(dk, None)
            except (KeyError, ValueError):
                pass
            data.setdefault("events", {}).setdefault(new_mk, {}).setdefault(new_dk, []).append(ev)
    return ev


def _demote_local_orders(orders_list, order_ids):
    """After sending cards back to Outstanding, drop the given orders' LOCAL
    status to Finalized/Accepted so the deal-flow auto-sync doesn't immediately
    re-add a still-'Pending Shipment' order to READY on this same render. The
    real Apex revert already fired; this just keeps the cached view in step
    until the next Refresh. Patches both the list used this pass and the raw
    session orders used on future passes."""
    ids = {str(i) for i in order_ids if i is not None}
    if not ids:
        return
    for o in (orders_list or []):
        if str(o.get("id")) in ids:
            o["status"] = "Accepted"
    try:
        raw = st.session_state.get("orders") or []
        for o in raw:
            if str(o.get("id")) in ids:
                o["order_status"] = {"name": "Invoice Finalized",
                                     "parent_status": {"name": "Accepted"}}
        st.session_state.orders = raw
    except Exception:
        pass


def filter_active_orders(orders_list: list) -> list:
    """Belt & braces: a delivered / completed / cancelled order must NEVER
    appear in the Outstanding Orders tray (or be considered for sync), even
    if one slips through an older cache. Hit \U0001F504 Refresh on the board to
    re-pull from Apex and clear out anything that has since shipped."""
    return [o for o in (orders_list or [])
            if not _is_done_status(str(o.get("status", "")).lower())]


def _purge_done_orders(data: dict) -> int:
    """Delivered / complete / cancelled orders are DONE â€” strip every card
    linked to them off the board. Driven by the shared
    skip list, which \U0001F504 Refresh keeps current, so hitting Refresh after a
    deal flow moves to Delivered wipes the order from the planner too.
    Returns how many cards were removed."""
    skip = _load_skip_ids()
    if not skip:
        return 0
    skip_str = {str(i) for i in skip}
    purged = 0
    for mk in list(data.get("events", {}).keys()):
        days = data["events"][mk]
        for dk in list(days.keys()):
            evs = days[dk]
            kept = []
            for ev in evs:
                oid = str(ev.get("order_id") or "")
                if oid and oid in skip_str:
                    purged += 1
                    inv = (ev.get("label") or "").split(" - ")[0]
                    _email_log(f"SYNC PURGED {inv}: order delivered/complete -> removed from planner")
                    continue
                kept.append(ev)
            if len(kept) != len(evs):
                days[dk] = kept
            if not days[dk]:
                days.pop(dk, None)
    return purged


def sync_board_with_apex(data: dict, orders_list: list):
    """Deal-flow driven auto-sync, BOTH directions:

      \u2022 PENDING SHIPMENT deal flow -> the order auto-lands in READY
        (unless it's already anywhere on the board, so user moves win).
      \u2022 FINALIZED deal flow -> the order belongs in the Outstanding
        Orders tray: any auto-added READY card whose order dropped back to
        Finalized on Apex is retired from the board, so it reappears in the
        tray. Cards a person placed or readied by hand are never touched.
      \u2022 DELIVERED / COMPLETE -> purged off the planner entirely (board
        and calendar) via the skip list, and filtered out of the tray (see
        filter_active_orders). Done orders never show anywhere.

    Returns (added, removed, purged). Saves the file when anything changed."""
    purged = _purge_done_orders(data)
    if not orders_list:
        if purged:
            save_planner(data)
        return 0, 0, purged

    status_by_id = {str(o.get("id")): str(o.get("status", "")).lower()
                    for o in orders_list if o.get("id")}

    # 1) Retire auto-added READY cards whose deal flow went back to Finalized.
    #    Human-readied cards (readied_by set) are always left alone.
    removed = 0
    for mk in list(data.get("events", {}).keys()):
        days = data["events"][mk]
        for dk in list(days.keys()):
            evs = days[dk]
            kept = []
            for ev in evs:
                oid = str(ev.get("order_id") or "")
                s = status_by_id.get(oid, "")
                if (oid and ev.get("status") == "ready"
                        and "auto-added" in str(ev.get("note", ""))
                        and not ev.get("readied_by")
                        and s and _is_finalized_status(s)
                        and not _is_pending_shipment_status(s)):
                    removed += 1
                    inv = (ev.get("label") or "").split(" - ")[0]
                    _email_log(f"SYNC RETIRED {inv}: Apex back to Finalized -> returned to Outstanding")
                    continue
                kept.append(ev)
            if len(kept) != len(evs):
                days[dk] = kept
            if not days[dk]:
                days.pop(dk, None)

    # 2) Auto-place every Pending Shipment order in READY.
    onboard = set()
    for _mk, days in data.get("events", {}).items():
        for _dk, evs in days.items():
            for ev in evs:
                oid = ev.get("order_id")
                if oid:
                    onboard.add(str(oid))
    added = 0
    t = date.today()
    mkey = f"{t.year}-{t.month:02d}"
    for o in orders_list:
        s = str(o.get("status", "")).lower()
        if not _is_pending_shipment_status(s):
            continue
        oid = str(o.get("id"))
        if not oid or oid in onboard:
            continue
        try:
            total = float(o.get("total") or 0)
        except (TypeError, ValueError):
            total = 0.0
        ev = {
            "type": "Pack Order",
            "label": f"{o.get('invoice_number') or ('#' + oid)} - {o.get('buyer_name', '')} (${total:.2f})",
            "note": f"{o.get('item_count', 0)} items \u00b7 {o.get('status', '')} \u00b7 auto-added",
            "company": o.get("buyer_name", ""),
            "shipper": "", "time": "",
            "order_id": oid, "status": "ready",
            "uid": _new_uid(),
        }
        data.setdefault("events", {}).setdefault(mkey, {}).setdefault(str(t.day), []).append(ev)
        onboard.add(oid)
        added += 1

    if added or removed or purged:
        save_planner(data)
    return added, removed, purged


def sync_ready_orders(data: dict, orders_list: list) -> bool:
    """Back-compat shim for anything still importing the old name."""
    added, _removed, _purged = sync_board_with_apex(data, orders_list)
    return added


def get_upcoming_days(data: dict, days_ahead: int = 14) -> list:
    """Build the Order Line feed: today + the next `days_ahead` days,
    pulling events across month boundaries. Always includes today and
    tomorrow (even if empty); other days only appear if they have events."""
    today = date.today()
    out = []
    for i in range(-7, days_ahead + 1):
        d = today + timedelta(days=i)
        month_evs = data.get("events", {}).get(f"{d.year}-{d.month:02d}", {})
        evs = month_evs.get(str(d.day), [])
        if (i < 0 or i > 1) and not evs:
            continue
        if i == 0:
            label = "TODAY"
        elif i == 1:
            label = "TOMORROW"
        else:
            label = f"{d.strftime('%a %b')} {d.day}".upper()
        out.append({
            "iso": d.isoformat(),
            "label": label,
            "sub": f"{d.strftime('%A, %B')} {d.day}",
            "year": d.year, "month": d.month, "day": d.day,
            "is_today": i == 0,
            "is_past": i < 0,
            "events": evs,
        })
    return out

# ============================================================================
# EVENT CONFIG
# ============================================================================

EVENT_TYPES = {
    "Scheduled Shipment": {"color": "#f97316", "icon": "\U0001F69B"},
    "Pack Order":         {"color": "#6366f1", "icon": "\U0001F4CB"},
}

# ============================================================================
# HTML GENERATOR
# ============================================================================

def generate_fullscreen_html(orders_list: list = None,
                              upcoming_days: list = None) -> str:

    etypes_json = json.dumps({k: v for k, v in EVENT_TYPES.items()})
    orders_json = json.dumps(orders_list or [])
    upcoming_json = json.dumps(upcoming_days or [])

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0;}}
html,body{{width:100%;height:100%;overflow:hidden;font-family:'Inter',-apple-system,sans-serif;
    background:linear-gradient(135deg,#0a0a0f 0%,#0f172a 50%,#0c1222 100%);color:#e2e8f0;}}
#app{{display:flex;flex-direction:column;width:100vw;height:100vh;overflow:hidden;}}

/* Topbar */
#topbar{{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;
    padding:10px 20px;background:linear-gradient(135deg,#0a0a0f,#0f172a);
    border-bottom:1px solid rgba(249,115,22,0.18);gap:10px;flex-wrap:wrap;}}
.board-title{{font-size:19px;font-weight:800;
    background:linear-gradient(90deg,#f97316,#fb923c);-webkit-background-clip:text;
    -webkit-text-fill-color:transparent;background-clip:text;}}

.metric-pill{{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);
    border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;color:#94a3b8;white-space:nowrap;}}
.metric-pill span{{color:#f97316;font-weight:800;}}

/* Board area wrapper */
#cal-area{{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;}}

/* â”€â”€ Shared popup form controls (used by the dispatch popup) â”€â”€ */
.m-label{{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;margin-top:12px;}}
.m-row{{display:flex;gap:6px;margin-bottom:6px;}}
.m-input{{width:100%;background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.1);
    border-radius:8px;color:#e2e8f0;padding:9px 12px;font-size:13px;font-family:inherit;
    outline:none;transition:border-color 0.18s;margin-bottom:6px;}}
.m-input:focus{{border-color:#f97316;box-shadow:0 0 0 2px rgba(249,115,22,0.18);}}
.m-input::placeholder{{color:#334155;}}
.m-save{{width:100%;background:linear-gradient(135deg,#f97316,#ea580c);border:none;
    border-radius:10px;color:#fff;padding:12px;font-size:14px;font-weight:700;
    cursor:pointer;font-family:inherit;margin-top:14px;transition:all 0.18s;
    box-shadow:0 4px 16px rgba(249,115,22,0.3);}}
.m-save:hover{{transform:translateY(-1px);box-shadow:0 6px 22px rgba(249,115,22,0.4);}}
.m-cancel{{width:100%;background:transparent;border:1px solid rgba(255,255,255,0.1);
    border-radius:10px;color:#64748b;padding:10px;font-size:13px;font-weight:600;
    cursor:pointer;font-family:inherit;margin-top:6px;transition:all 0.18s;}}
.m-cancel:hover{{border-color:rgba(255,255,255,0.2);color:#94a3b8;}}

/* â”€â”€ Dispatch popup (shipper + pick-up on drop) â”€â”€ */
#dispatch-backdrop{{display:none;position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
    z-index:7000;align-items:center;justify-content:center;}}
#dispatch-backdrop.open{{display:flex;}}
@keyframes dispIn{{0%{{transform:scale(0.85) translateY(14px);opacity:0;}}100%{{transform:scale(1) translateY(0);opacity:1;}}}}
#dispatch{{background:linear-gradient(145deg,#111827,#0f172a);border:1px solid rgba(249,115,22,0.3);
    border-radius:16px;width:400px;max-width:95vw;max-height:92vh;overflow-y:auto;padding:22px;
    box-shadow:0 24px 64px rgba(0,0,0,0.7);animation:dispIn 0.28s cubic-bezier(0.34,1.4,0.64,1);}}
#dispatch h3{{font-size:16px;font-weight:800;color:#f1f5f9;margin-bottom:3px;text-align:center;}}
#disp-order{{text-align:center;font-size:12.5px;font-weight:700;color:#fb923c;margin-bottom:12px;
    font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}}
.ship-chips{{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;}}
.ship-chip{{padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;
    border:1.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:#94a3b8;
    font-family:inherit;transition:all 0.15s;white-space:nowrap;}}
.ship-chip:hover{{border-color:rgba(249,115,22,0.5);color:#fb923c;}}
.ship-chip.active{{background:rgba(249,115,22,0.15);border-color:#f97316;color:#f97316;}}
.date-quick{{display:flex;gap:6px;margin-bottom:6px;}}
.dq-btn{{flex:1;padding:7px 6px;border-radius:9px;border:1.5px solid rgba(255,255,255,0.1);
    font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;transition:all 0.15s;
    background:rgba(255,255,255,0.04);color:#64748b;text-align:center;}}
.dq-btn.active{{background:rgba(249,115,22,0.15);border-color:#f97316;color:#f97316;}}
input[type=date].m-input{{color-scheme:dark;}}
.tq-btn{{flex:1;padding:8px 6px;border-radius:9px;border:1.5px solid rgba(255,255,255,0.1);
    font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;transition:all 0.15s;
    background:rgba(255,255,255,0.04);color:#64748b;text-align:center;white-space:nowrap;}}
.tq-btn.active{{background:rgba(249,115,22,0.15);border-color:#f97316;color:#f97316;}}
.ticket-time .t-big.t-label{{font-size:13px;line-height:1.2;white-space:normal;font-weight:800;}}
.dense .ticket-time .t-big.t-label{{font-size:11.5px;}}
.denser .ticket-time .t-big.t-label{{font-size:10.5px;}}

/* â”€â”€ STATUS BOARD (restaurant-style: PREPARING | READY) â”€â”€ */
#line-pane{{flex:1;display:none;flex-direction:column;overflow:hidden;min-height:0;}}
#board{{flex:1;display:flex;gap:14px;overflow:hidden;min-height:0;padding:14px 18px 18px;}}
.board-col{{flex:1;display:flex;flex-direction:column;min-height:0;min-width:0;border-radius:14px;
    background:linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0.01));
    border:1px solid rgba(255,255,255,0.07);overflow:hidden;transition:box-shadow 0.15s,border-color 0.15s;}}
.board-col.drag-over{{border-color:rgba(249,115,22,0.7);box-shadow:0 0 0 2px rgba(249,115,22,0.35),0 8px 30px rgba(249,115,22,0.12);}}
.board-col.ready-col.drag-over{{border-color:rgba(34,197,94,0.7);box-shadow:0 0 0 2px rgba(34,197,94,0.35),0 8px 30px rgba(34,197,94,0.12);}}
.board-banner{{flex-shrink:0;padding:13px 18px;display:flex;align-items:center;justify-content:space-between;}}
.prep-col .board-banner{{background:linear-gradient(135deg,#f97316,#ea580c);}}
.ready-col .board-banner{{background:linear-gradient(135deg,#22c55e,#16a34a);}}
.board-banner .b-title{{font-size:21px;font-weight:800;letter-spacing:5px;text-transform:uppercase;color:#fff;
    text-shadow:0 2px 6px rgba(0,0,0,0.35);}}
.board-banner .b-count{{font-size:13px;font-weight:800;background:rgba(0,0,0,0.28);color:#fff;
    border-radius:20px;padding:4px 13px;letter-spacing:0.5px;}}
.banner-right{{display:flex;align-items:center;gap:9px;}}
.master-sel{{background:rgba(0,0,0,0.28);border:1px solid rgba(255,255,255,0.4);color:#fff;
    font-size:12px;font-weight:800;border-radius:8px;padding:5px 12px;cursor:pointer;
    font-family:inherit;letter-spacing:0.3px;transition:all 0.15s;white-space:nowrap;}}
.master-sel:hover{{background:rgba(0,0,0,0.45);}}
.master-sel.on{{background:#fff;color:#ea580c;border-color:#fff;}}
/* Always-visible select circle on every card (Outlook-style multi-select) */
.sel-dot{{width:20px;height:20px;min-width:20px;border-radius:50%;
    border:2px solid rgba(255,255,255,0.4);background:rgba(15,23,42,0.6);color:#fff;
    font-size:11px;font-weight:900;line-height:1;cursor:pointer;padding:0;font-family:inherit;
    display:inline-flex;align-items:center;justify-content:center;transition:all 0.12s;flex-shrink:0;}}
.sel-dot:hover{{border-color:#f97316;background:rgba(249,115,22,0.2);}}
.ticket.selected>.ticket-top .sel-dot,.oorder.selected .sel-dot{{background:#f97316;border-color:#f97316;}}
.ticket.selected{{border-color:#f97316!important;box-shadow:0 0 0 2px #f97316,0 8px 26px rgba(0,0,0,0.5);}}
.oorder.selected{{border-color:#f97316!important;box-shadow:0 0 0 2px #f97316;}}
.oo-left{{display:flex;align-items:center;gap:7px;min-width:0;}}
.t-btn.edit-btn{{background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.4);color:#60a5fa;}}
.t-btn.edit-btn:hover{{background:rgba(59,130,246,0.22);}}
/* bulk action bar â€” docked ABOVE the Outstanding Orders tray (never floats
   over the cards). Collapsed to zero height until something is checked. */
#bulk-bar{{display:none;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center;
    flex-shrink:0;margin:0 18px 10px;padding:12px 16px;
    background:linear-gradient(145deg,#1b2436,#0f172a);
    border:1.5px solid rgba(249,115,22,0.5);border-radius:14px;
    box-shadow:0 8px 24px rgba(0,0,0,0.4);}}
#bulk-bar.show{{display:flex;}}
#bulk-count{{font-size:15px;font-weight:800;color:#fb923c;white-space:nowrap;padding:0 6px;}}
.bulk-grp{{display:flex;align-items:center;gap:6px;padding:0 8px;border-left:1px solid rgba(255,255,255,0.12);}}
.bulk-lbl{{font-size:16px;margin-right:3px;opacity:0.85;}}
.bchip{{background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.16);color:#e2e8f0;
    border-radius:9px;padding:9px 14px;font-size:13.5px;font-weight:700;cursor:pointer;
    font-family:inherit;transition:all 0.12s;white-space:nowrap;}}
.bchip:hover{{color:#fff;border-color:rgba(249,115,22,0.6);background:rgba(249,115,22,0.1);}}
.bchip.on{{background:rgba(249,115,22,0.22);border-color:#f97316;color:#fb923c;}}
.bulk-otherinput{{width:120px;background:rgba(15,23,42,0.8);border:1.5px solid rgba(255,255,255,0.16);
    border-radius:9px;color:#e2e8f0;padding:9px 11px;font-size:13.5px;font-family:inherit;outline:none;}}
.bulk-otherinput:focus{{border-color:#f97316;}}
.bulk-date{{background:rgba(15,23,42,0.8);border:1.5px solid rgba(255,255,255,0.16);border-radius:9px;
    color:#e2e8f0;padding:8px 9px;font-size:13px;font-family:inherit;color-scheme:dark;cursor:pointer;}}
.bulk-act{{background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.16);color:#e2e8f0;
    border-radius:10px;padding:11px 16px;font-size:14px;font-weight:800;cursor:pointer;
    font-family:inherit;transition:all 0.15s;white-space:nowrap;}}
.bulk-act:hover{{color:#fff;border-color:rgba(255,255,255,0.34);}}
.bulk-act.confirm{{background:linear-gradient(135deg,#f97316,#ea580c);border-color:#f97316;color:#fff;}}
.bulk-act.confirm:hover{{box-shadow:0 4px 16px rgba(249,115,22,0.45);}}
.bulk-act.prep{{background:rgba(249,115,22,0.14);border-color:rgba(249,115,22,0.5);color:#fb923c;}}
.bulk-act.prep:hover{{background:rgba(249,115,22,0.24);}}
.bulk-act.ready{{background:rgba(34,197,94,0.14);border-color:rgba(34,197,94,0.5);color:#4ade80;}}
.bulk-act.ready:hover{{background:rgba(34,197,94,0.26);}}
.board-cards{{flex:1;overflow-y:auto;padding:12px;min-height:0;
    display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:11px;align-content:start;}}
.board-cards.dense{{grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:9px;padding:10px;}}
.board-cards.denser{{grid-template-columns:repeat(auto-fill,minmax(212px,1fr));gap:7px;padding:8px;}}
.board-col{{transition:flex-grow 0.5s cubic-bezier(0.22,1,0.36,1);min-width:330px;}}

/* Density: shrink cards but keep every detail visible */
.dense .ticket-top{{padding:5px 10px;font-size:9px;}}
.dense .ticket-body{{padding:8px 10px 9px;}}
.dense .ticket-co{{font-size:15px;}}
.dense .ticket-inv{{font-size:11.5px;margin-bottom:6px;}}
.dense .ticket-grid{{margin-bottom:6px;gap:6px;}}
.dense .ticket-time,.dense .ticket-ship{{padding:5px 8px;}}
.dense .ticket-time .t-big{{font-size:15px;}}
.dense .ticket-ship .s-val{{font-size:12px;}}
.dense .ticket-note{{font-size:10.5px;margin-bottom:6px;}}
.dense .t-btn{{padding:4px 8px;font-size:10px;}}
.dense .date-chip{{font-size:9px;padding:1px 7px;}}
.denser .ticket-top{{padding:4px 8px;font-size:8.5px;}}
.denser .ticket-body{{padding:6px 9px 8px;}}
.denser .ticket-co{{font-size:13.5px;gap:5px;}}
.denser .ticket-inv{{font-size:10.5px;margin-bottom:5px;}}
.denser .ticket-grid{{margin-bottom:5px;gap:5px;}}
.denser .ticket-time,.denser .ticket-ship{{padding:4px 7px;}}
.denser .ticket-time .t-big{{font-size:13px;}}
.denser .ticket-time .t-cap,.denser .ticket-ship .s-cap{{font-size:8px;}}
.denser .ticket-ship .s-val{{font-size:11px;}}
.denser .ticket-note{{font-size:10px;margin-bottom:5px;}}
.denser .t-btn{{padding:3px 7px;font-size:9.5px;}}
.denser .rank-chip{{font-size:10px;padding:0 6px;}}
.denser .date-chip{{font-size:8.5px;padding:1px 6px;}}

/* Satisfying motion */
@keyframes popIn{{0%{{transform:scale(0.55);opacity:0;}}55%{{transform:scale(1.06);opacity:1;}}80%{{transform:scale(0.985);}}100%{{transform:scale(1);opacity:1;}}}}
.ticket.just-in{{animation:popIn 0.5s cubic-bezier(0.34,1.56,0.64,1);}}
@keyframes colFlash{{0%{{box-shadow:0 0 0 0 rgba(249,115,22,0.55);}}100%{{box-shadow:0 0 0 22px rgba(249,115,22,0);}}}}
.board-col.flash{{animation:colFlash 0.65s ease-out;}}
@keyframes colFlashGreen{{0%{{box-shadow:0 0 0 0 rgba(34,197,94,0.55);}}100%{{box-shadow:0 0 0 22px rgba(34,197,94,0);}}}}
.board-col.ready-col.flash{{animation:colFlashGreen 0.65s ease-out;}}
@keyframes countBump{{0%{{transform:scale(1);}}45%{{transform:scale(1.45);}}100%{{transform:scale(1);}}}}
.b-count.bump{{animation:countBump 0.45s cubic-bezier(0.34,1.56,0.64,1);}}
.board-empty{{grid-column:1/-1;min-height:180px;}}

/* Ticket card */
.ticket{{background:linear-gradient(160deg,#161d2e,#111827);border:1px solid rgba(255,255,255,0.08);
    border-radius:13px;overflow:hidden;flex-shrink:0;transition:transform 0.12s,box-shadow 0.12s,border-color 0.12s,opacity 0.12s;
    position:relative;cursor:grab;}}
.ticket:active{{cursor:grabbing;}}
.ticket:hover{{transform:translateY(-2px);box-shadow:0 8px 26px rgba(0,0,0,0.5);border-color:rgba(249,115,22,0.45);}}
.ready-col .ticket:hover{{border-color:rgba(34,197,94,0.5);}}
.ticket.dragging{{opacity:0.35;transform:scale(0.98);}}
.ticket.drop-before{{box-shadow:0 -3px 0 0 #f97316, 0 8px 26px rgba(0,0,0,0.5);}}
.ready-col .ticket.drop-before{{box-shadow:0 -3px 0 0 #22c55e, 0 8px 26px rgba(0,0,0,0.5);}}
.ticket-top{{display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:10px;font-weight:800;
    text-transform:uppercase;letter-spacing:1px;}}
.rank-chip{{font-size:11px;font-weight:800;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.18);
    color:#fff;border-radius:7px;padding:1px 8px;letter-spacing:0;}}
.late-chip{{font-size:9px;font-weight:800;background:rgba(239,68,68,0.2);border:1px solid #ef4444;color:#f87171;
    border-radius:20px;padding:1px 8px;letter-spacing:1px;}}
.ticket-top .t-spacer{{flex:1;}}
.ticket-del{{background:transparent;border:none;color:inherit;opacity:0.55;font-size:13px;
    cursor:pointer;padding:0 2px;line-height:1;font-family:inherit;}}
.ticket-del:hover{{opacity:1;}}
.ticket-body{{padding:11px 14px 12px;}}
.ticket-co{{font-size:19px;font-weight:800;color:#f1f5f9;line-height:1.15;margin-bottom:2px;
    display:flex;align-items:center;gap:8px;flex-wrap:wrap;}}
.date-chip{{font-size:10px;font-weight:800;letter-spacing:0.8px;color:#94a3b8;background:rgba(255,255,255,0.06);
    border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:2px 9px;text-transform:uppercase;}}
.ticket-inv{{font-size:12.5px;font-weight:600;color:#94a3b8;
    font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;margin-bottom:9px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}}
.ticket-grid{{display:flex;gap:8px;margin-bottom:8px;}}
.ticket-time{{flex:1;display:flex;flex-direction:column;gap:2px;padding:7px 10px;border-radius:9px;
    background:rgba(249,115,22,0.08);border:1px dashed rgba(249,115,22,0.3);min-width:0;}}
.ready-col .ticket-time{{background:rgba(34,197,94,0.08);border-color:rgba(34,197,94,0.3);}}
.ticket-time .t-big{{font-size:19px;font-weight:800;color:#fb923c;line-height:1;white-space:nowrap;}}
.ready-col .ticket-time .t-big{{color:#4ade80;}}
.ticket-time .t-cap{{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#9a5b2b;}}
.ready-col .ticket-time .t-cap{{color:#3f7a52;}}
.ticket-time.no-time .t-big{{font-size:13px;color:#64748b;font-weight:700;}}
.ticket-ship{{flex:1;display:flex;flex-direction:column;gap:2px;padding:7px 10px;border-radius:9px;
    background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);min-width:0;}}
.ticket-ship .s-cap{{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#475569;}}
.ticket-ship .s-val{{font-size:13.5px;font-weight:700;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}}
.ticket-note{{font-size:11.5px;color:#64748b;margin-bottom:8px;line-height:1.45;}}
.ticket-actions{{display:flex;gap:6px;align-items:center;}}
.t-btn{{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;
    border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;
    font-family:inherit;transition:all 0.15s;line-height:1;}}
.t-btn:hover{{color:#e2e8f0;border-color:rgba(255,255,255,0.25);}}
.t-btn.move-ready{{margin-left:auto;background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.4);color:#4ade80;}}
.t-btn.move-ready:hover{{background:rgba(34,197,94,0.22);}}
.t-btn.move-prep{{margin-left:auto;background:rgba(249,115,22,0.12);border-color:rgba(249,115,22,0.4);color:#fb923c;}}
.t-btn.move-prep:hover{{background:rgba(249,115,22,0.22);}}
.t-btn.remind{{margin-left:auto;background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.4);color:#60a5fa;}}
.t-btn.remind:hover{{background:rgba(59,130,246,0.22);}}
.t-btn.remind + .t-btn.move-prep{{margin-left:0;}}
.t-btn.cart-block{{margin-left:auto;background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.4);color:#f87171;}}
.t-btn.cart-block:hover{{background:rgba(239,68,68,0.22);}}
.t-btn.cart-block ~ .t-btn.move-ready,.t-btn.cart-block ~ .t-btn.remind{{margin-left:0;}}
.board-empty{{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
    color:#334155;font-size:13px;font-weight:600;gap:10px;padding:30px;text-align:center;}}
.board-empty .be-icon{{font-size:36px;opacity:0.5;}}

/* â”€â”€ OUTSTANDING ORDERS tray â”€â”€ */
#tray{{flex-shrink:0;display:flex;flex-direction:column;margin:0 18px 16px;border-radius:14px;
    background:linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0.01));
    border:1px solid rgba(255,255,255,0.07);overflow:hidden;max-height:236px;
    transition:box-shadow 0.15s,border-color 0.15s;}}
#tray.drag-over{{border-color:rgba(148,163,184,0.85)!important;
    box-shadow:0 0 0 2px rgba(148,163,184,0.45),0 8px 30px rgba(0,0,0,0.35);}}
.tray-banner{{flex-shrink:0;padding:10px 18px;display:flex;align-items:center;justify-content:space-between;
    background:linear-gradient(135deg,#334155,#1e293b);}}
.tray-banner .b-title{{font-size:15px;font-weight:800;letter-spacing:3.5px;text-transform:uppercase;color:#e2e8f0;
    text-shadow:0 2px 6px rgba(0,0,0,0.35);}}
.tray-banner .b-hint{{font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:0.3px;}}
.tray-banner .b-count{{font-size:12px;font-weight:800;background:rgba(0,0,0,0.3);color:#e2e8f0;
    border-radius:20px;padding:3px 11px;}}
.tray-right{{display:flex;align-items:center;gap:10px;}}
.tray-refresh{{background:rgba(59,130,246,0.14);border:1px solid rgba(59,130,246,0.5);color:#93c5fd;
    font-size:11.5px;font-weight:800;border-radius:9px;padding:5px 13px;cursor:pointer;
    font-family:inherit;letter-spacing:0.5px;transition:all 0.15s;line-height:1.2;white-space:nowrap;}}
.tray-refresh:hover{{background:rgba(59,130,246,0.28);transform:translateY(-1px);}}
.tray-refresh:active{{transform:translateY(0);}}
.tray-cards{{flex:1;display:flex;gap:10px;overflow-x:auto;overflow-y:hidden;padding:12px;min-height:0;align-items:stretch;}}
.oorder{{flex:0 0 265px;background:linear-gradient(160deg,#161d2e,#111827);
    border:1px solid rgba(255,255,255,0.09);border-radius:12px;padding:12px 14px;cursor:grab;
    display:flex;flex-direction:column;gap:7px;transition:transform 0.12s,box-shadow 0.12s,border-color 0.12s,opacity 0.12s;}}
.oorder:active{{cursor:grabbing;}}
.oorder:hover{{transform:translateY(-2px);border-color:rgba(249,115,22,0.5);box-shadow:0 6px 20px rgba(0,0,0,0.45);}}
.oorder.dragging{{opacity:0.35;transform:scale(0.97);}}
.oo-top{{display:flex;align-items:center;justify-content:space-between;gap:8px;}}
.oo-inv{{font-size:11.5px;font-weight:700;color:#94a3b8;
    font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}}
.oo-total{{font-size:14px;font-weight:800;color:#fb923c;white-space:nowrap;}}
.oo-buyer{{font-size:14px;font-weight:800;color:#f1f5f9;line-height:1.32;min-height:37px;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;}}
.oo-meta{{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;}}
.oo-status{{font-size:10px;font-weight:700;color:#cbd5e1;background:rgba(255,255,255,0.05);
    border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:2px 8px;white-space:nowrap;
    overflow:hidden;text-overflow:ellipsis;}}
.oo-items{{font-size:11px;font-weight:700;color:#94a3b8;white-space:nowrap;}}
.oo-add{{background:rgba(249,115,22,0.12);border:1px solid rgba(249,115,22,0.4);color:#fb923c;
    border-radius:8px;padding:4px 9px;font-size:10.5px;font-weight:800;cursor:pointer;
    font-family:inherit;transition:all 0.15s;line-height:1;white-space:nowrap;}}
.oo-add:hover{{background:rgba(249,115,22,0.24);}}
.tray-empty{{flex:1;display:flex;align-items:center;justify-content:center;gap:10px;
    color:#334155;font-size:12.5px;font-weight:600;padding:18px;text-align:center;}}

::-webkit-scrollbar{{width:6px;height:6px;}}
::-webkit-scrollbar-track{{background:#0f172a;}}
::-webkit-scrollbar-thumb{{background:#334155;border-radius:3px;}}
</style>
</head>
<body>
<div id="app">
  <div id="topbar">
    <span class="board-title">&#x1F4CB; Order Board</span>
    <div class="metric-pill" title="planner build" style="border-color:rgba(34,197,94,0.4);color:#4ade80;">&#9881; v23</div>
  </div>

  <div id="cal-area">
    <div id="line-pane" style="display:flex">
      <div id="board">
        <div class="board-col prep-col" data-status="prep">
          <div class="board-banner"><span class="b-title">&#x1F525; Preparing</span>
            <span class="banner-right">
              <button class="master-sel" id="masterSel" onclick="masterToggle()" title="Select all preparing / clear the whole selection">&#9745; Select</button>
              <span class="b-count" id="prepCount">0</span>
            </span></div>
          <div class="board-cards" id="prepCards"></div>
        </div>
        <div class="board-col ready-col" data-status="ready">
          <div class="board-banner"><span class="b-title">&#x2705; Ready</span><span class="b-count" id="readyCount">0</span></div>
          <div class="board-cards" id="readyCards"></div>
        </div>
      </div>
      <!-- Bulk action bar â€” docked here, ABOVE the tray, so it never covers
           the order cards. All toggles inline (no popup). -->
      <div id="bulk-bar">
        <span id="bulk-count">0 selected</span>
        <div class="bulk-grp"><span class="bulk-lbl">&#x1F69A;</span>
          <button class="bchip" data-k="ship" data-v="Blossom" onclick="bChip(this)">Blossom</button>
          <button class="bchip" data-k="ship" data-v="MMM" onclick="bChip(this)">MMM</button>
          <button class="bchip" data-k="ship" data-v="YPG" onclick="bChip(this)">YPG</button>
          <button class="bchip" data-k="ship" data-v="Other" onclick="bChip(this)">Other</button>
          <input id="bulkShipOther" class="bulk-otherinput" placeholder="shipper&hellip;" style="display:none;" oninput="bStage.ship=this.value.trim();">
        </div>
        <div class="bulk-grp"><span class="bulk-lbl">&#x1F4C5;</span>
          <button class="bchip" data-k="date" data-v="0" onclick="bChip(this)">Today</button>
          <button class="bchip" data-k="date" data-v="1" onclick="bChip(this)">Tmrw</button>
          <button class="bchip" data-k="date" data-v="2" onclick="bChip(this)">+2</button>
          <input id="bulkDate" type="date" class="bulk-date" onchange="bStageDate(this.value)">
        </div>
        <div class="bulk-grp"><span class="bulk-lbl">&#x1F552;</span>
          <button class="bchip" data-k="time" data-v="Early Morning" onclick="bChip(this)">Early</button>
          <button class="bchip" data-k="time" data-v="After 10 AM" onclick="bChip(this)">10 AM</button>
          <button class="bchip" data-k="time" data-v="Afternoon 2-3 PM" onclick="bChip(this)">2&ndash;3</button>
        </div>
        <button class="bulk-act confirm" onclick="bulkConfirm()">&#x2705; Confirm</button>
        <button class="bulk-act prep" onclick="bulkMovePrep()">&#8594; Preparing</button>
        <button class="bulk-act ready" onclick="bulkMoveReady()">&#8594; Ready</button>
        <button class="bulk-act" onclick="clearSel()">&#10005; Clear</button>
      </div>

      <div id="tray">
        <div class="tray-banner">
          <span class="b-title">&#x1F4E6; Outstanding Orders</span>
          <span class="b-hint">Drag an order onto the board to prep it â€” or drag a board card back here to send its deal flow to Finalized</span>
          <span class="tray-right">
            <span class="b-count" id="trayCount">0</span>
            <button class="tray-refresh" onclick="plannerRefresh(event)"
              title="Sync with Apex now â€” Pending Shipment lands in READY, Finalized returns here, delivered orders drop out">&#x1F504; Refresh</button>
          </span>
        </div>
        <div class="tray-cards" id="trayCards"></div>
      </div>
    </div>
  </div>

  <!-- Dispatch popup: shipper + pick-up when dragging an order in -->
  <div id="dispatch-backdrop" onclick="if(event.target===this)cancelDispatch();">
    <div id="dispatch">
      <h3 id="disp-title">&#x1F69A; Dispatch Details</h3>
      <div id="disp-order"></div>
      <div class="m-label">Shipper / Carrier</div>
      <div class="ship-chips" id="shipChips">
        <button class="ship-chip" data-ship="Blossom" onclick="pickShip(this)">Blossom</button>
        <button class="ship-chip" data-ship="MMM" onclick="pickShip(this)">MMM</button>
        <button class="ship-chip" data-ship="YPG" onclick="pickShip(this)">YPG</button>
        <button class="ship-chip" data-ship="Other" onclick="pickShip(this)">Other</button>
      </div>
      <input class="m-input" id="dShipper" type="text" placeholder="Type shipper name..." style="display:none;">
      <div class="m-label">Pick-Up Date</div>
      <div class="date-quick">
        <button class="dq-btn active" data-off="0" onclick="dqPick(this)">Today</button>
        <button class="dq-btn" data-off="1" onclick="dqPick(this)">Tomorrow</button>
        <button class="dq-btn" data-off="2" onclick="dqPick(this)">+2 Days</button>
      </div>
      <input class="m-input" id="dDate" type="date">
      <div class="m-label">Pick-Up Time Estimate</div>
      <div class="date-quick" id="dTimeSlots">
        <button class="tq-btn" data-time="Early Morning" onclick="tqPick(this)">Early Morning</button>
        <button class="tq-btn" data-time="After 10 AM" onclick="tqPick(this)">After 10 AM</button>
        <button class="tq-btn" data-time="Afternoon 2-3 PM" onclick="tqPick(this)">2&ndash;3 PM</button>
      </div>
      <button class="m-save" id="dispSave" onclick="confirmDispatch()">&#x1F525; Add to Board</button>
      <button class="m-cancel" onclick="cancelDispatch()">Cancel</button>
    </div>
  </div>

</div>

<script>
var etypes       = {etypes_json};
var activeFilter = 'all';
var ordersData   = {orders_json};
var lineData     = {upcoming_json};
/* Selection is stored as stable tokens ('o:'+order_id, or 'u:'+uid) in
   localStorage so it SURVIVES the iframe reload that every save triggers â€”
   the selection only ends when you Confirm or hit the master Select toggle. */
var SEL_KEY='apexBulkSel';
var sel=new Set();
try{{sel=new Set(JSON.parse(localStorage.getItem(SEL_KEY)||'[]'));}}catch(e){{}}
function persistSel(){{try{{localStorage.setItem(SEL_KEY,JSON.stringify(Array.from(sel)));}}catch(e){{}}}}
function tokTicket(ev){{return ev.order_id?('o:'+String(ev.order_id)):('u:'+ev.uid);}}
function tokOrder(o){{return 'o:'+String(o.id);}}

/* â”€â”€ ORDER BOARD view (restaurant status board) â”€â”€ */
function parseInvoice(label){{
  if(!label) return '';
  var m=label.split(' - ');
  return m[0]||label;
}}
var TIME_SLOT_ORDER={{'Early Morning':420,'After 10 AM':600,'Afternoon 2-3 PM':840}};
function timeSortKey(ev){{
  if(!ev.time)return 9999;
  if(TIME_SLOT_ORDER[ev.time]!==undefined)return TIME_SLOT_ORDER[ev.time];
  var m=ev.time.match(/(\\d+):(\\d+)\\s*(AM|PM)/i);if(!m)return 9999;
  var hh=parseInt(m[1],10)%12;if(m[3].toUpperCase()==='PM')hh+=12;
  return hh*60+parseInt(m[2],10);
}}

var boardItems=[];   /* refs into lineData events */
function buildBoard(){{
  boardItems=[];
  lineData.forEach(function(dayObj){{
    (dayObj.events||[]).forEach(function(ev,idx){{
      boardItems.push({{ev:ev,day:dayObj,idx:idx,key:dayObj.iso+'|'+idx}});
    }});
  }});
}}
function itemsFor(status){{
  var items=boardItems.filter(function(it){{
    var s=it.ev.status||'prep';
    if(s!==status)return false;
    if(activeFilter==='all')return true;
    var m={{ship:'Scheduled Shipment',pack:'Pack Order'}};
    return it.ev.type===m[activeFilter];
  }});
  items.sort(function(a,b){{
    var ra=(typeof a.ev.rank==='number')?a.ev.rank:100000;
    var rb=(typeof b.ev.rank==='number')?b.ev.rank:100000;
    if(ra!==rb)return ra-rb;
    if(a.day.iso!==b.day.iso)return a.day.iso<b.day.iso?-1:1;
    return timeSortKey(a.ev)-timeSortKey(b.ev);
  }});
  return items;
}}
function ticketHTML(it,rank,status,colLen){{
  var ev=it.ev,cfg=etypes[ev.type]||{{color:'#94a3b8',icon:'?'}};
  var co=ev.company||'\u2014';
  var inv=parseInvoice(ev.label);
  var time=ev.time||'';
  var shipper=ev.shipper||'';
  var isLate=status==='prep'&&it.day.is_past;
  var isSel=sel.has(tokTicket(ev));
  var h='<div class="ticket'+(isSel?' selected':'')+'" draggable="true" data-key="'+it.key+'" style="border-top:3px solid '+(status==='ready'?'#22c55e':cfg.color)+';">';
  h+='<div class="ticket-top" style="background:'+cfg.color+'1a;color:'+cfg.color+';">'
    +'<button class="sel-dot" title="Select for bulk actions" onclick="toggleTicketSel(event,\\''+it.key+'\\')">'+(isSel?'&#10003;':'')+'</button>'
    +'<span class="rank-chip">#'+rank+'</span>'
    +'<span>'+cfg.icon+' '+esc(ev.type)+'</span>'
    +(isLate?'<span class="late-chip">LATE</span>':'')
    +'<span class="t-spacer"></span>'
    +'<button class="ticket-del" title="Delete" onclick="boardDel(event,\\''+it.key+'\\')">&#10005;</button></div>';
  h+='<div class="ticket-body">';
  h+='<div class="ticket-co">&#x1F3E2; '+esc(co)
    +'<span class="date-chip">'+esc(it.day.label)+'</span></div>';
  h+='<div class="ticket-inv" title="'+esc(ev.label||'')+'">'+esc(inv)+'</div>';
  h+='<div class="ticket-grid">';
  var isClock=/\\d+:\\d+\\s*(AM|PM)/i.test(time);
  h+='<div class="ticket-time'+(time?'':' no-time')+'"><span class="t-cap">Pick-Up</span>'
    +'<span class="t-big'+(time&&!isClock?' t-label':'')+'">'+(time?esc(time):'Not set')+'</span></div>';
  h+='<div class="ticket-ship"><span class="s-cap">Shipper</span><span class="s-val">&#x1F69A; '
    +(shipper?esc(shipper):'<span style="color:#475569;">TBD</span>')+'</span></div>';
  h+='</div>';
  if(ev.note)h+='<div class="ticket-note">'+esc(ev.note)+'</div>';
  h+='<div class="ticket-actions">'
    +'<button class="t-btn" title="Higher priority" onclick="bumpRank(event,\\''+it.key+'\\',-1)"'+(rank===1?' disabled style="opacity:0.3;cursor:default;"':'')+'>&#9650;</button>'
    +'<button class="t-btn" title="Lower priority" onclick="bumpRank(event,\\''+it.key+'\\',1)"'+(rank===colLen?' disabled style="opacity:0.3;cursor:default;"':'')+'>&#9660;</button>'
    +'<button class="t-btn edit-btn" title="Edit shipper / pick-up date / time" onclick="openEditDispatch(event,\\''+it.key+'\\')">&#x270F;&#xFE0F; Edit</button>';
  if(status==='prep'){{
    h+='<button class="t-btn cart-block" title="Email the out-of-stock items holding this order" onclick="cartBlocked(event,\\''+it.key+'\\')">&#x1F6D2;&#x1F6AB; Out of Stock Items</button>';
    h+='<button class="t-btn move-ready" onclick="moveItem(event,\\''+it.key+'\\',\\'ready\\')">Ready &#8594;</button>';
  }} else {{
    h+='<button class="t-btn cart-block" title="Out of stock items â€” email what\\'s missing" onclick="cartBlocked(event,\\''+it.key+'\\')">&#x1F6D2;&#x1F6AB;</button>';
    h+='<button class="t-btn remind" onclick="remindTicket(event,\\''+it.key+'\\')">&#x1F514; Remind</button>';
    h+='<button class="t-btn move-prep" onclick="moveItem(event,\\''+it.key+'\\',\\'prep\\')">&#8592; Back to Prep</button>';
  }}
  h+='</div></div></div>';
  return h;
}}
/* â”€â”€ BRIDGE: talk to Streamlit directly (component iframe is same-origin) â”€â”€ */
function bridgeSend(pyPayload, relayMsg){{
  pyPayload._n = Date.now();  /* nonce: identical actions become distinct payloads */
  try{{
    var pdoc = window.parent.document;
    var ta = pdoc.querySelector('textarea[aria-label="_planner_bridge"]');
    if(!ta){{
      var boxes = pdoc.querySelectorAll('[data-testid="stTextArea"] textarea');
      if(boxes.length) ta = boxes[0];
    }}
    if(ta){{
      var proto = window.parent.HTMLTextAreaElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(ta, JSON.stringify(pyPayload));
      ta.dispatchEvent(new Event('input', {{bubbles:true}}));
      ta.dispatchEvent(new Event('change', {{bubbles:true}}));
      ta.dispatchEvent(new FocusEvent('focusout', {{bubbles:true}}));
      return true;
    }}
  }}catch(err){{/* sandboxed or DOM changed â€” fall back to the relay */}}
  if(relayMsg) window.parent.postMessage(relayMsg, '*');
  return false;
}}
function newUid(){{return Date.now().toString(36)+Math.random().toString(36).slice(2,10);}}
function sendAdd(y,m,d,ev){{
  bridgeSend({{add:{{year:y,month:m,day:d,event:ev}}}},
             {{type:'planner:save_cross',year:y,month:m,day:d,event:ev}});
}}
var lastPopKey=null;
function flashCol(status){{
  var col=document.querySelector(status==='ready'?'.ready-col':'.prep-col');
  if(!col)return;
  col.classList.remove('flash');void col.offsetWidth;col.classList.add('flash');
  setTimeout(function(){{col.classList.remove('flash');}},700);
}}
function fitDensity(wrap){{
  wrap.classList.remove('dense','denser');
  if(wrap.scrollHeight<=wrap.clientHeight+2)return;
  wrap.classList.add('dense');
  if(wrap.scrollHeight<=wrap.clientHeight+2)return;
  wrap.classList.add('denser');
}}
function renderLine(){{
  buildBoard();
  /* Drop stale selection tokens (orders that shipped / no longer exist) so the
     count stays honest, but keep tokens for cards still present after a reload. */
  var valid={{}};
  boardItems.forEach(function(it){{valid[tokTicket(it.ev)]=1;}});
  ordersData.forEach(function(o){{valid[tokOrder(o)]=1;}});
  sel.forEach(function(t){{if(!valid[t])sel.delete(t);}});
  persistSel();
  var counts={{}};
  ['prep','ready'].forEach(function(status){{
    var items=itemsFor(status);
    counts[status]=items.length;
    var wrap=document.getElementById(status==='prep'?'prepCards':'readyCards');
    var badge=document.getElementById(status==='prep'?'prepCount':'readyCount');
    if(badge.textContent!==String(items.length)){{
      badge.classList.remove('bump');void badge.offsetWidth;badge.classList.add('bump');
    }}
    badge.textContent=items.length;
    if(!items.length){{
      wrap.innerHTML='<div class="board-empty"><div class="be-icon">'+(status==='prep'?'&#x1F373;':'&#x2728;')+'</div>'
        +(status==='prep'?'Nothing in prep.<br>Drag an outstanding order up here.':'Drag orders here when they\u2019re ready.')+'</div>';
    }} else {{
      var h='';
      items.forEach(function(it,i){{h+=ticketHTML(it,i+1,status,items.length);}});
      wrap.innerHTML=h;
    }}
  }});
  /* PREPARING grows (satisfyingly) as it fills; READY keeps its share */
  var prepCol=document.querySelector('.prep-col'),readyCol=document.querySelector('.ready-col');
  if(prepCol&&readyCol){{
    prepCol.style.flexGrow=Math.max(1,1+counts.prep*0.55);
    readyCol.style.flexGrow=Math.max(1,1+counts.ready*0.55);
  }}
  /* Density auto-fit so every ticket stays on screen with all details */
  requestAnimationFrame(function(){{
    fitDensity(document.getElementById('prepCards'));
    fitDensity(document.getElementById('readyCards'));
    /* Pop-in the card that just landed */
    if(lastPopKey){{
      var el=document.querySelector('.ticket[data-key="'+lastPopKey+'"]');
      if(el){{el.classList.add('just-in');setTimeout(function(){{el.classList.remove('just-in');}},550);}}
      lastPopKey=null;
    }}
  }});
  renderTray();
  updateBulkBar();
}}
function statusEmoji(s){{
  s=s||'';
  if(s.indexOf('Accept')>=0)return '\U0001F7E2';
  if(s.indexOf('Pending')>=0)return '\U0001F7E1';
  return '\U0001F535';
}}
function renderTray(){{
  var wrap=document.getElementById('trayCards');if(!wrap)return;
  var onBoard={{}};
  boardItems.forEach(function(it){{if(it.ev.order_id)onBoard[String(it.ev.order_id)]=true;}});
  var avail=ordersData.filter(function(o){{return !onBoard[String(o.id)];}});
  document.getElementById('trayCount').textContent=avail.length;
  if(!avail.length){{
    wrap.innerHTML='<div class="tray-empty">&#x1F389; All caught up &mdash; every active order is on the board.</div>';
    return;
  }}
  var h='';
  avail.forEach(function(o){{
    var total=(typeof o.total==='number')?o.total:parseFloat(o.total)||0;
    var oid=String(o.id);
    var isSel=sel.has(tokOrder(o));
    h+='<div class="oorder'+(isSel?' selected':'')+'" draggable="true" data-oid="'+esc(oid)+'">'
      +'<div class="oo-top"><span class="oo-left">'
      +'<button class="sel-dot" title="Select for bulk actions" onclick="toggleOrderSel(event,\\''+esc(oid)+'\\')">'+(isSel?'&#10003;':'')+'</button>'
      +'<span class="oo-inv">&#x1F9FE; '+esc(String(o.invoice_number||('#'+o.id)))+'</span></span>'
      +'<span class="oo-total">$'+total.toFixed(2)+'</span></div>'
      +'<div class="oo-buyer" title="'+esc(o.buyer_name||'')+'">'+esc(o.buyer_name||'')+'</div>'
      +'<div class="oo-meta"><span class="oo-status">'+statusEmoji(o.status)+' '+esc(o.status||'')+'</span>'
      +'<span class="oo-items">&#x1F4E6; '+(o.item_count||0)+'</span>'
      +'<button class="oo-add" onclick="trayAdd(event,\\''+esc(oid)+'\\')">Prep &#8594;</button></div>'
      +'</div>';
  }});
  wrap.innerHTML=h;
}}
function findOrder(oid){{
  for(var i=0;i<ordersData.length;i++)if(String(ordersData[i].id)===String(oid))return ordersData[i];
  return null;
}}
var dispOid=null, dispStatus='prep';
var dispMode='add';       /* 'add' | 'edit' | 'bulk' */
var dispEditKey=null;     /* ticket key being edited */
var dispBulkKeys=[];      /* ticket keys being bulk-updated */
function pad2(n){{return String(n).padStart(2,'0');}}
function todayISO(){{var t=new Date();return t.getFullYear()+'-'+pad2(t.getMonth()+1)+'-'+pad2(t.getDate());}}
/* Prefill the dispatch popup's shipper / date / time controls. */
function setDispatchFields(shipper,iso,time){{
  document.querySelectorAll('.ship-chip').forEach(function(b){{b.classList.remove('active');}});
  var oth=document.getElementById('dShipper');oth.value='';oth.style.display='none';
  var known=['Blossom','MMM','YPG'];
  if(shipper&&known.indexOf(shipper)>=0){{
    var sc=document.querySelector('.ship-chip[data-ship="'+shipper+'"]');if(sc)sc.classList.add('active');
  }} else if(shipper){{
    var so=document.querySelector('.ship-chip[data-ship="Other"]');if(so)so.classList.add('active');
    oth.style.display='block';oth.value=shipper;
  }}
  var useIso=iso||todayISO();
  document.getElementById('dDate').value=useIso;
  document.querySelectorAll('.dq-btn').forEach(function(b){{
    var off=parseInt(b.getAttribute('data-off'),10)||0;
    var t=new Date();t.setDate(t.getDate()+off);
    var iso2=t.getFullYear()+'-'+pad2(t.getMonth()+1)+'-'+pad2(t.getDate());
    b.classList.toggle('active',iso2===useIso);
  }});
  document.querySelectorAll('#dTimeSlots .tq-btn').forEach(function(b){{
    b.classList.toggle('active',!!time&&b.getAttribute('data-time')===time);
  }});
}}
function openDispatch(oid,toStatus){{
  var o=findOrder(oid);if(!o)return;
  dispMode='add';dispOid=oid;dispEditKey=null;dispBulkKeys=[];dispStatus=toStatus||'prep';
  var total=(typeof o.total==='number')?o.total:parseFloat(o.total)||0;
  document.getElementById('disp-title').innerHTML='&#x1F69A; Dispatch Details';
  document.getElementById('disp-order').textContent=(o.invoice_number||('#'+o.id))+' \u00b7 '+(o.buyer_name||'')+' \u00b7 $'+total.toFixed(2);
  setDispatchFields('',todayISO(),'');
  document.getElementById('dispSave').innerHTML='&#x1F525; Add to Board';
  document.getElementById('dispatch-backdrop').classList.add('open');
}}
function openEditDispatch(e,key){{
  if(e){{e.stopPropagation();e.preventDefault();}}
  var it=findItem(key);if(!it)return;
  dispMode='edit';dispEditKey=key;dispOid=null;dispBulkKeys=[];dispStatus=it.ev.status||'prep';
  document.getElementById('disp-title').innerHTML='&#x270F;&#xFE0F; Edit Dispatch';
  document.getElementById('disp-order').textContent=parseInvoice(it.ev.label)+(it.ev.company?' \u00b7 '+it.ev.company:'');
  setDispatchFields(it.ev.shipper||'',(it.day&&it.day.iso)||todayISO(),it.ev.time||'');
  document.getElementById('dispSave').innerHTML='&#x1F4BE; Save Changes';
  document.getElementById('dispatch-backdrop').classList.add('open');
}}
/* â”€â”€ Inline bulk staging (no popup): chips in the bar set shipper/date/time,
   then Move to Preparing (or dragging the selection) commits to all at once. â”€â”€ */
var bStage={{ship:'',time:'',dateIso:''}};
function bChip(btn){{
  var k=btn.getAttribute('data-k'),v=btn.getAttribute('data-v');
  document.querySelectorAll('.bchip[data-k="'+k+'"]').forEach(function(b){{b.classList.remove('on');}});
  btn.classList.add('on');
  if(k==='ship'){{
    var oth=document.getElementById('bulkShipOther');
    if(v==='Other'){{oth.style.display='inline-block';oth.focus();bStage.ship=oth.value.trim();}}
    else{{oth.style.display='none';oth.value='';bStage.ship=v;}}
  }} else if(k==='date'){{
    var off=parseInt(v,10)||0;var t=new Date();t.setDate(t.getDate()+off);
    bStage.dateIso=t.getFullYear()+'-'+pad2(t.getMonth()+1)+'-'+pad2(t.getDate());
    document.getElementById('bulkDate').value=bStage.dateIso;
  }} else if(k==='time'){{bStage.time=v;}}
}}
function bStageDate(v){{
  bStage.dateIso=v;
  document.querySelectorAll('.bchip[data-k="date"]').forEach(function(b){{b.classList.remove('on');}});
}}
function resetStage(){{
  bStage={{ship:'',time:'',dateIso:''}};
  document.querySelectorAll('.bchip').forEach(function(b){{b.classList.remove('on');}});
  var bo=document.getElementById('bulkShipOther');if(bo){{bo.style.display='none';bo.value='';}}
  var bd=document.getElementById('bulkDate');if(bd)bd.value='';
}}
/* Commit the whole selection, applying any staged shipper/date/time.
   targetStatus: 'prep' | 'ready' -> also MOVE board cards there and add
   outstanding orders there;  null -> just apply the fields (Confirm).
   endSel: clear the selection afterward (Confirm / drag) vs keep it (moves).
   Used by the Confirm / Preparing / Ready buttons AND by dropping a selection. */
function commitBulk(targetStatus,endSel){{
  var n=selCount();if(!n)return;
  var shipper=bStage.ship||'',time=bStage.time||'';
  var patch={{}};if(shipper)patch.shipper=shipper;if(time)patch.time=time;
  var dateObj=null,y,m,dd;
  if(bStage.dateIso){{var p=bStage.dateIso.split('-');y=+p[0];m=+p[1];dd=+p[2];dateObj={{year:y,month:m,day:dd}};}}
  else{{var t=todayISO().split('-');y=+t[0];m=+t[1];dd=+t[2];}}
  var iso=y+'-'+pad2(m)+'-'+pad2(dd);
  /* selected board cards -> edit (+move column if a target was given) */
  var uids=[];
  boardItems.forEach(function(it){{
    if(!sel.has(tokTicket(it.ev)))return;
    if(shipper)it.ev.shipper=shipper;if(time)it.ev.time=time;
    if(targetStatus)it.ev.status=targetStatus;
    uids.push(it.ev.uid);
  }});
  /* selected outstanding orders (not yet on the board) -> add as new cards */
  var onBoard={{}};boardItems.forEach(function(it){{if(it.ev.order_id)onBoard[String(it.ev.order_id)]=1;}});
  var items=[];
  ordersData.forEach(function(o){{
    if(!sel.has(tokOrder(o))||onBoard[String(o.id)])return;
    var otot=(typeof o.total==='number')?o.total:parseFloat(o.total)||0;
    var label=(o.invoice_number||('#'+o.id))+' - '+(o.buyer_name||'')+' ($'+otot.toFixed(2)+')';
    var nev={{type:'Pack Order',label:label,note:(o.item_count||0)+' items Â· '+(o.status||''),
      company:o.buyer_name||'',shipper:shipper,time:time,order_id:String(o.id),status:(targetStatus||'prep'),uid:newUid()}};
    items.push({{year:y,month:m,day:dd,event:nev}});
    for(var i=0;i<lineData.length;i++)if(lineData[i].iso===iso){{lineData[i].events.push(nev);break;}}
  }});
  if(!uids.length&&!items.length)return;
  var relay={{type:'planner:bulk_apply',uids:uids,items:items,patch:patch,status:targetStatus,date:dateObj}};
  var body={{uids:uids,items:items,patch:patch,status:targetStatus}};
  if(dateObj)body.date=dateObj;
  bridgeSend({{bulk_apply:body}},relay);
  if(endSel){{sel.clear();persistSel();}}
  resetStage();flashCol(targetStatus||'prep');renderLine();updateBulkBar();
  var bn=uids.length+items.length;
  var dest=targetStatus==='ready'?' â†’ READY':(targetStatus==='prep'?' â†’ Preparing':' updated');
  showToast('ðŸ“¦ '+bn+' order'+(bn!==1?'s':'')+dest+(shipper?' Â· '+shipper:'')+(time?' @ '+time:''));
}}
function bulkConfirm(){{  /* apply staged shipper/date/time, then END selection */
  if(!selCount()){{showToast('Check some cards first.');return;}}
  commitBulk(null,true);
}}
function bulkMovePrep(){{  /* move to PREPARING, keep the selection */
  if(!selCount()){{showToast('Check some cards first.');return;}}
  commitBulk('prep',false);
}}
function bulkMoveReady(){{  /* move to READY, keep the selection */
  if(!selCount()){{showToast('Check some cards first.');return;}}
  commitBulk('ready',false);
}}
function pickShip(btn){{
  document.querySelectorAll('.ship-chip').forEach(function(b){{b.classList.remove('active');}});
  btn.classList.add('active');
  var oth=document.getElementById('dShipper');
  if(btn.getAttribute('data-ship')==='Other'){{
    oth.style.display='block';
    setTimeout(function(){{oth.focus();}},60);
  }} else {{
    oth.style.display='none';oth.value='';
  }}
}}
function tqPick(btn){{
  var was=btn.classList.contains('active');
  document.querySelectorAll('#dTimeSlots .tq-btn').forEach(function(b){{b.classList.remove('active');}});
  if(!was)btn.classList.add('active');
}}
function dqPick(btn){{
  document.querySelectorAll('.dq-btn').forEach(function(b){{b.classList.remove('active');}});
  btn.classList.add('active');
  var off=parseInt(btn.getAttribute('data-off'),10)||0;
  var t=new Date();t.setDate(t.getDate()+off);
  document.getElementById('dDate').value=t.getFullYear()+'-'+pad2(t.getMonth()+1)+'-'+pad2(t.getDate());
}}
function cancelDispatch(){{dispOid=null;dispEditKey=null;dispBulkKeys=[];dispMode='add';document.getElementById('dispatch-backdrop').classList.remove('open');}}
function confirmDispatch(){{
  var shipBtn=document.querySelector('.ship-chip.active');
  var shipper='';
  if(shipBtn){{
    shipper=shipBtn.getAttribute('data-ship')==='Other'
      ?document.getElementById('dShipper').value.trim()
      :shipBtn.getAttribute('data-ship');
  }}
  if(!shipper){{showToast('Pick a shipper first.');return;}}
  var dv=document.getElementById('dDate').value||todayISO();
  var parts=dv.split('-');
  var y=parseInt(parts[0],10),m=parseInt(parts[1],10),dd=parseInt(parts[2],10);
  var timeBtn=document.querySelector('#dTimeSlots .tq-btn.active');
  var time=timeBtn?timeBtn.getAttribute('data-time'):'';

  if(dispMode==='edit'){{
    var it=findItem(dispEditKey);
    if(it){{
      it.ev.shipper=shipper;it.ev.time=time;
      bridgeSend({{edit:{{uid:it.ev.uid,patch:{{shipper:shipper,time:time}},date:{{year:y,month:m,day:dd}}}}}},
                 {{type:'planner:edit',uid:it.ev.uid,shipper:shipper,time:time,year:y,month:m,day:dd}});
    }}
    cancelDispatch();renderLine();
    showToast('\u270f\ufe0f Updated \u2014 '+shipper+(time?' @ '+time:''));
    return;
  }}

  /* add mode */
  var o=findOrder(dispOid);if(!o){{cancelDispatch();return;}}
  var total=(typeof o.total==='number')?o.total:parseFloat(o.total)||0;
  var label=(o.invoice_number||('#'+o.id))+' - '+(o.buyer_name||'')+' ($'+total.toFixed(2)+')';
  var rank=itemsFor(dispStatus).length+1;
  var newEv={{type:'Pack Order',label:label,note:(o.item_count||0)+' items \u00b7 '+(o.status||''),
    company:o.buyer_name||'',shipper:shipper,time:time,order_id:String(o.id),status:dispStatus,rank:rank,uid:newUid()}};
  var iso=dv;
  var dayObj=null;
  for(var i=0;i<lineData.length;i++)if(lineData[i].iso===iso){{dayObj=lineData[i];break;}}
  if(dayObj){{
    dayObj.events.push(newEv);
    lastPopKey=dayObj.iso+'|'+(dayObj.events.length-1);
  }}
  sendAdd(y,m,dd,newEv);
  cancelDispatch();
  flashCol(dispStatus);
  renderLine();
  if(!dayObj)showToast('\U0001F4C5 Scheduled for '+iso+' \u2014 it will show on the board near that date.');
  else showToast((dispStatus==='ready'?'\u2705 ':'\U0001F525 ')+(o.invoice_number||'Order')+' on the board \u2014 '+shipper+(time?' @ '+time:''));
}}
function trayAdd(e,oid){{
  if(e){{e.stopPropagation();e.preventDefault();}}
  openDispatch(oid,'prep');
}}
/* â”€â”€ Multi-select (checkbox on every board ticket + outstanding order) â”€â”€ */
function selCount(){{return sel.size;}}
function setSelTok(tok,on){{
  if(on)sel.add(tok);else sel.delete(tok);
  persistSel();
}}
function toggleTicketSel(e,key){{
  if(e){{e.stopPropagation();e.preventDefault();}}
  var it=findItem(key);if(!it)return;
  var tok=tokTicket(it.ev),on=!sel.has(tok);
  setSelTok(tok,on);
  var el=document.querySelector('.ticket[data-key="'+key+'"]');
  if(el){{el.classList.toggle('selected',on);var d=el.querySelector('.sel-dot');if(d)d.innerHTML=on?'&#10003;':'';}}
  updateBulkBar();
}}
function toggleOrderSel(e,oid){{
  if(e){{e.stopPropagation();e.preventDefault();}}
  oid=String(oid);
  var tok='o:'+oid,on=!sel.has(tok);
  setSelTok(tok,on);
  var el=document.querySelector('.oorder[data-oid="'+oid+'"]');
  if(el){{el.classList.toggle('selected',on);var d=el.querySelector('.sel-dot');if(d)d.innerHTML=on?'&#10003;':'';}}
  updateBulkBar();
}}
function clearSel(){{sel.clear();persistSel();renderLine();updateBulkBar();}}
/* Master toggle in the PREPARING banner: clears the selection if anything is
   picked, otherwise selects every card currently in PREPARING. */
function masterToggle(){{
  if(sel.size){{clearSel();return;}}
  itemsFor('prep').forEach(function(it){{sel.add(tokTicket(it.ev));}});
  persistSel();renderLine();updateBulkBar();
}}
function updateBulkBar(){{
  var bar=document.getElementById('bulk-bar');if(!bar)return;
  var n=selCount();
  bar.classList.toggle('show',n>0);
  var c=document.getElementById('bulk-count');
  if(c)c.textContent=n+' selected';
  var ms=document.getElementById('masterSel');
  if(ms){{ms.classList.toggle('on',n>0);ms.innerHTML=n>0?'âœ– Clear':'â˜‘ Select';}}
}}
function findItem(key){{
  for(var i=0;i<boardItems.length;i++)if(boardItems[i].key===key)return boardItems[i];
  return null;
}}

/* â”€â”€ Reorder / move / persist â”€â”€ */
function applyOrder(status,orderedKeys){{
  orderedKeys.forEach(function(k,i){{
    var it=findItem(k);if(!it)return;
    it.ev.status=status;
    it.ev.rank=i+1;
  }});
}}
function persistBoard(){{
  var updates=boardItems.map(function(it){{
    return {{uid:it.ev.uid,status:it.ev.status||'prep',
      rank:(typeof it.ev.rank==='number')?it.ev.rank:null}};
  }});
  bridgeSend({{board:updates}},{{type:'planner:board',updates:updates}});
}}
function currentKeys(status){{
  return itemsFor(status).map(function(it){{return it.key;}});
}}
function moveItem(e,key,toStatus){{
  if(e){{e.stopPropagation();e.preventDefault();}}
  var it=findItem(key);if(!it)return;
  var from=it.ev.status||'prep';if(from===toStatus)return;
  var fromKeys=currentKeys(from).filter(function(k){{return k!==key;}});
  var toKeys=currentKeys(toStatus);toKeys.push(key);
  it.ev.status=toStatus;
  applyOrder(from,fromKeys);applyOrder(toStatus,toKeys);
  lastPopKey=key;flashCol(toStatus);
  persistBoard();renderLine();
  showToast(toStatus==='ready'?'\u2705 Marked ready!':'\u21A9 Sent back to prep.');
}}
function remindTicket(e,key){{
  if(e){{e.stopPropagation();e.preventDefault();}}
  var it=findItem(key);if(!it)return;
  bridgeSend({{remind:{{uid:it.ev.uid}}}},{{type:'planner:remind',uid:it.ev.uid}});
  showToast('\u2709 Reminder email on its way');
}}
function cartBlocked(e,key){{
  if(e){{e.stopPropagation();e.preventDefault();}}
  var it=findItem(key);if(!it)return;
  var inv=parseInvoice(it.ev.label)||'this order';
  var items=window.prompt('\U0001F6D2\U0001F6AB OUT OF STOCK \u2014 '+inv
    +'\\n\\nWhich items are out of stock? (separate with commas)','');
  if(items===null)return;
  items=items.trim();
  if(!items){{showToast('Nothing entered \u2014 no email sent.');return;}}
  bridgeSend({{cart_blocked:{{uid:it.ev.uid,items:items}}}},
             {{type:'planner:cart_blocked',uid:it.ev.uid,items:items}});
  showToast('\U0001F6D2\U0001F6AB Out-of-stock email on its way');
}}
function plannerRefresh(e){{
  if(e){{e.stopPropagation();e.preventDefault();}}
  showToast('\U0001F504 Syncing with Apex\u2026');
  bridgeSend({{refresh:true}},{{type:'planner:refresh'}});
}}
function bumpRank(e,key,dir){{
  if(e){{e.stopPropagation();e.preventDefault();}}
  var it=findItem(key);if(!it)return;
  var status=it.ev.status||'prep';
  var keys=currentKeys(status);
  var i=keys.indexOf(key);var j=i+dir;
  if(i<0||j<0||j>=keys.length)return;
  keys[i]=keys[j];keys[j]=key;
  applyOrder(status,keys);
  lastPopKey=key;
  persistBoard();renderLine();
}}
function boardDel(e,key){{
  if(e){{e.stopPropagation();e.preventDefault();}}
  var it=findItem(key);if(!it)return;
  it.day.events.splice(it.idx,1);
  renderLine();
  bridgeSend({{delete:true,uid:it.ev.uid}},{{type:'planner:delete',uid:it.ev.uid}});
  showToast('Order removed.');
}}
/* Send board cards back to OUTSTANDING: remove the card + revert the Apex deal
   flow to Invoice Finalized (so the order reappears in the tray). */
function sendToOutstanding(uidList){{
  uidList=uidList.filter(Boolean);
  if(!uidList.length)return;
  bridgeSend({{to_outstanding:{{uids:uidList}}}},{{type:'planner:to_outstanding',uids:uidList}});
}}
function ticketToOutstanding(key){{
  var it=findItem(key);if(!it)return;
  var wasReady=(it.ev.status==='ready');
  sel.delete(tokTicket(it.ev));persistSel();
  it.day.events.splice(it.idx,1);        /* optimistic remove */
  sendToOutstanding([it.ev.uid]);
  renderLine();updateBulkBar();
  showToast('â†© '+parseInvoice(it.ev.label)+' â†’ Outstanding'+(wasReady?' (Apex â†’ Finalized)':''));
}}
function bulkToOutstanding(){{
  var uids=[],reverts=0;
  boardItems.forEach(function(it){{if(sel.has(tokTicket(it.ev))){{uids.push(it.ev.uid);if(it.ev.status==='ready')reverts++;}}}});
  if(!uids.length){{showToast('Only board cards can go back to Outstanding.');return;}}
  sendToOutstanding(uids);
  showToast('â†© '+uids.length+' order'+(uids.length!==1?'s':'')+' â†’ Outstanding'+(reverts?' ('+reverts+' â†’ Finalized)':''));
}}

/* â”€â”€ Drag & drop â”€â”€ */
var dragKey=null;
var dragOid=null;
var dragMulti=false;   /* dragging a card that's part of a multi-selection */
function markDragging(){{
  /* visually lift every selected card when a multi-drag starts */
  document.querySelectorAll('.ticket,.oorder').forEach(function(el){{if(el.classList.contains('selected'))el.classList.add('dragging');}});
}}
document.addEventListener('dragstart',function(e){{
  var oo=e.target.closest?e.target.closest('.oorder'):null;
  if(oo){{
    dragOid=oo.getAttribute('data-oid');dragKey=null;
    dragMulti=sel.has('o:'+String(dragOid));
    oo.classList.add('dragging');
    if(dragMulti)markDragging();
    try{{e.dataTransfer.setData('text/plain','order:'+dragOid);e.dataTransfer.effectAllowed='move';}}catch(err){{}}
    return;
  }}
  var t=e.target.closest?e.target.closest('.ticket'):null;if(!t)return;
  dragKey=t.getAttribute('data-key');dragOid=null;
  var dit=findItem(dragKey);
  dragMulti=!!dit&&sel.has(tokTicket(dit.ev));
  t.classList.add('dragging');
  if(dragMulti)markDragging();
  try{{e.dataTransfer.setData('text/plain',dragKey);e.dataTransfer.effectAllowed='move';}}catch(err){{}}
}});
document.addEventListener('dragend',function(e){{
  document.querySelectorAll('.ticket.dragging,.oorder.dragging').forEach(function(el){{el.classList.remove('dragging');}});
  document.querySelectorAll('.drop-before').forEach(function(el){{el.classList.remove('drop-before');}});
  document.querySelectorAll('.board-col.drag-over,#tray.drag-over').forEach(function(el){{el.classList.remove('drag-over');}});
  dragKey=null;dragOid=null;dragMulti=false;
}});
document.addEventListener('dragover',function(e){{
  if(!dragKey&&!dragOid)return;
  /* Dropping a BOARD card (single ticket or a multi-selection) onto the tray
     sends it back to Outstanding. Outstanding orders themselves can't drop here. */
  var trayEl=e.target.closest?e.target.closest('#tray'):null;
  if(trayEl&&(dragKey||dragMulti)){{
    e.preventDefault();
    try{{e.dataTransfer.dropEffect='move';}}catch(err){{}}
    document.querySelectorAll('.board-col.drag-over').forEach(function(el){{el.classList.remove('drag-over');}});
    document.querySelectorAll('.drop-before').forEach(function(el){{el.classList.remove('drop-before');}});
    trayEl.classList.add('drag-over');
    return;
  }}
  document.querySelectorAll('#tray.drag-over').forEach(function(el){{el.classList.remove('drag-over');}});
  if(dragOid){{
    var col0=e.target.closest?e.target.closest('.board-col'):null;if(!col0)return;
    e.preventDefault();
    try{{e.dataTransfer.dropEffect='move';}}catch(err){{}}
    document.querySelectorAll('.board-col.drag-over').forEach(function(el){{if(el!==col0)el.classList.remove('drag-over');}});
    col0.classList.add('drag-over');
    return;
  }}
  var col=e.target.closest?e.target.closest('.board-col'):null;if(!col)return;
  e.preventDefault();
  try{{e.dataTransfer.dropEffect='move';}}catch(err){{}}
  document.querySelectorAll('.board-col.drag-over').forEach(function(el){{if(el!==col)el.classList.remove('drag-over');}});
  col.classList.add('drag-over');
  document.querySelectorAll('.drop-before').forEach(function(el){{el.classList.remove('drop-before');}});
  var over=e.target.closest('.ticket');
  if(over&&over.getAttribute('data-key')!==dragKey){{
    var r=over.getBoundingClientRect();
    if(e.clientY < r.top + r.height/2) over.classList.add('drop-before');
    else {{var nx=over.nextElementSibling;if(nx&&nx.classList&&nx.classList.contains('ticket'))nx.classList.add('drop-before');}}
  }}
}});
document.addEventListener('drop',function(e){{
  var trayDrop=e.target.closest?e.target.closest('#tray'):null;
  /* Multi-drag: onto a column = move all; onto the tray = send all back out. */
  if(dragMulti){{
    if(trayDrop){{e.preventDefault();bulkToOutstanding();}}
    else{{var colM=e.target.closest?e.target.closest('.board-col'):null;
      if(colM){{e.preventDefault();commitBulk(colM.getAttribute('data-status'),false);}}}}
    dragKey=null;dragOid=null;dragMulti=false;
    document.querySelectorAll('.board-col.drag-over,#tray.drag-over,.ticket.dragging,.oorder.dragging').forEach(function(el){{el.classList.remove('drag-over');el.classList.remove('dragging');}});
    return;
  }}
  if(dragOid){{
    var colO=e.target.closest?e.target.closest('.board-col'):null;
    if(colO){{
      e.preventDefault();
      openDispatch(dragOid,colO.getAttribute('data-status'));
    }}
    dragOid=null;
    document.querySelectorAll('.board-col.drag-over').forEach(function(el){{el.classList.remove('drag-over');}});
    document.querySelectorAll('.oorder.dragging').forEach(function(el){{el.classList.remove('dragging');}});
    return;
  }}
  if(!dragKey)return;
  /* Single board card dropped on the tray -> back to Outstanding (Finalized). */
  if(trayDrop){{
    e.preventDefault();
    var k=dragKey;dragKey=null;
    document.querySelectorAll('#tray.drag-over,.ticket.dragging').forEach(function(el){{el.classList.remove('drag-over');el.classList.remove('dragging');}});
    ticketToOutstanding(k);
    return;
  }}
  var col=e.target.closest?e.target.closest('.board-col'):null;if(!col)return;
  e.preventDefault();
  var toStatus=col.getAttribute('data-status');
  var it=findItem(dragKey);if(!it)return;
  var from=it.ev.status||'prep';
  /* Build target key order with insertion point */
  var toKeys=currentKeys(toStatus).filter(function(k){{return k!==dragKey;}});
  var insertAt=toKeys.length;
  var marker=col.querySelector('.drop-before');
  if(marker){{
    var mk=marker.getAttribute('data-key');
    var mi=toKeys.indexOf(mk);
    if(mi>=0)insertAt=mi;
  }} else {{
    /* dropped on empty space: if above first card, insert at top */
    var cards=col.querySelectorAll('.ticket');
    if(cards.length){{
      var first=cards[0].getBoundingClientRect();
      if(e.clientY<first.top)insertAt=0;
    }}
  }}
  toKeys.splice(insertAt,0,dragKey);
  it.ev.status=toStatus;
  if(from!==toStatus){{
    var fromKeys=currentKeys(from).filter(function(k){{return k!==dragKey;}});
    applyOrder(from,fromKeys);
  }}
  applyOrder(toStatus,toKeys);
  lastPopKey=dragKey;flashCol(toStatus);
  persistBoard();renderLine();
  if(from!==toStatus)showToast(toStatus==='ready'?'\u2705 Marked ready!':'\u21A9 Sent back to prep.');
}});

/* â”€â”€ Filter â”€â”€ */
document.addEventListener('keydown',function(e){{
  var db=document.getElementById('dispatch-backdrop');
  if(db&&db.classList.contains('open')){{
    if(e.key==='Escape')cancelDispatch();
    else if(e.key==='Enter')confirmDispatch();
  }}
}});

function showToast(msg){{var t=document.createElement('div');t.textContent=msg;
  t.style.cssText='position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#1e293b;border:1px solid rgba(249,115,22,0.4);color:#f97316;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.5);pointer-events:none;';
  document.body.appendChild(t);setTimeout(function(){{t.remove();}},1800);}}
function esc(s){{return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}}

/* Multi-user idle sync: refresh this board with other users' changes when
   nothing is in progress (no drag, no popup open, tab visible). */
setInterval(function(){{
  try{{
    if(dragKey||dragOid)return;
    if(document.hidden)return;
    var db=document.getElementById('dispatch-backdrop');
    if(db&&db.classList.contains('open'))return;
    bridgeSend({{ping:true}},null);
  }}catch(e){{}}
}},45000);

renderLine();
</script>
</body>
</html>"""


# ============================================================================
# STREAMLIT RENDER
# ============================================================================

def render_planner(orders_list=None):
    st.markdown("""
    <style>
        section.main > div.block-container { padding:0!important; max-width:100%!important; }
        [data-testid="stTextArea"] { display:none!important; }
        [data-testid="stVerticalBlock"] > div { gap:0!important; }
        iframe { display:block!important; border:none!important; border-radius:0!important; box-shadow:none!important; }
        .stApp > header, .stAppToolbar, [data-testid="stHeader"],
        [data-testid="stToolbar"], [data-testid="stDecoration"],
        header[data-testid="stHeader"] { display:none!important; height:0!important; }
        .stApp { background:linear-gradient(135deg,#0a0a0f 0%,#0f172a 50%,#0c1222 100%)!important; }
        .main .block-container { padding-top:0!important; margin-top:0!important; }
    </style>
    """, unsafe_allow_html=True)

    # Delivered / complete / cancelled orders never reach the tray or sync
    orders_list = filter_active_orders(orders_list)

    save_bridge = st.text_area("_planner_bridge", value="", key="planner_bridge",
                               label_visibility="hidden", height=1)
    if save_bridge.strip() and save_bridge != st.session_state.get("planner_bridge_done"):
        st.session_state.planner_bridge_done = save_bridge
        try:
            payload = json.loads(save_bridge)
            if payload.get("ping"):
                pass  # idle sync: the rerun itself refreshes this user's board
            elif payload.get("board"):
                data = load_planner()
                ensure_uids(data)
                newly_ready, back_to_prep = _apply_board(data, payload["board"])
                for ev in back_to_prep:
                    _on_back_to_prep(ev)
                save_planner(data)
                for ev in newly_ready:
                    _on_ready(ev)
            elif payload.get("delete") and payload.get("uid"):
                data = load_planner()
                if _apply_delete(data, payload["uid"]):
                    save_planner(data)
            elif payload.get("edit"):
                ed = payload["edit"] or {}
                new_ymd = None
                dd = ed.get("date")
                if dd:
                    new_ymd = (int(dd["year"]), int(dd["month"]), int(dd["day"]))
                data = load_planner()
                if _apply_edit(data, ed.get("uid"), ed.get("patch"), new_ymd) is not None:
                    save_planner(data)
            elif payload.get("bulk_apply"):
                # One combined bulk op: edit/move existing board cards AND add
                # new cards for selected outstanding orders, in a single save.
                # An optional `status` moves edited board cards to prep/ready,
                # firing the same ready / back-to-prep side effects as a drag.
                ba = payload["bulk_apply"] or {}
                new_ymd = None
                dd = ba.get("date")
                if dd:
                    new_ymd = (int(dd["year"]), int(dd["month"]), int(dd["day"]))
                target_status = ba.get("status")
                data = load_planner()
                changed = False
                newly_ready, back_to_prep = [], []
                for uid in ba.get("uids", []):
                    loc = _uid_map(data).get(uid)
                    old_status = loc[2].get("status") if loc else None
                    ev = _apply_edit(data, uid, ba.get("patch"), new_ymd)
                    if ev is None:
                        continue
                    changed = True
                    if target_status and target_status != ev.get("status"):
                        if old_status == "ready" and target_status != "ready":
                            back_to_prep.append(ev)
                        if old_status != "ready" and target_status == "ready":
                            newly_ready.append(ev)
                        ev["status"] = target_status
                        if target_status != "ready" and not ev.get("entered_prep_at"):
                            ev["entered_prep_at"] = datetime.now().isoformat(timespec="seconds")
                for item in ba.get("items", []):
                    ev = _apply_add(data, item["year"], item["month"], item["day"], item["event"])
                    changed = True
                    if ev.get("status") == "ready":
                        ev["readied_by"] = current_user()
                        newly_ready.append(ev)
                for ev in back_to_prep:
                    _on_back_to_prep(ev)
                if changed:
                    save_planner(data)
                for ev in newly_ready:
                    _on_ready(ev)
            elif payload.get("to_outstanding"):
                # Drag a board card back onto Outstanding. Only a READY card's
                # deal flow is actually at 'Order Packed | Pending Shipment', so
                # only those need the Apex revert to Finalized (+ pack-stat void
                # + local demote so the sync doesn't re-add them). A PREPARING
                # card is ALREADY at Finalized/Accepted â€” skip the API call so
                # the screen doesn't pause to re-PATCH the same deal flow.
                to = payload["to_outstanding"] or {}
                data = load_planner()
                changed = False
                reverted_ids = []
                for uid in to.get("uids", []):
                    loc = _uid_map(data).get(uid)
                    if not loc:
                        continue
                    ev = loc[2]
                    if ev.get("status") == "ready":
                        _on_back_to_prep(ev)      # Apex -> Finalized + void stat
                        if ev.get("order_id"):
                            reverted_ids.append(ev.get("order_id"))
                    if _apply_delete(data, uid):
                        changed = True
                if changed:
                    save_planner(data)
                _demote_local_orders(orders_list, reverted_ids)
            elif payload.get("remind"):
                data = load_planner()
                loc = _uid_map(data).get(payload["remind"].get("uid"))
                if loc:
                    _notify_and_toast(loc[2])
            elif payload.get("cart_blocked"):
                cb = payload["cart_blocked"] or {}
                data = load_planner()
                loc = _uid_map(data).get(cb.get("uid"))
                if loc:
                    ok = send_cart_blocked_email(loc[2], cb.get("items", ""))
                    inv = (loc[2].get("label") or "").split(" - ")[0]
                    try:
                        if ok:
                            st.toast(f"\U0001F6D2\U0001F6AB Out-of-stock email sent for {inv}", icon="\U0001F4E7")
                        else:
                            st.toast(f"\u26A0\uFE0F Out-of-stock email for {inv} did not send \u2014 check apex_email_log.txt")
                    except Exception:
                        pass
            elif payload.get("refresh"):
                # Flag only â€” st.rerun() would be swallowed by this handler's
                # try/except, so the pull runs just below, outside it.
                st.session_state["planner_do_refresh"] = True
            elif payload.get("add"):
                a = payload["add"]
                data = load_planner()
                ev = _apply_add(data, a["year"], a["month"], a["day"], a["event"])
                save_planner(data)
                if ev.get("status") == "ready":
                    ev["readied_by"] = current_user()
                    save_planner(data)
                    _on_ready(ev)
            elif "day" in payload and "event" in payload:
                # legacy single-event add (old page still open in a browser tab)
                data = load_planner()
                ev = _apply_add(data, payload["year"], payload["month"], payload["day"], payload["event"])
                save_planner(data)
                if ev.get("status") == "ready":
                    _on_ready(ev)
            else:
                # legacy full-month save from a stale tab: IGNORED on purpose â€”
                # replaying a whole month would clobber other users' changes.
                pass
        except Exception:
            pass

    # â”€â”€ \U0001F504 Refresh clicked on the board: pull fresh data from Apex now.
    # After the rerun, app21 rebuilds orders_for_planner from the updated
    # session, the sync below re-runs, and the tray/board reflect Apex.
    if st.session_state.pop("planner_do_refresh", False):
        with st.spinner("Syncing with Apex..."):
            res = planner_refresh_from_apex()
        if res.get("ok"):
            msg = f"\U0001F504 Synced with Apex \u2014 {res.get('fresh', 0)} order(s) updated"
            if res.get("delivered"):
                msg += f" \u00b7 {res['delivered']} delivered order(s) cleared off the planner"
            if res.get("revived"):
                msg += f" \u00b7 {res['revived']} order(s) back from Delivered"
        else:
            msg = f"\u26A0\uFE0F Apex sync failed \u2014 {res.get('err', 'see apex_email_log.txt')}"
        st.session_state["planner_flash"] = msg
        st.rerun()

    flash = st.session_state.pop("planner_flash", None)
    if flash:
        try:
            st.toast(flash)
        except Exception:
            pass

    data  = load_planner()
    if ensure_uids(data):
        save_planner(data)
    # Deal-flow auto-sync: Pending Shipment -> READY; Finalized -> Outstanding;
    # Delivered -> purged off the planner completely
    added, removed, purged = sync_board_with_apex(data, orders_list)
    if purged:
        try:
            st.toast(f"\U0001F9F9 {purged} delivered order(s) cleared off the planner \u2014 they're done")
        except Exception:
            pass
    if removed:
        try:
            st.toast(f"\u21A9 {removed} order(s) returned to Outstanding \u2014 Apex deal flow back to Finalized")
        except Exception:
            pass
    if added:
        ready_now = _collect_ready_events(data)
        if send_ready_digest(ready_now, added):
            try:
                st.toast(f"\U0001F4E7 Ready-board digest sent ({len(ready_now)} orders)", icon="\u2705")
            except Exception:
                pass
    upcoming = get_upcoming_days(data, days_ahead=14)

    html = generate_fullscreen_html(orders_list=orders_list,
                                    upcoming_days=upcoming)
    components.html(html, height=920, scrolling=False)

    st.markdown("""
    <script>
    (function(){
        if(window._plannerRelay) return;
        window._plannerRelay=true;
        window.addEventListener('message',function(e){
            var d=e.data;
            if(!d||!d.type||!d.type.startsWith('planner:')) return;
            if(d.type==='planner:save'){
                try{
                    var ta=window.document.querySelector('textarea[aria-label="_planner_bridge"]');
                    if(ta){
                        var ni=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');
                        ni.set.call(ta,JSON.stringify({year:d.year,month:d.month,events:d.events}));
                        ta.dispatchEvent(new Event('input',{bubbles:true}));
                    }
                }catch(err){}
                return;
            }
            else if(d.type==='planner:board'){
                try{
                    var ta=window.document.querySelector('textarea[aria-label="_planner_bridge"]');
                    if(ta){
                        var ni=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');
                        ni.set.call(ta,JSON.stringify({board:d.updates}));
                        ta.dispatchEvent(new Event('input',{bubbles:true}));
                    }
                }catch(err){}
                return;
            }
            else if(d.type==='planner:edit'){
                try{
                    var ta=window.document.querySelector('textarea[aria-label="_planner_bridge"]');
                    if(ta){
                        var ni=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');
                        ni.set.call(ta,JSON.stringify({edit:{uid:d.uid,patch:{shipper:d.shipper,time:d.time},date:{year:d.year,month:d.month,day:d.day}},_n:Date.now()}));
                        ta.dispatchEvent(new Event('input',{bubbles:true}));
                    }
                }catch(err){}
                return;
            }
            else if(d.type==='planner:bulk_apply'){
                try{
                    var ta=window.document.querySelector('textarea[aria-label="_planner_bridge"]');
                    if(ta){
                        var ni=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');
                        var ba={uids:d.uids,items:d.items,patch:d.patch,status:d.status,_n:Date.now()};
                        if(d.date)ba.date=d.date;
                        ni.set.call(ta,JSON.stringify({bulk_apply:ba}));
                        ta.dispatchEvent(new Event('input',{bubbles:true}));
                    }
                }catch(err){}
                return;
            }
            else if(d.type==='planner:to_outstanding'){
                try{
                    var ta=window.document.querySelector('textarea[aria-label="_planner_bridge"]');
                    if(ta){
                        var ni=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');
                        ni.set.call(ta,JSON.stringify({to_outstanding:{uids:d.uids},_n:Date.now()}));
                        ta.dispatchEvent(new Event('input',{bubbles:true}));
                    }
                }catch(err){}
                return;
            }
            else if(d.type==='planner:delete'){
                try{
                    var ta=window.document.querySelector('textarea[aria-label="_planner_bridge"]');
                    if(ta){
                        var ni=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');
                        ni.set.call(ta,JSON.stringify({delete:true,year:d.year,month:d.month,day:d.day,index:d.index}));
                        ta.dispatchEvent(new Event('input',{bubbles:true}));
                    }
                }catch(err){}
                return;
            }
            else if(d.type==='planner:refresh'){
                try{
                    var ta=window.document.querySelector('textarea[aria-label="_planner_bridge"]');
                    if(ta){
                        var ni=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');
                        ni.set.call(ta,JSON.stringify({refresh:true,_n:Date.now()}));
                        ta.dispatchEvent(new Event('input',{bubbles:true}));
                    }
                }catch(err){}
                return;
            }
            else if(d.type==='planner:cart_blocked'){
                try{
                    var ta=window.document.querySelector('textarea[aria-label="_planner_bridge"]');
                    if(ta){
                        var ni=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');
                        ni.set.call(ta,JSON.stringify({cart_blocked:{uid:d.uid,items:d.items},_n:Date.now()}));
                        ta.dispatchEvent(new Event('input',{bubbles:true}));
                    }
                }catch(err){}
                return;
            }
            else if(d.type==='planner:save_cross'){
                try{
                    var ta=window.document.querySelector('textarea[aria-label="_planner_bridge"]');
                    if(ta){
                        var ni=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');
                        ni.set.call(ta,JSON.stringify({year:d.year,month:d.month,day:d.day,event:d.event}));
                        ta.dispatchEvent(new Event('input',{bubbles:true}));
                    }
                }catch(err){}
                return;
            }
        });
    })();
    </script>
    """, unsafe_allow_html=True)


# ============================================================================
# STANDALONE
# ============================================================================

if __name__ == "__main__":
    st.set_page_config(page_title="Apex Planner", page_icon="\U0001F4C5",
                       layout="wide", initial_sidebar_state="collapsed")
    st.markdown("""
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        [data-testid="stSidebar"],[data-testid="collapsedControl"]{display:none!important;}
        .stApp{background:linear-gradient(135deg,#0a0a0f 0%,#0f172a 50%,#0c1222 100%)!important;}
        .main .block-container{background:transparent!important;padding:0!important;max-width:100%!important;}
        .stApp > header,.stAppToolbar,[data-testid="stHeader"],
        [data-testid="stToolbar"],[data-testid="stDecoration"],
        header[data-testid="stHeader"]{display:none!important;height:0!important;}
        iframe{border:none!important;border-radius:0!important;box-shadow:none!important;}
        [data-testid="stTextArea"]{display:none!important;}
    </style>
    """, unsafe_allow_html=True)
    render_planner()