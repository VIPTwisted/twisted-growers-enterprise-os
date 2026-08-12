-- Apex: make a zero-row answer SAY WHY it is zero.  Agent S, 11 Aug 2026.
--
-- WHY THIS EXISTS.  receiving-orders and deal-docs have each returned HTTP 200 with an
-- empty array on every run they have ever had, and apex_sync_run recorded that as
-- status=ok, rows_seen=0.  Four completely different conditions render identically that
-- way, and only one of them means "no purchases exist":
--
--   1  the watermark excludes everything
--   2  root_key is wrong, so a full response reads as an empty array
--   3  the key lacks the scope
--   4  the entity really is empty at Apex
--
-- Telling them apart cost a probe, seven live API calls and 10 credits.  It should have
-- cost one SELECT, and it will next time, because Apex answers the question itself on
-- every single response and we were throwing the answer away.
--
--   {"orders":[], "meta":{"current_page":1,"last_page":1,"per_page":1,"total":0}}
--
-- meta.total is the SERVER'S OWN COUNT of matching records.  apex-sync already parses
-- meta -- it uses it for the shortfall test -- and then discards it.  Persisting it is
-- the difference between "0 rows, cause unknown, go and spend credits" and "0 rows and
-- Apex agrees there are 0, stop looking".
--
-- This is the same class of failure as reading a JSON key's PRESENCE as its POPULATION.
-- rows_seen=0 is our count of what we parsed.  meta_total is their count of what exists.
-- When those two disagree, THAT is the bug, and nothing in the schema could express it.

alter table apex_sync_run add column if not exists meta_total integer;

comment on column apex_sync_run.meta_total is
  'Apex meta.total -- THEIR server-side count of records matching the query, not ours. '
  'rows_seen is what we parsed out of the payload. When meta_total > 0 and rows_seen = 0 '
  'the connector is broken (wrong root_key, bad paging). When both are 0 the entity is '
  'genuinely empty and no amount of re-pulling will change it. Null on runs that predate '
  '11 Aug 2026 and on endpoints that return no meta block.';

-- ── The measured finding, recorded where the next agent will actually look ───────────
-- Written into apex_entity.why so it is injected wherever the registry is read, rather
-- than living only in a document nobody opens before spending credits.

update apex_entity set why =
  'Inbound purchases. Read as revenue once already - $1,317,836 of purchases. Direction '
  || 'must never be inferred. '
  || 'MEASURED EMPTY 11 Aug 2026, Agent S, and it is NOT a connector fault: HTTP 200, '
  || 'root_key "orders" present and correct per Apex OpenAPI, ability view:receiving-orders '
  || 'CONFIRMED GRANTED by /v1/welcome, and Apex meta.total = 0 at updated_at_from '
  || '2000-01-01 (before the company existed). Control: shipping-orders through the '
  || 'identical request path returned meta.total = 1758. Twisted Growers is a SELLER on '
  || 'Apex (company 4064); the buyer-side collection is empty because purchases were never '
  || 'transacted through this Apex account. KEEP IT ENABLED as a sentinel - it costs ~2 '
  || 'credits and it is how we find out the day that changes. DO NOT re-diagnose it '
  || 'without first checking apex_sync_run.meta_total.'
where entity = 'receiving-orders';

update apex_entity set why =
  'Apex-side COAs and manifests. Expect overlap with our 2,690 docs, expect disagreement, '
  || 'reconcile. '
  || 'MEASURED EMPTY 11 Aug 2026, Agent S. /v1/deal-docs takes NO filters at all (per_page '
  || 'and no_track only), so there is no wrong question to ask it. Ability view:dealdocs '
  || 'CONFIRMED GRANTED, HTTP 200, meta.total = 0. Consistent with the standing decision '
  || 'that shipping and receiving EMAIL documents rather than uploading them to Apex - '
  || 'document_sends is empty for the same reason. Not a gap to close; a feature not used.'
where entity = 'deal-docs';

-- ── The guard ────────────────────────────────────────────────────────────────────────
-- A finding is not closed until something fails when it stops being true.  This one
-- turns red the moment Apex starts reporting records we are not storing.

create or replace view v_apex_zero_row_entities as
select e.entity,
       e.label,
       e.required,
       coalesce(r.rows_held, 0)                        as rows_held,
       s.last_run_at,
       s.rows_seen,
       s.meta_total,
       case
         when coalesce(r.rows_held,0) > 0              then 'OK - holds data'
         when s.last_run_at is null                    then 'NEVER RUN - not evidence of anything'
         when s.meta_total is null                     then 'UNKNOWN - ran before meta_total was recorded, or endpoint returns no meta. Cannot distinguish empty from broken.'
         when s.meta_total = 0                         then 'EVIDENCED EMPTY - Apex own count agrees there are zero records'
         else                                               'BROKEN - Apex reports ' || s.meta_total
                                                            || ' records and we stored none'
       end as verdict
from apex_entity e
left join lateral (
  select count(*) rows_held from apex_raw a where a.entity = e.entity
) r on true
left join lateral (
  select started_at as last_run_at, rows_seen, meta_total
  from apex_sync_run x
  where x.entity = e.entity
  order by x.started_at desc
  limit 1
) s on true
where e.required;

comment on view v_apex_zero_row_entities is
  'Which required Apex entities hold nothing, and WHETHER THAT IS EVIDENCED. The verdict '
  'column is the whole point: "EVIDENCED EMPTY" means Apex own meta.total agrees, '
  '"BROKEN" means Apex reports records we failed to store, and "UNKNOWN" means we still '
  'cannot tell - which is the state that cost a day on receiving-orders. Any row reading '
  'BROKEN is a real defect. Agent S, 11 Aug 2026.';

-- UNDO, in full:
--   drop view if exists v_apex_zero_row_entities;
--   alter table apex_sync_run drop column if exists meta_total;
--   -- and restore the two apex_entity.why strings from this file's git history.
-- No data is deleted by this migration and no existing column changes type or nullability.
