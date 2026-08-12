/* WHAT KIND OF FACILITY IS THIS LICENCE?
   --------------------------------------
   licence_type_prefix already holds the answer - MT is Transporter, MR is
   Retailer, IL is a testing laboratory - and nothing resolved it. Storage and
   transport movements were therefore counted as customer sales.

   Rule-based, not a list of names (rule G1). A new transporter licence appearing
   in Metrc tomorrow is classified correctly the moment it arrives; nobody has to
   remember to add it.

   Longest prefix wins so RMD (Registered Marijuana Dispensary) is never read as
   a two-letter code. f_operation() is NOT the right function here - it answers
   "which of OUR operations is this", and returns the raw licence for anyone
   else's. This answers "what does this facility DO", for any licence.

   Additive only. Nothing is altered. */

create or replace function f_facility_type(p_licence text)
returns text
language sql
stable
set search_path = public
as $$
  select lt.facility_type
  from licence_type_prefix lt
  where upper(btrim(coalesce(p_licence,''))) like lt.prefix || '%'
  order by length(lt.prefix) desc
  limit 1
$$;

/* A destination that transports or stores is not a customer. The movement is
   real and must stay visible - it simply is not revenue. */
create or replace function f_is_transporter(p_licence text)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(f_facility_type(p_licence) = 'Transporter', false)
$$;

revoke all on function f_facility_type(text)  from public, anon;
revoke all on function f_is_transporter(text) from public, anon;
grant execute on function f_facility_type(text)  to authenticated;
grant execute on function f_is_transporter(text) to authenticated;

comment on function f_facility_type(text) is
  'Resolves any licence to what the facility does, via licence_type_prefix. Longest prefix wins.';
comment on function f_is_transporter(text) is
  'True when the licence is a Transporter. A transporter destination is storage or haulage, never a customer sale.';;
