"""Fixture tests for the Certificate of Analysis reader.

Every fixture here is a REAL bug that reached the database, kept as the exact text
that caused it. The parser was written, run across 193 certificates, and produced
four figures that were wrong by 0.2% - small enough to look right. They were caught
by comparing against Metrc, not by reading the code, and not by any test, because
there was no test.

That is what this file is for. A parser that reads a legal record needs a suite that
fails when it regresses, not a person who remembers.

Run:  python tools/coa_fixtures.py
Exit 0 means every fixture passed. Anything else means do not ship.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

FIXTURES = []


def fixture(name, why):
    def wrap(fn):
        FIXTURES.append((name, why, fn))
        return fn
    return wrap


# ---------------------------------------------------------------------------
# Each block below is lifted verbatim from a certificate in the archive.
# ---------------------------------------------------------------------------

@fixture('the limit-of-quantitation column is not a measurement',
         'THCA reads "0.200 ND ND" - LOQ 0.200, result NOT DETECTED. Reading the '
         'first number took 0.200 as the value and added 0.877 x 0.2 to four '
         'derived totals, putting every one 0.2% above Metrc. Four wrong potency '
         'figures reached the database and were caught only by the COA-vs-Metrc '
         'check. The original parser had warned about this exact column in a '
         'comment.')
def _loq_is_not_a_result(P):
    text = '\n'.join([
        'Cannabinoid LOQ (%) Result (%) Result (mg/g)',
        'Tetrahydrocannabinolic acid (THCA) 0.200 ND ND',
        '∆9-Tetrahydrocannabinol (∆9-THC) 0.200 86.224 862.24',
        'Total Cannabinoids 93.8 64 938 .64',
    ])
    out = P.parse_totals(text)
    assert out.get('total_thc') is not None, 'nothing read at all'
    assert abs(out['total_thc'] - 86.224) < 0.001, \
        'THCA was ND, so Total THC is d9-THC alone: expected 86.224, got %s' % out['total_thc']
    assert out.get('total_thc_derived') is True, 'a computed total must declare itself'


@fixture('a real THCA value is still added',
         'The ND guard must not swallow genuine measurements. This certificate '
         'reports THCA 0.459 and d9-THC 75.970; Metrc holds 76.3730 for it.')
def _real_thca_is_used(P):
    text = '\n'.join([
        'Cannabinoid LOQ (%) Result (%) Result (mg/g)',
        'Tetrahydrocannabinolic acid (THCA) 0.200 0.459 4.59',
        '∆9-Tetrahydrocannabinol (∆9-THC) 0.200 75.970 759.70',
    ])
    out = P.parse_totals(text)
    expected = 75.970 + 0.459 * P.THCA_TO_THC          # 76.3725
    assert abs(out['total_thc'] - expected) < 0.001, \
        'expected %s, got %s' % (expected, out.get('total_thc'))
    assert abs(out['total_thc'] - 76.3730) < 0.01, \
        'must reproduce what Metrc holds for this package, 76.3730'


@fixture('a formula on the value line is not a definition line',
         'G7 prints "Total THC=THC+THCAX0.877 25.79 Wt.%" - the definition AND the '
         'answer on one line. Excluding every line containing "=" threw away the '
         'only line carrying the figure, and the formula constant 0.877 is a '
         'number too, so token order cannot be trusted.')
def _formula_and_value_same_line(P):
    text = '\n'.join([
        'Potency Calculations Result Unit Range',
        'Total Potency 32.13 Wt.%',
        '★ Total CBD=CBD+CBDAX0.877 0.00 Wt.%',
        '★ Total THC=THC+THCAX0.877 25.79 Wt.%',
        'Total Terpenes 3.29 Wt.%',
    ])
    out = P.parse_totals(text)
    assert out.get('total_thc') == 25.79, \
        'expected the measured 25.79, not the constant 0.877: got %s' % out.get('total_thc')
    assert out.get('total_terpenes') == 3.29


@fixture('a definition line with no measurement is still skipped',
         'The narrower rule must not let a pure footnote through. '
         '"Total THC: d9-THC + (THCA * 0.877)" prints no result.')
def _definition_only_line(P):
    text = '\n'.join([
        'Total THC: ∆9-THC + (THCA * 0.877)',
        'Total CBD: CBD + (CBDA * 0.877)',
    ])
    out = P.parse_totals(text)
    assert out.get('total_thc') is None, \
        'a formula with no result must read as nothing, got %s' % out.get('total_thc')


@fixture('pdfplumber splits numbers across spaces',
         'Green Analytics kerning turns 17.185 into "17.1 85" and 171.85 into '
         '"171 .85". Taking the first number reads 17.1 - wrong by a factor that '
         'looks entirely plausible, which is the worst kind of wrong. The mg/g '
         'column is ten times the percentage by definition, so the document '
         'proves its own reading.')
def _split_numbers(P):
    out = P.parse_totals('Total THC 17.1 85 171 .85')
    assert out.get('total_thc') is not None, 'nothing read'
    assert abs(out['total_thc'] - 17.185) < 0.0001, \
        'expected 17.185 reconstructed against 171.85, got %s' % out['total_thc']


@fixture('mg/g must be ten times the percentage or the reading is refused',
         'The reconciliation is the whole safety net. If the two columns do not '
         'agree by definition, the line is not understood and nothing is better '
         'than a guess (rule A1).')
def _reconciliation_refuses_nonsense(P):
    # 17.185 against 999.99 cannot both be the same measurement
    out = P.parse_totals('Total THC 17.185 999.99')
    assert out.get('total_thc') is None, \
        'columns that do not reconcile must read as nothing, got %s' % out.get('total_thc')


@fixture('"Total Active" and "Total Available" are different figures',
         'Analytics Labs prints both. Available Cannabinoids 21.260 against Active '
         '18.729 on one certificate. Active is THC + THCA x 0.877, which is what '
         'Metrc means; matching Available would overstate potency on every '
         'Analytics Labs certificate.')
def _active_not_available(P):
    text = '\n'.join([
        'Total Available THC 21.260 212.60',
        'Total Active THC 18.112 181.115',
    ])
    out = P.parse_totals(text)
    assert abs(out['total_thc'] - 18.112) < 0.001, \
        'must take Active, not Available: got %s' % out.get('total_thc')


@fixture('a header row with values beneath is read by position',
         'Some laboratories print the labels on one line and the figures on the '
         'next, in the same order. Reading the second line whole gives three '
         'unrelated numbers. ND counts as a slot: dropping it shifts every figure '
         'one column left and silently reports CBD as THC.')
def _header_then_values(P):
    text = '\n'.join([
        'Total THC Total CBD Total Cannabinoids',
        '21.2659% ND 25.4786%',
    ])
    out = P.parse_totals(text)
    assert out.get('total_thc') is not None, 'nothing read from the column layout'
    assert abs(out['total_thc'] - 21.2659) < 0.001, \
        'expected 21.2659 from the first column, got %s' % out['total_thc']


@fixture('a certificate that measures no potency yields no potency',
         '163 of 983 documents are pesticide, microbial or heavy-metal '
         'certificates - a laboratory issues several per sample and Metrc files '
         'them all as COA. They read perfectly and contain no THC figure. '
         'Returning a number from one would be an invention; counting the absence '
         'as a parser failure sent an estimate of 193 OCR jobs that were not real.')
def _non_potency_certificate(P):
    text = '\n'.join([
        'Twisted Growers Certificate of Analysis',
        'Pesticides Pass Date Completed: 07/11/2025 2:49PM',
        'Compound LOD LOQ Limits (ppb) Result (ppb) Status',
        '1 Bifenazate 2.5792 7.7377 10 ND Pass',
        '2 Bifenthrin 5.1561 15.4683 10 ND Pass',
    ])
    out = P.parse_totals(text)
    assert out.get('total_thc') is None, \
        'a pesticide screen has no potency to report, got %s' % out.get('total_thc')


@fixture('a derived total always declares itself',
         'Computing THC + 0.877 x THCA from printed components reproduces Metrc to '
         'four decimals, but it is still derived. A figure nobody can tell was '
         'computed is a figure nobody can check.')
def _derived_is_labelled(P):
    text = '\n'.join([
        'Cannabinoid LOQ (%) Result (%) Result (mg/g)',
        'Tetrahydrocannabinolic acid (THCA) 0.200 1.000 10.00',
        '∆9-Tetrahydrocannabinol (∆9-THC) 0.200 20.000 200.00',
    ])
    out = P.parse_totals(text)
    assert out.get('total_thc_derived') is True, 'derived figure not flagged'
    assert out.get('total_thc_basis'), 'derived figure carries no basis'
    assert '0.877' in out['total_thc_basis'], 'the basis must state the factor used'


@fixture('the decarboxylation factor is not a tunable',
         'THCA becomes THC at 0.877 of its mass - the ratio of molecular weights, '
         'printed verbatim on certificates that show their working. If someone '
         '"tunes" it to make a figure agree, every derived potency moves.')
def _factor_is_definitional(P):
    assert P.THCA_TO_THC == 0.877, \
        'the decarboxylation factor was changed from 0.877 to %s' % P.THCA_TO_THC
    assert P.MG_PER_G_PER_PERCENT == 10.0, \
        'one percent is ten mg/g by definition, not %s' % P.MG_PER_G_PER_PERCENT


def main():
    try:
        import coa_totals as P
    except Exception as e:                                   # pragma: no cover
        print('cannot import the reader:', e)
        return 2

    passed = failed = 0
    for name, why, fn in FIXTURES:
        try:
            fn(P)
            print('  PASS  %s' % name)
            passed += 1
        except AssertionError as e:
            print('  FAIL  %s' % name)
            print('        why it matters: %s' % why)
            print('        %s' % e)
            failed += 1
        except Exception as e:
            print('  ERROR %s: %s: %s' % (name, type(e).__name__, e))
            failed += 1

    print()
    print('%d passed, %d failed, %d fixtures' % (passed, failed, len(FIXTURES)))
    if failed:
        print('DO NOT SHIP. A change has broken a certificate that was reading correctly.')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
