"""📨 Email Blast — the same notice to many vendors, one email per group.

Each vendor row becomes its OWN message with just that vendor's addresses on
the To line, so nobody sees anybody else's contacts and nothing looks like a
bulk BCC. Sends run one at a time on a worker thread with a gap between them:
Exchange Online throttles a mailbox at roughly 30 messages/minute, and a
140-vendor run would trip that flat out.

The HTTP call returns the moment the run starts. The UI polls `status()` and
can pull the kill switch through `stop()` at any point — the flag is checked
before every send and during every gap, so stopping is immediate. A send
already in flight is allowed to finish rather than being torn down mid-request;
that's at most one extra email, and it keeps the log honest about what left
the building.

Every run is appended to data/blast_log.json — for a bank-detail notice you
want a record of exactly who was told and when.
"""

import base64
import json
import os
import threading
from datetime import datetime, timezone

from . import deps, tasklog

slc = deps.slc

DEFAULT_GAP_SEC = 2.0
MAX_ATTACH_BYTES = 3 * 1024 * 1024   # TOTAL across all files — Graph
                                     # inlines the base64 into /sendMail
LOG_FILE = "blast_log.json"
LOG_KEEP_RUNS = 20

_LOCK = threading.Lock()
_STOP = threading.Event()
_THREAD: threading.Thread | None = None

_STATE: dict = {
    "active": False,
    "total": 0,
    "sent": 0,
    "failed": 0,
    "current": "",
    "results": [],       # [{store, emails, ok, message, at}]
    "started": None,
    "finished": None,
    "stopped": False,    # the kill switch was pulled
    "subject": "",
    "attachment": "",
}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")


def status() -> dict:
    with _LOCK:
        s = dict(_STATE)
        s["results"] = list(_STATE["results"])
        return s


def stop() -> dict:
    """Kill switch. Safe to call when nothing is running."""
    with _LOCK:
        running = _STATE["active"]
    if running:
        _STOP.set()
        return {"ok": True, "message": "🛑 Stopping — no further emails will go out."}
    return {"ok": True, "message": "Nothing is running."}


def _personalize(text: str, store: str) -> str:
    """{vendor} / {store} in the subject or body become the vendor's name."""
    return (text or "").replace("{vendor}", store).replace("{store}", store)


def _clean_groups(groups) -> tuple[list, list]:
    """→ (sendable groups, skipped vendor names). Dedupes addresses per group,
    case-insensitively, keeping the order they appear in the grid. A group may
    carry `invoices` [{id, invoice}] — those PDFs are built and attached to
    that vendor's email at send time (the 💰 Unpaid invoices flow)."""
    out, skipped = [], []
    for g in groups or []:
        store = (getattr(g, "store", "") or "").strip()
        emails, seen = [], set()
        for raw in (getattr(g, "emails", None) or []):
            raw = (raw or "").strip()
            em = slc._label_to_email(raw) or (raw if "@" in raw else "")
            if em and em.lower() not in seen:
                emails.append(em)
                seen.add(em.lower())
        invs = []
        for iv in (getattr(g, "invoices", None) or []):
            iid = getattr(iv, "id", None) or (iv.get("id") if isinstance(iv, dict) else None)
            ilbl = getattr(iv, "invoice", None) or (iv.get("invoice") if isinstance(iv, dict) else None)
            if iid:
                invs.append({"id": str(iid), "invoice": str(ilbl or iid)})
        if emails:
            out.append({"store": store or "(unnamed)", "emails": emails,
                        "invoices": invs})
        elif store:
            skipped.append(store)
    return out, skipped


def _build_invoice_atts(sess, invoices):
    """(attachments, failed_labels) — each invoice fetched fresh off the b-api
    and rendered with the same builder the review panel's email uses."""
    atts, failed = [], []
    for iv in invoices or []:
        try:
            od = slc.bapi_fetch_invoice(sess, iv["id"])
            if not od:
                failed.append(iv["invoice"])
                continue
            blob, ext, mime, _lbl = slc.build_best_invoice_file(od)
            if not blob:
                failed.append(iv["invoice"])
                continue
            atts.append((f"{iv['invoice']}{ext or '.pdf'}", blob,
                         mime or "application/pdf"))
        except Exception:
            failed.append(iv["invoice"])
    return atts, failed


def _write_log(run: dict) -> None:
    path = os.path.join(deps.DATA_DIR, LOG_FILE)
    try:
        runs = []
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                runs = json.load(fh) or []
        runs.append(run)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(runs[-LOG_KEEP_RUNS:], fh, indent=1)
    except Exception:
        pass   # a logging failure must never take the run down with it


def _run(groups, subject, body, cc, atts, gap, email_kind="blast_email",
         sess=None):
    try:
        for i, g in enumerate(groups):
            if _STOP.is_set():
                break
            with _LOCK:
                _STATE["current"] = g["store"]

            # per-vendor invoice PDFs (💰 unpaid flow) ride on top of the
            # shared attachments — built fresh at send time
            g_atts = list(atts)
            build_note = ""
            if g.get("invoices"):
                inv_atts, failed = _build_invoice_atts(sess, g["invoices"])
                g_atts += inv_atts
                if failed:
                    build_note = (" ⚠️ couldn't build: " + ", ".join(failed))
                if not g_atts:
                    with _LOCK:
                        _STATE["results"].append({
                            "store": g["store"], "emails": g["emails"],
                            "ok": False,
                            "message": "No invoice PDF could be built — email "
                                       "NOT sent." + build_note,
                            "at": _now(),
                        })
                        _STATE["failed"] += 1
                    if i + 1 < len(groups):
                        _STOP.wait(gap)
                    continue

            ok, msg = slc.send_graph_mail(
                g["emails"],
                _personalize(subject, g["store"]),
                _personalize(body, g["store"]),
                g_atts,
                cc_addrs=cc,
            )

            with _LOCK:
                _STATE["results"].append({
                    "store": g["store"], "emails": g["emails"],
                    "ok": bool(ok), "message": str(msg) + build_note,
                    "at": _now(),
                })
                _STATE["sent" if ok else "failed"] += 1
            if ok:
                tasklog.log_task(email_kind, detail=g["store"])
                tasklog.log_many("pdf_attached",
                                 [f"{g['store']} · {a[0]}" for a in g_atts])

            # interruptible gap — the kill switch lands here, not after it
            if i + 1 < len(groups):
                _STOP.wait(gap)
    finally:
        with _LOCK:
            _STATE["active"] = False
            _STATE["current"] = ""
            _STATE["stopped"] = _STOP.is_set()
            _STATE["finished"] = _now()
            run = {
                "started": _STATE["started"], "finished": _STATE["finished"],
                "subject": _STATE["subject"], "attachment": _STATE["attachment"],
                "total": _STATE["total"], "sent": _STATE["sent"],
                "failed": _STATE["failed"], "stopped": _STATE["stopped"],
                "results": list(_STATE["results"]),
            }
        _write_log(run)


def start(groups, subject, body, cc, attachments,
          gap_seconds=DEFAULT_GAP_SEC, email_kind="blast_email",
          require_attachments=True) -> dict:
    """Validate everything up front, then hand off to the worker thread.
    Returns {ok, message, total, skipped}. Nothing is sent on a rejection."""
    global _THREAD

    with _LOCK:
        if _STATE["active"]:
            return {"ok": False, "message": "A blast is already running."}

    if not all(slc._graph_creds()):
        return {"ok": False, "message": (
            "Email sending needs [graph] credentials in "
            ".streamlit/secrets.toml (tenant_id, client_id, client_secret, "
            "sender_email).")}

    subject = (subject or "").strip()
    if not subject:
        return {"ok": False, "message": "Give the email a subject."}

    if require_attachments and not attachments:
        return {"ok": False, "message": "Attach at least one file."}

    atts, total = [], 0
    for a in attachments:
        name = (getattr(a, "name", "") or "").strip() or "attachment"
        try:
            blob = base64.b64decode(getattr(a, "b64", "") or "", validate=True)
        except Exception:
            return {"ok": False,
                    "message": f"{name} didn't upload cleanly — remove it and re-add it."}
        if not blob:
            return {"ok": False, "message": f"{name} is empty."}
        atts.append((name, blob, getattr(a, "mime", "") or "application/octet-stream"))
        total += len(blob)

    if total > MAX_ATTACH_BYTES:
        return {"ok": False, "message": (
            f"Attachments total {total / 1048576:.1f} MB — Graph inlines them into "
            f"every message, so keep the total under "
            f"{MAX_ATTACH_BYTES // 1048576} MB.")}

    clean, skipped = _clean_groups(groups)
    if not clean:
        return {"ok": False, "message": "No vendor in the selection has a valid email address."}

    cc_out, seen = [], set()
    for raw in (cc or []):
        raw = (raw or "").strip()
        em = slc._label_to_email(raw) or (raw if "@" in raw else "")
        if em and em.lower() not in seen:
            cc_out.append(em)
            seen.add(em.lower())

    gap = max(0.0, min(60.0, float(gap_seconds or 0)))

    with _LOCK:
        _STATE.update({
            "active": True, "total": len(clean), "sent": 0, "failed": 0,
            "current": "", "results": [], "started": _now(), "finished": None,
            "stopped": False, "subject": subject,
            "attachment": ", ".join(n for n, _b, _m in atts),
        })
    _STOP.clear()

    sess = deps.session_state.get("bapi_session") or {}
    _THREAD = threading.Thread(
        target=_run, args=(clean, subject, body or "", cc_out, atts, gap,
                           email_kind, sess),
        daemon=True, name="email-blast")
    _THREAD.start()

    note = (f"📨 Sending to {len(clean)} vendor(s), one at a time "
            f"({gap:g}s apart) with {len(atts)} attachment(s).")
    if skipped:
        note += f" Skipped {len(skipped)} with no valid email: {', '.join(skipped[:5])}"
        if len(skipped) > 5:
            note += f" +{len(skipped) - 5} more"
        note += "."
    return {"ok": True, "message": note, "total": len(clean), "skipped": skipped}
