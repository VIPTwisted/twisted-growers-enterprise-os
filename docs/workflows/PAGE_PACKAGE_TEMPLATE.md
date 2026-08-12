# TG Page Package Template

Adopted 11 Aug 2026 from the owner's DDC project (`GitHub_Archive/ddc-topg-platform.git`),
at his direction, adapted to Twisted Growers' rules. **Patterns crossed companies; no data
did.**

**Every page build starts from a completed copy of this package. No package, no build.**
One page or module per delivery. The package is written by Agent I (or the owner) and
implemented by Agent B — matching the DDC role split that produced the work the owner
rates as the bar: scope owner writes the contract, design owner implements it, gatekeeper
audits it.

## Page name

TBD

## Purpose

One paragraph. What decision does this page let a person make? A page that only displays
is not done — rule 10 requires assign-from-tile.

## Routes / nav

`nav_registry` rows to add or change (label, category, subcategory, item_order,
date_policy, default_range, range_kind). Menu STRUCTURE is data; menu DESIGN is frozen.

## Roles / permissions

| Role | Access | Notes |
|---|---|---|
| TBD | TBD | Wire via page_permissions / nav_role_visibility. Never invent an auth path. |

Command Center surfaces: upper management only.

## Data contract

The views this page reads, by name. **The page renders what Supabase serves — the front
end never computes a business figure** (db_policy rule 12: list what already derives it
before asking Agent I for a new view). Every figure names its metric_key where one exists.

- Drill rows: `v_stock_proof` (the designated evidence view — all 41 columns, the owner's
  13-field per-item spec) unless the package states otherwise and why.
- New view needed? State the requirement here; Agent I builds and registers it. Never
  hand-roll in the component.

## UI section map

Existing primitives first — share primitives, never layouts. Name each section's pattern:
approved tile pattern / rooms rings / alert banner / yield bars / discipline bars /
reports card / StatusChip / date bar / collapse header. Each section unique; no
one-template stamping.

## Empty and unwired states

Every empty state says WHY it is empty and WHAT will populate it, plus an escape action.
Every unwired figure carries a StatusChip (`NOT WIRED`, `UNCOMPUTABLE`, honest words).
Never a blank, never a fabricated line.

## Drill-down requirements

Rule C1/C3a checklist for this page: which tiles drill, to which population, and
confirmation that certificate + manifest open from every item row. Totals reconcile to
rows (C2) — same population, same view.

## Audit / logging

What this page writes (if anything), through which RPC, with what reason_policy action.
Manual edits from the OS: forbidden — reporting and planning only, per owner ruling.

## Validation checklist

The named check(s) in `tools/checks/` that prove this page: at minimum theme gate,
drill-presence, and this page's own validator. **A page ships with its validator or it
does not ship** — one page, one check, DDC-style.

## Acceptance criteria

Measurable, numbered. "Looks good" is banned — name the gate and the number.

## Evidence

On delivery, Agent B files `docs/evidence/<page>_EVIDENCE.md`: screenshots per section,
gates run with results, locks-respected checklist, rules read.
