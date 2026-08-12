-- Owner, 11 Aug 2026: "I want agents in charge of database, I want 3 agents reviewing
-- and guards and strict fucking policy now."
--
-- Built as DATA with a guard behind it, not prose. Every governance rule written as
-- prose on this platform has been broken - the lanes existed on paper for four days
-- while five agents had no lane at all. A policy nothing can enforce is a diary entry.

-- ---- 1. WHO OWNS WHICH PART OF THE DATABASE -------------------------------------
create table if not exists public.db_domain_owner (
  domain        text primary key,
  table_pattern text not null,
  owner_agent   text not null,
  reviewers     text[] not null,
  why           text not null,
  set_on        date not null default current_date
);
comment on table public.db_domain_owner is
  'Who owns each part of the database and who must review a change to it. Ownership was the missing thing all along: the deploy pipeline failed 76 times because NOBODY owned it, not because nobody reviewed it.';

insert into public.db_domain_owner (domain, table_pattern, owner_agent, reviewers, why) values
 ('inventory & seed-to-sale','metrc_%|tag_event|lots|skus|coa_%|manifest_%|cultivar%|strain%|product_inventory|third_party_material',
  'A', array['C','D','H'],
  'Metrc is the legal record and read-only. 525,000 rows. A wrong change here is a compliance exposure, not a bug.'),
 ('sales','apex_%|sales_%|customer%|invoice%|shipment%|%order%|sync_item',
  'G', array['C','D','B'],
  'Apex is the sales source of record. Money and customer identity.'),
 ('human resources','hr_%|employee%|payroll%|timesheet%|schedul%|roster%|app_users|departments|roles_catalog',
  'B', array['C','D','A'],
  'ALL HR REQUIRES HUMAN (owner, 9 Aug). Pay and personal data - the highest-consequence writes in the system.'),
 ('agents, guards & loops','agent_%|sentinel%|duplicate_key|watchdog%|actions_register|challenge%|db_%|turnaround_target',
  'D', array['C','A','G'],
  'D owns the guards and therefore must NEVER be its own reviewer - the reason the Inspector exists.'),
 ('platform & auth','integration_secrets|company_licenses|nav_%|report_%|%_permissions',
  'B', array['C','D','A'],
  'Credentials and licences. integration_secrets has NO policy and FORCE RLS on purpose.')
on conflict (domain) do update
  set owner_agent = excluded.owner_agent, reviewers = excluded.reviewers, why = excluded.why;

-- ---- 2. THREE REVIEWS, RECORDED, BEFORE A CHANGE COUNTS AS APPROVED -------------
create table if not exists public.db_change_review (
  id            bigserial primary key,
  change_ref    text not null,
  domain        text references public.db_domain_owner(domain),
  proposed_by   text not null,
  what_changes  text not null,
  why           text not null,
  rollback      text,
  reviewer      text,
  verdict       text check (verdict in ('approved','rejected','needs_work')),
  review_note   text,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists dcr_ref on public.db_change_review (change_ref);
comment on table public.db_change_review is
  'THREE independent reviews per schema change, each recorded with a verdict and a reason. The proposer may never review their own change - v_db_change_status enforces that by excluding them.';

-- ---- 3. THE STATUS VIEW - what is actually approved -----------------------------
create or replace view public.v_db_change_status as
select c.change_ref,
       max(c.domain)                                             as domain,
       max(c.proposed_by)                                        as proposed_by,
       count(*) filter (where c.verdict = 'approved'
                          and c.reviewer is distinct from c.proposed_by) as approvals,
       count(*) filter (where c.verdict = 'rejected')            as rejections,
       count(*) filter (where c.verdict = 'needs_work')          as needs_work,
       case
         when count(*) filter (where c.verdict = 'rejected') > 0 then 'REJECTED'
         when count(*) filter (where c.verdict = 'approved'
                                and c.reviewer is distinct from c.proposed_by) >= 3 then 'APPROVED'
         else 'AWAITING REVIEW - '
              || (3 - count(*) filter (where c.verdict = 'approved'
                                        and c.reviewer is distinct from c.proposed_by))::text
              || ' of 3 still needed'
       end                                                       as status
from public.db_change_review c
group by c.change_ref;

comment on view public.v_db_change_status is
  'A change is APPROVED only with THREE approvals from reviewers who are not the proposer. One rejection stops it outright - three approvals do not outvote a rejection, because the reviewer who found the problem is usually the one who looked hardest.';

-- ---- 4. THE STRICT POLICY, as rows so it can be read by anything ----------------
create table if not exists public.db_policy (
  rule_no     int primary key,
  rule        text not null,
  because     text not null,
  hard        boolean not null default true
);
comment on table public.db_policy is
  'The database policy, as data. Every rule was earned by a specific failure on this platform, named in `because` so nobody removes one without knowing what it cost.';

insert into public.db_policy (rule_no, rule, because) values
 (1,'Metrc is READ-ONLY to this platform, forever. No agent, no automation, no exception.',
    'It is the regulator record, visible to the CCC. A wrong entry is reportable and hard to reverse.'),
 (2,'Every new table has RLS enabled AT CREATION.',
    'Postgres defaults it off and three tables shipped wide open on 7 Aug 2026.'),
 (3,'Never DELETE to fix duplicates without confirming the key in duplicate_key first.',
    'Twice the apparent duplicates were legitimate: a package under two licences, and report snapshots of one manifest.'),
 (4,'A schema change needs THREE approvals from agents who are not the proposer.',
    'Owner ruling 11 Aug 2026. Nobody reviews their own work, including D.'),
 (5,'Every figure names its source of record. One interpretation per fact.',
    '$1,317,836 of purchases was read as revenue because the column did not say which direction it was.'),
 (6,'Never widen a key, raise a baseline or relax a guard to make a check pass.',
    'That converts a real finding into a false green, which is worse than the finding.'),
 (7,'Query v_data_inventory before asking a person for a file.',
    'The owner reshared reports roughly twenty times while the substance was already loaded.'),
 (8,'Say what you did NOT do. Coverage, gaps and unverified figures are reported, never omitted.',
    'A summary mentioning only successes is the most common lie an agent tells.')
on conflict (rule_no) do update set rule = excluded.rule, because = excluded.because;

alter table public.db_domain_owner  enable row level security;
alter table public.db_change_review enable row level security;
alter table public.db_policy        enable row level security;
drop policy if exists dbo_read on public.db_domain_owner;
create policy dbo_read on public.db_domain_owner for select to authenticated using (true);
drop policy if exists dcr_read on public.db_change_review;
create policy dcr_read on public.db_change_review for select to authenticated using (true);
drop policy if exists dbp_read on public.db_policy;
create policy dbp_read on public.db_policy for select to authenticated using (true);
grant select on public.db_domain_owner, public.db_change_review, public.db_policy,
                public.v_db_change_status to authenticated, tg_desktop_reader;

select domain, owner_agent, array_to_string(reviewers,', ') as three_reviewers
from public.db_domain_owner order by domain;;
