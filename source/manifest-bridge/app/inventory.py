"""📦 Batch inventory — list every batch, edit qty/name (port of the 2.0
batch inventory grid, slc.render_batch_inventory_editor).

Qty is an ABSOLUTE unit count: writing a bigger number adds stock, a smaller
number removes it — exactly the 2.0 grid's auto-save semantics. Writes go
through slc._top_up_batch, which prefers the free b-api browser-session
write and falls back to the metered bearer PATCH, then refreshes the
per-batch view cache so the next list shows the new number.
"""

from . import deps

slc = deps.slc
S = deps.session_state


def _joined_products():
    prods = slc.load_inventory_cache().get("products", [])
    return {str(p.get("id")): p for p in prods}


def _test_score(b, abbrev="THC"):
    """'88.5% THC' / '82-85% THC' off a batch's predominate-cannabinoid
    fields — the same numbers the real Apex invoice prints as Potency."""
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


def list_batches(name="", hide_archived=True):
    """Flatten the batch index (+ live overrides) joined with the product
    catalog -> JSON rows for the grid / the assistant."""
    q = (name or "").strip().lower()
    idx = slc.fetch_all_batches_indexed()          # shared — treat read-only
    overrides = S.get("batch_overrides") or {}
    prods = _joined_products()

    rows = []
    for pid, batches in idx.items():
        prod = prods.get(str(pid), {})
        pname = prod.get("name", "") or ""
        brand = slc._p_brand(prod)
        price = slc._p_price(prod)
        cat = prod.get("category")
        cat_name = cat.get("name", "") if isinstance(cat, dict) else ""
        typ = prod.get("product_type")
        typ_name = (typ.get("name", "") if isinstance(typ, dict)
                    else str(typ or ""))
        if typ_name == "None":
            typ_name = ""
        pcan = prod.get("predominate_canabinoid")
        abbrev = (pcan.get("abbreviation") if isinstance(pcan, dict)
                  else None) or "THC"
        for b in batches:
            ov = overrides.get(str(b.get("id")))
            if ov:
                b = {**b, **ov}
            status = slc._batch_status(b)
            if hide_archived and status == "Archived":
                continue
            bname = b.get("name", "") or ""
            if q and q not in f"{pname} {bname} {brand}".lower():
                continue
            qty = slc._batch_qty(b)
            rows.append({
                "batch_id": b.get("id"),
                "product_id": b.get("product_id"),
                "product": pname,
                "brand": brand,
                "category": cat_name,
                "type": typ_name,
                "batch": bname,
                "tag": slc._get_metrc_tag(b),
                "test": _test_score(b, abbrev),
                "qty": int(qty) if qty is not None else None,
                "price": price,
                "status": status,
                "archived": status == "Archived",
            })
    rows.sort(key=lambda r: (r["product"].lower(), r["batch"].lower()))
    return {"count": len(rows), "rows": rows}


def find_batch(batch_id):
    """The batch's current row (post-override) or None — used to validate
    assistant writes and echo old→new."""
    sid = str(batch_id)
    for pid, batches in slc.fetch_all_batches_indexed().items():
        for b in batches:
            if str(b.get("id")) == sid:
                ov = (S.get("batch_overrides") or {}).get(sid)
                if ov:
                    b = {**b, **ov}
                return b
    return None


def set_batch(batch_id, product_id, quantity=None, name=None):
    """Write qty (absolute units) and/or batch name — the 2.0 grid autosave.
    Returns (ok, msg)."""
    did = []
    if quantity is not None:
        try:
            qty = int(quantity)
        except (TypeError, ValueError):
            return False, f"Bad quantity {quantity!r}."
        if qty < 0:
            return False, "Quantity can't be negative."
        ok, msg = slc._top_up_batch(product_id, batch_id, qty)
        if not ok:
            return False, f"Quantity write failed: {msg}"
        did.append(f"qty → {qty}")
    if name is not None and str(name).strip():
        ok, msg, _raw = slc.update_batch(batch_id, {"name": str(name).strip()})
        if not ok:
            return False, f"Name write failed: {msg}"
        did.append("renamed")
    if not did:
        return False, "Nothing to change."
    slc._patch_batches_in_view([(product_id, batch_id)])
    return True, " · ".join(did)
