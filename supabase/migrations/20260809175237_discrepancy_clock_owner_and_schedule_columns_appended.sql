-- Same change, column order preserved and the new ones appended. Postgres will
-- not rename or reorder a view's columns on replace, and that refusal is the
-- guard rail that stops a rewrite silently changing what a caller reads.
create or replace view v_discrepancy_clock as
with routed as (
  select r.*,
         case r.class
           when 'strain'           then 'Compliance'
           when 'ownership'        then 'Inventory'
           when 'missing_contents' then 'Compliance'
           when 'verification'     then 'Unassigned'
         end as dept
  from discrepancy_register r
)
select
  d.discrepancy_key,
  d.class,
  case d.class
    when 'strain'           then 'Strain — the item name and the strain field disagree'
    when 'ownership'        then 'Ownership — the platform and the package lineage disagree'
    when 'missing_contents' then 'Contents — a shipment moved with no record of what was on it'
    when 'verification'     then 'Verification — two derivations of the same fact disagree'
    else d.class
  end                                                              as what_disagrees,
  d.subject,
  d.source_a, d.source_a_says,
  d.source_b, d.source_b_says,
  d.resolved_by_doc,
  d.document_link,
  case when d.document_link is not null
       then 'The document is on file — open it and the answer is there.'
       when d.class = 'verification'
       then 'No document settles this. Both numbers come from our own records; the query behind each is on the check.'
       else 'The document that settles this has not been fetched from Metrc yet.'
  end                                                              as can_it_be_settled_now,
  d.first_seen at time zone 'America/New_York'                     as tracking_started,
  (current_date - d.first_seen::date)                              as days_tracked,
  d.assigned_to,
  d.resolved_at at time zone 'America/New_York'                    as resolved_at,
  case
    when d.resolved_at is not null                    then 'RESOLVED'
    when (current_date - d.first_seen::date) > 7      then 'BREACH — past the one-week rule'
    when (current_date - d.first_seen::date) >= 5     then 'DUE — ' || (7 - (current_date - d.first_seen::date)) || ' days left'
    else 'within the week'
  end                                                              as clock,
  case
    when d.resolved_at is not null then 5
    when (current_date - d.first_seen::date) > 7 then 1
    when d.class = 'verification' then 2
    when (current_date - d.first_seen::date) >= 5 then 3
    else 4
  end                                                              as rank,
  case
    when o.owner_name is null and d.assigned_to is null and d.resolved_at is null
      then 'NOBODY IS ASSIGNED and no department owner is on file.'
    when d.assigned_to is null and d.resolved_at is null
      then 'Falls to the department owner by default — nobody has taken it personally. Every '
        || 'department in finding_owners currently resolves to the same person, so this is one '
        || 'person holding all of it, not a routed workload.'
  end                                                              as ownership_gap,
  -- appended
  d.dept                                                           as department,
  coalesce(d.assigned_to, o.owner_name)                            as accountable,
  o.escalates_to
from routed d
left join finding_owners o on o.department = d.dept;

grant select on v_discrepancy_clock to authenticated;
revoke all on v_discrepancy_clock from anon;

select cron.unschedule('discrepancy-sweep') where exists (select 1 from cron.job where jobname='discrepancy-sweep');
select cron.schedule('discrepancy-sweep', '12 * * * *', $$select tg_sweep_discrepancies()$$);;
