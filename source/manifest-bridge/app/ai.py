"""🤖 AI order builder — free-text order -> catalog-matched line items.

The local Ollama model (qwen3:8b, http://localhost:11434) does ONLY the
fuzzy part: splitting "sublime 300 units chubby chaser 200" into
{product_text, qty} pairs. Everything after that is deterministic Python —
each product_text is scored against the active Apex catalog (substring pass
via slc.filter_products, then token-overlap ranking) and the top candidates
come back for a read-only preview. Nothing here writes to any order, cache,
or session; the catalog prompt never leaves this machine.
"""

import json
import re
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

from . import bridge, deps, inventory

slc = deps.slc
S = deps.session_state

OLLAMA_URL = "http://localhost:11434"
OLLAMA_MODEL = "qwen3:8b"
OLLAMA_TIMEOUT = 300     # CPU-only inference — model reload + a big tool
                         # result in the prompt can push past 2 min

MAX_CANDIDATES = 5
MIN_SCORE = 0.5


class OllamaError(RuntimeError):
    """Local-model failure with a user-facing message (mapped to HTTP 503)."""


# ============================================================
# LLM EXTRACTION  (the only step that touches the model)
# ============================================================

_EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "product_text": {"type": "string"},
                    "qty": {"type": "integer"},
                },
                "required": ["product_text", "qty"],
            },
        },
    },
    "required": ["items"],
}

_SYSTEM_PROMPT = (
    "You split a wholesale order typed as free text into line items. "
    "Extract every product mention with its quantity (a unit count). "
    "Copy the buyer's own words into product_text — never invent, expand, "
    "or correct product names. Words like 'units', 'cases', 'x', 'of' are "
    "not part of the product name, and neither are the quantity digits — "
    "product_text must contain no numbers that are quantities. "
    "If a product has no quantity, use 0."
)


def _post_ollama(payload):
    """POST /api/chat with the shared error mapping -> the response message."""
    payload.setdefault("keep_alive", "30m")   # keep the model warm in RAM
    try:
        resp = requests.post(f"{OLLAMA_URL}/api/chat", json=payload,
                             timeout=OLLAMA_TIMEOUT)
    except requests.exceptions.ConnectionError:
        raise OllamaError(
            f"Ollama isn't running at {OLLAMA_URL} — start the Ollama app "
            "(or run 'ollama serve') and try again.")
    except requests.exceptions.Timeout:
        raise OllamaError(
            f"The local model took over {OLLAMA_TIMEOUT}s — "
            "try a shorter message.")

    if resp.status_code != 200:
        try:
            err = resp.json().get("error", "")
        except Exception:
            err = resp.text[:200]
        if "not found" in err.lower():
            raise OllamaError(
                f"Model {OLLAMA_MODEL} isn't installed — run "
                f"'ollama pull {OLLAMA_MODEL}' first.")
        raise OllamaError(f"Ollama error: {err or resp.status_code}")

    try:
        return resp.json()["message"]
    except Exception:
        raise OllamaError("The model returned unusable output.")


def _extract(text):
    """Free text -> [{product_text, qty}] via the local model."""
    msg = _post_ollama({
        "model": OLLAMA_MODEL,
        "stream": False,
        "think": False,
        "options": {"temperature": 0, "num_ctx": 4096, "num_predict": 512},
        "format": _EXTRACT_SCHEMA,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
    })
    try:
        items = json.loads(msg.get("content") or "{}").get("items", [])
    except Exception:
        raise OllamaError(
            "The model returned unusable output — try rephrasing the order.")

    out = []
    for it in items:
        name = str(it.get("product_text", "")).strip()
        if not name:
            continue
        try:
            qty = max(0, int(it.get("qty", 0)))
        except Exception:
            qty = 0
        if qty:
            # the model sometimes leaves the qty digits in product_text
            # ("chubby chaser 200") — strip them off the edges
            name = re.sub(rf"^\s*{qty}\s+|\s+{qty}\s*$", " ", name).strip()
        if name:
            out.append({"product_text": name, "qty": qty})
    return out


# ============================================================
# CATALOG MATCHING  (deterministic — no model involved)
# ============================================================

def _active_products():
    prods = slc.load_inventory_cache().get("products", [])
    return [p for p in prods if not p.get("archived")]


def _tokens(s):
    return re.findall(r"[a-z0-9#\.]+", (s or "").lower())


def _haystack(p):
    """Same fields filter_products searches (slc.py:3502)."""
    cat = p.get("category")
    cat_name = cat.get("name", "") if isinstance(cat, dict) else ""
    return " ".join([str(p.get("name", "")), str(p.get("product_sku", "")),
                     str(slc._p_brand(p)), str(cat_name)]).lower()


def _product_ref(p, score):
    cat = p.get("category")
    return {
        "id": p.get("id"),
        "name": p.get("name", ""),
        "brand": slc._p_brand(p),
        "category": cat.get("name", "") if isinstance(cat, dict) else "",
        "unit_size": p.get("unit_size"),
        "sold_as": p.get("sold_as"),
        "units_per_case": p.get("units_per_case"),
        "listing_price": slc._p_price(p),
        "score": round(score, 2),
    }


def _match_line(product_text, active):
    """Score product_text against the catalog -> (status, candidates)."""
    q = product_text.strip().lower()
    # bare integers in the query are almost always stray quantities, not part
    # of a product name (decimals like "3.5" and "#6" survive this filter)
    q_tokens = [t for t in _tokens(q) if not t.isdigit()]
    if not q_tokens:
        return "none", []

    scored = []
    for p in active:
        hay = _haystack(p)
        if q in hay:
            score = 1.0                       # whole phrase found
        else:
            hay_tokens = set(_tokens(hay))
            hit = sum(1 for t in q_tokens if t in hay_tokens)
            score = hit / len(q_tokens)
        if score >= MIN_SCORE:
            scored.append((score, len(p.get("name", "")), p))

    if not scored:
        return "none", []

    # best score first; shorter name = tighter match on ties
    scored.sort(key=lambda t: (-t[0], t[1]))
    top = scored[:MAX_CANDIDATES]
    cands = [_product_ref(p, sc) for sc, _ln, p in top]

    if len(top) == 1 or top[0][0] > top[1][0]:
        return "ok", cands
    return "ambiguous", cands


# ============================================================
# PUBLIC — the one endpoint call
# ============================================================

def parse_order(text):
    t0 = time.time()
    deps.progress("🤖 Parsing order with qwen3 (local model)…", active=True)
    extracted = _extract(text)

    deps.progress("🔎 Matching against catalog…", active=True)
    active = _active_products()
    lines = []
    for it in extracted:
        status, cands = _match_line(it["product_text"], active)
        lines.append({
            "input_text": it["product_text"],
            "qty": it["qty"],
            "status": status,
            "best": cands[0] if cands else None,
            "candidates": cands,
        })

    n_ok = sum(1 for l in lines if l["status"] == "ok")
    n_amb = sum(1 for l in lines if l["status"] == "ambiguous")
    n_none = sum(1 for l in lines if l["status"] == "none")
    return {
        "model": OLLAMA_MODEL,
        "took_ms": int((time.time() - t0) * 1000),
        "lines": lines,
        "note": (f"{len(lines)} line{'s' if len(lines) != 1 else ''} — "
                 f"{n_ok} matched, {n_amb} ambiguous, {n_none} no match"),
    }


# ============================================================
# BRIDGE ASSISTANT  (chat agent — Ollama native tool calling)
#   The model can only READ (board, catalog, contacts) and STAGE an email
#   draft. There is no send tool: sending happens exclusively through
#   send_email() below, which only the human-clicked Send button reaches.
# ============================================================

CHAT_NUM_CTX = 8192      # tools + history + tool results need room
CHAT_NUM_PREDICT = 1024
MAX_ROUNDS = 6
MAX_HISTORY = 20         # trim incoming history to the last N messages

_AGENT_SYSTEM = (
    "You are the Bridge Assistant for Twisted Growers' Manifest Bridge app. "
    "You help with the product catalog, pack orders, manifests, and vendor "
    "email. Use your tools — never invent product names, order data, or "
    "email addresses. Emailing: if the human types an actual email address "
    "(anything containing @), use it directly in draft_email — do NOT look "
    "it up. Only use find_contacts when you have a vendor NAME without an "
    "address. Always write the subject line yourself "
    "from the message content — never ask the human for a subject. "
    "To EMAIL a product list (new carts, flower menu...): call "
    "format_inventory_list with the category/type, then draft_email with a "
    "1-2 sentence intro and the placeholder [LIST] alone on its own line "
    "where the products go — the app inserts the formatted list verbatim. "
    "NEVER retype or invent product lines. "
    "For QUESTIONS about a category/type, use list_inventory and answer "
    "with '- Name — test score' bullets from its results only. "
    "To add/remove inventory units: find_batches first to get the exact "
    "batch_id, then set_batch_quantity with the new ABSOLUTE unit count "
    "(adding 50 to a batch at 100 means quantity 150). Confirm old → new "
    "in your reply. Only change batches the human named. "
    "Drafts are NOT sent by you — the human "
    "reviews the draft and clicks Send; mail goes out as "
    "vincent@twistedgrowers.com. Do not add a signature, closing name, or "
    "placeholder like [Your Name] — the app appends Vincent's signature "
    "automatically. After staging a draft, reply with one short "
    "line like 'Draft ready — say send (or hit the Send button) when you "
    "want it to go out.' "
    "Sending: call send_draft ONLY when the human explicitly tells you to "
    "send — never unprompted. send_draft sends the staged draft exactly as "
    "staged. Never claim an email was sent unless send_draft returned "
    "sent=true; if there is no staged draft, stage one with draft_email "
    "first. "
    "Be brief and plain-text; no markdown tables."
)


def _tool(name, desc, props, req):
    return {"type": "function", "function": {
        "name": name, "description": desc,
        "parameters": {"type": "object", "properties": props,
                       "required": req}}}


_AGENT_TOOLS = [
    _tool("search_catalog",
          "Search active products by name/brand/category.",
          {"query": {"type": "string"}}, ["query"]),
    _tool("parse_order",
          "Parse a free-text wholesale order into catalog-matched line items.",
          {"text": {"type": "string"}}, ["text"]),
    _tool("get_board",
          "Current pack orders: company, invoice, status, manifest state.",
          {}, []),
    _tool("find_contacts",
          "Look up a vendor's email contacts by (partial) vendor name.",
          {"vendor": {"type": "string"}}, ["vendor"]),
    _tool("draft_email",
          "Stage an email draft for human review. Does NOT send. "
          "to/cc must be real addresses from find_contacts.",
          {"to": {"type": "array", "items": {"type": "string"}},
           "cc": {"type": "array", "items": {"type": "string"}},
           "subject": {"type": "string"}, "body": {"type": "string"}},
          ["to", "subject", "body"]),
    _tool("send_draft",
          "Send the currently staged draft, exactly as staged. Use ONLY "
          "when the human explicitly says to send.",
          {}, []),
    _tool("list_inventory",
          "List active inventory for a product category or type (e.g. "
          "'distillate carts', 'flower', 'live rosin') with product names, "
          "test scores (THC), available units, and price.",
          {"query": {"type": "string"}}, ["query"]),
    _tool("format_inventory_list",
          "Auto-format matching IN-STOCK inventory into a ready bullet "
          "list: 'Flavor (Case of N) - Type - Test score'. Use before "
          "emailing a product list; then put [LIST] in the email body "
          "where the products go.",
          {"query": {"type": "string"}}, ["query"]),
    _tool("find_batches",
          "Find batches by product/batch/brand name — returns batch_id, "
          "product, batch name, current units, status.",
          {"query": {"type": "string"}}, ["query"]),
    _tool("set_batch_quantity",
          "Set one batch's on-hand units to an ABSOLUTE count (adding 50 "
          "to a batch at 100 means quantity 150). Get batch_id from "
          "find_batches first.",
          {"batch_id": {"type": "integer"},
           "quantity": {"type": "integer"}},
          ["batch_id", "quantity"]),
]


def _board_snapshot():
    """Same reads as main._board_ctx (cache-only) — replicated here because
    main imports this module."""
    orders = bridge.load_pack_orders()
    manifests = bridge.load_manifests()
    links = bridge.load_links()
    views = [bridge.manifest_view(m) for m in manifests]
    suggestions = bridge.auto_match(orders, manifests, links, views=views)
    checks = bridge.load_verify_cache()
    edges = bridge.resolve(orders, manifests, links, suggestions, checks,
                           views=views)
    return orders, edges


def _tool_search_catalog(args):
    status, cands = _match_line(str(args.get("query", "")),
                                _active_products())
    return {"status": status,
            "products": [{k: c[k] for k in ("name", "brand", "unit_size",
                                            "sold_as", "listing_price",
                                            "score")}
                         for c in cands[:MAX_CANDIDATES]]}


def _tool_parse_order(args):
    res = parse_order(str(args.get("text", "")))
    return {"note": res["note"],
            "lines": [{"input": l["input_text"], "qty": l["qty"],
                       "status": l["status"],
                       "match": (l["best"] or {}).get("name")}
                      for l in res["lines"]]}


def _tool_get_board(args):
    orders, edges = _board_snapshot()
    by_inv = {e["invoice"]: e for e in edges}
    rows = [{"company": o["company"], "invoice": o["invoice"],
             "status": o["status"], "day": o.get("day"),
             "shipper": o.get("shipper"),
             "manifest": (by_inv.get(o["digits"]) or {}).get("state",
                                                             "unlinked")}
            for o in orders]
    return {"count": len(rows), "orders": rows[:40]}


def _tool_find_contacts(args):
    q = str(args.get("vendor", "")).strip().lower()
    lists = slc._load_contact_lists()
    hits = [(v, mem) for v, mem in lists.items() if q and q in v.lower()]
    return {"matches": [{"vendor": v,
                         "contacts": [{"name": m.get("name", ""),
                                       "email": m.get("email", "")}
                                      for m in mem[:5]]}
                        for v, mem in hits[:5]]}


AI_SIGNATURE = "Best,\nVincent\nTwisted Growers"

STYLE_FILE = "ai_style.json"    # cwd is pinned to backend/data by deps


def _style_profile():
    return (deps.read_json(STYLE_FILE, {}) or {}).get("profile") or ""


def learn_style():
    """Read Vincent's recent Sent Items via Graph, have the local model
    distill a style guide, and save it — drafts then imitate his voice.
    Everything stays on this machine."""
    t0 = time.time()
    deps.progress("🎓 Reading sent emails via Graph…", active=True)
    if not all(slc._graph_creds()):
        return {"ok": False, "note": "Graph mail isn't configured."}
    sender = slc._graph_creds()[3]
    token = slc._graph_token()
    if not token:
        return {"ok": False, "note": "Couldn't get a Graph access token."}

    headers = {"Authorization": f"Bearer {token}",
               "Prefer": 'outlook.body-content-type="text"'}
    url = (f"https://graph.microsoft.com/v1.0/users/{sender}"
           "/mailFolders/sentitems/messages"
           "?$top=50&$select=subject,body,sentDateTime"
           "&$orderby=sentDateTime desc")
    samples, fetched = [], 0
    try:
        while url and fetched < 150 and len(samples) < 20:
            resp = requests.get(url, headers=headers, timeout=30)
            if resp.status_code != 200:
                return {"ok": False,
                        "note": f"Graph returned {resp.status_code}."}
            data = resp.json()
            msgs = data.get("value", [])
            for m in msgs:
                body = ((m.get("body") or {}).get("content") or "").strip()
                # keep only what Vincent wrote — cut quoted reply/forward
                # chains off the bottom
                for marker in ("\r\nFrom:", "\nFrom:",
                               "________________________________"):
                    i = body.find(marker)
                    if i > 0:
                        body = body[:i]
                body = body.strip()
                if 60 <= len(body) <= 2500:
                    samples.append(body)
            fetched += len(msgs)
            url = data.get("@odata.nextLink")
            if not msgs:
                break
    except requests.exceptions.RequestException as e:
        return {"ok": False, "note": f"Graph request failed: {e}"}

    if len(samples) < 3:
        return {"ok": False,
                "note": (f"Only found {len(samples)} usable sent emails — "
                         "need at least 3 with real written content.")}

    deps.progress("🎓 Studying the writing style (qwen3, local)…",
                  active=True)
    joined = "\n\n--- EMAIL ---\n\n".join(samples[:15])[:6000]
    msg = _post_ollama({
        "model": OLLAMA_MODEL,
        "stream": False,
        "think": False,
        "options": {"temperature": 0, "num_ctx": 8192, "num_predict": 400},
        "messages": [
            {"role": "system", "content":
                "You analyze writing style. Reply with only the guide, "
                "no preamble."},
            {"role": "user", "content":
                "Here are emails written by Vincent:\n\n" + joined +
                "\n\nWrite a style guide (under 120 words, imperative "
                "voice, e.g. 'Open with...', 'Keep sentences...') that "
                "would let someone write new emails indistinguishable "
                "from Vincent's: greeting habits, tone, formality, "
                "sentence length, typical phrases, sign-off habits."},
        ],
    })
    profile = (msg.get("content") or "").strip()
    if not profile:
        return {"ok": False, "note": "The model returned no style profile."}

    deps.write_json(STYLE_FILE, {
        "profile": profile,
        "generated_at": time.strftime("%Y-%m-%d %H:%M"),
        "samples": len(samples),
    })
    return {"ok": True,
            "note": f"Studied {len(samples)} sent emails — style saved.",
            "profile": profile,
            "took_ms": int((time.time() - t0) * 1000)}

_PLACEHOLDER_RE = re.compile(r"^\s*\[?\s*(your name|your title|name|company"
                             r"|sender)\s*\]?\s*$", re.IGNORECASE)


_SIGNOFF_RE = re.compile(
    r"^\s*(best( regards)?|warm regards|regards|thanks( again)?|thank you"
    r"|sincerely|cheers)[\s,!.]*$", re.IGNORECASE)
_SIGLINE_RE = re.compile(
    r"twisted\s*growers|twistedgrowers\.com|manifest bridge"
    r"|^\s*vincent[\s,.]*$", re.IGNORECASE)


def _sign_body(body):
    """Strip model placeholders ('[Your Name]') and the ENTIRE trailing
    sign-off block the model wrote (closings, names, homemade signatures),
    then stamp the one real signature — deterministic, so every draft
    leaves with exactly one clean sign-off no matter what the model did."""
    lines = [ln for ln in body.splitlines()
             if not _PLACEHOLDER_RE.match(ln) and "[your name]" not in ln.lower()]
    while lines and (not lines[-1].strip()
                     or _SIGNOFF_RE.match(lines[-1])
                     or _SIGLINE_RE.search(lines[-1])):
        lines.pop()
    body = "\n".join(lines).rstrip()
    return body + f"\n\n{AI_SIGNATURE}"


def _tool_draft_email(args):
    to = [str(a).strip() for a in (args.get("to") or []) if "@" in str(a)]
    cc = [str(a).strip() for a in (args.get("cc") or []) if "@" in str(a)]
    subject = str(args.get("subject", "")).strip()
    body = str(args.get("body", "")).strip()
    # splice the auto-formatted inventory block in verbatim — the model
    # writes [LIST] instead of retyping product data
    block = S.get("ai_inventory_block")
    if block:
        body = re.sub(r"\[\s*(INVENTORY[ _-]?)?LIST\s*\]|\{\{\s*LIST\s*\}\}",
                      lambda _m: block, body)
    if not to:
        return {"error": ("no valid To address — use find_contacts to get "
                          "a real email first")}
    if not body:
        return {"error": "body is required"}
    if not subject:
        # backstop: derive a subject from the first line of the body
        first = next((ln.strip() for ln in body.splitlines() if ln.strip()),
                     "Message")
        words = first.split()
        subject = " ".join(words[:8]) + ("…" if len(words) > 8 else "")
    draft = {"to": to, "cc": cc, "subject": subject,
             "body": _sign_body(body)}
    S["ai_last_draft"] = draft      # remembered so send_draft / the Send
    return {"staged": True, "draft": draft}   # button can act on it later


def _tool_send_draft(args):
    """Sends the STAGED draft verbatim — the model can't alter recipients
    or content at send time; changing anything requires a new draft_email."""
    draft = S.get("ai_last_draft")
    if not draft:
        return {"error": "no draft staged — create one with draft_email first"}
    ok, msg = send_email(draft["to"], draft["cc"],
                         draft["subject"], draft["body"])
    if not ok:
        return {"error": msg}
    S.pop("ai_last_draft", None)
    return {"sent": True, "to": draft["to"], "message": msg}


def _batch_test_score(b, abbrev="THC"):
    """'82-85% THC' from a /v2 batch's predominate-cannabinoid fields —
    same fields the real Apex invoice prints as Potency."""
    pmin = b.get("predominate_canabinoid_min_or_only")
    pmax = b.get("predominate_canabinoid_max")
    unit = b.get("predominate_canabinoid_unit") or "%"
    if pmin in (None, ""):
        return ""
    try:
        if pmax not in (None, "") and float(pmax) != float(pmin):
            return f"{pmin}-{pmax}{unit} {abbrev}"
    except (TypeError, ValueError):
        pass
    return f"{pmin}{unit} {abbrev}"


def _tool_list_inventory(args):
    q = str(args.get("query", "")).strip().lower()
    toks = [t.rstrip("s") for t in re.findall(r"[a-z0-9]+", q) if len(t) > 2]
    if not toks:
        return {"error": "give a category or product type to list"}
    scored = []
    for p in _active_products():
        cat = p.get("category")
        cat_name = cat.get("name", "") if isinstance(cat, dict) else ""
        typ = p.get("product_type")
        typ_name = typ.get("name", "") if isinstance(typ, dict) else str(typ or "")
        hay = f"{cat_name} {typ_name} {p.get('name', '')}".lower()
        hits = sum(1 for t in toks if t in hay)
        if hits:
            scored.append((hits, cat_name, typ_name, p))
    if not scored:
        return {"count": 0, "products": [],
                "note": f"no active products match '{q}'"}
    scored.sort(key=lambda x: -x[0])
    rows = []
    for _hits, cat_name, typ_name, p in scored[:25]:
        pcan = p.get("predominate_canabinoid")
        abbrev = (pcan.get("abbreviation") if isinstance(pcan, dict)
                  else None) or "THC"
        test, avail = "", 0.0
        for b in slc.fetch_product_batches(p.get("id")):
            if b.get("archived"):
                continue
            avail += slc._batch_qty(b) or 0
            if not test:
                test = _batch_test_score(b, abbrev)
        rows.append({
            "name": p.get("name", ""),
            "brand": slc._p_brand(p),
            "category": cat_name,
            "type": typ_name,
            "test": test or "no test data",
            "available_units": int(avail),
            "price": slc._p_price(p),
        })
    return {"count": len(rows), "products": rows}


def _flavor(name):
    """'Dope Chemist - Vape Cart 1g - Apple Rings (Sold in Case of 50)'
    -> 'Apple Rings' (last dash segment, trailing parenthetical dropped)."""
    base = re.sub(r"\s*\(.*?\)\s*$", "", name or "").strip()
    parts = [p.strip() for p in base.split(" - ") if p.strip()]
    return parts[-1] if parts else (name or "")


def _case_count(name):
    m = re.search(r"case of (\d+)", name or "", re.IGNORECASE)
    return m.group(1) if m else None


def _tool_format_inventory_list(args):
    """Deterministic auto-formatter: matching IN-STOCK batches from the
    batch grid -> a ready-to-paste bullet list. The model never retypes
    product data — draft_email splices this block in verbatim via [LIST]."""
    q = str(args.get("query", "")).strip().lower()
    toks = [t.rstrip("s") for t in re.findall(r"[a-z0-9]+", q) if len(t) > 2]
    if not toks:
        return {"error": "give a category/type to list, e.g. 'distillate carts'"}
    res = inventory.list_batches(hide_archived=True)
    lines = []
    for r in res["rows"]:
        if not (r["qty"] or 0) > 0:
            continue
        hay = (f"{r['category']} {r['type']} {r['product']} "
               f"{r['brand']}").lower()
        if not all(t in hay for t in toks):
            continue
        cc = _case_count(r["product"])
        pack = f"Case of {cc}" if cc else "Unit"
        kind = r["type"] or r["category"] or "—"
        test = r["test"] or "no test data"
        lines.append(f"- {_flavor(r['product'])} ({pack}) - {kind} - {test}")
    if not lines:
        return {"count": 0,
                "note": f"no in-stock batches match '{q}'"}
    lines.sort(key=str.lower)
    block = "\n".join(lines)
    S["ai_inventory_block"] = block
    return {"count": len(lines), "formatted": block,
            "note": ("in draft_email, put [LIST] on its own line where the "
                     "products go — the app inserts this block verbatim")}


def _tool_find_batches(args):
    q = str(args.get("query", "")).strip()
    if not q:
        return {"error": "give a product/batch/brand name to search"}
    res = inventory.list_batches(name=q, hide_archived=True)
    return {"count": res["count"],
            "batches": [{"batch_id": r["batch_id"], "product": r["product"],
                         "batch": r["batch"], "qty": r["qty"],
                         "status": r["status"]}
                        for r in res["rows"][:10]]}


def _tool_set_batch_quantity(args):
    bid = args.get("batch_id")
    qty = args.get("quantity")
    b = inventory.find_batch(bid)
    if not b:
        return {"error": (f"batch_id {bid} not found — use find_batches "
                          "to get a real id")}
    old = slc._batch_qty(b)
    ok, msg = inventory.set_batch(bid, b.get("product_id"), quantity=qty)
    if not ok:
        return {"error": msg}
    return {"ok": True, "batch": b.get("name", ""),
            "old_qty": int(old) if old is not None else None,
            "new_qty": int(qty)}


_TOOL_IMPLS = {
    "search_catalog": _tool_search_catalog,
    "parse_order": _tool_parse_order,
    "get_board": _tool_get_board,
    "find_contacts": _tool_find_contacts,
    "draft_email": _tool_draft_email,
    "send_draft": _tool_send_draft,
    "list_inventory": _tool_list_inventory,
    "format_inventory_list": _tool_format_inventory_list,
    "find_batches": _tool_find_batches,
    "set_batch_quantity": _tool_set_batch_quantity,
}

_ACTION_LABELS = {
    "search_catalog": "🔎 searched catalog",
    "parse_order": "🧾 parsed order",
    "get_board": "📋 read the board",
    "find_contacts": "📇 looked up contacts",
    "draft_email": "✉️ staged a draft",
    "send_draft": "📧 sent the draft",
    "list_inventory": "📦 pulled inventory",
    "format_inventory_list": "📋 auto-formatted the list",
    "find_batches": "🔍 found batches",
    "set_batch_quantity": "📦 updated inventory",
}


def _chat_round(msgs, use_tools=True):
    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "think": False,
        "options": {"temperature": 0, "num_ctx": CHAT_NUM_CTX,
                    "num_predict": CHAT_NUM_PREDICT},
        "messages": msgs,
    }
    if use_tools:
        payload["tools"] = _AGENT_TOOLS
    return _post_ollama(payload)


def chat(history):
    """Full chat history -> {reply, actions, draft, took_ms}. Stateless —
    the frontend sends the whole (user/assistant) transcript each call."""
    t0 = time.time()
    deps.progress("🤖 Bridge Assistant thinking (qwen3, local)…", active=True)

    now = datetime.now(ZoneInfo("America/New_York"))
    sys_prompt = _AGENT_SYSTEM + (
        f" Current date/time in Connecticut: {now:%A %B %d, %Y %I:%M %p}. "
        "Pick greetings (Good morning/afternoon/evening) by this clock — "
        "morning before 12 PM, afternoon 12-5 PM, evening after 5 PM.")
    style = _style_profile()
    if style:
        sys_prompt += (" When writing email bodies, imitate Vincent's own "
                       "style: " + style +
                       " (Ignore any sign-off/signature habits in that "
                       "guide — never write a sign-off; the app appends "
                       "it.)")
    msgs = [{"role": "system", "content": sys_prompt}]
    for m in history[-MAX_HISTORY:]:
        if m.get("role") in ("user", "assistant") and (m.get("content") or "").strip():
            msgs.append({"role": m["role"], "content": str(m["content"])})

    actions, draft, sent, reply = [], None, None, ""
    for _round in range(MAX_ROUNDS):
        msg = _chat_round(msgs, use_tools=True)
        calls = msg.get("tool_calls") or []
        if not calls:
            reply = (msg.get("content") or "").strip()
            break
        msgs.append(msg)                       # verbatim, incl. tool_calls
        for tc in calls:
            fn = tc.get("function") or {}
            name = fn.get("name", "")
            args = fn.get("arguments") or {}
            if isinstance(args, str):          # some builds send a JSON string
                try:
                    args = json.loads(args)
                except Exception:
                    args = {}
            impl = _TOOL_IMPLS.get(name)
            try:
                result = impl(args) if impl else {"error": f"unknown tool {name}"}
            except OllamaError:
                raise
            except Exception as ex:
                result = {"error": f"{type(ex).__name__}: {ex}"}
            if name == "draft_email" and result.get("staged"):
                draft = result["draft"]
            if name == "send_draft" and result.get("sent"):
                sent = {"to": result["to"], "message": result["message"]}
                draft = None
            actions.append({"tool": name,
                            "summary": _ACTION_LABELS.get(name, name)})
            msgs.append({"role": "tool", "tool_name": name,
                         "content": json.dumps(result)})
    else:
        # rounds exhausted — force a plain text answer
        msg = _chat_round(msgs, use_tools=False)
        reply = (msg.get("content") or "").strip()

    if not reply:
        reply = ("Draft ready — review it below and hit Send." if draft
                 else "(no reply from the model — try rephrasing)")
    return {"reply": reply, "actions": actions, "draft": draft,
            "sent": sent, "took_ms": int((time.time() - t0) * 1000)}


def send_email(to, cc, subject, body):
    """The ONLY send path — reached exclusively by the human-clicked Send
    button on a staged draft, never by the model."""
    if not all(slc._graph_creds()):
        return False, "Graph mail isn't configured (missing credentials)."
    to = [a.strip() for a in to if "@" in a]
    cc = [a.strip() for a in (cc or []) if "@" in a]
    if not to:
        return False, "No valid To address."
    return slc.send_graph_mail(to, subject, body, cc_addrs=cc or None)
