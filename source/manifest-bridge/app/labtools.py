"""Lab PDF Batch Adder — native port of the inventory app's COA processor.

Flow (same as the Streamlit original, tg's format):
  1. POST /api/lab/parse   — upload COA PDFs; each is parsed (strain, METRC ids,
     THC, terpenes) and matched to existing products (strict brand+category).
  2. POST /api/lab/process — per configured item: optionally create cultivar +
     product, then create the batch (v2), upload the COA PDF as a document, and
     add terpenes.

Scoring: per created batch, +1 per line box filled (`batch_field_filled`,
one event per non-bool non-empty batch_data field); +1 per COA attached
(`coa_attached`).
"""

import io
import os
import re
import unicodedata
import uuid
from datetime import datetime, timedelta

import requests

from . import deps, metrctools, tasklog
from .deps import slc

UPLOAD_DIR = os.path.join(deps.DATA_DIR, "lab_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

try:
    import pdfplumber
    PDF_PARSER_AVAILABLE = True
except ImportError:
    PDF_PARSER_AVAILABLE = False

try:
    from pypdf import PdfReader
    PYPDF_AVAILABLE = True
except ImportError:
    PYPDF_AVAILABLE = False


# =============================================================================
# CONSTANTS — IDs for the Apex API (verbatim from the inventory app)
# =============================================================================
BRANDS = {
    "Twisted Buds": 2541,
    "Dope Chemist": 2573,
    "Twisted": 3229,
    "No Bull": 2539,
    "North End Blunts": 2574,
}

PRODUCT_CATEGORIES = {
    "Pre-pack": 2,
    "Preroll": 3,
    "Extract": 7,
    "Cartridge": 8,
    "Bulk Flower": 16,
}

PRODUCT_TYPES = {
    "Pre-pack": {
        "Flower": 245, "A Bud": 245, "B Bud": 246, "C Bud": 944, "Popcorn": 247,
    },
    "Preroll": {
        "Raw Pre-Roll": 65, "Pre-Roll": 65, "Infused Pre-Roll": 168,
        "Blunt": 67, "Whole Flower Blunt": 67,
        "Liquid Diamond Infused Pre-Roll": 66,
    },
    "Extract": {
        "Live Hash Rosin": 2317, "Live Resin": 100, "Live Badder": 107,
        "Live Sugar": 103, "Live Shatter": 104, "Live Sauce": 109,
        "Cured Badder": 108, "Cured Sugar": 105, "Cured Shatter": 106,
        "Cured Sauce": 110, "Cured Resin": 175,
    },
    "Cartridge": {
        "Liquid Diamond Vape Cart": 2301, "Live Rosin Vape Cart": 5714,
        "Vape Cart": 2301,
    },
}

DEFAULT_CASE_SIZES = {
    ("Twisted", "Preroll"): 100, ("Twisted", "Pre-pack"): 24,
    ("Twisted", "Extract"): 12, ("Twisted", "Cartridge"): 12,
    ("Twisted Buds", "Preroll"): 48, ("Twisted Buds", "Pre-pack"): 24,
    ("Twisted Buds", "Extract"): 12, ("Twisted Buds", "Cartridge"): 12,
    ("Dope Chemist", "Preroll"): 12, ("Dope Chemist", "Pre-pack"): 12,
    ("Dope Chemist", "Extract"): 12, ("Dope Chemist", "Cartridge"): 12,
    ("No Bull", "Preroll"): 24, ("No Bull", "Pre-pack"): 24,
    ("No Bull", "Extract"): 12, ("No Bull", "Cartridge"): 12,
    ("North End Blunts", "Preroll"): 20, ("North End Blunts", "Pre-pack"): 24,
    ("North End Blunts", "Extract"): 12, ("North End Blunts", "Cartridge"): 12,
}

UNIT_PRICING = {
    ("Dope Chemist", "Live Badder"): 12.00,
    ("Dope Chemist", "Live Hash Rosin"): 15.00,
    ("Dope Chemist", "Live Resin"): 12.00,
    ("Dope Chemist", "Live Sugar"): 12.00,
    ("Dope Chemist", "Live Sauce"): 12.00,
    ("Dope Chemist", "Cured Badder"): 9.00,
    ("Dope Chemist", "Cured Sugar"): 9.00,
    ("Dope Chemist", "Cured Resin"): 9.00,
    ("No Bull", "Vape"): 12.00,
    ("No Bull", "Liquid Diamond Vape Cart"): 12.00,
    ("No Bull", "Live Rosin Vape Cart"): 12.00,
    ("Twisted Buds", "Flower"): 10.00,
    ("Twisted Buds", "3.5g"): 10.00,
    ("Twisted", "Pre-Roll"): 1.90,
    ("Twisted", "Raw Pre-Roll"): 1.90,
    ("Twisted", "Infused Pre-Roll"): 5.00,
    ("Twisted", "Infused"): 5.00,
    ("Twisted Buds", "Pre-Roll"): 3.75,
    ("Twisted Buds", "Raw Pre-Roll"): 3.75,
    ("North End Blunts", "Blunt"): 7.00,
    ("North End Blunts", "Pre-Roll"): 7.00,
    ("North End Blunts", "Liquid Diamond Infused Pre-Roll"): 7.00,
}

UNIT_SIZES = ["0.5g", "1g", "2g", "3.5g", "7g", "14g", "28g"]

UNIT_SIZE_TO_PACKAGED_ID = {
    "0.5g": 23, "1g": 1, "2g": 2, "3.5g": 3, "7g": 4, "14g": 5, "28g": 7,
}

UNIT_SIZE_TO_GRAMS = {
    "0.5g": 0.5, "1g": 1.0, "2g": 2.0, "3.5g": 3.5, "7g": 7.0, "14g": 14.0,
    "28g": 28.0,
}

CULTIVAR_TYPES = {
    "Hybrid": 3, "Indica": 1, "Indica Dom. Hybrid": 4, "Sativa": 2,
    "Sativa Dom. Hybrid": 5, "Non-Cultivar Specific": 6,
}

TERPENE_NAME_MAP = {
    'terpinolene': 'Terpinolene',
    'beta-caryophyllene': 'Caryophyllene',
    'b-caryophyllene': 'Caryophyllene',
    'caryophyllene': 'Caryophyllene',
    'beta-myrcene': 'Myrcene',
    'b-myrcene': 'Myrcene',
    'myrcene': 'Myrcene',
    'd-limonene': 'Limonene',
    'limonene': 'Limonene',
    'linalool': 'Linalool',
    'alpha-humulene': 'Humulene',
    'a-humulene': 'Humulene',
    'humulene': 'Humulene',
    'beta-pinene': 'b - Pinene',
    'b-pinene': 'b - Pinene',
    'alpha-pinene': 'a - Pinene',
    'a-pinene': 'a - Pinene',
    'trans-ocimene': 'Ocimene',
    'cis-ocimene': 'Ocimene',
    'ocimene': 'Ocimene',
    'alpha-terpineol': 'Terpineol',
    'terpineol': 'Terpineol',
    'delta-3-carene': 'Delta 3 Carene',
    'd3-carene': 'Delta 3 Carene',
    'alpha-phellandrene': 'Phellandrene',
    'alpha-terpinene': 'Terpinene',
    'gamma-terpinene': 'Terpinene',
    'fenchyl alcohol': 'Fenchol',
    'fenchol': 'Fenchol',
    'trans-nerolidol': 'Nerolidol',
    'cis-nerolidol': 'Nerolidol',
    'nerolidol': 'Nerolidol',
    'sabinene': 'Sabinene',
    'borneol': 'Borneol',
    'valencene': 'Valencene',
    'sabinene hydrate': 'Sabinene',
    'camphene': 'Camphene',
    'caryophyllene oxide': 'Caryophyllene Oxide',
    'eucalyptol': 'Eucalyptol',
    'guaiol': 'Guaiol',
    'alpha-bisabolol': 'a - Bisabolol',
    'a-bisabolol': 'a - Bisabolol',
    'bisabolol': 'a - Bisabolol',
    'geraniol': 'Geraniol',
    'isopulegol': 'Isopulegol',
}


def normalize_text(text):
    """Lowercase, strip, and remove accents so 'Señor' matches 'Senor'."""
    if not text:
        return ""
    text = unicodedata.normalize('NFKD', str(text))
    text = text.encode('ascii', 'ignore').decode('ascii')
    return text.lower().strip()


def get_unit_price(brand_name, product_type_name):
    key = (brand_name, product_type_name)
    if key in UNIT_PRICING:
        return UNIT_PRICING[key]
    for (b, pt), price in UNIT_PRICING.items():
        if b == brand_name and pt.lower() in product_type_name.lower():
            return price
        if b == brand_name and product_type_name.lower() in pt.lower():
            return price
    pt_lower = product_type_name.lower()
    if 'rosin' in pt_lower:
        return 15.00
    elif 'badder' in pt_lower or 'resin' in pt_lower:
        return 12.00
    elif 'cured' in pt_lower:
        return 9.00
    elif 'vape' in pt_lower or 'cart' in pt_lower:
        return 12.00
    elif 'flower' in pt_lower or '3.5g' in pt_lower:
        return 10.00
    elif 'infused' in pt_lower:
        return 5.00
    elif 'roll' in pt_lower or 'blunt' in pt_lower:
        return 3.00
    return 10.00


# =============================================================================
# PDF PARSING
# =============================================================================
def extract_text_from_pdf(pdf_bytes):
    text = ""
    if PDF_PARSER_AVAILABLE:
        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            return text
        except Exception:
            pass
    if PYPDF_AVAILABLE:
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            return text
        except Exception:
            pass
    return text


def extract_strain_from_coa(pdf_text):
    strain_name = None
    tg_pattern = re.search(r'TG\s+([A-Za-z\s]+)\s*[-–]\s*\d{8}', pdf_text)
    if tg_pattern:
        return tg_pattern.group(1).strip()
    metrc_batch_match = re.search(
        r'METRC\s*Batch\s*ID[:\s]+TG\s+([A-Za-z\s]+)\s*[-–]', pdf_text, re.IGNORECASE)
    if metrc_batch_match:
        return metrc_batch_match.group(1).strip()
    lines = pdf_text.split('\n')
    for line in lines[:10]:
        tg_match = re.search(r'TG\s+([A-Za-z][A-Za-z\s]*[A-Za-z])', line)
        if tg_match:
            potential_strain = tg_match.group(1).strip()
            exclude_phrases = ['Twisted Growers', 'Certificate', 'Analysis',
                               'License', 'Final', 'Sample']
            if not any(excl.lower() in potential_strain.lower()
                       for excl in exclude_phrases):
                return potential_strain
    return strain_name


def parse_coa_data(pdf_text):
    """Parse COA PDF text. Dates come back as 'YYYY-MM-DD' strings (JSON-safe)."""
    data = {
        'strain_name': None,
        'batch_name': None,
        'metrc_batch_id': None,
        'metrc_sample_id': None,
        'metrc_source_package_id': None,
        'date_analyzed': None,
        'date_collected': None,
        'sample_number': None,
        'report_number': None,
        'thca_percent': None,
        'total_thc_percent': None,
        'total_cbd_percent': None,
        'total_cannabinoids_percent': None,
        'terpenes': [],
        'total_terpenes_mg_g': None,
        'cannabinoids': [],
    }
    if not pdf_text:
        return data

    data['strain_name'] = extract_strain_from_coa(pdf_text)

    metrc_batch_match = re.search(r'METRC\s*Batch\s*ID[:\s]+([^\n]+)',
                                  pdf_text, re.IGNORECASE)
    if metrc_batch_match:
        batch_id = metrc_batch_match.group(1).strip()
        if batch_id.startswith('TG '):
            batch_id = batch_id[3:]
        data['metrc_batch_id'] = metrc_batch_match.group(1).strip()
        data['batch_name'] = batch_id

    sample_id_match = re.search(r'METRC\s*Sample\s*ID[:\s]+(\S+)',
                                pdf_text, re.IGNORECASE)
    if sample_id_match:
        data['metrc_sample_id'] = sample_id_match.group(1).strip()

    source_pkg_match = re.search(r'METRC\s*Source\s*Package\s*ID[:\s]+(\S+)',
                                 pdf_text, re.IGNORECASE)
    if source_pkg_match:
        data['metrc_source_package_id'] = source_pkg_match.group(1).strip()

    date_analyzed_match = re.search(
        r'Date\s*Analyzed[:\s]+(\d{1,2}/\d{1,2}/\d{4})', pdf_text, re.IGNORECASE)
    if date_analyzed_match:
        try:
            data['date_analyzed'] = datetime.strptime(
                date_analyzed_match.group(1), '%m/%d/%Y').strftime('%Y-%m-%d')
        except Exception:
            pass

    date_collected_match = re.search(
        r'Date\s*Collected[:\s]+(\d{1,2}/\d{1,2}/\d{4})', pdf_text, re.IGNORECASE)
    if date_collected_match:
        try:
            data['date_collected'] = datetime.strptime(
                date_collected_match.group(1), '%m/%d/%Y').strftime('%Y-%m-%d')
        except Exception:
            pass

    sample_num_match = re.search(r'Sample\s*#[:\s]+(\d+)', pdf_text, re.IGNORECASE)
    if sample_num_match:
        data['sample_number'] = sample_num_match.group(1)

    report_match = re.search(r'Report\s*#[:\s]+(\d+)', pdf_text, re.IGNORECASE)
    if report_match:
        data['report_number'] = report_match.group(1)

    total_thc_match = re.search(r'Total\s*THC[:\s]+(\d+\.?\d*)\s*%',
                                pdf_text, re.IGNORECASE)
    if total_thc_match:
        data['total_thc_percent'] = float(total_thc_match.group(1))

    thca_match = re.search(r'THCa\s+[\d\-\.]+\s+[\d\.]+\s+[\d\.]+\s+([\d\.]+)\s+',
                           pdf_text)
    if thca_match:
        data['thca_percent'] = float(thca_match.group(1))
    else:
        thca_alt = re.search(r'THCa.*?([\d]+\.[\d]+)\s*%', pdf_text, re.IGNORECASE)
        if thca_alt:
            data['thca_percent'] = float(thca_alt.group(1))

    total_cbd_match = re.search(r'Total\s*CBD[:\s]+(\d+\.?\d*)\s*%',
                                pdf_text, re.IGNORECASE)
    if total_cbd_match:
        data['total_cbd_percent'] = float(total_cbd_match.group(1))

    total_cann_match = re.search(r'Total\s*Cannabinoids[:\s]+(\d+\.?\d*)\s*%',
                                 pdf_text, re.IGNORECASE)
    if total_cann_match:
        data['total_cannabinoids_percent'] = float(total_cann_match.group(1))

    total_terp_match = re.search(r'Total\s*Terpenes[:\s]+([\d\.]+)\s*mg/g',
                                 pdf_text, re.IGNORECASE)
    if total_terp_match:
        data['total_terpenes_mg_g'] = float(total_terp_match.group(1))

    terpene_names = [
        'Terpinolene', 'beta-Caryophyllene', 'beta-Myrcene', 'D-Limonene',
        'Linalool', 'alpha-Humulene', 'beta-Pinene', 'trans-Ocimene',
        'alpha-Pinene', 'alpha-Terpineol', 'delta-3-Carene', 'alpha-Phellandrene',
        'alpha-Terpinene', 'Fenchyl Alcohol', 'trans-Nerolidol', 'gamma-Terpinene',
        'Sabinene', 'Borneol', 'Valencene', 'Sabinene Hydrate', 'Camphene',
        'Caryophyllene Oxide', 'Eucalyptol', 'Guaiol', 'alpha-Bisabolol',
        'cis-Nerolidol', 'cis-Ocimene', 'Geraniol', 'Isopulegol',
    ]
    terpenes_found = []
    for terp in terpene_names:
        pattern = rf'{re.escape(terp)}\s+[\d\-\.]+\s+[\d\.]+\s+([\d\.]+)\s+([\d\.]+)'
        match = re.search(pattern, pdf_text, re.IGNORECASE)
        if match:
            mg_g = float(match.group(1))
            percent = float(match.group(2))
            if mg_g > 0 or percent > 0:
                terpenes_found.append({'name': terp, 'mg_g': mg_g,
                                       'percent': percent})
    data['terpenes'] = terpenes_found

    cannabinoid_names = ['CBGA', 'CBG', 'CBD', 'CBDa', 'CBN', 'CBC', 'THCV',
                         'THCVa', 'CBDV', 'd8-THC']
    cannabinoids_found = []
    for cann in cannabinoid_names:
        pattern = rf'{re.escape(cann)}\s+[\d\-\.]+\s+[\d\.]+\s+[\d\.]+\s+([\d\.]+)\s+([\d\.]+)'
        match = re.search(pattern, pdf_text, re.IGNORECASE)
        if match:
            percent = float(match.group(1))
            mg_g = float(match.group(2))
            if percent > 0 or mg_g > 0:
                cannabinoids_found.append({'name': cann, 'percent': percent,
                                           'mg_g': mg_g})
    data['cannabinoids'] = cannabinoids_found

    # Fallback: Kaycha Labs COA layout (vendor COAs — Renew etc. — use this
    # format, which the MCR-style patterns above don't match).
    if not data.get('strain_name') or 'Kaycha Labs' in pdf_text:
        _parse_kaycha(pdf_text, data)
    return data


def _parse_kaycha(pdf_text, data):
    """Fill any still-empty fields from a Kaycha Labs COA layout:
    'Strain: X' · 'Batch #: Y' · 'Metrc Package #:' followed by a 24-char tag ·
    'Completed: MM/DD/YY' · a header row 'THCA D9-THC … CBN' over a '%' value
    row · terpene rows 'LIMONENE 0.020 0.020 TESTED 0.387 3.870'."""
    def _set(key, val):
        if val and not data.get(key):
            data[key] = val

    m = re.search(r'Strain[:\s]+([^\n]+)', pdf_text, re.IGNORECASE)
    if m:
        _set('strain_name', m.group(1).strip())

    m = re.search(r'Batch\s*#[:\s]+(\S+)', pdf_text)
    if m:
        _set('batch_name', m.group(1).strip())
        _set('metrc_batch_id', m.group(1).strip())

    # 24-char alnum tag on/after the "Metrc Package #" label (two-column PDFs
    # interleave lines, so allow up to ~100 chars in between).
    m = re.search(r'Metrc\s*Package\s*#[\s\S]{0,120}?([0-9A-Z]{24})', pdf_text,
                  re.IGNORECASE)
    if m:
        _set('metrc_source_package_id', m.group(1))
    m = re.search(r'Metrc\s*Source\s*Package\s*#[\s\S]{0,120}?([0-9A-Z]{24})',
                  pdf_text, re.IGNORECASE)
    if m:
        _set('metrc_sample_id', m.group(1))

    m = re.search(r'Completed[:\s]+(\d{1,2}/\d{1,2}/\d{2,4})', pdf_text,
                  re.IGNORECASE)
    if m:
        raw = m.group(1)
        for fmt in ('%m/%d/%y', '%m/%d/%Y'):
            try:
                _set('date_analyzed',
                     datetime.strptime(raw, fmt).strftime('%Y-%m-%d'))
                break
            except Exception:
                pass

    # Summary line: 'Total THC Total CBD Total Cannabinoids\n 19.1402% ND 22.0216%'
    m = re.search(r'Total\s*THC\s*Total\s*CBD\s*Total\s*Cannabinoids\s*\n\s*'
                  r'([\d.]+|ND)%?\s+([\d.]+|ND)%?\s+([\d.]+|ND)%',
                  pdf_text, re.IGNORECASE)
    if m:
        def _num(s):
            try:
                return float(s)
            except Exception:
                return None
        # On a Kaycha doc the MCR patterns above mis-grab these from the same
        # summary line, so assign directly rather than fill-if-empty.
        data['total_thc_percent'] = _num(m.group(1)) or data.get('total_thc_percent')
        data['total_cbd_percent'] = _num(m.group(2)) or data.get('total_cbd_percent')
        data['total_cannabinoids_percent'] = (_num(m.group(3))
                                              or data.get('total_cannabinoids_percent'))

    # Cannabinoid grid: header row ends 'CBN', value row starts '%'. Order:
    # TOTAL CANN, TOTAL TAC, TOTAL THC, TOTAL CBD, THCA, D9-THC, CBDA, CBD,
    # CBDV, CBC, THCVA, THCV, CBGA, D8-THC, CBG, CBN.
    m = re.search(r'CBN\s*\n\s*%\s+((?:(?:[\d.]+|ND)\s+){10,20})', pdf_text)
    if m:
        vals = m.group(1).split()
        order = ['total_cann', 'tac', 'total_thc', 'total_cbd', 'THCA',
                 'D9-THC', 'CBDA', 'CBD', 'CBDV', 'CBC', 'THCVA', 'THCV',
                 'CBGA', 'D8-THC', 'CBG', 'CBN']
        parsed = {}
        for name, v in zip(order, vals):
            try:
                parsed[name] = float(v)
            except Exception:
                parsed[name] = None
        _set('thca_percent', parsed.get('THCA'))
        _set('total_thc_percent', parsed.get('total_thc'))
        _set('total_cannabinoids_percent', parsed.get('total_cann'))
        if not data.get('cannabinoids'):
            canns = []
            for name in ('CBGA', 'CBG', 'CBD', 'CBDA', 'CBN', 'CBC', 'THCV',
                         'THCVA', 'CBDV', 'D8-THC'):
                v = parsed.get(name)
                if v:
                    canns.append({'name': name, 'percent': v,
                                  'mg_g': round(v * 10, 4)})
            data['cannabinoids'] = canns

    # Terpene rows: 'LIMONENE 0.020 0.020 TESTED 0.387 3.870' (% then mg/g)
    if not data.get('terpenes'):
        terps = []
        for tm in re.finditer(
                r'^([A-Z][A-Z0-9\- ]{2,40}?)\s+[\d.]+\s+[\d.]+\s+'
                r'(?:TESTED|PASS(?:ED)?)\s+([\d.]+)\s+([\d.]+)\s*$',
                pdf_text, re.MULTILINE):
            name = tm.group(1).strip()
            pct = float(tm.group(2))
            mg = float(tm.group(3))
            if name.upper().startswith('TOTAL TERPENE'):
                _set('total_terpenes_mg_g', mg)
                continue
            if pct > 0 or mg > 0:
                terps.append({'name': name.title(), 'mg_g': mg,
                              'percent': pct})
        if terps:
            data['terpenes'] = terps


# =============================================================================
# PRODUCT MATCHING
# =============================================================================
def find_matching_products(strain_name, products, category_id=None, brand_id=None):
    """STRICT on brand/category, FLEXIBLE on strain name matching."""
    if not strain_name:
        return []
    matches = []
    strain_lower = normalize_text(strain_name)
    strain_variations = [strain_lower]
    for prefix in ['tg ', 'twisted ', 'twisted buds ', 'dope chemist ', 'no bull ']:
        if strain_lower.startswith(prefix):
            strain_variations.append(strain_lower[len(prefix):])
    strain_words = [w for w in strain_lower.split() if len(w) > 2]

    for product in products:
        product_name = normalize_text(product.get('name', ''))
        product_cat_id = product.get('product_category_id')
        product_brand_id = product.get('brand_id')
        if category_id and product_cat_id != category_id:
            continue
        if brand_id and product_brand_id != brand_id:
            continue
        match_score = 0
        match_type = None
        for variation in strain_variations:
            if variation in product_name:
                if variation == product_name:
                    match_score, match_type = 100, 'exact'
                elif product_name.startswith(variation):
                    match_score, match_type = 95, 'starts_with'
                else:
                    match_score, match_type = 85, 'contains'
                break
        if match_score == 0 and len(strain_words) >= 1:
            if all(word in product_name for word in strain_words):
                match_score, match_type = 80, 'all_words_match'
        if match_score == 0 and len(strain_words) >= 1:
            first_word = strain_words[0]
            if len(first_word) >= 4 and first_word in product_name:
                match_score, match_type = 60, 'first_word_match'
        if match_score > 0:
            matches.append({'product': product, 'match_type': match_type,
                            'match_score': match_score})
    matches.sort(key=lambda x: x['match_score'], reverse=True)
    return matches


# =============================================================================
# APEX API
# =============================================================================
_OPS_CACHE = {"at": 0.0, "ops": {}}


def fetch_operations():
    """Operations/facilities dict {name: id}, cached for the process lifetime."""
    import time as _time
    if _OPS_CACHE["ops"] and _time.time() - _OPS_CACHE["at"] < 3600:
        return _OPS_CACHE["ops"]
    all_operations = []
    page = 1
    try:
        while True:
            url = f"{slc.APEX_API_V1}/operations?per_page=100&page={page}"
            response = requests.get(url, headers=slc.apex_headers, timeout=30)
            if response.status_code != 200:
                break
            response_data = response.json()
            operations = response_data.get('data', [])
            if not operations:
                break
            all_operations.extend(operations)
            meta = response_data.get('meta', {})
            if page >= meta.get('last_page', 1):
                break
            page += 1
    except Exception:
        pass
    ops = {op.get('name', 'Unknown'): op.get('id') for op in all_operations}
    if ops:
        _OPS_CACHE["ops"] = ops
        _OPS_CACHE["at"] = _time.time()
    return ops


def default_operation_id(ops_dict):
    for key, val in ops_dict.items():
        if "Twisted Growers" in key:
            return val
    return list(ops_dict.values())[0] if ops_dict else None


def create_cultivar_api(cultivar_name, cultivar_type_id):
    url = f"{slc.APEX_API_V1}/cultivars"
    cultivar_data = {'name': cultivar_name,
                     'product_cultivar_type_id': cultivar_type_id}
    try:
        response = requests.post(url, headers=slc.apex_headers,
                                 json=cultivar_data, timeout=30)
        if response.status_code in (200, 201):
            result = response.json()
            cultivar_id = None
            if isinstance(result, dict):
                if 'cultivar' in result and isinstance(result['cultivar'], dict):
                    cultivar_id = result['cultivar'].get('id')
                elif 'data' in result and isinstance(result['data'], dict):
                    cultivar_id = result['data'].get('id')
                elif 'id' in result:
                    cultivar_id = result['id']
            return True, cultivar_id
        return False, None
    except Exception:
        return False, None


def search_cultivar_by_name(cultivar_name):
    url = f"{slc.APEX_API_V1}/cultivars"
    try:
        params = {'search': cultivar_name, 'per_page': 50}
        response = requests.get(url, headers=slc.apex_headers, params=params,
                                timeout=30)
        if response.status_code == 200:
            result = response.json()
            cultivars = result.get('data', []) or result.get('cultivars', [])
            for c in cultivars:
                if c.get('name', '').lower() == cultivar_name.lower():
                    return c.get('id')
            for c in cultivars:
                if cultivar_name.lower() in c.get('name', '').lower():
                    return c.get('id')
        return None
    except Exception:
        return None


def create_product_api(product_data):
    url = f"{slc.APEX_API_V1}/products"
    try:
        response = requests.post(url, headers=slc.apex_headers,
                                 json=product_data, timeout=30)
        if response.status_code in (200, 201):
            return True, "Product created successfully", response.json()
        return False, f"API Error: {response.text[:300]}", None
    except Exception as e:
        return False, f"Exception: {str(e)}", None


def create_batch_api(batch_data):
    url = f"{slc.APEX_API_V2}/batches"
    try:
        response = requests.post(url, headers=slc.apex_headers,
                                 json=batch_data, timeout=30)
        if response.status_code in (200, 201):
            return True, "Batch created successfully", response.json()
        return False, f"API Error: {response.text[:200]}", None
    except Exception as e:
        return False, f"Exception: {str(e)}", None


def upload_coa_to_batch(batch_id, pdf_bytes, filename):
    upload_url = f"{slc.APEX_API_V1}/batches/{batch_id}/documents"
    upload_headers = {
        'Authorization': slc.apex_headers['Authorization'],
        'Accept': 'application/json',
    }
    try:
        files = {'file': (filename, io.BytesIO(pdf_bytes), 'application/pdf')}
        form_data = {'label': 'Certificate of Analysis'}
        response = requests.post(upload_url, headers=upload_headers,
                                 files=files, data=form_data, timeout=60)
        if response.status_code in (200, 201):
            return True, "COA uploaded successfully"
        return False, f"COA upload failed: {response.text[:100]}"
    except Exception as e:
        return False, f"COA upload error: {str(e)}"


_TERP_CACHE = {"at": 0.0, "lookup": {}}


def fetch_terpenes_list():
    import time as _time
    if _TERP_CACHE["lookup"] and _time.time() - _TERP_CACHE["at"] < 3600:
        return _TERP_CACHE["lookup"]
    all_terpenes = []
    page = 1
    while page <= 10:
        url = f"{slc.APEX_API_V1}/terpenes?page={page}&per_page=50"
        try:
            response = requests.get(url, headers=slc.apex_headers, timeout=30)
            if response.status_code != 200:
                break
            data = response.json()
            terpenes = data.get('data', [])
            if not terpenes:
                break
            all_terpenes.extend(terpenes)
            meta = data.get('meta', {})
            if page >= meta.get('last_page', 1):
                break
            page += 1
        except Exception:
            break
    lookup = {t['name'].lower(): t['id'] for t in all_terpenes}
    if lookup:
        _TERP_CACHE["lookup"] = lookup
        _TERP_CACHE["at"] = _time.time()
    return lookup


def add_terpenes_to_batch(batch_id, terpenes):
    terpene_lookup = fetch_terpenes_list()
    success_count, error_count, errors = 0, 0, []
    for terp in terpenes:
        terp_name = terp.get('name', '').lower()
        terp_percent = terp.get('percent', 0)
        if terp_percent <= 0:
            continue
        terp_id = None
        if terp_name in terpene_lookup:
            terp_id = terpene_lookup[terp_name]
        else:
            mapped_name = TERPENE_NAME_MAP.get(terp_name, '').lower()
            if mapped_name and mapped_name in terpene_lookup:
                terp_id = terpene_lookup[mapped_name]
            else:
                for api_name, api_id in terpene_lookup.items():
                    if terp_name in api_name or api_name in terp_name:
                        terp_id = api_id
                        break
        if not terp_id:
            errors.append(f"Terpene not found: {terp['name']}")
            error_count += 1
            continue
        url = f"{slc.APEX_API_V1}/batches/{batch_id}/terpenes"
        payload = {'terpene_id': terp_id, 'quantity': terp_percent,
                   'measurement': '%'}
        try:
            response = requests.post(url, headers=slc.apex_headers,
                                     json=payload, timeout=30)
            if response.status_code in (200, 201):
                success_count += 1
            else:
                errors.append(f"{terp['name']}: {response.text[:50]}")
                error_count += 1
        except Exception as e:
            errors.append(f"{terp['name']}: {str(e)}")
            error_count += 1
    return success_count, error_count, errors


# =============================================================================
# PRODUCT SOURCE — the metrc inventory cache (Fresh Pull shares it)
# =============================================================================
def get_products(force_fetch=False):
    """All products for matching. Reads the shared metrc inventory cache; if it
    doesn't exist yet, fetches products from Apex and seeds the cache."""
    cache = metrctools.load_cache()
    if cache and cache.get("products") and not force_fetch:
        return cache["products"]
    products = metrctools._fetch_all_products()
    if products:
        cache = cache or {"batches": []}
        cache["products"] = products
        cache["last_updated"] = datetime.now().isoformat(timespec="seconds")
        metrctools.save_cache(cache)
    return products


def slim_product(p):
    return {
        "id": p.get("id"),
        "name": p.get("name", ""),
        "sku": p.get("product_sku") or "",
        "brand_id": p.get("brand_id"),
        "product_category_id": p.get("product_category_id"),
        "listing_price": p.get("listing_price"),
        "units_per_case": p.get("units_per_case"),
    }


# =============================================================================
# UPLOAD STORE + PARSE + PROCESS
# =============================================================================
def store_upload(filename, pdf_bytes):
    uid = uuid.uuid4().hex[:12]
    safe = re.sub(r'[^A-Za-z0-9._ -]', '_', filename or 'COA.pdf')
    path = os.path.join(UPLOAD_DIR, f"{uid}__{safe}")
    with open(path, "wb") as f:
        f.write(pdf_bytes)
    return uid


def load_upload(uid):
    """Returns (pdf_bytes, original_filename) or (None, None)."""
    if not re.fullmatch(r'[0-9a-f]{12}', uid or ''):
        return None, None
    for name in os.listdir(UPLOAD_DIR):
        if name.startswith(uid + "__"):
            path = os.path.join(UPLOAD_DIR, name)
            with open(path, "rb") as f:
                return f.read(), name.split("__", 1)[1]
    return None, None


def parse_upload(filename, pdf_bytes, brand_name, category_name):
    """Parse one COA and match products. Returns the item dict for the UI."""
    brand_id = BRANDS.get(brand_name)
    category_id = PRODUCT_CATEGORIES.get(category_name)
    uid = store_upload(filename, pdf_bytes)
    pdf_text = extract_text_from_pdf(pdf_bytes)
    parsed = parse_coa_data(pdf_text) if pdf_text else parse_coa_data("")
    products = get_products()
    matches = find_matching_products(parsed.get('strain_name', ''), products,
                                     category_id=category_id, brand_id=brand_id)
    match_slims = [slim_product(m['product']) for m in matches][:25]
    return {
        "uid": uid,
        "filename": filename,
        "parsed": parsed,
        "brand_name": brand_name,
        "brand_id": brand_id,
        "category_name": category_name,
        "category_id": category_id,
        "matches": match_slims,
        "selected_product_id": match_slims[0]["id"] if match_slims else None,
        "create_new": len(match_slims) == 0,
        "batch_name": parsed.get('batch_name') or "",
    }


def rematch(strain_name, brand_name, category_name):
    brand_id = BRANDS.get(brand_name)
    category_id = PRODUCT_CATEGORIES.get(category_name)
    products = get_products()
    matches = find_matching_products(strain_name, products,
                                     category_id=category_id, brand_id=brand_id)
    return [slim_product(m['product']) for m in matches][:25]


def search_products(q):
    """Manual search over ALL products — accent-insensitive, ignores filters."""
    qn = normalize_text(q)
    if not qn:
        return []
    hits = []
    for p in get_products():
        if (qn in normalize_text(p.get('name', ''))
                or qn in normalize_text(p.get('product_sku', ''))):
            hits.append(slim_product(p))
            if len(hits) >= 50:
                break
    return hits


def process_item(item):
    """Create product (if requested) + batch + COA upload + terpenes for one
    configured item. Mirrors the Streamlit process_all_batches per-item flow.
    Returns {ok, error?, product_id?, batch_id?, coa_uploaded, terpenes_added}."""
    parsed = item.get('parsed') or {}
    strain_name = parsed.get('strain_name') or 'Unknown'
    pdf_bytes, orig_name = load_upload(item.get('uid', ''))

    ops = fetch_operations()
    op_id = item.get('operation_id') or default_operation_id(ops)

    product_id = None
    if item.get('create_new'):
        cultivar_type_id = CULTIVAR_TYPES.get('Hybrid', 3)
        _, cultivar_id = create_cultivar_api(strain_name, cultivar_type_id)
        if not cultivar_id:
            existing_id = search_cultivar_by_name(strain_name)
            if existing_id:
                cultivar_id = existing_id

        brand_name = item.get('brand_name', 'Unknown')
        product_type = item.get('new_product_type', 'Flower')
        unit_size = item.get('new_unit_size', '1g')
        case_size = int(item.get('new_case_size') or 24)
        product_name = item.get('new_product_name') or (
            f"{brand_name} - {product_type} {unit_size} - {strain_name} "
            f"(Sold in Case of {case_size})")

        product_data = {
            'name': product_name,
            'product_category_id': item.get('category_id'),
            'brand_id': item.get('brand_id'),
            'product_type_id': item.get('new_product_type_id', 245),
            'units_per_case': case_size,
            'product_unit_measurement_id': 14,
            'list_to_buyers': True,
            'for_distributors': True,
            'for_retailers': True,
            'for_wholesalers': False,
            'featured': False,
            'predominate_canabinoid_id': 10,
            'product_cultivar_type_id': cultivar_type_id,
        }
        if cultivar_id:
            product_data['product_cultivar_id'] = cultivar_id

        category_name = item.get('category_name', '')
        if category_name == "Pre-pack":
            product_data['product_grow_environment_id'] = 1
            product_data['product_container_type_id'] = 6
            product_data['product_packaged_unit_size_id'] = \
                UNIT_SIZE_TO_PACKAGED_ID.get(unit_size, 3)
        elif category_name == "Preroll":
            product_data['product_grow_environment_id'] = 1
            product_data['gram_per_preroll'] = UNIT_SIZE_TO_GRAMS.get(unit_size, 1.0)
            product_data['units_per_package'] = 1
        elif category_name in ("Extract", "Cartridge"):
            product_data['unit_size'] = UNIT_SIZE_TO_GRAMS.get(unit_size, 1.0)
            product_data['unit_size_unit_measurement_id'] = 2

        if float(item.get('listing_price') or 0) > 0:
            product_data['listing_price'] = int(float(item['listing_price']) * 100)

        prod_success, prod_msg, prod_result = create_product_api(product_data)
        if not prod_success:
            return {"ok": False, "error": f"Product creation failed: {prod_msg}"}
        product_id = (prod_result or {}).get('product', {}).get('id')
    else:
        product_id = item.get('selected_product_id')

    if not product_id:
        return {"ok": False, "error": "No product ID"}

    # ---- batch ----
    batch_data = {
        'product_id': product_id,
        'name': item.get('batch_name') or parsed.get('batch_name') or 'Batch',
        'operation_id': op_id,
        'hold': False,
        'true_hold': False,
        'pre_order': False,
        'restricted': False,
        'back_order': False,
        'bulk_discounts_enabled': False,
        'tiered_surcharge': False,
        'for_pets': False,
        'disable_inventory_tracking': False,
        'sample_quantity_pulled_from_inventory': False,
    }
    if parsed.get('metrc_source_package_id'):
        batch_data['metrc_package_label'] = parsed['metrc_source_package_id']
    thc_value = parsed.get('thca_percent') or parsed.get('total_thc_percent')
    if thc_value:
        batch_data['predominate_canabinoid_min_or_only'] = thc_value
        batch_data['predominate_canabinoid_unit'] = '%'
    if parsed.get('date_analyzed'):
        try:
            da = datetime.strptime(parsed['date_analyzed'], '%Y-%m-%d')
            batch_data['test_date'] = da.strftime('%Y-%m-%d')
            batch_data['best_by_date'] = (da + timedelta(days=365)).strftime('%Y-%m-%d')
        except Exception:
            pass
    if float(item.get('listing_price') or 0) > 0:
        batch_data['listing_price'] = int(float(item['listing_price']) * 100)
    if int(item.get('inventory_qty') or 0) > 0:
        batch_data['inventory_quantity'] = int(item['inventory_qty'])
        batch_data['quantity'] = int(item['inventory_qty'])

    batch_success, batch_msg, batch_result = create_batch_api(batch_data)
    if not batch_success:
        return {"ok": False, "error": f"Batch creation failed: {batch_msg}",
                "product_id": product_id}

    batch_id = (batch_result or {}).get('batch', {}).get('id')

    # 📊 +1 per line box filled on this created batch (fields that reached Apex)
    filled = [k for k, v in batch_data.items()
              if not isinstance(v, bool) and v not in (None, '', 0, [])]
    tasklog.log_many('batch_field_filled', filled,
                     invoice=item.get('batch_name') or strain_name)

    coa_uploaded = False
    if pdf_bytes and batch_id:
        coa_ok, _ = upload_coa_to_batch(batch_id, pdf_bytes,
                                        orig_name or item.get('filename') or 'COA.pdf')
        if coa_ok:
            coa_uploaded = True
            # 📊 +1 per COA attached
            tasklog.log_task('coa_attached',
                             invoice=item.get('batch_name') or strain_name,
                             detail=orig_name or item.get('filename') or 'COA.pdf')

    terp_ok = 0
    if parsed.get('terpenes') and batch_id:
        terp_ok, _, _ = add_terpenes_to_batch(batch_id, parsed['terpenes'])

    return {"ok": True, "product_id": product_id, "batch_id": batch_id,
            "coa_uploaded": coa_uploaded, "terpenes_added": terp_ok,
            "fields_filled": len(filled)}
