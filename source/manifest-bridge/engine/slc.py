import streamlit as st
import requests
import pandas as pd
from datetime import datetime, timedelta, time as dtime, timezone
from collections import defaultdict
from functools import lru_cache
from io import BytesIO
import base64
import re
import time
import json
import os
import shutil
import unicodedata
import uuid

# One shared HTTP session per process: connection pooling kills the per-call
# TLS handshake (~150 ms × every METRC/Apex call), and transient 5xx retries
# apply to idempotent GET/HEAD ONLY — never POST/PATCH, where a blind retry
# could double-post a payment or write.
from requests.adapters import HTTPAdapter
try:
    from urllib3.util.retry import Retry
    _RETRY = Retry(total=2, connect=2, read=1, backoff_factor=0.3,
                   status_forcelist=(502, 503, 504),
                   allowed_methods=frozenset({"GET", "HEAD"}))
except Exception:
    _RETRY = 2
_HTTP = requests.Session()
_HTTP_ADAPTER = HTTPAdapter(pool_connections=8, pool_maxsize=16,
                            max_retries=_RETRY)
_HTTP.mount("https://", _HTTP_ADAPTER)
_HTTP.mount("http://", _HTTP_ADAPTER)

try:
    from pypdf import PdfReader
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

# ============================================================
# CONFIGURATION
# ============================================================
APEX_API_KEY = "202|mByvYve7urNJxTu6vuDLlW71BjgFDAjhyWZr1rUl"
APEX_BASE_URL = "https://app.apextrading.com/api/v1/shipping-orders"
APEX_API_V1 = "https://app.apextrading.com/api/v1"   # products / inventory
INVENTORY_CACHE_FILE = "apex_inventory.json"

METRC_BASE_URL = "https://api-ma.metrc.com"
METRC_VENDOR_KEY = "nI-0nlwbkmp86yAWc-2iyLugyIDlB4kG2kOn3iGAOnnO5GD8"
METRC_USER_KEY = "9s0Ac-rGgWDgW5gnFAdMNyV1zaAoVdRexu6Cn6BsLhse6ICA"

LICENSE_CULTIVATOR = "MC281714"
LICENSE_MANUFACTURER = "MP281909"

INDEX_PATHS = [
    'metrc_transfer_index.json',
    os.path.expanduser('~/Desktop/tg/gstg/metrc_transfer_index.json'),
]

# CSV index — the primary data source (from parallel pull script)
CSV_INDEX_PATH = os.path.expanduser('~/Desktop/TG/GsTG/metrc_all_transfers_20260310_234454.csv')

apex_headers = {
    'Authorization': f'Bearer {APEX_API_KEY}',
    'Accept': 'application/json'
}
metrc_auth = (METRC_VENDOR_KEY, METRC_USER_KEY)
metrc_headers = {'Accept': 'application/json'}

# ── Apex b-api (browser-session auth) — edits the REAL order, not the cart ──
# These calls use your logged-in browser session (cookie + x-xsrf-token +
# current-company-id), NOT the bearer API token. Same mechanism metrc_tagging uses.
BAPI_BASE = "https://app.apextrading.com/b-api"
APP_ORIGIN = "https://app.apextrading.com"
DEFAULT_COMPANY_ID = "4064"
APEX_URL = "https://app.apextrading.com/"
_BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
               "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36")

# ── Force night (dark) theme ────────────────────────────────
# Streamlit reads the theme from .streamlit/config.toml at startup, so pin the
# dark base there. (Applies on the next app start / reboot.)
try:
    os.makedirs(".streamlit", exist_ok=True)
    _cfg = os.path.join(".streamlit", "config.toml")
    _cur = open(_cfg).read() if os.path.exists(_cfg) else ""
    if 'base = "dark"' not in _cur:
        with open(_cfg, "w") as _f:
            _f.write('[theme]\nbase = "dark"\n')
except Exception:
    pass

st.set_page_config(page_title="Apex vs METRC Checker", page_icon="📋", layout="wide")

st.markdown("""<style>
.dataframe th { background-color: #4CAF50; color: white; font-weight: bold; text-align: center; padding: 12px; }
.dataframe td { text-align: center; padding: 10px; }
</style>""", unsafe_allow_html=True)


# ============================================================
# METRC API HELPERS
# ============================================================

def metrc_get(endpoint, license_number, extra_params=None):
    url = f"{METRC_BASE_URL}{endpoint}"
    params = {'licenseNumber': license_number}
    if extra_params:
        params.update(extra_params)
    try:
        resp = _HTTP.get(url, auth=metrc_auth, headers=metrc_headers, params=params, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, dict) and 'Data' in data:
                return data
            elif isinstance(data, list):
                return {'Data': data, 'Total': len(data)}
            return data
        return None
    except:
        return None


def get_transfer_deliveries(transfer_id, license_number):
    """Fetch delivery details for a transfer. RELIABLE endpoint."""
    result = metrc_get(f'/transfers/v2/{transfer_id}/deliveries', license_number)
    if result and result.get('Data'):
        return result['Data']
    return []


def get_delivery_packages(delivery_id, license_number):
    result = metrc_get(f'/transfers/v2/deliveries/{delivery_id}/packages', license_number)
    if result and result.get('Data'):
        return result['Data']
    return []


def load_packages_for_transfer(transfer_id, license_number=None):
    """Load all packages for a transfer. If license unknown, try both."""
    licenses_to_try = [license_number] if license_number else [LICENSE_MANUFACTURER, LICENSE_CULTIVATOR]
    
    for lic in licenses_to_try:
        deliveries = get_transfer_deliveries(str(transfer_id), lic)
        if deliveries:
            all_packages = []
            for d in deliveries:
                d_id = d.get('Id')
                time.sleep(0.15)
                pkgs = get_delivery_packages(d_id, lic)
                if pkgs:
                    for p in pkgs:
                        p['_DeliveryId'] = d_id
                        p['_RecipientFacilityName'] = d.get('RecipientFacilityName', 'N/A')
                        p['_InvoiceNumber'] = d.get('InvoiceNumber', '')
                    all_packages.extend(pkgs)
            return all_packages, deliveries, lic
    
    return [], [], None


def download_manifest_pdf(transfer_id, license_number):
    """Download the manifest PDF from METRC API."""
    licenses = [license_number] if license_number else [LICENSE_MANUFACTURER, LICENSE_CULTIVATOR]
    
    for lic in licenses:
        url = f"{METRC_BASE_URL}/transfers/v2/manifest/{transfer_id}/pdf"
        params = {'licenseNumber': lic}
        try:
            resp = _HTTP.get(url, auth=metrc_auth, headers=metrc_headers, params=params, timeout=30)
            st.caption(f"📄 PDF API: HTTP {resp.status_code} ({len(resp.content)} bytes)")
            
            if resp.status_code == 200:
                # Check if raw PDF
                if resp.content[:4] == b'%PDF':
                    return resp.content
                
                # METRC returns PDF as JSON: {"FileContents": "<base64 encoded PDF>"}
                try:
                    data = resp.json()
                    if 'FileContents' in data:
                        pdf_bytes = base64.b64decode(data['FileContents'])
                        if pdf_bytes[:4] == b'%PDF':
                            st.caption(f"   ✅ Decoded base64 PDF ({len(pdf_bytes)} bytes)")
                            return pdf_bytes
                except:
                    pass
                
                st.caption(f"   ⚠️ Response not recognized as PDF")
        except Exception as e:
            st.caption(f"   Exception: {e}")
    
    return None


def parse_manifest_pdf_batches(pdf_bytes):
    """
    Parse the manifest PDF to extract batch names per package.
    Returns a dict: {package_tag: batch_name}
    Same logic as streamlit11's parse_metrc_manifest.
    """
    if not HAS_PYPDF or not pdf_bytes:
        return {}
    
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
    except:
        return {}
    
    if not text:
        return {}
    
    batches_by_tag = {}
    
    # Split by package sections
    pattern = r'(\d+)\s*\.\s*Package\s*\|\s*(?:Shipped|Accepted)'
    sections = re.split(pattern, text)
    
    for i in range(1, len(sections), 2):
        if i + 1 >= len(sections):
            break
        
        section = sections[i + 1]
        
        # Extract the PACKAGE tag.
        # pypdf frequently splits the package tag across many lines
        # (e.g. "1\nA\n40\nA\n...\n2000013200"), so a single-line regex skips it
        # and instead grabs the next tag that happens to sit on one line — the
        # Source Package(s) tag. That is the WRONG identifier (it never matches
        # the API's PackageLabel) and it collides whenever two packages share a
        # source package (the two Super Booms both point at ...009501), silently
        # dropping a row. Collapse whitespace first, then take the first 24-char
        # tag: in document order the package tag precedes Source Package(s), so
        # the first match is the one we want.
        despaced = re.sub(r'\s+', '', section)
        tag_match = (re.search(r'1A[A-Z0-9]{22}', despaced)
                     or re.search(r'1A[A-Z0-9]{10,}', section))
        tag = tag_match.group(0) if tag_match else None
        
        # Extract Source Production Batch
        batch = ''
        batch_match = re.search(r'Source Production Batch\s+(TG\s+[^\n]+\s+-\s+\d+\s*\([A-Z]\))', section)
        if not batch_match:
            batch_match = re.search(r'Source Production Batch\s+([^\n]+\s+\d+\s+[A-Z]\d+\s*\([A-Z]\))', section)
        if not batch_match:
            batch_match = re.search(r'Source Production Batch\s+([^\n]{5,100})', section)
        
        if batch_match:
            batch = batch_match.group(1).strip()
            batch = re.sub(r'\s+', ' ', batch)
        
        if tag and batch:
            batches_by_tag[tag] = batch
    
    return batches_by_tag


def _norm_tag(t):
    """Normalize a METRC package tag for reliable matching: uppercase and keep
    only alphanumerics, so stray whitespace/punctuation can't break a match."""
    return re.sub(r'[^A-Z0-9]', '', str(t).upper()) if t else ''


def _has_real_batch(v):
    """True only if v carries an actual batch value (not None, '', [], or a
    list of blanks)."""
    if not v:
        return False
    if isinstance(v, list):
        return any(x and str(x).strip() for x in v)
    return bool(str(v).strip())


def enrich_packages_with_pdf(packages, transfer_id, license_number):
    """
    Download the manifest PDF and use it to fill in missing batch names.

    Batches are matched to packages STRICTLY by package tag. We deliberately do
    NOT fall back to positional matching: the PDF parse order and the API
    package order can diverge (a dropped/extra parse entry, a reordered
    delivery), and a blind position match silently assigns one product's batch
    to a different product — e.g. Stud Muffin's batch landing on the Strawberry
    Cookies row. Any package we can't match by tag is left untouched here and is
    handled downstream in convert_metrc_packages (inherit from an identical
    item, else fall back to the item name), which can never cross-contaminate
    one product with another's batch.
    """
    pdf_bytes = download_manifest_pdf(transfer_id, license_number)
    if not pdf_bytes:
        st.caption("⚠️ PDF download failed — using API data only")
        return packages
    
    pdf_batches = parse_manifest_pdf_batches(pdf_bytes)
    st.caption(f"📄 PDF parsed: found {len(pdf_batches)} batch names")
    
    if not pdf_batches:
        st.caption("⚠️ No batches parsed from PDF")
        return packages
    
    # Normalized tag -> batch lookup from the PDF
    pdf_by_tag = {_norm_tag(tag): batch for tag, batch in pdf_batches.items()}

    # Debug: show what tags PDF found vs API
    api_tags = [pkg.get('PackageLabel', '') for pkg in packages]
    st.caption(f"   PDF tags: {list(pdf_batches.keys())[:5]}")
    st.caption(f"   API tags: {api_tags[:5]}")

    # Fill missing batches by TAG ONLY — never by position.
    enriched = 0
    for pkg in packages:
        if _has_real_batch(pkg.get('SourceProductionBatchNumbers')):
            continue
        key = _norm_tag(pkg.get('PackageLabel', ''))
        if key and key in pdf_by_tag:
            pkg['SourceProductionBatchNumbers'] = pdf_by_tag[key]
            pkg['_BatchFromPDF'] = True
            enriched += 1

    still_blank = sum(
        1 for pkg in packages
        if not _has_real_batch(pkg.get('SourceProductionBatchNumbers'))
    )
    msg = f"✅ Enriched {enriched} packages with batch names from PDF"
    if still_blank:
        msg += f" · {still_blank} unmatched by tag (resolved downstream)"
    st.caption(msg)
    return packages


# ============================================================
# CSV INDEX — PRIMARY DATA SOURCE
# ============================================================

@st.cache_data(ttl=300)
def load_csv_index():
    """Load the CSV transfer index. Cached 5 min."""
    # Try multiple possible paths
    paths_to_try = [
        CSV_INDEX_PATH,
        'metrc_all_transfers_20260310_234454.csv',
        os.path.expanduser('~/Desktop/tg/gstg/metrc_all_transfers_20260310_234454.csv'),
    ]
    for p in paths_to_try:
        if os.path.exists(p):
            try:
                df = pd.read_csv(p, dtype=str).fillna('')
                transfers = []
                # to_dict('records') is ~10x faster than iterrows here
                for row in df.to_dict('records'):
                    tid = row.get('TransferID', '')
                    if not tid:
                        continue
                    transfers.append({
                        'transfer_id': int(tid),
                        'manifest_number': row.get('ManifestNumber', ''),
                        'invoice_number': row.get('InvoiceNumber', ''),
                        'recipient_name': row.get('RecipientFacility', ''),
                        'destination_raw': row.get('RecipientFacility', ''),
                        'package_count': int(row.get('PackageCount', 0) or 0),
                        'created_date': row.get('CreatedDate', ''),
                        'license': row.get('License', ''),
                        'recipient_license': row.get('RecipientLicense', ''),
                        'shipment_type': row.get('ShipmentType', ''),
                        'voided': row.get('IsVoided', '').upper() == 'TRUE',
                        'status': row.get('Source', 'CSV'),
                        'created_by': row.get('CreatedByUser', ''),
                    })
                return transfers, p
            except Exception as e:
                st.error(f"Error reading CSV: {e}")
    return [], None


@st.cache_data(ttl=600)
def load_json_index():
    """Fallback: Load the pre-built transfer index JSON."""
    for p in INDEX_PATHS:
        if os.path.exists(p):
            with open(p) as f:
                data = json.load(f)
            return data.get('transfers', [])
    return []


@st.cache_data(ttl=300, show_spinner=False)
def get_csv_last_date():
    """Find the latest LastModified or CreatedDate in the CSV. Cached — this
    renders in the sidebar on EVERY rerun, and an uncached full read_csv there
    taxed every single button click in the app."""
    paths_to_try = [
        CSV_INDEX_PATH,
        'metrc_all_transfers_20260310_234454.csv',
        os.path.expanduser('~/Desktop/tg/gstg/metrc_all_transfers_20260310_234454.csv'),
    ]
    for p in paths_to_try:
        if os.path.exists(p):
            try:
                df = pd.read_csv(p, dtype=str).fillna('')
                # Get the latest date from CreatedDate or LastModified
                dates = []
                for col in ['LastModified', 'CreatedDate']:
                    if col in df.columns:
                        for val in df[col]:
                            if val and len(val) >= 10:
                                try:
                                    dates.append(val[:10])
                                except:
                                    pass
                if dates:
                    dates.sort()
                    return dates[-1], p  # latest date, csv path
            except:
                pass
    return None, None


def fetch_day_from_api(date_str):
    """Fetch all transfers for a single day (24h window) from METRC API."""
    results = []
    start = f"{date_str}T00:00:00%2B00:00"
    end = f"{date_str}T23:59:59%2B00:00"

    combos = [
        ("/transfers/v2/outgoing", LICENSE_MANUFACTURER, "Outgoing-Mfg"),
        ("/transfers/v2/outgoing", LICENSE_CULTIVATOR, "Outgoing-Cult"),
        ("/transfers/v2/incoming", LICENSE_MANUFACTURER, "Incoming-Mfg"),
        ("/transfers/v2/incoming", LICENSE_CULTIVATOR, "Incoming-Cult"),
        ("/transfers/v2/rejected", LICENSE_MANUFACTURER, "Rejected-Mfg"),
        ("/transfers/v2/rejected", LICENSE_CULTIVATOR, "Rejected-Cult"),
    ]

    for endpoint, lic, source_label in combos:
        url = (f"{METRC_BASE_URL}{endpoint}"
               f"?licenseNumber={lic}"
               f"&lastModifiedStart={start}"
               f"&lastModifiedEnd={end}")
        try:
            resp = _HTTP.get(url, auth=metrc_auth, headers=metrc_headers, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                items = data.get('Data', []) if isinstance(data, dict) else data
                for t in items:
                    t['_source'] = source_label
                    t['_license'] = lic
                results.extend(items)
            elif resp.status_code == 429:
                time.sleep(3)
                resp2 = _HTTP.get(url, auth=metrc_auth, headers=metrc_headers, timeout=30)
                if resp2.status_code == 200:
                    data = resp2.json()
                    items = data.get('Data', []) if isinstance(data, dict) else data
                    for t in items:
                        t['_source'] = source_label
                        t['_license'] = lic
                    results.extend(items)
        except:
            pass
        time.sleep(0.5)

    return results


def flatten_api_transfer(t):
    """Convert raw API transfer to CSV row dict."""
    return {
        'TransferID': str(t.get('Id', '')),
        'ManifestNumber': t.get('ManifestNumber', ''),
        'InvoiceNumber': t.get('InvoiceNumber', '') or '',
        'ShipperFacility': t.get('ShipperFacilityName', ''),
        'ShipperLicense': t.get('ShipperFacilityLicenseNumber', ''),
        'RecipientFacility': t.get('RecipientFacilityName', t.get('DeliveryFacilities', '')),
        'RecipientLicense': t.get('RecipientFacilityLicenseNumber', ''),
        'TransporterFacility': t.get('TransporterFacilityName', ''),
        'ShipmentType': t.get('ShipmentTypeName', ''),
        'PackageCount': str(t.get('PackageCount', t.get('DeliveryPackageCount', ''))),
        'DeliveryCount': str(t.get('DeliveryCount', '')),
        'CreatedDate': t.get('CreatedDateTime', ''),
        'LastModified': t.get('LastModifiedDateTime', ''),
        'ReceivedDate': t.get('ReceivedDateTime', ''),
        'EstimatedDeparture': t.get('EstimatedDepartureDateTime', ''),
        'EstimatedArrival': t.get('EstimatedArrivalDateTime', ''),
        'IsVoided': str(t.get('IsVoided', '')),
        'CreatedByUser': t.get('CreatedByUserName', ''),
        'Source': t.get('_source', ''),
        'License': t.get('_license', ''),
    }


def incremental_csv_update():
    """
    Update the CSV from last date through today.
    1. Find last date in CSV
    2. Re-pull that date (overwrite) + every day since through today
    3. Merge new rows into CSV, dedup by TransferID
    4. Overwrite CSV file
    """
    last_date_str, csv_path = get_csv_last_date()

    if not last_date_str or not csv_path:
        st.error("❌ Could not find CSV or determine last date.")
        return 0

    # Build list of days to fetch: last_date through today
    start = datetime.strptime(last_date_str, "%Y-%m-%d")
    end = datetime.now()
    days = []
    current = start
    while current <= end:
        days.append(current.strftime("%Y-%m-%d"))
        current += timedelta(days=1)

    if not days:
        st.info("CSV is already up to date!")
        return 0

    st.write(f"📅 Updating from **{days[0]}** → **{days[-1]}** ({len(days)} days)")
    progress = st.progress(0, text="Pulling new transfers...")

    # Fetch new data day by day
    new_api_rows = []
    for i, day in enumerate(days):
        progress.progress((i + 1) / len(days), text=f"Fetching {day}... ({len(new_api_rows)} new so far)")
        raw = fetch_day_from_api(day)
        for t in raw:
            new_api_rows.append(flatten_api_transfer(t))

    # Also fetch active transfers (no date filter) to catch pending ones
    progress.progress(1.0, text="Fetching active transfers...")
    for endpoint, lic, label in [
        ("/transfers/v2/outgoing", LICENSE_MANUFACTURER, "Active-Outgoing-Mfg"),
        ("/transfers/v2/outgoing", LICENSE_CULTIVATOR, "Active-Outgoing-Cult"),
        ("/transfers/v2/incoming", LICENSE_MANUFACTURER, "Active-Incoming-Mfg"),
        ("/transfers/v2/incoming", LICENSE_CULTIVATOR, "Active-Incoming-Cult"),
    ]:
        url = f"{METRC_BASE_URL}{endpoint}?licenseNumber={lic}"
        try:
            resp = _HTTP.get(url, auth=metrc_auth, headers=metrc_headers, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                items = data.get('Data', []) if isinstance(data, dict) else data
                for t in items:
                    t['_source'] = label
                    t['_license'] = lic
                    new_api_rows.append(flatten_api_transfer(t))
        except:
            pass
        time.sleep(0.3)

    if not new_api_rows:
        progress.empty()
        st.info("No new transfers found.")
        return 0

    # Read existing CSV
    existing_df = pd.read_csv(csv_path, dtype=str).fillna('')

    # Convert new rows to DataFrame
    new_df = pd.DataFrame(new_api_rows).fillna('')

    # Combine: existing + new
    combined = pd.concat([existing_df, new_df], ignore_index=True)

    # Deduplicate: keep LAST occurrence (so new data overwrites old)
    combined = combined.drop_duplicates(subset='TransferID', keep='last')

    # Sort by TransferID
    combined['_sort'] = pd.to_numeric(combined['TransferID'], errors='coerce')
    combined = combined.sort_values('_sort').drop(columns=['_sort'])

    # Write back to CSV
    combined.to_csv(csv_path, index=False)

    added = len(combined) - len(existing_df)
    progress.empty()

    # Clear cached data so it reloads
    load_csv_index.clear()

    return len(new_api_rows), len(combined), len(days)


def get_full_index():
    """Load CSV index as primary, fall back to JSON."""
    csv_data, csv_path = load_csv_index()
    if csv_data:
        return csv_data
    return load_json_index()


def search_by_invoice(invoice_num):
    """Search for a transfer by METRC invoice number.
    1. Check CSV index (instant)
    2. If not found, check live API for active transfers
    """
    invoice_str = str(invoice_num).strip()

    # Check full index
    full = get_full_index()
    matches = [t for t in full if str(t.get('invoice_number', '')) == invoice_str]
    if matches:
        return matches

    # If not in CSV, try active API endpoints
    for endpoint, lic in [
        ("/transfers/v2/outgoing", LICENSE_MANUFACTURER),
        ("/transfers/v2/outgoing", LICENSE_CULTIVATOR),
    ]:
        url = f"{METRC_BASE_URL}{endpoint}?licenseNumber={lic}"
        try:
            resp = _HTTP.get(url, auth=metrc_auth, headers=metrc_headers, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                items = data.get('Data', []) if isinstance(data, dict) else data
                for t in items:
                    if str(t.get('InvoiceNumber', '') or '') == invoice_str:
                        tid = t.get('Id', 0)
                        return [{
                            'manifest_number': t.get('ManifestNumber', str(tid).zfill(10)),
                            'transfer_id': tid,
                            'invoice_number': invoice_str,
                            'recipient_name': t.get('RecipientFacilityName', t.get('DeliveryFacilities', '')),
                            'package_count': t.get('PackageCount', t.get('DeliveryPackageCount', 0)),
                            'created_date': t.get('CreatedDateTime', ''),
                            'license': lic,
                            'status': 'ACTIVE (live)',
                        }]
        except:
            pass

    return []


def search_index(query):
    """Search by any field (invoice, recipient, manifest)"""
    index = get_full_index()
    q = str(query).strip().lower()
    return [t for t in index if
            q in str(t.get('invoice_number', '')).lower() or
            q in str(t.get('recipient_name', '')).lower() or
            q in str(t.get('manifest_number', '')).lower() or
            q in str(t.get('destination_raw', '')).lower()]


# ============================================================
# APEX API
# ============================================================

# Last HTTP status the v1 bearer API answered with — lets callers tell a
# genuine "no such order" (200, empty list) from the API refusing to answer
# at all (429 = monthly API spending cap reached) and fall back to b-api.
APEX_V1_LAST = {'status': None}


def get_order_by_invoice_number(invoice_number):
    params = {'invoice_number': invoice_number, 'updated_at_from': '2024-01-01T00:00:00Z', 'per_page': 10}
    try:
        resp = _HTTP.get(APEX_BASE_URL, headers=apex_headers, params=params,
                         timeout=30)
        APEX_V1_LAST['status'] = resp.status_code
        if resp.status_code == 200:
            orders = resp.json().get('orders', [])
            return orders[0].get('id') if orders else None
        return None
    except:
        return None


def get_order_details(order_id):
    try:
        resp = _HTTP.get(f"{APEX_BASE_URL}/{order_id}", headers=apex_headers,
                         params={'with_history': 'true', 'with_deal_flow': 'true'},
                         timeout=30)
        APEX_V1_LAST['status'] = resp.status_code
        return resp.json() if resp.status_code == 200 else None
    except:
        return None


# ============================================================
# INVOICE DOWNLOAD  (GET /api/v1/shipping-orders/{id}  →  PDF / HTML)
# ============================================================
# The documented v1 endpoint returns the invoice DATA (not a PDF). We pull that
# JSON with the bearer token (get_order_details) and render a downloadable
# invoice ourselves: a clean PDF when reportlab is installed, otherwise a
# self-contained HTML file the browser can print to PDF.

def fetch_invoice_order(order_id):
    """GET the full order from the documented v1 endpoint and return the inner
    order dict. Returns (order_dict | None, message)."""
    if not str(order_id).strip():
        return None, "Enter an order id."
    j = get_order_details(str(order_id).strip())
    if not j:
        return None, (f"Apex returned no data for order {order_id} "
                      "(check the id and that the bearer token has "
                      "view:shipping-orders).")
    order = j.get('order') if isinstance(j, dict) and 'order' in j else j
    if not isinstance(order, dict) or not order:
        return None, "Response did not contain an order object."
    return order, f"Loaded invoice {order.get('invoice_number') or order_id}."


def _inv_money_str(order, key, default="—"):
    """Formatted '$X,XXX.XX' for a top-level money field — shape-aware via
    _order_money, so it reads correctly whether `order` came from the v1 API
    (formatted dollar strings) or a b-api read like bulk-fetch-invoices
    (integer cents)."""
    v = _order_money(order, key)
    if v is None:
        return default
    return f"${v:,.2f}"


def _parse_money(s):
    """'$1,234.50' -> 1234.50 ; returns None if it can't parse. The v1 endpoint's
    formatted strings are in dollars, so this is scale-safe (no cents guessing)."""
    if s is None:
        return None
    try:
        return float(re.sub(r'[^0-9.\-]', '', str(s)))
    except (ValueError, TypeError):
        return None


def _addr_lines(order, prefix):
    """Build address lines from ship_* or ship_from_* fields."""
    g = lambda k: (order.get(f"{prefix}{k}") or "").strip()
    name = g("name")
    l1, l2 = g("line_one"), g("line_two")
    city, state, zp = g("city"), g("state"), g("zip")
    lines = []
    if name:
        lines.append(name)
    if l1:
        lines.append(l1)
    if l2:
        lines.append(l2)
    # Apex keeps the comma after the city even when the state is blank
    # ('Lakeville,  02347'), so append it to the city rather than joining.
    csz = (city + "," if city else "")
    if state:
        csz = (csz + " " + state).strip()
    if zp:
        csz = (csz + " " + zp).strip()
    if csz.strip(", "):
        lines.append(csz)
    return lines


def _fmt_num(x):
    """1.0 -> '1' ; 1.5 -> '1.5' — trims the trailing zero Apex's own UI trims."""
    try:
        f = float(x)
    except (TypeError, ValueError):
        return str(x)
    return f"{f:g}"


def _operation_label(order, item):
    """The facility/license header a line belongs to, e.g. 'Twisted Growers -- MP281909'
    — matches the section dividers on the real Apex invoice. Looked up from the
    order's opsRepresented list by operation_id (fallback: matching state_license)."""
    ops = order.get('opsRepresented') or []
    lic = item.get('operation_license') or ''
    oid_ = item.get('operation_id')
    match = None
    if oid_ is not None:
        match = next((o for o in ops if o.get('id') == oid_), None)
    if not match and lic:
        match = next((o for o in ops if o.get('state_license') == lic), None)
    if match:
        name = match.get('name') or ''
        slic = match.get('state_license') or lic
        return f"{name} -- {slic}".strip(' -') if name else (slic or "Items")
    return lic or "Items"


def _invoice_line_rows(order):
    """Normalize items[] into rich rows matching the real Apex invoice's per-line
    detail: brand/product/note, batch + cultivar, potency, container/package/weight,
    qty (+ units-total breakdown), unit price, line amount, and the facility/license
    group ('op_label') this line belongs to.
    order_quantity is a plain count in both API shapes (no scaling needed);
    order_price is dollars-as-string on v1 but CENTS-as-int on a b-api order
    (e.g. bulk-fetch-invoices) — divide by 100 for that shape or every price/amount
    on the invoice comes out 100x too high."""
    bapi = _is_bapi_order(order)
    rows = []
    for it in (order.get('items') or []):
        qty = _parse_money(it.get('order_quantity')) or 0
        oum = it.get('order_unit_measurement') or {}
        unit = (oum.get('alias') or oum.get('name') or "") if isinstance(oum, dict) else str(oum)
        uname = (oum.get('name') or '').strip().lower() if isinstance(oum, dict) else str(oum).lower()
        raw_price = it.get('order_price')
        if bapi and isinstance(raw_price, (int, float)):
            unit_price = float(raw_price) / 100.0
        else:
            unit_price = _parse_money(raw_price)
        # Keep v1's pre-formatted '$240.00' strings verbatim; anything else
        # (bapi cents, or a lean source's bare 240.0 float) gets formatted so
        # the invoice never shows a dollar-less price.
        if (not bapi) and isinstance(raw_price, str) and raw_price.strip().startswith('$'):
            unit_price_str = raw_price
        else:
            unit_price_str = ""
        amount = (qty * unit_price) if (unit_price is not None) else None

        # ── Line modifiers (pricing tiers, manual discounts/surcharges).
        #    Apex reprices the LINE and prints e.g. "Customer Discount:
        #    -$132.89" under it — a tier applied via change-pricing-tier adds
        #    {amount: 13289, type: "discount", reason: "Pricing Tier"} per
        #    item (amount in CENTS). Without this, tier-priced invoices
        #    downloaded here showed full price. ──
        mod_lines = []
        mod_total = 0.0                      # signed dollars; discounts negative
        for m in (it.get('modifiers') or []):
            if not isinstance(m, dict) or m.get('deleted_at'):
                continue
            mv = m.get('amount')
            mv = (float(mv) / 100.0 if isinstance(mv, (int, float))
                  else (_parse_money(mv) or 0.0))
            if not mv:
                continue
            sign = -1.0 if str(m.get('type', '')).lower() == 'discount' else 1.0
            mod_total += sign * mv
            mod_lines.append(("Customer Discount" if sign < 0 else "Surcharge",
                              sign * mv))
        if amount is not None and mod_total:
            amount += mod_total

        try:
            upc = float(it.get('units_per_case') or 0)
        except (TypeError, ValueError):
            upc = 0.0
        is_case = uname.startswith('case')
        units_total = (qty * upc) if (is_case and upc > 0) else qty

        cultivar = ((it.get('cultivar') or {}).get('name')
                    if isinstance(it.get('cultivar'), dict) else None)

        pmin = it.get('predominate_canabinoid_min_or_only')
        pmax = it.get('predominate_canabinoid_max')
        punit = it.get('predominate_canabinoid_unit') or '%'
        pcan = it.get('predominate_canabinoid')
        pname = (pcan.get('abbreviation') if isinstance(pcan, dict) else None) or 'THC'
        potency = ""
        if pmin not in (None, ''):
            try:
                if pmax not in (None, '') and float(pmax) != float(pmin):
                    potency = f"{_fmt_num(pmin)} - {_fmt_num(pmax)} {punit} {pname}"
                else:
                    potency = f"{_fmt_num(pmin)} {punit} {pname}"
            except (TypeError, ValueError):
                potency = f"{pmin} {punit} {pname}"

        container = ((it.get('container_type') or {}).get('name')
                     if isinstance(it.get('container_type'), dict) else None)

        # 'Prepack · A Bud' / 'Prerolls · Whole Flower' — the italic
        # category · type line under the product name on the real invoice.
        # Field names vary by API shape, so try item-level then nested product.
        _nm = lambda v: (v.get('name') if isinstance(v, dict) else (str(v).strip() if v else '')) or ''
        prod_obj = it.get('product') if isinstance(it.get('product'), dict) else {}
        pcat = _nm(it.get('product_category')) or _nm(prod_obj.get('product_category'))
        ptyp = _nm(it.get('product_type')) or _nm(prod_obj.get('product_type'))
        type_cat = " · ".join(x for x in [pcat, ptyp] if x)

        pkg = ((it.get('packaged_unit_size') or {}).get('name')
               if isinstance(it.get('packaged_unit_size'), dict) else None)
        weight_detail = ""
        if not pkg:
            us = it.get('unit_size')
            usm = it.get('unit_size_unit_measurement') or {}
            usm_name = usm.get('name') if isinstance(usm, dict) else None
            if us not in (None, '') and usm_name:
                weight_detail = f"{_fmt_num(us)} {usm_name}"

        # First attached document id, for the per-line COA doc link
        # (b-api/order-item-historical-doc/{item}/{order}/{doc}) — field name
        # varies by API shape, so probe the likely ones.
        doc_id = None
        for dk in ('historical_documents', 'historical_docs', 'documents', 'docs'):
            dv = it.get(dk)
            if isinstance(dv, list) and dv and isinstance(dv[0], dict) and dv[0].get('id'):
                doc_id = dv[0]['id']
                break

        rows.append({
            'item_id': it.get('id'),
            'doc_id': doc_id,
            'brand': ((it.get('brand') or {}).get('name')
                      if isinstance(it.get('brand'), dict) else None) or '',
            'product': it.get('product_name') or "",
            'batch': it.get('batch_name') or "",
            'cultivar': cultivar or "",
            'potency': potency,
            'container': container or "",
            'package': pkg or "",
            'weight_detail': weight_detail,
            'note': it.get('note') or "",
            'type_cat': type_cat,
            'qty': qty,
            'unit': unit,
            'uname': uname,
            'is_case': is_case,
            'units_total': units_total,
            'unit_price': unit_price_str or ("—" if unit_price is None else f"${unit_price:,.2f}"),
            'amount': (f"${amount:,.2f}" if amount is not None else "—"),
            'mod_lines': mod_lines,   # [("Customer Discount", -132.89), ...]
            'op_label': _operation_label(order, it),
        })
    return rows


def _group_invoice_rows(rows):
    """Group rows by operation label, preserving first-seen order — matches the
    real invoice's per-facility sections (e.g. 'Twisted Growers -- MP281909')."""
    groups, idx = [], {}
    for r in rows:
        key = r['op_label']
        if key not in idx:
            idx[key] = len(groups)
            groups.append((key, []))
        groups[idx[key]][1].append(r)
    return groups


def _invoice_totals_extra(order):
    """(total_units, total_cases) across all line items — matches the Apex
    'Total Units' / 'Total Cases' summary line."""
    total_units = total_cases = 0.0
    for it in (order.get('items') or []):
        try:
            qty = float(it.get('order_quantity') or 0)
        except (TypeError, ValueError):
            qty = 0.0
        oum = it.get('order_unit_measurement') or {}
        uname = (oum.get('name') or '').strip().lower() if isinstance(oum, dict) else str(oum).lower()
        try:
            upc = float(it.get('units_per_case') or 0)
        except (TypeError, ValueError):
            upc = 0.0
        if uname.startswith('case'):
            total_cases += qty
            total_units += (qty * upc) if upc > 0 else qty
        else:
            total_units += qty
    return total_units, total_cases


# It's always Twisted Growers selling — hard fallbacks so the invoice never
# loses its logo/address/licenses when the order came from a lean source
# (v1 fetch or raw order) that lacks seller_company/opsRepresented. The rich
# b-api order still wins when present.
SELLER_NAME_FALLBACK = "Twisted Growers"
SELLER_ADDR_FALLBACK = ["415 Millennium Circle", "Lakeville, Massachusetts 02347"]
SELLER_CONTACT_FALLBACK = ["Vinny DeMartino", "apex@twistedgrowers.com", "+1(860) 481-2754"]
SELLER_LOGO_FALLBACK = ("https://s3-us-west-2.amazonaws.com/upload-app.apextrading.com/"
                        "public/companies/4064/1762478996-Twisted-Growers-LOGOS-TG-LOGOS.png?v=8")


def _seller_from_block(order):
    """FROM block (name + address + licenses + contact). Apex prefers the
    operation's registered facility address over ship_from_* (often blank) —
    confirmed by the rendered invoice DOM showing the opsRepresented address
    when ship_from_city/state were null on the order. Anything a lean order
    shape omits falls back to the known Twisted Growers constants."""
    ops = order.get('opsRepresented') or []
    name = (order.get('ship_from_name') or (order.get('seller_company') or {}).get('name')
            or SELLER_NAME_FALLBACK)
    lines = _addr_lines(order, "ship_from_")
    if len(lines) <= 1:  # just the name (or nothing) — fall back to facility address
        op = ops[0] if ops else {}
        l1, l2 = op.get('line_one') or '', op.get('line_two') or ''
        city = op.get('city') or ''
        st_ = op.get('state')
        state = (st_.get('text') if isinstance(st_, dict) else st_) or ''
        zp = op.get('zip') or ''
        lines = [x for x in [name] if x]
        if l1: lines.append(l1)
        if l2: lines.append(l2)
        csz = (city + "," if city else "")   # comma survives a blank state, like Apex
        if state:
            csz = (csz + " " + state).strip()
        if zp:
            csz = (csz + " " + zp).strip()
        if csz.strip(", "): lines.append(csz)
    if len(lines) <= 1:  # ops missing too (lean order) — known facility address
        lines = [x for x in [name] if x] + SELLER_ADDR_FALLBACK
    licenses = [o.get('state_license') for o in ops if o.get('state_license')]
    if not licenses:
        # lean shape: derive from the licenses the line items actually ship under
        seen = []
        for it in (order.get('items') or []):
            lic = it.get('operation_license')
            if lic and lic not in seen:
                seen.append(lic)
        licenses = seen
    rep = (order.get('sales_reps') or [{}])[0] if order.get('sales_reps') else {}
    contact = [rep.get('name'), rep.get('email'), rep.get('phone')]
    contact = [c for c in contact if c] or list(SELLER_CONTACT_FALLBACK)
    logo = (order.get('seller_company') or {}).get('logoLink') or SELLER_LOGO_FALLBACK
    return {'name': name, 'lines': lines, 'licenses': licenses,
            'contact': contact, 'logo': logo}


def _buyer_to_block(order):
    """SHIP TO block (name + address + license + contact)."""
    lines = _addr_lines(order, "ship_")
    lic = order.get('buyer_state_license')
    contact = [order.get('buyer_contact_name'), order.get('buyer_contact_phone'),
               order.get('buyer_contact_email')]
    contact = [c for c in contact if c]
    if not contact:
        b = order.get('buyer') or {}
        c0 = (b.get('contacts') or [{}])[0] if b.get('contacts') else {}
        contact = [c for c in [c0.get('name'), c0.get('primary_phone'),
                                c0.get('email')] if c]
    return {'lines': lines, 'license': lic, 'contact': contact}


_LOGO_CACHE = {}


def _logo_data_uri(url):
    """Inline the company logo as a data: URI so the PDF render never depends on
    (or waits for) the S3 fetch inside headless Chromium — the logo prints even
    offline, at Apex's exact 100x100 slot. Cached per URL for the session."""
    if url in _LOGO_CACHE:
        return _LOGO_CACHE[url]
    uri = None
    try:
        r = _HTTP.get(url, timeout=8)
        if r.status_code == 200 and r.content:
            mime = (r.headers.get('Content-Type') or 'image/png').split(';')[0].strip()
            if not mime.startswith('image/'):
                mime = 'image/png'
            uri = f"data:{mime};base64,{base64.b64encode(r.content).decode()}"
    except Exception:
        pass
    _LOGO_CACHE[url] = uri
    return uri


def _fmt_date(v):
    """'2026-07-02' -> 'Jul 2, 2026' — matches the Apex invoice's date style.
    %-d (no leading zero) isn't portable across platforms (Windows strftime
    doesn't support it), so trim the zero-padded day ourselves instead."""
    if not v:
        return ""
    try:
        d = datetime.strptime(str(v)[:10], "%Y-%m-%d")
    except Exception:
        return str(v)[:10]
    return f"{d.strftime('%b')} {d.day}, {d.year}"


_SELLER_CO_CACHE = "apex_seller_company.json"


def _with_seller_company(order):
    """Guarantee the invoice has a seller_company block. BOTH lean order reads
    (v1 get_order_details AND bapi_get_order) omit seller_company entirely —
    only rich write-echoes (split, change-pricing-tier, add-payment) carry it,
    so the Make Checks Payable / ACH blocks silently vanished whenever the
    loaded order came from a lean read. Any rich order that passes through
    refreshes the cache; lean orders get the cached block grafted in."""
    try:
        sc = (order or {}).get('seller_company') or {}
        if (sc.get('payment_settings') or {}).get('make_checks_payable'):
            try:
                with open(_SELLER_CO_CACHE, 'w', encoding='utf-8') as f:
                    json.dump(sc, f, indent=1, default=str)
            except Exception:
                pass
            return order
        if os.path.exists(_SELLER_CO_CACHE):
            with open(_SELLER_CO_CACHE, encoding='utf-8') as f:
                cached = json.load(f)
            if cached:
                o2 = dict(order)
                if not sc:
                    o2['seller_company'] = cached
                else:
                    sc2 = dict(sc)
                    for k in ('payment_settings', 'settings', 'name',
                              'logoLink', 'uuid'):
                        if not sc2.get(k) and cached.get(k):
                            sc2[k] = cached[k]
                    o2['seller_company'] = sc2
                return o2
    except Exception:
        pass
    return order


def _fix_payment_typos(ps):
    """Apex's company payment settings carry a typo ('Twised Growers') and a
    clipped phrase ('give Dana 508-...' — missing 'a call') that would print
    on every invoice — correct them on render. Fixing the source field in
    Apex (Settings → Company → Payment) makes this a no-op."""
    def _fx(v):
        if not isinstance(v, str):
            return v
        v = v.replace("Twised", "Twisted")
        v = v.replace("give Dana 508-952-0066",
                      "give Dana a call: 508-952-0066")
        return v
    return {k: _fx(v) for k, v in (ps or {}).items()}


def build_invoice_html(order):
    """A self-contained, printable HTML invoice that mirrors the real Apex
    (Bushel) invoice DOM class-for-class — structure and class names captured
    from the rendered order-invoice page (the data-v-893e210d component tree),
    with a stylesheet rebuilt from its rendered look. Sections, in DOM order:
    uppercase Invoice title + inline INVOICE#/DATE/STATUS meta, FROM/CONTACT/
    LICENSES/logo columns, SHIP TO + DUE DATE/TERMS columns, the bordered
    Delivery chip, the centered 5-column line-item table with gray facility
    group bars, Make Checks Payable / ACH payment blocks, the Total Units/Cases
    + Subtotal/Total + Payments/Outstanding/Due totals column, and the 3-row
    SIGNATURES block. Screen-only widgets on the real page (sort buttons, COA
    download icons, signature pen buttons — all d-print-none) are omitted, and
    the print-only "COA's Available on Digital Copy" note is included, so this
    matches Apex's own printed/PDF output, not its on-screen chrome.
    No dependencies — always works."""
    order = _with_seller_company(order)
    import html as _html
    esc = lambda x: _html.escape(str(x if x is not None else ""))

    inv_no = order.get('invoice_number') or order.get('custom_invoice_number') or order.get('id') or ""
    status = ((order.get('order_status') or {}).get('name')
              if isinstance(order.get('order_status'), dict) else None) \
        or order.get('payment_status') or ""
    seller = _seller_from_block(order)
    buyer = _buyer_to_block(order)
    term_name = ((order.get('term') or {}).get('name')
                 if isinstance(order.get('term'), dict) else order.get('term')) or ""

    rows = _invoice_line_rows(order)
    groups = _group_invoice_rows(rows)

    # ── header meta (rendered as one horizontal strip, labels uppercased) ──
    meta_html = "".join(
        f"<div class='meta-row'><span class='meta-label-compact'>{esc(k)}</span>"
        f"<span class='meta-value-compact'>{esc(v)}</span></div>"
        for k, v in [("Invoice #", inv_no),
                     ("Date", _fmt_date(order.get('order_date'))),
                     ("Status", status)] if v)

    # ── FROM / CONTACT / LICENSES / logo ──
    # The real invoice repeats the company name: once as .company-name and again
    # as the first .address-text line — seller['lines'] already starts with the
    # name, so emitting all lines reproduces that.
    seller_html = (f"<div class='company-name'>{esc(seller['name'])}</div>"
                   + "".join(f"<div class='address-text'>{esc(x)}</div>" for x in seller['lines']))
    seller_contact_html = ("<div class='contact-info'>"
                           + "".join(f"<div class='contact-detail'>{esc(x)}</div>" for x in seller['contact'])
                           + "</div>") if seller['contact'] else ""
    lic_html = "".join(
        f"<div class='license-section'><span class='text-nowrap'>{esc(x)}</span></div>"
        for x in seller['licenses'])
    logo_src = seller['logo']
    if logo_src:
        logo_src = _logo_data_uri(logo_src) or logo_src
    logo_html = (f"<img src='{esc(logo_src)}' class='seller-logo' alt='Company Logo'>"
                 if logo_src else "")

    # ── SHIP TO / CONTACT / terms ──
    buyer_html = "".join(f"<div>{esc(x)}</div>" for x in buyer['lines'])
    if buyer['license']:
        buyer_html += f"<div class='mt-1'>{esc(buyer['license'])}</div>"
    buyer_contact_html = "".join(f"<div class='contact-detail'>{esc(x)}</div>"
                                 for x in buyer['contact'])
    terms_html = "".join(
        f"<div class='term-item'><span class='term-label'>{esc(k)}</span>"
        f"<span class='term-value'>{esc(v)}</span></div>"
        for k, v in [("Due Date", _fmt_date(order.get('due_date'))),
                     ("Terms", term_name)] if v)

    delivery = _fmt_date(order.get('delivery_date'))
    delivery_html = ""
    if delivery:
        delivery_html = (
            "<div class='fulfillment-container mt-1'><div class='fulfillment-details'>"
            "<div class='detail-chip'><span class='chip-label'>Delivery:</span>"
            f"<span class='chip-value'>{esc(delivery)}</span></div></div></div>")

    # ── line items ──
    # Green document icons (file-archive + file-lines) — Apex's PDF prints these
    # under each product name (its PDF keeps d-print-none content), so a carbon
    # copy needs them too. Inline SVG stand-ins for the Font Awesome glyphs.
    # Green file-with-zipper (archive) — white sheet, green border/fold, navy zipper
    icon_zip = ("<svg class='doc-icon' viewBox='0 0 384 512'>"
                "<path fill='#fff' stroke='#5f9e4c' stroke-width='30' "
                "d='M64 16h164l140 140v308c0 18-14 32-32 32H64c-18 0-32-14-32-32V48"
                "c0-18 14-32 32-32z'/>"
                "<path fill='#5f9e4c' d='M228 16l140 140H244c-8.8 0-16-7.2-16-16V16z'/>"
                "<g fill='#3f4f66'>"
                "<rect x='96' y='72' width='42' height='30'/>"
                "<rect x='138' y='112' width='42' height='30'/>"
                "<rect x='96' y='152' width='42' height='30'/>"
                "<rect x='138' y='192' width='42' height='30'/>"
                "<rect x='96' y='232' width='42' height='30'/>"
                "<path d='M104 290c-14 0-26 11-28 25l-8 62c-2 18 14 35 54 35s56-17 54"
                "-35l-8-62c-2-14-14-25-28-25h-36zm4 40h28l6 44c1 8-9 14-20 14s-21-6-20"
                "-14l6-44z'/></g></svg>")
    # Leaf inside circular arrows — Apex's REAL 'bushel-full-panel' asset
    # (/img/icons/doc-full-panel.svg, found via its CSS bundle), embedded as a
    # data URI. Falls back to a hand-drawn stand-in only if the fetch fails.
    _panel_uri = _logo_data_uri(f"{APP_ORIGIN}/img/icons/doc-full-panel.svg")
    if _panel_uri:
        icon_doc = f"<img src='{_panel_uri}' class='doc-icon panel-icon'>"
    else:
        icon_doc = ("<svg class='doc-icon panel-icon' viewBox='0 0 512 512'>"
                    "<g stroke='#48587a' stroke-width='44' fill='none'>"
                    "<path d='M110 190a170 170 0 0 1 286-30'/>"
                    "<path d='M402 322a170 170 0 0 1-286 30'/></g>"
                    "<path fill='#48587a' d='M424 96l30 106-106-24 76-82z'/>"
                    "<path fill='#48587a' d='M88 416L58 310l106 24-76 82z'/>"
                    "<path fill='#79a352' d='M256 130c86 34 112 122 74 196-8 16-22 28-38 "
                    "34-6-44-22-86-56-118 24 42 36 90 32 128-52-8-92-52-92-116 0-58 34-108"
                    " 80-124z'/></svg>")
    # Live download links, same endpoints as the real invoice (Chromium keeps
    # <a href> as clickable PDF link annotations, so they work in the PDF too;
    # the browser session supplies auth when clicked, exactly like Apex's own).
    order_uuid = order.get('uuid') or order.get('order_uuid') or ""
    order_id_ = order.get('id') or ""

    def _linked(icon, href):
        return f"<a href='{esc(href)}'>{icon}</a>" if href else icon

    def name_cell(r):
        h = ""
        if r['brand']:
            h += f"<div>{esc(r['brand'])}</div>"
        h += f"<span class='product-name'>{esc(r['product'])}</span>"
        zip_href = (f"{BAPI_BASE}/order-item-zip/{r['item_id']}/{order_uuid}"
                    if r.get('item_id') and order_uuid else "")
        icons_html = "<div class='documents-section'>" + _linked(icon_zip, zip_href)
        # COA doc icon only when the item actually has a document attached —
        # matches Apex, whose rows without a COA show just the zip icon.
        if r.get('doc_id'):
            doc_href = (f"{BAPI_BASE}/order-item-historical-doc/"
                        f"{r['item_id']}/{order_id_}/{r['doc_id']}"
                        if r.get('item_id') and order_id_ else "")
            icons_html += ("<span class='icon-sep'></span>"
                           + _linked(icon_doc, doc_href))
        icons_html += "</div>"
        cat = (f"<div class='invoice-text-small product-type-category flex-grow-1 "
               f"text-center'>{esc(r.get('type_cat') or '')}</div>")
        h += f"<div class='d-flex align-items-center'>{icons_html}{cat}</div>"
        if r['note']:
            h += (f"<div class='note-text'><span class='note-label'>Note:</span> "
                  f"{esc(r['note'])}</div>")
        return h

    def detail_cell(r):
        parts = []
        if r['batch']:
            parts.append(f"<p class='mb-0 invoice-text-small'><strong>Batch:</strong> {esc(r['batch'])}</p>")
        if r['cultivar']:
            parts.append(f"<div class='invoice-text-small'>({esc(r['cultivar'])})</div>")
        if r['potency']:
            parts.append(f"<p class='invoice-text-small mb-0'><strong>Potency:</strong> {esc(r['potency'])}</p>")
        if r['container']:
            parts.append(f"<p class='mb-0 invoice-text-small'><strong>Container Type:</strong> {esc(r['container'])}</p>")
        return "".join(parts)

    def qty_cell(r):
        if r['is_case']:
            u = "Case" if float(r['qty']) == 1 else "Cases"
        else:
            u = (r['unit'] or "").strip()
            # Apex's unit-measure alias is a bare 'U' — spell it out.
            if u.lower() in ('u', 'un', 'unit', 'units', 'ea', 'each') or not u:
                u = "Unit" if float(r['qty']) == 1 else "Units"
        label = f"{_fmt_num(r['qty'])} {u}"
        h = f"<div><span>{esc(label)}</span></div><div class='invoice-text-small'>"
        if r['is_case']:
            h += f"<p class='mb-0'>{_fmt_num(r['units_total'])} Units total</p>"
        if r['package']:
            h += f"<p class='mb-0'><strong>Package Size:</strong> {esc(r['package'])}</p>"
        elif r['weight_detail']:
            h += f"<p class='mb-0'><strong>Weight:</strong> {esc(r['weight_detail'])}</p>"
        h += "</div>"
        return h

    # Facility group bars appear on Apex's PDF only when the order spans more
    # than one facility/license (1471: two groups -> bars; 1472: one -> none).
    chevron = ("<svg class='chevron' viewBox='0 0 448 512'><path fill='#495057' d='"
               "M201.4 137.4c12.5-12.5 32.8-12.5 45.3 0l160 160c12.5 12.5 12.5 32.8 "
               "0 45.3s-32.8 12.5-45.3 0L224 205.3 86.6 342.6c-12.5 12.5-32.8 12.5"
               "-45.3 0s-12.5-32.8 0-45.3l160-160z'/></svg>")
    show_bars = len(groups) > 1
    group_html = ""
    for label, grows in groups:
        if show_bars:
            group_html += (f"<tr class='group-row'><td colspan='5' class='py-2'>"
                           f"<div class='d-flex align-items-center'>"
                           f"<div class='flex-grow-1'>{esc(label)}</div>"
                           f"{chevron}</div></td></tr>")
        def _mods_cell(r):
            # Tier/manual modifier under the line amount. The Line column is
            # only ~11% wide, so the full "Customer Discount:" label clips —
            # compact two-line form fits: tiny caps label, amount under it.
            out = ""
            for lbl, mv in (r.get('mod_lines') or []):
                short = "Discount" if mv < 0 else "Surcharge"
                amt = f"-${abs(mv):,.2f}" if mv < 0 else f"+${mv:,.2f}"
                out += (f"<p class='m-0' style='font-size:.62rem;color:#868e96;"
                        f"line-height:1.3;margin-top:2px;'>"
                        f"<span style='text-transform:uppercase;"
                        f"letter-spacing:.03em;'>{esc(short)}</span><br>"
                        f"{amt}</p>")
            return out

        group_html += "".join(f"""<tr class="border-bottom break-line">
  <td class="name-cell">{name_cell(r)}</td>
  <td class="detail-cell">{detail_cell(r)}</td>
  <td class="price-cell"><p class="m-0">{esc(r['unit_price'])}</p></td>
  <td class="qty-cell">{qty_cell(r)}</td>
  <td class="line-cell"><span>{esc(r['amount'])}</span>{_mods_cell(r)}</td>
</tr>""" for r in grows)
    if not group_html:
        group_html = "<tr><td colspan='5' class='muted'>No line items.</td></tr>"

    coa_all_inner = f"{icon_zip} Download All COAs"
    if order_uuid:
        coa_all_html = (f"<a class='coa-link' href='{esc(BAPI_BASE)}/"
                        f"order-item-zip/{esc(order_uuid)}'>{coa_all_inner}</a>")
    else:
        coa_all_html = f"<div class='coa-link'>{coa_all_inner}</div>"

    # ── totals column (mirrors invoice-totals: units/cases · money · payments) ──
    total_units, total_cases = _invoice_totals_extra(order)

    def totals_row(label, value, bold=False):
        b = " bold" if bold else ""
        return (f"<div class='totals-row{' total-row' if bold else ''}'>"
                f"<div class='totals-label{b}'>{esc(label)}</div>"
                f"<div class='totals-value{b}'>{esc(value)}</div></div>")

    totals_html = (totals_row("Total Units", _fmt_num(total_units))
                   + totals_row("Total Cases", _fmt_num(total_cases))
                   + "<div class='totals-divider'></div><section>")
    for label, key in [("Subtotal", "subtotal"), ("Discount", "additional_discount"),
                       ("Delivery", "delivery_cost"), ("Taxes", "taxes")]:
        val = _inv_money_str(order, key, default=None)
        if val is not None and label != "Subtotal" and _parse_money(val) == 0:
            continue   # the real invoice omits zero discount/delivery/tax rows
        if val is not None:
            totals_html += totals_row(label, val)
    # Pricing-tier / line-modifier total (order.line_item_modifiers, signed) —
    # the piece that makes Subtotal + this = Total on tier-priced orders.
    lim = _order_money(order, "line_item_modifiers")
    if lim:
        totals_html += totals_row(
            "Customer Discount" if lim < 0 else "Adjustments",
            (f"-${abs(lim):,.2f}" if lim < 0 else f"${lim:,.2f}"))
    tot_val = _inv_money_str(order, "total", default=None)
    if tot_val is not None:
        totals_html += totals_row("Total", tot_val, bold=True)
    totals_html += ("</section><div class='totals-divider'></div><section>"
                    "<div class='payments-header'>Payments</div>")
    credit_rows = _itemized_credits(order)
    for label, key in [("Payments", "total_payments"), ("Credits", "total_credits"),
                       ("Write-offs", "total_write_offs")]:
        if label == "Credits" and credit_rows:
            for clab, camt in credit_rows:
                totals_html += totals_row(clab, f"${camt:,.2f}")
            continue
        v = _order_money(order, key)
        if v:
            totals_html += totals_row(label, f"${v:,.2f}")
    due = _order_due(order)
    if due is not None:
        totals_html += totals_row("Outstanding", f"${due:,.2f}")
        totals_html += totals_row("Due", f"${due:,.2f}", bold=True)
    totals_html += "</section>"

    # ── payment instructions (left column) ──
    ps = ((order.get('seller_company') or {}).get('payment_settings')) or {}
    ps = _fix_payment_typos(ps)
    pay_html = ""
    if ps.get('make_checks_payable'):
        pay_html += ("<div class='payment-method mb-3'>"
                     "<div class='payment-method-header'>Make Checks Payable</div>"
                     f"<div class='payment-method-content'>{esc(ps['make_checks_payable'])}</div></div>")
    ach_rows = [("Make Payable", ps.get('ach_name')), ("Bank Name", ps.get('ach_bank_name')),
                ("Bank Address", ps.get('ach_bank_address')),
                ("Routing", ps.get('ach_bank_routing')),
                ("Account Number", ps.get('ach_bank_account'))]
    ach_rows = [(k, v) for k, v in ach_rows if v]
    if ach_rows:
        pay_html += ("<div class='payment-method mb-3'>"
                     "<div class='payment-method-header'>Pay with ACH or wire transfer</div>"
                     "<div class='payment-method-content'>"
                     + "".join(f"<div class='payment-detail-row'>"
                               f"<span class='payment-label'>{esc(k)}</span>"
                               f"<span class='payment-value'>{esc(v)}</span></div>"
                               for k, v in ach_rows)
                     + "</div></div>")

    # ── signatures (Released By / Received By / Money Collected By) ──
    sig_html = "".join(f"""<div class="signature-row">
  <div class="signature-info"><div class="signature-name"></div>
    <div class="signature-line"></div><div class="signature-label">{esc(who)}</div></div>
  <div class="signature-box"><div class="signature-box-content"></div>
    <div class="signature-line"></div><div class="signature-label">Signature</div></div>
  <div class="signature-date"><div class="signature-date-value"></div>
    <div class="signature-line"></div><div class="signature-label">Date</div></div>
</div>""" for who in ["Released By", "Received By", "Money Collected By"])

    return f"""<!doctype html><html><head><meta charset="utf-8">
<title>Invoice {esc(inv_no)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400&display=swap');
  *{{box-sizing:border-box;}}
  body{{margin:0;padding:0;background:#fff;
       font-family:'Roboto',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',
       Arial,'Noto Sans',sans-serif;
       color:#495057;font-size:.875rem;line-height:1.5;
       -webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  p{{margin:0;}}
  .bushel-card{{max-width:1001px;width:100%;margin:0 auto;padding:1rem 0;}}
  .px-4{{padding-left:1.5rem;padding-right:1.5rem;}}
  .mt-1{{margin-top:.25rem;}} .mt-4{{margin-top:1.5rem;}}
  .mb-0{{margin-bottom:0;}} .mb-3{{margin-bottom:1rem;}} .m-0{{margin:0;}}
  .py-2{{padding-top:.5rem;padding-bottom:.5rem;}}
  .row{{display:flex;flex-wrap:wrap;margin-left:-1rem;margin-right:-1rem;}}
  .col-3{{flex:0 0 25%;max-width:25%;padding:0 1rem;}}
  .col-5{{flex:0 0 41.6667%;max-width:41.6667%;padding:0 1rem;}}
  .col-7{{flex:0 0 58.3333%;max-width:58.3333%;padding:0 1rem;}}
  .text-center{{text-align:center;}} .text-nowrap{{white-space:nowrap;}}
  .muted{{color:#868e96;}}
  .d-flex{{display:flex;}} .align-items-center{{align-items:center;}}
  .flex-grow-1{{flex-grow:1;}}
  /* ── header: INVOICE + inline meta strip ── */
  .invoice-header-section{{display:flex;justify-content:space-between;align-items:flex-end;}}
  .invoice-main-title{{font-size:1.75rem;font-weight:600;letter-spacing:.06em;
                       text-transform:uppercase;color:#495057;margin:0;line-height:1.1;}}
  .invoice-meta-compact{{display:flex;gap:1.75rem;}}
  .meta-row{{display:flex;align-items:baseline;gap:.375rem;font-size:.8125rem;}}
  .meta-label-compact{{font-size:.65rem;font-weight:700;color:#868e96;
                       text-transform:uppercase;letter-spacing:.05em;}}
  .meta-value-compact{{color:#495057;font-weight:700;}}
  /* ── FROM / CONTACT / LICENSES / SHIP TO columns ── */
  .seller-content-wrapper{{margin-top:1.25rem;}}
  .info-label{{font-size:.65rem;font-weight:700;color:#868e96;text-transform:uppercase;
              letter-spacing:.05em;margin-bottom:.375rem;}}
  .company-name,.address-text,.contact-detail,.bill-to-section div,
  .license-section{{font-size:.8125rem;line-height:1.5;}}
  .license-section{{line-height:normal;margin-bottom:.125rem;}}
  .seller-logo{{width:100px;height:100px;object-fit:contain;}}
  .section-divider{{border-top:1px solid #dee2e6;margin:1rem 0;}}
  .payment-terms-section .term-item{{display:flex;justify-content:space-between;
                                     font-size:.8125rem;margin-bottom:.375rem;}}
  .term-label{{font-size:.65rem;font-weight:700;color:#868e96;text-transform:uppercase;
              letter-spacing:.05em;align-self:center;}}
  .term-value{{color:#495057;}}
  /* ── Delivery chip ── */
  .fulfillment-container{{border:1px solid #dee2e6;border-radius:.25rem;
                          padding:.5rem .75rem;margin-top:1rem;font-size:.8125rem;}}
  .detail-chip{{display:inline-block;}}
  .chip-label{{font-weight:700;margin-right:.375rem;}}
  /* ── line-item table ── */
  .line-items-section{{margin-top:1rem;}}
  .line-item-wrapper{{margin:0 1.5rem;}}
  .invoice-table{{width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;}}
  /* Apex's PDF does not repeat the header band on later pages — suppress
     Chromium's default thead repetition */
  .invoice-table thead{{display:table-row-group;}}
  /* the PDF header band is flat gray rgb(240,240,240) — the blue thead is
     screen-only styling (Apex prints with different CSS) */
  .invoice-table thead th{{font-size:.875rem;font-weight:700;color:#212529;
                           text-align:center;padding:.25rem;height:40px;
                           background:#f0f0f0;}}
  .invoice-table th:nth-child(1){{width:44%;}}
  .invoice-table th:nth-child(2){{width:25%;}}
  .invoice-table th:nth-child(3){{width:8%;}}
  .invoice-table th:nth-child(4){{width:12%;}}
  .invoice-table th:nth-child(5){{width:11%;}}
  .invoice-table thead th.th-line{{text-align:right;}}
  .invoice-table thead th.th-line span{{margin-right:1.5rem;}}
  .invoice-table td{{text-align:center;padding:.375rem .25rem;font-size:.8125rem;
                     vertical-align:middle;}}
  .group-row td{{background:#f0f0f0 !important;text-align:left;
                 padding:.5rem .75rem;font-size:.8125rem;}}
  tr.break-line td{{border-bottom:1px solid #dee2e6;}}
  tr.break-line{{page-break-inside:avoid;}}
  .name-cell{{padding-left:1rem;}}
  .invoice-text-small{{font-size:.75rem;}}
  .product-type-category{{font-style:italic;color:#868e96;margin-top:.125rem;}}
  .note-text{{color:inherit;font-size:.75rem;max-width:250px;margin:0 auto;}}
  .note-label{{font-weight:400;}}
  .line-cell{{text-align:right !important;padding-right:1rem !important;
              white-space:nowrap;font-weight:700;}}
  .doc-icon{{width:11px;height:14px;vertical-align:middle;}}
  .panel-icon{{width:14px;height:14px;}}
  .icon-sep{{border-left:1px solid #dee2e6;height:14px;display:inline-block;
             margin:0 .25rem;vertical-align:middle;}}
  .documents-section{{white-space:nowrap;display:flex;align-items:center;}}
  .chevron{{width:11px;height:11px;}}
  a{{color:inherit;text-decoration:none;}}
  .coa-link{{color:#28a745;font-size:.8125rem;margin-top:.375rem;
             display:flex;align-items:center;gap:.375rem;}}
  .coa-link .doc-icon{{width:12px;height:15px;}}
  /* ── payment instructions + totals ── */
  .bottom-section{{margin-top:1rem;}}
  /* two payment columns (second usually empty) — the first is ~60% of the
     block, sized so the Make-Checks-Payable text wraps exactly like Apex's PDF
     (3 lines, no break inside the phone number) */
  .payment-settings{{font-size:.75rem;display:flex;gap:1rem;}}
  .payment-column{{flex:1;min-width:0;}}
  .payment-column:first-child{{flex:0 0 60%;}}
  .payment-method-header{{font-weight:700;font-size:.8125rem;margin-bottom:.25rem;}}
  .payment-detail-row{{display:flex;gap:.5rem;}}
  .payment-label{{color:#868e96;flex:0 0 110px;}}
  .invoice-totals{{font-size:.8125rem;}}
  .totals-row{{display:flex;justify-content:space-between;padding:.1875rem 0;}}
  .totals-divider{{border-top:1px solid #dee2e6;margin:.5rem 0;}}
  .payments-header{{font-size:.6875rem;font-weight:700;color:#868e96;margin:.25rem 0;
                    text-align:center;text-transform:uppercase;letter-spacing:.05em;}}
  .bold{{font-weight:700;}}
  .totals-column{{border-left:1px solid #dee2e6;}}
  .buyer-wrapper{{position:relative;}}
  .buyer-divider{{position:absolute;left:58.3333%;top:0;bottom:0;width:0;
                  border-left:1px solid #dee2e6;}}
  /* ── signatures ── */
  .signatures-container{{margin-top:1.5rem;}}
  .signatures-header-section{{border-bottom:1px solid #dee2e6;padding-bottom:.5rem;}}
  .signatures-title{{font-size:1rem;font-weight:700;letter-spacing:.05em;
                     color:#495057;margin:0;text-transform:uppercase;}}
  .signature-row{{display:flex;gap:1rem;margin-top:3rem;align-items:flex-end;}}
  .signature-row:first-child{{margin-top:3.5rem;}}
  .signature-info,.signature-box,.signature-date{{flex:1;}}
  .signature-line{{border-bottom:1px solid #495057;height:1.25rem;}}
  .signature-label{{font-size:.6875rem;color:#868e96;margin-top:.25rem;}}
  @media print{{ body{{margin:0;}} .bushel-card{{max-width:none;}} }}
</style></head><body>
<div class="bushel-card">
  <div class="px-4">
    <div class="seller-header">
      <div class="invoice-header-section">
        <h2 class="invoice-main-title">Invoice</h2>
        <div class="invoice-meta-compact">{meta_html}</div>
      </div>
      <div class="seller-content-wrapper">
        <div class="row">
          <div class="col-3"><div class="info-label">From</div>{seller_html}</div>
          <div class="col-3"><div class="info-label">Contact</div>{seller_contact_html}</div>
          <div class="col-3"><div class="info-label">Licenses</div>{lic_html}</div>
          <div class="col-3 text-center">{logo_html}</div>
        </div>
      </div>
    </div>
    <div class="invoice-details-section">
      <div class="section-divider"></div>
      <div class="buyer-wrapper">
        <div class="buyer-divider"></div>
        <div class="row">
          <div class="col-3"><div class="info-label">Ship To</div>
            <div class="bill-to-section">{buyer_html}</div></div>
          <div class="col-3"><div class="info-label">Contact</div>
            <div class="contact-section">{buyer_contact_html}</div></div>
          <div class="col-3"></div>
          <div class="col-3 payment-terms-column">
            <div class="payment-terms-section">{terms_html}</div></div>
        </div>
      </div>
      {delivery_html}
    </div>
  </div>
  <div class="line-items-section">
    <section class="line-item-wrapper">
      <table class="invoice-table">
        <thead class="line-item-header"><tr>
          <th>Name</th><th>Details</th><th>Price</th><th>Quantity</th>
          <th class="th-line"><span>Line</span></th>
        </tr></thead>
        <tbody>{group_html}</tbody>
      </table>
      {coa_all_html}
    </section>
  </div>
  <div class="row bottom-section px-4">
    <div class="col-7"><div class="payment-settings">
      <div class="payment-column">{pay_html}</div>
      <div class="payment-column"></div>
    </div></div>
    <div class="col-5 totals-column"><div class="invoice-totals">{totals_html}</div></div>
  </div>
  <div class="mt-4 px-4">
    <div class="signatures-container">
      <div class="signatures-header-section">
        <h3 class="signatures-title mb-0">Signatures</h3>
      </div>
      <div class="signatures-content"><div class="signatures-table">{sig_html}</div></div>
    </div>
  </div>
</div>
</body></html>"""


def _freshest_invoice_order(order):
    """Upgrade a v1-shaped order to its b-api read before building an invoice.

    The v1 API is MODIFIER-BLIND: it returns items[].modifiers = [] and
    line_item_modifiers = None even when a pricing tier has repriced the order
    (confirmed live on Twiste-1574, tier 'Vape– Volume customer') — an invoice
    built from that shape prints FULL price. The b-api read carries the tier
    modifiers plus the freshest payments/totals. Falls back to the given order
    when no session is loaded."""
    try:
        sess = st.session_state.get('bapi_session') or {}
        if (isinstance(order, dict) and not _is_bapi_order(order)
                and order.get('uuid') and _session_ready(sess)):
            fresh = bapi_get_order(sess, order.get('uuid'))
            if isinstance(fresh, dict) and fresh.get('id'):
                return fresh
    except Exception:
        pass
    return order


def build_best_invoice_file(order):
    """Pick the best invoice rendering available, in order:
      1. HTML → Chromium PDF (Playwright) — pixel-accurate, real webfonts/grid/flex
      2. reportlab PDF — plainer, but works with no browser installed
      3. raw HTML — always works, user prints it to PDF themselves
    Returns (bytes, filename_suffix, mime, source_label)."""
    order = _with_seller_company(_freshest_invoice_order(order))
    html_str = build_invoice_html(order)
    pdf_bytes = build_invoice_pdf_from_html(html_str)
    if pdf_bytes:
        return pdf_bytes, ".pdf", "application/pdf", "styled PDF (Chromium render)"
    pdf_bytes = build_invoice_pdf(order)
    if pdf_bytes:
        return pdf_bytes, ".pdf", "application/pdf", "built from Apex data (basic PDF)"
    return html_str.encode('utf-8'), ".html", "text/html", "built from Apex data — print to PDF"


# Runs in a CHILD python process (see build_invoice_pdf_from_html): Playwright's
# sync API needs asyncio subprocess support, and Streamlit-on-Windows pins the
# Selector event loop (for Tornado) which can't spawn subprocesses — Chromium
# can never launch inside the Streamlit process itself (NotImplementedError).
# A clean child process gets the default Proactor loop, where it just works.
_PDF_CHILD_SCRIPT = r"""
import sys
from playwright.sync_api import sync_playwright
html_path, pdf_path, timeout_ms = sys.argv[1], sys.argv[2], int(sys.argv[3])
html_str = open(html_path, encoding="utf-8").read()
with sync_playwright() as p:
    browser = p.chromium.launch()
    try:
        page = browser.new_page()
        try:
            page.set_content(html_str, wait_until="networkidle", timeout=timeout_ms)
        except Exception:
            pass   # e.g. the logo image was slow/unreachable - render whatever loaded
        page.emulate_media(media="screen")   # keep our styling, not stripped @media print rules
        # Print geometry measured off Apex's own PDF: zero side margins with the
        # content scaled so the 1001px card exactly fills the 8.5in page width
        # (816css / 1001css = 0.8152), ~0.3in top margin, and a gray right-aligned
        # "Page N of T" footer inside a 0.42in bottom margin.
        pdf = page.pdf(format="Letter", print_background=True, scale=0.8152,
                       margin={"top": "0.3in", "bottom": "0.42in",
                               "left": "0", "right": "0"},
                       display_header_footer=True,
                       header_template="<span></span>",
                       footer_template=(
                           "<div style=\"font-size:11px;color:#a7a7a7;width:100%;"
                           "text-align:right;padding-right:0.33in;"
                           "font-family:Roboto,Arial,sans-serif;\">"
                           "Page <span class='pageNumber'></span> of "
                           "<span class='totalPages'></span></div>"))
    finally:
        browser.close()
open(pdf_path, "wb").write(pdf)
"""


def build_invoice_pdf_from_html(html_str, timeout_ms=15000):
    """Render the polished HTML invoice (real Roboto webfont, CSS grid/flex layout)
    to a pixel-accurate PDF using a headless Chromium via Playwright — a genuine
    browser engine, so it looks like the actual styled invoice instead of the
    plainer reportlab fallback (which can't do webfonts/grid/flex).
    The render runs in a child python process because Playwright cannot launch
    Chromium inside Streamlit on Windows (Selector event loop — see
    _PDF_CHILD_SCRIPT). This is the PRIMARY PDF path; build_invoice_pdf
    (reportlab) is the fallback for machines without Playwright's browser
    installed. Returns PDF bytes, or None if Playwright/Chromium isn't available."""
    import importlib.util
    if importlib.util.find_spec("playwright") is None:
        return None
    import subprocess
    import sys as _sys
    import tempfile
    html_path = pdf_path = None
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".html", encoding="utf-8",
                                         delete=False) as f:
            f.write(html_str)
            html_path = f.name
        pdf_path = html_path[:-5] + ".pdf"
        proc = subprocess.run(
            [_sys.executable, "-c", _PDF_CHILD_SCRIPT, html_path, pdf_path,
             str(timeout_ms)],
            capture_output=True, timeout=max(60, timeout_ms // 1000 + 45))
        if proc.returncode != 0:
            return None
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()
        return pdf_bytes if pdf_bytes[:4] == b"%PDF" else None
    except Exception:
        return None
    finally:
        for p in (html_path, pdf_path):
            if p:
                try:
                    os.remove(p)
                except OSError:
                    pass


def build_invoice_pdf(order):
    """Render a PDF invoice with reportlab, modeled on the real Apex invoice's
    layout: header meta, FROM/CONTACT/LICENSES + SHIP TO/TERMS blocks, line items
    grouped by facility/license with batch/cultivar/potency/container detail,
    payment instructions, Total Units/Cases + Subtotal/Total/Outstanding/Due, and
    a signatures block. Returns bytes, or None if reportlab isn't installed
    (caller falls back to the HTML invoice)."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.units import inch
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
                                        Paragraph, Spacer, Image)
    except Exception:
        return None

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter,
                            leftMargin=0.6 * inch, rightMargin=0.6 * inch,
                            topMargin=0.6 * inch, bottomMargin=0.6 * inch,
                            title=f"Invoice {order.get('invoice_number') or order.get('id') or ''}")
    styles = getSampleStyleSheet()
    small = ParagraphStyle('small', parent=styles['Normal'], fontSize=8, leading=10.5)
    tiny = ParagraphStyle('tiny', parent=small, fontSize=7, textColor=colors.HexColor('#6b7280'))
    h1 = ParagraphStyle('h1', parent=styles['Title'], fontSize=24, alignment=0,
                        textColor=colors.HexColor('#495057'), spaceAfter=2)
    label = ParagraphStyle('label', parent=small, textColor=colors.HexColor('#6b7280'))
    group_hdr = ParagraphStyle('grp', parent=small, fontSize=8.5, fontName='Helvetica-Bold')
    accent = colors.HexColor('#495057')
    el = []

    inv_no = order.get('invoice_number') or order.get('custom_invoice_number') or order.get('id') or ""
    status = ((order.get('order_status') or {}).get('name')
              if isinstance(order.get('order_status'), dict) else None) \
        or order.get('payment_status') or ""
    seller = _seller_from_block(order)
    buyer = _buyer_to_block(order)
    term_name = ((order.get('term') or {}).get('name')
                 if isinstance(order.get('term'), dict) else order.get('term')) or ""

    # ── Header: title + meta, seller FROM/CONTACT/LICENSES (+ logo if fetchable) ──
    meta_pairs = [("Invoice #", inv_no), ("Date", _fmt_date(order.get('order_date'))),
                  ("Status", status)]
    meta_pairs = [(k, v) for k, v in meta_pairs if v]
    meta_tbl = Table([[Paragraph(k, label), Paragraph(str(v), small)]
                      for k, v in meta_pairs], colWidths=[0.9 * inch, 1.8 * inch])
    meta_tbl.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'),
                                  ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                                  ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
                                  ('TOPPADDING', (0, 0), (-1, -1), 1)]))
    logo_cell = ""
    if seller['logo']:
        try:
            r = _HTTP.get(seller['logo'], timeout=6)
            if r.status_code == 200 and r.content:
                img = Image(BytesIO(r.content), width=1.3 * inch, height=0.6 * inch,
                           kind='proportional')
                logo_cell = img
        except Exception:
            logo_cell = ""
    seller_txt = ("<b>" + (seller['name'] or '') + "</b><br/>"
                 + "<br/>".join(seller['lines'][1:] if len(seller['lines']) > 1 else []))
    contact_txt = "<br/>".join(seller['contact']) or "&mdash;"
    lic_txt = "<br/>".join(seller['licenses']) or "&mdash;"
    seller_row = [Paragraph("<b>FROM</b><br/>" + seller_txt, small),
                 Paragraph("<b>CONTACT</b><br/>" + contact_txt, small),
                 Paragraph("<b>LICENSES</b><br/>" + lic_txt, small),
                 logo_cell or ""]
    head = Table([[Paragraph("Invoice", h1), meta_tbl]], colWidths=[3.6 * inch, 3.2 * inch])
    head.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'BOTTOM')]))
    seller_tbl = Table([seller_row], colWidths=[2.1 * inch, 1.9 * inch, 1.2 * inch, 1.6 * inch])
    seller_tbl.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'),
                                    ('ALIGN', (3, 0), (3, 0), 'RIGHT')]))
    el += [head, Spacer(1, 8), seller_tbl, Spacer(1, 8)]

    # ── SHIP TO / CONTACT / TERMS ──
    buyer_txt = "<br/>".join(buyer['lines']) or "&mdash;"
    if buyer['license']:
        buyer_txt += f"<br/>{buyer['license']}"
    buyer_contact_txt = "<br/>".join(buyer['contact']) or ""
    terms_txt = ""
    due_disp = _fmt_date(order.get('due_date'))
    if due_disp:
        terms_txt += f"<b>Due Date:</b> {due_disp}<br/>"
    if term_name:
        terms_txt += f"<b>Terms:</b> {term_name}"
    buyer_row = [Paragraph("<b>SHIP TO</b><br/>" + buyer_txt, small),
                Paragraph("<b>CONTACT</b><br/>" + buyer_contact_txt, small),
                Paragraph(terms_txt, small)]
    buyer_tbl = Table([buyer_row], colWidths=[2.6 * inch, 2.1 * inch, 2.1 * inch])
    buyer_tbl.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'),
                                   ('LINEABOVE', (0, 0), (-1, 0), 0.6, colors.HexColor('#e5e7eb')),
                                   ('TOPPADDING', (0, 0), (-1, -1), 6)]))
    el += [buyer_tbl]
    delivery = _fmt_date(order.get('delivery_date'))
    if delivery:
        el += [Spacer(1, 4), Paragraph(f"<b>Delivery:</b> {delivery}", tiny)]
    el += [Spacer(1, 10)]

    # ── Line items, grouped by facility/license (each group = its own mini-table) ──
    rows = _invoice_line_rows(order)
    groups = _group_invoice_rows(rows)
    col_widths = [1.9 * inch, 2.1 * inch, 0.7 * inch, 1.1 * inch, 0.8 * inch]
    if not groups:
        el += [Paragraph("No line items.", small)]
    for glabel, grows in groups:
        el += [Paragraph(glabel, group_hdr), Spacer(1, 2)]
        data = [["Name", "Details", "Price", "Quantity", "Line"]]
        for r in grows:
            name_bits = ([f"<i>{r['brand']}</i><br/>"] if r['brand'] else []) + [r['product']]
            if r['note']:
                name_bits.append(f"<br/><font color='#6b7280'>Note: {r['note']}</font>")
            det_bits = [f"<b>Batch:</b> {r['batch']}"] if r['batch'] else []
            if r['cultivar']:
                det_bits.append(f"<font color='#6b7280'>({r['cultivar']})</font>")
            if r['potency']:
                det_bits.append(f"<b>Potency:</b> {r['potency']}")
            if r['container']:
                det_bits.append(f"<b>Container:</b> {r['container']}")
            qty_label = f"{_fmt_num(r['qty'])} " + (
                ("Case" if float(r['qty']) == 1 else "Cases") if r['is_case']
                else (r['unit'] or "Unit"))
            qty_bits = [qty_label]
            if r['is_case']:
                qty_bits.append(f"<font color='#6b7280'>{_fmt_num(r['units_total'])} Units total</font>")
            if r['package']:
                qty_bits.append(f"<b>Pkg:</b> {r['package']}")
            elif r['weight_detail']:
                qty_bits.append(f"<b>Wt:</b> {r['weight_detail']}")
            data.append([
                Paragraph("<br/>".join(name_bits), small),
                Paragraph("<br/>".join(det_bits), small),
                Paragraph(r['unit_price'], small),
                Paragraph("<br/>".join(qty_bits), small),
                Paragraph(r['amount'] + "".join(
                    f"<br/><font size='6' color='#6b7280'>"
                    f"{'Discount' if mv < 0 else 'Surcharge'} "
                    f"{'-' if mv < 0 else '+'}${abs(mv):,.2f}</font>"
                    for lbl, mv in (r.get('mod_lines') or [])), small),
            ])
        tbl = Table(data, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), accent),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (2, 0), (2, -1), 'RIGHT'), ('ALIGN', (4, 0), (4, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
            ('LINEBELOW', (0, 0), (-1, -1), 0.4, colors.HexColor('#e5e7eb')),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        el += [tbl, Spacer(1, 8)]

    # ── Payment instructions (left) + totals (right) ──
    ps = ((order.get('seller_company') or {}).get('payment_settings')) or {}
    ps = _fix_payment_typos(ps)
    pay_bits = []
    if ps.get('make_checks_payable'):
        pay_bits.append(f"<b>Make Checks Payable</b><br/>{ps['make_checks_payable']}")
    ach_rows = [("Make Payable", ps.get('ach_name')), ("Bank Name", ps.get('ach_bank_name')),
               ("Bank Address", ps.get('ach_bank_address')),
               ("Routing", ps.get('ach_bank_routing')),
               ("Account Number", ps.get('ach_bank_account'))]
    ach_rows = [(k, v) for k, v in ach_rows if v]
    if ach_rows:
        pay_bits.append("<b>Pay with ACH or wire transfer</b><br/>"
                        + "<br/>".join(f"{k}: {v}" for k, v in ach_rows))
    pay_para = Paragraph("<br/><br/>".join(pay_bits), small) if pay_bits else Paragraph("", small)

    total_units, total_cases = _invoice_totals_extra(order)
    trows = [("Total Units", _fmt_num(total_units), False),
            ("Total Cases", _fmt_num(total_cases), False), (None, None, None)]
    for lab, key in [("Subtotal", "subtotal"), ("Discount", "additional_discount"),
                     ("Delivery", "delivery_cost"), ("Taxes", "taxes"), ("Total", "total")]:
        val = _inv_money_str(order, key, default=None)
        if val is not None:
            trows.append((lab, val, key == "total"))
    trows.append((None, None, None))
    credit_rows = _itemized_credits(order)
    for lab, key in [("Payments", "total_payments"), ("Credits", "total_credits"),
                     ("Write-offs", "total_write_offs")]:
        if lab == "Credits" and credit_rows:
            for clab, camt in credit_rows:
                trows.append((clab, f"${camt:,.2f}", False))
            continue
        v = _order_money(order, key)
        if v:
            trows.append((lab, f"${v:,.2f}", False))
    due = _order_due(order)
    if due is not None:
        trows.append(("Outstanding", f"${due:,.2f}", False))
        trows.append(("Due", f"${due:,.2f}", True))

    tot_tbl = Table([[lab or "", val or ""] for lab, val, _ in trows],
                    colWidths=[1.5 * inch, 1.2 * inch], hAlign='RIGHT')
    ts = [('ALIGN', (1, 0), (1, -1), 'RIGHT'), ('FONTSIZE', (0, 0), (-1, -1), 8.5),
         ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]
    for i, (lab, _, strong) in enumerate(trows):
        if lab is None:
            ts.append(('LINEBELOW', (0, i), (-1, i), 0.6, colors.HexColor('#cccccc')))
        elif strong:
            ts += [('FONTNAME', (0, i), (-1, i), 'Helvetica-Bold'),
                  ('LINEABOVE', (0, i), (-1, i), 1, colors.HexColor('#374151'))]
    tot_tbl.setStyle(TableStyle(ts))

    bottom = Table([[pay_para, tot_tbl]], colWidths=[3.9 * inch, 2.7 * inch])
    bottom.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    el += [bottom]

    if order.get('invoice_note'):
        el += [Spacer(1, 10), Paragraph("<b>Note:</b> " + str(order.get('invoice_note')), small)]

    # ── Signatures ──
    sig_hdr = ParagraphStyle('sighdr', parent=tiny, alignment=1)
    sig_rows = [["Released By", "Signature", "Date"],
               ["Received By", "Signature", "Date"],
               ["Money Collected By", "Signature", "Date"]]
    sig_tbl = Table([[Paragraph(c, sig_hdr) for c in row] for row in sig_rows],
                    colWidths=[2.2 * inch] * 3, rowHeights=[0.5 * inch] * 3)
    sig_tbl.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, -1), 0.5, colors.HexColor('#999999')),
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
    ]))
    el += [Spacer(1, 16), sig_tbl]

    doc.build(el)
    return buf.getvalue()


def build_invoice_bundle_zip(invoice_bytes, invoice_filename, coa_zip_bytes=None):
    """Bundle the built invoice file with every COA into ONE downloadable zip:
        {invoice_filename}
        COAs/<each file from the order's 'Download All COAs' zip>
    If the COA zip can't be unpacked for some reason it's kept as-is under
    COAs.zip rather than dropped. Returns zip bytes."""
    import zipfile
    buf = BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(invoice_filename, invoice_bytes)
        if coa_zip_bytes:
            try:
                src = zipfile.ZipFile(BytesIO(coa_zip_bytes))
                for info in src.infolist():
                    if info.is_dir():
                        continue
                    data = src.read(info.filename)
                    name = f"COAs/{os.path.basename(info.filename)}"
                    zf.writestr(name, data)
            except Exception:
                zf.writestr("COAs.zip", coa_zip_bytes)
    return buf.getvalue()


# ============================================================
# WEIGHT CALCULATION
# ============================================================

def extract_unit_size_from_name(product_name):
    # \d*\.?\d+ (not \d+\.?\d*) so '.5g' carts parse as 0.5, not 5
    m = re.search(r'(\d*\.?\d+)\s*g', product_name.lower())
    if m: return float(m.group(1))
    if '1/8' in product_name.lower(): return 3.5
    elif '1/4' in product_name.lower(): return 7.0
    elif '1/2' in product_name.lower(): return 14.0
    elif '1 oz' in product_name.lower(): return 28.0
    return None


_MULTIPACK_WORDS = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
                    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
                    'twelve': 12, 'twenty': 20}


def multipack_count(name):
    """Units per pack for a multi-pack product, else 0.
    Apex sells them under a generic product ('Multi-pack joints (five pack)')
    while METRC ships them as strain items ('... Raw PreRoll | 1.0g (5-pack)') —
    both must resolve to the same count (5) so the comparison can pair them.
    Requires a number (digit or word) directly before pack/pk; a bare 'pack'
    ('Value Pack') doesn't count."""
    if not name:
        return 0
    s = _strip_accents(name).lower()
    m = re.search(r'(\d+)\s*[-/ ]?\s*(?:pack|pk)\b', s)
    if m:
        return int(m.group(1))
    m = re.search(r'\b(' + '|'.join(_MULTIPACK_WORDS) + r')[\s/-]*(?:pack|pk)\b', s)
    if m:
        return _MULTIPACK_WORDS[m.group(1)]
    return 0


def calculate_total_weight(item):
    product_name = item.get('product_name', '')
    order_qty = float(item.get('order_quantity', 0))
    oum = item.get('order_unit_measurement', {})
    order_unit_name = (oum.get('name', '') if isinstance(oum, dict) else str(oum)).lower()
    units_per_case = item.get('units_per_case')
    unit_grams = extract_unit_size_from_name(product_name)
    
    us = item.get('unit_size')
    usm = item.get('unit_size_unit_measurement', {})
    explicit_unit_size = False
    if us and usm:
        un = usm.get('name', '').lower()
        usv = float(us)
        if 'gram' in un or 'gm' in un: unit_grams = usv; explicit_unit_size = True
        elif 'oz' in un or 'ounce' in un: unit_grams = usv * 28.0; explicit_unit_size = True
        elif 'lb' in un or 'pound' in un: unit_grams = usv * 453.592; explicit_unit_size = True

    # Multi-pack products: one sellable unit is a PACK of N joints. Apex names
    # them generically ('Multi-pack joints (five pack)') with no gram size, so
    # default a joint/pre-roll to 1g when the name gives nothing — otherwise the
    # line weighs 0 and every multi-pack reads NOT IN MANIFEST.
    # (skip when Apex gave an explicit unit_size — that's already per-pack)
    mp = multipack_count(product_name)
    if mp and not explicit_unit_size:
        per_piece = unit_grams
        if not per_piece and re.search(r'joint|pre[\s-]?roll', product_name.lower()):
            per_piece = 1.0
        if per_piece:
            unit_grams = per_piece * mp

    if not unit_grams: return None, None

    if 'case' in order_unit_name and units_per_case and float(units_per_case) > 0:
        actual_units = order_qty * float(units_per_case)
    else:
        actual_units = order_qty

    return actual_units * unit_grams, f"{int(actual_units)} units × {unit_grams}g"


# ============================================================
# BATCH MATCHING
# ============================================================

# lru_cache on the three name helpers below: pure string→string functions
# that are called O(products × batches) per candidate scan and up to 6× per
# batch comparison — memoizing them turns the repeat calls into dict hits.
@lru_cache(maxsize=16384)
def _strip_accents(s):
    """'Señor Giggles' → 'Senor Giggles', 'Piña Colada' → 'Pina Colada'.
    METRC item names drop the accents while Apex batch names keep them, so
    matching must compare the bare letters."""
    return ''.join(c for c in unicodedata.normalize('NFKD', s or '')
                   if not unicodedata.combining(c))


@lru_cache(maxsize=8192)
def extract_strain_name(name):
    """
    Extract the core strain name from various formats:
      'TG Cherry Marker - 20260122 (A)' → 'cherry marker'
      'Twisted Growers Cherry Marker Flower 3.5g' → 'cherry marker'
      'TG Cherry Marker Flower 3.5g' → 'cherry marker'
      'NoBull | Mango Madness Liquid Diamond Vaporizer | 1.0g' → 'mango madness'
      'Dope Chemist | Fatso Cured Badder | 1.0g' → 'fatso cured badder'
      'MGO-LDV-101325' → 'mgo-ldv-101325'
      'Super Boof - 20260120 (A)' → 'super boof'
    """
    if not name:
        return ""

    s = _strip_accents(name).lower().strip()

    # Remove METRC ID prefix "M########: "
    s = re.sub(r'^m\d+:\s*', '', s)
    
    # Handle pipe-separated format: "Brand | Product | Size"
    if '|' in s:
        parts = [p.strip() for p in s.split('|')]
        if len(parts) >= 2:
            # The product name is usually the second part
            s = parts[1] if parts[1] else parts[0]
    
    # Remove common prefixes
    s = re.sub(r'^tg\s+', '', s)
    s = re.sub(r'^twisted\s*growers?\s*', '', s)
    
    # Remove date codes like "- 20260122 (A)" or "20260122 F2"
    s = re.sub(r'\s*-?\s*\d{8}\s*\(?[A-Z]\d?\)?\s*', '', s)
    s = re.sub(r'\s*-?\s*\d{6,8}\s*[fF]\d+\s*', '', s)
    
    # Remove product type suffixes
    s = re.sub(r'\s*(flower|pre-?roll|vape|vaporizer|liquid\s*diamond|badder|rosin|live\s*hash|cured)\s*', ' ', s)
    
    # Remove size info like "3.5g", "1g", "1.0g"
    s = re.sub(r'\s*\d+\.?\d*\s*g\b', '', s)
    
    # Remove "(Sold in ...)" type suffixes
    s = re.sub(r'\(sold\s+in\s+[^)]*\)', '', s)
    
    # Clean up
    s = re.sub(r'\s+', ' ', s).strip()
    s = s.strip(' -|')
    
    return s


@lru_cache(maxsize=8192)
def normalize_batch_name(bn):
    if not bn: return ""
    n = _strip_accents(bn).lower().strip()
    n = re.sub(r'^m\d+:\s*', '', n)  # Remove METRC ID prefix
    n = re.sub(r'^tg\s+', '', n)
    n = re.sub(r'^twisted\s*growers?\s*', '', n)
    return re.sub(r'\s+', '', n)


def are_batches_same(b1, b2):
    """
    Advanced batch matching:
    1. Exact normalized match
    2. Date code + strain match
    3. Strain name extraction match (for cross-format matching)
    """
    if not b1 or not b2: return False
    
    # Strategy 1: Exact normalized match
    n1, n2 = normalize_batch_name(b1), normalize_batch_name(b2)
    if n1 == n2:
        return True
    
    # Strategy 2: Same date code + similar strain
    dp = r'(\d{8}\s*\([A-Z]\))'
    d1, d2 = re.search(dp, b1), re.search(dp, b2)
    if d1 and d2:
        if d1.group(1).replace(' ', '').lower() == d2.group(1).replace(' ', '').lower():
            s1 = normalize_batch_name(re.sub(dp, '', b1))
            s2 = normalize_batch_name(re.sub(dp, '', b2))
            if s1 in s2 or s2 in s1: return True
    
    # Strategy 3: Extract strain names and compare
    strain1 = extract_strain_name(b1)
    strain2 = extract_strain_name(b2)
    
    if strain1 and strain2 and len(strain1) >= 3 and len(strain2) >= 3:
        # Exact strain match
        if strain1 == strain2:
            return True
        # One contains the other (handles "super boof" vs "super boof flower")
        if strain1 in strain2 or strain2 in strain1:
            return True
    
    return False


# ============================================================
# CONVERT METRC PACKAGES
# ============================================================

def convert_metrc_packages(metrc_packages):
    result = []
    for idx, pkg in enumerate(metrc_packages, 1):
        qty = 0
        for f in ['ShippedQuantity', 'ReceivedQuantity', 'Quantity']:
            v = pkg.get(f)
            if v and float(v) > 0:
                qty = float(v)
                break
        
        # Get unit — check both Abbreviation and full Name fields
        unit = ''
        for f in ['ShippedUnitOfMeasureAbbreviation', 'ShippedUnitOfMeasureName',
                   'ReceivedUnitOfMeasureAbbreviation', 'ReceivedUnitOfMeasureName',
                   'UnitOfMeasureAbbreviation', 'UnitOfMeasureName']:
            v = pkg.get(f)
            if v:
                unit = str(v)
                break
        
        # Get item name and clean off METRC ID prefix "M########: "
        raw_item = pkg.get('ItemName', pkg.get('ProductName', ''))
        clean_item = re.sub(r'^M\d+:\s*', '', raw_item).strip() if raw_item else ''
        
        # For "Each" units, convert qty to grams using weight from item name
        # e.g., 12 Each of "NoBull | Mango Madness ... | 1.0g" = 12.0g
        unit_lower = unit.lower()
        if unit_lower in ['each', 'ea']:
            weight_match = re.search(r'(\d+\.?\d*)\s*g', clean_item.lower())
            if weight_match:
                per_unit_grams = float(weight_match.group(1))
                # '... 1.0g (5-pack)' shipped as Each: one Each = a 5g pack
                mp = multipack_count(clean_item)
                if mp:
                    per_unit_grams *= mp
                qty = qty * per_unit_grams
                unit = 'g'
        
        # Extract batch name
        batch = ''
        
        # Priority 1: SourceProductionBatchNumbers
        for f in ['SourceProductionBatchNumbers', 'ProductionBatchNumber']:
            v = pkg.get(f)
            if v is not None:
                if isinstance(v, list):
                    non_empty = [str(x).strip() for x in v if x and str(x).strip()]
                    if non_empty:
                        batch = ', '.join(non_empty)
                        break
                elif isinstance(v, str) and v.strip():
                    batch = v.strip()
                    break
        
        # NOTE: leave batch blank here if neither field was populated.
        # It's backfilled after the loop (see below) so a missing batch
        # inherits from an identical item rather than from the item name.

        result.append({
            'package_number': str(idx),
            'package_tag': pkg.get('PackageLabel', ''),
            'batch_name': batch,
            'item_name': clean_item,
            'quantity': qty,
            'unit': 'g' if unit_lower in ['each', 'ea', 'grams', 'g'] else unit,
            'raw': pkg
        })

    # ── Backfill missing batch names ──────────────────────────────────────
    # METRC sometimes returns an empty SourceProductionBatchNumbers for a
    # package even though an identical item elsewhere on the same manifest
    # carries the real production batch. Example: two "Super Boom" pre-roll
    # packages — the first has "TG Super Boom - 20260506 (A)", the second
    # comes back blank. The old behavior dropped the item name into the batch
    # column for that blank one, which made the invoice comparison read wrong.
    # Instead: inherit the batch from another package with the same item, and
    # only use the item name as a true last resort.
    item_to_batch = {}
    for p in result:
        b = (p.get('batch_name') or '').strip()
        if b:
            item_to_batch.setdefault(p['item_name'], b)

    for p in result:
        if not (p.get('batch_name') or '').strip():
            p['batch_name'] = item_to_batch.get(p['item_name'], '') or p['item_name']

    return result


# ============================================================
# COMPARISON
# ============================================================

def create_exact_match_comparison(invoice_items, manifest_packages):
    # Multi-packs cross-cut the batch structure: Apex sells ONE generic product
    # ('Multi-pack joints (five pack)') while METRC ships strain-tagged packages
    # ('... 1.0g (5-pack)') that carry the STRAIN's production batch. Grouped by
    # batch alone, the 5-packs inflate the loose pre-roll batches ('METRC HAS
    # 250g MORE') and the invoice's multipack lines match nothing. So both sides
    # route into a synthetic per-pack-size key instead.
    def _mp_key(n):
        return f"~multipack{n}"

    rows = []
    inv_by_batch = defaultdict(list)
    inv_originals = {}
    for idx, item in enumerate(invoice_items, 1):
        bn = item.get('batch_name', '').strip()
        if bn:
            mp = multipack_count(item.get('product_name', '')) or multipack_count(bn)
            bk = _mp_key(mp) if mp else normalize_batch_name(bn)
            tw, calc = calculate_total_weight(item)
            inv_by_batch[bk].append({'original_batch': bn, 'product_name': item.get('product_name', ''),
                                      'weight': tw or 0, 'calc': calc, 'line_num': idx})
            if bk not in inv_originals: inv_originals[bk] = bn

    man_by_batch = defaultdict(list)
    man_originals = {}
    for pkg in manifest_packages:
        bn = pkg.get('batch_name', '').strip()
        if bn:
            mp = multipack_count(pkg.get('item_name', ''))
            bk = _mp_key(mp) if mp else normalize_batch_name(bn)
            man_by_batch[bk].append({'original_batch': bn, 'quantity': pkg.get('quantity', 0),
                                      'package_number': pkg.get('package_number', ''), 'package_tag': pkg.get('package_tag', '')})
            if bk not in man_originals:
                # Synthetic-key display when the invoice side is missing: the
                # first package's strain batch would misrepresent the group.
                man_originals[bk] = f"Multi-packs ({mp}/pack)" if mp else bn
    
    matched_inv, matched_man = set(), set()
    for k in inv_by_batch:
        if k in man_by_batch: matched_inv.add(k); matched_man.add(k)
    
    for ik in set(inv_by_batch) - matched_inv:
        for mk in set(man_by_batch) - matched_man:
            if are_batches_same(inv_originals[ik], man_originals[mk]):
                if mk != ik:
                    man_by_batch[ik].extend(man_by_batch[mk])
                    del man_by_batch[mk]
                    man_originals[ik] = man_originals[mk]
                matched_inv.add(ik); matched_man.add(mk)
                break
    
    for bk in sorted(set(inv_by_batch) | set(man_by_batch)):
        il = inv_by_batch.get(bk, [])
        ml = man_by_batch.get(bk, [])
        
        if il:
            bd = il[0]['original_batch']
        elif bk.startswith('~multipack'):
            bd = man_originals.get(bk, '')   # group label, not one strain's batch
        else:
            bd = ml[0]['original_batch'] if ml else ''
        pn = il[0]['product_name'] if il else 'NOT IN INVOICE'
        
        it = sum(l['weight'] for l in il)
        mt = sum(p['quantity'] for p in ml)
        iw = sorted([round(l['weight'], 1) for l in il])
        mw = sorted([round(p['quantity'], 1) for p in ml])
        
        if not il: status = '❌ NOT IN INVOICE'
        elif not ml: status = f'❌ NOT IN MANIFEST ({len(il)} line(s))'
        elif iw == mw: status = '✅ PERFECT MATCH'
        elif abs(it - mt) < 1: status = f'⚠️ STRUCTURE MISMATCH (Inv:{len(il)} vs METRC:{len(ml)})'
        else:
            d = it - mt
            status = f'❌ {"INVOICE" if d > 0 else "METRC"} HAS {abs(d):.0f}g MORE'
        
        rows.append({
            'Batch': bd, 'Product': pn[:50],
            'Inv Lines': len(il), 'Inv Breakdown': ', '.join(f"{w:.0f}g" for w in iw) or 'None',
            'Inv Total': f"{it:.1f}g", 'METRC Pkgs': len(ml),
            'METRC Breakdown': ', '.join(f"{w:.0f}g" for w in mw) or 'None',
            'METRC Total': f"{mt:.1f}g", 'Diff': f"{it-mt:+.1f}g", 'Status': status
        })
    return pd.DataFrame(rows)


def style_df(df):
    def hl(row):
        if row['Status'] == '✅ PERFECT MATCH': return ['background-color:#d4edda;color:#000']*len(row)
        elif '⚠️' in row['Status']: return ['background-color:#fff3cd;color:#000']*len(row)
        elif '❌' in row['Status']: return ['background-color:#f8d7da;color:#000']*len(row)
        return ['color:#000']*len(row)
    return df.style.apply(hl, axis=1)


# ============================================================
# MAIN
# ============================================================

# ============================================================
# METRC MANIFESTS MENU — MP (Manufacturer) license, last 31 days
# ============================================================

MP_WINDOW_DAYS = 60          # show the last 60 days of MP manifests
PICK_PLACEHOLDER = "— choose a manifest —"
MANIFEST_CACHE_FILE = "metrc_mp_manifests.json"   # persisted manifest cache (token-saver)


def fetch_mp_manifests(days=MP_WINDOW_DAYS):
    """Pull OUTGOING manifests for the MP (manufacturer) license over the last
    `days` days.

    IMPORTANT: METRC limits the lastModifiedStart/lastModifiedEnd filter to a
    MAXIMUM 24-hour window. A single 30-day request is rejected with HTTP 400
    (the "status 400 for outgoing MP transfers" error). So we page through the
    range one day at a time — the same proven pattern as fetch_day_from_api —
    and aggregate, de-duplicating by transfer Id. A final no-filter call picks
    up any still-active (in-transit) outgoing manifests."""
    end_dt = datetime.now()
    by_id = {}

    def _absorb(items, label):
        for t in (items or []):
            tid = t.get('Id')
            if tid is None:
                continue
            t.setdefault('_source', label)
            t.setdefault('_license', LICENSE_MANUFACTURER)
            by_id[tid] = t

    def _get(url):
        resp = _HTTP.get(url, auth=metrc_auth, headers=metrc_headers, timeout=60)
        if resp.status_code == 429:
            time.sleep(3)
            resp = _HTTP.get(url, auth=metrc_auth, headers=metrc_headers, timeout=60)
        return resp

    # --- Day-by-day windows (each <= 24h, which is all METRC allows) --------
    # The 24h cap fixes the NUMBER of calls, not their serialization: the day
    # windows are independent read-only pulls, so they run 6 at a time (the
    # _get 429-retry above handles any rate-limit push-back). Workers only
    # fetch; _absorb runs on this thread, in day order, exactly as before.
    total = days + 1
    progress = st.progress(0.0, text="Pulling outgoing MP manifests...")
    day_list = [(end_dt - timedelta(days=o)).strftime("%Y-%m-%d")
                for o in range(total)]

    def _fetch_day(day):
        start = f"{day}T00:00:00%2B00:00"
        end = f"{day}T23:59:59%2B00:00"
        url = (f"{METRC_BASE_URL}/transfers/v2/outgoing"
               f"?licenseNumber={LICENSE_MANUFACTURER}"
               f"&lastModifiedStart={start}&lastModifiedEnd={end}")
        try:
            resp = _get(url)
            if resp.status_code == 200:
                data = resp.json()
                return (data.get('Data', []) if isinstance(data, dict)
                        else (data or [])), None
            if resp.status_code not in (200, 404):
                return [], f"⚠️ {day}: METRC status {resp.status_code}"
            return [], None
        except Exception as e:
            return [], f"⚠️ {day}: request failed ({e})"

    from concurrent.futures import ThreadPoolExecutor as _TPE
    with _TPE(max_workers=6) as _ex:
        for i, (items, warn) in enumerate(_ex.map(_fetch_day, day_list)):
            _absorb(items, "Outgoing-Mfg")
            if warn:
                st.caption(warn)
            progress.progress((i + 1) / total,
                              text=f"Pulling outgoing MP manifests... ({len(by_id)} found)")

    # --- Active outgoing (no date filter) to catch in-transit manifests -----
    try:
        resp = _get(f"{METRC_BASE_URL}/transfers/v2/outgoing"
                    f"?licenseNumber={LICENSE_MANUFACTURER}")
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('Data', []) if isinstance(data, dict) else (data or [])
            _absorb(items, "Active-Outgoing-Mfg")
    except Exception:
        pass

    progress.empty()
    if not by_id:
        st.error("No outgoing MP transfers returned by METRC for the last "
                 f"{days} days.")
    return list(by_id.values())


# ============================================================
# MP MANIFEST CACHE  (token-saver: pull rarely, read often)
#   Boot reads this JSON file -> 0 METRC calls.
#   Quick refresh    = 1 METRC call (active outgoing only).
#   Refresh changes  = only the days since the last pull + active.
#   Full 60-day pull = cold rebuild (~window+1 calls).
# ============================================================

def load_manifest_cache():
    if os.path.exists(MANIFEST_CACHE_FILE):
        try:
            with open(MANIFEST_CACHE_FILE) as f:
                c = json.load(f)
            c.setdefault('manifests', [])
            return c
        except Exception:
            pass
    return {'pulled_at': None, 'last_pull_date': None,
            'window_days': MP_WINDOW_DAYS, 'manifests': []}


def save_manifest_cache(cache):
    try:
        with open(MANIFEST_CACHE_FILE, 'w') as f:
            json.dump(cache, f, indent=2, default=str)
    except Exception as e:
        st.warning(f"Could not write {MANIFEST_CACHE_FILE}: {e}")


def _within_window(t, days=MP_WINDOW_DAYS):
    # Resolve the first REAL date; METRC stuffs placeholder 0001-01-01 dates into
    # EstimatedDepartureDateTime, so we must skip year<=1900 and fall through.
    d = None
    for f in ('EstimatedDepartureDateTime', 'CreatedDateTime',
              'LastModifiedDateTime', 'ReceivedDateTime'):
        v = t.get(f)
        if v and len(str(v)) >= 10:
            try:
                cand = datetime.strptime(str(v)[:10], "%Y-%m-%d")
            except Exception:
                continue
            if cand.year > 1900:
                d = cand
                break
    if d is None:
        return True  # no real date (placeholder / active) -> keep
    return (datetime.now() - d).days <= days


def manifests_in_window(manifests, days=MP_WINDOW_DAYS):
    return [t for t in manifests if _within_window(t, days)]


def _manifest_signature(t):
    """Fields that count as a 'change' worth surfacing on refresh."""
    return "|".join([
        str(t.get('IsVoided', '')),
        str(t.get('ReceivedDateTime') or t.get('DeliveryReceivedDateTime') or ''),
        str(t.get('LastModifiedDateTime', '')),
        str(t.get('PackageCount', t.get('DeliveryPackageCount', ''))),
    ])


def _mp_get(url):
    resp = _HTTP.get(url, auth=metrc_auth, headers=metrc_headers, timeout=60)
    if resp.status_code == 429:
        time.sleep(3)
        resp = _HTTP.get(url, auth=metrc_auth, headers=metrc_headers, timeout=60)
    return resp


def fetch_active_outgoing_mp():
    """ONE METRC call: active (in-transit) outgoing MP manifests, no date filter."""
    out = []
    try:
        resp = _mp_get(f"{METRC_BASE_URL}/transfers/v2/outgoing"
                       f"?licenseNumber={LICENSE_MANUFACTURER}")
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('Data', []) if isinstance(data, dict) else (data or [])
            for t in items:
                t.setdefault('_source', 'Active-Outgoing-Mfg')
                t.setdefault('_license', LICENSE_MANUFACTURER)
            out = items
    except Exception as e:
        st.caption(f"⚠️ active pull failed ({e})")
    return out


def fetch_mp_manifests_range(start_dt, end_dt, show_progress=True):
    """Day-by-day outgoing MP pull over [start_dt, end_dt] (METRC caps the
    lastModified filter at 24h) plus one active no-filter call. De-dupes by Id."""
    by_id = {}

    def _absorb(items, label):
        for t in (items or []):
            tid = t.get('Id')
            if tid is None:
                continue
            t.setdefault('_source', label)
            t.setdefault('_license', LICENSE_MANUFACTURER)
            by_id[tid] = t

    days = []
    cur = start_dt
    while cur.date() <= end_dt.date():
        days.append(cur.strftime("%Y-%m-%d"))
        cur += timedelta(days=1)

    # Independent 24h read-only windows — fetch 6 at a time (see
    # fetch_mp_manifests); absorb on this thread in day order, as before.
    progress = st.progress(0.0, text="Pulling MP manifests...") if show_progress else None

    def _fetch_day(day):
        s = f"{day}T00:00:00%2B00:00"
        e = f"{day}T23:59:59%2B00:00"
        url = (f"{METRC_BASE_URL}/transfers/v2/outgoing"
               f"?licenseNumber={LICENSE_MANUFACTURER}"
               f"&lastModifiedStart={s}&lastModifiedEnd={e}")
        try:
            resp = _mp_get(url)
            if resp.status_code == 200:
                data = resp.json()
                return (data.get('Data', []) if isinstance(data, dict)
                        else (data or [])), None
            if resp.status_code not in (200, 404):
                return [], f"⚠️ {day}: METRC status {resp.status_code}"
            return [], None
        except Exception as e:
            return [], f"⚠️ {day}: request failed ({e})"

    from concurrent.futures import ThreadPoolExecutor as _TPE
    with _TPE(max_workers=6) as _ex:
        for i, (items, warn) in enumerate(_ex.map(_fetch_day, days)):
            _absorb(items, "Outgoing-Mfg")
            if warn:
                st.caption(warn)
            if progress:
                progress.progress((i + 1) / max(len(days), 1),
                                  text=f"Pulling MP manifests... ({len(by_id)} found)")

    _absorb(fetch_active_outgoing_mp(), "Active-Outgoing-Mfg")
    if progress:
        progress.empty()
    return list(by_id.values())


def _merge_into_cache(cache, fetched):
    """Merge a freshly fetched list into the cache -> (new_cache, changes)."""
    existing = {str(t.get('Id')): t for t in cache.get('manifests', [])
                if t.get('Id') is not None}
    before_ids = set(existing.keys())
    before_sigs = {i: _manifest_signature(t) for i, t in existing.items()}

    for t in fetched:
        tid = t.get('Id')
        if tid is None:
            continue
        key = str(tid)
        prev = existing.get(key)
        if prev:
            # Never let a refresh that lacks a recipient wipe one we already have.
            for fld in ('RecipientFacilityName', 'RecipientFacilityLicenseNumber'):
                if not str(t.get(fld) or '').strip() and str(prev.get(fld) or '').strip():
                    t[fld] = prev[fld]
        existing[key] = t

    after_ids = set(existing.keys())
    new_ids = sorted(after_ids - before_ids)
    changed_ids = [i for i in (after_ids & before_ids)
                   if _manifest_signature(existing[i]) != before_sigs.get(i)]

    new_cache = {
        'pulled_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'last_pull_date': datetime.now().strftime('%Y-%m-%d'),
        'window_days': MP_WINDOW_DAYS,
        'manifests': list(existing.values()),
    }
    changes = {
        'new': [existing[i] for i in new_ids],
        'changed': [existing[i] for i in changed_ids],
        'total': len(existing),
    }
    return new_cache, changes


def refresh_quick(cache):
    """1 METRC call: active outgoing only."""
    return _merge_into_cache(cache, fetch_active_outgoing_mp())


def refresh_incremental(cache):
    """Only the days since the last pull (+ active). Cheap on a normal day."""
    end_dt = datetime.now()
    last = cache.get('last_pull_date')
    if last:
        try:
            start_dt = datetime.strptime(last, "%Y-%m-%d")
        except Exception:
            start_dt = end_dt - timedelta(days=MP_WINDOW_DAYS)
    else:
        start_dt = end_dt - timedelta(days=MP_WINDOW_DAYS)
    return _merge_into_cache(cache, fetch_mp_manifests_range(start_dt, end_dt))


def refresh_full(cache):
    """Cold rebuild over the full window. Stores everything fetched (no silent
    pruning); the 60-day window is applied only at display time."""
    end_dt = datetime.now()
    start_dt = end_dt - timedelta(days=MP_WINDOW_DAYS)
    fetched = fetch_mp_manifests_range(start_dt, end_dt)
    return _merge_into_cache(cache, fetched)


def classify_manifest(t):
    """Active = still in transit / not yet received.
    Inactive = received (has ReceivedDateTime) or voided."""
    if str(t.get('IsVoided', '')).lower() in ('true', '1'):
        return "Inactive"
    if t.get('ReceivedDateTime') or t.get('DeliveryReceivedDateTime'):
        return "Inactive"
    return "Active"


def recipient_of(t):
    """(store_name, store_license) from a raw METRC transfer object. METRC
    variants put the recipient under different keys, so we check several and also
    look inside nested delivery/destination arrays."""
    name = (t.get('RecipientFacilityName')
            or t.get('DeliveryFacilities')
            or t.get('DeliveryFacilityName')
            or t.get('RecipientFacility')
            or t.get('Recipient')
            or t.get('ToFacilityName')
            or t.get('DestinationFacilityName')
            or '')
    lic = (t.get('RecipientFacilityLicenseNumber')
           or t.get('RecipientLicenseNumber')
           or t.get('DeliveryFacilityLicenseNumber')
           or t.get('ToFacilityLicenseNumber')
           or '')
    if not name or not lic:
        for arr_key in ('Destinations', 'Deliveries', 'DeliveryPackages'):
            arr = t.get(arr_key)
            if isinstance(arr, list) and arr and isinstance(arr[0], dict):
                d0 = arr[0]
                name = name or d0.get('RecipientFacilityName') or d0.get('Name') or ''
                lic = lic or d0.get('RecipientFacilityLicenseNumber') \
                    or d0.get('LicenseNumber') or ''
                break
    return (name or '—'), lic


def enrich_recipients_from_index(manifests):
    """Fill missing recipient name/license from the CSV transfer index (0 tokens).
    Mutates the manifest dicts in place. Returns how many were filled."""
    try:
        idx = get_full_index()
    except Exception:
        idx = []
    lut = {}
    for r in idx:
        tid = r.get('transfer_id')
        if tid is None:
            continue
        lut[str(tid)] = (r.get('recipient_name', ''), r.get('recipient_license', ''))
    filled = 0
    for t in manifests:
        name, lic = recipient_of(t)
        if name in ('', '—') or not lic:
            hit = lut.get(str(t.get('Id')))
            if hit:
                nm, lc = hit
                if nm and name in ('', '—'):
                    t['RecipientFacilityName'] = nm
                    name = nm
                if lc and not lic:
                    t['RecipientFacilityLicenseNumber'] = lc
                if nm or lc:
                    filled += 1
    return filled


def fill_destinations_via_deliveries(cache, limit=400):
    """Opt-in: for cached manifests still missing a destination, fetch the
    recipient from METRC deliveries (1 call each) and bake it into the cache."""
    manifests = cache.get('manifests', [])
    todo = [t for t in manifests if recipient_of(t)[0] in ('', '—')][:limit]
    if not todo:
        return 0, cache
    # Read-only METRC deliveries fetch, 8 at a time (was 1-by-1 with a 0.15s
    # sleep — ~3.7 min at the 400 cap). Workers only fetch; manifest dicts
    # are mutated back on this thread as results stream in.
    prog = st.progress(0.0, text="Fetching destinations...")
    filled = 0

    def _dels_of(t):
        try:
            return t, get_transfer_deliveries(str(t.get('Id', '')),
                                              LICENSE_MANUFACTURER)
        except Exception:
            return t, []

    from concurrent.futures import ThreadPoolExecutor as _TPE
    with _TPE(max_workers=8) as _ex:
        for i, (t, dels) in enumerate(_ex.map(_dels_of, todo)):
            if dels and isinstance(dels[0], dict):
                d0 = dels[0]
                nm = d0.get('RecipientFacilityName', '')
                lc = d0.get('RecipientFacilityLicenseNumber', '')
                if nm:
                    t['RecipientFacilityName'] = nm
                if lc:
                    t['RecipientFacilityLicenseNumber'] = lc
                if nm or lc:
                    filled += 1
            prog.progress((i + 1) / len(todo),
                          text=f"Destinations... ({filled} filled / {i + 1} of {len(todo)})")
    prog.empty()
    return filled, cache


def manifest_label(t):
    mnum = t.get('ManifestNumber', '—')
    recip, lic = recipient_of(t)
    lic_tag = f" [{lic}]" if lic else ""
    pkgs = t.get('PackageCount', t.get('DeliveryPackageCount', '?'))
    dep = (t.get('EstimatedDepartureDateTime') or t.get('CreatedDateTime') or '')[:10]
    inv = (t.get('InvoiceNumber') or '').strip()
    inv_tag = f" · inv {inv}" if inv else ""
    return f"#{mnum} · {recip}{lic_tag} · {pkgs} pkgs · {dep}{inv_tag}"


def scan_manifest_into_state(chosen):
    """Scan a chosen METRC manifest into session_state for the comparison view.
    Same downstream pipeline as the old typed-invoice scan, but driven by a
    manifest object instead of a human-typed number."""
    transfer_id = str(chosen.get('Id', ''))
    packages, deliveries, lic_used = load_packages_for_transfer(transfer_id, LICENSE_MANUFACTURER)
    if not packages:
        return {"ok": False, "msg": "Found the manifest, but couldn't load its packages from METRC."}

    packages = enrich_packages_with_pdf(packages, transfer_id, lic_used or LICENSE_MANUFACTURER)
    manifest_pkgs = convert_metrc_packages(packages)
    total_manifest_weight = sum(p['quantity'] for p in manifest_pkgs)

    recipient, recip_lic = recipient_of(chosen)
    if deliveries:
        recipient = deliveries[0].get('RecipientFacilityName', '') or recipient
        recip_lic = deliveries[0].get('RecipientFacilityLicenseNumber', '') or recip_lic

    # Store METRC side (keys the display block reads)
    st.session_state['manifest_packages'] = manifest_pkgs
    st.session_state['raw_metrc_packages'] = packages
    st.session_state['total_manifest_weight'] = total_manifest_weight
    st.session_state['selected_manifest_number'] = chosen.get('ManifestNumber', '')
    st.session_state['selected_manifest_invoice'] = (chosen.get('InvoiceNumber') or '').strip()
    st.session_state['selected_recipient'] = recipient
    st.session_state['selected_recipient_license'] = recip_lic

    # Link the Apex invoice from the manifest's InvoiceNumber (raw, then Twiste-<digits>)
    inv_raw = (chosen.get('InvoiceNumber') or '').strip()
    digits = ''.join(re.findall(r'\d+', inv_raw))
    st.session_state['selected_invoice'] = digits or inv_raw or ''
    candidates = [c for c in [inv_raw, (f"Twiste-{digits}" if digits else None)] if c]
    oid = None
    for cand in candidates:
        oid = get_order_by_invoice_number(cand)
        if oid:
            break

    if not oid:
        # No linked Apex invoice — clear any prior comparison so we show METRC-only
        for k in ('comparison_df', 'invoice_items', 'invoice_number', 'buyer_name',
                  'order_id', 'total_invoice_weight', 'order_total'):
            st.session_state.pop(k, None)
        return {"ok": True, "has_apex": False,
                "msg": (f"METRC manifest #{chosen.get('ManifestNumber', '')} -> {recipient} - "
                        f"{len(manifest_pkgs)} pkgs - {total_manifest_weight:.1f}g "
                        f"(no linked Apex invoice found).")}

    od = get_order_details(oid)
    if not od or 'order' not in od:
        return {"ok": False, "msg": "Could not load Apex invoice details."}

    o = od['order']
    items = o.get('items', [])
    buyer_obj = o.get('buyer') or {}
    buyer = buyer_obj.get('name', 'N/A') if isinstance(buyer_obj, dict) else 'N/A'
    tiw = 0
    for item in items:
        tw, _ = calculate_total_weight(item)
        if tw:
            tiw += tw

    st.session_state.update({
        'invoice_items': items,
        'invoice_number': o.get('invoice_number', ''),
        'buyer_name': buyer,
        'order_id': o.get('id'),
        'order_total': o.get('total'),
        'total_invoice_weight': tiw,
    })
    st.session_state['comparison_df'] = create_exact_match_comparison(items, manifest_pkgs)
    return {"ok": True, "has_apex": True, "msg": ""}


# ============================================================
# RESTORED: SEARCH BY APEX INVOICE #  (invoice-first workflow)
# ============================================================

def _digits(s):
    return ''.join(re.findall(r'\d+', str(s or '')))


def _buyer_license(o):
    """Best-effort: Apex usually has no license, but if any license-ish field
    exists on the buyer or order, prefer one that looks like a METRC license."""
    cands = []
    buyer = o.get('buyer') or {}
    if isinstance(buyer, dict):
        for k, v in buyer.items():
            if 'license' in str(k).lower() and v:
                cands.append(str(v))
    for k in ('ship_license', 'license_number', 'metrc_license', 'recipient_license'):
        v = o.get(k)
        if v:
            cands.append(str(v))
    for c in cands:  # prefer something shaped like a license (letters + digits)
        if re.search(r'[A-Za-z]', c) and re.search(r'\d', c):
            return c
    return cands[0] if cands else ''


def _store_stem(name):
    """Reduce an Apex buyer/ship name to a stem that substring-matches METRC's
    recipient name: drop a location suffix after a dash and a trailing Inc/LLC."""
    s = (name or '').strip()
    for dash in (' - ', ' – ', ' — '):
        if dash in s:
            s = s.split(dash)[0]
            break
    s = re.sub(r',?\s*(inc|llc|co|corp|ltd|company)\.?$', '', s, flags=re.I).strip()
    return s


def find_manifests_in_index_for_invoice(invoice_str):
    """Find METRC transfers in the local index whose invoice matches (by digits
    or exact)."""
    target = _digits(invoice_str)
    full = get_full_index()
    out, seen = [], set()
    for t in full:
        inv = t.get('invoice_number', '')
        hit = (target and _digits(inv) == target) or \
              (inv and str(inv).strip() == str(invoice_str).strip())
        if hit:
            tid = t.get('transfer_id')
            if tid in seen:
                continue
            seen.add(tid)
            out.append(t)
    return out


def build_comparison_from_transfer_id(transfer_id, license_number, manifest_number,
                                      recipient_hint, recipient_license_hint,
                                      invoice_items, buyer, order_total,
                                      total_invoice_weight, invoice_label):
    """Invoice-first: load live METRC packages for a known transfer and compare."""
    packages, deliveries, lic_used = load_packages_for_transfer(
        str(transfer_id), license_number)
    if not packages:
        return False, "Found the manifest in the index, but METRC returned no packages."

    packages = enrich_packages_with_pdf(
        packages, str(transfer_id), lic_used or license_number or LICENSE_MANUFACTURER)
    manifest_pkgs = convert_metrc_packages(packages)
    total_manifest_weight = sum(p['quantity'] for p in manifest_pkgs)

    recipient = recipient_hint or ''
    recip_lic = recipient_license_hint or ''
    if deliveries:
        recipient = deliveries[0].get('RecipientFacilityName', '') or recipient
        recip_lic = deliveries[0].get('RecipientFacilityLicenseNumber', '') or recip_lic

    st.session_state['manifest_packages'] = manifest_pkgs
    st.session_state['raw_metrc_packages'] = packages
    st.session_state['total_manifest_weight'] = total_manifest_weight
    st.session_state['selected_manifest_number'] = manifest_number or ''
    st.session_state['selected_manifest_invoice'] = str(invoice_label or '')
    st.session_state['selected_recipient'] = recipient
    st.session_state['selected_recipient_license'] = recip_lic
    st.session_state['selected_invoice'] = invoice_label
    st.session_state.update({
        'invoice_items': invoice_items,
        'buyer_name': buyer,
        'order_total': order_total,
        'total_invoice_weight': total_invoice_weight,
    })
    st.session_state['comparison_df'] = create_exact_match_comparison(
        invoice_items, manifest_pkgs)
    return True, ""


def _apex_invoice_table(items):
    rows = []
    for i, it in enumerate(items, 1):
        w, _ = calculate_total_weight(it)
        rows.append({'#': i, 'Product': it.get('product_name', ''),
                     'Batch': it.get('batch_name', ''),
                     'Weight': f"{w:.1f}g" if w else "N/A"})
    return pd.DataFrame(rows)


# ============================================================
# PDF FALLBACK PARSER (ported from streamlit11 — full packages)
# ============================================================

def parse_metrc_manifest_full(pdf_text):
    """Parse a METRC manifest PDF's text into full package dicts (last resort)."""
    packages = []
    pattern = r'(\d+)\s*\.\s*Package\s*\|\s*(?:Shipped|Accepted)'
    sections = re.split(pattern, pdf_text or "")
    for i in range(1, len(sections), 2):
        if i + 1 >= len(sections):
            break
        package_number = sections[i].strip()
        section = sections[i + 1]
        pkg = {'package_number': package_number, 'package_tag': '', 'batch_name': '',
               'item_name': '', 'quantity': 0, 'unit': 'g'}
        m = re.search(r'(1A[A-Z0-9]{10,})', section)
        if m:
            pkg['package_tag'] = m.group(1)
        m = re.search(r'(M\d+):\s*([^\n]+(?:\n[^\n]+)?)', section)
        if m:
            pkg['item_name'] = re.sub(r'\s+', ' ', m.group(2).strip())
        bm = re.search(r'Source Production Batch\s+(TG\s+[^\n]+\s+-\s+\d+\s*\([A-Z]\))', section)
        if not bm:
            bm = re.search(r'Source Production Batch\s+([^\n]+\s+\d+\s+[A-Z]\d+\s*\([A-Z]\))', section)
        if not bm:
            bm = re.search(r'Source Production Batch\s+([^\n]{10,100})', section)
        if bm:
            pkg['batch_name'] = re.sub(r'\s+', ' ', bm.group(1).strip())
        qm = re.search(r'Shp:\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)', section)
        if qm:
            pkg['quantity'] = float(qm.group(1))
            pkg['unit'] = qm.group(2)
        if pkg['batch_name'] and pkg['quantity'] > 0:
            packages.append(pkg)
    return packages


# ============================================================
# MANIFEST SORT / SEARCH  (single dropdown, METRC-style destination)
# ============================================================

def _best_date(t):
    """(datetime, 'YYYY-MM-DD') using the best available real date, ignoring
    METRC placeholder dates like 0001-01-01."""
    for f in ('EstimatedDepartureDateTime', 'CreatedDateTime',
              'LastModifiedDateTime', 'ReceivedDateTime'):
        v = t.get(f)
        if v and len(str(v)) >= 10:
            ds = str(v)[:10]
            try:
                d = datetime.strptime(ds, "%Y-%m-%d")
                if d.year > 1900:
                    return d, ds
            except Exception:
                pass
    return None, ''


def manifest_dropdown_label(t):
    """Mirror METRC's Outgoing list: #manifest · LICENSE (Store) · N pkgs · date · status."""
    mnum = t.get('ManifestNumber', '—')
    name, lic = recipient_of(t)
    dest = f"{lic} ({name})" if lic else name
    pkgs = t.get('PackageCount', t.get('DeliveryPackageCount', '?'))
    _, ds = _best_date(t)
    ds = ds or '—'
    inv = (t.get('InvoiceNumber') or '').strip()
    inv_tag = f" · inv {inv}" if inv else ""
    return f"#{mnum} · {dest} · {pkgs} pkgs · {ds} · {classify_manifest(t)}{inv_tag}"


SORT_FIELDS = ["Date", "Destination", "Manifest #", "Packages", "Status"]


def sort_filter_manifests(manifests, search="", sort_by="Date",
                          descending=True, status="All"):
    rows = list(manifests)
    if status in ("Active", "Inactive"):
        rows = [t for t in rows if classify_manifest(t) == status]
    s = (search or "").strip().lower()
    if s:
        def hay(t):
            name, lic = recipient_of(t)
            return " ".join([str(t.get('ManifestNumber', '')), name, lic,
                             str(t.get('InvoiceNumber', ''))]).lower()
        rows = [t for t in rows if s in hay(t)]

    def keyf(t):
        name, lic = recipient_of(t)
        if sort_by == "Manifest #":
            return str(t.get('ManifestNumber', ''))
        if sort_by == "Destination":
            return (name or "").lower()
        if sort_by == "Packages":
            try:
                return int(t.get('PackageCount', t.get('DeliveryPackageCount', 0)) or 0)
            except Exception:
                return 0
        if sort_by == "Status":
            return classify_manifest(t)
        d, _ = _best_date(t)
        return d or datetime.min

    return sorted(rows, key=keyf, reverse=descending)


# ============================================================
# LOADERS  (each populates only its own side of the screen)
# ============================================================

def load_apex_invoice(prefix, num):
    full_inv = f"{prefix}{num.strip()}" if prefix else num.strip()
    candidates = [c for c in [full_inv, num.strip(),
                  (f"Twiste-{_digits(num)}" if _digits(num) else None)] if c]
    oid = None
    for cand in candidates:
        oid = get_order_by_invoice_number(cand)
        if oid:
            break
    if not oid:
        return False, f"No Apex order found for '{full_inv}'."
    od = get_order_details(oid)
    if not od or 'order' not in od:
        return False, "Could not load Apex order details."
    o = od['order']
    items = o.get('items', [])
    bo = o.get('buyer')
    buyer = bo.get('name', '') if isinstance(bo, dict) else ''
    ship_name = (o.get('ship_name') or '').strip()
    ship_city = (o.get('ship_city') or '').strip()
    # Apex display name is the account; ship_name is the actual ship-to store.
    buyer = buyer or ship_name or o.get('buyer_contact_name', '') or 'N/A'
    tiw = 0
    for it in items:
        w, _ = calculate_total_weight(it)
        if w:
            tiw += w
    status_obj = o.get('order_status') or {}
    st.session_state.update({
        'invoice_items': items,
        'buyer_name': buyer,
        'order_total': o.get('total'),
        'selected_invoice': o.get('invoice_number', '') or _digits(num) or num.strip(),
        'total_invoice_weight': tiw,
        'order_status_name': status_obj.get('name', '') if isinstance(status_obj, dict) else '',
        'apex_buyer_license': _buyer_license(o),
        'apex_ship_stem': _store_stem(ship_name),
        'apex_store_stem': _store_stem(buyer),
        'apex_ship_city': ship_city,
        'apex_order_id': oid,
        'apex_order_raw': o,
    })
    st.session_state['invoice_items_original'] = [dict(x) for x in items]
    st.session_state['removed_items'] = []
    st.session_state.pop('apex_push_log', None)
    st.session_state.pop('comparison_df', None)
    # Built files belong to the PREVIOUS invoice — never email/download stale ones.
    for k in ('inv_pdf_blob', 'inv_bundle_blob', 'coa_zip_blob'):
        st.session_state.pop(k, None)
    return True, ""


def _invoice_loaded():
    """True once an Apex order is loaded — even a $0 / zero-line invoice. An order
    with no product is still a real, editable invoice you can add product to, so the
    UI must treat it as loaded (an empty items list is falsy and must not gate this)."""
    return (st.session_state.get('apex_order_raw') is not None
            or bool(st.session_state.get('invoice_items')))


def pick_manifest_query():
    """Pick the best search term AND, when possible, the single manifest to
    auto-select. Preference for the query: invoice # (exact) -> ship store ->
    buyer store -> city. Auto-select target: the lone manifest carrying this
    invoice number, else the lone match for the chosen query.
    Returns (query, n_hits, auto_manifest_or_None)."""
    cache = st.session_state.get('mp_cache') or load_manifest_cache()
    all_cached = cache.get('manifests', [])
    manifests = manifests_in_window(all_cached) or all_cached  # mirror the panel
    try:
        enrich_recipients_from_index(manifests)  # 0 tokens; needed for name match
    except Exception:
        pass

    inv = _digits(st.session_state.get('selected_invoice', ''))
    inv_exact = [t for t in manifests
                 if inv and _digits(t.get('InvoiceNumber', '')) == inv]

    # A just-printed invoice's manifest is often NEWER than the cache (invoice
    # 1505's transfer was created 6 minutes after the morning pull). One cheap
    # active-outgoing call catches it before we resort to guessing by store.
    if inv and not inv_exact:
        try:
            cache, _ = refresh_quick(cache)
            save_manifest_cache(cache)
            st.session_state['mp_cache'] = cache
            all_cached = cache.get('manifests', [])
            manifests = manifests_in_window(all_cached) or all_cached
            try:
                enrich_recipients_from_index(manifests)
            except Exception:
                pass
            inv_exact = [t for t in manifests
                         if _digits(t.get('InvoiceNumber', '')) == inv]
        except Exception:
            pass

    cands = []
    if inv:
        cands.append(inv)
    for k in ('apex_buyer_license', 'apex_ship_stem', 'apex_store_stem', 'apex_ship_city'):
        v = (st.session_state.get(k) or '').strip()
        if v and v not in cands:
            cands.append(v)

    query, hits = '', 0
    for c in cands:
        h = sort_filter_manifests(manifests, search=c)
        if h:
            query, hits = c, len(h)
            break
    if not query:
        for k in ('apex_ship_stem', 'apex_store_stem'):
            v = (st.session_state.get(k) or '').strip()
            if v:
                query = v
                break
        query = query or inv

    # Decide what (if anything) to auto-select. NEVER auto-select a manifest
    # tagged with a DIFFERENT invoice number: a lone store/city hit used to be
    # trusted blindly, which silently compared invoice 1505 against the same
    # store's month-old manifest (inv 1383). Invoice match or nothing.
    auto = None
    if len(inv_exact) == 1:
        auto = inv_exact[0]
    elif query:
        h = sort_filter_manifests(manifests, search=query)
        if len(h) == 1:
            h_inv = _digits(h[0].get('InvoiceNumber', ''))
            if not inv or (h_inv and h_inv == inv):
                auto = h[0]

    # Make sure the search box query actually surfaces the auto-selected one,
    # so its label is a valid dropdown option.
    if auto is not None:
        q2 = _digits(auto.get('InvoiceNumber', '')) or str(auto.get('ManifestNumber', ''))
        if q2 and sort_filter_manifests(manifests, search=q2):
            query = q2
            hits = len(sort_filter_manifests(manifests, search=q2))

    return query, hits, auto


def load_metrc_from_manifest(chosen, autofill_apex=True):
    transfer_id = str(chosen.get('Id', ''))
    packages, deliveries, lic_used = load_packages_for_transfer(
        transfer_id, LICENSE_MANUFACTURER)
    if not packages:
        return False, "Found the manifest, but METRC returned no packages."
    packages = enrich_packages_with_pdf(
        packages, transfer_id, lic_used or LICENSE_MANUFACTURER)
    mpkgs = convert_metrc_packages(packages)
    name, lic = recipient_of(chosen)
    if deliveries:
        name = deliveries[0].get('RecipientFacilityName', '') or name
        lic = deliveries[0].get('RecipientFacilityLicenseNumber', '') or lic
    st.session_state.update({
        'manifest_packages': mpkgs,
        'raw_metrc_packages': packages,
        'total_manifest_weight': sum(p['quantity'] for p in mpkgs),
        'selected_manifest_number': chosen.get('ManifestNumber', ''),
        'selected_manifest_invoice': (chosen.get('InvoiceNumber') or '').strip(),
        'selected_recipient': name,
        'selected_recipient_license': lic,
        'metrc_source': 'api',
    })
    st.session_state.pop('comparison_df', None)
    # If no Apex invoice is loaded at all, auto-fill it from the manifest's invoice
    # number. (A loaded $0/empty invoice counts as loaded — don't clobber it.)
    if autofill_apex and not _invoice_loaded():
        inv_raw = (chosen.get('InvoiceNumber') or '').strip()
        if inv_raw:
            load_apex_invoice("", inv_raw)
    return True, ""


def load_metrc_from_pdf(uploaded_file):
    if not HAS_PYPDF:
        return False, "pypdf is not installed — cannot parse the PDF."
    try:
        reader = PdfReader(uploaded_file)
        text = "".join((pg.extract_text() or "") for pg in reader.pages)
    except Exception as e:
        return False, f"Could not read PDF: {e}"
    pkgs = parse_metrc_manifest_full(text)
    if not pkgs:
        return False, "No packages parsed from that PDF."
    st.session_state.update({
        'manifest_packages': pkgs,
        'raw_metrc_packages': [],
        'total_manifest_weight': sum(p.get('quantity', 0) for p in pkgs),
        'selected_manifest_number': 'PDF upload',
        'selected_manifest_invoice': '',
        'metrc_source': 'pdf',
    })
    st.session_state.setdefault('selected_recipient', '(from PDF)')
    st.session_state.setdefault('selected_recipient_license', '')
    st.session_state.pop('comparison_df', None)
    return True, ""


def maybe_autocompare():
    items = st.session_state.get('invoice_items')
    pkgs = st.session_state.get('manifest_packages')
    if items and pkgs:
        sig = (st.session_state.get('selected_invoice', ''),
               st.session_state.get('selected_manifest_number', ''),
               len(items), len(pkgs))
        if st.session_state.get('_cmp_sig') != sig or 'comparison_df' not in st.session_state:
            st.session_state['comparison_df'] = create_exact_match_comparison(items, pkgs)
            st.session_state['_cmp_sig'] = sig


# ============================================================
# APEX INVENTORY CACHE  (find-all -> JSON -> scan for changes)
#   Boot reads apex_inventory.json (0 calls). "Load inventory" does a find-all;
#   "Refresh inventory" pulls only products changed since the last load.
# ============================================================

def load_inventory_cache():
    if os.path.exists(INVENTORY_CACHE_FILE):
        try:
            with open(INVENTORY_CACHE_FILE) as f:
                c = json.load(f)
            c.setdefault('products', [])
            return c
        except Exception:
            pass
    return {'pulled_at': None, 'last_pull_date': None, 'products': []}


def save_inventory_cache(cache):
    try:
        with open(INVENTORY_CACHE_FILE, 'w') as f:
            json.dump(cache, f, indent=2, default=str)
    except Exception as e:
        st.warning(f"Could not write {INVENTORY_CACHE_FILE}: {e}")


def fetch_apex_products(updated_at_from, max_pages=50, show_progress=True):
    """Find-all products from Apex /products, paginated (same shape as main.py)."""
    out = []
    url = f"{APEX_API_V1}/products"
    progress = st.progress(0.0, text="Pulling inventory...") if show_progress else None
    page = 1
    while page <= max_pages:
        params = {'updated_at_from': updated_at_from, 'per_page': 100,
                  'page': page, 'include_archived': 'true'}
        try:
            resp = _HTTP.get(url, headers=apex_headers, params=params, timeout=30)
        except Exception:
            break
        if resp.status_code != 200:
            break
        data = resp.json()
        products = data.get('products', []) if isinstance(data, dict) else data
        if not products:
            break
        out.extend(products)
        if progress:
            progress.progress(min(page / max_pages, 1.0),
                              text=f"Pulling inventory... ({len(out)} so far)")
        if len(products) < 100:
            break
        page += 1
        time.sleep(0.2)
    if progress:
        progress.empty()
    return out


def _product_sig(p):
    return str(p.get('updated_at', '')) + "|" + str(p.get('name', ''))


def _merge_inventory(cache, fetched):
    existing = {str(p.get('id')): p for p in cache.get('products', [])
                if p.get('id') is not None}
    before = set(existing.keys())
    before_sig = {i: _product_sig(p) for i, p in existing.items()}
    for p in fetched:
        pid = p.get('id')
        if pid is None:
            continue
        existing[str(pid)] = p
    after = set(existing.keys())
    new_ids = sorted(after - before)
    changed = [i for i in (after & before)
               if _product_sig(existing[i]) != before_sig.get(i)]
    new_cache = {
        'pulled_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'last_pull_date': datetime.now().strftime('%Y-%m-%d'),
        'products': list(existing.values()),
    }
    return new_cache, {'new': [existing[i] for i in new_ids],
                       'changed': [existing[i] for i in changed],
                       'total': len(existing)}


def refresh_inventory_full(cache):
    uaf = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%dT%H:%M:%SZ')
    return _merge_inventory(cache, fetch_apex_products(uaf))


def refresh_inventory_changes(cache):
    last = cache.get('last_pull_date')
    if last:
        try:
            uaf = datetime.strptime(last, "%Y-%m-%d").strftime('%Y-%m-%dT%H:%M:%SZ')
        except Exception:
            uaf = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%dT%H:%M:%SZ')
    else:
        uaf = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%dT%H:%M:%SZ')
    return _merge_inventory(cache, fetch_apex_products(uaf))


def _p_brand(p):
    b = p.get('brand')
    if isinstance(b, dict):
        b = b.get('name', '')
    return b or p.get('brand_name', '') or ''


def _p_price(p):
    for k in ('listing_price', 'price', 'order_price', 'wholesale_price', 'unit_price'):
        v = p.get(k)
        if v not in (None, '', 0, '0', '0.00'):
            try:
                return float(v)
            except Exception:
                pass
    return None


def _p_qty(p):
    for k in ('inventory_quantity', 'quantity', 'available_quantity',
              'inventory', 'on_hand', 'qty'):
        v = p.get(k)
        if v not in (None, ''):
            try:
                return float(v)
            except Exception:
                pass
    upc = p.get('units_per_case')  # catalog fallback: packaging quantity
    try:
        return float(upc) if upc not in (None, '') else None
    except Exception:
        return None


def _parse_size_to_grams(s):
    s = (s or '').lower()
    if '1/8' in s:
        return 3.5
    if '1/4' in s:
        return 7.0
    if '1/2' in s and ('oz' in s or 'ounce' in s):
        return 14.0
    m = re.search(r'(\d*\.?\d+)\s*g\b', s)
    if m:
        return float(m.group(1))
    m = re.search(r'(\d*\.?\d+)\s*oz', s)
    if m:
        return float(m.group(1)) * 28.0
    if '1 oz' in s or 'one oz' in s:
        return 28.0
    return None


def _p_unit_grams(p):
    pus = p.get('packaged_unit_size')
    nm = pus.get('name', '') if isinstance(pus, dict) else ''
    g = _parse_size_to_grams(nm) or extract_unit_size_from_name(p.get('name', ''))
    # Multi-pack products carry the PER-PIECE weight in Apex ('Weight: 1 Grams'
    # on the five-pack product) — the sellable unit is the pack. Same 1g-joint
    # default as calculate_total_weight when the product gives no size at all.
    mp = multipack_count(p.get('name', ''))
    if mp:
        if not g and re.search(r'joint|pre[\s-]?roll', (p.get('name') or '').lower()):
            g = 1.0
        if g:
            g *= mp
    return g


def sort_products(products, sort_by, desc=False):
    def key(p):
        if sort_by == "Brand":
            return (_p_brand(p) or "").lower()
        if sort_by == "Product":
            return (p.get('name') or "").lower()
        if sort_by == "SKU":
            return (p.get('product_sku') or "").lower()
        if sort_by == "Price":
            v = _p_price(p)
            return v if v is not None else -1.0
        if sort_by == "Quantity":
            v = _p_qty(p)
            return v if v is not None else -1.0
        return (p.get('name') or "").lower()
    return sorted(products, key=key, reverse=desc)


def filter_products(products, q):
    s = (q or '').strip().lower()
    if not s:
        return products
    out = []
    for p in products:
        cat = p.get('category')
        cat_name = cat.get('name', '') if isinstance(cat, dict) else ''
        hay = " ".join([str(p.get('name', '')), str(p.get('product_sku', '')),
                        str(_p_brand(p)), str(cat_name)]).lower()
        if s in hay:
            out.append(p)
    return out


# ============================================================
# INVENTORY / QTY MANAGEMENT  (ported from main.py bearer API)
#   Reads batches via /api/v2/batches (name · inventory_quantity[UNITS] ·
#   listing_price · disable_inventory_tracking) and edits via PATCH, the same
#   surface the Product & Batch Manager uses.
# ============================================================
APEX_API_V2 = "https://app.apextrading.com/api/v2"


@st.cache_data(ttl=900, show_spinner=False)
def fetch_product_batches(product_id):
    """Every batch for one product. Served straight off the ONE cached
    fetch_all_batches_indexed() crawl — this used to re-crawl the ENTIRE
    paginated /v2/batches list per product and filter client-side, so asking
    about N products cost N full catalog crawls. The cache_data wrapper still
    hands callers their own copy, so edits can't corrupt the shared index."""
    return fetch_all_batches_indexed().get(str(product_id), [])


def _batch_qty(b):
    """Available units off a batch. Confirmed from metrc_tagging: the real field is
    `quantity` (alternates checked for safety)."""
    if not isinstance(b, dict):
        return None
    for k in ('quantity', 'inventory_quantity', 'available_quantity',
              'quantity_available', 'available', 'units_available', 'on_hand', 'qty'):
        v = b.get(k)
        if isinstance(v, bool):
            continue
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str) and v.strip():
            try:
                return float(v)
            except Exception:
                pass
    return None


# ttl 900 (was 180): this crawl is many sequential API pages — at 3 min it made
# a random click freeze for seconds several times per session. Post-write
# freshness is handled by batch_overrides + _patch_batches_in_view, and the
# 🔄 refresh button clears this cache explicitly, so a longer ttl is safe.
# cache_resource (was cache_data): the multi-MB index was DEEP-COPIED on every
# cache hit (~77 ms each, once per comparison row). All consumers are
# read-only lookups, so they now share the one object — TREAT THE RETURNED
# INDEX AS READ-ONLY; anything needing a mutable copy goes through
# fetch_product_batches, which still copies out.
@st.cache_resource(ttl=900, show_spinner="Loading batches…")
def fetch_all_batches_indexed():
    """One paginated /v2/batches pull, grouped by product_id — the whole batch list
    fetched once and indexed, so the adder grid shows REAL available units (sum of
    inventory_quantity) and the staging picker has real batch_ids without the separate
    b-api pull. Same endpoint main.py uses."""
    idx, page = {}, 1
    frm = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%dT%H:%M:%SZ')
    while page <= 200:
        try:
            r = _HTTP.get(f"{APEX_API_V2}/batches", headers=apex_headers,
                             params={'updated_at_from': frm, 'per_page': 100,
                                     'page': page, 'include_archived': 'true'},
                             timeout=30)
        except Exception:
            break
        if r.status_code != 200:
            break
        data = r.json()
        batches = data.get('batches', data) if isinstance(data, dict) else data
        if not batches:
            break
        for b in batches:
            pid = b.get('product_id')
            if pid is not None:
                idx.setdefault(str(pid), []).append(b)
        if len(batches) < 100:
            break
        page += 1
    if not idx:
        # Bearer API dead (monthly credit cap → 429). Rebuild the index from the
        # b-api batch-inventory pull so everything downstream — the adder grid,
        # avail display, and the comparison-row ➕ candidates — keeps working.
        # Rows are reshaped to look like /v2 batches (_batch_qty reads `quantity`).
        for r in (load_bapi_inventory().get('rows') or []):
            pid, bid = r.get('product_id'), r.get('batch_id')
            if pid is None or bid is None:
                continue
            idx.setdefault(str(pid), []).append({
                'id': bid,
                'product_id': pid,
                'name': r.get('batch_name') or '',
                'quantity': r.get('qty'),
                'archived': r.get('status') == 'Archived',
            })
    return idx


def _product_available_units(batches):
    """(available_units, infinite?) for a product's batch list. Infinite if ANY batch
    disables tracking; else the summed inventory_quantity (None if nothing readable)."""
    if not batches:
        return None, False
    if any(b.get('disable_inventory_tracking') for b in batches):
        return None, True
    tot, seen = 0.0, False
    for b in batches:
        v = _batch_qty(b)
        if v is not None:
            tot += v
            seen = True
    return (tot if seen else None), False


def get_batch_fresh(product_id, batch_id):
    """Live, uncached batch read so the UI can SEE inventory move after a write.
    Tries the single-batch GET first, then falls back to the per-product list."""
    try:
        r = _HTTP.get(f"{APEX_API_V2}/batches/{batch_id}", headers=apex_headers,
                         timeout=30)
        if r.status_code == 200:
            d = r.json()
            b = d.get('batch', d) if isinstance(d, dict) else d
            if isinstance(b, dict) and b.get('id'):
                return b
    except Exception:
        pass
    blist = fetch_product_batches(product_id)
    return next((x for x in blist if str(x.get('id')) == str(batch_id)), None)


def _patch_batches_in_view(pairs):
    """Refetch ONLY the batches that actually changed and stash each as an override, so
    the Batch-inventory grid shows their new on-hand WITHOUT re-crawling the whole
    /v2/batches list. `pairs` is an iterable of (product_id, batch_id). One single-batch
    GET per touched batch — the untouched majority is left on the cached index.
    Returns the count actually refreshed."""
    ov = st.session_state.setdefault('batch_overrides', {})
    seen, n = set(), 0
    for product_id, batch_id in pairs:
        if batch_id is None:
            continue
        key = str(batch_id)
        if key in seen:
            continue
        seen.add(key)
        fresh = get_batch_fresh(product_id, batch_id)
        if fresh:
            ov[key] = fresh
            n += 1
    return n


def update_batch(batch_id, updates):
    """PATCH a batch (name / inventory_quantity / listing_price). Mirrors main.py's
    update_product (which PATCHes /v1/products/{id}); batches live under /v2/batches.
    NOTE: main.py only ever CREATES batches (POST), so this PATCH path is the natural
    guess but is not yet confirmed — the raw response is surfaced so you can verify.
    Returns (ok, msg, raw)."""
    try:
        r = _HTTP.patch(f"{APEX_API_V2}/batches/{batch_id}",
                           headers=apex_headers, json=updates, timeout=30)
        try:
            raw = r.json()
        except Exception:
            raw = r.text
        return r.status_code in (200, 201), f"HTTP {r.status_code}", raw
    except Exception as e:
        return False, f"Exception: {e}", None


def _top_up_batch(product_id, batch_id, units, step=None):
    """Raise ONE batch's on-hand to `units` using whichever write path is alive.

    The bearer PATCH /v2/batches is metered and dies with HTTP 429 the moment the
    Apex monthly API cap is reached — which used to hard-block every "the batch is
    sitting at zero" top-up. So: try the browser session's b-api write FIRST (free,
    unmetered, and the one the Apex UI itself uses); `bapi_update_batch_quantity`
    already falls back to the bearer PATCH internally, so the bearer path is still
    covered. With no session loaded, go straight to bearer.

    On success the in-view Avail number is refreshed; when the bearer single-batch
    READ is capped too, a synthetic override keeps the grid honest instead of
    leaving it showing the stale 0. Returns (ok, msg).
    """
    try:
        units = int(units)
    except (TypeError, ValueError):
        return False, f"bad quantity {units!r}"
    sess = st.session_state.get('bapi_session') or {}
    if _session_ready(sess):
        ok, msg = bapi_update_batch_quantity(sess, batch_id, units, step=step)
    else:
        ok, msg, _raw = update_batch(batch_id, {'quantity': units})
        msg = f"bearer {msg} (no browser session — b-api top-up unavailable)"
    if ok:
        if not _patch_batches_in_view([(product_id, batch_id)]):
            # bearer read capped as well — record what we just wrote so Avail moves
            ov = st.session_state.setdefault('batch_overrides', {})
            base = dict(ov.get(str(batch_id)) or {})
            base.update({'id': batch_id, 'product_id': product_id, 'quantity': units})
            ov[str(batch_id)] = base
    return ok, msg


def update_product_fields(product_id, updates):
    """PATCH a product (e.g. listing_price) — confirmed working in main.py."""
    try:
        r = _HTTP.patch(f"{APEX_API_V1}/products/{product_id}",
                           headers=apex_headers, json=updates, timeout=30)
        try:
            raw = r.json()
        except Exception:
            raw = r.text
        return r.status_code in (200, 201), f"HTTP {r.status_code}", raw
    except Exception as e:
        return False, f"Exception: {e}", None


def _units_on_order_for_batch(items, batch_id):
    """UNITS an order's lines draw from a batch (cases expanded via units_per_case)."""
    total = 0.0
    for it in items or []:
        if str(it.get('batch_id')) != str(batch_id):
            continue
        oq = float(it.get('order_quantity') or 0)
        uname = ((it.get('order_unit_measurement') or {}).get('name') or '').strip().lower()
        upc = float(it.get('units_per_case') or 0) or 1
        total += oq * (upc if uname.startswith('case') else 1)
    return total


def _batch_avail_units(product_id, batch_id):
    """(available_units, untracked?) for ONE batch — override-aware, no network call.
    Reads the live per-batch override first (set after any write we made), then the
    cached /v2/batches index. Returns (None, False) when the batch can't be found and
    (None, True) when the batch has inventory tracking disabled (infinite)."""
    if batch_id is None:
        return None, False
    b = (st.session_state.get('batch_overrides') or {}).get(str(batch_id))
    if not b:
        idx = fetch_all_batches_indexed()
        b = next((x for x in idx.get(str(product_id), [])
                  if str(x.get('id')) == str(batch_id)), None)
    if not b:
        return None, False
    if b.get('disable_inventory_tracking'):
        return None, True
    return _batch_qty(b), False


def render_inventory_qty():
    """Live batch inventory for every line on the loaded order, in UNITS — see/edit
    available qty + batch name + price, and watch the deduction projection."""
    st.markdown("---")
    st.header("📦 Inventory & QTY (units)")
    items = st.session_state.get('invoice_items')
    if not items:
        st.info("Load an Apex invoice above — this shows each line's live batch "
                "inventory in UNITS and what it projects to after the order.")
        return

    st.caption("Apex stores **orders in cases**; this view is in **units**. "
               "*Available* = the batch's live `inventory_quantity`. "
               "*Projected* = available − units on this order. Use **Refresh** after "
               "a push to see whether Apex auto-deducts tracked stock.")

    st.button("🔄 Refresh inventory from Apex", use_container_width=True,
              on_click=_refresh_inv_from_apex)

    # Distinct (product, batch) pairs on the order.
    seen = {}
    for it in items:
        seen.setdefault((it.get('product_id'), it.get('batch_id')), it)

    cache = st.session_state.setdefault('_inv_batch_cache', {})
    for (pid, bid), it in seen.items():
        if not bid:
            st.container(border=True).warning(
                f"**{it.get('product_name','')}** — no batch_id on this line, so its "
                "inventory can't be resolved. (Lines added without picking a batch.)")
            continue
        if bid not in cache:
            cache[bid] = get_batch_fresh(pid, bid) or {}
        b = cache[bid]

        avail = _p_qty(b)
        price = _p_price(b)
        price = price if price is not None else _p_price(it)
        bname = b.get('name') or it.get('batch_name') or ''
        infinite = bool(b.get('disable_inventory_tracking'))
        on_order = _units_on_order_for_batch(items, bid)
        projected = (avail - on_order) if (avail is not None and not infinite) else None

        with st.container(border=True):
            st.markdown(f"**{it.get('product_name','')}**  ·  batch_id `{bid}`")
            c1, c2, c3, c4 = st.columns([3, 1.3, 1.3, 1.2])
            with c1:
                new_name = st.text_input("Batch name", value=bname, key=f"bn_{bid}")
            with c2:
                if infinite:
                    st.metric("Available", "∞")
                    new_avail = None
                else:
                    new_avail = st.number_input("Available (units)",
                                                value=float(avail or 0), step=1.0,
                                                key=f"ba_{bid}")
            with c3:
                new_price = st.number_input("Price ($)", value=float(price or 0),
                                            step=0.01, format="%.2f", key=f"bp_{bid}")
            with c4:
                st.metric("On this order", f"{on_order:g} u")

            if infinite:
                st.caption("♾️ Infinite tracking — no deduction on this batch.")
            elif projected is not None:
                short = projected < 0
                st.caption(
                    f"{'🔴' if short else '➡️'} Projected after this order: "
                    f"**{projected:g} units** ({avail:g} − {on_order:g})"
                    + ("  · ⚠️ OVERSOLD" if short else ""))
            else:
                st.caption("Available unknown — couldn't read this batch from Apex.")

            e1, e2 = st.columns(2)
            with e1:
                if st.button("💾 Save batch (name / available qty)",
                             key=f"bsave_{bid}", use_container_width=True):
                    updates = {}
                    if new_name and new_name != bname:
                        updates['name'] = new_name
                    if new_avail is not None and float(new_avail) != float(avail or 0):
                        updates['inventory_quantity'] = float(new_avail)
                    if not updates:
                        st.info("Nothing changed.")
                    else:
                        ok, msg, raw = update_batch(bid, updates)
                        (st.success if ok else st.error)(
                            f"{'✅' if ok else '❌'} {msg}")
                        with st.expander("raw response"):
                            st.json(raw)
                        if ok:
                            cache.pop(bid, None)
                            fetch_product_batches.clear()
                            st.rerun()
            with e2:
                if st.button("💲 Save price → product", key=f"psave_{bid}",
                             use_container_width=True):
                    ok, msg, raw = update_product_fields(
                        pid, {'listing_price': float(new_price)})
                    (st.success if ok else st.error)(f"{'✅' if ok else '❌'} {msg}")
                    with st.expander("raw response"):
                        st.json(raw)


def _get_metrc_tag(b):
    """Best-effort METRC package tag/label off a batch (ported from metrc_tagging)."""
    if not isinstance(b, dict):
        return ""
    for k in ('metrc_package_label', 'metrc_package_tag', 'metrc_tag', 'metrc_label',
              'package_label', 'package_tag', 'metrc_uid', 'metrc_id', 'tag'):
        v = b.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    m = b.get('metrc')
    if isinstance(m, dict):
        for k in ('package_label', 'package_tag', 'label', 'tag', 'uid'):
            v = m.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
    pkgs = b.get('packages') or b.get('metrc_packages') or b.get('metrcPackages')
    if isinstance(pkgs, list) and pkgs and isinstance(pkgs[0], dict):
        for k in ('Label', 'label', 'tag', 'package_label', 'metrc_tag', 'uid'):
            v = pkgs[0].get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return ""


def _batch_status(b):
    return "Archived" if (b.get('archived') or b.get('deleted_at')) else "Active"


def render_batch_inventory_editor():
    """METRC-style batch grid: see/edit batch name + available qty (units), preview the
    deduction (-Units), and stage Add-units onto the loaded invoice. Qty / batch-name
    edits AUTO-SAVE to Apex the moment you leave the cell (no Save button). Reads
    /v2/batches and writes each changed row via PATCH /v2/batches/{id}."""
    st.markdown("---")
    st.header("\U0001f9fe Batch inventory \u2014 view / edit")

    # The grid below is the single heaviest widget in the app (DataFrame over
    # every batch + a full data_editor, rebuilt on EVERY rerun) \u2014 so it only
    # builds while this toggle is on. Off by default: every unrelated click in
    # the app gets faster.
    if not st.toggle("Show batch inventory grid", key="bi_show",
                     help="The grid re-renders on every interaction anywhere in "
                          "the app, so it stays off until you need it."):
        st.caption("Grid hidden \u2014 flip the toggle to view/edit batch inventory.")
        return

    idx = fetch_all_batches_indexed()
    flat = [b for lst in idx.values() for b in lst]
    # Overlay any batches we refetched live after a write, so only those rows reflect
    # the new on-hand while the untouched majority stays on the cached crawl.
    overrides = st.session_state.get('batch_overrides') or {}
    if overrides:
        flat = [overrides.get(str(b.get('id')), b) for b in flat]
    if not flat:
        st.warning("No batches returned from /v2/batches. If you expect some, the "
                   "365-day `updated_at` window may be excluding them \u2014 tell me and "
                   "I'll widen it or switch to per-product fetches.")
        return

    # Brand + product-name lookup from the catalog (batches don't always carry brand).
    prod_idx = {}
    for p in ((st.session_state.get('inv_cache') or load_inventory_cache())
              .get('products') or []):
        if p.get('id') is not None:
            prod_idx[str(p['id'])] = p

    def _brand_of(b):
        return (_p_brand(prod_idx.get(str(b.get('product_id')), {}))
                or (b.get('brand') if isinstance(b.get('brand'), str) else '')
                or '\u2014')

    # \u2500\u2500 Filters \u2500\u2500 each has a key, so the text/selection PERSISTS across reruns
    # and stays put until you clear it. It applies as soon as the box loses focus
    # (click the grid) \u2014 no Enter required.
    fc1, fc2 = st.columns([3, 1])
    with fc1:
        name_q = st.text_input("\U0001f50e Filter by product / batch name",
                               key="bi_name",
                               placeholder="type to filter \u2014 stays until you clear it")
    with fc2:
        hide_arch = st.toggle("Hide archived", value=True, key="bi_hidearch")
    all_brands = sorted({_brand_of(b) for b in flat})
    sel_brands = st.multiselect("Filter by brand", all_brands, default=all_brands,
                                key="bi_brands")
    qc1, qc2 = st.columns(2)
    with qc1:
        min_q = st.number_input("Min available qty", value=0, step=1, key="bi_minq")
    with qc2:
        max_q = st.number_input("Max available qty", value=1_000_000, step=1,
                                key="bi_maxq")

    # Per-row Add (units) is remembered here so the -Units preview can react to it
    # and survive reruns / filter changes.
    add_store = st.session_state.setdefault('bi_add', {})

    # \u2500\u2500 Build rows \u2500\u2500
    rows = []
    for b in flat:
        p = prod_idx.get(str(b.get('product_id')), {})
        brand = _brand_of(b)
        status = _batch_status(b)
        qty = _batch_qty(b)
        qty = float(qty) if qty is not None else 0.0
        if hide_arch and status == "Archived":
            continue
        if sel_brands and brand not in sel_brands:
            continue
        if not (min_q <= qty <= max_q):
            continue
        hay = f"{p.get('name','')} {b.get('name','')}".lower()
        if name_q.strip() and name_q.strip().lower() not in hay:
            continue
        bid = b.get('id')
        add_u = int(add_store.get(str(bid), 0) or 0)
        rows.append({
            'Add': add_u,
            '\u2212Units': -add_u,                      # live preview, read-only
            'Product Name': p.get('name') or b.get('product_name') or '',
            'Batch': b.get('name') or '',
            'Brand': brand,
            'Metrc Tag': _get_metrc_tag(b),
            'Qty': int(qty),
            'Price': f"${float(_p_price(b) or 0):.2f}",
            'Status': status,
            'Batch ID': bid,
            'Product ID': b.get('product_id'),
        })

    has_order = _invoice_loaded()
    st.caption(
        f"Showing **{len(rows)}** of {len(flat)} batches  \u00b7  edit **Qty** \u2192 it "
        "**auto-saves to Apex** when you leave the cell (no Save button)  \u00b7  set "
        "**Add (units)** then **Post to invoice**. **\u2212Units** previews what each row "
        "pulls off inventory."
        + ("" if has_order else "  \u26a0\ufe0f *Load an Apex invoice above to enable Add.*")
        + "  *(Price is view-only.)*")
    if not rows:
        st.info("No batches match the filters.")
        return

    # units_per_case lookup (catalog field, else parse "Case of N" from the name).
    def _upc_for(pid, pname):
        pp = prod_idx.get(str(pid), {})
        u = pp.get('units_per_case')
        try:
            u = int(u) if u not in (None, '') else 0
        except Exception:
            u = 0
        if u > 0:
            return u
        m = re.search(r'case of\s*(\d+)', (pname or '').lower())
        return int(m.group(1)) if m else 1

    df = pd.DataFrame(rows)[
        ['Add', 'Product Name', 'Batch', 'Brand', 'Metrc Tag', '\u2212Units', 'Qty',
         'Price', 'Status', 'Batch ID', 'Product ID']]

    # Reset the grid's edit-state when the filter set changes, so stale per-row edits
    # can't bleed onto different rows after filtering.
    filt_sig = abs(hash((name_q.strip().lower(), hide_arch, tuple(sel_brands),
                         int(min_q), int(max_q)))) % 100000
    edited = st.data_editor(
        df, use_container_width=True, hide_index=True, height=560,
        key=f"bi_editor_{filt_sig}_{st.session_state.get('bi_gen', 0)}", num_rows="fixed",
        disabled=['\u2212Units', 'Product Name', 'Brand', 'Metrc Tag', 'Price',
                  'Status', 'Batch ID', 'Product ID'] + ([] if has_order else ['Add']),
        column_config={
            'Add': st.column_config.NumberColumn(
                "\u2795 Add (u)", min_value=0, step=1, width="small",
                help="Units to add to the loaded invoice from this batch. "
                     "Whole cases are sent as cases automatically."),
            '\u2212Units': st.column_config.NumberColumn(
                "\u2212Units", width="small",
                help="Preview \u2014 units this row pulls OFF inventory when posted "
                     "(equals \u2212Add). Updates after you leave the Add cell."),
            'Qty': st.column_config.NumberColumn(
                "Qty (units)", min_value=0, step=1,
                help="On-hand at Apex. Editing this auto-saves the new on-hand to Apex."),
            'Batch ID': st.column_config.NumberColumn("Batch ID", width="small"),
            'Product ID': st.column_config.NumberColumn("Product ID", width="small"),
        })

    orig = {r['Batch ID']: r for r in rows}

    # \u2500\u2500 (a) Sync Add store from the grid; rerun if it changed so -Units updates \u2500\u2500
    add_changed = False
    for _, row in edited.iterrows():
        bid = row['Batch ID']
        try:
            a = int(row['Add'] or 0)
        except Exception:
            a = 0
        k = str(bid)
        if a > 0:
            if add_store.get(k) != a:
                add_store[k] = a
                add_changed = True
        elif k in add_store:
            del add_store[k]
            add_changed = True

    # \u2500\u2500 (b) AUTO-SAVE Qty / Batch-name edits to Apex (replaces the Save button) \u2500\u2500
    saved_marks = st.session_state.setdefault('bi_saved', {})   # bid -> (name, qty)
    autos = []
    saved_pairs = []
    for _, row in edited.iterrows():
        bid = row['Batch ID']
        o = orig.get(bid)
        if not o:
            continue
        cur_name = str(row['Batch']).strip()
        try:
            cur_qty = int(row['Qty'])
        except Exception:
            cur_qty = int(o['Qty'])
        server = (str(o['Batch']).strip(), int(o['Qty']))
        if (cur_name, cur_qty) == server:
            continue                                   # matches Apex \u2014 nothing to save
        if saved_marks.get(bid) == (cur_name, cur_qty):
            continue                                   # already pushed this exact edit
        upd = {}
        if cur_name != str(o['Batch']).strip():
            upd['name'] = cur_name
        if cur_qty != int(o['Qty']):
            upd['quantity'] = cur_qty                  # confirmed write key
        if not upd:
            continue
        ok, msg, _raw = update_batch(bid, upd)
        autos.append((bid, ok, msg))
        if ok:
            saved_marks[bid] = (cur_name, cur_qty)
            saved_pairs.append((row['Product ID'], bid))
    if autos:
        ok_n = sum(1 for _, ok, _ in autos if ok)
        if ok_n == len(autos):
            st.toast(f"\U0001f4be Auto-saved {ok_n} batch edit(s) to Apex", icon="\u2705")
        else:
            st.toast(f"\u26a0\ufe0f Saved {ok_n}/{len(autos)} \u2014 some edits failed",
                     icon="\u26a0\ufe0f")
        _patch_batches_in_view(saved_pairs)   # refresh only the edited batch(es)

    if add_changed:
        st.rerun()        # one rerun so the -Units preview reflects the new Add

    # ── (c) Post staged Add-units onto the invoice (inventory already auto-saved) ──
    # Build the lines BEFORE the button so the on_click callback receives them and we
    # never fire st.rerun() on a click (the explicit rerun is what dropped fast clicks).
    staged_lines = []
    for _, row in edited.iterrows():
        bid = row['Batch ID']
        try:
            add_u = int(row['Add'] or 0)
        except Exception:
            add_u = 0
        if add_u <= 0:
            continue
        pid = row['Product ID']
        pname = row['Product Name']
        upc = _upc_for(pid, pname)
        if upc > 1 and add_u % upc == 0:
            unit, qty = 'Case', add_u // upc
        else:
            unit, qty = 'Unit', add_u
        staged_lines.append(({
            'product_name': pname,
            'product_id': int(pid) if pd.notna(pid) else pid,
            'batch_id': int(bid) if pd.notna(bid) else None,
            'batch_name': row['Batch'],
            'order_quantity': int(qty),
            'order_unit_measurement': {'name': unit},
            'units_per_case': upc,
            '_added': True,
        }, str(bid)))

    st.button("➕ Post to invoice", type="primary", use_container_width=True,
              disabled=not has_order, on_click=_post_staged_to_invoice,
              args=(staged_lines,),
              help="Adds the lines to the Apex order in ONE click (no separate "
                   "Update Invoice) and re-reads on-hand so you see the deduction. "
                   "Apex decrements the batch on the add, so qty is not patched twice.")

    posted = st.session_state.pop('bi_post_result', None)
    if posted == 0:
        st.info("Set a number in the **➕ Add (u)** column on at least one row "
                "first.")
    elif posted:
        v = st.session_state.get('apex_push_verdict')
        if v:
            kind, msg = v
            {'success': st.success, 'error': st.error,
             'info': st.info}.get(kind, st.info)(msg)
            st.caption("Full request/response is in the **Apex update log** up in the "
                       "invoice panel · on-hand below was re-read from Apex.")
        else:
            st.success(f"Posted {posted} line(s) to the Apex order.")



def render_inventory_adder():
    """Spreadsheet-style inventory below the comparison: sort by Brand / Price /
    Qty, click a row's ➕ to stage it, then add by Case or Units."""
    st.markdown("---")
    st.header("📦 Add items from inventory")

    if not _invoice_loaded():
        st.info("Load an Apex invoice above first, then add inventory items to it.")
        return

    inv = st.session_state.get('inv_cache') or load_inventory_cache()
    st.session_state['inv_cache'] = inv
    products = inv.get('products', [])
    if not products:
        st.caption("No inventory cached yet — load it from the sidebar "
                   "(**📦 Load inventory (find all)**).")
        return

    # Real batch inventory (units) per product, from /v2/batches — same source main.py
    # uses. This is what makes the Qty column actual stock instead of units/case.
    batches_idx = fetch_all_batches_indexed()

    # ── Staged add form, shown at the TOP so it's visible right after ➕ ──
    staged = st.session_state.get('inv_staged')
    if staged:
        gpu = _p_unit_grams(staged)
        upc = int(staged.get('units_per_case') or 0) or 1
        default_unit = "Case" if (str(staged.get('sold_as', '')).lower() == 'case'
                                  or upc > 1) else "Units"
        st.markdown(f"#### ➕ Adding: {staged.get('name', '')}")
        st.caption(f"{_p_brand(staged) or '—'} · {upc} units/case"
                   + (f" · ~{gpu:g}g per unit" if gpu else " · unit weight unknown"))
        # Real batches for this product (from /v2/batches) — supplies batch_id +
        # live inventory_quantity. Falls back to the b-api pull if the bearer list
        # has none for this product.
        v2_batches = batches_idx.get(str(staged.get('id')), [])
        chosen_batch_id, chosen_batch_name = None, ""
        if v2_batches:
            def _blabel(b):
                q = b.get('inventory_quantity')
                qs = "∞" if b.get('disable_inventory_tracking') else (
                    f"{float(q):g}" if q not in (None, '') else "?")
                return f"{b.get('name','(unnamed)')}  ·  {qs} units  ·  batch_id {b.get('id')}"
            bopts = [_blabel(b) for b in v2_batches]
            bsel = st.selectbox(f"Batch ({len(v2_batches)}) — live /v2 inventory",
                                bopts, key="inv_add_batch_pick")
            cb = v2_batches[bopts.index(bsel)]
            chosen_batch_id = cb.get('id')
            chosen_batch_name = cb.get('name') or ""
        else:
            # Fallback: the b-api batch inventory rows (if that pull was run).
            pbatches = [r for r in (st.session_state.get('bapi_inv') or {}).get('rows', [])
                        if str(r.get('product_id')) == str(staged.get('id'))]
            if pbatches:
                bopts = [f"{r.get('batch_name')}  ·  qty {r.get('qty')}  ·  batch_id {r.get('batch_id')}"
                         for r in pbatches]
                bsel = st.selectbox(f"Batch ({len(pbatches)}) — b-api fallback",
                                    bopts, key="inv_add_batch_pick")
                cb = pbatches[bopts.index(bsel)]
                chosen_batch_id = cb.get('batch_id')
                chosen_batch_name = cb.get('batch_name') or ""
            else:
                st.caption("⚠️ No batches found for this product in /v2/batches or the "
                           "b-api pull — add-item 500s without a real batch_id.")

        f1, f2, f3, f4 = st.columns([3, 1, 1, 1])
        with f1:
            batch = st.text_input("Batch name (manifest / fallback)", key="inv_add_batch")
        with f2:
            qty = st.number_input("Quantity", min_value=1, step=1, value=1,
                                  key="inv_add_qty")
        with f3:
            unit = st.selectbox("Unit", ["Case", "Units"],
                                index=0 if default_unit == "Case" else 1,
                                key="inv_add_unit")
        with f4:
            gpu_in = st.number_input("g / unit", min_value=0.0, step=0.5,
                                     value=float(gpu or 0.0), key="inv_add_gpu")
        final_batch_name = chosen_batch_name or batch.strip()
        units_total = int(qty) * (upc if unit == "Case" else 1)
        wt = units_total * (gpu_in or 0)
        st.caption(f"= {units_total} units"
                   + (f"  ·  ≈ {wt:.1f}g" if gpu_in
                      else "  ·  weight unknown — set g/unit to match by weight")
                   + (f"  ·  batch_id {chosen_batch_id}" if chosen_batch_id else ""))
        ac1, ac2, _sp = st.columns([1, 1, 3])
        _new_item = {
            'product_name': staged.get('name', ''),
            'product_id': staged.get('id'),
            'batch_id': chosen_batch_id,
            'batch_name': final_batch_name,
            'order_quantity': int(qty),
            'order_unit_measurement': {'name': 'Case' if unit == 'Case' else 'Unit'},
            'units_per_case': upc,
            'unit_size': (gpu_in or None),
            'unit_size_unit_measurement': ({'name': 'grams'} if gpu_in else None),
            '_added': True,
        }
        with ac1:
            st.button("➕ Add to invoice", type="primary",
                      disabled=not final_batch_name,
                      on_click=_adder_add, args=(_new_item,))
        with ac2:
            st.button("✖️ Cancel", key="inv_cancel", on_click=_adder_cancel)
        st.markdown("---")

    # ── Controls + spreadsheet table ──
    with st.expander("🔧 Inspect a raw product (debug)"):
        st.json({k: products[0].get(k) for k in sorted(products[0].keys())})

    c1, c2, c3 = st.columns([2, 1, 1])
    with c1:
        q = st.text_input("🔎 Search product / SKU / brand", key="inv_add_q",
                          placeholder="e.g. Tire Fire, prepack, 3.5g…")
    with c2:
        sort_by = st.selectbox("Sort by",
                               ["Brand", "Product", "Price", "Quantity", "SKU"],
                               key="inv_sort_by")
    with c3:
        desc = st.toggle("Desc", value=False, key="inv_sort_desc",
                         help="High→low / Z→A when on")

    rows = sort_products(filter_products(products, q), sort_by, desc)
    shown = rows[:100]
    have_batches = bool(batches_idx)
    st.caption(
        f"{len(shown)} shown (of {len(products)}). "
        + ("Qty = **available units** (live from /v2/batches). "
           if have_batches else
           "⚠️ No /v2 batches loaded — Qty falls back to units/case. ")
        + "Click ➕ on a row to add it.")

    hdr = st.columns([2.4, 3.4, 1, 1, 0.6])
    for col, lab in zip(hdr, ["Brand", "Product", "Price", "Avail (u)", ""]):
        col.caption(lab)
    for idx, p in enumerate(shown):
        r = st.columns([2.4, 3.4, 1, 1, 0.6])
        r[0].write(_p_brand(p) or "—")
        nm = p.get('name', '')
        r[1].write((nm[:50] + '…') if len(nm) > 50 else nm)
        pr = _p_price(p)
        r[2].write(f"${pr:,.2f}" if pr is not None else "—")
        pbatch = batches_idx.get(str(p.get('id')), [])
        avail_u, infinite = _product_available_units(pbatch)
        if infinite:
            r[3].write("∞")
        elif avail_u is not None:
            r[3].write(f"{avail_u:g}")
        else:  # no batch data — fall back to packaging size, marked so it's not mistaken
            qy = _p_qty(p)
            r[3].write(f"{qy:g}/cs" if qy is not None else "—")
        if r[4].button("➕", key=f"inv_pick_{p.get('id', idx)}_{idx}",
                       help="Stage this product to add"):
            st.session_state['inv_staged'] = p
            st.session_state['inv_add_batch'] = p.get('name', '')
            st.rerun()



# ============================================================
# SIDEBAR — data sources + METRC cache maintenance (token-aware)
# ============================================================

def render_sidebar(csv_data):
    with st.sidebar:
        st.header("⚙️ Data Sources")
        st.markdown("---")
        if csv_data:
            inv_count = len([t for t in csv_data if t.get('invoice_number')])
            last_date, _ = get_csv_last_date()
            st.success(f"📂 **CSV Index:** {len(csv_data)} transfers\n\n"
                       f"({inv_count} with invoices)\n\n"
                       f"Latest data: {last_date or 'unknown'}")
        else:
            st.error("⚠️ No CSV index found.")

        st.markdown("---")
        st.subheader("📦 MP manifest cache")
        cache = st.session_state.get('mp_cache') or load_manifest_cache()
        st.session_state['mp_cache'] = cache
        pulled = cache.get('pulled_at')
        st.caption(f"{len(cache.get('manifests', []))} cached"
                   + (f" · last pull {pulled}" if pulled else " · never pulled"))
        st.caption(f"`{MANIFEST_CACHE_FILE}` · window {MP_WINDOW_DAYS}d")

        did = None
        if st.button("⚡ Quick refresh (1 call)", use_container_width=True,
                     help="Active / in-transit outgoing only — cheapest check"):
            with st.spinner("Active outgoing (1 call)..."):
                cache, did = refresh_quick(cache)
        if st.button("🔄 Refresh changes", use_container_width=True,
                     help="Only the days since the last pull, plus active"):
            with st.spinner("Pulling changes since last refresh..."):
                cache, did = refresh_incremental(cache)
        if st.button(f"⬇️ Full {MP_WINDOW_DAYS}-day pull", use_container_width=True,
                     help="Cold rebuild — heavier, run rarely"):
            with st.spinner(f"Full {MP_WINDOW_DAYS}-day pull..."):
                cache, did = refresh_full(cache)

        if did is not None:
            save_manifest_cache(cache)
            st.session_state['mp_cache'] = cache
            st.session_state['mp_last_changes'] = did
            st.session_state['manifest_pick'] = PICK_PLACEHOLDER
            st.rerun()

        ch = st.session_state.get('mp_last_changes')
        if ch:
            total = ch.get('total', 0)
            in_win = len(manifests_in_window(cache.get('manifests', [])))
            new, changed = ch.get('new', []), ch.get('changed', [])
            if total == 0:
                st.warning("Last pull returned **0 manifests**. Try **Full "
                           f"{MP_WINDOW_DAYS}-day pull**, or confirm outgoing MP "
                           "transfers exist for this window.")
            else:
                st.caption(f"{total} cached · {in_win} within {MP_WINDOW_DAYS}d")
                if not new and not changed:
                    st.success("✅ No changes.")
                if new:
                    st.success(f"🆕 {len(new)} new")
                if changed:
                    st.warning(f"♻️ {len(changed)} changed")
                if new or changed:
                    with st.expander("What changed?"):
                        for tt in (new + changed)[:40]:
                            st.caption("• " + manifest_dropdown_label(tt))

        # Destinations: the outgoing list omits recipient — fill them in
        manifests_now = cache.get('manifests', [])
        if manifests_now:
            enrich_recipients_from_index(manifests_now)
            missing = sum(1 for tt in manifests_now if recipient_of(tt)[0] in ('', '—'))
            if missing:
                st.caption(f"🏪 {missing} missing a destination name.")
                if st.button("🏪 Fill destinations (1 call each)",
                             use_container_width=True,
                             help="Fetch recipient store + license per manifest from "
                                  "METRC deliveries, then cache it"):
                    with st.spinner("Fetching destinations from METRC..."):
                        filled, cache = fill_destinations_via_deliveries(cache)
                    save_manifest_cache(cache)
                    st.session_state['mp_cache'] = cache
                    st.success(f"Filled {filled} destinations.")
                    st.rerun()

        # ── Apex session (b-api, for editing real orders) ──
        st.markdown("---")
        st.subheader("🔑 Apex session (b-api)")
        sess = st.session_state.get('bapi_session') or {}
        if _session_ready(sess):
            sm = _session_summary(sess)
            if sm['has_session_cookie'] and sm['session_cookie_len'] > 20:
                st.success(f"Session loaded ✓  (source: {sm['source']})")
            else:
                st.warning("Session loaded but the apex_trading_session cookie looks "
                           "empty/garbled — this is the usual 401 cause on Chrome/Edge. "
                           "Use Firefox or paste from DevTools.")
            st.caption(f"cookies: {sm['cookies']} · apex_trading_session: "
                       f"{'yes' if sm['has_session_cookie'] else 'NO'} "
                       f"(len {sm['session_cookie_len']}) · xsrf len {sm['xsrf_header_len']}")
        else:
            st.caption("Needed to edit real orders — your logged-in cookie + xsrf.")
        cid_now = sess.get('company_id') or DEFAULT_COMPANY_ID
        if st.button("🦊 Open Firefox → Grab → Test  (all-in-one)",
                     type="primary", use_container_width=True,
                     help="Opens Apex in Firefox, waits while you log in, then grabs "
                          "the session and tests it — looping until it's valid."):
            s, authed, msg = firefox_session_all_in_one(cid_now)
            if s:
                st.session_state['bapi_session'] = s
            if authed:
                st.success(f"Session valid ✓ — {msg}")
            elif s:
                st.warning(f"Grabbed a session but it didn't pass: {msg}")
            else:
                st.error(msg)
            st.rerun()
        st.caption("One click: opens Apex in Firefox, waits while you log in, then "
                   "grabs + tests the session automatically (looping until valid). "
                   "Chrome/Edge v127+ encrypt cookies on disk, so Firefox is the "
                   "reliable path.")

        # ── Contact lists: an editable, saveable Excel-style grid ──
        render_contact_lists_grid()

        # ── b-api batch inventory (real batch_id for add-item) ──
        st.markdown("---")
        st.subheader("🧾 Batch inventory (b-api)")
        binv = st.session_state.get('bapi_inv') or load_bapi_inventory()
        st.session_state['bapi_inv'] = binv
        bp = binv.get('pulled_at')
        st.caption(f"{len(binv.get('rows', []))} batches"
                   + (f" · {bp}" if bp else " · not pulled yet"))
        if st.button("📥 Pull batch inventory (b-api)", use_container_width=True,
                     help="Needs the Apex session. Gives every add a real batch_id."):
            bsess = st.session_state.get('bapi_session') or {}
            if not _session_ready(bsess):
                st.error("Load the Apex session first (above).")
            else:
                with st.spinner("Pulling batch inventory..."):
                    brows, bmsg = bapi_fetch_inventory(bsess)
                if brows:
                    binv = {'pulled_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                            'rows': brows}
                    save_bapi_inventory(binv)
                    st.session_state['bapi_inv'] = binv
                    # Fresh b-api rows: rebuild the batch index now (it may be
                    # serving the b-api fallback while the bearer API is 429-capped)
                    # and drop cached ➕ candidates so the grid re-matches.
                    fetch_all_batches_indexed.clear()
                    for k in [k for k in st.session_state
                              if str(k).startswith('_cmp_cands_')]:
                        st.session_state.pop(k, None)
                    st.success(bmsg)
                else:
                    st.error(bmsg)
                st.rerun()

        # ── Apex inventory cache ──
        st.markdown("---")
        st.subheader("📦 Apex inventory")
        inv = st.session_state.get('inv_cache') or load_inventory_cache()
        st.session_state['inv_cache'] = inv
        ip = inv.get('pulled_at')
        st.caption(f"{len(inv.get('products', []))} products"
                   + (f" · loaded {ip}" if ip else " · not loaded yet"))
        st.caption(f"`{INVENTORY_CACHE_FILE}`")
        idid = None
        if st.button("📦 Load inventory (find all)", use_container_width=True,
                     help="Pull every Apex product into apex_inventory.json"):
            with st.spinner("Loading all inventory..."):
                inv, idid = refresh_inventory_full(inv)
        if st.button("🔄 Refresh inventory", use_container_width=True,
                     help="Pull only products changed since the last load"):
            with st.spinner("Scanning inventory for changes..."):
                inv, idid = refresh_inventory_changes(inv)
        if idid is not None:
            save_inventory_cache(inv)
            st.session_state['inv_cache'] = inv
            n_new, n_chg = len(idid.get('new', [])), len(idid.get('changed', []))
            if n_new or n_chg:
                st.success(f"🆕 {n_new} new · ♻️ {n_chg} changed · "
                           f"{idid.get('total', 0)} total")
            else:
                st.success(f"✅ No changes · {idid.get('total', 0)} products")
            st.rerun()

        st.markdown("---")
        st.subheader("🔄 Update CSV index")
        st.caption("For invoice auto-find. Pulls last CSV date → today.")
        if st.button("🚀 PULL & UPDATE CSV", use_container_width=True):
            result = incremental_csv_update()
            if result:
                nf, tot, dscan = result
                load_csv_index.clear()      # show the fresh rows immediately,
                get_csv_last_date.clear()   # not after the 5-min ttl runs out
                st.session_state['update_time'] = datetime.now().strftime('%H:%M:%S')
                st.session_state['update_result'] = f"{nf} new, {tot} total, {dscan} days"
                st.rerun()
        if 'update_time' in st.session_state:
            st.caption(f"Updated {st.session_state['update_time']} — "
                       + st.session_state.get('update_result', ''))

        st.markdown("---")
        st.info("📌 ✅ PERFECT · ⚠️ STRUCTURE · ❌ MISMATCH")


# ============================================================
# LEFT PANEL — Apex Invoice
# ============================================================

# ============================================================
# PUSH TO APEX  (Update Invoice)  — instrumented so every call is visible
# ============================================================

def _redact(h):
    return {k: ('Bearer ***' if k == 'Authorization' else v) for k, v in h.items()}


def _short(txt, n=700):
    s = txt if isinstance(txt, str) else str(txt)
    return s[:n] + ('…' if len(s) > n else '')


def _bapi_headers(session):
    """Header set for a b-api request, built from the logged-in browser session."""
    return {
        "accept": "application/json",
        "content-type": "application/json",
        "cookie": session.get("cookie", "").strip(),
        "x-xsrf-token": session.get("xsrf", "").strip(),
        "current-company-id": str(session.get("company_id", DEFAULT_COMPANY_ID)).strip(),
        "x-requested-with": "XMLHttpRequest",
        "origin": APP_ORIGIN,
        "referer": f"{APP_ORIGIN}/orders/shipping",
        "user-agent": _BROWSER_UA,
    }


def _session_ready(session):
    return bool(session and session.get("cookie") and session.get("xsrf"))


_BROWSER_LOADERS = ("chrome", "edge", "brave", "firefox", "chromium", "opera")


def load_session_from_browser(preferred=None, domain="apextrading.com"):
    """Read the logged-in Apex session straight out of the local browser cookie
    store (Chrome/Edge/Brave/Firefox/...), so nothing has to be pasted. Needs
    browser_cookie3 (lazy import). Returns (session_dict | None, message)."""
    try:
        import browser_cookie3 as bc
    except Exception:
        return None, ("browser_cookie3 isn't installed. Run:  "
                      "pip install browser_cookie3 --break-system-packages")
    from urllib.parse import unquote
    order = []
    if preferred:
        order.append(preferred.lower())
    order += [b for b in _BROWSER_LOADERS if b not in order]
    tried = []
    for name in order:
        loader = getattr(bc, name, None)
        if loader is None:
            continue
        try:
            jar = loader(domain_name=domain)
        except Exception as e:
            tried.append(f"{name}: {type(e).__name__}")
            continue
        cookies = [c for c in jar if domain in (c.domain or "")]
        if not cookies:
            tried.append(f"{name}: no {domain} cookies")
            continue
        cookie_header = "; ".join(f"{c.name}={c.value}" for c in cookies)
        xsrf_raw = next((c.value for c in cookies if c.name == "XSRF-TOKEN"), None)
        if not xsrf_raw:
            tried.append(f"{name}: cookies found but no XSRF-TOKEN")
            continue
        return ({"cookie": cookie_header, "xsrf": unquote(xsrf_raw), "source": name},
                f"Loaded {len(cookies)} cookies from {name}.")
    detail = "; ".join(tried) if tried else "no supported browser found"
    return None, (f"Couldn't read an Apex session from any browser ({detail}). "
                  "Make sure you're logged into app.apextrading.com, then retry — "
                  "or paste manually.")


def load_firefox_cookies_direct(domain="apextrading.com"):
    """Read Apex cookies straight out of Firefox's cookies.sqlite (finds the
    profile itself; browser_cookie3's Firefox detection is brittle). stdlib only.
    Returns (session_dict | None, message)."""
    import os, glob, shutil, sqlite3, tempfile
    from urllib.parse import unquote
    roots = [os.path.expandvars(r"%APPDATA%\Mozilla\Firefox"),
             os.path.expandvars(r"%LOCALAPPDATA%\Mozilla\Firefox")]
    pkgs = os.path.expandvars(r"%LOCALAPPDATA%\Packages")
    if os.path.isdir(pkgs):
        for d in glob.glob(os.path.join(pkgs, "Mozilla.Firefox*")):
            roots.append(os.path.join(d, "LocalCache", "Roaming", "Mozilla", "Firefox"))
    db_paths = []
    for r in roots:
        prof = os.path.join(r, "Profiles")
        if os.path.isdir(prof):
            db_paths += glob.glob(os.path.join(prof, "*", "cookies.sqlite"))
    seen = set()
    db_paths = [p for p in db_paths if not (p in seen or seen.add(p))]
    if not db_paths:
        return None, ("No Firefox cookies.sqlite found. Open Firefox and log into "
                      "app.apextrading.com at least once, then retry.")
    tried = []
    for db in db_paths:
        prof_name = os.path.basename(os.path.dirname(db))
        tmp = None
        try:
            tmp = tempfile.mkdtemp(prefix="ffck_")
            for suffix in ("", "-wal", "-shm"):
                src = db + suffix
                if os.path.exists(src):
                    shutil.copy2(src, os.path.join(tmp, "cookies.sqlite" + suffix))
            con = sqlite3.connect(os.path.join(tmp, "cookies.sqlite"))
            rows = con.execute(
                "SELECT name, value, host FROM moz_cookies WHERE host LIKE ?",
                ("%" + domain + "%",)).fetchall()
            con.close()
        except Exception as e:
            tried.append(f"{prof_name}: {type(e).__name__}")
            continue
        finally:
            if tmp:
                shutil.rmtree(tmp, ignore_errors=True)
        if not rows:
            tried.append(f"{prof_name}: no {domain} cookies")
            continue
        cookie_header = "; ".join(f"{n}={v}" for n, v, _ in rows)
        xsrf_raw = next((v for n, v, _ in rows if n == "XSRF-TOKEN"), None)
        if not xsrf_raw:
            tried.append(f"{prof_name}: Apex cookies but no XSRF-TOKEN")
            continue
        return ({"cookie": cookie_header, "xsrf": unquote(xsrf_raw),
                 "source": f"firefox:{prof_name}"},
                f"Loaded {len(rows)} Apex cookies from Firefox profile '{prof_name}'.")
    return None, ("Found Firefox profile(s) but no logged-in Apex session "
                  f"({'; '.join(tried)}). Log into app.apextrading.com in Firefox, "
                  "reload, then Grab again.")


def _find_firefox_exe():
    """Locate firefox.exe across the usual Windows install paths (and PATH)."""
    import os, shutil
    candidates = [r"C:\Program Files\Mozilla Firefox\firefox.exe",
                  r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe"]
    for p in candidates:
        if p and os.path.isfile(p):
            return p
    for name in ("firefox", "firefox.exe"):
        found = shutil.which(name)
        if found:
            return found
    return None


def launch_firefox(url=APEX_URL):
    """Open Apex in Firefox so the session is fresh and its cookies are written to
    disk (Firefox cookies aren't App-Bound-Encrypted, so we read them after)."""
    import subprocess
    ff = _find_firefox_exe()
    if not ff:
        return False, ("Couldn't find firefox.exe. Install Firefox, or paste the "
                       "session manually.")
    try:
        subprocess.Popen([ff, "-new-tab", url], close_fds=True)
        return True, "Opened Apex in Firefox. Log in if needed, then Grab from Firefox."
    except Exception as e:
        return False, f"Failed to launch Firefox ({type(e).__name__}: {e})."


def firefox_session_all_in_one(company_id, timeout_s=90, every=3):
    """One click: open Apex in Firefox, then poll its cookies until a logged-in
    session appears, grab it, and test it — looping until valid or timeout. Updates
    a live status line throughout. Returns (session_dict | None, authed_bool, msg)."""
    import time as _t
    box = st.empty()
    launched_ok, launch_msg = launch_firefox()
    box.info(("🦊 " + launch_msg) if launched_ok
             else ("⚠️ " + launch_msg + "  Trying any existing Firefox profile…"))
    deadline = _t.time() + timeout_s
    last_sess, last_msg = None, launch_msg
    while _t.time() < deadline:
        s, msg = load_firefox_cookies_direct()
        if s:
            s['company_id'] = company_id
            sm = _session_summary(s)
            if sm['has_session_cookie'] and sm['session_cookie_len'] > 20:
                box.info(f"🦊 Grabbed {sm['cookies']} cookies — testing…")
                authed, code, tmsg = bapi_test_session(s)
                if authed:
                    box.success(f"✅ Session ready — [{code}] {tmsg}")
                    return s, True, f"[{code}] {tmsg}"
                last_sess, last_msg = s, f"[{code}] {tmsg}"
                box.warning(f"🦊 Not valid yet [{code}] — finish logging into Apex "
                            "in Firefox; retrying…")
            else:
                last_sess, last_msg = s, "cookies present but not logged in yet"
                box.info("🦊 Firefox cookies found but not logged into Apex yet — "
                         "log in; retrying…")
        else:
            last_msg = msg
            box.info(f"🦊 Waiting for Firefox cookies… {msg.split('.')[0]}")
        remaining = int(deadline - _t.time())
        if remaining <= 0:
            break
        _t.sleep(min(every, max(1, remaining)))
    box.error("⏱️ Timed out waiting for a valid Firefox session. Make sure you're "
              "logged into app.apextrading.com in Firefox, then click the fox again.")
    return last_sess, False, last_msg


def _session_summary(session):
    """Human-readable check of what's actually in the loaded session — used to spot
    an empty/undecryptable session cookie (the usual cause of 401)."""
    ck = session.get('cookie', '') or ''
    parts = [p.strip() for p in ck.split(';') if '=' in p]
    names = [p.split('=', 1)[0].strip() for p in parts]
    sess_len = next((len(p.split('=', 1)[1]) for p in parts
                     if p.startswith('apex_trading_session=')), 0)
    return {
        'source': session.get('source', '?'),
        'cookies': len(names),
        'has_session_cookie': 'apex_trading_session' in names,
        'session_cookie_len': sess_len,
        'has_xsrf_cookie': 'XSRF-TOKEN' in names,
        'xsrf_header_len': len(session.get('xsrf', '') or ''),
    }


def bapi_test_session(session):
    """Auth check. Laravel returns 401 'Unauthenticated' ONLY when the session
    cookie is rejected; 404/422/500 mean the request got PAST auth — i.e. the
    session is valid and the endpoint just isn't a clean probe. But HTTP 444 /
    'Browser Server Sync Error. Refresh Needed' is Apex saying the session is
    OUT OF SYNC and every b-api read will come back empty (seen 2026-08-06:
    'Session valid ✓' while split found zero line items) — that is NOT valid.
    Returns (authed_bool, status, message)."""
    headers = _bapi_headers(session)
    tries = [(f"{BAPI_BASE}/inventory", {"page": 1}),
             (f"{BAPI_BASE}/inventory/paginated", {"page": 1, "per_page": 15})]
    last = None
    for url, params in tries:
        try:
            r = _HTTP.get(url, headers=headers, params=params, timeout=30)
        except Exception as e:
            last = ("ERR", str(e))
            continue
        if r.status_code == 200:
            return True, 200, "b-api returned 200 — session valid."
        if r.status_code in (401, 419):
            return False, r.status_code, "cookie rejected — re-grab from Firefox or paste fresh."
        if r.status_code == 444 or 'refresh needed' in r.text.lower():
            return False, r.status_code, (
                "Apex says 'Browser Server Sync Error. Refresh Needed' — the "
                "session is stale. Refresh app.apextrading.com in Firefox "
                "(log in if asked), then re-grab.")
        last = (r.status_code, _short(r.text, 160))
    code = last[0] if last else "?"
    return True, code, (f"reached the app (HTTP {code}) past auth — session is VALID; "
                        "that endpoint just isn't a clean check. Try the PATCH.")


BAPI_INVENTORY_CACHE = "bapi_inventory.json"


def load_bapi_inventory():
    if os.path.exists(BAPI_INVENTORY_CACHE):
        try:
            with open(BAPI_INVENTORY_CACHE) as f:
                c = json.load(f)
            c.setdefault('rows', [])
            return c
        except Exception:
            pass
    return {'pulled_at': None, 'rows': []}


def save_bapi_inventory(cache):
    try:
        with open(BAPI_INVENTORY_CACHE, 'w') as f:
            json.dump(cache, f, default=str)
    except Exception as e:
        st.warning(f"Could not write {BAPI_INVENTORY_CACHE}: {e}")


def _flat_batch(b, prod):
    prod = prod or {}
    price = b.get('listing_price')
    try:
        price = float(price) / 100.0 if price not in (None, '') else None  # cents -> $
    except Exception:
        price = None
    brand = prod.get('brand') or b.get('brand')
    brand = brand.get('name') if isinstance(brand, dict) else brand
    return {
        'batch_id': b.get('id'),
        'product_id': b.get('product_id') or prod.get('id'),
        'product_name': prod.get('name') or b.get('product_name') or b.get('name'),
        'batch_name': b.get('name') or b.get('batch_name'),
        'brand': brand,
        'qty': b.get('quantity'),
        'price': price,
        'status': 'Archived' if b.get('archived') else 'Active',
    }


def _collect_batches(obj, out, parent=None, _depth=0):
    """Find every batch-shaped dict ANYWHERE in a b-api inventory payload, keeping
    the nearest enclosing product as context (for name/brand). A batch = a dict with
    an id plus product_id / metrc_packages_count / disable_inventory_tracking. This
    is shape-agnostic (matches how metrc_tagging reads the same grid)."""
    if _depth > 11:
        return
    if isinstance(obj, dict):
        is_batch = ("id" in obj and ("product_id" in obj
                    or "metrc_packages_count" in obj
                    or "disable_inventory_tracking" in obj))
        is_product = ("id" in obj and "product_id" not in obj
                      and ("batches" in obj or "product_category" in obj
                           or "product_category_id" in obj))
        if is_batch:
            out.append((obj, parent))
        nxt = obj if is_product else parent
        for v in obj.values():
            _collect_batches(v, out, nxt, _depth + 1)
    elif isinstance(obj, list):
        for v in obj:
            _collect_batches(v, out, parent, _depth + 1)


def bapi_fetch_inventory(session, max_pages=80, show_progress=True):
    """Pull the b-api batch-level inventory (the grid the web app shows) and flatten
    to one row per batch with the real batch_id + product_id. Uses the shape-agnostic
    walk so it works no matter how the endpoint nests batches."""
    headers = dict(_bapi_headers(session))
    headers["referer"] = f"{APP_ORIGIN}/inventory"   # inventory route checks referer
    rows = []
    last_status = None
    progress = st.progress(0.0, text="Pulling batch inventory...") if show_progress else None
    _PAG = f"{BAPI_BASE}/inventory/paginated"
    # per_page=100 leads: if the server honors it, ~7 calls replace the ~61
    # that 15/page needed. The proven metrc_tagging variants follow as the
    # fallback — a variant that yields 0 batch-shaped rows falls through
    # exactly as before. Page 1 is fetched alone to learn last_page; pages
    # 2..N then fetch 6 at a time (rows are appended only on this thread).
    variants = [
        (_PAG, {"per_page": 100}),                        # big pages (fewest calls)
        (_PAG, {}),                                       # plain   ?page=N
        (_PAG, {"per_page": 15}),                         # 15/page (the proven size)
        (_PAG, {"per_page": 15, "sort_by": "name", "sort_dir": "asc",
                "search": "", "archived": 0}),
        (f"{BAPI_BASE}/inventory", {}),                   # base list
    ]
    from concurrent.futures import ThreadPoolExecutor as _TPE
    for base_url, extra in variants:
        def _page_json(page, _u=base_url, _x=extra):
            params = dict(_x); params['page'] = page
            try:
                r = _HTTP.get(_u, headers=headers, params=params, timeout=40)
            except Exception:
                return None, None
            if r.status_code != 200:
                return r.status_code, None
            try:
                return 200, r.json()
            except Exception:
                return 200, None

        got = 0
        status, j = _page_json(1)
        if status is not None:
            last_status = status
        if status != 200 or j is None:
            continue
        last_page = (j.get('last_page') if isinstance(j, dict) else None) or 1
        pages_json = [j]
        remaining = list(range(2, min(last_page, max_pages) + 1))
        if remaining:
            with _TPE(max_workers=6) as _ex:
                for st_, pj in _ex.map(_page_json, remaining):
                    if st_ is not None:
                        last_status = st_
                    if st_ == 200 and pj is not None:
                        pages_json.append(pj)
        for pj in pages_json:
            found = []
            _collect_batches(pj, found)
            for bd, prod in found:
                rows.append(_flat_batch(bd, prod))
                got += 1
        if progress:
            progress.progress(1.0,
                              text=f"Pulling batch inventory... ({len(rows)} batches)")
        if got:
            break  # this endpoint/shape worked
    if progress:
        progress.empty()
    seen, uniq = set(), []
    for r in rows:
        bid = r.get('batch_id')
        if bid in seen:
            continue
        seen.add(bid); uniq.append(r)
    if uniq:
        return uniq, f"Pulled {len(uniq)} batches."
    return uniq, (f"0 batches (last HTTP {last_status}). The endpoint returned no "
                  "batch-shaped records — paste the inventory grid's network call "
                  "(URL + params) and I'll lock it.")


def bapi_update_batch_quantity(session, batch_id, qty, step=None):
    """Set ONE batch's on-hand quantity through the browser session — the top-up
    that keeps add-item working while the bearer API is 429-capped. Uses the
    PROVEN calls from the metrc_tagging tool (locked in from DevTools):
      1) read the raw batch dict by paging the b-api inventory list,
      2) read its linked METRC packages (POST /b-api/metrc/batch/packages) —
         the /full/ PATCH REPLACES the package list, so they must be resent,
      3) PATCH /b-api/batches/single/full/{id} with everything unchanged
         except quantity.
    Never writes without a successful read (a /full/ replace from a guessed
    body could blank fields). Returns (ok, msg)."""
    headers = dict(_bapi_headers(session))
    headers["referer"] = f"{APP_ORIGIN}/inventory"
    try:
        qty = int(qty)
    except (TypeError, ValueError):
        return False, f"bad quantity {qty!r}"

    # 1) READ the raw batch dict from the inventory list (same variant order
    #    bapi_fetch_inventory / metrc_tagging use).
    batch_obj = None
    for base_url, extra in ((f"{BAPI_BASE}/inventory", {}),
                            (f"{BAPI_BASE}/inventory/paginated", {}),
                            (f"{BAPI_BASE}/inventory/paginated", {"per_page": 15})):
        page, last_page = 1, None
        while page <= 80:
            params = dict(extra)
            params["page"] = page
            try:
                r = _HTTP.get(base_url, headers=headers, params=params,
                                 timeout=30)
            except Exception:
                break
            if r.status_code != 200:
                break
            try:
                j = r.json()
            except Exception:
                break
            if last_page is None:
                last_page = (j.get("last_page")
                             if isinstance(j, dict) else None) or 1
            found = []
            _collect_batches(j, found)
            batch_obj = next((bd for bd, _p in found
                              if str(bd.get("id")) == str(batch_id)), None)
            if batch_obj is not None or page >= (last_page or 1):
                break
            page += 1
        if batch_obj is not None:
            break
    if batch_obj is None:
        # bearer fallback — capped right now, works once the limit resets
        ok, msg, _raw = update_batch(batch_id, {'quantity': qty})
        if ok:
            return True, f"bearer {msg}"
        return False, ("couldn't read the batch from the b-api inventory list "
                       f"(and bearer fallback: {msg})")

    # 2) Its linked METRC packages — must be resent or the write unlinks them.
    minimal, pkg_read_ok = [], False
    try:
        rp = _HTTP.post(f"{BAPI_BASE}/metrc/batch/packages", headers=headers,
                           json={"batchId": batch_id}, timeout=30)
        if rp.status_code == 200:
            pkg_read_ok = True
            pj = rp.json() or {}
            for p in (pj.get("packages") if isinstance(pj, dict) else pj) or []:
                if isinstance(p, dict):
                    minimal.append({
                        "id": p.get("id"),
                        "Label": p.get("Label", ""),
                        "ProductName": p.get("ProductName", ""),
                        "Quantity": p.get("Quantity"),
                        "UnitOfMeasureAbbreviation":
                            p.get("UnitOfMeasureAbbreviation", ""),
                    })
    except Exception:
        pass
    try:
        tagged = int(batch_obj.get("metrc_packages_count") or 0) > 0
    except (TypeError, ValueError):
        tagged = False
    if tagged and not (pkg_read_ok and minimal):
        return False, ("batch has METRC package(s) linked but they couldn't be "
                       "read back — NOT writing (a /full/ PATCH without them "
                       "would unlink the tags)")

    # 3) WRITE it back unchanged except quantity.
    before = batch_obj.get("quantity")
    batch_obj = dict(batch_obj)
    batch_obj["quantity"] = qty
    body = {"batch": batch_obj, "terpenes": [], "cannabinoids": [],
            "documents": [], "metrcPackages": minimal, "batchMetrcLabTests": []}
    url = f"{BAPI_BASE}/batches/single/full/{batch_id}"
    try:
        r = _HTTP.patch(url, headers=headers, json=body, timeout=45)
    except Exception as e:
        return False, f"PATCH failed: {e}"
    if step:
        step(step="TOP-UP", method="PATCH", url=url,
             request={"batch": {"id": batch_id, "quantity": qty,
                                "…": "full batch dict resent unchanged"},
                      "metrcPackages": minimal},
             status=r.status_code, response=_short(r.text, 300))
    if r.status_code in (200, 201):
        return True, f"quantity {before!r} → {qty}"
    ok, msg, _raw = update_batch(batch_id, {'quantity': qty})
    if ok:
        return True, f"bearer {msg}"
    return False, (f"b-api /full/ HTTP {r.status_code}: {_short(r.text, 120)}; "
                   f"bearer {msg}")


def bapi_bulk_fetch_invoices(session, order_ids, log=None):
    """Fetch one or more full invoices/orders by their integer order id via the exact
    call the Apex UI fires on the Orders page:
        POST /b-api/shipping-orders/bulk-fetch-invoices
        body: {"order_ids": [796218, ...]}
    Confirmed from DevTools (200 OK). Returns a LIST of full order dicts — the rich
    payload (items[] with original_batch.metrc_packages[], buyer, seller_company,
    deal_flow, task_checklist, …), i.e. the same shape as a single bapi_get_order but
    for many ids at once and keyed by numeric id rather than uuid.
    """
    # Accept a single id or a list; coerce everything to plain ints.
    if isinstance(order_ids, (str, int)):
        order_ids = [order_ids]
    ids = []
    for oid in (order_ids or []):
        try:
            ids.append(int(oid))
        except (TypeError, ValueError):
            continue
    if not ids:
        return []

    url = f"{BAPI_BASE}/shipping-orders/bulk-fetch-invoices"
    body = {"order_ids": ids}
    try:
        r = _HTTP.post(url, headers=_bapi_headers(session), json=body, timeout=45)
    except Exception as e:
        if log is not None:
            log.append({'step': 'bulk-fetch-invoices', 'method': 'POST', 'url': url,
                        'request': body, 'status': 'ERR', 'response': str(e)})
        return []

    orders = []
    try:
        j = r.json()
        if isinstance(j, list):
            orders = j
        elif isinstance(j, dict):
            # tolerate {"data":[…]} / {"orders":[…]} wrappers, or a bare order dict
            orders = (j.get('data') or j.get('orders')
                      or ([j] if j.get('id') else []))
    except Exception:
        orders = []

    if log is not None:
        log.append({'step': 'bulk-fetch-invoices', 'method': 'POST', 'url': url,
                    'request': body, 'status': r.status_code,
                    'response': _short(r.text, 160),
                    'note': (f"got {len(orders)} order(s)"
                             if r.status_code == 200 else 'non-200')})
    return orders if r.status_code == 200 else []


def bapi_fetch_invoice(session, order_id, log=None):
    """Convenience single-order wrapper around bapi_bulk_fetch_invoices.
    Returns the order dict matching order_id (or the first returned), else {}."""
    orders = bapi_bulk_fetch_invoices(session, [order_id], log=log)
    if not orders:
        return {}
    try:
        oid = int(order_id)
        for o in orders:
            if int(o.get('id', -1)) == oid:
                return o
    except (TypeError, ValueError):
        pass
    return orders[0]


def bapi_get_order(session, order_uuid, log=None):
    """Read the full order from b-api (same surface we write to) — authoritative for
    buyer.uuid, items, and unit ids. Returns the order dict or {}."""
    if not order_uuid:
        return {}
    for u in (f"{BAPI_BASE}/shipping-orders/{order_uuid}",
              f"{BAPI_BASE}/orders/{order_uuid}"):
        try:
            r = _HTTP.get(u, headers=_bapi_headers(session), timeout=30)
        except Exception as e:
            if log is not None:
                log.append({'step': 'GET order (b-api)', 'method': 'GET', 'url': u,
                            'status': 'ERR', 'response': str(e)})
            continue
        order = {}
        try:
            j = r.json()
            order = (j.get('order') if isinstance(j, dict) and 'order' in j else j) or {}
        except Exception:
            order = {}
        if log is not None:
            buuid = (order.get('buyer') or {}).get('uuid')
            log.append({'step': 'GET order (b-api)', 'method': 'GET', 'url': u,
                        'status': r.status_code, 'response': _short(r.text, 160),
                        'note': (f"buyerUuid={buuid} · items={len(order.get('items') or [])}"
                                 if r.status_code == 200 else "non-200")})
        if r.status_code == 200 and order:
            return order
    return {}


def _order_items_index(order):
    """Index a b-api order GET so a staged/removed line can be matched to its real
    orderItemId + current order_quantity. Keyed by (product_id, batch_id) first,
    then product_id as a looser fallback."""
    idx = {}
    for it in (order.get('items') or []):
        oiid = it.get('id')
        if oiid is None:
            continue
        pid, bid = str(it.get('product_id')), str(it.get('batch_id'))
        idx[('pb', pid, bid)] = it
        idx.setdefault(('p', pid), it)
    return idx


def _resolve_order_item(order_idx, product_id, batch_id):
    """Return (orderItemId, current_order_quantity) for a line, or (None, None)."""
    it = (order_idx.get(('pb', str(product_id), str(batch_id)))
          or order_idx.get(('p', str(product_id))))
    if not it:
        return None, None
    return it.get('id'), int(it.get('order_quantity') or 0)


def bapi_modify_quantity(session, order_id, order_item_id, new_quantity,
                         current_quantity, buyer_uuid, *, handle="inventory",
                         live=False, log=None):
    """Change or remove an EXISTING order line via the exact call the Apex UI fires:
        PATCH /b-api/shipping-orders/modify-quantity/{orderId}/{orderItemId}
    Confirmed from DevTools (200 OK). handle="inventory" adjusts and returns stock;
    handle="trash" writes the units off. Apex quirks, replicated exactly:
      • nonzero newQuantity is a STRING ("477"); a zero newQuantity is the NUMBER 0
      • quantityChange is always a STRING signed delta (new - current), e.g. "-477"
    """
    new_q = int(new_quantity)
    delta = new_q - int(current_quantity or 0)
    url = f"{BAPI_BASE}/shipping-orders/modify-quantity/{order_id}/{order_item_id}"
    body = {
        "orderId": int(order_id),
        "orderItemId": int(order_item_id),
        "newQuantity": (0 if new_q == 0 else str(new_q)),
        "handleAdjustment": handle,
        "buyerUuid": buyer_uuid,
        "quantityChange": str(delta),
    }
    if not live:
        if log is not None:
            log.append({'step': 'MODIFY-QTY preview', 'method': 'PATCH', 'url': url,
                        'request': body, 'note': 'dry run — not sent'})
        return None, body
    try:
        r = _HTTP.patch(url, headers=_bapi_headers(session), json=body, timeout=45)
        if log is not None:
            log.append({'step': 'MODIFY-QTY', 'method': 'PATCH', 'url': url,
                        'request': body, 'status': r.status_code,
                        'response': _short(r.text),
                        'note': ('✅ ok' if r.status_code in (200, 201)
                                 else 'non-2xx — paste the response if unexpected')})
        return r, body
    except Exception as e:
        if log is not None:
            log.append({'step': 'MODIFY-QTY', 'method': 'PATCH', 'url': url,
                        'request': body, 'status': 'ERR', 'response': str(e)})
        return None, body


def push_invoice_changes(live=False):
    """Push ADDED lines to the REAL order via the b-api endpoint the web app uses:
    PATCH /b-api/shipping-orders/add-item/{order_id}, authenticated by the browser
    session (cookie + x-xsrf-token), NOT the bearer token. Every call is logged;
    writes happen only when live=True. The exact add-item payload still needs to be
    confirmed from DevTools — until then the body is a best guess and the response
    will tell us the real field names."""
    log = []
    def step(**kw):
        log.append(kw)

    oid = st.session_state.get('apex_order_id')
    items = st.session_state.get('invoice_items', [])
    added = [it for it in items if it.get('_added')]
    removed = st.session_state.get('removed_items', []) or []
    session = st.session_state.get('bapi_session') or {}
    step(step="Plan", note=(f"order_id={oid} · {len(added)} to add · {len(removed)} removed · "
                            f"session={'loaded' if _session_ready(session) else 'MISSING'} · "
                            f"mode={'LIVE WRITE' if live else 'dry run (no writes)'}"))
    if not oid:
        step(step="ABORT", note="No Apex order id in session — load an invoice first.")
        return log
    if not _session_ready(session):
        step(step="NO SESSION",
             note="No browser session loaded. In the sidebar, click '🦊 Grab Apex session "
                  "from browser' (or paste cookie + x-xsrf-token). b-api edits the real "
                  "order and needs your logged-in session, not the API token.")
        return log

    # Read the order from b-api — authoritative for buyerUuid + unit ids + item list
    order_uuid = (st.session_state.get('apex_order_raw') or {}).get('uuid')
    order = bapi_get_order(session, order_uuid, log)
    if not order:  # fall back to the public API just for unit ids / count
        try:
            r = _HTTP.get(f"{APEX_BASE_URL}/{oid}", headers=apex_headers, timeout=30)
            order = (r.json().get('order') if r.status_code == 200 else {}) or {}
        except Exception:
            order = {}
    buyer_uuid = (order.get('buyer') or {}).get('uuid')
    umap = {}
    for it in (order.get('items') or []):
        oum = it.get('order_unit_measurement') or {}
        nm = (oum.get('name') or '').strip().lower()
        uid = oum.get('id') or it.get('order_unit_measurement_id')
        if nm and uid and nm not in umap:
            umap[nm] = uid
    units_str = ", ".join(f"{k}={v}" for k, v in umap.items()) or "none"
    pre_count = len(order.get('items') or [])
    default_umid = next(iter(umap.values()), None)
    step(step="Resolve", note=(f"buyerUuid={buyer_uuid} · unit ids: {units_str} · "
                               f"order has {pre_count} item(s)"))
    if not buyer_uuid:
        step(step="ABORT", note="Couldn't read the buyer UUID from the order; the add-item "
             "payload requires buyerUuid. The b-api order read failed — check the log above.")
        return log

    # Index the cached catalog by product_id so each add uses ITS OWN valid unit.
    # (Forcing the order's Case id onto a Unit-only product is what 500s add-item.)
    inv_by_id = {}
    for p in ((st.session_state.get('inv_cache') or {}).get('products') or []):
        if p.get('id') is not None:
            inv_by_id[str(p['id'])] = p
    case_id = umap.get('case') or 21          # Case measurement id (confirmed 21)
    GLOBAL_UNIT = {"unit": 14, "units": 14, "each": 14, "case": 21, "cases": 21}
    order_idx = _order_items_index(order)     # for resolving removals -> orderItemId

    url = f"{BAPI_BASE}/shipping-orders/add-item/{oid}"
    for it in added:
        nm = it.get('product_name', '')
        uname = ((it.get('order_unit_measurement') or {}).get('name') or '').strip().lower()
        prod = inv_by_id.get(str(it.get('product_id'))) or {}
        prod_unit_id = ((prod.get('unit_measurement') or {}).get('id')
                        or prod.get('product_unit_measurement_id'))
        if uname.startswith('case'):
            umid = case_id
        else:  # unit / units / each / blank -> the product's own base unit
            umid = prod_unit_id or umap.get('unit') or GLOBAL_UNIT.get(uname or 'unit') or 14
        qty = it.get('order_quantity', 1)
        step(step="Unit", note=(f"{nm}: '{uname or '?'}' -> order_unit_measurement_id "
                                f"{umid} (product base unit {prod_unit_id})"))
        cart_item = {"product_id": it.get('product_id'),
                     "quantity": qty,
                     "order_unit_measurement_id": umid,
                     "sample": False}
        if it.get('batch_id'):
            cart_item["batch_id"] = it['batch_id']
        # EXACT payload shape the Apex UI sends to add-item
        body = {"buyerUuid": buyer_uuid, "cartItems": [cart_item], "orderId": oid}

        if not live:
            step(step="ADD preview", method="PATCH", url=url, request=body,
                 note=f"{nm}: dry run — not sent. This matches the real UI payload "
                      "(buyerUuid + cartItems + orderId). Flip live-write on to send it.")
            continue
        try:
            rj = {}
            for attempt in (1, 2):
                r = _HTTP.patch(url, headers=_bapi_headers(session), json=body,
                                   timeout=45)
                try:
                    rj = r.json() or {}
                except Exception:
                    rj = {}
                if not (attempt == 1 and r.status_code in (200, 201)
                        and rj.get('status') == 'InsufficientQuantity'
                        and it.get('batch_id')):
                    break
                # Apex refused the pull — the batch is short/empty on their side.
                # Top it up to exactly the units this line needs (b-api first —
                # the bearer PATCH is 429-capped), then retry the add ONCE.
                try:
                    upc_i = int(it.get('units_per_case') or 0) or 1
                except (TypeError, ValueError):
                    upc_i = 1
                try:
                    need_units = int(float(qty)) * (upc_i if uname.startswith('case')
                                                    else 1)
                except (TypeError, ValueError):
                    need_units = upc_i
                ok_t, tmsg = bapi_update_batch_quantity(session, it['batch_id'],
                                                        need_units, step=step)
                step(step="TOP-UP",
                     note=(f"{'✅' if ok_t else '❌'} batch {it['batch_id']} "
                           f"quantity → {need_units}u ({tmsg})"
                           + (" — retrying the add" if ok_t else
                              " — no working write path; bump the batch quantity "
                              "in the Apex inventory UI, then click ➕ again")))
                if not ok_t:
                    break
            post_count = None
            try:
                ro = rj.get('order') or {}
                if isinstance(ro.get('items'), list):
                    post_count = len(ro['items'])
            except Exception:
                post_count = None
            # Apex often returns a trimmed body (no items[]) on these b-api writes,
            # so don't trust an absent count — re-read the order to verify for real.
            post_items = ro.get('items') if isinstance(ro.get('items'), list) else None
            if post_count is None and r.status_code in (200, 201):
                reread = bapi_get_order(session, order_uuid, log) or {}
                if isinstance(reread.get('items'), list):
                    post_count = len(reread['items'])
                    post_items = reread['items']
            # Once the line is on the server it has a real order_item id. Stamp it back
            # onto the local line and clear _added, so a later removal can target it
            # (and it no longer looks like an un-pushed staged add).
            if r.status_code in (200, 201) and post_items:
                match = next((x for x in post_items
                              if str(x.get('product_id')) == str(it.get('product_id'))
                              and str(x.get('batch_id')) == str(it.get('batch_id'))), None)
                if match and match.get('id'):
                    it['id'] = match['id']
                    it['order_quantity'] = match.get('order_quantity', it.get('order_quantity'))
                    it['_added'] = False
            if r.status_code in (200, 201):
                if post_count is not None and post_count > pre_count:
                    note = f"✅ ADDED — order items {pre_count} → {post_count}"
                    pre_count = post_count
                elif post_count is not None:
                    if rj.get('status') == 'InsufficientQuantity':
                        note = ("❌ Apex refused: InsufficientQuantity — the batch "
                                "doesn't have the units this line needs and the "
                                "automatic top-up didn't take (see TOP-UP above). "
                                "Bump the batch quantity in the Apex inventory UI, "
                                "then click ➕ again.")
                    else:
                        note = (f"⚠️ HTTP 200 but item count stayed at {post_count}. "
                                "Apex accepted the request but didn't append — my body "
                                "is missing a field the UI sends. Paste the DevTools "
                                "add-item Payload (the ~182-byte JSON) and I'll match "
                                "it exactly.")
                else:
                    note = ("HTTP 200 but no items[] in the response to verify against — "
                            "refresh the order in Apex to confirm.")
            elif r.status_code in (401, 419):
                note = ("auth rejected — re-grab from Firefox / paste a fresh session, "
                        "then '🔍 Test session'.")
            elif r.status_code == 500:
                note = ("HTTP 500 — shape is right, a VALUE was rejected. Usually the "
                        "order_unit_measurement_id isn't a valid variant for this product "
                        "(see the Unit step above), or this product needs a batch_id. "
                        "Paste the response if it has more detail.")
            else:
                note = ("non-2xx — the response above should name the issue; "
                        "paste it and I'll fix it.")
            step(step="ADD", method="PATCH", url=url, request=body, status=r.status_code,
                 response=_short(r.text), note=note)
        except Exception as e:
            step(step="ADD", method="PATCH", url=url, request=body, status="ERR",
                 response=str(e))

    # ── Removals ── confirmed b-api endpoint:
    #   PATCH /b-api/shipping-orders/modify-quantity/{orderId}/{orderItemId}
    #   newQuantity 0 · handleAdjustment "trash" (write off) or "inventory" (return stock)
    seen_oiids = set()
    for rm in removed:
        nm = rm.get('product_name', '')
        # Each removal pushes the instant it's confirmed; once it has landed on Apex
        # it's flagged so a later push (triggered by the next add/remove) never tries
        # to remove it a second time.
        if rm.get('pushed'):
            continue
        handle = "inventory" if rm.get('disposition') == 'return' else "trash"
        oiid = rm.get('order_item_id')
        cur = rm.get('order_quantity')
        # The LIVE order read is the source of truth for what's actually removable.
        # A line added earlier this session has _added=True but, once pushed, now lives
        # on the order under a server-assigned id — so always try to resolve it here
        # rather than trusting the stale local flag.
        if oiid is None or cur is None:
            ro_oiid, ro_cur = _resolve_order_item(order_idx, rm.get('product_id'),
                                                  rm.get('batch_id'))
            oiid = oiid or ro_oiid
            cur = cur if cur is not None else ro_cur
        if oiid is None:
            # Genuinely not on the order (e.g. staged then removed before any push).
            step(step="REMOVE skip",
                 note=f"{nm}: not on the live order — nothing to remove.")
            continue
        if oiid in seen_oiids:
            step(step="REMOVE skip",
                 note=f"{nm}: orderItemId {oiid} already handled this run — skipping dup.")
            continue
        seen_oiids.add(oiid)
        r, body = bapi_modify_quantity(session, oid, oiid, 0, cur or 0, buyer_uuid,
                                       handle=handle, live=live, log=log)
        if live and r is not None and r.status_code in (200, 201):
            rm['pushed'] = True
            pre_count = max(0, pre_count - 1)

    return log


def _pending_sync_counts():
    """How many staged changes haven't made it to Apex yet."""
    items = st.session_state.get('invoice_items', []) or []
    removed = st.session_state.get('removed_items', []) or []
    adds = sum(1 for it in items if it.get('_added'))
    rems = sum(1 for rm in removed if not rm.get('pushed'))
    return adds, rems


def render_push_result_and_log(key_sfx=""):
    """No standalone 'Update Invoice' button — adds and removes push to Apex the instant
    you click them. This just surfaces the result of the last push and, only if some
    change didn't land, a one-tap retry so a failed sync is never stranded.
    key_sfx lets this render in more than one panel without duplicate widget keys."""
    adds, rems = _pending_sync_counts()
    if adds or rems:
        bits = []
        if adds:
            bits.append(f"{adds} add(s)")
        if rems:
            bits.append(f"{rems} removal(s)")
        st.warning("\u26a0\ufe0f " + " and ".join(bits) + " not yet on Apex "
                   "(the last push didn't fully land).")
        if st.button("\u27f3 Retry sync to Apex", type="primary",
                     key=f"retry_sync{key_sfx}",
                     use_container_width=True,
                     help="Re-send any add/remove that hasn't reached Apex yet"):
            # Collect the batches this retry could touch BEFORE pushing (pushed flags
            # flip during the push), so afterwards we refresh only those rows.
            touched = [(it.get('product_id'), it.get('batch_id'))
                       for it in (st.session_state.get('invoice_items') or [])
                       if it.get('_added')]
            touched += [(rm.get('product_id'), rm.get('batch_id'))
                        for rm in (st.session_state.get('removed_items') or [])
                        if not rm.get('pushed')]
            with st.spinner("Talking to Apex\u2026"):
                log = push_invoice_changes(live=True)
            st.session_state['apex_push_log'] = log
            _apply_push_verdict(log, verb="Synced")
            _patch_batches_in_view(touched)
            st.session_state['bi_gen'] = st.session_state.get('bi_gen', 0) + 1
            st.rerun()

    # Popup (toast, once) + persistent banner reflecting the last push.
    verdict = st.session_state.get('apex_push_verdict')
    if verdict:
        kind, msg = verdict
        if st.session_state.pop('apex_push_toast', False):
            st.toast(msg, icon={'success': '\u2705', 'error': '\u274c',
                                'info': '\u2139\ufe0f'}.get(kind, '\u2139\ufe0f'))
        {'success': st.success, 'error': st.error, 'info': st.info}[kind](msg)

    log = st.session_state.get('apex_push_log')
    if log:
        n_ok = sum(1 for e in log if str(e.get('status', '')).startswith('2'))
        n_calls = sum(1 for e in log if e.get('method'))
        with st.expander(f"\U0001f50e Apex update log \u2014 {n_ok}/{n_calls} calls OK "
                         f"({len(log)} steps)", expanded=False):
            for e in log:
                head = f"**{e.get('step', '')}**"
                if e.get('method'):
                    head += f"  \u00b7  `{e['method']}`"
                if e.get('status') is not None:
                    head += f"  \u00b7  status `{e['status']}`"
                st.markdown(head)
                if e.get('url'):
                    st.caption(e['url'])
                if e.get('request') is not None:
                    st.code(json.dumps(e['request']), language="json")
                if e.get('response'):
                    st.code(e['response'])
                if e.get('note'):
                    st.caption("\u2192 " + e['note'])
            if st.button("Clear log", key=f"clear_push_log{key_sfx}"):
                st.session_state.pop('apex_push_log', None)
                st.session_state.pop('apex_push_verdict', None)
                st.rerun()



def _ensure_line_uids(items=None):
    """Give every invoice line a stable id so its ❌ button keeps the same widget key
    even after other lines are removed. Index-based keys shift when the list changes,
    which is what made clicks get dropped or land on the wrong row.
    Also SELF-HEALS duplicates (which crash Streamlit with DuplicateElementKey):
    the same dict listed twice (e.g. a double-clicked add/undo) is collapsed to
    one entry, and a distinct line that somehow shares another's uid (a copied
    dict) gets a fresh uid."""
    items = items if items is not None else st.session_state.get('invoice_items', [])
    seen_objs = set()
    seen_uids = set()
    healed = []
    for it in items:
        if id(it) in seen_objs:
            continue                       # same object twice — keep one entry
        seen_objs.add(id(it))
        if not it.get('_uid') or it['_uid'] in seen_uids:
            it['_uid'] = uuid.uuid4().hex
        seen_uids.add(it['_uid'])
        healed.append(it)
    if len(healed) != len(items):
        items[:] = healed                  # fix the session list in place
    return items


def _resolve_remove_indices(sel):
    """Map a uid (or list of uids — or legacy int indices) to CURRENT positions in the
    invoice, resolved fresh at click time so a shifted list can't misfire."""
    items = st.session_state.get('invoice_items', [])
    vals = sel if isinstance(sel, (list, tuple, set)) else [sel]
    idxs = []
    for v in vals:
        if isinstance(v, int):                       # legacy: already an index
            if 0 <= v < len(items):
                idxs.append(v)
        else:                                        # uid
            for i, it in enumerate(items):
                if it.get('_uid') == v:
                    idxs.append(i)
                    break
    return sorted(set(idxs))


def _apply_push_verdict(log, *, verb="Update"):
    """Shared banner/toast verdict for any instant push (add or remove)."""
    attempts = [e for e in log if e.get('step') in ('ADD', 'MODIFY-QTY')]
    aborted = [e for e in log if e.get('step') in ('ABORT', 'NO SESSION')]

    def _ok(e):
        return (str(e.get('status', '')).startswith('2')
                and str(e.get('note', '')).lstrip().startswith("\u2705"))

    ok_n, n = sum(1 for e in attempts if _ok(e)), len(attempts)
    if aborted:
        kind, msg = 'error', ("\u274c " + verb + " failed \u2014 "
                              + (aborted[0].get('note')
                                 or "couldn't reach Apex. See the log below."))
    elif n == 0:
        kind, msg = 'info', "Nothing to sync \u2014 no pending changes."
    elif ok_n == n:
        kind, msg = 'success', (f"\u2705 {verb} \u2014 {ok_n}/{n} change(s) saved to Apex.")
    else:
        kind, msg = 'error', (f"\u274c Partial \u2014 only {ok_n}/{n} change(s) saved. "
                              "See the log below.")
    st.session_state['apex_push_verdict'] = (kind, msg)
    st.session_state['apex_push_toast'] = True


def _finalize_remove(sel, disposition):
    """Pop the chosen line(s) off the invoice, record the disposition, then push the
    removal to Apex IMMEDIATELY (same click) and re-read on-hand so the Batch inventory
    grid reflects it right away. 'return' flows units back to stock
    (handleAdjustment: inventory); 'delete' writes them off (trash). No st.rerun() in
    here on purpose — the natural post-callback rerun refreshes the grid, and an explicit
    rerun is what dropped fast clicks."""
    items = st.session_state.get('invoice_items', [])
    idxs = sorted(_resolve_remove_indices(sel), reverse=True)
    n = 0
    touched = []                              # (product_id, batch_id) of removed lines
    for i in idxs:
        if not (0 <= i < len(items)):
            continue
        it = items.pop(i)
        w, _ = calculate_total_weight(it)
        touched.append((it.get('product_id'), it.get('batch_id')))
        st.session_state.setdefault('removed_items', []).append({
            'product_name': it.get('product_name', ''),
            'batch_name': it.get('batch_name', ''),
            'weight': w or 0,
            'disposition': disposition,   # 'return' | 'delete'
            'order_item_id': it.get('id'),
            'order_quantity': it.get('order_quantity'),
            'product_id': it.get('product_id'),
            'batch_id': it.get('batch_id'),
            'cart_item_id': None,
            'added': bool(it.get('_added')),
            'pushed': False,
            '_orig': dict(it),            # full line so a penalty-box undo restores it
            'ts': datetime.now().strftime('%H:%M:%S'),
        })
        n += 1
    st.session_state['total_invoice_weight'] = sum(
        (calculate_total_weight(x)[0] or 0) for x in items)
    st.session_state.pop('pending_remove', None)
    st.session_state.pop('comparison_df', None)
    st.session_state.pop('_cmp_sig', None)
    if not n:
        return

    # ── Push to Apex right now (same click), exactly like Add does ──
    log = push_invoice_changes(live=True)
    st.session_state['apex_push_log'] = log
    _apply_push_verdict(log, verb=("Returned to inventory" if disposition == 'return'
                                   else "Removed from inventory"))

    # Re-read ONLY the batch(es) this removal touched — a return puts units back, so that
    # row's on-hand must update — instead of recrawling the whole /v2/batches list.
    _patch_batches_in_view(touched)
    st.session_state['bi_gen'] = st.session_state.get('bi_gen', 0) + 1


def _undo_removed(j):
    """Pull a removal back out of its penalty box and onto the invoice. If that removal
    was already pushed to Apex, re-add the line to the order in the same click so the
    undo is real, not just cosmetic."""
    rem = st.session_state.get('removed_items') or []
    if not (0 <= j < len(rem)):
        return
    rec = rem.pop(j)
    orig = rec.get('_orig')
    if orig is None:
        return
    line = dict(orig)
    line['_uid'] = uuid.uuid4().hex
    was_pushed = bool(rec.get('pushed'))
    if was_pushed:
        line['_added'] = True            # must go back onto the Apex order
        line.pop('id', None)             # old order_item id is gone; a fresh add re-issues one
    st.session_state.setdefault('invoice_items', []).append(line)
    st.session_state['total_invoice_weight'] = sum(
        (calculate_total_weight(x)[0] or 0)
        for x in st.session_state.get('invoice_items', []))
    st.session_state.pop('comparison_df', None)
    st.session_state.pop('_cmp_sig', None)

    if was_pushed:
        log = push_invoice_changes(live=True)
        st.session_state['apex_push_log'] = log
        _apply_push_verdict(log, verb="Restored to invoice")
        _patch_batches_in_view([(line.get('product_id'), line.get('batch_id'))])
        st.session_state['bi_gen'] = st.session_state.get('bi_gen', 0) + 1



def push_line_quantity(uid, new_quantity, *, handle="inventory", live=True, log=None):
    """Set ONE invoice line's quantity on the REAL Apex order via the same b-api
    modify-quantity call the Apex UI fires. Resolves the order line by its
    product_id/batch_id from the authoritative b-api order read (the local `id`
    can be stale for a line added this session), then PATCHes the new quantity.
    handle="inventory" flows the delta back to stock; handle="trash" writes the
    removed units off. Returns the log list."""
    log = [] if log is None else log

    def step(**kw):
        log.append(kw)

    oid = st.session_state.get('apex_order_id')
    session = st.session_state.get('bapi_session') or {}
    items = st.session_state.get('invoice_items', [])
    it = next((x for x in items if x.get('_uid') == uid), None)

    step(step="QTY plan",
         note=(f"order_id={oid} · line={'found' if it else 'MISSING'} · "
               f"newQuantity={new_quantity} · handle={handle} · "
               f"session={'loaded' if _session_ready(session) else 'MISSING'} · "
               f"mode={'LIVE WRITE' if live else 'dry run'}"))
    if not oid:
        step(step="ABORT", note="No Apex order id in session — load an invoice first.")
        return log
    if it is None:
        step(step="ABORT", note="Line not found on the invoice (it may have been removed).")
        return log
    if not _session_ready(session):
        step(step="NO SESSION",
             note="No browser session loaded. In the sidebar, click '🦊 Grab Apex session "
                  "from browser' (or paste cookie + x-xsrf-token). b-api edits the real "
                  "order and needs your logged-in session, not the API token.")
        return log

    # Authoritative order read → buyerUuid + the live orderItemId / current qty.
    order_uuid = (st.session_state.get('apex_order_raw') or {}).get('uuid')
    order = bapi_get_order(session, order_uuid, log)
    if not order:
        try:
            r = _HTTP.get(f"{APEX_BASE_URL}/{oid}", headers=apex_headers, timeout=30)
            order = (r.json().get('order') if r.status_code == 200 else {}) or {}
        except Exception:
            order = {}
    buyer_uuid = (order.get('buyer') or {}).get('uuid')
    order_idx = _order_items_index(order)

    # ALWAYS trust the live order for the current qty + item id — the local copy
    # can be stale (e.g. someone touched the order in the Apex UI meanwhile), and
    # a wrong quantityChange delta is exactly what makes Apex reject/no-op the PATCH.
    oiid, cur = _resolve_order_item(order_idx, it.get('product_id'), it.get('batch_id'))
    if oiid is None:
        oiid = it.get('id')
        cur = it.get('order_quantity')
        step(step="Resolve",
             note=(f"line not found on live order read — falling back to the "
                   f"local ids (orderItemId={oiid}, qty={cur})"))
    else:
        step(step="Resolve", note=f"live orderItemId={oiid} · current qty={cur}")
    if oiid is None:
        step(step="ABORT", note=(f"{it.get('product_name','')}: line isn't on the live "
                                 "Apex order — can't set its quantity."))
        return log
    if not buyer_uuid:
        step(step="ABORT", note="Couldn't read the buyer UUID from the order — required "
                                "by modify-quantity. The b-api order read failed above; "
                                "usually a stale session — re-grab it in the sidebar.")
        return log

    # ── Inventory pre-flight for an INCREASE ─────────────────────────────────
    # An increase pulls units from the batch. If the batch's on-hand is short,
    # Apex silently no-ops the modify-quantity — the exact "adds one but never
    # posts" failure. So: read the batch LIVE, and if on-hand < the units this
    # increase needs, top the batch up FIRST (PATCH /v2/batches — confirmed
    # write key 'quantity', absolute on-hand) so the order pull has stock to
    # draw from and leaves the batch back at what it really had.
    delta_q = int(new_quantity) - int(cur or 0)
    if delta_q > 0 and it.get('batch_id') is not None:
        uname = ((it.get('order_unit_measurement') or {}).get('name') or '').strip().lower()
        upc = float(it.get('units_per_case') or 0) or 1
        need_units = delta_q * (upc if uname.startswith('case') else 1)
        fresh = get_batch_fresh(it.get('product_id'), it.get('batch_id'))
        if fresh and fresh.get('disable_inventory_tracking'):
            step(step="Inventory check",
                 note=f"batch tracking disabled (infinite) — no top-up needed for +{delta_q}.")
        else:
            avail = _batch_qty(fresh) if fresh else None
            if avail is None:
                step(step="Inventory check",
                     note=("couldn't read the batch's live on-hand — attempting the qty "
                           "change anyway. If Apex no-ops it, top the batch up in the "
                           "Batch inventory grid and retry."))
            elif avail >= need_units:
                step(step="Inventory check",
                     note=f"on-hand {avail:g}u ≥ needed {need_units:g}u — no top-up needed.")
            else:
                target = int(round(need_units))
                step(step="TOP-UP",
                     note=(f"on-hand {avail:g}u < needed {need_units:g}u — raising batch "
                           f"{it['batch_id']} to {target}u so the order pull can draw "
                           "from it (it lands back at the leftover after the pull)."))
                # b-api write first — the bearer PATCH is 429-capped for the
                # month, and a capped top-up used to abort every increase.
                ok, msg = _top_up_batch(it.get('product_id'), it['batch_id'], target)
                step(step="TOP-UP", status=msg,
                     note=("✅ ok — batch stocked, proceeding to the order pull" if ok
                           else "❌ batch top-up FAILED — aborting so the order change "
                                "can't silently no-op. modify-quantity has no "
                                "short-stock retry, so a no-op here would look like "
                                "success. Fix the batch in the Batch inventory grid, "
                                "then retry."))
                if not ok:
                    step(step="ABORT",
                         note="Top-up failed — order quantity NOT changed.")
                    return log

    r, body = bapi_modify_quantity(session, oid, oiid, int(new_quantity), cur or 0,
                                   buyer_uuid, handle=handle, live=live, log=log)
    if live and r is not None and r.status_code in (200, 201):
        it['id'] = oiid
        it['order_quantity'] = int(new_quantity)
    return log


def _qty_verdict(kind, msg):
    st.session_state['apex_push_verdict'] = (kind, msg)
    st.session_state['apex_push_toast'] = True


def _set_line_quantity(uid, qty_key, handle):
    """on_click for the per-row qty ♻️/❌: read the number typed for this row, set that
    line's Apex quantity, push to Apex in the same click, and refresh the comparison +
    on-hand. A NEGATIVE entry is a relative adjustment (-100 takes 200 → 100); a
    positive entry is the new absolute quantity. handle='inventory' returns the removed
    units to stock, 'trash' writes them off. Every failure path sets a verdict so a
    dead click is never silent. Mirrors _finalize_remove's instant-push pattern (no
    explicit st.rerun — the natural post-callback rerun repaints the grid)."""
    items = st.session_state.get('invoice_items', [])
    it = next((x for x in items if x.get('_uid') == uid), None)
    raw = st.session_state.get(qty_key)
    if it is None:
        _qty_verdict('error', "❌ Quantity edit failed — that line is no longer on the invoice.")
        return
    try:
        typed = int(raw)
    except (TypeError, ValueError):
        _qty_verdict('error', f"❌ Quantity edit failed — '{raw}' isn't a whole number.")
        return
    try:
        cur = int(float(it.get('order_quantity') or 0))
    except (TypeError, ValueError):
        cur = 0

    nq = cur + typed if typed < 0 else typed   # negative = subtract from current
    if nq < 0:
        _qty_verdict('error', f"❌ {typed:+d} would take the line below zero "
                              f"(current qty is {cur}).")
        return
    if nq == cur:
        _qty_verdict('info', f"Quantity unchanged — the line is already at {cur}.")
        return
    if nq == 0:
        # Down to zero == remove the line entirely — reuse the removal path so the
        # penalty box, undo, and on-hand refresh all behave exactly like the main ♻️/❌.
        _finalize_remove(uid, 'return' if handle == 'inventory' else 'delete')
        return

    touched = [(it.get('product_id'), it.get('batch_id'))]
    log = push_line_quantity(uid, nq, handle=handle, live=True)
    st.session_state['apex_push_log'] = log
    if nq > cur:
        where = "added from inventory"
    else:
        where = ("returned to inventory" if handle == 'inventory' else "written off")
    _apply_push_verdict(log, verb=f"Qty {cur} → {nq} ({abs(nq - cur)} {where})")

    st.session_state[qty_key] = nq   # show the resolved qty in the box (delta entry)
    st.session_state['total_invoice_weight'] = sum(
        (calculate_total_weight(x)[0] or 0) for x in items)
    st.session_state.pop('comparison_df', None)
    st.session_state.pop('_cmp_sig', None)
    _patch_batches_in_view(touched)
    st.session_state['bi_gen'] = st.session_state.get('bi_gen', 0) + 1


def _find_inventory_candidates(man_batch, man_item_name=""):
    """Rank Apex inventory (product, batch) pairs against a manifest package's
    batch name (+ item name). Exact batch-code match scores first, then fuzzy
    batch match, then strain-name match on the product — so the auto-pick is
    almost always right but the user still verifies it in the dropdown.
    Returns [{'label', 'product', 'batch'}] best-first (max 8)."""
    inv = st.session_state.get('inv_cache') or load_inventory_cache()
    st.session_state['inv_cache'] = inv
    products = {str(p.get('id')): p for p in (inv.get('products') or [])}
    idx = fetch_all_batches_indexed()
    nb = normalize_batch_name(man_batch)
    man_strain = extract_strain_name(man_item_name or man_batch)
    # A multi-pack group row ('Multi-packs (5/pack)') has no strain/batch to
    # match — pair it with inventory products that are the same pack size
    # ('Multi-pack joints (five pack)') instead.
    man_mp = multipack_count(man_batch) or multipack_count(man_item_name)
    scored = []
    for pid, blist in idx.items():
        p = products.get(str(pid)) or {}
        pstrain = extract_strain_name(p.get('name') or '')
        p_mp = multipack_count(p.get('name') or '')
        for b in blist:
            bn = b.get('name') or ''
            if bn and normalize_batch_name(bn) == nb:
                score = 3.0
            elif bn and are_batches_same(man_batch, bn):
                score = 2.0
            elif man_mp and p_mp == man_mp:
                score = 1.5
            elif (man_strain and pstrain and len(man_strain) >= 3
                  and (man_strain in pstrain or pstrain in man_strain)):
                score = 1.0
            else:
                continue
            scored.append((score, p, b))
    scored.sort(key=lambda t: (-t[0], (t[1].get('name') or '')))
    out = []
    for score, p, b in scored[:8]:
        pname = p.get('name') or f"(product {b.get('product_id')})"
        out.append({'label': f"{pname[:48]}  ·  {b.get('name') or '(unnamed batch)'}",
                    'product': p, 'batch': b})
    return out


def _suggest_add_qty(product, grams):
    """From a manifest package's grams + the product's packaging, suggest
    (qty, 'Case'|'Unit', units_total, upc, gpu) — e.g. 12g of a 1g cart sold
    in cases of 12 → 1 Case; 6g of a .5g cart in cases of 12 → 1 Case."""
    gpu = _p_unit_grams(product) or 0
    try:
        upc = int(product.get('units_per_case') or 0) or 1
    except (TypeError, ValueError):
        upc = 1
    units = int(round(grams / gpu)) if (gpu and grams) else 0
    if units <= 0:
        units = upc if upc > 1 else 1
    sold_case = (str(product.get('sold_as', '')).lower() == 'case' or upc > 1)
    if sold_case and upc > 1 and units % upc == 0:
        return units // upc, 'Case', units, upc, gpu
    return units, 'Unit', units, upc, gpu


def _cmp_stage_line(bk, cand, qty, unit_name):
    """Pre-flight + build the staged line for a comparison-row ➕ WITHOUT
    pushing. Returns (line_dict, topped_note, error) — line_dict is None on
    error. Split out of _cmp_add_to_invoice so a bulk add can stage every
    missing batch and push them all through ONE push_invoice_changes cycle."""
    p, b = cand['product'], cand['batch']
    try:
        qty = int(qty)
    except (TypeError, ValueError):
        return None, None, f"'{qty}' isn't a whole number"
    if qty <= 0:
        return None, None, "quantity must be at least 1"
    try:
        upc = int(p.get('units_per_case') or 0) or 1
    except (TypeError, ValueError):
        upc = 1
    need_units = qty * (upc if unit_name == 'Case' else 1)

    # ── 'Zero on Apex' guard: make sure the batch can cover the pull ──
    pid = b.get('product_id') or p.get('id')
    bid = b.get('id')
    topped = None
    fresh = get_batch_fresh(pid, bid) if bid is not None else None
    if fresh and not fresh.get('disable_inventory_tracking'):
        avail = _batch_qty(fresh)
        if avail is not None and avail < need_units:
            ok, msg = _top_up_batch(pid, bid, int(need_units))
            if ok:
                topped = f"batch topped up {avail:g}u → {need_units}u first"
            else:
                # NEVER abort here. This is only a pre-flight courtesy — the add
                # itself (push_invoice_changes) reads Apex's own
                # 'InsufficientQuantity' answer and tops the batch up + retries.
                # Bailing out on a capped/failed pre-flight is what made a batch
                # sitting at 0u impossible to add at all.
                topped = (f"pre-flight top-up couldn't run ({msg}) — adding anyway; "
                          "Apex's own short-stock retry handles it")

    gpu = _p_unit_grams(p)
    line = {
        'product_name': p.get('name') or cand['label'],
        'product_id': pid,
        'batch_id': bid,
        'batch_name': b.get('name') or '',
        'order_quantity': qty,
        'order_unit_measurement': {'name': 'Case' if unit_name == 'Case' else 'Unit'},
        'units_per_case': upc,
        'unit_size': (gpu or None),
        'unit_size_unit_measurement': ({'name': 'grams'} if gpu else None),
        '_added': True,
    }
    return line, topped, None


def _cmp_add_to_invoice(bk, cand, qty, unit_name):
    """on_click for the comparison-row ➕: put a manifest-only batch onto the
    Apex invoice. If the batch is short in Apex inventory (e.g. sitting at
    zero), it's topped up FIRST — add-item pulls stock from the batch, and a
    short batch is exactly what makes the add silently fail. Then the line is
    staged and pushed through the same instant-push path as the Add-units grid."""
    line, topped, err = _cmp_stage_line(bk, cand, qty, unit_name)
    if err:
        _qty_verdict('error', f"❌ Add failed — {err}.")
        return
    _post_staged_to_invoice([(line, f"cmpadd_{bk}")])
    if topped:
        kind, msg = st.session_state.get('apex_push_verdict', ('info', ''))
        st.session_state['apex_push_verdict'] = (kind, f"{msg} ({topped})")


def _refresh_inv_from_apex():
    """on_click: force a TRUE full re-pull — drop every batch cache AND the per-batch
    overrides, so the next run recrawls /v2/batches from scratch. This is the escape
    hatch when you want the whole grid re-read, not just the rows you touched."""
    fetch_all_batches_indexed.clear()
    fetch_product_batches.clear()
    st.session_state.pop('_inv_batch_cache', None)
    st.session_state.pop('batch_overrides', None)


def _adder_add(item):
    """on_click: stage one inventory line onto the invoice (no st.rerun)."""
    st.session_state.setdefault('invoice_items', []).append(item)
    st.session_state.pop('inv_staged', None)
    st.session_state.pop('comparison_df', None)
    st.session_state.pop('_cmp_sig', None)


def _adder_cancel():
    st.session_state.pop('inv_staged', None)


def _post_staged_to_invoice(staged_lines):
    """on_click: stage every Add-units line onto the invoice AND push it straight to
    Apex in the SAME click — no separate 'Update Invoice' press. Each entry is
    (line_dict, add_store_key).

    The line is sent via the b-api add-item with its batch_id; Apex decrements that
    batch when the line lands on the order, so we deliberately do NOT also PATCH the
    batch quantity — that would subtract the units twice. On a successful push the
    batch caches are cleared so the grid re-reads live on-hand (you watch 24 → 0)."""
    add_store = st.session_state.setdefault('bi_add', {})
    n = 0
    for line, k in staged_lines:
        st.session_state.setdefault('invoice_items', []).append(line)
        add_store.pop(k, None)
        n += 1
    st.session_state['bi_post_result'] = n
    if not n:
        return

    st.session_state.pop('comparison_df', None)
    st.session_state.pop('_cmp_sig', None)
    st.session_state['bi_gen'] = st.session_state.get('bi_gen', 0) + 1

    # ── Push to Apex right now (same click) ──
    log = push_invoice_changes(live=True)
    st.session_state['apex_push_log'] = log

    # Verdict — identical rule to the manual Update Invoice button, so the result
    # banner + full request/response log render up in the invoice panel as usual.
    attempts = [e for e in log if e.get('step') in ('ADD', 'MODIFY-QTY')]
    aborted = [e for e in log if e.get('step') in ('ABORT', 'NO SESSION')]

    def _ok(e):
        return (str(e.get('status', '')).startswith('2')
                and str(e.get('note', '')).lstrip().startswith("✅"))

    ok_n, n_att = sum(1 for e in attempts if _ok(e)), len(attempts)
    if aborted:
        kind, msg = 'error', ("❌ Post failed — "
                              + (aborted[0].get('note')
                                 or "couldn't reach Apex. See the log below."))
    elif n_att == 0:
        kind, msg = 'info', "Nothing pushed — Apex reported no add to make."
    elif ok_n == n_att:
        kind, msg = 'success', (f"✅ Posted & pushed — {ok_n}/{n_att} line(s) "
                                "on the Apex order. On-hand re-read below.")
        # Success → refetch ONLY the batches we just added from (Apex decremented them),
        # so those rows show the new on-hand (24 → 0) without recrawling everything.
        _patch_batches_in_view(
            (ln.get('product_id'), ln.get('batch_id')) for ln, _ in staged_lines)
    else:
        kind, msg = 'error', (f"❌ Partial — only {ok_n}/{n_att} line(s) made "
                              "it to Apex. See the log below.")
    st.session_state['apex_push_verdict'] = (kind, msg)
    st.session_state['apex_push_toast'] = True


def _stage_remove(sel):
    """on_click: open the remove dialog for one line (int) or several (list)."""
    st.session_state['pending_remove'] = sel


def _cancel_remove():
    st.session_state.pop('pending_remove', None)


def _reset_invoice():
    """on_click: restore the originally loaded invoice lines."""
    orig = st.session_state.get('invoice_items_original')
    if orig is not None:
        st.session_state['invoice_items'] = [dict(x) for x in orig]
    st.session_state.pop('comparison_df', None)
    st.session_state.pop('_cmp_sig', None)



def remove_item_dialog(sel):
    items = st.session_state.get('invoice_items', [])
    idxs = _resolve_remove_indices(sel)
    if not idxs:
        st.session_state.pop('pending_remove', None)
        return
    if len(idxs) == 1:
        it = items[idxs[0]]
        w, _ = calculate_total_weight(it)
        st.markdown(f"**{it.get('product_name', '')}**")
        st.caption(f"Batch: {it.get('batch_name', '')}" + (f"  ·  {w:.1f}g" if w else ""))
        st.write("Remove this line — what happens to the stock?")
    else:
        tot = sum((calculate_total_weight(items[i])[0] or 0) for i in idxs)
        bn = items[idxs[0]].get('batch_name', '')
        st.markdown(f"**{len(idxs)} lines** · batch {bn}")
        st.caption(f"Total {tot:.1f}g across {len(idxs)} line(s)")
        st.write("Remove these lines — what happens to the stock?")
    c1, c2 = st.columns(2)
    with c1:
        st.button("↩️ Return to inventory", use_container_width=True, key="rm_return",
                  help="Put the units back into available stock — saved to Apex now",
                  on_click=_finalize_remove, args=(sel, 'return'))
    with c2:
        st.button("🗑️ Delete from inventory", use_container_width=True, key="rm_delete",
                  help="Write the units off — saved to Apex now",
                  on_click=_finalize_remove, args=(sel, 'delete'))
    st.button("Cancel", use_container_width=True, key="rm_cancel",
              on_click=_cancel_remove)


# Render remove_item_dialog as a real modal pop-up when the Streamlit build
# supports it; otherwise fall back to rendering it inline.
_dialog_deco = getattr(st, "dialog", None) or getattr(st, "experimental_dialog", None)
if _dialog_deco:
    remove_item_dialog = _dialog_deco("Remove item")(remove_item_dialog)


def fetch_order_coa_zip(session, order_uuid):
    """Download the 'All COAs' zip for an order via the exact endpoint the Apex
    'Download All COAs' link uses:
        GET /b-api/order-item-zip/{order_uuid}
    Authenticated by the browser session (cookie + x-xsrf-token), same as the
    add/remove writes. Returns (zip_bytes | None, message). The uuid is the order's
    uuid (st.session_state['apex_order_raw']['uuid'])."""
    if not order_uuid:
        return None, "No order uuid — load an invoice first."
    if not _session_ready(session):
        return None, ("No Apex browser session loaded. Grab it from Firefox in the "
                      "sidebar first — the COA zip uses your logged-in session.")
    url = f"{BAPI_BASE}/order-item-zip/{order_uuid}"
    headers = dict(_bapi_headers(session))
    # This is a file download, not JSON — don't force an application/json accept.
    headers["accept"] = "*/*"
    headers["referer"] = f"{APP_ORIGIN}/orders"
    try:
        r = _HTTP.get(url, headers=headers, timeout=120)
    except Exception as e:
        return None, f"Request failed: {type(e).__name__}: {e}"
    if r.status_code in (401, 419):
        return None, ("Auth rejected (HTTP %d) — re-grab the Apex session from Firefox "
                      "and try again." % r.status_code)
    if r.status_code != 200:
        return None, f"Apex returned HTTP {r.status_code} for the COA zip."
    content = r.content or b""
    # A real zip starts with 'PK'. If we got HTML/JSON instead, surface that.
    if content[:2] != b"PK":
        ctype = r.headers.get("content-type", "")
        if "zip" not in ctype.lower():
            return None, (f"Response wasn't a zip (content-type: {ctype or 'unknown'}, "
                          f"{len(content)} bytes). The session may be invalid or the "
                          "order has no COAs attached.")
    return content, f"Downloaded COA zip ({len(content):,} bytes)."


def fetch_single_coa(session, item_id, batch_id, doc_id):
    """Download ONE line item's COA PDF via the exact endpoint the per-line green
    icon uses:
        GET /b-api/order-item-historical-doc/{order_item_id}/{batch_id}/{doc_id}
    Authenticated by the browser session. Returns (pdf_bytes | None, message)."""
    if not (item_id and batch_id and doc_id):
        return None, "Missing one of order_item_id / batch_id / document_id."
    if not _session_ready(session):
        return None, "No Apex session — grab it from Firefox in the sidebar first."
    url = f"{BAPI_BASE}/order-item-historical-doc/{item_id}/{batch_id}/{doc_id}"
    headers = dict(_bapi_headers(session))
    headers["accept"] = "*/*"
    headers["referer"] = f"{APP_ORIGIN}/orders"
    try:
        r = _HTTP.get(url, headers=headers, timeout=60)
    except Exception as e:
        return None, f"Request failed: {type(e).__name__}: {e}"
    if r.status_code in (401, 419):
        return None, f"Auth rejected (HTTP {r.status_code}) — re-grab the Apex session."
    if r.status_code != 200:
        return None, f"Apex returned HTTP {r.status_code} for this COA."
    content = r.content or b""
    if content[:4] != b"%PDF":
        ctype = r.headers.get("content-type", "")
        if "pdf" not in ctype.lower():
            return None, (f"Response wasn't a PDF (content-type: {ctype or 'unknown'}, "
                          f"{len(content)} bytes).")
    return content, f"COA ({len(content):,} bytes)."


def _coa_docs_by_batch(session):
    """Pull the b-api order once and map batch_id -> list of COA descriptors
    {item_id, batch_id, doc_id, name, type} from each item's historical_documents.
    Cached in session_state per order so we only do the heavier b-api read once.
    The bearer-API invoice load doesn't include historical_documents, so this is how
    the per-line COA buttons get their document ids."""
    oid = st.session_state.get('apex_order_id')
    if not oid:
        return {}
    cache_key = f'_coa_docs_{oid}'
    if cache_key in st.session_state:
        return st.session_state[cache_key]

    out = {}
    if not _session_ready(session):
        st.session_state[cache_key] = out          # cache the empty so we don't retry every rerun
        return out
    order = bapi_fetch_invoice(session, oid)
    for it in (order.get('items') or []):
        item_id = it.get('id')
        batch_id = it.get('batch_id')
        for doc in (it.get('historical_documents') or []):
            doc_id = doc.get('id')
            if not (item_id and batch_id and doc_id):
                continue
            out.setdefault(str(batch_id), []).append({
                'item_id': item_id,
                'batch_id': batch_id,
                'doc_id': doc_id,
                'name': doc.get('document_name') or f"COA_{doc_id}.pdf",
                'type': doc.get('document_type') or 'Document',
            })
    st.session_state[cache_key] = out
    return out


def _render_line_coa(col, item, coa_map):
    """Render one line's COA control in `col`. Looks up the line's COA doc(s) by
    batch_id from coa_map. On click it fetches the single PDF and stashes the bytes
    keyed by the line uid; once fetched, it shows a download button. If the line has
    no COA on record (or the session isn't loaded), shows a muted dash."""
    uid = item.get('_uid') or str(item.get('batch_id'))
    # A COA already attached to this line (from the zip, or a prior single fetch) wins —
    # show it regardless of whether the b-api doc map knows about this batch.
    # ⬇️ (not 📄) so the "fetched — click to SAVE" state is visibly different from
    # the "click to fetch" state; identical icons made the two-step look broken.
    blob = st.session_state.get(f'_coa_line_{uid}')
    if blob:
        col.download_button("⬇️", blob['data'], blob['name'], "application/pdf",
                            key=f"coa_dl_{uid}",
                            help=f"COA fetched — click to save {blob['name']}")
        return
    docs = coa_map.get(str(item.get('batch_id'))) if coa_map else None
    if not docs:
        col.caption("—")
        return
    doc = docs[0]                                  # first/primary COA for the batch
    if col.button("📄", key=f"coa_get_{uid}",
                  help=f"Fetch COA ({doc['type']}) for {item.get('batch_name','')} — "
                       "the icon turns into ⬇️ to save it"):
        sess = st.session_state.get('bapi_session') or {}
        data, msg = fetch_single_coa(sess, doc['item_id'], doc['batch_id'], doc['doc_id'])
        if data:
            safe = re.sub(r'[^A-Za-z0-9._-]', '_', doc['name'])
            if not safe.lower().endswith('.pdf'):
                safe += '.pdf'
            st.session_state[f'_coa_line_{uid}'] = {'data': data, 'name': safe}
            _qty_verdict('success', f"✅ COA fetched — click the ⬇️ on that line "
                                    f"to save {safe}.")
            st.rerun()
        else:
            st.session_state['_coa_line_error'] = f"{doc['name']}: {msg}"


def _attach_coas_from_zip(zip_bytes, items):
    """Unpack the 'All COAs' zip and attach each PDF to its matching line item by
    writing the per-line `_coa_line_{uid}` blob — the exact slot the COA column reads.
    Each item is matched to a zip entry by its batch name / strain / product name (and
    the batch date when present). Returns (matched, total). This is how clicking
    'Download All COAs' fills in the COA column instead of just handing back a zip."""
    import zipfile
    import unicodedata

    items = items or []
    _ensure_line_uids(items)

    def _norm(s):
        # fold accents (Señor -> Senor) before stripping, so diacritics don't break matches
        s = unicodedata.normalize('NFKD', s or '')
        s = ''.join(c for c in s if not unicodedata.combining(c))
        return re.sub(r'[^a-z0-9]', '', s.lower())

    try:
        zf = zipfile.ZipFile(BytesIO(zip_bytes))
    except Exception:
        return 0, len(items)

    # Build a list of (full_path, basename, normalized_stem) for every PDF in the zip.
    entries = []
    for info in zf.infolist():
        if getattr(info, 'is_dir', lambda: info.filename.endswith('/'))():
            continue
        base = os.path.basename(info.filename)
        if not base.lower().endswith('.pdf'):
            continue
        entries.append((info.filename, base, _norm(os.path.splitext(base)[0])))

    if not entries:
        return 0, len(items)

    matched = 0
    used = set()
    for it in items:
        uid = it.get('_uid') or str(it.get('batch_id'))
        if st.session_state.get(f'_coa_line_{uid}'):     # already has a COA — count it, skip
            matched += 1
            continue

        batch = (it.get('batch_name') or '').strip()
        prod = (it.get('product_name') or '').strip()
        strain = batch.split(' - ')[0].strip()
        prod_strain = prod.split(' - ')[-1].strip() if ' - ' in prod else prod
        m = re.search(r'\d{6,8}', batch)
        date = m.group(0) if m else ''

        # candidate keys, weighted: the more specific the key, the stronger the match
        cands = [(_norm(batch), 5), (_norm(strain), 4),
                 (_norm(prod), 3), (_norm(prod_strain), 3)]

        best = None
        best_score = 0.0
        for fname, base, ekey in entries:
            if not ekey:
                continue
            score = 0.0
            for key, wt in cands:
                if key and (key in ekey or ekey in key):
                    score = max(score, wt + len(key) / 100.0)
            if date and date in ekey:
                score += 2.0
            if fname in used:        # prefer not reusing one PDF for two lines
                score -= 1.0
            if score > best_score:
                best_score = score
                best = fname

        if best and best_score >= 4.0:               # require at least a strain-level hit
            try:
                data = zf.read(best)
            except Exception:
                continue
            if data[:4] != b'%PDF':
                continue
            safe = re.sub(r'[^A-Za-z0-9._-]', '_', os.path.basename(best))
            if not safe.lower().endswith('.pdf'):
                safe += '.pdf'
            st.session_state[f'_coa_line_{uid}'] = {'data': data, 'name': safe}
            used.add(best)
            matched += 1

    return matched, len(items)


# ============================================================
# ORDER META (terms / dates / status), PAYMENTS & INVOICE PDF — b-api
# ============================================================
# The modify-quantity / add-item / COA-zip endpoints were locked in from DevTools.
# The endpoints below follow the same conventions but are NOT yet confirmed — so
# each write probes a short list of likely routes and logs EVERY request/response.
# If a save doesn't land: make the same edit once in the Apex UI with DevTools
# open, and paste the request (method + URL + body) here to lock it in.

NET_TERMS_CHOICES = ["(none)", "COD", "Net 7", "Net 14", "Net 20", "Net 30",
                     "Net 45", "Net 60", "Net 90", "See notes"]
NET_TERMS_DAYS = {"COD": 0, "Net 7": 7, "Net 14": 14, "Net 20": 20, "Net 30": 30,
                  "Net 45": 45, "Net 60": 60, "Net 90": 90}
ACCOUNTING_METHODS = ["Ad Hoc Credit", "Payment", "Credit", "Write-Off", "Trade"]
NET_TERMS_LEARNED_FILE = "apex_net_terms.json"   # name -> id, learned from order reads
PAYMENT_TYPE_PRESETS = ["(none)", "Cash", "Check", "ACH", "Wire", "Money Order",
                        "Credit Card", "Zelle", "Venmo", "Cash App", "Trade",
                        "Other"]


def _is_bapi_order(order):
    """b-api order GETs carry keys the v1 API doesn't; money on them is CENTS."""
    return isinstance(order, dict) and ('opsRepresented' in order
                                        or 'invoiceNumber' in order)


def _order_money(order, *keys):
    """Read the first present money field off the order as DOLLARS, whichever API
    shape it came from (v1 formatted string vs b-api integer cents)."""
    for k in keys:
        v = order.get(k)
        if v is None or v == "":
            continue
        if isinstance(v, str):
            f = _parse_money(v)
            if f is not None:
                return f
        elif isinstance(v, (int, float)):
            return (float(v) / 100.0) if _is_bapi_order(order) else float(v)
    return None


def _payment_dollars(p, order):
    """One payment-ledger record's amount in DOLLARS (v1 dollars-string with
    amount_raw cents vs b-api integer cents)."""
    if isinstance(p.get('amount_raw'), (int, float)):
        return float(p['amount_raw']) / 100.0
    if isinstance(p.get('amount'), (int, float)):
        return float(p['amount']) / 100.0
    s = str(p.get('amount') or '')
    val = _parse_money(s) or 0.0
    return val / 100.0 if ('.' not in s and _is_bapi_order(order)) else val


def _itemized_credits(order):
    """The order's credit ledger entries as (label, dollars), oldest first, so
    the invoice can list each credit with its reason ("Credit – 5% COD
    discount") instead of one summed Credits row. Empty when this order copy
    carries no payments list — callers fall back to the summed row."""
    out = []
    for p in sorted((order.get('payments') or []) if isinstance(order, dict) else [],
                    key=lambda x: str(x.get('payment_date') or '')):
        if str(p.get('type') or '').strip().lower() != 'credit':
            continue
        amt = _payment_dollars(p, order)
        if not amt:
            continue
        note = str(p.get('note') or '').strip()
        out.append((f"Credit – {note}" if note else "Credit", amt))
    return out


def _order_due(order):
    """The order's outstanding due balance in DOLLARS.
    b-api orders carry a reliable payment_currently_due (cents). The v1 API's
    'payments_currently_due' is NOT reliable — confirmed live: it read "0.00" on an
    order with $1,820 owed (raw field null, status 'partial'). So for v1 shapes the
    due is DERIVED from the *_raw integer-cents fields:
    total − payments − credits − write-offs − trades."""
    if not isinstance(order, dict):
        return None
    if _is_bapi_order(order):
        v = _order_money(order, 'payment_currently_due', 'payments_currently_due')
        if v is not None:
            return v
    # v1 shape (or b-api missing the field): derive from *_raw cents — reliable ints
    tr = order.get('total_raw')
    if isinstance(tr, (int, float)):
        out = float(tr)
        for k in ('total_payments_raw', 'total_credits_raw',
                  'total_write_offs_raw', 'total_trades_raw'):
            rv = order.get(k)
            if isinstance(rv, (int, float)):
                out -= float(rv)
        return max(0.0, out) / 100.0
    # last resort: formatted strings
    total = _order_money(order, 'total')
    if total is not None:
        out = total
        for k in ('total_payments', 'total_credits', 'total_write_offs',
                  'total_trades'):
            out -= (_order_money(order, k) or 0)
        return max(0.0, out)
    return _order_money(order, 'payment_currently_due', 'payments_currently_due')


def _bapi_try(session, attempts, log, step_name):
    """Fire candidate (method, url, body[, headers]) calls in order until one returns
    2xx. Default auth is the browser session; an attempt may carry its own headers
    (e.g. the documented v1 API's bearer token). Every attempt is logged. 401/419
    stops immediately (bad auth). Returns (response | None, winning_url | None)."""
    for att in attempts:
        method, url, body = att[0], att[1], att[2]
        hdrs = att[3] if len(att) > 3 else _bapi_headers(session)
        try:
            r = _HTTP.request(method, url, headers=hdrs, json=body, timeout=45)
        except Exception as e:
            log.append({'step': step_name, 'method': method, 'url': url,
                        'request': body, 'status': 'ERR', 'response': str(e)})
            continue
        entry = {'step': step_name, 'method': method, 'url': url, 'request': body,
                 'status': r.status_code, 'response': _short(r.text)}
        if r.status_code in (200, 201):
            entry['note'] = '✅ ok'
            log.append(entry)
            return r, url
        if r.status_code in (401, 419):
            entry['note'] = ('auth rejected on this route — bearer routes need the '
                             'API token ability, b-api routes need a fresh browser '
                             'session. Trying the next candidate.')
            log.append(entry)
            continue
        entry['note'] = ('404/405 — wrong route, trying the next candidate'
                         if r.status_code in (404, 405) else
                         'non-2xx — if this is the right route, paste the response '
                         'and the request Apex itself sends (DevTools) to lock it in')
        log.append(entry)
    return None, None


def _term_key(name):
    return re.sub(r'[^a-z0-9]', '', str(name).lower())


# net7=1, net60=6, and cod=7 are CONFIRMED from live order reads; the rest follow
# the Apex dropdown order (Net 7, 14, 20, 30, 45, 60, COD, 90 → global ids 1-8),
# which all three confirmed anchors fit. A wrong guess self-corrects: load an order
# carrying that term once and the real id overwrites it (setdefault below).
_NET_TERMS_SEED = {'net7': 1, 'net14': 2, 'net20': 3, 'net30': 4, 'net45': 5,
                   'net60': 6, 'cod': 7, 'net90': 8}


def _learned_net_terms():
    """name_key -> net_terms_id, harvested from every b-api order read that carries a
    `term` object. Persisted to disk. The seed is merged on EVERY call (setdefault,
    so learned truth always wins) — merging only on first build left a long-running
    session stuck with a stale map, which is how a COD save once fell back to a junk
    name key and silently didn't post."""
    known = st.session_state.get('_net_terms_known')
    if known is None:
        known = {}
        try:
            if os.path.exists(NET_TERMS_LEARNED_FILE):
                with open(NET_TERMS_LEARNED_FILE) as f:
                    known.update(json.load(f))
        except Exception:
            pass
        st.session_state['_net_terms_known'] = known
    for k, v in _NET_TERMS_SEED.items():
        known.setdefault(k, v)
    return known


def _learn_net_terms_from_order(order):
    """If the order read carries its term (id + name), remember the mapping."""
    t = (order or {}).get('term')
    if not (isinstance(t, dict) and t.get('id') is not None and t.get('name')):
        return
    known = _learned_net_terms()
    k = _term_key(t['name'])
    if known.get(k) != t['id']:
        known[k] = t['id']
        try:
            with open(NET_TERMS_LEARNED_FILE, 'w') as f:
                json.dump(known, f)
        except Exception:
            pass


def bapi_list_net_terms(session, log=None):
    """Read the net-terms list (id + name). PRIMARY: the DOCUMENTED v1 endpoint
    (GET /api/v1/net-terms, bearer token, ability view:netterms — confirmed from the
    Apex API docs). Fallback: b-api probes. Real ids from the documented endpoint are
    merged into the learned map (overwriting any inferred seed), so terms saves send
    ground-truth ids. Returns list of dicts (possibly empty)."""
    cached = st.session_state.get('_net_terms_list')
    if cached is not None:
        return cached
    out = []

    # ── Documented v1 endpoint (bearer) — same auth that PATCHes batches fine ──
    try:
        r = _HTTP.get(f"{APEX_API_V1}/net-terms", headers=apex_headers,
                         params={'per_page': 100}, timeout=30)
        if log is not None:
            log.append({'step': 'NET-TERMS list', 'method': 'GET',
                        'url': f"{APEX_API_V1}/net-terms", 'status': r.status_code,
                        'response': _short(r.text, 400)})
        if r.status_code == 200:
            j = r.json()
            for t in (j.get('terms') or []):
                try:
                    tid = int(t.get('id'))
                except (TypeError, ValueError):
                    continue
                nm = str(t.get('name') or '')
                if nm:
                    out.append({'id': tid, 'name': nm})
    except Exception as e:
        if log is not None:
            log.append({'step': 'NET-TERMS list', 'method': 'GET',
                        'url': f"{APEX_API_V1}/net-terms", 'status': 'ERR',
                        'response': str(e)})
    if out:
        # Ground truth — overwrite the learned/seeded map and persist it.
        known = _learned_net_terms()
        for t in out:
            known[_term_key(t['name'])] = t['id']
        try:
            with open(NET_TERMS_LEARNED_FILE, 'w') as f:
                json.dump(known, f)
        except Exception:
            pass
        if log is not None:
            log.append({'step': 'NET-TERMS list',
                        'note': "✅ real ids: " + ", ".join(
                            f"{t['name']}={t['id']}" for t in out[:16])})
        st.session_state['_net_terms_list'] = out
        return out

    # ── Fallback: b-api probes (browser session) ──
    for u in (f"{BAPI_BASE}/net-terms", f"{BAPI_BASE}/terms",
              f"{BAPI_BASE}/company/net-terms", f"{BAPI_BASE}/settings/net-terms"):
        status, note = None, ''
        try:
            r = _HTTP.get(u, headers=_bapi_headers(session), timeout=30)
            status = r.status_code
        except Exception as e:
            if log is not None:
                log.append({'step': 'NET-TERMS list', 'method': 'GET', 'url': u,
                            'status': 'ERR', 'response': str(e)})
            continue
        if r.status_code != 200:
            if log is not None:
                log.append({'step': 'NET-TERMS list', 'method': 'GET', 'url': u,
                            'status': status,
                            'note': 'not the terms route — trying next candidate'})
            continue
        try:
            j = r.json()
        except Exception:
            if log is not None:
                log.append({'step': 'NET-TERMS list', 'method': 'GET', 'url': u,
                            'status': status, 'note': 'non-JSON response — skipping'})
            continue
        lst = (j if isinstance(j, list)
               else next((v for v in j.values() if isinstance(v, list)), [])
               if isinstance(j, dict) else [])
        for t in lst:
            if isinstance(t, dict) and t.get('id') is not None:
                out.append({'id': t['id'],
                            'name': str(t.get('name') or t.get('label') or '')})
        if log is not None:
            log.append({'step': 'NET-TERMS list', 'method': 'GET', 'url': u,
                        'status': 200,
                        'note': (f"found {len(out)} terms: "
                                 + ", ".join(f"{t['name']}={t['id']}" for t in out[:12])
                                 if out else "200 but no terms parsed from response")})
        if out:
            break
    st.session_state['_net_terms_list'] = out
    return out


def _match_net_terms_id(name, terms_list):
    """Resolve a terms name to its Apex id: learned-from-orders map first (ground
    truth), then whatever the list endpoint returned."""
    key = _term_key(name)
    known = _learned_net_terms()
    if key in known:
        return known[key]
    for t in terms_list:
        if _term_key(t['name']) == key:
            return t['id']
    return None


_ORDER_FIELD_CAMEL = {'delivery_date': 'deliveryDate', 'due_date': 'dueDate',
                      'order_status_id': 'orderStatusId',
                      'net_terms_id': 'netTermsId', 'net_terms': 'netTerms'}


def bapi_update_order_fields(session, order, updates, log):
    """PATCH order-level fields (delivery_date / due_date / order_status_id /
    net_terms_id) on the REAL order. The body carries BOTH snake_case and camelCase
    keys — the confirmed b-api writes (modify-quantity) use camelCase (newQuantity,
    buyerUuid), so a snake_case-only body may be silently ignored. Probes the likely
    b-api routes; the winner is cached so later saves go straight there."""
    uuid_ = order.get('uuid')
    oid = order.get('id') or st.session_state.get('apex_order_id')
    body = dict(updates)
    for k, v in updates.items():
        ck = _ORDER_FIELD_CAMEL.get(k)
        if ck:
            body[ck] = v
    # Apex's own UI PATCH body carries the numeric id (confirmed from DevTools:
    # PATCH /b-api/shipping-orders/821814 {"id":821814,"net_terms_id":null})
    body.setdefault('id', oid)
    body.setdefault('orderId', oid)
    attempts = [
        # PRIMARY — CONFIRMED from DevTools (200, separate captures for terms,
        # delivery date, and due date): PATCH /b-api/shipping-orders/{numeric id}
        # with a snake_case body ({"id":…, "net_terms_id":…} etc). This is Apex's
        # own UI route and updates EVERY field. Browser-session auth.
        ("PATCH", f"{BAPI_BASE}/shipping-orders/{oid}", body),
        ("PATCH", f"{BAPI_BASE}/shipping-orders/{uuid_}", body),
        # FALLBACK — documented v1 API (bearer). Per the docs, its update supports
        # ONLY order_status_id ("the only currently supported field"): dates/terms
        # sent here return 200 but are silently ignored. Useful when no browser
        # session is loaded and only the stage changed — the verify step catches
        # anything this route drops.
        ("PUT",   f"{APEX_BASE_URL}/{oid}", body, apex_headers),
        ("PATCH", f"{APEX_BASE_URL}/{oid}", body, apex_headers),
    ]
    # de-dup while keeping order
    seen, uniq = set(), []
    for a in attempts:
        if (a[0], a[1]) not in seen:
            seen.add((a[0], a[1]))
            uniq.append(a)
    r, won = _bapi_try(session, uniq, log, "ORDER-EDIT")
    # The PATCH echoes the FULL updated order (11.8 kB in DevTools) — hand it back
    # so the caller can verify against it without a second round-trip.
    fresh = None
    if r is not None:
        try:
            j = r.json()
            fresh = j.get('order') if isinstance(j, dict) and 'order' in j else j
            if not (isinstance(fresh, dict) and fresh.get('id')):
                fresh = None
        except Exception:
            fresh = None
    return (r is not None), fresh


def bapi_add_payment(session, order, payload, log):
    """POST a payment / credit / write-off / trade onto the order.
    CONFIRMED from DevTools (200 OK):
        POST /b-api/shipping-orders/payments/{orderId}   (browser session auth)
    The created record carries: amount in CENTS (10000 = $100.00), type ('payment',
    …), pay_type, note, payment_date (Y-m-d). The 200 response is the full updated
    order — it's stored back so totals/outstanding refresh instantly."""
    uuid_ = order.get('uuid')
    oid = order.get('id') or st.session_state.get('apex_order_id')
    # EXACT body shape captured from Apex's own Add-Payment modal (DevTools):
    #   {"id":null,"order_id":…,"amount":"10000","note":"","type":"ad hoc credit",
    #    "pay_type":"","payment_date":"2026-07-03T11:43:56.656Z"}
    # amount is a STRING of cents; type uses lowercase WORDS WITH SPACES ("payment",
    # "ad hoc credit"); blanks are empty strings, not nulls. An underscored type
    # ("ad_hoc_credit") is stored but never counted toward totals — the exact
    # "credit posts but doesn't lower the due" bug.
    body = {
        'id': None,
        'order_id': oid,
        'amount': str(int(round(float(payload.get('amount') or 0) * 100))),
        'note': payload.get('memo') or '',
        'type': payload.get('accounting_method') or 'payment',
        'pay_type': payload.get('payment_type') or '',
        'payment_date': f"{payload.get('payment_date')}T00:00:00.000Z",
    }
    attempts = [
        # CONFIRMED route first
        ("POST", f"{BAPI_BASE}/shipping-orders/payments/{oid}", body),
        # fallbacks, kept just in case
        ("POST", f"{BAPI_BASE}/shipping-orders/add-payment/{oid}", body),
        ("POST", f"{APEX_BASE_URL}/{oid}/payments", body, apex_headers),
        ("POST", f"{BAPI_BASE}/orders/{uuid_}/payments", body),
    ]
    r, won = _bapi_try(session, attempts, log, "PAYMENT")
    if won:
        st.session_state['_ep_payment'] = won
    if r is not None:
        # The response IS the updated order — refresh the local copy + totals.
        try:
            j = r.json()
            fresh = (j.get('order') if isinstance(j, dict) and 'order' in j else j)
            if isinstance(fresh, dict) and fresh.get('id'):
                st.session_state['apex_order_raw'] = fresh
                _learn_net_terms_from_order(fresh)
                pays = fresh.get('payments') or []
                log.append({'step': 'PAYMENT verify',
                            'note': (f"✅ order now shows {len(pays)} payment record(s) · "
                                     f"paid ${(fresh.get('total_payments') or 0)/100:,.2f} · "
                                     f"due ${(fresh.get('payment_currently_due') or 0)/100:,.2f}")})
        except Exception:
            pass
    return r is not None


def bapi_adjust_buyer_credit(session, buyer_id, amount_dollars, message, log):
    """Add or subtract the BUYER's stored credit balance (their wallet), NOT an
    order-level credit. CONFIRMED from DevTools (201 Created):
        POST /b-api/buyer-credits/create
        body: {"amount": -100000, "message": "…", "buyer_id": 121162}
    amount is SIGNED CENTS — negative subtracts credit from the buyer, positive adds.
    Returns True on 2xx. (Unlike order payments, this doesn't return the order, so
    the caller re-reads the order to refresh the displayed Current Credit.)"""
    if not buyer_id:
        log.append({'step': 'BUYER-CREDIT', 'note': 'no buyer_id on the order — cannot adjust.'})
        return False
    cents = int(round(float(amount_dollars) * 100))
    body = {'amount': cents, 'message': message or '', 'buyer_id': int(buyer_id)}
    r, _won = _bapi_try(session, [
        ("POST", f"{BAPI_BASE}/buyer-credits/create", body),
    ], log, "BUYER-CREDIT")
    return r is not None


def bapi_delete_payment(session, order, payment_id, log):
    """Delete ONE payment/credit record off the order.
    CONFIRMED from DevTools (200 OK):
        DELETE /b-api/shipping-orders/payments/{orderId}/{paymentId}
    Browser-session auth; the response carries the updated order, which is stored
    back so the ledger and Due refresh instantly."""
    oid = order.get('id') or st.session_state.get('apex_order_id')
    attempts = [
        ("DELETE", f"{BAPI_BASE}/shipping-orders/payments/{oid}/{payment_id}", None),
    ]
    r, _won = _bapi_try(session, attempts, log, "PAYMENT delete")
    if r is not None:
        try:
            j = r.json()
            fresh = (j.get('order') if isinstance(j, dict) and 'order' in j else j)
            if isinstance(fresh, dict) and fresh.get('id'):
                st.session_state['apex_order_raw'] = fresh
        except Exception:
            pass
    return r is not None


@st.fragment
def render_invoice_download():
    """'Download Invoice' for the loaded order. (st.fragment: the build/download
    clicks rerun only this panel, not the whole app.)
    CONFIRMED from DevTools: Apex's own Download button does NOT fetch a server-
    rendered PDF at all — it POSTs bulk-fetch-invoices for the order data, then
    renders the invoice CLIENT-SIDE (Vue modal) and produces the PDF via the
    browser's print dialog. There is no PDF-bytes endpoint to call.
    So this pulls the same rich order data via the confirmed bulk-fetch-invoices
    call and renders it locally (reportlab PDF, or HTML you print-to-PDF), which is
    the correct approach here — not a fallback."""
    if not _invoice_loaded():
        return
    if st.button("🧾 Download Invoice PDF", use_container_width=True,
                 key="inv_pdf_fetch",
                 help="Builds a PDF from the order's live Apex data (same data "
                      "Apex's own invoice view uses)."):
        order = st.session_state.get('apex_order_raw') or {}
        sess = st.session_state.get('bapi_session') or {}
        oid = order.get('id') or st.session_state.get('apex_order_id')
        log = []
        with st.spinner("Pulling invoice data from Apex…"):
            src_order = {}
            if _session_ready(sess):
                src_order = bapi_fetch_invoice(sess, oid, log=log) or {}
            if not src_order:
                v1_order, _m = fetch_invoice_order(oid)
                src_order = v1_order or order
        st.session_state['apex_push_log'] = (st.session_state.get('apex_push_log') or []) + log
        inv = str(st.session_state.get('selected_invoice', '') or oid or '')
        safe = re.sub(r'[^A-Za-z0-9._-]', '_', inv) or "invoice"
        with st.spinner("Rendering invoice…"):
            data, ext, mime, src_label = build_best_invoice_file(src_order)
        st.session_state['inv_pdf_blob'] = {
            'data': data, 'name': f"{safe}{ext}", 'mime': mime, 'src': src_label}
        st.success("✅ Invoice ready.")
    blob = st.session_state.get('inv_pdf_blob')
    if blob:
        st.download_button(
            f"⬇️ Save invoice — {blob['name']} ({blob['src']})",
            blob['data'], blob['name'], blob['mime'],
            use_container_width=True, key="inv_pdf_dl")


@st.fragment
def render_invoice_bundle_download():
    """'Download Invoice + All COAs (ZIP)' — one file containing the built invoice
    (st.fragment: clicks rerun only this panel, not the whole app.)
    plus every COA the order has attached, matching the real Apex invoice's own
    'Download All COAs' bundle. Builds the invoice from live Apex data (same source
    as render_invoice_download) and the COA zip via the confirmed
    order-item-zip/{order_uuid} route, then merges them into a single zip."""
    if not _invoice_loaded():
        return
    if st.button("📦 Download Invoice + COAs (ZIP)", use_container_width=True,
                 key="inv_bundle_fetch",
                 help="One zip: the invoice (built from live Apex data) plus every "
                      "COA attached to this order (same files as Apex's 'Download "
                      "All COAs'). Needs the Apex browser session for the COAs."):
        order = st.session_state.get('apex_order_raw') or {}
        sess = st.session_state.get('bapi_session') or {}
        oid = order.get('id') or st.session_state.get('apex_order_id')
        order_uuid = order.get('uuid')
        log = []
        with st.spinner("Pulling invoice + COAs from Apex…"):
            src_order = {}
            if _session_ready(sess):
                src_order = bapi_fetch_invoice(sess, oid, log=log) or {}
            if not src_order:
                v1_order, _m = fetch_invoice_order(oid)
                src_order = v1_order or order
                order_uuid = order_uuid or src_order.get('uuid')

            inv = str(st.session_state.get('selected_invoice', '') or oid or '')
            safe = re.sub(r'[^A-Za-z0-9._-]', '_', inv) or "invoice"
            inv_bytes, ext, _mime, _src_label = build_best_invoice_file(src_order)
            inv_name = f"{safe}{ext}"

            coa_zip, coa_msg = (None, "no Apex browser session — invoice only")
            if order_uuid and _session_ready(sess):
                coa_zip, coa_msg = fetch_order_coa_zip(sess, order_uuid)

        st.session_state['apex_push_log'] = (st.session_state.get('apex_push_log') or []) + log
        bundle = build_invoice_bundle_zip(inv_bytes, inv_name, coa_zip)
        st.session_state['inv_bundle_blob'] = {
            'data': bundle, 'name': f"Bundle_{safe}.zip", 'inv': safe}
        if coa_zip:
            st.success(f"✅ Bundle ready — invoice + {coa_msg}")
        else:
            st.warning(f"⚠️ Bundle ready — invoice only ({coa_msg}). "
                      "Grab the Apex session in the sidebar to include COAs.")

    blob = st.session_state.get('inv_bundle_blob')
    if blob:
        st.download_button(
            f"⬇️ Save bundle — {blob['name']}",
            blob['data'], blob['name'], "application/zip",
            use_container_width=True, key="inv_bundle_dl")



# ============================================================
# EMAIL (Microsoft Graph, app-only) — send the built invoice PDF
# ============================================================
# Auth: client-credentials flow (MSAL) against an Azure AD app registration
# with the Mail.Send *application* permission (admin-consented), so it can
# send as apex@twistedgrowers.com with no interactive login. Credentials come
# from .streamlit/secrets.toml (gitignored) — never hardcode them here.

_GRAPH_TOKEN_CACHE = {}


def _graph_creds():
    try:
        g = st.secrets["graph"]
        return g["tenant_id"], g["client_id"], g["client_secret"], g["sender_email"]
    except Exception:
        return None, None, None, None


def _graph_token():
    """App-only access token for Microsoft Graph, cached until near expiry."""
    import time as _time
    cached = _GRAPH_TOKEN_CACHE.get('token')
    if cached and _GRAPH_TOKEN_CACHE.get('exp', 0) - 60 > _time.time():
        return cached
    tenant_id, client_id, client_secret, _sender = _graph_creds()
    if not (tenant_id and client_id and client_secret):
        return None
    import msal
    try:
        app = msal.ConfidentialClientApplication(
            client_id, authority=f"https://login.microsoftonline.com/{tenant_id}",
            client_credential=client_secret)
        result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
    except Exception:
        return None   # bad tenant/client id, network error, etc — caller shows a clean message
    token = result.get("access_token")
    if token:
        _GRAPH_TOKEN_CACHE['token'] = token
        _GRAPH_TOKEN_CACHE['exp'] = _time.time() + result.get("expires_in", 3600)
    return token


def send_invoice_email(to_addrs, subject, body_text, attachment_bytes,
                       attachment_name, attachment_mime="application/pdf",
                       cc_addrs=None, send_at_utc=None):
    """One-attachment wrapper kept for the invoice path — see send_graph_mail."""
    return send_graph_mail(
        to_addrs, subject, body_text,
        [(attachment_name, attachment_bytes, attachment_mime)],
        cc_addrs=cc_addrs, send_at_utc=send_at_utc)


def send_graph_mail(to_addrs, subject, body_text, attachments=None,
                    cc_addrs=None, send_at_utc=None, html=False):
    """Send an email from the configured mailbox via Microsoft Graph
    (app-only — no user interaction).
    to_addrs / cc_addrs: list[str].
    attachments: list of (name, bytes, mime) — empty/None sends no attachment.
    Returns (ok: bool, message: str).

    send_at_utc (datetime, UTC): schedule the send instead of sending now.
    Uses Exchange's native deferred delivery — the draft is stamped with the
    PidTagDeferredSendTime MAPI property (SystemTime 0x3FEF) and submitted;
    EXCHANGE holds it and releases it at that time, exactly like Outlook's own
    'Schedule send'. Nothing local needs to keep running — the PC and this app
    can be closed. That requires the create-draft + /send flow rather than the
    one-shot /sendMail (which can't carry extended properties)."""
    _tenant, _client, _secret, sender = _graph_creds()
    if not sender:
        return False, ("Graph credentials not configured — add [graph] to "
                       ".streamlit/secrets.toml (tenant_id, client_id, "
                       "client_secret, sender_email).")
    token = _graph_token()
    if not token:
        return False, "Could not get a Graph access token — check tenant_id/client_id/client_secret."

    to_addrs = [a.strip() for a in (to_addrs or []) if a and a.strip()]
    if not to_addrs:
        return False, "Enter at least one recipient email."

    msg = {
        "subject": subject,
        "body": {"contentType": ("HTML" if html else "Text"),
                 "content": body_text},
        "toRecipients": [{"emailAddress": {"address": a}} for a in to_addrs],
    }
    files = [a for a in (attachments or []) if a and a[1]]
    if files:
        msg["attachments"] = [{
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": name,
            "contentType": mime or "application/octet-stream",
            "contentBytes": base64.b64encode(blob).decode(),
        } for name, blob, mime in files]
    if cc_addrs:
        msg["ccRecipients"] = [
            {"emailAddress": {"address": a.strip()}} for a in cc_addrs if a and a.strip()]

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    graph = f"https://graph.microsoft.com/v1.0/users/{sender}"

    try:
        if send_at_utc is None:
            resp = _HTTP.post(f"{graph}/sendMail", headers=headers,
                                 json={"message": msg, "saveToSentItems": True},
                                 timeout=30)
            if resp.status_code == 202:
                return True, f"Sent to {', '.join(to_addrs)}."
        else:
            when = send_at_utc.strftime('%Y-%m-%dT%H:%M:%SZ')
            msg["singleValueExtendedProperties"] = [
                {"id": "SystemTime 0x3FEF", "value": when}]   # PidTagDeferredSendTime
            resp = _HTTP.post(f"{graph}/messages", headers=headers,
                                 json=msg, timeout=30)
            if resp.status_code not in (200, 201):
                try:
                    err = resp.json().get('error', {}).get('message', resp.text)
                except Exception:
                    err = resp.text
                return False, f"Could not create the scheduled draft — Graph {resp.status_code}: {err}"
            draft_id = resp.json().get('id')
            resp = _HTTP.post(f"{graph}/messages/{draft_id}/send",
                                 headers=headers, timeout=30)
            if resp.status_code == 202:
                return True, (f"Scheduled for {when} UTC — Exchange will send it "
                              f"to {', '.join(to_addrs)} automatically (this app "
                              "doesn't need to stay open).")
    except Exception as e:
        return False, f"Request failed: {e}"

    try:
        err = resp.json().get('error', {}).get('message', resp.text)
    except Exception:
        err = resp.text
    return False, f"Graph returned {resp.status_code}: {err}"


# ── recipient suggestions (from sent-mail history, like Outlook's autocomplete) ──
EMAIL_HISTORY_CACHE_FILE = "email_recipient_history.json"


def contact_lists_grid_df():
    """Contact lists as a wide Store | User 1..N frame — the shape the sidebar
    grid and the Excel round-trip both use."""
    lists = _load_contact_lists()
    rows = {n: [m.get('email') for m in mem if m.get('email')]
            for n, mem in lists.items()}
    max_u = max([len(v) for v in rows.values()] + [3])
    data = [[s] + rows[s] + [''] * (max_u - len(rows[s]))
            for s in sorted(rows, key=str.lower)]
    return pd.DataFrame(data, columns=['Store']
                        + [f'User {i + 1}' for i in range(max_u)])


def save_contact_lists_from_grid(df):
    """Grid/sheet → email_contact_lists.json. Every row with a store name and
    at least one email becomes that store's list; the file is REPLACED by what
    the grid holds, so deleting a row deletes the list.
    Returns (n_lists, n_emails, skipped_store_names)."""
    known = {}
    for mem in _load_contact_lists().values():
        for m in mem:
            if m.get('email'):
                known.setdefault(m['email'].lower(), m.get('name', ''))
    out, skipped = {}, []
    for _, row in df.iterrows():
        store = str(row.iloc[0] or '').strip()
        if not store or store.lower() == 'store':
            continue
        emails = []
        for v in row.iloc[1:]:
            em = _label_to_email(str(v or '').strip())
            if em and em.lower() not in [e.lower() for e in emails]:
                emails.append(em)
        if not emails:
            skipped.append(store)
            continue
        out[store] = [{'name': known.get(e.lower(), ''), 'email': e}
                      for e in emails]
    _save_contact_lists(out)
    return len(out), sum(len(v) for v in out.values()), skipped


def build_email_review_xlsx():
    """The review sheet: Store in column A, its invoice-email users across."""
    lists = _load_contact_lists()
    rows = {n: [m.get('email') for m in mem if m.get('email')]
            for n, mem in lists.items()}
    if not rows:
        return None
    max_u = max(len(v) for v in rows.values())
    data = [[s] + rows[s] + [''] * (max_u - len(rows[s]))
            for s in sorted(rows, key=str.lower)]
    df = pd.DataFrame(data, columns=['Store']
                      + [f'User {i + 1}' for i in range(max_u)])
    bio = BytesIO()
    with pd.ExcelWriter(bio, engine='openpyxl') as xw:
        df.to_excel(xw, index=False, sheet_name='Invoice emails')
        try:
            from openpyxl.utils import get_column_letter
            ws = xw.sheets['Invoice emails']
            ws.column_dimensions['A'].width = 42
            for i in range(2, max_u + 2):
                ws.column_dimensions[get_column_letter(i)].width = 34
        except Exception:
            pass
    return bio.getvalue()


def apply_email_review_xlsx(file):
    """Upload path: an edited sheet REPLACES the contact lists (same rules as
    the grid). Returns (n_lists, n_emails, skipped)."""
    return save_contact_lists_from_grid(pd.read_excel(file, dtype=str).fillna(''))


def render_contact_lists_grid():
    """Sidebar: the invoice-email contact lists as a spreadsheet you can edit
    in place — one row per store, its people across the row. Add a row for a
    new store, type emails into the blank User columns, hit Save. Excel
    download/upload round-trips the exact same grid."""
    lists = _load_contact_lists()
    with st.expander(f"📇 Contact lists ({len(lists)} stores)"):
        st.caption("One row per store, its invoice-email recipients across the "
                   "row. Edit any cell, or use the ➕ blank row at the bottom "
                   "to add a new store/buyer. **Save** writes it to "
                   "`email_contact_lists.json` — that file is what auto-fills "
                   "the To line when you load an invoice.")

        df = contact_lists_grid_df()
        # spare blank columns so there's always room for more people
        for i in range(len(df.columns) - 1, len(df.columns) + 2):
            df[f'User {i + 1}'] = ''

        q = st.text_input("Filter stores", key="cl_grid_q",
                          placeholder="type to narrow the grid…")
        view = df
        if q.strip():
            view = df[df['Store'].str.contains(q.strip(), case=False, na=False)]
            st.caption(f"showing {len(view)} of {len(df)} — **saving while "
                       "filtered only saves the rows you can see**, so clear "
                       "the filter before saving unless that's what you want.")

        edited = st.data_editor(view, num_rows="dynamic", hide_index=True,
                                use_container_width=True, height=380,
                                key="cl_grid_editor")

        g1, g2 = st.columns(2)
        if g1.button("💾 Save lists", key="cl_grid_save",
                     use_container_width=True, type="primary"):
            to_save = edited
            if q.strip():   # merge the filtered view back over the full grid
                keep = df[~df['Store'].isin(view['Store'])]
                to_save = pd.concat([keep, edited], ignore_index=True)
            try:
                shutil.copyfile(CONTACT_LISTS_FILE, CONTACT_LISTS_FILE.replace(
                    '.json', f".backup_{datetime.now():%Y%m%d_%H%M%S}.json"))
            except Exception:
                pass
            nl, ne, skipped = save_contact_lists_from_grid(to_save.fillna(''))
            st.success(f"✅ Saved — {nl} stores, {ne} emails.")
            if skipped:
                st.caption(f"dropped {len(skipped)} row(s) with no email: "
                           + ", ".join(skipped[:5])
                           + ("…" if len(skipped) > 5 else ""))
            st.rerun()

        _xbytes = build_email_review_xlsx()
        if _xbytes:
            g2.download_button(
                "⬇️ Excel", _xbytes, "invoice_email_lists.xlsx",
                "application/vnd.openxmlformats-officedocument."
                "spreadsheetml.sheet",
                use_container_width=True, key="dl_email_review")

        _up = st.file_uploader("…or upload an edited .xlsx (replaces all lists)",
                               type=['xlsx'], key="up_email_review")
        _sig = (_up.name + str(_up.size)) if _up is not None else None
        if _up is not None and st.session_state.get('_er_done') != _sig:
            try:
                try:
                    shutil.copyfile(CONTACT_LISTS_FILE, CONTACT_LISTS_FILE.replace(
                        '.json', f".backup_{datetime.now():%Y%m%d_%H%M%S}.json"))
                except Exception:
                    pass
                nl, ne, skipped = apply_email_review_xlsx(_up)
                st.session_state['_er_done'] = _sig
                st.success(f"✅ Imported — {nl} stores, {ne} emails.")
                if skipped:
                    st.caption(f"dropped {len(skipped)} row(s) with no email: "
                               + ", ".join(skipped[:5])
                               + ("…" if len(skipped) > 5 else ""))
            except Exception as e:
                st.error(f"Couldn't read that sheet: {e}")


def _load_email_history_cache():
    if os.path.exists(EMAIL_HISTORY_CACHE_FILE):
        try:
            with open(EMAIL_HISTORY_CACHE_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {'pulled_at': None, 'contacts': []}


def _save_email_history_cache(data):
    try:
        with open(EMAIL_HISTORY_CACHE_FILE, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        st.warning(f"Could not write {EMAIL_HISTORY_CACHE_FILE}: {e}")


def fetch_email_history(sender, max_messages=400):
    """Read recent Sent Items for `sender` via Graph and tally every recipient
    (To + Cc) by how often and how recently they were emailed — the same
    signal Outlook's own auto-suggest uses. Returns (contacts, error):
    contacts is a list of {email, name, count, last_sent} sorted by count desc
    (messages come back newest-first, so the first time we see an address is
    its most recent send)."""
    token = _graph_token()
    if not token:
        return [], "Could not get a Graph access token — check tenant_id/client_id/client_secret."

    headers = {"Authorization": f"Bearer {token}"}
    url = (f"https://graph.microsoft.com/v1.0/users/{sender}/mailFolders/sentitems/messages"
           "?$top=50&$select=toRecipients,ccRecipients,sentDateTime&$orderby=sentDateTime desc")
    tally = {}   # lowercased email -> {email, name, count, last_sent}
    fetched = 0
    try:
        while url and fetched < max_messages:
            resp = _HTTP.get(url, headers=headers, timeout=30)
            if resp.status_code != 200:
                try:
                    err = resp.json().get('error', {}).get('message', resp.text)
                except Exception:
                    err = resp.text
                return [], f"Graph returned {resp.status_code}: {err}"
            data = resp.json()
            msgs = data.get('value', [])
            for m in msgs:
                sent = m.get('sentDateTime') or ''
                for r in (m.get('toRecipients') or []) + (m.get('ccRecipients') or []):
                    addr = ((r.get('emailAddress') or {}).get('address') or '').strip()
                    name = ((r.get('emailAddress') or {}).get('name') or '').strip()
                    if not addr:
                        continue
                    key = addr.lower()
                    if key not in tally:
                        tally[key] = {'email': addr, 'name': name, 'count': 0, 'last_sent': sent}
                    tally[key]['count'] += 1
            fetched += len(msgs)
            url = data.get('@odata.nextLink')
            if not msgs:
                break
    except Exception as e:
        return [], f"Request failed: {e}"

    contacts = sorted(tally.values(), key=lambda c: c['count'], reverse=True)
    return contacts, None


def fetch_graph_contacts(sender):
    """Personal address-book contacts (real names + addresses) via Graph — the
    names that make search-by-name work even when the address looks nothing
    like the person ('Dana' vs twistedgrowersaccounting@...). Needs the
    Contacts.Read application permission; degrades gracefully without it.
    Returns (contacts, error)."""
    token = _graph_token()
    if not token:
        return [], "no Graph token"
    headers = {"Authorization": f"Bearer {token}"}
    url = (f"https://graph.microsoft.com/v1.0/users/{sender}/contacts"
           "?$top=100&$select=displayName,emailAddresses")
    out = []
    try:
        while url:
            resp = _HTTP.get(url, headers=headers, timeout=30)
            if resp.status_code == 403:
                return [], ("the Azure app lacks the Contacts.Read application "
                            "permission — names come from sent mail only")
            if resp.status_code != 200:
                try:
                    err = resp.json().get('error', {}).get('message', resp.text)
                except Exception:
                    err = resp.text
                return out, f"Graph {resp.status_code}: {err}"
            data = resp.json()
            for c in data.get('value', []):
                nm = (c.get('displayName') or '').strip()
                for ea in (c.get('emailAddresses') or []):
                    ad = ((ea or {}).get('address') or '').strip()
                    if ad:
                        out.append({'email': ad, 'name': nm,
                                    'count': 0, 'last_sent': ''})
            url = data.get('@odata.nextLink')
    except Exception as e:
        return out, f"request failed: {e}"
    return out, None


# ── contact lists (this app's own — Microsoft Graph does NOT expose Outlook's
#    personal 'contact lists', so they're kept here in a JSON file and offered
#    as one-click To/Cc fills in the email panel) ──
CONTACT_LISTS_FILE = "email_contact_lists.json"


def _load_contact_lists():
    """{list_name: [{'name': ..., 'email': ...}, ...]}"""
    if os.path.exists(CONTACT_LISTS_FILE):
        try:
            # explicit utf-8: without it Windows opens this cp1252, and any
            # non-ASCII vendor name (en-dashes, accents) comes back mojibaked
            # — then a later save bakes the mangled text in for good.
            with open(CONTACT_LISTS_FILE, encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return {}


def _save_contact_lists(lists):
    try:
        with open(CONTACT_LISTS_FILE, 'w', encoding='utf-8') as f:
            json.dump(lists, f, indent=1, ensure_ascii=False)
    except Exception as e:
        st.warning(f"Could not write {CONTACT_LISTS_FILE}: {e}")


def _contact_label(c):
    """Picker label: 'Name <email>' so typing the person's NAME finds them.
    Falls back to the bare address when no name is known."""
    email = (c.get('email') or '').strip()
    name = (c.get('name') or '').strip()
    if name and name.lower() != email.lower():
        return f"{name} <{email}>"
    return email


def _label_to_email(label):
    """Pull the address back out of a picker label (or a hand-typed entry)."""
    m = re.search(r'<([^<>@\s]+@[^<>\s]+)>', label or '')
    if m:
        return m.group(1).strip()
    s = (label or '').strip(' \t,;')
    return s if '@' in s else ''


def _add_list_to_box(list_name, box_key):
    """on_click: append every member of a contact list to a recipient box
    (session-state mutation happens in the callback, BEFORE widgets render —
    the only safe way to change a live multiselect)."""
    members = _load_contact_lists().get(list_name) or []
    cur = list(st.session_state.get(box_key) or [])
    have = {(_label_to_email(x) or x).lower() for x in cur}
    for m in members:
        em = (m.get('email') or '').strip()
        if em and em.lower() not in have:
            cur.append(_contact_label(m))
            have.add(em.lower())
    st.session_state[box_key] = cur


def _add_selected_list_to(box_key):
    name = st.session_state.get('inv_list_use')
    if name:
        _add_list_to_box(name, box_key)


def _cl_norm_words(s):
    """Store-name words that matter for matching a buyer to a contact list."""
    s = re.sub(r'[^a-z0-9\s]', ' ', (s or '').lower())
    drop = {'llc', 'inc', 'co', 'corp', 'ltd', 'company', 'the', 'of', 'and',
            'invoices', 'invoice', 'orders', 'cannabis', 'ma'}
    return [w for w in s.split() if w and w not in drop]


def _match_contact_list(lists, buyer_name='', ship_name='', ship_city='',
                        extra_name=''):
    """Pick the contact list that best matches the buyer/ship-to. The buyer and
    store NAMES drive the match; the ship CITY only breaks ties between lists
    that already matched a name ('Smyth - Lowell' beats 'Smyth - Framingham'
    when shipping to Lowell). The city can never carry a match by itself —
    'Cannabis of Worcester' must not swallow every buyer whose store happens
    to sit in Worcester. difflib backstops spelling drift ('Volkan' list vs
    'Volcann LLC' buyer). Returns a list name or None."""
    import difflib
    name_hints = [buyer_name, ship_name, extra_name]
    name_words = set()
    for h in name_hints:
        name_words.update(_cl_norm_words(h))
    city_words = set(_cl_norm_words(ship_city)) - name_words
    if not name_words or not lists:
        return None
    best, best_key = None, (0.0, 0.0)
    for name in lists:
        lw = set(_cl_norm_words(name))
        core = lw - city_words
        if not core:
            continue
        score = len(core & name_words) / len(core)
        if score < 1.0:
            base = ' '.join(sorted(core))
            for h in name_hints:
                hw = ' '.join(sorted(_cl_norm_words(h)))
                if hw:
                    score = max(score, difflib.SequenceMatcher(
                        None, base, hw).ratio())
        key = (score, len(lw & city_words) / len(lw))
        if key > best_key:
            best, best_key = name, key
    return best if best_key[0] >= 0.6 else None


def _on_list_change():
    """Contact-list dropdown changed → swap that list's people into To: remove
    the previously applied list's members, add the new list's. Manually added
    addresses are left alone."""
    new = st.session_state.get('inv_list_use')
    old = st.session_state.get('_applied_list')
    box_key = st.session_state.get('_inv_to_box_key', 'inv_to_box_0')
    lists = _load_contact_lists()
    cur = list(st.session_state.get(box_key) or [])
    if old and old != new:
        old_emails = {(m.get('email') or '').lower() for m in (lists.get(old) or [])}
        cur = [x for x in cur if (_label_to_email(x) or x).lower() not in old_emails]
    have = {(_label_to_email(x) or x).lower() for x in cur}
    for m in (lists.get(new) or []):
        em = (m.get('email') or '').strip()
        if em and em.lower() not in have:
            cur.append(_contact_label(m))
            have.add(em.lower())
    st.session_state[box_key] = cur
    st.session_state['_applied_list'] = new


def render_recipient_picker(label, list_key, contacts, box_key):
    """Recipient picker on Streamlit's NATIVE multiselect (accept_new_options).
    Options are 'Name <email>' so the native filter matches people by NAME as
    well as by address. The widget key itself is the single source of truth:
    the old default= + session-write combo made Streamlit re-seed the widget
    whenever the option list shifted, which is what randomly dropped chips
    mid-click. Returns the picked plain email addresses."""
    email_to_label = {}
    for c in contacts:
        em = (c.get('email') or '').strip()
        if em and em.lower() not in email_to_label:
            email_to_label[em.lower()] = _contact_label(c)

    # One-time seed: carry anything staged in list_key (e.g. the buyer's
    # default address) into the widget as proper labels. After this, the
    # widget key rules — no default= on reruns, so nothing gets re-seeded.
    if box_key not in st.session_state:
        seeded = []
        for e in st.session_state.get(list_key) or []:
            em = (_label_to_email(e) or e).strip()
            if em:
                seeded.append(email_to_label.get(em.lower(), em))
        st.session_state[box_key] = seeded

    current = [x for x in (st.session_state.get(box_key) or []) if x]
    options = sorted(set(email_to_label.values()) | set(current), key=str.lower)
    picked = st.multiselect(
        label, options=options, key=box_key,
        accept_new_options=True,
        placeholder="Type a name or email…",
        help="Type a NAME or address to filter; type a full new address to add "
             "someone outside your history. Click a chip's x to remove.")
    emails, seen = [], set()
    for p in picked:
        em = _label_to_email(p)
        if em and em.lower() not in seen:
            emails.append(em)
            seen.add(em.lower())
    st.session_state[list_key] = emails
    return emails


def render_email_history_refresh(sender):
    """Compact 'pull sent-mail history' control — same refresh-button pattern
    as the other Apex/METRC caches in this app."""
    cache = _load_email_history_cache()
    contacts = cache.get('contacts') or []
    c1, c2 = st.columns([4, 1])
    with c1:
        n = len(contacts)
        pulled = cache.get('pulled_at')
        st.caption(f"📇 {n} people from sent-mail history"
                  + (f" · pulled {pulled}" if pulled else " · not pulled yet — click refresh"))
    with c2:
        if st.button("🔄", key="refresh_email_history",
                     help="Read Sent Items + address book and refresh "
                          "recipient suggestions"):
            with st.spinner("Reading sent mail…"):
                fresh, err = fetch_email_history(sender)
            if err:
                st.error(err)
            else:
                # Merge in the address book so contacts carry their REAL names
                # (search 'dana' even when the address says 'twistedgrowers...').
                with st.spinner("Reading address book…"):
                    abook, aerr = fetch_graph_contacts(sender)
                if abook:
                    by = {c['email'].lower(): c for c in fresh}
                    for c in abook:
                        k = c['email'].lower()
                        if k in by:
                            if c['name']:
                                by[k]['name'] = c['name']
                        else:
                            by[k] = c
                    fresh = sorted(by.values(), key=lambda c: c['count'],
                                   reverse=True)
                elif aerr:
                    st.caption(f"📇 address book skipped — {aerr}")
                _save_email_history_cache({
                    'pulled_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    'contacts': fresh})
                st.success(f"Found {len(fresh)} recipients.")
                contacts = fresh   # use the just-fetched list immediately, not the
                                   # stale `cache` read before this button was clicked
    return contacts


def _default_email_body():
    """Standard invoice email body. Greeting follows the clock: 'Good morning'
    12:00am–11:59am, 'Good afternoon' 12:00pm–11:59pm."""
    greeting = "Good morning" if datetime.now().hour < 12 else "Good afternoon"
    return (f"{greeting},\n\n"
            "I hope all is well, and appreciate the order! Attached you'll find "
            "invoice w/downloadable COA's. If any assistance is needed please "
            "feel free to reach out anytime.\n\n"
            "Thanks,")


def _ensure_invoice_email_blob(order, inv):
    """Build (or reuse) the invoice attachment — the EXACT same bytes Send
    attaches, so the preview is trustworthy."""
    blob = st.session_state.get('inv_pdf_blob')
    if blob:
        return blob
    sess = st.session_state.get('bapi_session') or {}
    oid = order.get('id') or st.session_state.get('apex_order_id')
    with st.spinner("Building invoice…"):
        src_order = {}
        if _session_ready(sess):
            src_order = bapi_fetch_invoice(sess, oid, log=[]) or {}
        if not src_order:
            v1_order, _m = fetch_invoice_order(oid)
            src_order = v1_order or order
        data, ext, mime, src_label = build_best_invoice_file(src_order)
    safe = re.sub(r'[^A-Za-z0-9._-]', '_', inv) or "invoice"
    blob = {'data': data, 'name': f"{safe}{ext}", 'mime': mime, 'src': src_label}
    st.session_state['inv_pdf_blob'] = blob
    return blob


@st.fragment
def render_invoice_email():
    """'Email Invoice' — sends the already-built invoice PDF (from
    render_invoice_download's blob, building it fresh if needed) as an
    attachment via the configured Outlook/Graph mailbox.
    (st.fragment: recipient picking, history refresh, and Send rerun only this
    panel — the app's other panels don't re-render on every interaction here.)"""
    if not _invoice_loaded():
        return
    ALWAYS_TO_EMAIL = "twistedgrowersaccting@gmail.com"
    tenant_id, client_id, client_secret, sender = _graph_creds()
    if not (tenant_id and client_id and client_secret and sender):
        st.info("📧 Email sending needs [graph] credentials in "
               ".streamlit/secrets.toml (tenant_id, client_id, client_secret, "
               "sender_email) — see the Azure app registration setup.")
        return

    order = st.session_state.get('apex_order_raw') or {}
    oid = order.get('id') or st.session_state.get('apex_order_id')
    inv = str(st.session_state.get('selected_invoice', '') or order.get('id') or '')
    default_to = order.get('buyer_contact_email') or ''
    if not default_to:
        b = order.get('buyer') or {}
        c0 = (b.get('contacts') or [{}])[0] if b.get('contacts') else {}
        default_to = c0.get('email') or ''

    clists = _load_contact_lists()

    # New invoice loaded → reset the email panel for THIS order and auto-match
    # the buyer's contact list. (Without this, the previous invoice's
    # recipients/subject silently carried over.)
    if st.session_state.get('_email_for_order') != oid:
        st.session_state['_email_for_order'] = oid
        buyer_o = order.get('buyer') or {}
        matched = _match_contact_list(
            clists,
            buyer_o.get('name', '') if isinstance(buyer_o, dict) else '',
            order.get('ship_name', ''), order.get('ship_city', ''),
            st.session_state.get('buyer_name', ''))
        st.session_state['_matched_list'] = matched
        st.session_state['_applied_list'] = matched
        if matched:
            emails, seen = [], set()
            if default_to:
                emails.append(default_to)
                seen.add(default_to.lower())
            for m in (clists.get(matched) or []):
                em = (m.get('email') or '').strip()
                if em and em.lower() not in seen:
                    emails.append(em)
                    seen.add(em.lower())
            if ALWAYS_TO_EMAIL.lower() not in seen:
                emails.append(ALWAYS_TO_EMAIL)
            st.session_state['inv_to_recipients'] = emails
            st.session_state['inv_list_use'] = matched
        else:
            # No contact list for this buyer — add it in the Contact lists grid.
            emails = [default_to] if default_to else []
            seen = {e.lower() for e in emails}
            if ALWAYS_TO_EMAIL.lower() not in seen:
                emails.append(ALWAYS_TO_EMAIL)
            st.session_state['inv_to_recipients'] = emails
            st.session_state.pop('inv_list_use', None)
        st.session_state['inv_cc_recipients'] = []
        # Versioned widget keys: bumping the nonce mints BRAND-NEW subject/
        # body/To/Cc widgets, so they always come up with their defaults for
        # the new invoice. (Popping the old keys alone is unreliable —
        # Streamlit can resurrect a live widget's previous value.)
        st.session_state['_email_nonce'] = st.session_state.get('_email_nonce', 0) + 1
        for k in ('inv_email_preview',):
            st.session_state.pop(k, None)

    _nonce = st.session_state.get('_email_nonce', 0)
    _to_key, _cc_key = f"inv_to_box_{_nonce}", f"inv_cc_box_{_nonce}"
    st.session_state['_inv_to_box_key'] = _to_key   # for the list-swap callback

    with st.expander("📧 Email Invoice", expanded=False):
        contacts = render_email_history_refresh(sender)

        # Fold contact-list members into the name pool so their chips show
        # names and they're findable by name in the pickers.
        _by_email = {(c.get('email') or '').lower(): c
                     for c in contacts if c.get('email')}
        for _ln, _mem in clists.items():
            for m in _mem:
                k = (m.get('email') or '').lower()
                if not k:
                    continue
                if k not in _by_email:
                    _by_email[k] = {'email': m['email'],
                                    'name': m.get('name', ''), 'count': 0}
                elif not _by_email[k].get('name') and m.get('name'):
                    _by_email[k]['name'] = m['name']
        contacts = list(_by_email.values())

        # ── Contact lists: auto-matched to the buyer; pick another to swap ──
        lc1, lc2, lc3, lc4 = st.columns([2.2, 0.7, 0.7, 1.0])
        with lc1:
            if clists:
                st.selectbox("📇 Contact list", sorted(clists.keys(), key=str.lower),
                             key="inv_list_use", on_change=_on_list_change,
                             help="Auto-matched to this invoice's buyer. Picking a "
                                  "different list swaps its people into To "
                                  "(manually added addresses stay).")
                _m = st.session_state.get('_matched_list')
                if _m and st.session_state.get('inv_list_use') == _m:
                    st.caption(f"🎯 auto-matched to buyer "
                               f"“{st.session_state.get('buyer_name', '')}”")
                elif _m:
                    st.caption(f"✏️ changed (auto-match was “{_m}”)")
                else:
                    st.caption("⚠️ no list auto-matched this buyer — pick one, "
                               "or add a row for it in the Contact lists grid "
                               "(sidebar).")
            else:
                st.caption("📇 No contact lists yet — create one under "
                           "**Manage lists** (Outlook's own contact lists aren't "
                           "readable via the Graph API, so they live here).")
        with lc2:
            st.markdown("<div style='height:1.75rem'></div>", unsafe_allow_html=True)
            st.button("→ To", key="inv_list_to", use_container_width=True,
                      disabled=not clists,
                      on_click=_add_selected_list_to, args=(_to_key,))
        with lc3:
            st.markdown("<div style='height:1.75rem'></div>", unsafe_allow_html=True)
            st.button("→ Cc", key="inv_list_cc", use_container_width=True,
                      disabled=not clists,
                      on_click=_add_selected_list_to, args=(_cc_key,))
        with lc4:
            st.markdown("<div style='height:1.75rem'></div>", unsafe_allow_html=True)
            with st.popover("⚙️ Manage lists", use_container_width=True):
                names = sorted(clists.keys(), key=str.lower)
                sel = st.selectbox("List", ["(new list)"] + names, key="cl_pick")
                editing = None if sel == "(new list)" else sel
                name_val = st.text_input("List name", value=editing or "",
                                         key=f"cl_name_{sel}",
                                         placeholder="e.g. Fine Fettle Rowley")
                all_opts = sorted({_contact_label(c) for c in contacts
                                   if c.get('email')}, key=str.lower)
                cur_members = [_contact_label(m) for m in (clists.get(editing) or [])]
                opts = sorted(set(all_opts) | set(cur_members), key=str.lower)
                mem = st.multiselect("Members", opts, default=cur_members,
                                     key=f"cl_mem_{sel}", accept_new_options=True,
                                     placeholder="Type a name or email…")
                mb1, mb2 = st.columns(2)
                if mb1.button("💾 Save list", key=f"cl_save_{sel}",
                              use_container_width=True,
                              disabled=not name_val.strip() or not mem):
                    members = []
                    for lbl in mem:
                        em = _label_to_email(lbl)
                        if not em:
                            continue
                        nm = lbl.split('<')[0].strip() if '<' in lbl else ''
                        members.append({'name': nm, 'email': em})
                    if editing and editing != name_val.strip():
                        clists.pop(editing, None)
                    clists[name_val.strip()] = members
                    _save_contact_lists(clists)
                    st.rerun(scope="fragment")
                if editing and mb2.button("🗑️ Delete", key=f"cl_del_{sel}",
                                          use_container_width=True):
                    clists.pop(editing, None)
                    _save_contact_lists(clists)
                    st.rerun(scope="fragment")

        to_addrs = render_recipient_picker("To", "inv_to_recipients", contacts, _to_key)
        cc_addrs = render_recipient_picker("Cc (optional)", "inv_cc_recipients", contacts, _cc_key)

        # ── Exactly who this email goes to, with the list each address is from ──
        if to_addrs or cc_addrs:
            _name_of = {(c.get('email') or '').lower(): (c.get('name') or '')
                        for c in contacts}
            _sel_list = st.session_state.get('inv_list_use')

            def _list_tag(email):
                el = email.lower()
                tags = [ln for ln, mem in clists.items()
                        if any((m.get('email') or '').lower() == el for m in mem)]
                if _sel_list in tags:
                    return _sel_list
                if tags:
                    return tags[0]
                return "(buyer contact)" if el == (default_to or '').lower() else "(added by hand)"

            _rows = []
            for _grp, _addrs in (("To", to_addrs), ("Cc", cc_addrs)):
                for a in _addrs:
                    _rows.append({'': _grp,
                                  'Name': _name_of.get(a.lower(), '') or '—',
                                  'Email': a,
                                  'List': _list_tag(a)})
            st.markdown(f"**📤 Sending to {len(to_addrs)} "
                        f"(+{len(cc_addrs)} Cc):**")
            st.dataframe(pd.DataFrame(_rows), use_container_width=True,
                         hide_index=True,
                         height=min(38 + 35 * len(_rows), 320))

        subject = st.text_input("Subject",
                                value=(f"Twisted Growers invoice: ({inv})" if inv
                                       else "Twisted Growers invoice"),
                                key=f"inv_email_subject_{_nonce}")
        body = st.text_area("Message", value=_default_email_body(),
                            key=f"inv_email_body_{_nonce}", height=170)

        # ── Attachment preview — the exact bytes that will be attached ──
        if st.toggle("👁️ Preview attachment", key="inv_email_preview",
                     help="Builds the invoice now (if needed) and shows the exact "
                          "file Send will attach, so you can check it first."):
            blob = _ensure_invoice_email_blob(order, inv)
            st.caption(f"📎 {blob['name']} · {len(blob['data'])/1024:.0f} KB · "
                       f"{blob.get('src', '')}")
            if blob.get('mime') == 'application/pdf':
                _b64 = base64.b64encode(blob['data']).decode()
                st.markdown(
                    f'<iframe src="data:application/pdf;base64,{_b64}" '
                    'width="100%" height="540" '
                    'style="border:1px solid #444;border-radius:8px;"></iframe>',
                    unsafe_allow_html=True)
            else:
                import streamlit.components.v1 as _components
                _components.html(blob['data'].decode('utf-8', 'replace'),
                                 height=540, scrolling=True)
            st.download_button("⬇️ Open / save the attachment", blob['data'],
                               blob['name'], blob.get('mime', 'application/pdf'),
                               use_container_width=True, key="inv_email_prev_dl")

        # ── Schedule send (optional) — Exchange-native deferred delivery: the
        #    server holds the message and releases it at the chosen time, like
        #    Outlook's own 'Schedule send'. PC/app can be closed after clicking.
        send_at_utc = None
        if st.toggle("🕑 Schedule send", key="inv_email_sched",
                     help="Pick a future date & time — Exchange sends it then, "
                          "even with this app and your PC off."):
            sc1, sc2 = st.columns(2)
            with sc1:
                sched_date = st.date_input("Send date", key="inv_email_sched_date",
                                           value=datetime.now().date())
            with sc2:
                sched_time = st.time_input("Send time (your local time)",
                                           key="inv_email_sched_time",
                                           value=dtime(hour=9, minute=0))
            local_dt = datetime.combine(sched_date, sched_time)
            send_at_utc = local_dt.astimezone(timezone.utc)
            if local_dt <= datetime.now():
                st.warning("That time is in the past — it would send immediately.")
            else:
                st.caption(f"Will send **{local_dt.strftime('%b %d, %Y at %I:%M %p')}** "
                           "(your local time). You can close everything after clicking.")

        send_label = ("🕑 Schedule Invoice Email" if send_at_utc else
                      "✉️ Send Invoice Email")
        if st.button(send_label, use_container_width=True, key="inv_email_send"):
            blob = _ensure_invoice_email_blob(order, inv)

            with st.spinner("Scheduling…" if send_at_utc else "Sending…"):
                ok, msg = send_invoice_email(
                    to_addrs, subject, body, blob['data'], blob['name'],
                    blob.get('mime', 'application/pdf'), cc_addrs,
                    send_at_utc=send_at_utc)
            if ok:
                st.success(f"✅ {msg}")
            else:
                st.error(f"❌ {msg}")


def _om_recalc_due():
    """Terms or delivery date changed → auto-populate the due date (COD = same day,
    Net N = +N days, 'See notes' leaves it alone)."""
    t = st.session_state.get('om_terms')
    days = NET_TERMS_DAYS.get(t)
    if days is None:
        return
    base = st.session_state.get('om_delivery') or datetime.now().date()
    st.session_state['om_due'] = base + timedelta(days=days)


def _om_delivery_today():
    """Quick button: stage today's date as the delivery date (due date follows
    the selected terms)."""
    st.session_state['om_delivery'] = datetime.now().date()
    _om_recalc_due()


def _om_set_terms(term):
    """Quick button: stage a payment term (COD / Net 30) — due date follows."""
    st.session_state['om_terms'] = term
    _om_recalc_due()


def render_order_meta_editor():
    """Edit Payment terms / Delivery date / Due date / deal-flow Stage on the loaded
    order and save them to Apex. Due date auto-populates from the selected terms."""
    order = st.session_state.get('apex_order_raw') or {}
    if not order:
        return
    oid = order.get('id') or st.session_state.get('apex_order_id')
    _learn_net_terms_from_order(order)           # harvest term name → id (ground truth)
    _learn_net_terms_from_order(st.session_state.get('_om_df_src'))

    # Seed the widgets once per loaded order (not every rerun).
    if st.session_state.get('_om_for_order') != oid:
        st.session_state['_om_for_order'] = oid

        def _d(v):
            try:
                return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
            except Exception:
                return None
        st.session_state['om_delivery'] = (_d(order.get('delivery_date'))
                                           or _d(order.get('order_date'))
                                           or datetime.now().date())
        st.session_state['om_due'] = (_d(order.get('due_date'))
                                      or st.session_state['om_delivery'])
        cur_term = ((order.get('term') or {}).get('name')
                    if isinstance(order.get('term'), dict) else order.get('term'))
        if cur_term in NET_TERMS_CHOICES:
            st.session_state['om_terms'] = cur_term
        elif not cur_term and not order.get('net_terms_id'):
            st.session_state['om_terms'] = "(none)"   # order has no terms set
        else:
            st.session_state['om_terms'] = "See notes"

    # Deal-flow stages: prefer what the order carries; else one b-api read.
    statuses = ((order.get('deal_flow') or {}).get('order_statuses')) or []
    if not statuses:
        src = st.session_state.get('_om_df_src')
        if src is None and _session_ready(st.session_state.get('bapi_session') or {}):
            src = bapi_get_order(st.session_state.get('bapi_session') or {},
                                 order.get('uuid')) or {}
            st.session_state['_om_df_src'] = src
        statuses = (((src or {}).get('deal_flow') or {}).get('order_statuses')) or []
    statuses = sorted([s for s in statuses if not s.get('archived')],
                      key=lambda s: s.get('position', 0))
    cur_sid = order.get('order_status_id') or (order.get('order_status') or {}).get('id')

    def _term_name_for_id(tid):
        """Display name for a net_terms_id: fetched list first, then the learned
        map (prettified via the dropdown labels)."""
        if tid is None:
            return None
        for t in (st.session_state.get('_net_terms_list') or []):
            if t.get('id') == tid:
                return t['name']
        rev = {v: k for k, v in _learned_net_terms().items()}
        k = rev.get(tid)
        if k:
            for c in NET_TERMS_CHOICES:
                if _term_key(c) == k:
                    return c
            return k
        return f"terms id {tid}"

    with st.expander("📝 Order details — terms · dates · stage", expanded=False):
        # ── Currently ACTIVE on the Apex order (live, read-only) — refreshed
        #    after every save. New orders show — where nothing is set yet. ──
        live = st.session_state.get('apex_order_raw') or order
        lt = live.get('term')
        cur_term_name = (lt.get('name') if isinstance(lt, dict) else lt) \
            or _term_name_for_id(live.get('net_terms_id'))
        cur_deliv = str(live.get('delivery_date') or '')[:10]
        cur_due = str(live.get('due_date') or '')[:10]
        live_sid = live.get('order_status_id') or (live.get('order_status') or {}).get('id')
        cur_stage = ((live.get('order_status') or {}).get('name')
                     or next((s['name'] for s in statuses if s['id'] == live_sid), None))
        i1, i2, i3, i4 = st.columns(4)
        i1.metric("Terms on invoice", cur_term_name or "—")
        i2.metric("Delivery posted", cur_deliv or "—")
        i3.metric("Due date posted", cur_due or "—")
        i4.metric("Stage", cur_stage or "—")
        st.caption("👆 what's live on the Apex order right now — the fields below "
                   "stage your changes until you hit Save.")
        st.markdown("---")

        # One-click stagers — they fill the fields below; Save posts to Apex.
        # (✅ Delivered is the exception: it SAVES the stage immediately.)
        q1, q2, q3, q4 = st.columns(4)
        q1.button("🚚 Delivery = today", key="om_q_today", use_container_width=True,
                  on_click=_om_delivery_today,
                  help="Sets the delivery date below to today — hit Save to post it.")
        q2.button("💵 COD", key="om_q_cod", use_container_width=True,
                  on_click=_om_set_terms, args=("COD",),
                  help="Sets payment terms to COD (due date = delivery day).")
        q3.button("🗓️ Net 30", key="om_q_net30", use_container_width=True,
                  on_click=_om_set_terms, args=("Net 30",),
                  help="Sets payment terms to Net 30 (due = delivery + 30 days).")
        _deliv_s = next((s for s in statuses
                         if 'deliver' in str(s.get('name', '')).lower()), None)
        if q4.button("✅ Delivered", key="om_q_delivered", use_container_width=True,
                     disabled=_deliv_s is None,
                     help=("Sets the order stage to 'Delivered' and saves to "
                           "Apex NOW — no separate Save needed." if _deliv_s
                           else "No 'Delivered' stage exists in this order's "
                                "deal flow.")):
            sess = st.session_state.get('bapi_session') or {}
            log = []
            with st.spinner("Marking Delivered in Apex…"):
                ok, fresh = bapi_update_order_fields(
                    sess, order, {'order_status_id': _deliv_s['id']}, log)
                fresh = fresh or {}
                if not fresh and _session_ready(sess):
                    fresh = bapi_get_order(sess, order.get('uuid'), log) or {}
            stuck = bool(fresh) and (
                fresh.get('order_status_id') == _deliv_s['id']
                or ((fresh.get('order_status') or {}).get('id') == _deliv_s['id']))
            st.session_state['apex_push_log'] = (
                (st.session_state.get('apex_push_log') or []) + log)
            if ok and (stuck or not fresh):
                if fresh:
                    st.session_state['apex_order_raw'] = fresh
                st.session_state['order_status_name'] = _deliv_s['name']
                st.session_state['om_stage'] = _deliv_s['name']
                _qty_verdict('success',
                             f"✅ Stage set to {_deliv_s['name']} — saved to Apex.")
                st.rerun()
            else:
                st.error("❌ Delivered didn't stick — see the Apex update log.")

        c1, c2, c3 = st.columns(3)
        with c1:
            st.selectbox("Payment terms", NET_TERMS_CHOICES, key="om_terms",
                         on_change=_om_recalc_due,
                         help="Picking a term auto-fills the payment due date "
                              "(COD = delivery day, Net N = +N days).")
        with c2:
            st.date_input("Delivery date", key="om_delivery",
                          on_change=_om_recalc_due)
        with c3:
            st.date_input("Payment due date", key="om_due",
                          help="Auto-populated from the terms — override freely.")

        if statuses:
            labels = [f"{s['name']}" for s in statuses]
            ids = [s['id'] for s in statuses]
            try:
                cur_idx = ids.index(cur_sid)
            except ValueError:
                cur_idx = 0
            pick = st.selectbox("Stage (deal flow / order status)", labels,
                                index=cur_idx, key="om_stage")
            pick_sid = ids[labels.index(pick)]
        else:
            st.caption("Deal-flow stages unavailable (order read has no deal_flow) — "
                       "stage can't be edited right now.")
            pick_sid = None

        if st.button("💾 Save order details to Apex", type="primary",
                     use_container_width=True, key="om_save"):
            # Full-field saves (terms/dates) ride the confirmed b-api route, which
            # needs the browser session. Without one, the v1 bearer fallback still
            # saves the STAGE (the only field the documented API updates) and the
            # verify step reports anything that was dropped.
            sess = st.session_state.get('bapi_session') or {}
            log = []
            updates = {
                'delivery_date': st.session_state['om_delivery'].strftime("%Y-%m-%d"),
                'due_date': st.session_state['om_due'].strftime("%Y-%m-%d"),
            }
            if pick_sid is not None and pick_sid != cur_sid:
                updates['order_status_id'] = pick_sid
            # "See notes" is a REAL Apex term for this company (id 332 from the
            # documented list endpoint) — resolve it like any other. "(none)" clears
            # the terms with net_terms_id: null — exactly what Apex's own UI sends.
            term_name = st.session_state.get('om_terms')
            if term_name == "(none)":
                updates['net_terms_id'] = None
                log.append({'step': 'NET-TERMS',
                            'note': "clearing terms (net_terms_id → null)"})
            elif term_name:
                # Learned map first — INSTANT, no network. The list endpoint is only
                # hit for a term the map has never seen (once; result is merged in).
                tid = _match_net_terms_id(term_name, [])
                if tid is None:
                    tid = _match_net_terms_id(term_name,
                                              bapi_list_net_terms(sess, log))
                if tid is not None:
                    updates['net_terms_id'] = tid
                    log.append({'step': 'NET-TERMS',
                                'note': f"resolved '{term_name}' → net_terms_id {tid}"})
                else:
                    updates['net_terms'] = term_name   # best guess — response will tell
                    log.append({'step': 'NET-TERMS',
                                'note': (f"couldn't resolve an id for '{term_name}' — "
                                         "sent the name instead. To teach it the id: "
                                         "set these terms on any order in the Apex UI "
                                         "once, then reload that invoice here — the "
                                         "id is learned automatically from the order "
                                         "read (Net 7=1 is already known).")})

            # ── Diff against the live order — Apex's own UI PATCHes only the field
            #    that changed, so mirror that: drop anything already matching. ──
            live_now = st.session_state.get('apex_order_raw') or order
            if updates.get('delivery_date') == str(live_now.get('delivery_date') or '')[:10]:
                updates.pop('delivery_date', None)
            if updates.get('due_date') == str(live_now.get('due_date') or '')[:10]:
                updates.pop('due_date', None)
            if ('net_terms_id' in updates
                    and updates['net_terms_id'] == live_now.get('net_terms_id')):
                updates.pop('net_terms_id', None)
            if not updates:
                st.info("No changes — everything already matches what's on the invoice.")
                st.session_state['apex_push_log'] = (
                    (st.session_state.get('apex_push_log') or []) + log)
                return

            with st.spinner("Saving to Apex…"):
                ok, fresh = bapi_update_order_fields(sess, order, updates, log)

                # ── VERIFY — the PATCH response echoes the full updated order, so
                #    normally NO extra round-trip is needed. Re-read only if the
                #    echo was missing (a 200 can still silently ignore fields,
                #    which is exactly how terms were "not working"). ──
                fresh = fresh or {}
                if not fresh:
                    if _session_ready(sess):
                        fresh = bapi_get_order(sess, order.get('uuid'), log) or {}
                    if not fresh:
                        # bearer read — always available, carries the same fields
                        v1o, _vm = fetch_invoice_order(oid)
                        fresh = v1o or {}
                problems = []
                if fresh:
                    _learn_net_terms_from_order(fresh)
                    if ('net_terms_id' in updates
                            and fresh.get('net_terms_id') != updates['net_terms_id']):
                        problems.append('terms')
                    elif 'net_terms_id' in updates:
                        # id stuck — also check the NAME, so a wrong inferred id
                        # (map guess) can't silently set the wrong terms.
                        ft = fresh.get('term')
                        fname = ft.get('name') if isinstance(ft, dict) else None
                        if fname and _term_key(fname) != _term_key(term_name):
                            problems.append(f"terms (Apex shows '{fname}', "
                                            f"not '{term_name}' — the learned id map "
                                            "was wrong; it has been corrected, save again)")
                    if ('order_status_id' in updates
                            and fresh.get('order_status_id') != updates['order_status_id']):
                        problems.append('stage')
                    if ('delivery_date' in updates and
                            str(fresh.get('delivery_date') or '')[:10] != updates['delivery_date']):
                        problems.append('delivery date')
                    if ('due_date' in updates and
                            str(fresh.get('due_date') or '')[:10] != updates['due_date']):
                        problems.append('due date')
                    log.append({'step': 'VERIFY',
                                'note': ("✅ live order re-read — every field stuck"
                                         if not problems else
                                         "❌ live order re-read — did NOT stick: "
                                         + ", ".join(problems))})

                    # Dates/terms not sticking almost always means the save fell
                    # through to the v1 bearer route, which per the API docs only
                    # applies order_status_id. The full-field route needs the
                    # browser session — say so plainly.
                    if problems and not _session_ready(sess):
                        log.append({'step': 'VERIFY',
                                    'note': ("fields were dropped because no browser "
                                             "session is loaded — the v1 bearer API "
                                             "only updates the stage. Grab the Apex "
                                             "session in the sidebar and save again.")})
                    if fresh:
                        st.session_state['apex_order_raw'] = fresh
                        order = fresh
                else:
                    log.append({'step': 'VERIFY',
                                'note': "couldn't re-read the order to verify"})

            st.session_state['apex_push_log'] = (st.session_state.get('apex_push_log') or []) + log
            if ok and not problems:
                if pick_sid is not None:
                    ns = next((s for s in statuses if s['id'] == pick_sid), None)
                    if ns:
                        st.session_state['order_status_name'] = ns['name']
                _qty_verdict('success', "✅ Order details saved to Apex — verified "
                                        "on the live order.")
                st.rerun()   # repaint NOW so the live strip shows the new values
                             # (it drew before the save ran in this pass)
            elif ok:
                st.error("❌ Apex accepted the request but these did NOT stick: "
                         + ", ".join(problems) + ". Open the Apex update log below — "
                         "then make this exact edit once in the Apex UI with DevTools "
                         "open and paste the request so I can lock the real route in.")
            else:
                st.error("❌ Save didn't land — open the Apex update log below; every "
                         "route tried is in there with Apex's response.")


def render_payments_editor():
    """Add a Payment / Credit / Write-Off / Trade to the loaded order — the same
    records Apex's 'Add Payment' modal creates (amount · accounting method · payment
    type · date · memo), with quick-Apply buttons for Total / Outstanding / Credit."""
    order = st.session_state.get('apex_order_raw') or {}
    if not order:
        return
    oid = order.get('id') or st.session_state.get('apex_order_id')
    total = _order_money(order, 'total')
    due = _order_due(order)
    if due is None:
        # local copy doesn't carry money fields — one fresh bearer read fixes it
        v1o, _m = fetch_invoice_order(order.get('id')
                                      or st.session_state.get('apex_order_id'))
        if v1o:
            order = v1o
            st.session_state['apex_order_raw'] = v1o
            total = _order_money(order, 'total') or total
            due = _order_due(order)
    _bc0 = (order.get('buyer') or {}).get('credit_total')   # always integer cents
    credit = (float(_bc0) / 100.0) if isinstance(_bc0, (int, float)) else None
    if credit is None:
        credit = _order_money(order, 'total_credits')

    buyer = order.get('buyer') or {}
    buyer_id = buyer.get('id') or order.get('buyer_id')
    # buyer.credit_total is ALWAYS integer cents (100000 = $1,000.00), regardless of
    # order shape — don't route it through _order_money (which only divides for
    # b-api-shaped dicts, and a buyer sub-dict never looks like one → 100x too big).
    _bc = buyer.get('credit_total')
    buyer_credit = (float(_bc) / 100.0) if isinstance(_bc, (int, float)) else None

    with st.expander("💵 Payments & credits", expanded=False):
        # ── Buyer's stored credit (wallet) — live, with add/subtract ──────────
        cc1, cc2 = st.columns([1.4, 2.6])
        cc1.metric("Buyer's current credit",
                   f"${buyer_credit:,.2f}" if buyer_credit is not None else "—")
        with cc2:
            ca1, ca2 = st.columns([1, 1.3])
            adj = ca1.number_input(
                "Adjust credit ($)", key="bc_adjust", step=1.0, format="%.2f",
                help="Positive ADDS to the buyer's stored credit, negative SUBTRACTS "
                     "it. This changes the buyer's wallet balance directly — separate "
                     "from applying a credit to this order.")
            ca2.markdown("<div style='height:1.75rem'></div>", unsafe_allow_html=True)
            if ca2.button(
                    (f"Add ${adj:,.2f}" if adj > 0 else
                     f"Subtract ${abs(adj):,.2f}" if adj < 0 else "Adjust credit"),
                    key="bc_adjust_go", use_container_width=True,
                    disabled=not adj or not buyer_id):
                sess = st.session_state.get('bapi_session') or {}
                if not _session_ready(sess):
                    st.error("No Apex browser session — grab it in the sidebar first.")
                else:
                    log = []
                    msg = st.session_state.get('bc_msg') or (
                        "Manual credit adjustment")
                    with st.spinner("Adjusting buyer credit in Apex…"):
                        ok_bc = bapi_adjust_buyer_credit(sess, buyer_id, adj, msg, log)
                        if ok_bc:
                            fresh = bapi_fetch_invoice(sess, oid, log=log) or {}
                            if fresh.get('id'):
                                st.session_state['apex_order_raw'] = fresh
                    st.session_state['apex_push_log'] = (
                        (st.session_state.get('apex_push_log') or []) + log)
                    if ok_bc:
                        verb = "added to" if adj > 0 else "subtracted from"
                        _qty_verdict('success', f"✅ ${abs(adj):,.2f} {verb} the "
                                                "buyer's stored credit.")
                        st.rerun()
                    else:
                        st.error("❌ Credit adjustment didn't land — see the Apex log.")
        st.text_input("Adjustment memo", key="bc_msg",
                      placeholder="reason shown on the buyer's credit history")
        st.markdown("---")

        b1, b2, b3 = st.columns(3)
        if b1.button(f"Apply Total (${total:,.2f})" if total is not None else "Total —",
                     key="pay_ap_tot", disabled=total is None,
                     use_container_width=True):
            st.session_state['pay_amount'] = float(total)
        if b2.button(f"Apply Due (${due:,.2f})" if due is not None else "Due —",
                     key="pay_ap_due", disabled=due is None,
                     use_container_width=True):
            st.session_state['pay_amount'] = float(due)
        if b3.button(f"Apply Credit (${credit:,.2f})" if credit else "Credit —",
                     key="pay_ap_cred", disabled=not credit,
                     use_container_width=True):
            st.session_state['pay_amount'] = float(credit)

        # ── % OFF — always visible: type a percent, one click posts an Ad Hoc
        #    Credit for that share of the CURRENT due balance. $100 due + 10% → $10
        #    credit → $90 due. The COD 5% button is the same post, pre-set. ──
        def _post_off_credit(amount, memo_txt, ok_note):
            sess = st.session_state.get('bapi_session') or {}
            if not _session_ready(sess):
                st.error("No Apex browser session — grab it in the sidebar first.")
                return
            log = []
            payload = {
                'amount': amount,
                'accounting_method': 'ad hoc credit',
                'payment_type': '',
                'payment_date': datetime.now().strftime("%Y-%m-%d"),
                'memo': memo_txt,
            }
            with st.spinner("Posting credit to Apex…"):
                ok = bapi_add_payment(sess, order, payload, log)
            st.session_state['apex_push_log'] = (
                (st.session_state.get('apex_push_log') or []) + log)
            if ok:
                _qty_verdict('success', ok_note)
                st.rerun()   # repaint so the due/total buttons show the new balance
            else:
                st.error("❌ Credit didn't land — see the Apex update log.")

        pc1, pc2, pc3 = st.columns([1, 1.6, 1.4])
        with pc1:
            pct = st.number_input("% off due", key="pay_pct", min_value=0.0,
                                  max_value=100.0, step=1.0, format="%.2f",
                                  help="Percent of the current due balance to credit "
                                       "off. Posts as an Ad Hoc Credit the moment "
                                       "you hit the button.")
        pct_amt = round((due or 0) * (pct or 0) / 100.0, 2)
        cod_amt = round((due or 0) * 5.0 / 100.0, 2)
        with pc2:
            st.markdown("<div style='height:1.75rem'></div>", unsafe_allow_html=True)
            if due is None:
                st.caption("⚠️ Couldn't read the due balance off this order — "
                           "reload the invoice.")
            if st.button((f"％ Post {pct:g}% off  (−${pct_amt:,.2f} credit)"
                          if pct_amt > 0 else "％ Post % off"),
                         key="pay_pct_go", use_container_width=True,
                         disabled=not pct_amt or due is None):
                _post_off_credit(pct_amt, f"{pct:g}% off due balance",
                                 f"✅ {pct:g}% off posted — ${pct_amt:,.2f} "
                                 "Ad Hoc Credit on the order.")
        with pc3:
            st.markdown("<div style='height:1.75rem'></div>", unsafe_allow_html=True)
            if st.button((f"💵 COD 5% off  (−${cod_amt:,.2f})"
                          if cod_amt > 0 else "💵 COD 5% off"),
                         key="pay_cod5_go", use_container_width=True,
                         disabled=not cod_amt or due is None,
                         help="One click: posts a 5% Ad Hoc Credit off the current "
                              "due balance — the standard COD discount."):
                _post_off_credit(cod_amt, "5% COD discount",
                                 f"✅ COD 5% off posted — ${cod_amt:,.2f} "
                                 "Ad Hoc Credit on the order.")

        c1, c2 = st.columns(2)
        with c1:
            amt = st.number_input("Amount ($)", key="pay_amount", min_value=0.0,
                                  step=1.0, format="%.2f")
        with c2:
            method = st.selectbox("Accounting method", ACCOUNTING_METHODS,
                                  key="pay_method",
                                  help="Payment = money received · Ad Hoc Credit = "
                                       "one-off credit against this invoice · Credit "
                                       "= buyer's stored credit applied · Write-Off "
                                       "= forgiven · Trade = paid in trade")
        c3, c4 = st.columns(2)
        with c3:
            ptype = st.selectbox("Payment type", PAYMENT_TYPE_PRESETS, key="pay_type",
                                 help="Optional — Apex's own modal leaves this blank "
                                      "by default. '(none)' posts with no payment type.")
            if ptype == "Other":
                ptype = st.text_input("Custom payment type", key="pay_type_custom")
            elif ptype == "(none)":
                ptype = None
        with c4:
            pdate = st.date_input("Payment date", key="pay_date",
                                  value=datetime.now().date())
        memo = st.text_input("Memo", key="pay_memo")

        if st.button("➕ Add to Apex", type="primary", use_container_width=True,
                     key="pay_add", disabled=not amt or amt <= 0):
            sess = st.session_state.get('bapi_session') or {}
            if not _session_ready(sess):
                st.error("No Apex browser session — grab it in the sidebar first.")
                return
            log = []
            payload = {
                'amount': round(float(amt), 2),
                # Apex type strings are lowercase words WITH SPACES — confirmed
                # "payment" and "ad hoc credit" from DevTools ("Write-Off" → "write off")
                'accounting_method': re.sub(r'[\s-]+', ' ', method.lower()),
                'payment_type': ptype or '',
                'payment_date': pdate.strftime("%Y-%m-%d"),
                'memo': memo or '',
            }
            with st.spinner("Posting to Apex…"):
                ok = bapi_add_payment(sess, order, payload, log)
            st.session_state['apex_push_log'] = (st.session_state.get('apex_push_log') or []) + log
            if ok:
                _qty_verdict('success', f"✅ {method} of ${amt:,.2f} added to the order.")
                st.rerun()   # repaint so the Total/Due buttons + ledger show the
                             # new balance immediately (they drew pre-save)
            else:
                st.error("❌ Didn't land — open the Apex update log; every route "
                         "tried is in there with Apex's response. Make the same "
                         "entry once in the Apex UI with DevTools open and paste "
                         "the request to lock the route in.")

        # ── Recorded payments & credits — the order's live ledger, same as Apex's
        #    'Recorded Payments' table. Reads the freshest order copy (every post
        #    stores the updated order back), so a new credit shows here instantly. ──
        live = st.session_state.get('apex_order_raw') or order
        pays = live.get('payments') or []
        st.markdown("---")
        st.markdown("##### 🧾 Recorded payments & credits "
                    f"({len(pays)})" if pays else "##### 🧾 Recorded payments & credits — none yet")
        if pays:
            hdr = st.columns([1.2, 1.6, 1.0, 1.8, 0.4])
            for c, lab in zip(hdr, ["Amount", "Type", "Date", "Note", "❌"]):
                c.caption(lab)
            for p in sorted(pays, key=lambda x: str(x.get('payment_date') or ''),
                            reverse=True):
                rc = st.columns([1.2, 1.6, 1.0, 1.8, 0.4])
                # v1 payments: amount '100.00' (dollars) + amount_raw 10000 (cents);
                # b-api payments: amount 10000 (cents int). Prefer the raw cents.
                if isinstance(p.get('amount_raw'), (int, float)):
                    amt_d = float(p['amount_raw']) / 100.0
                elif isinstance(p.get('amount'), (int, float)):
                    amt_d = float(p['amount']) / 100.0
                else:
                    s = str(p.get('amount') or '')
                    val = _parse_money(s) or 0.0
                    # undotted string on a b-api order = cents ("10000" → $100)
                    amt_d = val / 100.0 if ('.' not in s and _is_bapi_order(live)) else val
                typ = str(p.get('type') or '').title()
                ptp = p.get('pay_type') or ''
                rc[0].write(f"${amt_d:,.2f}")
                rc[1].write(typ + (f" · {ptp}" if ptp else ""))
                rc[2].write(str(p.get('payment_date') or '')[:10])
                rc[3].write(p.get('note') or "—")
                pid = p.get('id')
                if pid and rc[4].button("❌", key=f"pay_del_{pid}",
                                        help=f"Delete this {typ.lower()} "
                                             f"(${amt_d:,.2f}) from the order — "
                                             "saved to Apex immediately"):
                    sess = st.session_state.get('bapi_session') or {}
                    if not _session_ready(sess):
                        st.error("No Apex browser session — grab it in the "
                                 "sidebar first.")
                    else:
                        dlog = []
                        with st.spinner("Deleting from Apex…"):
                            ok_del = bapi_delete_payment(sess, live, pid, dlog)
                        st.session_state['apex_push_log'] = (
                            (st.session_state.get('apex_push_log') or []) + dlog)
                        if ok_del:
                            _qty_verdict('success',
                                         f"✅ Deleted {typ.lower()} of "
                                         f"${amt_d:,.2f} from the order.")
                            st.rerun()   # repaint ledger + Due with the fresh order
                        else:
                            st.error("❌ Delete didn't land — see the Apex "
                                     "update log.")
            paid_d = _order_money(live, 'total_payments') or 0
            cred_d = _order_money(live, 'total_credits') or 0
            wo_d = _order_money(live, 'total_write_offs') or 0
            due_d = _order_money(live, 'payment_currently_due',
                                 'payments_currently_due') or 0
            st.caption(f"**Paid ${paid_d:,.2f}** · Credits ${cred_d:,.2f} · "
                       f"Write-offs ${wo_d:,.2f} · **Due ${due_d:,.2f}**")


def render_coa_download():
    """One-click 'Download All COAs' — fetches the exact zip Apex's own link serves
    (GET /b-api/order-item-zip/{order_uuid}) using the loaded order's uuid and your
    browser session. This is the SAME file Apex produces, not a rebuild. On success it
    also unpacks the zip and attaches each COA to its matching line item."""
    order_uuid = (st.session_state.get('apex_order_raw') or {}).get('uuid')
    if not order_uuid:
        return  # no invoice loaded yet — nothing to do

    # Fetch on click, stash the bytes, then render a download button for them.
    if st.button("📋 Download All COAs", use_container_width=True,
                 key="coa_fetch_btn",
                 help="Pulls the same COA zip as Apex's 'Download All COAs' link, "
                      "for the currently loaded invoice. Uses your Apex session."):
        sess = st.session_state.get('bapi_session') or {}
        with st.spinner("Fetching COAs from Apex…"):
            data, msg = fetch_order_coa_zip(sess, order_uuid)
        if data:
            inv = str(st.session_state.get('selected_invoice', '') or order_uuid)
            safe = re.sub(r'[^A-Za-z0-9._-]', '_', inv)
            st.session_state['coa_zip_blob'] = {
                'data': data, 'name': f"COAs_{safe}.zip", 'inv': inv}
            # Attach each COA in the zip to its line item so the COA column fills in.
            n_match, n_total = _attach_coas_from_zip(
                data, st.session_state.get('invoice_items') or [])
            if n_total and n_match:
                st.success(f"✅ {msg} — attached {n_match}/{n_total} COAs to line items.")
            elif n_total:
                st.warning(f"{msg} Zip saved, but couldn't auto-match any COA filenames "
                           f"to the {n_total} line items — use the per-line buttons or "
                           "open the zip directly.")
            else:
                st.success("✅ " + msg)
        else:
            st.session_state.pop('coa_zip_blob', None)
            st.error("❌ " + msg)

    blob = st.session_state.get('coa_zip_blob')
    if blob:
        st.download_button(
            f"⬇️ Save COAs zip ({blob['inv']})",
            blob['data'], blob['name'], "application/zip",
            use_container_width=True, key="coa_dl_btn")


def render_apex_panel():
    st.subheader("📄 Apex Invoice")
    cpre, cnum = st.columns([1, 2])
    with cpre:
        prefix = st.text_input("Prefix", value="Twiste-", key="apex_prefix")
    with cnum:
        num = st.text_input("Invoice number", value="", placeholder="e.g. 123",
                            key="apex_num")
    if st.button("🔍 Load Invoice", type="primary", use_container_width=True,
                 disabled=not num.strip()):
        with st.spinner(f"Loading invoice {prefix}{num.strip()}..."):
            ok, msg = load_apex_invoice(prefix, num)
        if ok:
            # Starting a fresh reconciliation — drop any stale manifest first.
            for k in ('comparison_df', 'manifest_packages', 'raw_metrc_packages',
                      'total_manifest_weight', 'selected_manifest_number',
                      'selected_manifest_invoice',
                      'selected_recipient', 'selected_recipient_license',
                      'metrc_source', '_cmp_sig'):
                st.session_state.pop(k, None)

            q, n, auto = pick_manifest_query()
            st.session_state['mf_search'] = q
            st.session_state['mf_search_auto'] = q
            st.session_state['mf_search_auto_n'] = n

            if auto is not None:
                load_metrc_from_manifest(auto)            # load + compare now
                lbl = manifest_dropdown_label(auto)
                st.session_state['manifest_pick'] = lbl   # pre-select in dropdown
                st.session_state['mf_picked'] = lbl
                st.session_state['mf_auto_selected'] = True
            else:
                st.session_state.pop('manifest_pick', None)
                st.session_state.pop('mf_picked', None)
                st.session_state.pop('mf_auto_selected', None)
            st.rerun()
        else:
            st.error("❌ " + msg)

    items = st.session_state.get('invoice_items')
    if _invoice_loaded():
        items = items or []
        b = st.session_state.get('buyer_name', 'N/A')
        tot = st.session_state.get('order_total', '—')
        stt = st.session_state.get('order_status_name', '')
        st.success(f"✅ {st.session_state.get('selected_invoice', '')}  ·  {b}")
        m1, m2, m3 = st.columns(3)
        with m1: st.metric("Buyer", b)
        with m2: st.metric("Total", f"${tot}" if tot not in (None, '—') else "—")
        with m3: st.metric("Status", stt or "—")

        dl1, dl2, dl3 = st.columns(3)
        with dl1:
            render_coa_download()
        with dl2:
            render_invoice_download()
        with dl3:
            render_invoice_bundle_download()
        render_invoice_email()
        render_order_meta_editor()
        render_payments_editor()

        # Edited banner + reset
        orig = st.session_state.get('invoice_items_original')
        if orig is not None and len(orig) != len(items):
            ec1, ec2 = st.columns([3, 1])
            ec1.caption(f"✏️ Edited — {len(items)} line(s) (was {len(orig)}).")
            ec2.button("↩️ Reset", use_container_width=True,
                       help="Restore the original invoice",
                       on_click=_reset_invoice)

        # Line items: ♻️ returns the line to inventory, ❌ deletes it from the order
        # (NOT returned). 📄 downloads that line's COA. ♻️/❌ save to Apex immediately.
        _ensure_line_uids(items)
        coa_map = _coa_docs_by_batch(st.session_state.get('bapi_session') or {})
        hdr = st.columns([0.4, 2.7, 2.3, 1.0, 0.6, 0.5, 0.5])
        hdr[0].caption("#"); hdr[1].caption("Product"); hdr[2].caption("Batch")
        hdr[3].caption("Weight"); hdr[4].caption("COA"); hdr[5].caption("♻️")
        hdr[6].caption("❌")
        total_w = 0.0
        for i, it in enumerate(items):
            w, _ = calculate_total_weight(it)
            total_w += (w or 0)
            r = st.columns([0.4, 2.7, 2.3, 1.0, 0.6, 0.5, 0.5])
            r[0].write(i + 1)
            nm = it.get('product_name', '')
            r[1].write(("➕ " if it.get('_added') else "")
                       + ((nm[:34] + '…') if len(nm) > 34 else nm))
            r[2].write(it.get('batch_name', ''))
            r[3].write(f"{w:.1f}g" if w else "N/A")
            _render_line_coa(r[4], it, coa_map)
            r[5].button("♻️", key=f"ret_inv_{it['_uid']}",
                        help="Return this line to inventory — saved to Apex now",
                        on_click=_finalize_remove, args=(it['_uid'], 'return'))
            r[6].button("❌", key=f"rm_inv_{it['_uid']}",
                        help="Delete this line from the order — NOT returned to inventory",
                        on_click=_finalize_remove, args=(it['_uid'], 'delete'))

        st.session_state['total_invoice_weight'] = total_w
        coa_err = st.session_state.pop('_coa_line_error', None)
        if coa_err:
            st.error("📄 COA fetch failed — " + coa_err)
        render_push_result_and_log()
        st.metric("📊 Invoice Weight", f"{total_w:.1f}g")

        rem = st.session_state.get('removed_items') or []
        if rem:
            with st.expander(f"🗑️ Removed this session ({len(rem)})"):
                for x in rem:
                    tag = ("↩️ returned to inventory"
                           if x.get('disposition') == 'return'
                           else "🗑️ deleted from inventory")
                    nm = x.get('product_name', '')[:34]
                    st.caption(f"{tag} · {nm} · {x.get('batch_name', '')} · "
                               f"{x.get('weight', 0):.1f}g")
    else:
        st.info("Enter an invoice number and press **Load Invoice**.")


# ============================================================
# RIGHT PANEL — METRC Manifest (single sortable / searchable picker + PDF fallback)
# ============================================================

def render_metrc_panel():
    st.subheader("📦 METRC Manifest")
    cache = st.session_state.get('mp_cache') or load_manifest_cache()
    st.session_state['mp_cache'] = cache
    all_cached = cache.get('manifests', [])
    manifests = manifests_in_window(all_cached)
    if not manifests and all_cached:
        # Window filtered everything out — show all so you can still pick.
        manifests = all_cached
        st.caption(f"Showing all {len(all_cached)} cached "
                   f"(none fell inside the {MP_WINDOW_DAYS}-day window).")

    # Fill missing destination names/licenses from the CSV index (0 tokens)
    if manifests:
        enrich_recipients_from_index(manifests)
        missing = sum(1 for t in manifests if recipient_of(t)[0] in ('', '—'))
        if missing:
            st.caption(f"⚠️ {missing} of {len(manifests)} have no destination on "
                       "record — use **Fill destinations** in the sidebar to fetch them.")
        with st.expander("🔧 Inspect raw manifest fields (debug)"):
            st.caption("If destinations still show '—', tell me which key here "
                       "actually holds the recipient store/license.")
            st.json({k: manifests[0].get(k) for k in sorted(manifests[0].keys())})

    if not manifests:
        st.info("No cached manifests yet. Use **Full 60-day pull** in the sidebar "
                "once, then **Quick / Refresh** to stay current cheaply.")
    else:
        f1, f2 = st.columns([2, 1])
        with f1:
            search = st.text_input("🔎 Search destination / manifest / invoice",
                                    key="mf_search",
                                    placeholder="e.g. Hennep, FFD, MR284, 0003309…")
        with f2:
            status = st.selectbox("Show", ["All", "Active", "Inactive"], key="mf_status")
        s1, s2 = st.columns([2, 1])
        with s1:
            sort_by = st.selectbox("Sort by", SORT_FIELDS, key="mf_sort")
        with s2:
            newest = st.toggle("Desc", value=True, key="mf_desc",
                               help="Newest / A→Z first when on")

        auto = st.session_state.get('mf_search_auto')
        if auto and search == auto:
            n = st.session_state.get('mf_search_auto_n')
            if st.session_state.get('mf_auto_selected'):
                st.caption(f"🎯 Auto-selected the manifest matching invoice "
                           f"(“{auto}”). Pick another below to change it.")
            elif n:
                st.caption(f"🔎 Auto-filled from the invoice (“{auto}”) — "
                           f"{n} match(es). Edit or clear to browse all.")
            else:
                st.caption(f"🔎 Tried “{auto}” from the invoice but nothing "
                           "matched — edit the box, or try the invoice # / city.")

        filtered = sort_filter_manifests(manifests, search, sort_by, newest, status)
        if not filtered and search.strip():
            st.warning(f"No manifests match “{search}”. Clear the search to "
                       "browse all, or try the store name / city / invoice #.")
        labels = [manifest_dropdown_label(t) for t in filtered]
        choice = st.selectbox(f"Manifest ({len(filtered)})",
                              [PICK_PLACEHOLDER] + labels, key="manifest_pick")

        if choice != PICK_PLACEHOLDER and st.session_state.get('mf_picked') != choice:
            chosen = filtered[labels.index(choice)]
            with st.spinner(f"Loading manifest #{chosen.get('ManifestNumber', '')}..."):
                ok, msg = load_metrc_from_manifest(chosen)
            st.session_state['mf_picked'] = choice
            st.session_state.pop('mf_auto_selected', None)
            if ok:
                st.rerun()
            else:
                st.error("❌ " + msg)

    # Last-resort PDF fallback
    with st.expander("⬆️ Last resort: drop in the manifest PDF"):
        st.caption("Use only if the manifest can't be found above (e.g. not yet in "
                   "the cache). Limit 200MB · PDF.")
        up = st.file_uploader("Upload METRC Manifest PDF", type=['pdf'],
                              key="mf_pdf", label_visibility="collapsed")
        if up is not None and st.session_state.get('mf_pdf_name') != up.name:
            with st.spinner("Parsing PDF..."):
                ok, msg = load_metrc_from_pdf(up)
            st.session_state['mf_pdf_name'] = up.name
            if ok:
                st.success(f"✅ Parsed {len(st.session_state['manifest_packages'])} "
                           f"packages from {up.name}")
                st.rerun()
            else:
                st.error("❌ " + msg)

    pkgs = st.session_state.get('manifest_packages')
    if pkgs:
        recip = st.session_state.get('selected_recipient', '—')
        lic = st.session_state.get('selected_recipient_license', '')
        src = st.session_state.get('metrc_source', 'api')
        mnum = st.session_state.get('selected_manifest_number', '')
        m_inv = (st.session_state.get('selected_manifest_invoice') or '').strip()
        st.success(f"✅ Manifest #{mnum}  ·  {('PDF' if src == 'pdf' else 'live METRC')}"
                   + (f"  ·  inv {m_inv}" if m_inv else ""))
        st.caption(f"🏪 Store: {recip or '—'}    🪪 License: {lic or '—'}")
        rows = []
        for p in pkgs:
            rows.append({'#': p.get('package_number', ''),
                         'Item': p.get('item_name', ''),
                         'Batch': p.get('batch_name', ''),
                         'Qty': f"{p.get('quantity', 0):.1f}g"})
        st.dataframe(pd.DataFrame(rows), use_container_width=True,
                     hide_index=True, height=360)
        st.metric("📊 Manifest Weight",
                  f"{st.session_state.get('total_manifest_weight', 0):.1f}g")
    elif manifests:
        st.info("Pick a manifest above (search by store, sort to find it), "
                "or drop in its PDF.")


# ============================================================
# COMPARISON
# ============================================================

def render_comparison_section():
    st.markdown("---")
    st.header("🔍 Exact Structural Comparison")

    have_apex = bool(st.session_state.get('invoice_items'))
    have_metrc = bool(st.session_state.get('manifest_packages'))

    if st.button("🔎 SCAN & COMPARE", type="primary", use_container_width=True,
                 disabled=not (have_apex and have_metrc)):
        st.session_state.pop('_cmp_sig', None)
        maybe_autocompare()

    # Auto-compare whenever both sides are present
    maybe_autocompare()

    if 'comparison_df' not in st.session_state:
        if not have_apex and not have_metrc:
            st.info("Load an Apex invoice (left) and a METRC manifest (right) to compare.")
        elif not have_metrc:
            st.warning("Apex invoice loaded — now pick or upload its METRC manifest.")
        else:
            st.warning("Manifest loaded — now load the matching Apex invoice.")
        return

    cdf = st.session_state['comparison_df']
    inv_num = st.session_state.get('selected_invoice', '')
    recip = st.session_state.get('selected_recipient', '')
    lic = st.session_state.get('selected_recipient_license', '')
    st.success(f"✅ Invoice #{inv_num} — {recip}"
               + (f" · License {lic}" if lic else "")
               + f" — Manifest #{st.session_state.get('selected_manifest_number', '')}")

    # Guard: the manifest carries its own invoice number — if it isn't the one
    # loaded on the left, this comparison is across two DIFFERENT orders (the
    # exact failure that paired invoice 1505 with the store's June manifest).
    man_inv = (st.session_state.get('selected_manifest_invoice') or '').strip()
    if (man_inv and inv_num and _digits(man_inv)
            and _digits(str(inv_num)) and _digits(man_inv) != _digits(str(inv_num))):
        st.error(f"🚨 WRONG MANIFEST? Manifest "
                 f"#{st.session_state.get('selected_manifest_number', '')} is tagged "
                 f"invoice **{man_inv}**, but the loaded invoice is **{inv_num}**. "
                 "You're comparing two different orders — likely this store's "
                 "previous delivery. Refresh the manifest cache (sidebar) and pick "
                 f"the manifest for invoice {inv_num} before trusting the rows below.")

    tb = len(cdf)
    pm = len(cdf[cdf['Status'] == '✅ PERFECT MATCH'])
    sm = len(cdf[cdf['Status'].str.contains('STRUCTURE', na=False)])
    mi = len(cdf[cdf['Status'].str.contains('NOT IN', na=False)])
    wm = len(cdf[cdf['Status'].str.contains('MORE', na=False)])
    c1, c2, c3, c4, c5 = st.columns(5)
    with c1: st.metric("Batches", tb)
    with c2: st.metric("✅ Perfect", pm)
    with c3: st.metric("⚠️ Structure", sm)
    with c4: st.metric("❌ Weight", wm)
    with c5: st.metric("❌ Missing", mi)

    # Live sum, not the banked session value — adds/removes/qty edits all mutate
    # invoice_items, and a stale total here reads as "the grams don't match"
    # even when every row agrees.
    iw = sum((calculate_total_weight(x)[0] or 0)
             for x in (st.session_state.get('invoice_items') or []))
    st.session_state['total_invoice_weight'] = iw
    mw = st.session_state.get('total_manifest_weight', 0)
    w1, w2, w3 = st.columns(3)
    with w1: st.metric("Invoice Total", f"{iw:.1f}g")
    with w2: st.metric("METRC Total", f"{mw:.1f}g")
    with w3: st.metric("Difference", f"{iw - mw:+.1f}g")

    issues = sm + mi + wm
    if issues == 0:
        st.success("🎉 **PERFECT!** All batches match.")
    else:
        st.error(f"⚠️ **{issues} ISSUES FOUND!**")

    st.markdown("---")

    # ── Interactive comparison grid: colored cells (green/yellow/red) with an inline
    #    ❌ on rows that have an Apex line, so you remove right where you see status. ──
    items = st.session_state.get('invoice_items') or []
    _ensure_line_uids(items)
    # batch (normalized) -> invoice line uids, so a batch row can remove its line(s)
    batch_to_uid = defaultdict(list)
    for it in items:
        bn = (it.get('batch_name') or '').strip()
        if bn:
            batch_to_uid[normalize_batch_name(bn)].append(it['_uid'])

    def _row_bg(status):
        if status == '✅ PERFECT MATCH':
            return '#1e3a2a'   # green (dark-theme friendly)
        if '⚠️' in status:
            return '#3a341e'   # amber
        if '❌' in status:
            return '#3a1e22'   # red
        return 'transparent'

    def _cell(col, text, bg, *, strong=False, align='left'):
        weight = '600' if strong else '400'
        col.markdown(
            f"<div style='background:{bg};padding:6px 8px;border-radius:3px;"
            f"color:#e8e8e8;font-weight:{weight};text-align:{align};"
            f"white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'>"
            f"{text}</div>", unsafe_allow_html=True)

    widths = [1.8, 2.0, 0.75, 0.75, 0.75, 1.3, 0.4, 0.4, 0.85, 0.55, 0.4, 0.4, 0.4]
    hdr = st.columns(widths)
    for c, lab in zip(hdr, ["Batch", "Product", "Inv Total", "METRC Total",
                            "Diff", "Status", "♻️", "❌", "Qty", "Avail", "✓", "♻️", "❌"]):
        c.caption(lab)

    # uid -> the live invoice line, so a row can pre-fill/edit its Apex quantity
    line_by_uid = {it['_uid']: it for it in items if it.get('_uid')}

    for _, row in cdf.iterrows():
        status = row['Status']
        bg = _row_bg(status)
        rc = st.columns(widths)
        _cell(rc[0], row['Batch'], bg, strong=True)
        _cell(rc[1], row['Product'], bg)
        _cell(rc[2], row['Inv Total'], bg, align='right')
        _cell(rc[3], row['METRC Total'], bg, align='right')
        _cell(rc[4], row['Diff'], bg, align='right')
        _cell(rc[5], status, bg)
        uids = batch_to_uid.get(normalize_batch_name((row['Batch'] or '').strip()), [])
        if uids:
            sel = uids if len(uids) > 1 else uids[0]
            rc[6].button("♻️", key=f"cmp_ret_{row['Batch']}",
                         help="Return this batch's line(s) to inventory — saved to Apex now",
                         on_click=_finalize_remove, args=(sel, 'return'))
            rc[7].button("❌", key=f"cmp_rm_{row['Batch']}",
                         help="Delete this batch's line(s) — NOT returned to inventory",
                         on_click=_finalize_remove, args=(sel, 'delete'))
        else:
            rc[6].caption("—")
            rc[7].caption("—")

        # ── Precise quantity edit: set THIS line's Apex qty, then push instantly ──
        # Only a single-line batch has an unambiguous quantity to set. The box is
        # pre-filled with the line's current order_quantity (in its own unit —
        # cases, units, or each). Type the corrected number — or a NEGATIVE number
        # to subtract (e.g. -100 takes 200 → 100) — then the qty-♻️ returns the
        # removed units to inventory, the qty-❌ writes them off. Both PATCH the
        # real Apex order via modify-quantity, same call the Apex UI fires. The
        # main ♻️/❌ (left) stay as the remove-the-whole-line buttons.
        if len(uids) == 1 and uids[0] in line_by_uid:
            it_line = line_by_uid[uids[0]]
            oum = it_line.get('order_unit_measurement') or {}
            uname = (oum.get('alias') or oum.get('name') or 'qty') if isinstance(oum, dict) else str(oum)
            try:
                curq = int(float(it_line.get('order_quantity') or 0))
            except (TypeError, ValueError):
                curq = 0
            qkey = f"cmp_qty_{uids[0]}"
            st.session_state.setdefault(qkey, curq)
            rc[8].number_input(
                f"Apex qty ({uname})", key=qkey, step=1,
                label_visibility="collapsed",
                help=f"Current Apex quantity: {curq} {uname}. Type the corrected "
                     "number (or a negative number to subtract, e.g. -100) and "
                     "click the ♻️/❌ on the right to save it to Apex now.")
            # Faded on-hand next to the qty box: what THIS batch has available in
            # Apex right now. An increase beyond this triggers the auto top-up.
            avail, untracked = _batch_avail_units(it_line.get('product_id'),
                                                  it_line.get('batch_id'))
            atxt = ("∞" if untracked else "?" if avail is None else f"{avail:g}u")
            rc[9].markdown(
                f"<div title='Units this batch has on-hand in Apex inventory' "
                f"style='padding-top:9px;color:#6f7d74;font-size:0.78rem;"
                f"white-space:nowrap;'>{atxt}</div>", unsafe_allow_html=True)
            rc[10].button("✓", key=f"cmp_qset_{uids[0]}",
                          help=f"CONFIRM — set the line to this quantity ({uname}). "
                               "An increase pulls the extra units from inventory — "
                               "if the batch is short, it's topped up automatically "
                               "first. A decrease returns units. Saved to Apex now.",
                          on_click=_set_line_quantity,
                          args=(uids[0], qkey, 'inventory'))
            rc[11].button("♻️", key=f"cmp_qret_{uids[0]}",
                          help=f"Set the line to this quantity ({uname}) — removed "
                               "units RETURN to inventory. Saved to Apex now.",
                          on_click=_set_line_quantity,
                          args=(uids[0], qkey, 'inventory'))
            rc[12].button("❌", key=f"cmp_qrm_{uids[0]}",
                          help=f"Set the line to this quantity ({uname}) — removed "
                               "units are WRITTEN OFF (not returned). Saved to Apex now.",
                          on_click=_set_line_quantity,
                          args=(uids[0], qkey, 'trash'))
        else:
            rc[8].caption("multi" if len(uids) > 1 else "—")
            rc[9].caption("")
            rc[10].caption("")
            rc[11].caption("")
            rc[12].caption("")

        # ── Manifest-only batch → offer to ADD it to the Apex invoice. The
        #    dropdown shows the auto-found inventory match (verify or override),
        #    qty/unit come pre-computed from the manifest grams + the product's
        #    packaging, and the ➕ tops the batch up first if Apex shows it
        #    short/zero — so the add can never silently no-op on empty stock. ──
        if status == '❌ NOT IN INVOICE':
            bk = normalize_batch_name((row['Batch'] or '').strip())
            cache_key = f"_cmp_cands_{bk}"
            # `not cands` (not `is None`): an empty list must NOT stick for the
            # session — it retries each rerun so candidates appear as soon as
            # inventory/batches load (e.g. after a b-api pull).
            cands = st.session_state.get(cache_key)
            if not cands:
                man_item = next(
                    (p.get('item_name', '') for p in
                     (st.session_state.get('manifest_packages') or [])
                     if normalize_batch_name((p.get('batch_name') or '').strip()) == bk),
                    '')
                cands = _find_inventory_candidates(row['Batch'], man_item)
                st.session_state[cache_key] = cands
            try:
                grams = float(str(row['METRC Total']).rstrip('g'))
            except ValueError:
                grams = 0.0
            ac = st.columns([0.3, 4.3, 0.85, 1.0, 1.8, 0.7])
            ac[0].markdown("<div style='padding-top:9px;color:#6f7d74;'>↳ ➕</div>",
                           unsafe_allow_html=True)
            if not cands:
                ac[1].caption("No inventory match found — load/refresh inventory in "
                              "the sidebar, or use 'Add items from inventory' below.")
            else:
                labels = [c['label'] for c in cands]
                sel = ac[1].selectbox(
                    "Inventory match", labels, key=f"cmp_add_sel_{bk}",
                    label_visibility="collapsed",
                    help="Auto-found inventory match for this manifest batch — "
                         "verify it's the right product/batch, or pick another.")
                si = labels.index(sel)
                cand = cands[si]
                sq, su, _units, upc, gpu = _suggest_add_qty(cand['product'], grams)
                qkey, ukey = f"cmp_add_qty_{bk}_{si}", f"cmp_add_unit_{bk}_{si}"
                st.session_state.setdefault(qkey, sq)
                st.session_state.setdefault(ukey, su)
                qty = ac[2].number_input("Qty", key=qkey, min_value=1, step=1,
                                         label_visibility="collapsed")
                unit_name = ac[3].selectbox("Unit", ["Case", "Unit"], key=ukey,
                                            label_visibility="collapsed")
                units_total = int(qty) * (upc if unit_name == 'Case' else 1)
                avail, untracked = _batch_avail_units(
                    cand['batch'].get('product_id') or cand['product'].get('id'),
                    cand['batch'].get('id'))
                atxt = "∞" if untracked else ("?" if avail is None else f"{avail:g}u")
                short = (not untracked and avail is not None
                         and avail < units_total)
                info = (f"= {units_total}u"
                        + (f" ≈ {units_total * gpu:.0f}g" if gpu else "")
                        + f" · avail {atxt}"
                        + (" · will top-up first" if short else ""))
                ac[4].markdown(
                    f"<div style='padding-top:9px;font-size:0.78rem;white-space:nowrap;"
                    f"color:{'#c9a227' if short else '#6f7d74'};'>{info}</div>",
                    unsafe_allow_html=True)
                ac[5].button("➕", key=f"cmp_add_go_{bk}",
                             help="Add this to the Apex invoice NOW. If the batch is "
                                  "short/zero in Apex inventory it's topped up first, "
                                  "so the add always has stock to pull from.",
                             on_click=_cmp_add_to_invoice,
                             args=(bk, cand, int(qty), unit_name))

    # ── Result of the last push, rendered HERE so a qty/♻️/❌ click's outcome is
    #    visible right under the grid (not only up in the invoice panel). ──
    render_push_result_and_log(key_sfx="_cmp")

    # ── Penalty boxes: staged returns vs deletes (undo ↩︎ puts a line back) ──
    rem = st.session_state.get('removed_items') or []
    if rem:
        returns = [(j, x) for j, x in enumerate(rem) if x.get('disposition') == 'return']
        deletes = [(j, x) for j, x in enumerate(rem) if x.get('disposition') != 'return']
        st.markdown("##### 📦 Removed this session (already saved to Apex)")

        def _penalty(col, title, entries):
            with col:
                with st.container(border=True):
                    st.markdown(f"**{title} ({len(entries)})**")
                    if not entries:
                        st.caption("—")
                    for j, x in entries:
                        cc = st.columns([4, 0.7])
                        synced = "✅" if x.get('pushed') else "⏳"
                        cc[0].caption(f"{synced} {x.get('product_name','')[:30]} · "
                                      f"{x.get('batch_name','')} · "
                                      f"{x.get('weight', 0):.1f}g")
                        cc[1].button("↩︎", key=f"undo_rm_{j}",
                                     help="Undo — puts the line back on the invoice "
                                          "and re-adds it to Apex if it was already removed",
                                     on_click=_undo_removed, args=(j,))

        pb1, pb2 = st.columns(2)
        _penalty(pb1, "↩️ Returned to inventory", returns)
        _penalty(pb2, "🗑️ Deleted from inventory", deletes)
        st.caption("Each ❌ saves to Apex the moment you confirm — returns flow back to "
                   "stock (`handleAdjustment: inventory`), deletes are written off "
                   "(`trash`). ✅ = synced, ⏳ = retry pending (see the invoice panel).")

    st.download_button(
        "📥 Download CSV Report", cdf.to_csv(index=False),
        f"compare_{inv_num}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
        "text/csv", use_container_width=True)


# ============================================================
# MAIN — single screen
# ============================================================

def main():
    st.title("📋 Apex Invoice vs METRC Manifest Checker")
    st.markdown("**Twisted Growers LLC** — MC281714 / MP281909  ·  "
                "*exact structural matching*")
    st.markdown("---")

    csv_data, _ = load_csv_index()
    render_sidebar(csv_data)

    col_apex, col_metrc = st.columns(2)
    with col_apex:
        render_apex_panel()
    with col_metrc:
        render_metrc_panel()

    if st.session_state.get('pending_remove') is not None:
        remove_item_dialog(st.session_state['pending_remove'])

    render_comparison_section()
    render_batch_inventory_editor()


if __name__ == "__main__":
    main()