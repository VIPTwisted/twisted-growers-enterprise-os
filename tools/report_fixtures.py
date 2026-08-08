"""Fixture tests for the Metrc report parser.

Six parser faults reached the database on 6-7 August 2026 and every one was found
by a person reading output, not by anything automatic. This is the missing piece:
a known input with a known expected answer, asserted on every change.

Each fixture is a small excerpt of a REAL Metrc export, kept verbatim, together
with what the parser must produce from it. They are deliberately tiny so the
expected answer can be checked by eye.

Run:  python tools/report_fixtures.py
Exit code 0 means every fixture passed. Anything else means do not ship.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# The parser under test. Imported without its network side, so the fixtures can
# run anywhere without credentials.
os.environ.setdefault('SUPA_KEY', 'fixtures-do-not-call-out')

FIXTURES = []


def fixture(name, why):
    def wrap(fn):
        FIXTURES.append((name, why, fn))
        return fn
    return wrap


# --------------------------------------------------------------------------
# Each grid below is a real export's shape. Blank strings are blank cells.
# --------------------------------------------------------------------------

@fixture('banner is not the header',
         'The banner has label/value rows with three cells. Taking the FIRST row '
         'with three cells picked "Packaged Facility Name | Twisted Growers LLC | '
         'Lab Facility Name" as the header and the whole file failed detection.')
def _banner(P):
    grid = [
        ['Lab Results'],
        ['From 1/1/2025 To 8/6/2026'],
        [''],
        ['Packaged Facility Name', 'Twisted Growers LLC', 'Lab Facility Name'],
        ['Packaged Facility License', 'MP281909', 'Lab Facility License'],
        ['Total Records: 2'],
        ['Lab Lic. No.', 'Lab Facility', 'Package', 'Test Name', 'Result', 'Overall'],
        ['IL281354', 'SafeTiva', '1A40TAG001', 'Total THC (%)', '25.78', 'Yes'],
        ['IL281354', 'SafeTiva', '1A40TAG002', 'Total CBD (%)', '0.10', 'Yes'],
    ]
    head, rows = P.to_rows(grid)
    assert head[0] == 'Lab Lic. No.', f'header row wrong: {head[:3]}'
    assert len(rows) == 2, f'expected 2 rows, got {len(rows)}'
    assert rows[0]['Package'] == '1A40TAG001'
    assert P.stated_total(grid) == 2


@fixture('grand total footer is not a record',
         'One footer row was stored as a $1.69M sale - 30% of all revenue.')
def _footer(P):
    grid = [
        ['Wholesale Transfers'],
        ['Total Records: 2'],
        ['Manifest', 'Item', 'Item Category', 'Amount'],
        ['0001', 'Bud A', 'Buds', '$1,000.00S\n$1,000.00R'],
        ['0002', 'Bud B', 'Buds', '$2,000.00S\n$2,000.00R'],
        ['', '', 'Totals:', '$3,000.00S\n$3,000.00R'],
    ]
    head, rows = P.to_rows(grid)
    assert len(rows) == 2, f'the footer was kept: {len(rows)} rows'
    assert all('Totals:' not in str(r.values()) for r in rows)
    assert len(rows) == P.stated_total(grid)


@fixture('grouped rows carry the group value down',
         'Test Batches prints the harvest once and leaves it blank on the package '
         'rows beneath. Requiring both dropped 396 of 739 rows.')
def _grouped(P):
    grid = [
        ['Test Batches'],
        ['Total Records: 3'],
        ['Harvest Batch', 'Package Tag', 'Test Batch Name'],
        ['TG Chimera - 2026', 'PKG001', 'Batch A'],
        ['', 'PKG002', 'Batch A'],
        ['', 'PKG003', 'Batch B'],
    ]
    head, rows = P.to_rows(grid)
    assert len(rows) == 3, f'expected 3, got {len(rows)}'
    assert all(r['Harvest Batch'] == 'TG Chimera - 2026' for r in rows), \
        'the harvest did not carry down'


@fixture('sub-detail rows merge upward, they are not records',
         'Plants Destroyed puts the destruction detail on a second row per plant. '
         'Read as records it doubled every plant: 7,544 rows for 3,772 plants.')
def _paired(P):
    grid = [
        ['Plants Destroyed'],
        ['Total Records: 2'],
        ['Plant', 'Plant Batch', 'Strain', 'Location', 'Phase'],
        ['1A40PLANT001', 'Batch1', 'Chimera', 'Mother Room', 'Clone'],
        ['Destroyed Note', 'No longer need', 'Destroyed Date', '45332.0', 'User', 'J Dixon'],
        ['1A40PLANT002', 'Batch1', 'Chimera', 'Mother Room', 'Clone'],
        ['Destroyed Note', 'No longer need', 'Destroyed Date', '45332.0', 'User', 'J Dixon'],
    ]
    head, rows = P.to_rows(grid)
    assert len(rows) == 2, f'plants were doubled: {len(rows)} rows for 2 plants'
    assert rows[0]['Destroyed Note'] == 'No longer need', 'sub-detail did not merge'
    assert rows[0]['User'] == 'J Dixon'
    assert len(rows) == P.stated_total(grid)


@fixture('repeated column labels are kept, not rejected',
         "Metrc prints Ship'd / Rcv'd / % Var twice - once for count, once for "
         'weight. Demanding unique labels rejected the whole file.')
def _repeated(P):
    grid = [
        ['Transfers'],
        ['Total Records: 1'],
        ['Manifest', "Ship'd", "Rcv'd", '% Var', "Ship'd", "Rcv'd", '% Var'],
        ['0001', '10\nea', '10\nea', '0', '5\nlb', '5\nlb', '0'],
    ]
    head, rows = P.to_rows(grid)
    assert len(rows) == 1, 'the file was rejected'
    assert "Ship'd" in rows[0] and "Ship'd (2)" in rows[0], \
        f'repeated labels lost: {list(rows[0].keys())}'
    assert rows[0]["Ship'd"] == '10\nea'
    assert rows[0]["Ship'd (2)"] == '5\nlb'


@fixture('the licence comes from the filename, never a data row',
         'A grid export has no banner, so scanning its opening rows found the '
         "DESTINATION licence and stamped 13,294 manufacturing rows with a "
         "customer's retail licence.")
def _licence(P):
    grid = [
        ['Destination License', 'Manifest Number', 'Package'],
        ['MR281571', '0001', 'PKG001'],
    ]
    _, _, lic = P.banner(grid)
    assert lic is None, f'a customer licence was accepted: {lic}'
    assert 'MR281571' not in P.OUR_LICENCES


@fixture('the as-of date is read from the banner, not the upload day',
         'Inventory Point in Time prints its as-of date on the line under the '
         'title. Not reading it made the platform ask a person for it.')
def _asof(P):
    grid = [
        ['Inventory Point in Time'],
        ['1/1/2025'],
        [''],
        ['License', 'MC281714'],
        ['Total Records: 1'],
        ['Type', 'Tag Number', 'Name'],
        ['Package', 'PKG001', 'Something'],
    ]
    title, as_of, lic = P.banner(grid)
    assert as_of == '2025-01-01', f'as-of not read: {as_of}'
    assert lic == 'MC281714', f'licence not read: {lic}'


@fixture('an Excel serial date is a date, not a number',
         'Metrc writes dates as 1900-system serials. The expected value here is '
         'DERIVED from a verifiable anchor, not remembered - the first version of '
         'this fixture asserted a date from memory and the fixture itself was the '
         'thing that was wrong.')
def _serial(P):
    import datetime
    # Anchor: serial 45292 is 1 January 2024 in the Excel 1900 system, which puts
    # the effective epoch at 1899-12-30 because of the 1900 leap-year bug.
    epoch = datetime.date(1899, 12, 30)
    assert (epoch + datetime.timedelta(days=45292)).isoformat() == '2024-01-01', \
        'the anchor is wrong - check the epoch before trusting anything below'
    for serial in (45292, 45332, 46231):
        expected = (epoch + datetime.timedelta(days=serial)).isoformat()
        got = P.excel_date(f'{serial}.0')
        assert got == expected, f'serial {serial}: expected {expected}, got {got}'
    assert P.excel_date('not a date') is None
    assert P.excel_date('3.5') is None, 'a small number is a quantity, not a date'


@fixture('one file can hold both licences, so the licence is per row',
         'TransfersReport.csv holds 13,553 manufacturing rows and 3,440 cultivation '
         'rows in one export. Stamping a single licence on the file would misfile '
         '3,440 of them - the same fault that once stamped 13,294 rows with a '
         "customer's retail licence.")
def _perrow_licence(P):
    rows = [
        {'Manifest': '1', 'Origin Lic.': 'MP281909', 'Dest. Lic.': 'MR999999'},   # outbound, ours is origin
        {'Manifest': '2', 'Origin Lic.': 'MC281714', 'Dest. Lic.': 'MR999999'},   # outbound, other licence
        {'Manifest': '3', 'Origin Lic.': 'MR888888', 'Dest. Lic.': 'MP281909'},   # INBOUND, ours is destination
        {'Manifest': '4', 'Origin Lic.': 'MR888888', 'Dest. Lic.': 'MR999999'},   # neither is ours
    ]
    assert P.row_licence(rows[0]) == 'MP281909'
    assert P.row_licence(rows[1]) == 'MC281714'
    assert P.row_licence(rows[2]) == 'MP281909', 'an inbound row is ours by DESTINATION'
    assert P.row_licence(rows[3], 'MC281714') == 'MC281714', 'must fall back to the file licence'
    assert P.row_licence(rows[3]) is None, 'never invent a licence'

    groups = P.split_by_licence(rows, None)
    assert sorted(k or '-' for k in groups) == ['-', 'MC281714', 'MP281909'], \
        'rows were not split by owning licence: %s' % list(groups)
    assert len(groups['MP281909']) == 2 and len(groups['MC281714']) == 1
    assert sum(len(v) for v in groups.values()) == len(rows), 'splitting lost rows'


def main():
    try:
        import pushreports as P
    except Exception as e:                                   # pragma: no cover
        print('cannot import the parser:', e)
        return 2

    passed = failed = 0
    for name, why, fn in FIXTURES:
        try:
            fn(P)
            print(f'  PASS  {name}')
            passed += 1
        except AssertionError as e:
            print(f'  FAIL  {name}')
            print(f'        why it matters: {why}')
            print(f'        {e}')
            failed += 1
        except Exception as e:
            print(f'  ERROR {name}: {type(e).__name__}: {e}')
            failed += 1

    print()
    print(f'{passed} passed, {failed} failed, {len(FIXTURES)} fixtures')
    if failed:
        print('DO NOT SHIP. A parser change has broken a known-good file.')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
