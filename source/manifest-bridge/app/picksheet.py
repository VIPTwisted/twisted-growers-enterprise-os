"""🧾 Missing-item pick sheet — what still has to be picked to complete orders.

For every selected invoice, its Apex lines are compared against the linked
METRC manifest (same batch-key + fuzzy pairing as create_exact_match_comparison,
but unit-aware instead of grams-only):

  ordered 200, manifest has 100  ->  "ADD 100"
  ordered, nothing on manifest   ->  "MISSING ITEM"

Invoices grouped on one shared manifest are compared COMBINED (sibling lines
fold in, exactly like verify_pair) — each shortfall row is attributed back to
the invoice(s) that actually ordered that batch.

Sold-out radar: a product completely absent from TWO OR MORE selected
invoices' manifests probably isn't packed short — it's sold out or not ready.
Those land in a flag section at the bottom of the sheet.
"""

from collections import defaultdict
from datetime import datetime
from io import BytesIO

from . import bridge, deps

slc = deps.slc
S = deps.session_state

TOL_G = 1.0   # same "same total" tolerance the comparison uses


# ============================================================
# BUILD — selection -> structured pick data
# ============================================================

def _unit_label(item):
    """'CS' or 'Units' — order-level UOM object first (the base
    unit_measurement field reads 'Unit' on every line, including cases)."""
    oum = item.get("order_unit_measurement")
    if isinstance(oum, dict):
        name = (oum.get("name") or "").strip().lower()
        alias = (oum.get("alias") or "").strip().lower()
        if name == "case" or alias == "cs":
            return "CS"
        if name == "unit" or alias in ("u", "ea", "each"):
            return "Units"
    if item.get("order_unit_measurement_id") == 21:
        return "CS"
    return "Units"


def _mp_key(n):
    return f"~multipack{n}"


def _batch_key(batch, name):
    mp = slc.multipack_count(name or "") or slc.multipack_count(batch or "")
    return _mp_key(mp) if mp else slc.normalize_batch_name(batch)


def _manifest_pkgs(manifest):
    """Converted packages for a manifest — pkg cache first, METRC second
    (mirrors verify_pair so the two can never disagree)."""
    ent = bridge._pkg_cache_get(manifest)
    if ent:
        return ent["mpkgs"], ""
    tid = str(manifest.get("Id", ""))
    pkgs, _deliveries, lic = slc.load_packages_for_transfer(
        tid, slc.LICENSE_MANUFACTURER)
    if not pkgs:
        return None, "METRC returned no packages"
    pkgs = slc.enrich_packages_with_pdf(pkgs, tid, lic or slc.LICENSE_MANUFACTURER)
    mpkgs = slc.convert_metrc_packages(pkgs)
    bridge._pkg_cache_store(manifest, mpkgs, pkgs)
    return mpkgs, ""


def _fold_invoice_side(tagged_items):
    """[(invoice_label, item)] -> batch-key aggregates with provenance."""
    inv = {}
    for label, item in tagged_items:
        bn = (item.get("batch_name") or "").strip()
        if not bn:
            continue
        key = _batch_key(bn, item.get("product_name", ""))
        grams, _calc = slc.calculate_total_weight(item)
        qty = int(item.get("order_quantity") or 0)
        brand = item.get("brand") or {}
        rec = inv.setdefault(key, {
            "batch": bn,
            "product": item.get("product_name", "") or bn,
            "brand": (brand.get("name", "") if isinstance(brand, dict) else ""),
            "unit": _unit_label(item),
            "units": 0, "grams": 0.0, "invoices": set(),
        })
        rec["units"] += qty
        rec["grams"] += grams or 0.0
        rec["invoices"].add(label)
    return inv


def _fold_manifest_side(mpkgs):
    man = defaultdict(float)
    originals = {}
    for pkg in mpkgs:
        bn = (pkg.get("batch_name") or "").strip()
        if not bn:
            continue
        key = _batch_key(bn, pkg.get("item_name", ""))
        man[key] += pkg.get("quantity") or 0
        originals.setdefault(key, bn)
    return man, originals


def _pair_leftovers(inv, man, man_orig):
    """Second pass — are_batches_same pairing for keys that didn't line up
    exactly (spelling drift between Apex batch text and METRC batch text)."""
    for ik, rec in inv.items():
        if ik in man:
            continue
        for mk in list(man.keys()):
            if mk in inv:
                continue
            if slc.are_batches_same(rec["batch"], man_orig.get(mk, mk)):
                man[ik] = man.pop(mk)
                break


def _rows_for_group(tagged_items, mpkgs, selected_labels):
    """Shortfall rows for one manifest group. Only rows attributable to a
    SELECTED invoice are emitted (an unselected sibling's shortfalls aren't
    this sheet's business — its lines fold in purely so totals line up)."""
    inv = _fold_invoice_side(tagged_items)
    man, man_orig = _fold_manifest_side(mpkgs)
    _pair_leftovers(inv, man, man_orig)

    rows = []
    for key in sorted(inv, key=lambda k: (inv[k]["brand"], inv[k]["product"])):
        rec = inv[key]
        if not (rec["invoices"] & selected_labels):
            continue
        inv_g = rec["grams"]
        man_g = float(man.get(key) or 0.0)
        short_g = inv_g - man_g
        if short_g <= TOL_G:
            continue                      # fulfilled (or manifest has more)
        per_unit = (inv_g / rec["units"]) if rec["units"] else 0
        if man_g <= TOL_G:
            missing_units = rec["units"]
            action = "MISSING ITEM"
        else:
            missing_units = (max(1, min(rec["units"], round(short_g / per_unit)))
                             if per_unit else 0)
            action = (f"ADD {missing_units} {rec['unit']}" if missing_units
                      else f"ADD {short_g:.0f}g")
        rows.append({
            "brand": rec["brand"],
            "product": rec["product"],
            "batch": rec["batch"],
            "unit": rec["unit"],
            "ordered_units": rec["units"],
            "ordered_g": round(inv_g, 1),
            "manifest_g": round(man_g, 1),
            "missing_units": missing_units,
            "missing_g": round(short_g, 1),
            "action": action,
            "invoices": sorted(rec["invoices"]),
        })
    return rows


def build(digits_list):
    """The one entry point: selected invoice digits -> full pick-sheet data."""
    orders = bridge.load_pack_orders()
    manifests = bridge.load_manifests()
    links = bridge.load_links()
    views = [bridge.manifest_view(m) for m in manifests]
    suggestions = bridge.auto_match(orders, manifests, links, views=views)
    edges = bridge.resolve(orders, manifests, links, suggestions,
                           bridge.load_verify_cache(), views=views)

    o_by_dg = {o["digits"]: o for o in orders}
    e_by_dg = {e["invoice"]: e for e in edges}
    m_by_id = {str(m.get("Id")): m for m in manifests}

    wanted = [str(d) for d in digits_list if str(d) in o_by_dg]
    skipped = [{"invoice": f"Twiste-{d}", "reason": "not on the board"}
               for d in digits_list if str(d) not in o_by_dg]

    # Group the selection by linked manifest (shared manifests compare combined)
    groups = {}
    for dg in wanted:
        e = e_by_dg.get(dg)
        if not e:
            skipped.append({"invoice": o_by_dg[dg]["invoice"],
                            "reason": "no manifest linked"})
            continue
        groups.setdefault(e["manifest_id"], set()).add(dg)

    sections = []
    for mid, sel_dgs in groups.items():
        m = m_by_id.get(mid)
        if not m:
            for dg in sel_dgs:
                skipped.append({"invoice": o_by_dg[dg]["invoice"],
                                "reason": "manifest not in cache"})
            continue
        # every invoice riding this manifest — selected or not — folds in
        all_dgs = set(sel_dgs)
        for e in edges:
            if e["manifest_id"] == mid:
                all_dgs.add(e["invoice"])

        tagged, unreadable = [], []
        for dg in sorted(all_dgs):
            o = o_by_dg.get(dg)
            if not o:
                continue
            od, _oid = bridge._fetch_order_for(o)
            if not od:
                unreadable.append(o["invoice"])
                continue
            for it in od.get("items", []):
                tagged.append((o["invoice"], it))

        mpkgs, err = _manifest_pkgs(m)
        if mpkgs is None:
            for dg in sel_dgs:
                skipped.append({"invoice": o_by_dg[dg]["invoice"], "reason": err})
            continue

        sel_labels = {o_by_dg[dg]["invoice"] for dg in sel_dgs}
        rows = _rows_for_group(tagged, mpkgs, sel_labels)
        sections.append({
            "invoices": sorted(sel_labels),
            "combined_with": sorted({o_by_dg[dg]["invoice"]
                                     for dg in all_dgs - sel_dgs
                                     if dg in o_by_dg}),
            "buyer": " / ".join(sorted({o_by_dg[dg]["company"] for dg in sel_dgs
                                        if o_by_dg[dg]["company"]})),
            "manifest": str(m.get("ManifestNumber", "")),
            "unreadable": unreadable,
            "rows": rows,
        })

    # ── Sold-out radar: same product fully MISSING on 2+ selected invoices ──
    hit = defaultdict(set)
    for sec in sections:
        for r in sec["rows"]:
            if r["action"] == "MISSING ITEM":
                hit[(r["brand"], r["product"])].update(r["invoices"])
    soldout = [{"brand": b, "product": p, "invoices": sorted(invs)}
               for (b, p), invs in sorted(hit.items()) if len(invs) >= 2]

    total_rows = sum(len(s["rows"]) for s in sections)
    return {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "sections": sections,
        "soldout": soldout,
        "skipped": skipped,
        "note": (f"{total_rows} shortfall(s) across {len(sections)} "
                 f"manifest group(s)" if sections else "nothing to compare"),
    }


# ============================================================
# EXCEL — one Pick Sheet worksheet, app-styled
# ============================================================

def to_xlsx(data) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    thin = Side(style="thin", color="BBBBBB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    head_font = Font(bold=True, color="FFFFFF")
    head_fill = PatternFill("solid", fgColor="1F2937")
    title_font = Font(bold=True, size=12)
    miss_fill = PatternFill("solid", fgColor="F8D7DA")
    add_fill = PatternFill("solid", fgColor="FFF3CD")
    center = Alignment(horizontal="center", vertical="center")
    left = Alignment(horizontal="left", vertical="center")

    HEADERS = ["Brand", "Product", "Batch", "Ordered", "On Manifest",
               "Missing", "Action", "Invoice(s)"]

    wb = Workbook()
    ws = wb.active
    ws.title = "Pick Sheet"
    r = 1
    ws.cell(row=r, column=1, value="Missing-Item Pick Sheet").font = \
        Font(bold=True, size=14)
    ws.cell(row=r + 1, column=1,
            value=f"Generated {data['generated']} · {data['note']}")
    r += 3

    for sec in data["sections"]:
        title = f"{' + '.join(sec['invoices'])} — {sec['buyer']}"
        if sec["manifest"]:
            title += f" (manifest {sec['manifest']})"
        if sec["combined_with"]:
            title += f" · combined with {', '.join(sec['combined_with'])}"
        ws.cell(row=r, column=1, value=title).font = title_font
        r += 1
        if not sec["rows"]:
            ws.cell(row=r, column=1, value="✅ Nothing missing — fully covered.")
            r += 2
            continue
        for c_idx, head in enumerate(HEADERS, start=1):
            cell = ws.cell(row=r, column=c_idx, value=head)
            cell.font, cell.fill = head_font, head_fill
            cell.alignment, cell.border = center, border
        r += 1
        for row in sec["rows"]:
            vals = [row["brand"], row["product"], row["batch"],
                    f"{row['ordered_units']} {row['unit']} ({row['ordered_g']:g}g)",
                    f"{row['manifest_g']:g}g",
                    (f"{row['missing_units']} {row['unit']} "
                     f"({row['missing_g']:g}g)") if row["missing_units"]
                    else f"{row['missing_g']:g}g",
                    row["action"], ", ".join(row["invoices"])]
            fill = miss_fill if row["action"] == "MISSING ITEM" else add_fill
            for c_idx, val in enumerate(vals, start=1):
                cell = ws.cell(row=r, column=c_idx, value=val)
                cell.border, cell.fill = border, fill
                cell.alignment = left if c_idx <= 3 else center
                if c_idx == 7:
                    cell.font = Font(bold=True)
            r += 1
        r += 1

    if data["soldout"]:
        ws.cell(row=r, column=1,
                value="⚠️ SOLD OUT / NOT READY? — fully missing on 2+ invoices"
                ).font = Font(bold=True, size=12, color="9F1239")
        r += 1
        for c_idx, head in enumerate(["Brand", "Product", "Missing on"], start=1):
            cell = ws.cell(row=r, column=c_idx, value=head)
            cell.font, cell.fill = head_font, head_fill
            cell.alignment, cell.border = center, border
        r += 1
        for f in data["soldout"]:
            for c_idx, val in enumerate([f["brand"], f["product"],
                                         ", ".join(f["invoices"])], start=1):
                cell = ws.cell(row=r, column=c_idx, value=val)
                cell.border, cell.fill = border, miss_fill
                cell.alignment = left
            r += 1
        r += 1

    if data["skipped"]:
        ws.cell(row=r, column=1, value="Skipped: " + "; ".join(
            f"{s['invoice']} ({s['reason']})" for s in data["skipped"]))

    widths = [16, 44, 34, 18, 13, 18, 18, 24]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ============================================================
# PDF — landscape, one table per manifest group, flags at bottom
# ============================================================

def to_pdf(data) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import landscape, letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import (Paragraph, SimpleDocTemplate, Spacer,
                                    Table, TableStyle)

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=15,
                        spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=11,
                        spaceBefore=10, spaceAfter=4)
    meta = ParagraphStyle("meta", parent=styles["Normal"], fontSize=8,
                          textColor=colors.HexColor("#6B7280"))
    cell = ParagraphStyle("cell", parent=styles["Normal"], fontSize=8,
                          leading=10)
    action = ParagraphStyle("action", parent=cell, fontName="Helvetica-Bold")
    flag_h = ParagraphStyle("flagh", parent=h2,
                            textColor=colors.HexColor("#9F1239"))

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(letter),
                            leftMargin=0.45 * inch, rightMargin=0.45 * inch,
                            topMargin=0.5 * inch, bottomMargin=0.45 * inch,
                            title="Missing-Item Pick Sheet")
    story = [Paragraph("Missing-Item Pick Sheet", h1),
             Paragraph(f"Generated {data['generated']} · {data['note']}", meta),
             Spacer(1, 6)]

    head_bg = colors.HexColor("#1F2937")
    miss_bg = colors.HexColor("#F8D7DA")
    add_bg = colors.HexColor("#FFF3CD")
    grid = colors.HexColor("#BBBBBB")

    for sec in data["sections"]:
        title = f"{' + '.join(sec['invoices'])} — {sec['buyer']}"
        if sec["manifest"]:
            title += f"  (manifest {sec['manifest']})"
        story.append(Paragraph(title, h2))
        if sec["combined_with"]:
            story.append(Paragraph(
                f"compared combined with {', '.join(sec['combined_with'])}",
                meta))
        if sec["unreadable"]:
            story.append(Paragraph(
                f"NOTE: couldn't read {', '.join(sec['unreadable'])} from Apex — "
                f"its lines are absent from this compare", meta))
        if not sec["rows"]:
            story.append(Paragraph("Nothing missing — fully covered.", cell))
            continue

        rows = [[Paragraph(f"<b>{t}</b>", cell) for t in
                 ("Brand", "Product — Batch", "Ordered", "On Manifest",
                  "Missing", "Action", "Invoice(s)")]]
        row_styles = []
        for i, row in enumerate(sec["rows"], start=1):
            missing = ((f"{row['missing_units']} {row['unit']} "
                        f"({row['missing_g']:g}g)") if row["missing_units"]
                       else f"{row['missing_g']:g}g")
            rows.append([
                Paragraph(row["brand"], cell),
                Paragraph(f"{row['product']}<br/><font size=7 "
                          f"color='#6B7280'>{row['batch']}</font>", cell),
                Paragraph(f"{row['ordered_units']} {row['unit']} "
                          f"({row['ordered_g']:g}g)", cell),
                Paragraph(f"{row['manifest_g']:g}g", cell),
                Paragraph(missing, cell),
                Paragraph(row["action"], action),
                Paragraph(", ".join(row["invoices"]), cell),
            ])
            row_styles.append(("BACKGROUND", (0, i), (-1, i),
                               miss_bg if row["action"] == "MISSING ITEM"
                               else add_bg))

        t = Table(rows, colWidths=[1.0 * inch, 3.1 * inch, 1.15 * inch,
                                   0.95 * inch, 1.15 * inch, 1.15 * inch,
                                   1.4 * inch], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), head_bg),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, grid),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            *row_styles,
        ]))
        story.append(t)

    if data["soldout"]:
        story.append(Paragraph(
            "SOLD OUT / NOT READY? — fully missing on 2+ invoices", flag_h))
        rows = [[Paragraph("<b>Brand</b>", cell),
                 Paragraph("<b>Product</b>", cell),
                 Paragraph("<b>Missing on</b>", cell)]]
        for f in data["soldout"]:
            rows.append([Paragraph(f["brand"], cell),
                         Paragraph(f["product"], cell),
                         Paragraph(", ".join(f["invoices"]), cell)])
        t = Table(rows, colWidths=[1.4 * inch, 4.6 * inch, 3.0 * inch],
                  repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), head_bg),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BACKGROUND", (0, 1), (-1, -1), miss_bg),
            ("GRID", (0, 0), (-1, -1), 0.5, grid),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(t)

    if data["skipped"]:
        story.append(Spacer(1, 8))
        story.append(Paragraph("Skipped: " + "; ".join(
            f"{s['invoice']} ({s['reason']})" for s in data["skipped"]), meta))

    doc.build(story)
    return buf.getvalue()
