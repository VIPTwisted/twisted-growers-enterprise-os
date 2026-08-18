/* A destination that cannot be a customer is never a sales gap.
 *
 * Owner, 18 Aug 2026: "any items that do not belong should be removed and flagged from
 * ever being on list again and having this same issue in the future."
 *
 * WHAT WENT WRONG. The unmatched-sales list excluded lab samples by testing
 * transfer_type = 'Lab Transfer'. On 70 manifests Metrc recorded NO transfer type at all,
 * so the test passed and 70 laboratory manifests were reported as unexplained sales gaps.
 * Filtering on a field that is allowed to be null is filtering on nothing.
 *
 * THE DURABLE FIX IS TO CLASSIFY ON SOMETHING THAT CANNOT BE NULL. Every Massachusetts
 * licence carries its facility type in its prefix, and a manifest always has a destination
 * licence. Measured across every outbound line:
 *
 *   IL   5 licences   Assured Testing, Green Valley Analytics, MCR Labs, ProVerde,
 *                     SafeTiva. 1,398 lines and $0.00 declared on every single one.
 *                     Independent laboratories. Samples, never sales.
 *   MT   2 licences   Eagle Eyes Transport Solutions, MMM Transport. 285 lines carrying
 *                     $1,199,521 declared. TRANSPORTERS — a leg of a journey, not a buyer.
 *                     These were never caught by any previous filter.
 *
 * Everything else is a genuine counterparty and stays: MC cultivators, MP manufacturers,
 * MR retailers, MB microbusinesses, MD delivery operators, RMD dispensaries.
 *
 * WHY A TABLE AND NOT A WHERE CLAUSE. A hardcoded `not like 'IL%'` is invisible to the
 * next person, carries no reason, and gets copied into the next view slightly differently
 * — which is how the platform ends up with two definitions of a sale. Here each exclusion
 * states what it is, why it cannot be a customer, and the evidence measured on the day.
 * The check constraint refuses one without a reason.
 */

create table if not exists public.sales_gap_exclusion (
  licence_prefix  text primary key,
  facility_type   text not null,
  why_not_a_sale  text not null,
  evidence        text not null,
  added_by        text not null default 'Agent I',
  added_at        timestamptz not null default now(),
  active          boolean not null default true,
  constraint reason_is_real check (length(btrim(why_not_a_sale)) >= 40
                               and length(btrim(evidence)) >= 30)
);

comment on table public.sales_gap_exclusion is
  'Destination licence prefixes that CANNOT be a customer, so a manifest to one of them is '
  'never an unmatched sale. Classified on the licence prefix because it is always present '
  '— the previous filter tested transfer_type, which Metrc leaves null, and 70 laboratory '
  'manifests were reported as sales gaps as a result. Owner instruction 18 Aug 2026: items '
  'that do not belong are removed and cannot return. Agent I.';

insert into public.sales_gap_exclusion (licence_prefix, facility_type, why_not_a_sale, evidence) values
('IL', 'Independent Laboratory',
 'Material sent to a laboratory is a TEST SAMPLE. It is not sold, no invoice is ever raised '
 || 'for it, and it must never appear in a list of sales missing an invoice.',
 'Measured 18 Aug 2026 across all outbound lines: 5 IL licences — Assured Testing '
 || 'Laboratories, Green Valley Analytics, MCR Labs, ProVerde Laboratories, SafeTiva Labs. '
 || '1,398 lines, $0.00 declared on every one. 70 such manifests were wrongly on the gap '
 || 'list because their transfer_type was null.'),
('MT', 'Transporter',
 'A transporter is a leg of a journey, not a buyer. Material shown as destined for a '
 || 'transport licence is in transit to someone else; the sale is to the ultimate '
 || 'destination and the invoice belongs there.',
 'Measured 18 Aug 2026: 2 MT licences — Eagle Eyes Transport Solutions and MMM Transport — '
 || '285 lines carrying $1,199,521 declared. No previous filter caught these at all.')
on conflict (licence_prefix) do update
  set facility_type = excluded.facility_type, why_not_a_sale = excluded.why_not_a_sale,
      evidence = excluded.evidence, active = true;

alter table public.sales_gap_exclusion enable row level security;
drop policy if exists sge_read on public.sales_gap_exclusion;
create policy sge_read on public.sales_gap_exclusion for select to authenticated using (true);
drop policy if exists sge_write on public.sales_gap_exclusion;
create policy sge_write on public.sales_gap_exclusion for all to authenticated
  using ((select public.f_caller_is_admin())) with check ((select public.f_caller_is_admin()));
grant select on public.sales_gap_exclusion to tg_desktop_reader;

create or replace function public.f_can_be_a_customer(p_licence text)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select not exists (
    select 1 from public.sales_gap_exclusion x
     where x.active
       and upper(btrim(coalesce(p_licence,''))) like x.licence_prefix || '%')
$function$;

comment on function public.f_can_be_a_customer(text) is
  'False when the licence belongs to a facility type that cannot buy — a laboratory or a '
  'transporter. Every sales-gap surface must call this rather than writing its own prefix '
  'test, so there is one definition and adding an exclusion takes effect everywhere at '
  'once. Agent I, 18 Aug 2026.';;
