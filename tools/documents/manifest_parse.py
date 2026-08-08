#!/usr/bin/env python3
"""Read destination and transporter off a Metrc transportation manifest.

WHY: metrc_transfers holds 2,550 outgoing manifests and EVERY ONE has a null
recipient. Metrc returns the recipient on the DELIVERY
(/transfers/v2/{id}/deliveries), not on the transfer header, and the sync only
ever pulled the header. So the platform can see everything that came in and
nothing about where anything went - half the seed-to-sale chain of custody,
and it is the half that covers sales, storage movements and lab runs.

The manifest PDF prints it all. 2,683 are already on disk.

LAYOUT WARNING: pdftotext -layout puts labels in the left column and values in
the right, but the two are OFFSET BY ONE LINE:

    1. Destination                   Jushi MA, Inc.
                                     1673                  <- invoice number
    Invoice Number                   MR282118              <- destination licence
    Destination License Number       420 Middlesex Street  <- address line 1
    Address of Destination           Tyngsborough, MA 01879

Pairing label to value on the same line therefore gives the WRONG answer every
time. Anchor on licence-number PATTERNS instead, and take the destination name
from the '1. Destination' line itself.
"""
import re
import sys
import json

# Massachusetts licence classes. MX = transporter, IL = laboratory.
#
# NOT ALWAYS SIX DIGITS. `MD1321` (Dris Corporation) is a real, live counterparty on this
# account and carries FOUR. A `\d{6}` pattern does not match it, and the licence then does
# not exist as far as the parser is concerned - so on manifest 0002880199 the destination
# came back empty and on 0002872108 the ORIGIN did, which silently promoted our own licence
# from the destination block into the origin slot. Verified against both PDFs, 7 Aug 2026.
ANY_LIC = re.compile(r'\b((?:MC|MP|MB|MR|MT|MD|MX|IL)\d{3,6}|RMD\d{3,4}(?:-[A-Z])?)\b')
TRANSPORTER = re.compile(r'\bMX\d{3,6}\b')
LAB = re.compile(r'\bIL\d{3,6}\b')
OURS = ('MC281714', 'MP281909')

# Section anchors. Under `pdftotext -layout` a Metrc manifest always prints these three
# blocks in this order: Originating Entity, then Destination, then Outbound Transporter.
# Checked on 137 real manifests spanning Jan 2024 - Aug 2026, incoming, outgoing and
# internal: the order held on every one, and the licence inside each block matched the
# Metrc transfer record exactly (origin 120/120, destination 80/80 wherever Metrc records
# a recipient at all).
ORIG_ANCHOR = re.compile(r'Originating\s+Entity', re.I)
DEST_ANCHOR = re.compile(r'^\s*\d*\.?\s*Destination\b', re.I)
TRANS_ANCHOR = re.compile(r'(?:Outbound\s+)?Transporter\b', re.I)

# Right-hand column labels that share a physical line with the Destination label. Taking
# the second cell blindly returns one of these as the destination NAME.
RIGHT_COL = re.compile(
    r'^(Date\b|Time\b|Invoice\b|Notes\b|No Layover|For Agency|Leg of|Signature|Employee ID)', re.I)


def value_cell(line):
    """The VALUE beside a label - the SECOND column, not the last.

    A manifest line commonly carries THREE columns, a left label, its value, and
    an unrelated right-hand field:

        1. Destination      Jushi MA, Inc.      Time of Departure   8/11/2026 9:00 AM
        1. Outbound Transporter   Dris Corporation      No Layover Scheduled

    Taking the last cell returns '8/11/2026 9:00 AM' as the destination name and
    'No Layover Scheduled' as the transporter. Both were observed. Take parts[1].
    """
    parts = [p for p in re.split(r'\s{2,}', line.strip()) if p]
    return parts[1] if len(parts) > 1 else ''


def parse(text):
    out = {k: None for k in (
        'manifest_no', 'origin_name', 'origin_license', 'destination_name',
        'destination_license', 'transporter_name', 'transporter_license',
        'date_created', 'departure', 'arrival', 'is_lab_run', 'parse_note')}
    lines = text.splitlines()
    head = lines[:70]

    m = re.search(r'Manifest No\.\s+(\d+)', text)
    if m:
        out['manifest_no'] = m.group(1)
    m = re.search(r'Originating Entity\s{2,}(.+?)\s{2,}', text)
    if m:
        out['origin_name'] = m.group(1).strip()
    m = re.search(r'Date Created\s+([\d/]+\s+[\d:]+\s*[AP]M)', text)
    if m:
        out['date_created'] = m.group(1).strip()
    m = re.search(r'Time of Departure\s+([\d/]+\s+[\d:]+\s*[AP]M)', text)
    if m:
        out['departure'] = m.group(1).strip()
    m = re.search(r'Time of Arrival\s+([\d/]+\s+[\d:]+\s*[AP]M)', text)
    if m:
        out['arrival'] = m.group(1).strip()

    # ------------------------------------------------------------------
    # WHERE THE THREE BLOCKS START. Everything below is read POSITIONALLY,
    # from inside its own block. Nothing is inferred from who we are.
    # ------------------------------------------------------------------
    orig_i = _find(head, ORIG_ANCHOR, 0)
    dest_i = _find(head, DEST_ANCHOR, orig_i + 1 if orig_i is not None else 0,
                   reject=('License', 'Phone'))
    trans_i = _find(head, TRANS_ANCHOR, dest_i + 1 if dest_i is not None else 0,
                    reject=('License',))

    # Destination NAME. On most manifests it is the second cell of the label line, but on an
    # INTERNAL move that cell is empty and the second cell holds the right-hand column
    # ('Date and Approx. Time of Departure'). The name is then the line ABOVE the label.
    if dest_i is not None:
        v = value_cell(head[dest_i])
        if v and not ANY_LIC.search(v) and not RIGHT_COL.match(v):
            out['destination_name'] = v.strip()
        elif dest_i > 0:
            above = [p for p in re.split(r'\s{2,}', head[dest_i - 1].strip()) if p]
            if len(above) == 1 and not ANY_LIC.search(above[0]) and not RIGHT_COL.match(above[0]):
                out['destination_name'] = above[0].strip()

    # Transporter name, same approach.
    if trans_i is not None:
        v = value_cell(head[trans_i])
        if v and not ANY_LIC.search(v) and not RIGHT_COL.match(v):
            out['transporter_name'] = v.strip()

    # ------------------------------------------------------------------
    # LICENCES, POSITIONALLY. THE ORIGIN IS THE FIRST LICENCE, WHOEVER WE ARE.
    #
    # The rule this replaces read origin = "the first licence that is ours" and destination =
    # "the first that is neither ours nor a transporter". That silently assumes WE ARE ALWAYS
    # THE SENDER. On an inbound manifest we are the RECIPIENT, so it returned the two the
    # wrong way round on every single one - 40/40 on a sample checked against the Metrc
    # transfer record - and on an INTERNAL MC281714 -> MP281909 move, where BOTH licences are
    # ours, "the first that is not ours" matches nothing at all and the destination came back
    # NULL on 40/40. 1,033 of the 2,692 manifests on this account are internal moves.
    #
    # The document itself already says which is which, by position: the Originating Entity
    # block always precedes the Destination block. Read each licence out of its own block and
    # the question of who we are never arises.
    # ------------------------------------------------------------------
    out['origin_license'] = _first_licence(head, orig_i, dest_i)
    out['destination_license'] = _first_licence(head, dest_i, trans_i)
    # Transporter: prefer an explicit MX licence anywhere in the header, since that class is
    # unambiguous; fall back to whatever the transporter block carries (a laboratory or the
    # destination collecting its own material both happen, and both are legitimate).
    out['transporter_license'] = (
        next((l for ln in head for l in ANY_LIC.findall(ln) if TRANSPORTER.match(l)), None)
        or _first_licence(head, trans_i, None))

    out['is_lab_run'] = bool(out['destination_license'] and LAB.match(out['destination_license']))

    # ------------------------------------------------------------------
    # EVERY MISS EXPLAINS ITSELF. A blank field with no reason beside it is how a parse
    # failure gets mistaken for an empty state.
    # ------------------------------------------------------------------
    if orig_i is None or dest_i is None:
        out['parse_note'] = 'LAYOUT NOT RECOGNISED - no Originating Entity / Destination block'
    elif not out['origin_license'] and not out['destination_license']:
        out['parse_note'] = 'NO LICENCES FOUND IN EITHER BLOCK'
    elif not out['destination_license']:
        out['parse_note'] = 'NO DESTINATION LICENCE in the destination block'
    elif not out['origin_license']:
        out['parse_note'] = 'NO ORIGIN LICENCE in the originating block'
    elif out['origin_license'] in OURS and out['destination_license'] in OURS:
        out['parse_note'] = 'internal move - both licences ours'
    return out


def _find(lines, pattern, start, reject=()):
    """Index of the first line at or after `start` matching `pattern`."""
    for i in range(max(0, start), len(lines)):
        if pattern.search(lines[i]) and not any(r in lines[i] for r in reject):
            return i
    return None


def _first_licence(lines, start, end):
    """The first licence printed inside one block - never one borrowed from the next.

    Bounded deliberately. If the block holds no licence the answer is None and the caller
    says so; it must never slide forward and return the NEXT block's licence, which is how
    an unmatched four-digit origin turned into the destination reading as the origin.
    """
    if start is None:
        return None
    for i in range(start, len(lines) if end is None else end):
        m = ANY_LIC.search(lines[i])
        if m:
            return m.group(1)
    return None


if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8', errors='replace') as fh:
        print(json.dumps(parse(fh.read()), indent=2))
