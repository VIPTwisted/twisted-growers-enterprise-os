/* Two registered reports had no page — owner ruling, 28 Aug 2026.
 *
 * sales.apex_invoice_truth and sales.metrc_manifest_invoice_truth are enabled in
 * report_registry with a title, a date_column and clean provenance, and neither has
 * ever had a nav_registry row. The runner renders from a nav entry, so they had no
 * page, no toolbar and nothing to print. They were registered and unreachable.
 *
 * UNDER THE EXISTING REPORTS CATEGORY, AND NOTHING NEW. category 'Reports',
 * surface 'reports', module 'reports' — the same dropdown the other 35 report pages
 * already live in. report_group is 'Business Overview', which already exists and
 * already holds full_accountability, the other month-by-month money report. No new
 * category, no new group, no new side-bar entry.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VISIBILITY IS NOT OPTIONAL HERE, AND THE RATCHET IS THE REASON.
 *
 * v_page_wiring computes roles_who_can_see from nav_role_visibility, and
 * v_report_standard turns a zero into 'FAILS - nobody can open it'. ratchet_baseline
 * holds report_nobody_can_open at 114 and the measured value is 114 — exactly at the
 * limit, with no headroom at all. Two new pages with no visibility rows would take it
 * to 116 and fail check:reportcontract on the next build.
 *
 * So a page and its visibility are one change, not two. A nav row on its own would
 * have shipped two menu entries that no role can open — which, in the menu, is
 * indistinguishable from a working one, and is the exact defect v_page_wiring exists
 * to name.
 *
 * The roles are COPIED from full_accountability rather than typed out. It is the
 * closest existing analogue — a money report in the same group — and copying means
 * this file cannot drift from it by a transcription error across seventeen roles.
 * If that report's visibility is ever corrected, these two were correct at the
 * moment they were created and can be corrected the same way.
 *
 * GOVERNED DEFAULT this_month_td, per the period-bus spec: finance opens on the month
 * so far. Without a nav row f_date_default fell all the way to the company fallback
 * and these two resolved to 'this_month' — a window running to the 31st, three days
 * of it in the future. The row is what makes the governed default reachable at all.
 */

insert into public.nav_registry
  (view_key, label, category, subcategory, report_group, module, surface, page_kind,
   table_ref, icon, color, enabled, admin_only, item_order, category_order,
   archetype, date_policy, default_range, range_kind, description)
values
  ('apex_invoice_truth',
   'Apex Invoice Truth (one row per order)',
   'Reports', null, 'Business Overview', 'reports', 'reports', 'report',
   'v_apex_invoice_truth', 'scale', '#2df26a', true, false, 10, 0,
   'reconciliation', 'auto', 'this_month_td', 'activity',
   'One row per Apex order, at invoice grain. The additive measure is recognized_total_usd; a tag-grain road cannot carry invoice money and refuses it.'),
  ('metrc_manifest_invoice_truth',
   'Metrc Manifest and Apex Invoice Truth',
   'Reports', null, 'Business Overview', 'reports', 'reports', 'report',
   'v_metrc_manifest_invoice_truth', 'truck', '#2df26a', true, false, 11, 0,
   'reconciliation', 'auto', 'this_month_td', 'activity',
   'Where a Metrc manifest meets its Apex invoice, bridged on the exact invoice number rather than by proximity. Reconciles what left the building to what was billed for it.')
on conflict (view_key) do update set
  label          = excluded.label,
  category       = excluded.category,
  report_group   = excluded.report_group,
  module         = excluded.module,
  surface        = excluded.surface,
  page_kind      = excluded.page_kind,
  table_ref      = excluded.table_ref,
  enabled        = excluded.enabled,
  archetype      = excluded.archetype,
  date_policy    = excluded.date_policy,
  default_range  = excluded.default_range,
  range_kind     = excluded.range_kind,
  description    = excluded.description;

/* Copied, not transcribed — see the note above. */
insert into public.nav_role_visibility (view_key, role, visible)
select t.view_key, v.role, v.visible
  from (values ('apex_invoice_truth'), ('metrc_manifest_invoice_truth')) as t(view_key)
  cross join public.nav_role_visibility v
 where v.view_key = 'full_accountability'
on conflict (view_key, role) do update set visible = excluded.visible;

/* ── Proof, at apply time, that this did what it claims ──────────────────────
   Every one of these has a way of being quietly wrong: a typo'd table_ref points
   the page at nothing, a missed visibility copy makes it unopenable, and either
   would be found later by a person clicking a dead menu entry. */
do $$
declare
  bad text;
  now_nobody int;
  base_nobody int;
begin
  -- 1 · both pages exist, are enabled, and point at an object that is really there
  select string_agg(k, ', ') into bad
    from unnest(array['apex_invoice_truth','metrc_manifest_invoice_truth']) as k
   where not exists (
     select 1 from public.nav_registry n
       join pg_class c on c.relname = n.table_ref
       join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
      where n.view_key = k and n.enabled and n.page_kind = 'report'
        and n.default_range = 'this_month_td'
        and c.relkind in ('r','v','m','p'));
  if bad is not null then
    raise exception 'Nav rows missing, disabled, or pointing at a non-existent object: %', bad;
  end if;

  -- 2 · somebody can actually open each of them
  select string_agg(k, ', ') into bad
    from unnest(array['apex_invoice_truth','metrc_manifest_invoice_truth']) as k
   where (select count(*) from public.nav_role_visibility v
           where v.view_key = k and v.visible) = 0;
  if bad is not null then
    raise exception
      'These pages exist but no role can open them, which is a dead menu entry: %', bad;
  end if;

  -- 3 · the ratchet this change could have broken has not moved
  select count(*) into now_nobody
    from public.v_report_standard where standard like 'FAILS - nobody%';
  select baseline into base_nobody
    from public.ratchet_baseline where metric_key = 'report_nobody_can_open';
  if now_nobody > base_nobody then
    raise exception
      'report_nobody_can_open rose to % against a baseline of %. Adding a page nobody '
      'can open is the defect, not the fix.', now_nobody, base_nobody;
  end if;
end $$;
