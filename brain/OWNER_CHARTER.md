# THE OWNER'S CHARTER — what this OS is, and what it is judged against

**Issued 19 August 2026.** This outranks any design decision an agent has made
or will make. All code, pages, hooks, syncs and dashboards are judged against
it. Where an existing object contradicts it, the object is wrong.

> This is NOT a generic dashboard. It is a forensic, seed-to-sale operating
> system for a licensed cannabis enterprise, aligned to Metrc and State rules,
> built to run LEAN and PROFITABLE — tracking every gram, every tag, every
> package, every room, every manifest, every COA, every invoice, every movement.

---

## The non-negotiables, in his words

- *"We want default on all pages to be THIS MONTH and then fully change and pull
  dates. We don't want to see, when we log in, full history."*
- *"Management ensures that we are running lean, profitable, tracking every gram,
  tag and process."*
- *"You must track tags, enforce drill down to include tags, manifests, COA,
  invoices, movement in the facility. Know and see where exactly every tag is in
  real time, all aspects of seed to sale."*
- *"Everything we build, edit, deploy, update, sync, ingest, reconcile, calculate
  or store MUST pass through Agents → Reviewers → Watchers → Guard. No
  exceptions."*
- *"No large monolithic pushes."* Small, atomic, tested, reviewed, observed,
  guarded.

## The regulatory anchor

The OS mirrors the Metrc lifecycle and vocabulary and does not invent its own.
Immature → Vegetative → Flowering → Harvested → Packaged, plus transfers,
testing, sales and adjustments. Field names match the existing Metrc-sync
schema. Owner ruling the same day: **source-system names at the edges, house
names in the middle** — `metrc_packages` keeps Metrc's field names, `apex_raw`
keeps Apex's, and only the reconciliation layer between them uses one house
vocabulary.

---

## Page architecture — the clause with real gaps

Every dashboard must declare a `VIEW_KEY`, hold `[range, setRange]`, call
`useDefaultRange(session, VIEW_KEY, setRange)`, render `DateRangeSelect` bound
to that range, pass `range.from` / `range.to` into **all** fetches, and mount
the shared strip so labels and data stay atomic.

**Measured 19 August 2026** — this is the honest state, not an aspiration:

| Page | Picker | Opens on this month | Passes range to fetches |
|---|---|---|---|
| commandcenter | ✅ | ✅ | ✅ |
| dash-cultivation | ✅ | ✅ | ✅ |
| dash-inventory | ✅ | ✅ | ✅ |
| cult-harvest-lifecycle | ✅ | ✅ | ✅ |
| cult-harvests | ✅ | ✅ | ✅ |
| cult-loss-ledger | ✅ | ✅ | ✅ |
| dash-schedule | ✅ | ✅ | partial |
| cult-genetics | ❌ | ❌ | ❌ |
| cult-grading | ❌ | ❌ | ❌ |
| cult-harvest-detail | ❌ | ❌ | ❌ |
| cult-loss-analysis | ❌ | ❌ | ❌ |
| cult-moisture-register | ❌ | ❌ | ❌ |
| cult-room-turn-audit | ❌ | ❌ | ❌ |
| dash-plants | ❌ | ❌ | ❌ |

**7 of 14 carry no date range at all.** They are detail pages, which is a reason
and not an excuse: the charter says every page, and a detail page showing all
history is exactly what the owner objected to. They are the outstanding work.

## The engines, and where each one stands

| Engine | State | Where it lives |
|---|---|---|
| Date range | **Built.** Company default is THIS MONTH; positions restate as-of the end date, flows recompute for the window; a figure never renders under a label it was not computed for | `f_date_default`, `f_department_dashboard`, `useDefaultRange`, `DkKpiStrip` |
| Tag / drill-down | **Built at the data layer.** Any grouped row resolves to its tags with COA, manifest and invoice; every tag resolves to its events and stays | `f_drill_tags`, `f_drill_events`, `f_drill_stays`, `mv_tag_documents`, `v_harvest_tag_index` |
| Forensic audit ledger | **Partial.** `tag_event` holds received, location_change, packaged, tested — **six required types are still missing**: planting, harvest, transfer_out, sale, adjustment, destruction | `tag_event`, `v_tag_stay` |
| Allocation & production | **Partial.** Allocation tables exist; the approval workflow is the single largest finding cause (690) | `allocations`, `v_awaiting_allocation` |
| Inventory & room stock | **Built and balanced.** 17 contracts at zero tolerance, all agreeing | `v_stock_*`, `v_inventory_*`, `mv_stock_proof` |
| Alerts, gaps, Guard | **Built.** 60 gap types declared, 34 detecting, the rest with their reason logged; guards flag and route, never block; they repair what they can prove and escalate the rest | `gap_rule`, `gap_alert`, `gap_routing`, `f_guard_autofix`, `v_gap_system` |

## What the Guard enforces at the door

Three layers, all live: the **pre-push hook** rejects a commit whose edge
function changed without its deploy recorded; **41 gates** run inside the
Netlify build so a failing check cannot publish; the **database itself** probes
the live site every ten minutes and raises a critical finding when it falls
behind. Outside all three, **deploy-watch on GitHub** compares the live commit
to origin/main on every push and every thirty minutes — deliberately outside
Netlify and outside any laptop, because a watcher inside the thing it watches
goes quiet exactly when that thing fails.

---

## The rule that governs how this file is used

An agent reads this before designing anything, and measures against it before
claiming anything. A ❌ above is not a defect to hide — it is the work queue.
Every claim in this file names the object that proves it, so any line can be
checked in one query.
