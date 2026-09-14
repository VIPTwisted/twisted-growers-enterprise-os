# THE OPERATING LAWS — how an agent is permitted to work

**Issued 19 August 2026.** These sit beside `OWNER_CHARTER.md` (what the OS is)
and govern **how** any agent, including Claude, is allowed to touch it.

---

## The ten laws, as issued

1. **You do NOT invent structure.** No new routes, `view_key`s, `table_ref`s,
   `report_registry` keys, Supabase columns, RPC functions or components. You
   operate on what exists.
2. **Live numbers only.** Never fabricate. Read from Supabase.
3. **No fake data.** Zero rows shows zero rows. An error shows the error.
   Nothing is ever filled in.
4. **Nothing hardwired.** No hardcoded dates, ranges, filters, columns, totals,
   labels or metrics. Everything comes from the database or the registry.
5. **Navigation is DB rows.** Visibility is never inferred — only
   `nav_registry` + `nav_role_visibility`.
6. **Respect the routing tree.** Every page is a lazily-loaded leaf. Never merge
   pages, never create shared modules, never break the import cycle.
7. **Respect the report engine.** A report is `table_ref` + registry metadata +
   filters + columns + date range + grouping + drill. Never add, remove or
   rename columns; never invent filters, date columns or groupings.
8. **Owner notes are compliance instructions,** not decoration. Surface them
   exactly as written.
9. **State defects plainly.** A missing date column, missing registry entry,
   missing table, broken RPC or empty object is reported — never hidden, never
   silently "fixed".
10. **Never hallucinate.** Where there is no source, say so: *"This object has
    no registered data source. Nothing is being hidden — there is simply no
    answer to show."*

Also binding: **the audit drill is the truth layer** — never summarised,
rewritten, reordered or trimmed. **User settings are read, never overridden** —
theme, collapse state, sidebar width, date defaults, saved views. **Every query
uses the correct table, filters, date column, range and order**, with
`nullsFirst: false` and an exact count where one is needed.

---

## Law 11 — Mesh duty (owner 4 Sep 2026)

**Agents → Reviewers → Watchers → Guard → Deploy.** That line was already in
this file. It was hope. It is now a measured fail.

- No finding is **SIGNED** while `f_mesh_is_closed()` is false.
- No change ships while any of these are OVERDUE or NEVER RAN:
  `review:challenger`, `review:reconciliation`, `lane:V` (verifier),
  `lane:X` (challenger), `lane:W` (watchdog).
- Brain and second brain must log the run. Empty `v_loop_health` and empty
  `v_watchdog_current` is the same class of silence.
- The live list is `v_mesh_duty`. One row per silent reviewer, watcher, or
  lane. `blocks_ship` is the veto.
- Silence is a defect, not a green light.

Live as of apply: `f_mesh_is_closed() = false`. Challenger 679h overdue.
Verifier and recon review 388h overdue. Five watchers overdue. Three lanes
never ran. Rule ledger still 42 hard rules / 4 enforced — that is the same
class of failure and is not closed by this clause.

---

## How Law 1 is read, and why this reading is written down

Law 1 forbids inventing structure. The owner has also, on the same day,
explicitly ordered engines built that did not exist: the gap-detection engine,
the drill resolver, strain governance, the alert ledger, scheduled syncs. Both
instructions are real, so the boundary has to be stated rather than guessed:

**Law 1 governs the PAGE AND REPORT LAYER.** An agent may not invent a route, a
`view_key`, a `table_ref`, a registry key, a column on a report, a filter, a
grouping or a component — because those are the owner's pages, and inventing
there is how 522 pages ended up sharing one renderer.

**An owner-ordered engine is not an invention.** When he names a thing to build,
building it is obeying him, not inventing. The test is simple and it is his own:
*did he ask for this?* If the answer is no, Law 1 applies and the answer is
"this object has no registered data source".

**Where the two ever genuinely collide, the agent stops and asks.** It does not
choose for him.

## What this means in practice, today

- Every figure on every page must trace to a Supabase read. No literal totals.
- A number with no source is reported as having none — never estimated, never
  carried over from a previous window (see the stale-label guard in
  `DkKpiStrip`).
- A gap type that cannot detect yet carries `why_not_yet` in `gap_rule` rather
  than being dropped from the list.
- Thresholds live in `settings` / `conversion_factors` and are read with
  `f_rule()`. A literal in a view is a defect the `no-hardcoded-numbers` gate
  is meant to catch.
- Defects are named in the commit and in the object's own comment, so the next
  agent inherits the finding rather than rediscovering it.

## The process these laws sit inside

**Agents → Reviewers → Watchers → Guard → Deploy.** No exceptions, no silent
pushes, no monolithic changes. The Guard is final authority: the pre-push hook,
41 gates inside the Netlify build, the database's own deploy probe, and
deploy-watch on GitHub outside all of them. **Law 11:** if the mesh is silent,
`f_mesh_is_closed()` is false and the deploy is not signed.
