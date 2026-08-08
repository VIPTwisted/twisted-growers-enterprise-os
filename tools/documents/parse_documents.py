#!/usr/bin/env python3
"""Parse stored COAs and manifests. Production runner.

WHAT THIS IS FOR
    A COA names the cultivator, manufacturer or processor of record - the ONLY
    independent statement of who made the material, because every Metrc field
    shares one origin and cannot disconfirm another. A manifest names where a
    shipment went - the chain of custody outside the facility.

    Both sat unread. 983 certificates were downloaded on 6 Aug 2026 and the
    client field was parsed out of none of them; the answer to "whose flower is
    this?" sat in coa/2267739.pdf for a day until it was opened by hand.

THE FAILURE POLICY - THE POINT OF THIS FILE
    A document downloaded and not parsed is WORSE than one not downloaded,
    because it looks like coverage.

    So an unknown layout must ANNOUNCE ITSELF. When this runner cannot read the
    client off a certificate or the destination off a manifest, it does not
    shrug and move on - it writes a row to watchdog_findings naming the
    laboratory or the manifest, and exits non-zero. A new lab starting to send
    us COAs in a format nobody has seen is a normal, expected event; it must
    surface within a day, not at the next audit.

    On 7 Aug 2026 this was proven twice in one session: MCR Labs turned out to
    be a sixth certificate layout nobody knew about, and it failed SILENTLY into
    an "unproven" bucket. Eight packages from Alternative Compassion Services
    read as having no certificate when the certificate was on disk all along.

USAGE
    python tools/documents/parse_documents.py --kind coa       [--limit N]
    python tools/documents/parse_documents.py --kind manifest  [--limit N]
    python tools/documents/parse_documents.py --kind both --since 2026-08-01

    Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment, plus
    curl and pdftotext (poppler) on PATH.
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.request
import concurrent.futures as cf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from coa_client_parse import parse as parse_coa          # noqa: E402
from manifest_parse import parse as parse_manifest       # noqa: E402

CACHE = os.environ.get("TG_DOC_CACHE", os.path.join(HERE, ".cache"))
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def rest(path, method="GET", body=None):
    """Minimal PostgREST call. No third-party deps on purpose."""
    if not SUPABASE_URL or not SERVICE_KEY:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
    req = urllib.request.Request(
        SUPABASE_URL + "/rest/v1/" + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY,
                 "Content-Type": "application/json", "Prefer": "return=minimal"})
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
        return json.loads(raw) if raw else []


def raise_finding(title, detail, what_to_do, kind, count):
    """A parser that cannot read a document must SAY SO where someone will see it.

    watchdog_findings is APPEND-ONLY and every one of severity, what,
    why_it_matters, how_it_was_detected and what_to_do is NOT NULL. fingerprint
    is what stops the same unread layout raising a fresh row every night - it is
    stable per kind, so one open finding per document type.
    """
    try:
        rest("watchdog_findings", "POST", {
            "fingerprint": "documents:unreadable-layout:" + kind,
            "severity": "elevated",
            "what": title,
            "where_it_is": "metrc_documents / tools/documents/",
            "who_is_accountable": "whoever owns document parsing",
            "why_it_matters": detail,
            "how_it_was_detected":
                "tools/documents/parse_documents.py --kind " + kind +
                " read the stored PDF and could not find the "
                + ("cultivator of record" if kind == "coa" else "destination") +
                ". Every certificate names its client and every manifest names its "
                "destination, so a miss means a layout the parser has never seen.",
            "what_to_do": what_to_do,
            "record_count": count,
            "drill": "select * from metrc_documents where doc_type = '" + kind + "'"})
    except Exception as exc:                              # noqa: BLE001
        # Never swallow this. If the finding cannot be recorded, the run must still
        # exit non-zero and the operator must see why on stderr.
        print("!! COULD NOT RECORD FINDING (%s): %s" % (exc, title), file=sys.stderr)


def fetch_text(storage_path, url):
    """Download once, convert once, cache. Returns the extracted text."""
    os.makedirs(os.path.join(CACHE, os.path.dirname(storage_path)), exist_ok=True)
    pdf = os.path.join(CACHE, storage_path)
    txt = pdf + ".txt"
    if os.path.exists(txt):
        return open(txt, encoding="utf-8", errors="replace").read()
    if not os.path.exists(pdf) or os.path.getsize(pdf) < 1000:
        r = subprocess.run(["curl", "-sS", "-L", "--max-time", "90", "-o", pdf, url],
                           capture_output=True)
        if r.returncode != 0:
            raise RuntimeError("download failed: " + r.stderr.decode()[:160])
    r = subprocess.run(["pdftotext", "-layout", pdf, txt], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError("pdftotext failed: " + r.stderr.decode()[:160])
    return open(txt, encoding="utf-8", errors="replace").read()


def run(kind, limit, since):
    sel = ("metrc_documents?select=metrc_id,storage_path,download_url,package_tag,"
           "manifest_number&storage_path=not.is.null&doc_type=eq." + kind)
    if since:
        sel += "&fetched_at=gte." + since
    if limit:
        sel += "&limit=%d" % limit
    rows = rest(sel)
    print("%s documents to parse: %d" % (kind, len(rows)))

    unreadable, ok = [], 0

    def one(row):
        try:
            text = fetch_text(row["storage_path"], row["download_url"])
        except Exception as exc:                          # noqa: BLE001
            return row, None, str(exc)
        res = parse_coa(text) if kind == "coa" else parse_manifest(text)
        key = "client_license" if kind == "coa" else "destination_license"
        alt = "client_name" if kind == "coa" else "destination_name"
        if not res.get(key) and not res.get(alt):
            return row, res, "UNREADABLE LAYOUT"
        return row, res, None

    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        for row, res, err in ex.map(one, rows):
            if err:
                unreadable.append((row, res, err))
            else:
                ok += 1

    print("parsed: %d   unreadable: %d" % (ok, len(unreadable)))

    # THE FAILURE POLICY. Never silent.
    if unreadable:
        sample = ", ".join(str(r["metrc_id"]) for r, _, _ in unreadable[:8])
        raise_finding(
            "%d %s document(s) could not be parsed - possible new layout" % (len(unreadable), kind),
            "The parser could not read the %s from these documents: %s. Every "
            "certificate names its client and every manifest names its destination, "
            "so this is a layout the parser has not seen - most likely a laboratory "
            "or transporter new to us. Six certificate layouts are handled today "
            "(Green Analytics, Safetiva, MCR, Kaycha, Analytics Labs, GVA)."
            % ("cultivator of record" if kind == "coa" else "destination", sample),
            "Open one of the listed PDFs, find how that lab or form labels the "
            "client/destination, and add the layout to tools/documents/. Do NOT "
            "leave these as 'unproven' - an unparsed document looks like coverage.",
            kind, len(unreadable))
        return 1
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=["coa", "manifest", "both"], default="both")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--since", help="only documents fetched on or after this date")
    a = ap.parse_args()
    kinds = ["coa", "manifest"] if a.kind == "both" else [a.kind]
    sys.exit(max(run(k, a.limit, a.since) for k in kinds))
