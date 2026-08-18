/* A name that claims a basis must apply that basis.
 *
 * Owner, 17 Aug 2026: "You must correct to ensure we never have this issue again and the
 * OS and agents understand how to correct."
 *
 * THE DEFECT, GENERALISED. A tile called "Total on hand, dry-equivalent" summed a column
 * that never applied the wet-to-dry conversion, so 325.3 lb of water was presented as
 * saleable dry weight for months. The specific bug was fresh frozen. The CLASS of bug is
 * wider and will recur under other names: a figure whose LABEL asserts a basis —
 * dry-equivalent, net, per-unit, normalised — while its arithmetic quietly ignores it.
 *
 * Nobody catches this by reading a number, because the number looks reasonable. It is
 * only visible by comparing what the name PROMISES against what the SQL DOES. That
 * comparison is mechanical, so it is a guard rather than a habit.
 *
 * basis_claim registers each claim a name can make, the factor that claim obliges, and
 * the pattern that proves the obligation was met. v_basis_claim_audit then reads every
 * view definition in the schema and reports any column whose name makes a claim its own
 * definition does not honour.
 *
 * HOW AN AGENT CORRECTS ONE — this is the part the owner asked for, and it is deliberately
 * written here rather than in a chat message that scrolls away:
 *
 *   1. Do NOT rename the column to dodge the check. "total_lb" instead of
 *      "total_lb_dry_equivalent" makes the guard quiet and the figure just as wrong.
 *   2. Do NOT redefine the existing column in place if other things read it. Weight as
 *      HELD and weight DRY-EQUIVALENT are both legitimate and both wanted — v_stock_on_hand
 *      has 118 dependents and most of them want the physical weight. Append a second
 *      column instead; CREATE OR REPLACE allows appending and rule E1 forbids the drop.
 *   3. Read the factor from conversion_factors via f_rule(). Never hardcode 4.5. The owner
 *      can change the ratio and every figure must move with it.
 *   4. Fix the SERVING layer too. A correct column nobody reads changes nothing — the
 *      tile, the report and the export must each be pointed at it.
 *   5. Leave the tile_drill_contract RED until the screen actually changes. Marking the
 *      guard green when only the database is fixed tells the owner a lie he can see
 *      through by looking at his own dashboard.
 */

create table if not exists public.basis_claim (
  claim            text primary key,
  name_pattern     text not null,
  required_factor  text,
  proof_pattern    text not null,
  what_it_means    text not null,
  how_to_correct   text not null,
  active           boolean not null default true
);

comment on table public.basis_claim is
  'Each basis a column or tile NAME can assert, and the pattern in its SQL that proves the '
  'assertion was honoured. Exists because a tile called dry-equivalent summed wet weight '
  'for months and no number looked wrong. Agent I, 17 Aug 2026.';

insert into public.basis_claim
  (claim, name_pattern, required_factor, proof_pattern, what_it_means, how_to_correct) values
('dry_equivalent', '(dry[_ ]?equiv|dry[_ ]?weight)', 'fresh_frozen_wet_to_dry',
 '(fresh_frozen_wet_to_dry|f_rule\s*\(\s*''fresh_frozen_wet_to_dry)',
 'The figure claims fresh frozen has been converted from wet to dry at the owner''s ratio, '
 || 'ruled 4.5:1 on 17 Aug 2026. Fresh frozen on hand is 418.3 lb wet and 93.0 lb dry — a '
 || 'figure that skips the conversion overstates saleable weight by 325.3 lb.',
 'Append a column that divides the Fresh frozen stream by f_rule(''fresh_frozen_wet_to_dry''). '
 || 'Do not redefine the existing pounds column — weight as held is legitimate and widely '
 || 'read. Then point the tile at the new column and only then let the contract go green.'),
('net_weight', '(net[_ ]?weight|net[_ ]?lb)', null,
 '(gross|tare|packaging)',
 'The figure claims packaging has been deducted. Metrc Gross Weight includes the container.',
 'Subtract the tare, or rename the figure to gross. Never compare a net figure to a gross one.'),
('normalised_unit', '(normalis|normaliz|per[_ ]?unit|comparable)', null,
 '(f_to_pounds|uom|unit_of_measure|UnitOfMeasure)',
 'The figure claims units were made comparable before summing. Metrc holds grams for some '
 || 'packages and each for others; summing them raw invents a number.',
 'Convert through f_to_pounds() using the row''s own unit, or keep the measures separate. '
 || 'Vapes, edibles and seeds have no defensible pound equivalent and must stay in units.')
on conflict (claim) do update
  set name_pattern = excluded.name_pattern, required_factor = excluded.required_factor,
      proof_pattern = excluded.proof_pattern, what_it_means = excluded.what_it_means,
      how_to_correct = excluded.how_to_correct, active = true;

alter table public.basis_claim enable row level security;
drop policy if exists bc_read on public.basis_claim;
create policy bc_read on public.basis_claim for select to authenticated using (true);
grant select on public.basis_claim to tg_desktop_reader;

create or replace view public.v_basis_claim_audit as
select c.relname                                   as relation,
       a.attname                                   as column_name,
       b.claim,
       b.required_factor,
       (pg_get_viewdef(c.oid, true) ~* b.proof_pattern) as honours_the_claim,
       case when pg_get_viewdef(c.oid, true) ~* b.proof_pattern
            then 'ok'
            else 'CLAIMS ' || upper(b.claim) || ' BUT DOES NOT APPLY IT' end as verdict,
       b.what_it_means,
       b.how_to_correct
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
join public.basis_claim b on b.active and a.attname ~* b.name_pattern
where n.nspname = 'public'
  and c.relkind in ('v','m');

comment on view public.v_basis_claim_audit is
  'Every column in every view whose NAME asserts a basis, and whether its own definition '
  'proves it applied one. Anything other than ok is a figure lying in its label — the '
  'failure that put 325.3 lb of water into a dry-equivalent total. how_to_correct carries '
  'the fix so an agent does not have to be told. Agent I, 17 Aug 2026.';

grant select on public.v_basis_claim_audit to tg_desktop_reader;;
