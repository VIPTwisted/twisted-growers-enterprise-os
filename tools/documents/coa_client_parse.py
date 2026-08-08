#!/usr/bin/env python3
"""Read the cultivator / manufacturer / processor of record off a COA.

The certificate is the ONLY independent source for who grew or made the
material. Every Metrc field shares one origin and cannot disconfirm another.

Five layouts are in the 983 stored certificates. All of them name the client;
they just label it differently:

  Green Analytics  'Client Info'   -> name / address / 'License: MB282344'
  Safetiva Labs    'CULTIVATOR INFO' -> 'CULTIVATOR' / name / addr / 'LICENSE' / 'MC281714'
  MCR-style        name on line 1  -> 'License #: MC281714, MP281909'
  Analytics Labs   'Client'        -> name / 'Lic. # MC281970' / address
  Kaycha           name            -> address / 'License # : MC282761'

The robust anchor across all five: a Massachusetts LAB licence is always IL####,
so any MC/MP/MB/MR/MT/RMD licence in the header region belongs to the CLIENT.
"""
import re
import sys
import json

# Client licence classes. IL is deliberately excluded - that is the laboratory.
CLIENT_LIC = re.compile(r'\b((?:MC|MP|MB|MR|MT|MD)\d{6}|RMD\d{3,4}(?:-[A-Z])?)\b')
LAB_LINE = re.compile(r'(laborator|accredit|lab licen|iso/iec|independent testing)', re.I)
# Address, website and phone lines that sit between the company name and its
# licence. Anything matching is part of the address block, not the name.
NOT_A_NAME = re.compile(
    r'(\.com|\.net|\.org|https?:|@'                       # website / email
    r'|^\d+\s+\w'                                          # 248 State road
    r'|,\s*[A-Z]{2},?\s*\d{5}'                             # Westport, MA, 02878
    r'|^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}'               # phone
    r'|^(suite|ste\.?|unit|floor|po box)\b)', re.I)
HEADER_LINES = 40


def left_cell(line):
    parts = [p for p in re.split(r'\s{2,}', line.strip()) if p]
    return parts[0] if parts else ''


def _clean_name(s):
    s = re.split(r'\s*(?:METRC|Metrc)\s+\w+\s*(?:ID)?\s*:', s)[0]
    s = re.sub(r'\s{2,}.*$', '', s).strip(' .,')
    return s or None


def parse(text):
    out = {k: None for k in (
        'client_name', 'client_license', 'client_address', 'lab_report_id',
        'metrc_batch_id', 'metrc_sample_id', 'metrc_source_id',
        'manifest_on_coa', 'report_date', 'layout', 'parse_note')}
    lines = text.splitlines()
    head = lines[:HEADER_LINES]
    head_txt = '\n'.join(head)

    # ---- identification fields, label-anchored, any layout ----------------
    for key, pats in (
        ('metrc_batch_id',  (r'METRC Batch ID:\s*(.+?)\s*$', r'BATCH NO\.:\s*(.+?)\s*$',
                             r'Batch ID:\s*(.+?)\s{2,}', r'Batch #:\s*(.+?)\s{2,}')),
        ('metrc_sample_id', (r'METRC Sample ID:\s*(\S+)', r'METRC Sample:\s*(\S+?);',
                             r'TEST PKG:\s*(\S+)')),
        ('metrc_source_id', (r'METRC Source ID:\s*(\S+)', r'Metrc Source ID:\s*(\S+)',
                             r'SRC PKG:\s*(\S+)')),
        ('manifest_on_coa', (r'Metrc Manifest:\s*(\S+?)[;\s]', r'METRC Manifest:\s*(\S+?)[;\s]')),
        ('lab_report_id',   (r'Report ID:\s*(\S+)', r'Report #:\s*(\S+)',
                             r'Sample ID:\s*(\S+)', r'Lab ID:\s*(\S+)')),
        ('report_date',     (r'Report Submitted:\s*([0-9/\-]+)', r'Date Released:\s*([0-9/]+)',
                             r'PRODUCED:\s*([A-Z]{3} \d{1,2}, \d{4})', r'Produced:\s*([0-9/]+)')),
    ):
        for p in pats:
            m = re.search(p, text, re.M)
            if m:
                v = m.group(1).strip().rstrip(';,')
                if v and v.upper() not in ('N/A', 'NA'):
                    out[key] = v
                    break

    # ---- client licence: any non-lab MA licence in the header -------------
    for ln in head:
        if LAB_LINE.search(ln):
            continue
        m = CLIENT_LIC.search(ln)
        if m:
            # 'License #: MC281714, MP281909' - keep all of them, comma joined
            allm = CLIENT_LIC.findall(ln)
            out['client_license'] = ', '.join(dict.fromkeys(allm))
            break

    # ---- client name, by layout signature ---------------------------------
    def after_marker(marker, skip=0, exact=False):
        for i, ln in enumerate(head):
            cell = left_cell(ln)
            hit = (cell.strip().upper() == marker) if exact else (marker in ln.upper())
            if hit:
                got = []
                for j in range(i + 1 + skip, min(i + 6, len(head))):
                    c = _clean_name(left_cell(head[j]))
                    if not c:
                        continue
                    if re.match(r'^(LICENSE|License|Lic\.|Metrc|METRC|Date|Sample|Batch)', c):
                        break
                    got.append(c)
                    if len(got) >= 3:
                        break
                return got
        return []

    body = []
    # MCR Labs: 'Client:' label, name on the following LEFT-column lines (it can
    # wrap onto two), then the address. MCR does NOT print the client's licence
    # number anywhere - so the certified answer here is the NAME alone. Record it
    # and leave client_license null rather than inventing one.
    if re.search(r'^\s*Client:', head_txt, re.M) and 'Client Info' not in head_txt:
        out['layout'] = 'mcr_labs'
        for i, ln in enumerate(head):
            if re.match(r'^\s*Client:', ln):
                got = []
                for j in range(i + 1, min(i + 6, len(head))):
                    c = _clean_name(left_cell(head[j]))
                    if not c:
                        continue
                    if NOT_A_NAME.search(c):
                        break                      # address reached - name done
                    got.append(c)
                if got:
                    body = [' '.join(got)]         # rejoin a wrapped name
                break

    # Safetiva labels the block by ROLE, and the role changes with the product:
    # CULTIVATOR INFO on flower, MANUFACTURER INFO on a pre-roll. Same block,
    # same meaning - the party that made the material.
    safetiva_role = next(
        (r for r in ('CULTIVATOR', 'MANUFACTURER', 'PROCESSOR', 'DISTRIBUTOR')
         if r + ' INFO' in head_txt.upper()), None)
    if safetiva_role:
        out['layout'] = 'safetiva_' + safetiva_role.lower()
        body = after_marker(safetiva_role, exact=True) or after_marker(safetiva_role + ' INFO')
    elif 'Client Info' in head_txt:
        out['layout'] = 'green_analytics'
        body = after_marker('CLIENT INFO')
    elif re.search(r'Lic\.\s*#', head_txt):
        out['layout'] = 'analytics_labs'
        # right-hand column: name sits beside 'Client', licence on 'Lic. #'
        for i, ln in enumerate(head):
            if left_cell(ln).strip().lower() == 'client':
                for j in range(i + 1, min(i + 5, len(head))):
                    cells = [c for c in re.split(r'\s{2,}', head[j].strip()) if c]
                    if cells:
                        cand = _clean_name(cells[-1])
                        if cand and not re.match(r'^(Lic\.|Expiration|Batch|Completed)', cand):
                            body = [cand]
                            break
                break
        if not body:
            m = re.search(r'\n\s*([A-Z][^\n]{2,60}?)\s*\n[^\n]*Lic\.\s*#', head_txt)
            if m:
                body = [_clean_name(m.group(1))]
    else:
        # MCR-style and Kaycha: name is the nearest non-empty left cell ABOVE
        # the licence line.
        out['layout'] = 'name_above_licence'
        lic_i = None
        for i, ln in enumerate(head):
            if LAB_LINE.search(ln):
                continue
            if re.search(r'Licen[sc]e\s*#?\s*:', ln) and CLIENT_LIC.search(ln):
                lic_i = i
                break
        if lic_i is not None:
            # Walk UP past the address block. Kaycha stacks
            # name / street / city,ST,zip / website / License #, so the nearest
            # line above the licence is the website, not the company.
            addr = []
            for j in range(lic_i - 1, max(lic_i - 7, -1), -1):
                c = _clean_name(left_cell(head[j]))
                if not c or re.match(r'^(Certificate|CERTIFICATE|Page|Pages)', c):
                    continue
                if NOT_A_NAME.search(c):
                    addr.append(c)
                    continue
                body = [c] + ([' '.join(reversed(addr))] if addr else [])
                break
        if not body:
            for ln in head:
                c = _clean_name(left_cell(ln))
                if c and len(c) > 2 and not re.match(r'^(Certificate|CERTIFICATE|REGULATORY)', c):
                    body = [c]
                    break

    body = [b for b in (body or []) if b]
    if body:
        out['client_name'] = body[0]
        if len(body) > 1:
            out['client_address'] = ' '.join(body[1:])
    if not out['client_license']:
        out['parse_note'] = 'NO CLIENT LICENCE FOUND'
    elif not out['client_name']:
        out['parse_note'] = 'licence found, no name'
    return out


if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8', errors='replace') as fh:
        print(json.dumps(parse(fh.read()), indent=2))
