"""METRC Tagging — native port of the inventory app's metrc_tagging module.

Same engine, tg's format: caches live in backend/data, the b-api uses the
persisted session (deps.session_state["bapi_session"] via slc._bapi_headers),
and the grid is served as JSON to the Next.js /metrc page.

Scoring: every Metrc tag successfully posted to Apex logs `metrc_tagged` (+1).
"""

import json
import os
from datetime import datetime, timedelta

import requests

from . import deps
from .deps import slc

DATA_DIR = deps.DATA_DIR

CACHE_FILE = os.path.join(DATA_DIR, "metrc_inventory_cache.json")
PACKAGES_CACHE_FILE = os.path.join(DATA_DIR, "metrc_packages_cache.json")
POSTED_TAGS_FILE = os.path.join(DATA_DIR, "metrc_posted_tags.json")
LINKED_TAGS_FILE = os.path.join(DATA_DIR, "metrc_linked_tags.json")

BAPI_BASE = slc.BAPI_BASE
INVENTORY_PAGINATED = f"{BAPI_BASE}/inventory/paginated"
_MAX_INVENTORY_PAGES = 60


# ---------------------------------------------------------------------------
#  Local JSON caches
# ---------------------------------------------------------------------------
def _load_json(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _save_json(path, data):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)
        return True
    except Exception:
        return False


def load_cache():
    return _load_json(CACHE_FILE, None)


def save_cache(data):
    return _save_json(CACHE_FILE, data)


def load_packages_cache():
    return _load_json(PACKAGES_CACHE_FILE, None)


def save_packages_cache(data):
    return _save_json(PACKAGES_CACHE_FILE, data)


def load_posted_tags():
    return _load_json(POSTED_TAGS_FILE, {})


def save_posted_tags(m):
    return _save_json(POSTED_TAGS_FILE, m)


def load_linked_tags():
    return _load_json(LINKED_TAGS_FILE, {})


def save_linked_tags(m):
    return _save_json(LINKED_TAGS_FILE, m)


def seed_from_inventory_app():
    """One-time seed: copy the Streamlit app's caches if ours don't exist yet."""
    src_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__))))), "inventory", "metrc_modules")
    pairs = [
        ("metrc_inventory_cache.json", CACHE_FILE),
        ("metrc_packages_cache.json", PACKAGES_CACHE_FILE),
        ("metrc_posted_tags.json", POSTED_TAGS_FILE),
        ("metrc_linked_tags.json", LINKED_TAGS_FILE),
    ]
    for name, dst in pairs:
        src = os.path.join(src_dir, name)
        if os.path.exists(src) and not os.path.exists(dst):
            try:
                with open(src, "r", encoding="utf-8") as f:
                    data = json.load(f)
                _save_json(dst, data)
            except Exception:
                pass


# ---------------------------------------------------------------------------
#  Bulk fetch from Apex (Fresh Pull only)
# ---------------------------------------------------------------------------
def _fetch_all_products():
    all_products = []
    page = 1
    updated_at_from = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%dT%H:%M:%SZ')
    url = f"{slc.APEX_API_V1}/products"
    while page <= 100:
        params = {'updated_at_from': updated_at_from, 'per_page': 100,
                  'page': page, 'include_archived': 'true'}
        resp = requests.get(url, headers=slc.apex_headers, params=params, timeout=60)
        if resp.status_code != 200:
            break
        data = resp.json()
        products = data.get('products', []) if isinstance(data, dict) else data
        if not products:
            break
        all_products.extend(products)
        if len(products) < 100:
            break
        page += 1
    return all_products


def _fetch_all_batches():
    all_batches = []
    page = 1
    updated_at_from = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%dT%H:%M:%SZ')
    url = f"{slc.APEX_API_V2}/batches"
    while page <= 200:
        params = {'updated_at_from': updated_at_from, 'per_page': 100,
                  'page': page, 'include_archived': 'true'}
        resp = requests.get(url, headers=slc.apex_headers, params=params, timeout=60)
        if resp.status_code != 200:
            break
        data = resp.json()
        batches = data.get('batches', []) if isinstance(data, dict) else data
        if not batches:
            break
        all_batches.extend(batches)
        if len(batches) < 100:
            break
        page += 1
    return all_batches


def fresh_pull():
    deps.progress("Pulling products from Apex…", 10)
    products = _fetch_all_products()
    deps.progress("Pulling batches from Apex…", 55)
    batches = _fetch_all_batches()
    cache = {
        "last_updated": datetime.now().isoformat(timespec="seconds"),
        "products": products,
        "batches": batches,
    }
    save_cache(cache)
    return cache


def update_batch(batch_id, updates):
    url = f"{slc.APEX_API_V2}/batches/{batch_id}"
    try:
        resp = requests.patch(url, headers=slc.apex_headers, json=updates, timeout=30)
        if resp.status_code in (200, 201):
            return True, "ok"
        return False, f"{resp.status_code}: {resp.text[:200]}"
    except Exception as e:
        return False, str(e)


# ---------------------------------------------------------------------------
#  b-api (session-authenticated)
# ---------------------------------------------------------------------------
def _session():
    return deps.session_state.get("bapi_session") or {}


def session_ready():
    return slc._session_ready(_session())


def bapi_fetch_packages(operation_ids):
    """POST /metrc/operation/packages/base per operation id, merged."""
    packages_by_id = {}
    errors = []
    url = f"{BAPI_BASE}/metrc/operation/packages/base"
    headers = slc._bapi_headers(_session())
    for op_id in operation_ids:
        if op_id is None:
            continue
        try:
            resp = requests.post(url, headers=headers,
                                 json={"operationId": op_id}, timeout=30)
        except Exception as e:
            errors.append(f"operation {op_id}: {e}")
            continue
        if resp.status_code != 200:
            errors.append(f"operation {op_id}: HTTP {resp.status_code} "
                          f"{resp.text[:160]}")
            continue
        try:
            payload = resp.json()
        except Exception:
            errors.append(f"operation {op_id}: response was not JSON")
            continue
        pkgs = payload.get("packages") if isinstance(payload, dict) else payload
        if not isinstance(pkgs, list):
            continue
        for p in pkgs:
            if not isinstance(p, dict):
                continue
            pid = p.get("id")
            if pid is None:
                continue
            packages_by_id[pid] = {
                "id": pid,
                "Label": p.get("Label", ""),
                "ProductName": p.get("ProductName", ""),
                "Quantity": p.get("Quantity"),
                "UnitOfMeasureAbbreviation": p.get("UnitOfMeasureAbbreviation", ""),
                "operation_id": op_id,
            }
    return packages_by_id, errors


def _find_batch_in_page(j, batch_id):
    rows = j.get("data") if isinstance(j, dict) else None
    if not isinstance(rows, list):
        return None
    for product in rows:
        if not isinstance(product, dict):
            continue
        for b in product.get("batches") or []:
            if isinstance(b, dict) and b.get("id") == batch_id:
                return b
    return None


def _looks_like_batch(d, batch_id):
    if not isinstance(d, dict) or d.get("id") != batch_id:
        return False
    markers = ("listing_price", "metrc_packages_count", "product_id",
               "disable_inventory_tracking")
    return any(k in d for k in markers)


def _find_batch_anywhere(obj, batch_id, _depth=0):
    if _depth > 8:
        return None
    if isinstance(obj, dict):
        if _looks_like_batch(obj, batch_id):
            return obj
        for v in obj.values():
            hit = _find_batch_anywhere(v, batch_id, _depth + 1)
            if hit is not None:
                return hit
    elif isinstance(obj, list):
        for v in obj:
            hit = _find_batch_anywhere(v, batch_id, _depth + 1)
            if hit is not None:
                return hit
    return None


def bapi_get_full_batch(batch_id, debug=None):
    """Read the current b-api batch object by paging inventory. Never PATCH
    without this read succeeding. Returns (batch_dict, error)."""
    headers = slc._bapi_headers(_session())

    def v_plain(p):     return INVENTORY_PAGINATED, {"page": p}
    def v_perpage(p):   return INVENTORY_PAGINATED, {"page": p, "per_page": 15}
    def v_sorted(p):    return INVENTORY_PAGINATED, {
        "page": p, "per_page": 15, "sort_by": "name", "sort_dir": "asc",
        "search": "", "archived": 0}
    def v_base_list(p): return f"{BAPI_BASE}/inventory", {"page": p}

    variants = [
        ("inventory(base)", v_base_list),
        ("paginated", v_plain),
        ("paginated+per_page", v_perpage),
        ("paginated+sort/search", v_sorted),
    ]
    first_error = None
    for label, builder in variants:
        page = 1
        last_page = None
        while page <= _MAX_INVENTORY_PAGES:
            url, params = builder(page)
            try:
                resp = requests.get(url, headers=headers, params=params, timeout=30)
            except Exception as e:
                first_error = first_error or f"{label}: {e}"
                break
            if resp.status_code != 200:
                body = (resp.text or "")[:300].replace("\n", " ")
                if debug is not None:
                    debug.append(f"[{label}] page={page} -> HTTP {resp.status_code} :: {body}")
                first_error = first_error or f"{label} HTTP {resp.status_code}: {body}"
                break
            try:
                j = resp.json()
            except Exception:
                first_error = first_error or f"{label}: 200 but non-JSON"
                break
            if last_page is None:
                last_page = j.get("last_page") or 1
            batch = _find_batch_in_page(j, batch_id) or _find_batch_anywhere(j, batch_id)
            if batch is not None:
                return batch, None
            if page >= (last_page or 1):
                break
            page += 1
    return None, (first_error or f"batch #{batch_id} not found in any inventory response")


def _batch_fingerprint(b):
    if not isinstance(b, dict):
        return None
    return {
        "name": b.get("name"),
        "quantity": b.get("quantity"),
        "listing_price": b.get("listing_price"),
        "minimum_sales_price": b.get("minimum_sales_price"),
        "best_by_date": b.get("best_by_date"),
        "restricted": b.get("restricted"),
        "hold": b.get("hold"),
    }


def bapi_post_tag(batch_id, packages_to_set, debug=None):
    """Read-modify-write: link Metrc source package(s) to a batch via
    PATCH /batches/single/full/{id}. Returns (success, message, response)."""
    batch_obj, err = bapi_get_full_batch(batch_id, debug=debug)
    if err:
        return False, ("Could not read current batch (not posting to avoid "
                       f"data loss): {err}"), None
    before = _batch_fingerprint(batch_obj)

    minimal = [{
        "id": p.get("id"),
        "Label": p.get("Label", ""),
        "ProductName": p.get("ProductName", ""),
        "Quantity": p.get("Quantity"),
        "UnitOfMeasureAbbreviation": p.get("UnitOfMeasureAbbreviation", ""),
    } for p in packages_to_set]

    body = {
        "batch": batch_obj,
        "terpenes": [],
        "cannabinoids": [],
        "documents": [],
        "metrcPackages": minimal,
        "batchMetrcLabTests": [],
    }
    url = f"{BAPI_BASE}/batches/single/full/{batch_id}"
    try:
        resp = requests.patch(url, headers=slc._bapi_headers(_session()),
                              json=body, timeout=45)
    except Exception as e:
        return False, f"PATCH failed: {e}", None
    if resp.status_code not in (200, 201):
        return False, f"PATCH HTTP {resp.status_code}: {resp.text[:300]}", None
    try:
        rj = resp.json()
    except Exception:
        rj = None

    after_batch, verr = bapi_get_full_batch(batch_id)
    if verr:
        return True, ("Batch updated, but couldn't re-read to verify other "
                      f"fields ({verr}). Please eyeball the batch in Apex."), rj
    after = _batch_fingerprint(after_batch)
    if before and after and before != after:
        changed = [k for k in before if before.get(k) != after.get(k)]
        return True, ("Tag posted, BUT these fields also changed and should not "
                      f"have: {', '.join(changed)}. Check this batch in Apex "
                      "right away."), rj
    return True, "Batch updated.", rj


# ---------------------------------------------------------------------------
#  Harvest existing linked tags
# ---------------------------------------------------------------------------
def _walk_batches(obj, found, _depth=0):
    if _depth > 10:
        return
    if isinstance(obj, dict):
        if "id" in obj and (
                "product_id" in obj or "metrc_packages_count" in obj
                or "disable_inventory_tracking" in obj):
            found.append(obj)
        for v in obj.values():
            _walk_batches(v, found, _depth + 1)
    elif isinstance(obj, list):
        for v in obj:
            _walk_batches(v, found, _depth + 1)


def _looks_like_metrc_tag(s):
    if not isinstance(s, str):
        return False
    s = s.strip()
    if not (20 <= len(s) <= 28):
        return False
    if not s.isalnum():
        return False
    return any(c.isalpha() for c in s) and any(c.isdigit() for c in s)


def _metrc_tag_in_obj(obj, _depth=0):
    if _depth > 8:
        return ""
    if isinstance(obj, dict):
        for k in ("Label", "metrc_package_label", "metrc_tag", "label", "tag"):
            v = obj.get(k)
            if _looks_like_metrc_tag(v):
                return v.strip()
        for v in obj.values():
            hit = _metrc_tag_in_obj(v, _depth + 1)
            if hit:
                return hit
    elif isinstance(obj, list):
        for v in obj:
            hit = _metrc_tag_in_obj(v, _depth + 1)
            if hit:
                return hit
    elif _looks_like_metrc_tag(obj):
        return obj.strip()
    return ""


def _batch_tag_count(b):
    for k in ("metrc_packages_count", "metrcPackagesCount", "metrc_package_count"):
        v = b.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return int(v)
    for k in ("metrc_packages", "metrcPackages", "packages"):
        v = b.get(k)
        if isinstance(v, list) and v:
            return len(v)
    return 0


def bapi_get_batch_metrc_tags(batch_id, headers=None, debug=None):
    headers = headers or slc._bapi_headers(_session())
    url = f"{BAPI_BASE}/metrc/batch/packages"
    try:
        r = requests.post(url, headers=headers, json={"batchId": batch_id}, timeout=30)
    except Exception:
        return []
    if r.status_code != 200:
        return []
    try:
        j = r.json()
    except Exception:
        return []
    pkgs = j.get("packages") if isinstance(j, dict) else (j if isinstance(j, list) else [])
    out = []
    for p in pkgs or []:
        if not isinstance(p, dict):
            continue
        lab = p.get("Label") or ""
        if not _looks_like_metrc_tag(lab):
            lab = _metrc_tag_in_obj(p)
        if lab and lab not in out:
            out.append(lab)
    return out


def bapi_harvest_linked_tags(debug=None):
    """{batch_id(str): tag} for every batch with a linked Metrc package."""
    headers = slc._bapi_headers(_session())

    def v_base(p): return f"{BAPI_BASE}/inventory", {"page": p}
    def v_pag(p):  return INVENTORY_PAGINATED, {"page": p}

    seen = {}
    first_error = None
    for label, builder in (("inventory(base)", v_base), ("paginated", v_pag)):
        page = 1
        last_page = None
        ok_any = False
        while page <= _MAX_INVENTORY_PAGES:
            url, params = builder(page)
            try:
                resp = requests.get(url, headers=headers, params=params, timeout=30)
            except Exception as e:
                first_error = first_error or f"{label}: {e}"
                break
            if resp.status_code != 200:
                first_error = first_error or f"{label} HTTP {resp.status_code}"
                break
            try:
                j = resp.json()
            except Exception:
                break
            ok_any = True
            if last_page is None:
                last_page = j.get("last_page") or 1
            found = []
            _walk_batches(j, found)
            for b in found:
                bid = b.get("id")
                if bid is None:
                    continue
                seen[bid] = {"count": _batch_tag_count(b)}
            if debug is not None:
                debug.append(f"[{label}] page {page}/{last_page}: "
                             f"{len(found)} batches (total {len(seen)})")
            if page >= (last_page or 1):
                break
            page += 1
        if ok_any and seen:
            break

    if not seen:
        return {}, (first_error or "no batches returned by inventory")

    tagged = [bid for bid, info in seen.items() if info["count"] > 0]
    tags = {}
    for i, bid in enumerate(tagged):
        deps.progress(f"Reading tags {i + 1}/{len(tagged)}…",
                      50 + int(45 * (i + 1) / max(1, len(tagged))))
        labels = bapi_get_batch_metrc_tags(bid, headers=headers, debug=debug)
        if labels:
            tags[str(bid)] = ", ".join(labels)
    if not tags:
        return {}, "no tags resolved from /metrc/batch/packages"
    return tags, None


# ---------------------------------------------------------------------------
#  Flat grid rows (one per batch)
# ---------------------------------------------------------------------------
def _get_brand(product):
    brand = product.get('brand')
    if isinstance(brand, dict):
        return brand.get('name') or "No Brand"
    if isinstance(brand, str) and brand.strip():
        return brand.strip()
    for key in ('brand_name', 'vendor_name'):
        v = product.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    for key in ('vendor', 'operation', 'manufacturer'):
        v = product.get(key)
        if isinstance(v, dict) and v.get('name'):
            return v['name']
    return "No Brand"


def _is_archived(product, batch):
    if isinstance(batch, dict) and batch.get('archived') is True:
        return True
    if isinstance(product, dict) and product.get('archived') is True:
        return True
    return False


def _price_to_dollars(batch):
    if not isinstance(batch, dict):
        return "", None
    lp = batch.get('listing_price')
    if lp not in (None, ""):
        try:
            val = float(lp)
            return f"${val:.2f}", round(val, 2)
        except Exception:
            pass
    raw = batch.get('listing_price_raw')
    if isinstance(raw, (int, float)):
        val = raw / 100
        return f"${val:.2f}", round(val, 2)
    return "", None


def _parse_source_packages(batch):
    if not isinstance(batch, dict):
        return []
    raw = None
    for parent in ('source_packages', 'sourcePackages', 'source_package',
                   'metrc_source_packages', 'packages', 'metrc_packages',
                   'metrcPackages'):
        v = batch.get(parent)
        if isinstance(v, list) and v:
            raw = v
            break
        if isinstance(v, dict):
            raw = [v]
            break
    if not raw:
        return []
    out = []
    for pkg in raw:
        if isinstance(pkg, str):
            if pkg.strip():
                out.append({"tag": pkg.strip(), "label": "", "qty": None,
                            "uom": "", "item": ""})
            continue
        if not isinstance(pkg, dict):
            continue
        tag = ""
        for k in ('metrc_package_label', 'metrc_tag', 'metrc_label',
                  'metrc_uid', 'package_label', 'Label', 'label', 'tag'):
            val = pkg.get(k)
            if isinstance(val, str) and val.strip():
                tag = val.strip()
                break
        qty = None
        for k in ('available_quantity', 'quantity_available', 'remaining_quantity',
                  'quantity', 'qty', 'amount', 'weight'):
            val = pkg.get(k)
            if isinstance(val, bool):
                continue
            if isinstance(val, (int, float)):
                qty = val
                break
            if isinstance(val, str):
                try:
                    qty = float(val) if '.' in val else int(val)
                    break
                except Exception:
                    pass
        uom = ""
        for k in ('unit_of_measure', 'unit_of_measurement', 'uom', 'unit',
                  'measurement', 'unit_of_measure_name'):
            val = pkg.get(k)
            if isinstance(val, dict):
                val = val.get('name') or val.get('abbreviation') or val.get('symbol')
            if isinstance(val, str) and val.strip():
                uom = val.strip()
                break
        out.append({"tag": tag, "qty": qty, "uom": uom})
    return out


def _get_metrc_tag(batch):
    if not isinstance(batch, dict):
        return ""
    candidates = [
        'metrc_package_label', 'metrc_package_tag', 'metrc_tag', 'metrc_label',
        'package_label', 'package_tag', 'metrc_uid', 'metrc_id',
        'metrc_package', 'tag',
    ]
    for key in candidates:
        v = batch.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    metrc = batch.get('metrc')
    if isinstance(metrc, dict):
        for key in ('package_label', 'package_tag', 'label', 'tag', 'uid'):
            v = metrc.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    pkgs = (batch.get('packages') or batch.get('metrc_packages')
            or batch.get('metrcPackages'))
    if isinstance(pkgs, list) and pkgs and isinstance(pkgs[0], dict):
        for key in ('Label', 'label', 'tag', 'package_label', 'metrc_tag', 'uid'):
            v = pkgs[0].get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return ""


def _get_qty(batch):
    if not isinstance(batch, dict):
        return 0
    candidates = [
        'quantity', 'inventory_quantity', 'available_quantity',
        'quantity_available', 'available', 'units_available', 'on_hand',
        'on_hand_quantity', 'stock', 'qty', 'qty_available',
    ]
    for key in candidates:
        v = batch.get(key)
        if isinstance(v, bool):
            continue
        if isinstance(v, (int, float)):
            return v
        if isinstance(v, str):
            s = v.strip()
            try:
                return float(s) if '.' in s else int(s)
            except Exception:
                pass
    inv = batch.get('inventory')
    if isinstance(inv, dict):
        for key in ('quantity', 'available', 'available_quantity',
                    'on_hand', 'count'):
            v = inv.get(key)
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                return v
    return 0


def build_inventory_rows(cache, posted_tags=None, linked_tags=None):
    products = cache.get("products", []) or []
    batches = cache.get("batches", []) or []
    posted_tags = posted_tags or {}
    linked_tags = linked_tags or {}
    product_by_id = {p.get('id'): p for p in products if isinstance(p, dict)}

    rows = []
    for b in batches:
        if not isinstance(b, dict):
            continue
        pid = b.get('product_id')
        product = product_by_id.get(pid)
        if product is None and isinstance(b.get('product'), dict):
            product = b['product']
        product_name = (product or {}).get('name', "(unknown product)")
        price_str, price_num = _price_to_dollars(b)
        src = _parse_source_packages(b)
        tag = _get_metrc_tag(b)
        if not tag and src:
            tag = ", ".join(s["tag"] for s in src if s["tag"])
        linked = (linked_tags.get(str(b.get('id')))
                  or linked_tags.get(b.get('id')))
        if linked:
            tag = linked
        posted = posted_tags.get(str(b.get('id'))) or posted_tags.get(b.get('id'))
        if posted:
            tag = posted
        qty = _get_qty(b)
        uom = ""
        if (not qty) and src:
            pkg_qtys = [s["qty"] for s in src if isinstance(s["qty"], (int, float))]
            if pkg_qtys:
                qty = sum(pkg_qtys)
            pkg_uoms = [s["uom"] for s in src if s["uom"]]
            if pkg_uoms:
                uom = pkg_uoms[0]
        rows.append({
            "batch_id": b.get('id'),
            "product_id": pid,
            "operation_id": b.get('operation_id'),
            "product_name": product_name,
            "batch": b.get('name', ""),
            "brand": _get_brand(product or {}),
            "metrc_tag": tag,
            "qty": qty,
            "uom": uom,
            "price": price_str,
            "price_num": price_num,
            "archived": _is_archived(product, b),
        })
    return rows
