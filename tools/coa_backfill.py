"""Re-read the certificates whose totals were never parsed.

334 of 983 certificates carried no potency figure. None of them were damaged:
the parser knew two laboratories' layouts and there are at least six in use.
This re-reads only those, with the layout-independent reader in coa_totals.

It never overwrites a figure that is already held - a value already read stays,
so a re-run cannot quietly change history. Anything still unreadable is left
null and counted, because a certificate we cannot read is a fact worth knowing.
"""
import io
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from coa_totals import parse_totals                                  # noqa: E402

SUPA = 'https://fxetuqjryttnypgepsru.supabase.co'
KEY = os.environ.get('SUPA_KEY', '')
# The coa-extract endpoint, not the REST tables: anon has no read on coa_extract
# and should not - the function holds the admin key and does the reading for us.
FN = SUPA + '/functions/v1/coa-extract'
HDR = {'x-admin-key': 'tg-seed-8f3k2m-2026',
       'Authorization': 'Bearer ' + KEY,
       'Content-Type': 'application/json'}


def read_pdf_bytes(data):
    import logging
    import pdfplumber
    logging.getLogger('pdfminer').setLevel(logging.ERROR)
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return '\n'.join((p.extract_text() or '') for p in pdf.pages)


def unread(limit=1000):
    req = urllib.request.Request(FN + '?unread=%d' % limit, headers=HDR)
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


def store(rows):
    req = urllib.request.Request(FN, data=json.dumps({'rows': rows}).encode(),
                                 headers=HDR, method='POST')
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def main():
    if not KEY:
        print('SUPA_KEY is not set.')
        return 2

    info = unread()
    todo = info.get('documents', [])
    print('%d certificates carry no potency; %d have a document to re-read'
          % (info.get('unread_total', 0), len(todo)))

    batch, read, failed = [], 0, 0
    for i, d in enumerate(todo, 1):
        try:
            with urllib.request.urlopen(d['download_url'], timeout=120) as r:
                vals = parse_totals(read_pdf_bytes(r.read()))
            if vals.get('total_thc') is not None:
                batch.append({'document_id': d['metrc_id'],
                              'package_tag': d.get('package_tag'),
                              'parser_version': 'coa_totals-1',
                              **{k: v for k, v in vals.items()
                                 if k in ('total_thc', 'total_cbd',
                                          'total_terpenes', 'total_cannabinoids')}})
                read += 1
            else:
                failed += 1
        except Exception as e:                                    # noqa: BLE001
            failed += 1
            if failed <= 5:
                print('  %s: %s' % (d['metrc_id'], str(e)[:70]))
        if len(batch) >= 50:
            store(batch); batch = []
        if i % 25 == 0:
            print('  %d/%d  read=%d unreadable=%d' % (i, len(todo), read, failed))
        time.sleep(0.05)

    if batch:
        store(batch)
    print('DONE  newly read=%d  still unreadable=%d' % (read, failed))
    return 0


if __name__ == '__main__':
    sys.exit(main())
