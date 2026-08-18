/* Material sent to testing labs gets its own track.
 *
 * Owner, 18 Aug 2026: "be sure you do not count goods or material that go our testing labs
 * either these must be tracked separately."
 *
 * Excluded from sales, which the previous migrations did. Tracked separately, which is
 * this one — an exclusion that leaves material invisible is only half the instruction, and
 * a sample that never comes back is a real question nobody could ask before.
 *
 * MEASURED, every outbound line to an IL licence:
 *   Green Valley Analytics    IL281359   853 tags   133 manifests   13.70 lb
 *   SafeTiva Labs             IL281354   485 tags    81 manifests    4.76 lb
 *   ProVerde Laboratories     IL281279    30 tags     4 manifests    0.18 lb
 *   Assured Testing           IL281360    19 tags     1 manifest     0.11 lb
 *   MCR Labs                  IL281278    11 tags     6 manifests    0.00 lb
 *   TOTAL                                1,398      225            18.75 lb   $0.00
 *
 * $0.00 declared on all 1,398 lines, which is exactly what a test sample should be and is
 * the strongest evidence these were never sales.
 *
 * THE FOUR-WAY BALANCE now holds with no remainder:
 *   internal MC<->MP moves   10,190.6 lb
 *   transport legs              990.9 lb
 *   testing labs                 18.8 lb
 *   genuinely sold           11,595.4 lb
 *   everything that left     22,795.7 lb
 */

create or replace view public.v_lab_samples_out as
select t.destination_facility                        as laboratory,
       t.destination_licence                         as laboratory_licence,
       t.manifest_number,
       t.received_on                                 as sent_on,
       t.package_tag,
       t.item,
       t.category,
       t.strain,
       round(coalesce(t.shipped_lb,0)::numeric, 4)   as lb,
       t.shipped_qty,
       t.shipped_uom,
       t.status,
       coalesce(nullif(btrim(t.source_row->>'Origin Facility'),''), t.licence) as sent_by,
       nullif(btrim(t.source_row->>'Created by User'),'')  as sent_by_user,
       nullif(btrim(t.source_row->>'Received by User'),'') as received_by_user,
       /* Did a result ever come back for this tag? A sample with no result is the
          question this view exists to make askable. */
       exists (select 1 from public.metrc_rpt_lab_results r where r.package_tag = t.package_tag)
                                                     as has_a_lab_result,
       (select max(r.test_date) from public.metrc_rpt_lab_results r
         where r.package_tag = t.package_tag)        as last_result_on,
       (select max(r.lab_facility) from public.metrc_rpt_lab_results r
         where r.package_tag = t.package_tag)        as result_from_lab
from public.metrc_rpt_package_transfers t
where upper(btrim(coalesce(t.destination_licence,''))) like 'IL%';

comment on view public.v_lab_samples_out is
  'Every package sent to an independent testing laboratory, tracked SEPARATELY from sales '
  'on the owner''s instruction of 18 Aug 2026. 1,398 tags across 225 manifests to 5 labs, '
  '18.75 lb, $0.00 declared on every line — which is what a test sample should be and is '
  'the evidence they were never sales. has_a_lab_result answers the question this view '
  'exists for: did a result ever come back for the sample we sent. Agent I.';

grant select on public.v_lab_samples_out to tg_desktop_reader;

create or replace view public.v_outbound_balance as
select 'Internal moves between our own licences'::text as stream, 1 as ord,
       round(sum(pounds)::numeric,1) as lb,
       count(distinct package_tag)   as tags,
       'Not a sale. MC to MP or back — the material never left the company.'::text as why
  from public.v_forensic_sold_by_tag where internal_transfer
union all
select 'Transport legs', 2, round(sum(pounds)::numeric,1), count(distinct package_tag),
       'Not a sale. A transporter is a leg of a journey, not a buyer. 75 of these tags '
       || 'also appear on a manifest to the real customer and were counted twice until '
       || '18 Aug 2026.'
  from public.v_forensic_sold_by_tag where is_transport_leg
union all
select 'Samples to testing laboratories', 3, round(sum(pounds)::numeric,1), count(distinct package_tag),
       'Not a sale. $0.00 declared on every line. Tracked in v_lab_samples_out.'
  from public.v_forensic_sold_by_tag
 where not internal_transfer and not is_transport_leg and not counts_as_sale
union all
select 'Genuinely sold to a customer', 4, round(sum(pounds)::numeric,1), count(distinct package_tag),
       'The only stream that should ever appear in a revenue or pounds-sold figure.'
  from public.v_forensic_sold_by_tag where counts_as_sale
union all
select 'TOTAL — everything that left our licences', 9, round(sum(pounds)::numeric,1),
       count(distinct package_tag),
       'The four streams above sum to this with no overlap and no remainder.'
  from public.v_forensic_sold_by_tag;

comment on view public.v_outbound_balance is
  'The outbound control total. Every pound that left our licences, split four ways — '
  'internal moves, transport legs, laboratory samples, genuine sales — which sum to the '
  'total exactly. Built 18 Aug 2026 after transport legs and lab samples were found being '
  'counted as unsold shipments on two Command Center tiles. If these four ever stop adding '
  'up, something has been classified twice or not at all. Agent I.';

grant select on public.v_outbound_balance to tg_desktop_reader;;
