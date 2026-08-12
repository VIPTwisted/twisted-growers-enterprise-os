-- Agent I, 12 Aug 2026. DBI-064.
--
-- OWNER ORDER, verbatim: "MAKE SURE THIS IS WELL DOCUMENTED RULE NOW AND FOR ALL FUTURE NEW
-- AGENTS ... ALL RULES APPLY; TO ALL FUTURE NEW AGENTS MUST READ AND FOLLOW ALL RULES WE HAVE
-- CREATED SINCE DAY 1".
--
-- WHY A VIEW AND NOT A DOCUMENT. A markdown copy of the rules goes stale the day a rule is added,
-- and then it LIES to the agent reading it - which is precisely the drift he has banned. Rules
-- already live in five tables written at five different times. This is the single window onto all
-- of them: an agent reads ONE relation and cannot miss a rule added after its briefing was
-- written. The briefing POINTS here; it never copies from here.
--
-- UNDO: drop view v_house_rules.

create or replace view public.v_house_rules as
select 'OWNER RULING'::text            as source,
       cf.key                          as rule_key,
       cf.label                        as rule,
       cf.what_it_means                as what_it_means,
       null::text                      as never_do_this,
       cf.where_it_came_from           as authority,
       coalesce(cf.evidence_status,'set') as standing
from conversion_factors cf
where cf.unit = 'rule'

union all
select '280E DOCTRINE', d.rule_key, d.headline,
       d.the_rule || E'\n\nAGENTS MUST: ' || coalesce(d.agents_must,'—'),
       d.agents_must_never, d.authority, coalesce(d.authority_status,'binding')
from tax_280e_doctrine d

union all
select 'AUDIT ASSERTION', a.assertion, a.assertion, a.plain_english,
       a.what_failure_looks_like_here, 'Audit assertions framework — ' || coalesce(a.who_cares,''),
       case when a.no_materiality_floor then 'binding — NO materiality floor' else 'binding' end
from audit_assertion a

union all
select 'DISAGREEMENT CLASS', c.class_key, c.headline,
       c.what_it_looks_like || E'\n\nFIRST QUESTION: ' || coalesce(c.first_question,'—') ||
       E'\nCORRECT FIX: ' || coalesce(c.correct_fix,'—'),
       c.the_wrong_fix, 'Disagreement triage taxonomy', 'binding'
from disagreement_class c

union all
select 'ROOT CAUSE — NEVER REPEAT', r.pattern_key, r.the_symptom, r.the_root_cause,
       r.why_it_happened, coalesce(r.guard_that_prevents_recurrence,'NO GUARD YET'),
       coalesce(r.status,'open')
from root_cause_ledger r;

comment on view public.v_house_rules is
 'EVERY standing rule in one window: owner rulings, 280E doctrine, audit assertions, disagreement '
 'classes and logged root causes. Ordered by the owner 12 Aug 2026 — "ALL RULES APPLY; TO ALL '
 'FUTURE NEW AGENTS MUST READ AND FOLLOW ALL RULES WE HAVE CREATED SINCE DAY 1". Every agent '
 'reads THIS at start, never a markdown copy: a copy goes stale the day a rule is added and then '
 'lies to the agent reading it. Add a rule to its own table and it appears here automatically.';;
