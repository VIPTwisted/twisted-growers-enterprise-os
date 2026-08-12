# Forensic Delivery Audit Checklist

Adopted 11 Aug 2026 from the owner's DDC project, adapted to TG. **Agent I runs this
checklist on every front-end delivery before it reaches the owner.** A delivery that
fails any line goes back with the line number — the owner never sees unaudited work.

## Scope

- [ ] One page/module, or an owner-approved bundle. Nothing smuggled: no unrelated
      design, schema, dependency or deploy changes.
- [ ] No other agent's work swept into the commit.
- [ ] The delivery names its page package; the package predates the build.

## Design fidelity

- [ ] Theme tokens untouched (theme gate green). Colours, fonts: frozen.
- [ ] Side menu and top menu unchanged.
- [ ] Every frozen surface pixel-identical: Where the money is standing (stacked bar),
      Stock by Stream cards, HR (separate designer), Workspace, Planner, Budz, TG Brain,
      Settings→General, Seed-to-Sale page layout.
- [ ] Each section uses its assigned pattern; no one-template stamping; primitives
      shared, layouts never.
- [ ] Density per the owner's calibration: professional-dense, 12px floor, Comfortable
      mode intact, accessibility gate green.

## Honesty of state

- [ ] No fabricated data anywhere: no fake rows, no invented sparkline, no placeholder
      number that reads as real. (DDC enforces this with a validator; so do we.)
- [ ] Every empty state explains why it is empty and what fills it, with an escape action.
- [ ] Every unwired surface carries its StatusChip. "Live" claims reflect DATA age, not
      computation age — the six-lost-days rule.
- [ ] Plain English beside professional language (I3).

## Drill and evidence (C1 / C2 / C3a)

- [ ] Every tile drills, in place, to every item — no sampling, no top-N.
- [ ] Drill rows come from `v_stock_proof` (or the package-named evidence view); tile
      totals reconcile to their rows exactly.
- [ ] Certificate AND manifest openable from every item row, or the row states why not.
- [ ] Rooms shown as `room_qualified`, never bare room names.
- [ ] Third-party failed material framed as INPUT, never as loss (C6a).

## Security

- [ ] No key, token or credential in front-end code. Anon reaches only allow-listed
      relations.
- [ ] No new auth path; permissions via the existing tables.
- [ ] View-as (if touched) stays rendering-level, banner on, logged.

## Validation

- [ ] The page's own validator exists in `tools/checks/` and is registered with both
      fixture halves.
- [ ] Full gate chain run; results quoted by gate name and number in the evidence doc.
- [ ] Evidence doc filed: screenshots, gates, locks checklist, rules read.

## The bar

Judged against the owner's two reference standards — DDC system discipline and the
frozen Stock by Stream cards — by name, per the MIT/Google/Microsoft rule: name the gate
and the number, never "looks good".
