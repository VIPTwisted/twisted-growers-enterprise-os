"""Task activity log — every completed bridge action appends one event, and
the 📊 Tasks dashboard reads live totals off it.

Storage: apex_tasklog.json in DATA_DIR — {"events": [{ts, kind, invoice,
detail}, …]}, append-only through the locked update_json so concurrent
requests can't lose events. Logging is fire-and-forget: a log failure must
never break the operation being logged.
"""

import os
import secrets as _secrets
from datetime import datetime, timedelta

from .deps import DATA_DIR, read_json, update_json

TASKLOG_FILE = os.path.join(DATA_DIR, "apex_tasklog.json")
MAX_EVENTS = 50000          # file stays bounded; oldest fall off

# kind → dashboard label. Order here is the dashboard's tie-break order.
KINDS = {
    "item_added":        "New item added",
    "item_deleted":      "Item deleted from invoice",
    "item_returned":     "Item returned to inventory",
    "pricing_tier_added": "Pricing tier added",
    "terms_set":         "Terms set",
    "delivery_date_set": "Delivery date set",
    "due_date_set":      "Due date set",
    "deal_flow_updated": "Deal flow updated",
    "email_sent":        "Email sent",
    "pdf_attached":      "PDF attached",
    "picksheet_pdf":     "Picksheet generated",
    "picksheet_xlsx":    "Picksheet excel generated",
    "pickup_date_set":   "Pick-up date set",
    "layover_set":       "Layover set",
    "shipper_set":       "Shipper set",
    "metrc_manifest_new": "METRC refresh — new manifest",
    "invoice_compared":  "Line item compared",
    "order_added":       "New invoice on board",
    "blast_email":       "Blast email sent",
    "inventory_adjustment": "Inventory adjustment",
    "delivery_grid_sent": "Delivery grid emailed",
    "item_split": "Line item split",
    "invoice_linked":    "Invoice linked to vendor",
    "unpaid_email":      "Unpaid invoice email sent",
    "batch_field_filled": "Batch line box filled",
    "coa_attached":      "COA attached",
    "metrc_tagged":      "METRC item tagged",
}

EMOJI = {
    "item_added": "➕", "item_deleted": "❌", "item_returned": "♻️",
    "pricing_tier_added": "💲", "terms_set": "📜", "delivery_date_set": "🚚",
    "due_date_set": "📅", "deal_flow_updated": "🔀", "email_sent": "📧",
    "pdf_attached": "📎", "picksheet_pdf": "📄", "picksheet_xlsx": "📊",
    "metrc_manifest_new": "🚛", "invoice_compared": "⚖️", "order_added": "🧾",
    "blast_email": "📨", "inventory_adjustment": "🔧",
    "pickup_date_set": "🗓", "layover_set": "🛌", "shipper_set": "📦",
    "delivery_grid_sent": "🚚", "item_split": "✂️",
    "invoice_linked": "🔗", "unpaid_email": "💰",
    "batch_field_filled": "📝", "coa_attached": "🧪", "metrc_tagged": "🏷️",
}


def log_task(kind, invoice=None, detail=""):
    """Append ONE completed-task event. Never raises."""
    try:
        ev = {"id": _secrets.token_hex(4),
              "ts": datetime.now().isoformat(timespec="seconds"),
              "kind": str(kind),
              "invoice": str(invoice or ""),
              "detail": str(detail or "")[:200]}

        def _mut(data):
            evs = data.setdefault("events", [])
            evs.append(ev)
            if len(evs) > MAX_EVENTS:
                del evs[: len(evs) - MAX_EVENTS]
            return True

        update_json(TASKLOG_FILE, {"events": []}, _mut)
    except Exception:
        pass


def log_many(kind, items, invoice=None):
    """Append one event per item (e.g. bulk add → one per batch). Never raises."""
    try:
        ts = datetime.now().isoformat(timespec="seconds")
        evs_new = [{"id": _secrets.token_hex(4), "ts": ts, "kind": str(kind),
                    "invoice": str(invoice or ""),
                    "detail": str(d or "")[:200]} for d in items]
        if not evs_new:
            return

        def _mut(data):
            evs = data.setdefault("events", [])
            evs.extend(evs_new)
            if len(evs) > MAX_EVENTS:
                del evs[: len(evs) - MAX_EVENTS]
            return True

        update_json(TASKLOG_FILE, {"events": []}, _mut)
    except Exception:
        pass


def _ensure_ids():
    """Backfill ids onto events written before ids existed — once, persisted."""
    def _mut(data):
        changed = False
        for lst in (data.get("events") or [], data.get("deleted") or []):
            for e in lst:
                if not e.get("id"):
                    e["id"] = _secrets.token_hex(4)
                    changed = True
        return changed
    return update_json(TASKLOG_FILE, {"events": []}, _mut)


def delete_events(ids):
    """Move events → the deleted bin (Excel-style multi-delete). Deleted
    events drop out of every count/chart but stay recoverable."""
    ids = set(ids or [])
    moved = []

    def _mut(data):
        evs = data.get("events") or []
        keep, gone = [], []
        for e in evs:
            (gone if e.get("id") in ids else keep).append(e)
        if not gone:
            return False
        ts = datetime.now().isoformat(timespec="seconds")
        for e in gone:
            e["deleted_at"] = ts
        data["events"] = keep
        data.setdefault("deleted", []).extend(gone)
        moved.extend(gone)
        return True

    _ensure_ids()
    update_json(TASKLOG_FILE, {"events": []}, _mut)
    return len(moved)


def restore_events(ids):
    """Move events back out of the deleted bin into the live log."""
    ids = set(ids or [])
    back = []

    def _mut(data):
        dels = data.get("deleted") or []
        keep, ret = [], []
        for e in dels:
            (ret if e.get("id") in ids else keep).append(e)
        if not ret:
            return False
        for e in ret:
            e.pop("deleted_at", None)
        data["deleted"] = keep
        data.setdefault("events", []).extend(ret)
        data["events"].sort(key=lambda e: str(e.get("ts", "")))
        back.extend(ret)
        return True

    update_json(TASKLOG_FILE, {"events": []}, _mut)
    return len(back)


def purge_deleted(ids=None):
    """Permanently clear the deleted bin (all of it, or just the given ids)."""
    ids = set(ids) if ids else None
    n = {"purged": 0}

    def _mut(data):
        dels = data.get("deleted") or []
        if ids is None:
            n["purged"] = len(dels)
            data["deleted"] = []
        else:
            keep = [e for e in dels if e.get("id") not in ids]
            n["purged"] = len(dels) - len(keep)
            data["deleted"] = keep
        return n["purged"] > 0

    update_json(TASKLOG_FILE, {"events": []}, _mut)
    return n["purged"]


def summary(days=30, start=None, end=None, recent_limit=300):
    """Everything the dashboard needs in one payload: per-kind totals over the
    picked range (+ today), a continuous daily series over that range, hourly
    buckets for the last 24h, minute buckets for the last 60m, and the
    recent-activity feed.

    Range: `start`/`end` (YYYY-MM-DD, both inclusive — the 📅 custom calendar)
    win over `days`; otherwise the range is the last `days` days ending today."""
    data = _ensure_ids() or {"events": []}
    events = data.get("events", [])
    deleted_all = data.get("deleted", [])
    now = datetime.now()
    today = now.date()

    sd = ed = None
    if start and end:
        try:
            sd = datetime.fromisoformat(str(start)[:10]).date()
            ed = datetime.fromisoformat(str(end)[:10]).date()
            if ed < sd:
                sd, ed = ed, sd
            if (ed - sd).days > 365:
                sd = ed - timedelta(days=365)
        except (TypeError, ValueError):
            sd = ed = None
    if sd is None:
        days = max(1, min(int(days or 30), 365))
        ed = today
        sd = today - timedelta(days=days - 1)
    n_days = (ed - sd).days + 1
    start_iso, end_iso = sd.isoformat(), ed.isoformat()
    today_iso = today.isoformat()

    by_kind_total, by_kind_today = {}, {}
    # each bucket: {"n": total, "by": {kind: count}} so the dashboard can
    # stack/split any time scale by category
    daily = {(sd + timedelta(days=i)).isoformat(): {"n": 0, "by": {}}
             for i in range(n_days)}

    # last-24h hourly + last-60m minute buckets, independent of the day range
    hour_floor = now.replace(minute=0, second=0, microsecond=0)
    hours = [(hour_floor - timedelta(hours=23 - i)) for i in range(24)]
    hourly = {h.isoformat(timespec="seconds")[:13]: {"n": 0, "by": {}}
              for h in hours}
    min_floor = now.replace(second=0, microsecond=0)
    minutes = [(min_floor - timedelta(minutes=59 - i)) for i in range(60)]
    minutely = {m.isoformat(timespec="seconds")[:16]: {"n": 0, "by": {}}
                for m in minutes}

    def _bump(bucket, k):
        bucket["n"] += 1
        bucket["by"][k] = bucket["by"].get(k, 0) + 1

    for e in events:
        ts = str(e.get("ts", ""))
        d = ts[:10]
        if not d:
            continue
        k = str(e.get("kind", "") or "other")
        if start_iso <= d <= end_iso:
            by_kind_total[k] = by_kind_total.get(k, 0) + 1
            if d in daily:
                _bump(daily[d], k)
        if d == today_iso:
            by_kind_today[k] = by_kind_today.get(k, 0) + 1
        h = ts[:13]
        if h in hourly:
            _bump(hourly[h], k)
        m = ts[:16]
        if m in minutely:
            _bump(minutely[m], k)

    kind_keys = list(KINDS) + [k for k in by_kind_total if k not in KINDS]
    kinds = [{"kind": k,
              "label": KINDS.get(k, k),
              "emoji": EMOJI.get(k, "•"),
              "total": by_kind_total.get(k, 0),
              "today": by_kind_today.get(k, 0)}
             for k in kind_keys]
    kinds.sort(key=lambda x: (-x["total"], kind_keys.index(x["kind"])))

    def _row(e):
        return {"id": e.get("id", ""),
                "ts": e.get("ts", ""),
                "kind": e.get("kind", ""),
                "label": KINDS.get(e.get("kind", ""), e.get("kind", "")),
                "emoji": EMOJI.get(e.get("kind", ""), "•"),
                "invoice": e.get("invoice", ""),
                "detail": e.get("detail", ""),
                "deleted_at": e.get("deleted_at", "")}

    # The feed is the AUDIT LOG — recent_limit=0 returns every event ever
    # logged (newest first); the default keeps the page snappy.
    n = int(recent_limit or 0)
    recent = [_row(e) for e in reversed(events[-n:] if n > 0 else events)]
    deleted = [_row(e) for e in reversed(deleted_all)]

    return {
        "days": n_days,
        "range": {"start": start_iso, "end": end_iso},
        "total": sum(by_kind_total.values()),
        "today": sum(by_kind_today.values()),
        "kinds": kinds,
        "daily": [{"date": d, "count": b["n"], "by": b["by"]}
                  for d, b in sorted(daily.items())],
        "hourly": [{"ts": h, "count": hourly[h]["n"], "by": hourly[h]["by"]}
                   for h in sorted(hourly)],
        "minutely": [{"ts": m, "count": minutely[m]["n"], "by": minutely[m]["by"]}
                     for m in sorted(minutely)],
        "recent": recent,
        "events_total": len(events),
        "deleted": deleted,
        "deleted_total": len(deleted_all),
    }
