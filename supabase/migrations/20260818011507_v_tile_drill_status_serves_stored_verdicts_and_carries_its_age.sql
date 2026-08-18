/* v_tile_drill_status now serves stored verdicts, and carries its own age.
 *
 * Measured: the live computation takes 37,605 ms. The role authenticated carries an 8,000
 * ms ceiling. The guard was 4.7x beyond any possibility of being rendered, which is why
 * the owner kept finding tile defects before the guard could show them to him.
 *
 * Same column names and order as before, so every existing reader is unaffected.
 * computed_at is APPENDED — the one thing a cached verdict must always carry, or it
 * becomes the reassurance it was built to prevent.
 */

create or replace view public.v_tile_drill_status as
select r.contract_key,
       r.page,
       r.tile_label,
       r.tile_value,
       r.drill_value,
       r.gap,
       r.verdict,
       r.computed_at
from public.tile_drill_result r;

comment on view public.v_tile_drill_status is
  'Live tile-versus-drill reconciliation for every registered tile. Anything not AGREE is a '
  'defect the owner must never be the one to find. Serves stored verdicts from '
  'tile_drill_result since 18 Aug 2026 — the live computation measured 37,605 ms against '
  'the 8,000 ms ceiling role authenticated carries, so no page could ever render it. '
  'Recomputed every 30 minutes; v_tile_drill_freshness reports the age and '
  'v_tile_drill_status_live is the definition. Agent I.';;
