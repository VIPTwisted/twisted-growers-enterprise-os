/* Owner put me in charge of agents, brains, loops and guards on 11 Aug 2026 and
   asked for a decision rather than options. This is it.

   THE DIAGNOSIS IS NOT "two categories are missing from the registry". It is that
   agent_findings identifies its author by DISPLAY NAME, and display names drift:

     "Sales, Orders & Fulfillment"  (findings, 2 rows)
     "Sales, Orders and Fulfilment" (registry, watch:sales)

   Ampersand against "and", and one spells fulfilment with two l's. Same agent, and
   nothing joins them. That is the identical failure this platform has already been
   bitten by twice - "Nova Farms LLC" against "Nova Farms, LLC" on customers, and a
   package deduped on tag instead of (licence, tag). A NAME IS AN ATTRIBUTE. THE KEY
   IS THE IDENTITY. Charter rule 11 says so about rows; it is just as true of agents.

   So: add the key, backfill it, and make it impossible to file against an agent that
   does not exist. Registering the two orphans without fixing the join would have left
   the next rename to break it again silently.

   THE RULING ON THE TWO ORPHANS - fold, do not create:
     "Metrc & Compliance"            -> watch:compliance  (TG-01 already owns this)
     "QA & Independent Verification" -> review:challenger (TG-11 already owns this)
   Both jobs already have a standing agent. Adding two more means two more sets of
   rules to keep current, and stale pasted rules are exactly what produced a false
   finding on 10 Aug. Fewer agents, each properly maintained, beats more agents
   drifting. */

alter table public.agent_findings add column if not exists agent_key text;

/* Backfill on exact display name first - that catches the six that already match. */
update public.agent_findings f
set agent_key = r.agent_key
from public.agent_registry r
where f.agent_key is null and f.agent = r.display_name;

/* Then the three that do NOT match, each named explicitly rather than fuzzy-matched.
   A fuzzy join would have quietly mapped these and hidden the fact that the names had
   diverged at all - and the divergence is the finding. */
update public.agent_findings set agent_key = 'watch:sales'
  where agent_key is null and agent = 'Sales, Orders & Fulfillment';
update public.agent_findings set agent_key = 'watch:compliance'
  where agent_key is null and agent = 'Metrc & Compliance';
update public.agent_findings set agent_key = 'review:challenger'
  where agent_key is null and agent = 'QA & Independent Verification';

/* THE GUARD. A foreign key, so an unregistered agent cannot file at all - the
   database refuses, at the moment of the insert, rather than a report noticing weeks
   later. NOT VALID first so the constraint applies to new rows immediately even if a
   straggler exists; then validated, which will raise loudly if anything is still
   unmapped rather than silently accepting it. */
alter table public.agent_findings
  drop constraint if exists agent_findings_agent_key_fk;
alter table public.agent_findings
  add constraint agent_findings_agent_key_fk
  foreign key (agent_key) references public.agent_registry(agent_key)
  on update cascade not valid;
alter table public.agent_findings validate constraint agent_findings_agent_key_fk;

comment on column public.agent_findings.agent_key is
  'THE identity of the filing agent. Joins agent_registry and is enforced by a foreign key. The older `agent` column holds a display name that has already drifted - "Sales, Orders & Fulfillment" against the registry''s "Sales, Orders and Fulfilment" - so it is kept for history and MUST NOT be joined on.';

comment on column public.agent_findings.agent is
  'HISTORICAL display name as typed by the filing agent. DO NOT JOIN ON THIS. Names drift; agent_key does not.';

select agent_key, count(*) findings, min(agent) as filed_as
from public.agent_findings group by agent_key order by 2 desc;;
