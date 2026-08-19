/* THE DOCUMENT TRINITY, ONE PRIMITIVE — owner order, 19 Aug 2026: "each must
 * have link to invoice, coa, and manifest for every drilldown."
 *
 * Measured first: 57 tag-bearing drill views, ZERO carrying all three. The fix
 * is one primitive, never 57 re-derivations: mv_tag_documents holds, per tag,
 * the certificate (id + document link), the outbound manifest (number +
 * document link), and the Apex invoice (number + dollars + payment status) —
 * distilled from v_tag_lifecycle, which is already the house's single
 * definition of how the three attach to a tag (certificate through lineage
 * inheritance, manifest from the transfer record, invoice by manifest match
 * with the customer-window fallback). Every drill view then LEFT JOINs this
 * one small indexed matview; the follow-up migration appends the columns
 * mechanically. Refreshed by the heal watcher; documents arrive on sync
 * cadence, so 30 minutes is honest freshness. */

do $$
begin
  perform set_config('search_path', 'public, pg_temp', true);
  execute $c$create materialized view public.mv_tag_documents as
    select tag,
           stage3_certificate      as coa_certificate_id,
           stage3_coa_document     as coa_document_link,
           stage3_laboratory       as coa_laboratory,
           stage4_manifest         as manifest_no,
           stage4_manifest_document as manifest_document_link,
           stage5_apex_invoice     as apex_invoice_no,
           stage5_invoice_usd      as apex_invoice_usd,
           stage5_payment_status   as apex_payment_status
    from v_tag_lifecycle$c$;
  execute 'create unique index mv_tag_documents_tag on public.mv_tag_documents (tag)';
  execute 'grant select on public.mv_tag_documents to authenticated';
  execute $c$comment on materialized view public.mv_tag_documents is
    'THE document trinity per tag: COA (certificate id + document), outbound manifest (number + '
    'document), Apex invoice (number + dollars + payment status) — distilled from '
    'v_tag_lifecycle, the single definition of how documents attach to a tag. Every drill view '
    'joins THIS, never re-derives. Built 19 Aug 2026 when the owner ordered the trinity on every '
    'drilldown and the measurement showed 57 tag-bearing drill views with zero full coverage. '
    'Agent I.'$c$;

  insert into public.matview_heal_policy (matview, max_age, refresh_fn, heals_per_day_ok, why, active)
  values ('mv_tag_documents', interval '30 minutes', null, 96,
          'The document trinity behind every drilldown row (COA, manifest, invoice per tag). '
          || 'Documents arrive on sync cadence; 30-minute freshness is honest. Registered at '
          || 'creation, 19 Aug 2026, Agent I.',
          true)
  on conflict (matview) do nothing;
end $$;;
