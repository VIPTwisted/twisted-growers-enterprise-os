# WO-002 · Agent I · Repair `v_third_party_forensic.lb_on_hand` to licence-complete

**Ordered by:** Agent I under the owner's standing "we keep working" session, 12 Aug 2026.
Cause established by Agent V's verification of the 72 lb disagreement (report in session
transcript, arithmetic closes to the decimal). Reviewers: V, X, W (DBI-030 companion).

## Scope

One view: `v_third_party_forensic`. Only the `lb_on_hand` computation (and the `status`
column's dependence on the same row-pick). Nothing else in the view changes. OUT of
scope: the tile (`v_dept_dash_third_party`) — it reads the view and corrects itself.

## Locks

- The view is the centrepiece of the owner's 24-hour forensic rebuild — every other
  column's behaviour is settled and verified (checks 1–4 of section 6 pass on it).
- No `DROP VIEW` (rule E1). `CREATE OR REPLACE` with anchored substitution and a
  uniqueness guard, per the pattern used on `v_findings` (DBI-005).
- All data kept forever; no rows touched — this is a view definition only.

## The work

1. The `pk` CTE keeps `DISTINCT ON (tag) … LastModified DESC` for **identity and
   lineage fields only** (supplier, manifest, item, dates).
2. `lb_on_hand` becomes a per-tag sum over **current rows**:
   `sum(f_to_pounds(quantity, uom)) where source_state in ('active','intransit') and
   not coalesce(finished,false) group by tag`, joined to `pk` by tag. Ideally split
   `lb_on_hand_active` / `lb_in_transit` (append columns at the end — `CREATE OR
   REPLACE` cannot reorder).
3. `status` must stop reporting "PROCESSED INTO PRODUCT" for the 5 cross-licence tags
   whose MP side still holds ~61 lb — status derives from the summed current quantity,
   not the picked row.
4. Verify: `third-party-on-hand-two-ways` goes green at 774.2 = 774.2; section-6
   checks 1–4 still pass; `v_cross_license_tags` count declared in the check's
   `in_flight_rule`.

## Data contract

Consumers: `v_dept_dash_third_party`, `v_forensic_audit_panel`, `v_cfo_spend_by_tag`,
`v_third_party_remarks`, `v_alert_destroyed_unexplained`, `v_cfo_inventory_audit`,
metric `third_party_pounds_on_hand` (canonical figure 774.2 licence-complete).

## Validation

Checks named above, plus a before/after per-tag diff on the 7 offender tags from V's
concentration table — each must move from 0.00/residue to its MP-side weight.

## Timing caveat (V's five-questions discipline)

Re-run after the next full MP281909 sync before certifying the metric — the two
licences' last syncs were 14 hours apart on 12 Aug.

## Evidence

`docs/evidence/WO-002_EVIDENCE.md` on completion.
