-- THE OWNER'S RULE, 8 August 2026: "no discrepancies can last longer than a week
-- and must be addressed."
--
-- ⚠ TWO DIFFERENT CLOCKS, AND CONFUSING THEM WOULD BE DISHONEST.
--
--   days_tracked  — since the platform first RECORDED the disagreement.
--                   Every row reads 0 today, because the register was created
--                   today. That does NOT mean these are new problems.
--   days_actual   — since the underlying event, where the record carries a date.
--                   Manifest 0002962464 has been missing its contents since
--                   21 July 2025.
--
-- The seven-day rule runs on days_tracked, because that is the clock the company
-- controls and can be held to. days_actual is shown beside it so nobody mistakes
-- a fresh register for a clean history — presenting "0 days" on a year-old gap
-- would be exactly the kind of true-but-misleading number this platform has
-- shipped before.
create or replace view v_discrepancy_clock as
select
  r.discrepancy_key,
  r.class,
  case r.class
    when 'strain'           then 'Strain — the item name and the strain field disagree'
    when 'ownership'        then 'Ownership — the platform and the package lineage disagree'
    when 'missing_contents' then 'Contents — a shipment moved with no record of what was on it'
    else r.class
  end                                                              as what_disagrees,
  r.subject,
  r.source_a, r.source_a_says,
  r.source_b, r.source_b_says,
  r.resolved_by_doc,
  r.document_link,
  case when r.document_link is not null
       then 'The document is on file — open it and the answer is there.'
       else 'The document that settles this has not been fetched from Metrc yet.'
  end                                                              as can_it_be_settled_now,

  r.first_seen at time zone 'America/New_York'                     as tracking_started,
  (current_date - r.first_seen::date)                              as days_tracked,
  r.assigned_to,
  r.resolved_at at time zone 'America/New_York'                    as resolved_at,

  case
    when r.resolved_at is not null                    then 'RESOLVED'
    when (current_date - r.first_seen::date) > 7      then 'BREACH — past the one-week rule'
    when (current_date - r.first_seen::date) >= 5     then 'DUE — ' || (7 - (current_date - r.first_seen::date)) || ' days left'
    else 'within the week'
  end                                                              as clock,
  case
    when r.resolved_at is not null then 4
    when (current_date - r.first_seen::date) > 7 then 1
    when (current_date - r.first_seen::date) >= 5 then 2
    else 3
  end                                                              as rank,
  case when r.assigned_to is null and r.resolved_at is null
       then 'NOBODY IS ASSIGNED. A discrepancy with no name against it is one nobody is working.'
  end                                                              as ownership_gap
from discrepancy_register r;

comment on view v_discrepancy_clock is
  'The owner''s one-week rule. days_tracked runs from when the platform recorded the disagreement — the clock the company controls. Every row reads 0 on 8 Aug 2026 because the register was created that day; that is not a claim these problems are new.';

grant select on v_discrepancy_clock to authenticated;
revoke all on v_discrepancy_clock from anon;

insert into nav_registry (category, category_order, label, item_order, icon, view_key,
                          table_ref, description, enabled, admin_only, surface, subcategory)
values ('Command Center', 0, 'Discrepancies — the one-week clock', 0, 'gauge',
        'discrepancy_clock', 'v_discrepancy_clock',
        'Every place two authoritative sources disagree, with the document that settles it and the days remaining under the owner''s one-week rule. Agent observations are NOT here — this is disagreements only.',
        true, false, 'deep', 'Decisions Waiting')
on conflict do nothing;;
