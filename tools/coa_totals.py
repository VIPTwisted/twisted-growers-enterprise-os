"""Read the printed totals off a Certificate of Analysis, whatever the layout.

Massachusetts laboratories print the same figure six different ways, and the
original parser only knew two of them. Of 983 certificates it read 649; the
other 334 were not damaged, they were simply written in a vocabulary it had
never been taught. Three examples, all real:

    Green Valley        TOTAL THC: 25.780 %
    Analytics Labs      Total Active THC 18.112 181.115
    Green Analytics     Total THC 17.1 85 171 .85
    Kaycha              TOTAL TERPENES 0.020 0.020 TESTED 1.439 14.390

The Green Analytics line is not a typo. pdfplumber breaks numbers across spaces
when the PDF kerns digits, so "17.185" arrives as "17.1 85". Any parser that
takes "the first number after the label" reads 17.1 there and is wrong by a
factor that looks plausible - the worst kind of wrong.

So this does not trust position. Every laboratory prints the total twice, once
as a percentage and once as mg/g, and one percent is ten mg/g by definition.
That gives a check the document itself has to satisfy: reconstruct the numbers
on the line, and accept a reading only when the second is ten times the first.
A line that cannot be made to reconcile returns nothing rather than a guess.

Rule A1: never invent a number. Rule B1: a quantity without its unit is not a
number, which is why the mg/g column is what proves the percentage.
"""
import re

# One percent by mass is 1 g per 100 g = 10 mg/g. Definitional, not measured;
# the same constant is recorded in conversion_factors.mg_per_g_per_percent and
# was confirmed against 15 certificates that print both figures.
MG_PER_G_PER_PERCENT = 10.0

NOT_A_NUMBER = re.compile(r'^(ND|N/?A|NT|<\s*LO[QD]|NOT\s+DETECTED|TESTED)$', re.I)


def _tokens(s):
    """Numeric fragments of a line, in order, with words dropped."""
    return re.findall(r'\d*\.?\d+', s)


def reconcile_pair(fragments, tol=0.02):
    """Find the percentage and mg/g the line is really printing.

    Fragments may be split mid-number, so consecutive ones are allowed to join.
    A reading is accepted only when mg/g is ten times the percentage, which is
    true by definition and therefore something the document must satisfy - not
    a threshold anyone chose.
    """
    n = len(fragments)
    best = None
    # i marks the end of the percentage, j the end of the mg/g figure.
    for i in range(1, n):
        for j in range(i + 1, n + 1):
            try:
                pct = float(''.join(fragments[:i]))
                mgg = float(''.join(fragments[i:j]))
            except ValueError:
                continue
            if pct <= 0 or mgg <= 0:
                continue
            expected = pct * MG_PER_G_PER_PERCENT
            if abs(mgg - expected) <= max(tol * expected, 0.02):
                # Prefer the reading that consumes the most of the line, so a
                # short accidental match cannot beat the real one.
                score = j
                if best is None or score > best[2]:
                    best = (pct, mgg, score)
    return (best[0], best[1]) if best else (None, None)


def total_from_line(line, after=0):
    """The percentage printed on one total line, or None if it cannot be proved.

    `after` is where the label ended. Only what follows it is read, because a
    laboratory will happily print two unrelated figures on one line:
    "30.689 % MYCOTOXINS PASS TOTAL THC: 25.780 %". Reading the whole line takes
    the mycotoxin number as the potency.
    """
    tail = line[after:]
    frags = _tokens(tail)
    if not frags:
        return None
    pct, _ = reconcile_pair(frags)
    if pct is not None:
        return pct
    # No mg/g column to check against. Accept a lone percentage only when the
    # per-cent sign is actually printed; anything else is ambiguous, and an
    # ambiguous potency is worse than a missing one.
    if len(frags) == 1 and '%' in tail:
        return float(frags[0])
    return None


# "Active" is THC + THCA x 0.877 - the decarboxylated figure, which is what
# Metrc means by Total THC. "Available" is the raw sum and is a DIFFERENT
# number: one certificate prints Available Cannabinoids 21.260 against Active
# 18.729. Matching the wrong one would overstate potency on every Analytics
# Labs certificate, so Available is excluded rather than treated as a synonym.
LABELS = {
    'total_thc': [r'Total\s+Active\s+THC', r'TOTAL\s+THC', r'Total\s+THC'],
    'total_cbd': [r'Total\s+Active\s+CBD', r'TOTAL\s+CBD', r'Total\s+CBD'],
    'total_terpenes': [r'TOTAL\s+TERPENES?', r'Total\s+Terpenes?'],
    'total_cannabinoids': [r'Total\s+Active\s+Cannabinoids?', r'TOTAL\s+TAC',
                           r'Total\s+Cannabinoids?'],
}
EXCLUDE = re.compile(r'Total\s+Available|=|\bLOD\b|\bLOQ\b|analyzed\s+by|Limit\s+of', re.I)


ANY_LABEL = re.compile(
    r'Total\s+(?:Active\s+)?(?:THC|CBD|Cannabinoids?|Terpenes?)|TOTAL\s+TAC', re.I)
VALUE_SLOT = re.compile(r'\d*\.?\d+\s*%?|ND|N/?A|NT|<\s*LO[QD]', re.I)


def _by_column(header_line, value_line, label_start):
    """Take the value sitting under a label in a header/value pair of lines.

    Matching by ordinal rather than by character offset, because the two lines
    rarely line up character for character once the text is extracted. A slot
    that reads ND is still a slot - skipping it would shift every later column.
    """
    labels = [m.start() for m in ANY_LABEL.finditer(header_line)]
    if not labels:
        return None
    try:
        ordinal = labels.index(label_start)
    except ValueError:
        ordinal = sum(1 for s in labels if s < label_start)
    slots = [s.group().strip() for s in VALUE_SLOT.finditer(value_line)]
    if ordinal >= len(slots):
        return None
    raw = slots[ordinal]
    if NOT_A_NUMBER.match(raw.rstrip('%').strip()):
        return None
    frags = _tokens(raw)
    return float(frags[0]) if frags else None


def parse_totals(text):
    """Every total the certificate actually prints, as percentages."""
    out = {}
    lines = [re.sub(r'[ \t]+', ' ', ln).strip() for ln in text.split('\n')]
    for field, patterns in LABELS.items():
        for pat in patterns:
            hit = None
            for idx, ln in enumerate(lines):
                m = re.search(pat, ln, re.I)
                if not m:
                    continue
                # Definition and footnote lines mention the label but print no
                # measurement: "Total THC: d9-THC + (THCA * 0.877)".
                if EXCLUDE.search(ln):
                    continue
                v = total_from_line(ln, m.end())
                # Some laboratories print a header row of labels with the
                # figures on the line beneath, in the same order:
                #     Total THC   Total CBD   Total Cannabinoids
                #     21.2659%    ND          25.4786%
                # Reading that second line whole gives three unrelated numbers,
                # so the value is taken by POSITION - the nth label takes the
                # nth value. ND counts as a slot: dropping it would shift every
                # figure one column left and silently report CBD as THC.
                if v is None and not _tokens(ln[m.end():]) and idx + 1 < len(lines):
                    v = _by_column(ln, lines[idx + 1], m.start())
                if v is not None:
                    hit = v
                    break
            if hit is not None:
                out[field] = hit
                break
    return out
