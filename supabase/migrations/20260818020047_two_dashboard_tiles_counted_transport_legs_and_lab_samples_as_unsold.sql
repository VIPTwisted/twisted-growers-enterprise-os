/* Two dashboard tiles counted transport legs and lab samples as unsold shipments.
 *
 * Owner, 18 Aug 2026: "forensically audit site for any discrepancies found due to these
 * issues list and correct them."
 *
 * Both tiles named "Shipped with no Apex invoice" filtered on NOT internal_transfer,
 * which removes our own MC<->MP moves and nothing else. A laboratory sample and a
 * transporter leg are neither internal nor a sale, so both were counted as shipments
 * missing an invoice:
 *
 *   v_forensic_audit_panel_live   8,822.3 lb   Command Center forensic panel
 *   v_dept_dash_audit_tiles       1,171.2 lb   Command and Cultivation audit tiles
 *
 * The contamination, measured on the whole outbound set:
 *   transport legs      990.9 lb   $174,512 of Apex invoices wrongly attached
 *   laboratory + other   18.8 lb
 *   total             1,009.7 lb   8.7% of the 11,595.4 lb genuinely sold
 *
 * And 75 of the transporter tags ALSO appear on a manifest to the real buyer — 614.0 lb
 * and $630,154 counted once to the transporter and again to the customer. That is a true
 * double count, not merely a misclassification.
 *
 * THE FIX IS ONE TOKEN. counts_as_sale was appended to v_forensic_sold_by_tag in the
 * previous migration and is exactly `NOT internal_transfer AND f_can_be_a_customer(...)`.
 * Swapping the predicate is therefore semantics-preserving for internal moves and adds
 * only the customer test.
 *
 * Applied by rewriting each view's own definition rather than retyping 8KB of SQL by
 * hand at the end of a long session — two mistakes were made and caught earlier tonight
 * doing exactly that kind of manual restatement, and a mechanical substitution cannot
 * introduce a third. Column names and order are untouched, so the 16 dependents between
 * them are unaffected.
 */

do $$
declare
  v    text;
  d    text;
  n    int;
begin
  foreach v in array array['v_forensic_audit_panel_live','v_dept_dash_audit_tiles'] loop
    d := pg_get_viewdef(('public.' || v)::regclass, true);

    if position('NOT v_forensic_sold_by_tag.internal_transfer' in d) = 0 then
      raise exception 'Expected predicate not found in %. Refusing to guess.', v;
    end if;

    d := replace(d,
      'NOT v_forensic_sold_by_tag.internal_transfer',
      'v_forensic_sold_by_tag.counts_as_sale');

    execute format('create or replace view public.%I as %s', v, d);
    raise notice 'rewrote %', v;
  end loop;
end $$;

comment on view public.v_forensic_audit_panel_live is
  'THE definition of the forensic audit panel. Costs ~9s — never read this from a page. '
  'Pages read v_forensic_audit_panel, which reads mv_forensic_audit_panel. Corrected '
  '18 Aug 2026: the "Shipped with no Apex invoice" line filtered only on '
  'NOT internal_transfer and therefore counted laboratory samples and transporter legs as '
  'unsold shipments. It now filters on counts_as_sale. Agent W, Agent I.';

comment on view public.v_dept_dash_audit_tiles is
  'Forensic audit tiles for Command Center and the Cultivation dashboard. Computed LIVE. '
  'Corrected 18 Aug 2026: the "Shipped with no Apex invoice" tile filtered only on '
  'NOT internal_transfer and counted laboratory samples and transporter legs as unsold. '
  'Now filters on counts_as_sale, which also excludes any facility type that cannot buy.';;
