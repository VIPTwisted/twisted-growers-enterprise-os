/* NOTHING WAS WATCHING WHO CAN LEGALLY TOUCH PRODUCT.

   Agent A, 9 August 2026: two Metrc badges expire this month and our roster
   disagrees with Metrc about whether those people still work here. "No check
   anywhere reads badge_expires." Correct - agent_hr owns licence and training
   expiry and has never run.

   CHALLENGED THEIR FINDING BEFORE BUILDING ON IT, and it got bigger rather than
   smaller. First attack: is metrc_license_status a signal or a constant? A column
   reading the same value for everybody cannot disagree with anything. It is a
   signal - 3 employees read something other than Active.

   Which means the real number is not 2. FOURTEEN people this platform marks
   INACTIVE carry an Active Metrc licence status. Agent A found the two with
   imminent badge expiry because that is what they were looking at; the class is
   seven times larger.

   BOTH READINGS ARE SERIOUS AND THEY POINT OPPOSITE WAYS - rule A5, ask, never
   infer. Either fourteen former staff hold live credentials against MC281714, one
   of whom used them three days ago, or fourteen current staff are recorded as
   having left. The first is a control failure a regulator would ask about. The
   second means the roster, the payroll forecast and every labour figure are
   computed on the wrong headcount.

   THIS VIEW DOES NOT DECIDE WHICH. It shows the disagreement, names both sides,
   and puts the expiry clock beside it. */
create or replace view v_metrc_credential_risk as
select e.full_name,
       e.metrc_agent_badge                       as badge,
       e.badge_expires,
       (e.badge_expires - current_date)          as days_until_expiry,
       e.status                                  as our_roster_says,
       e.metrc_license_status                    as metrc_says,
       case
         when e.badge_expires is null and e.status = 'active'
           then 'ACTIVE STAFF WITH NO BADGE RECORDED - cannot prove they may legally handle product'
         when e.badge_expires < current_date
           then 'EXPIRED ' || (current_date - e.badge_expires) || ' days ago'
         when e.badge_expires <= current_date + 14 and e.status = 'active'
           then 'EXPIRES IN ' || (e.badge_expires - current_date) || ' DAYS - active staff, renew now'
         when e.badge_expires <= current_date + 14
           then 'EXPIRES IN ' || (e.badge_expires - current_date) || ' DAYS'
         else 'ok'
       end                                       as badge_standing,
       case
         when e.status = 'inactive' and e.metrc_license_status = 'Active'
           then 'DISAGREEMENT - we say they left, Metrc says their licence is Active. Either a former employee holds live credentials, or the roster is wrong.'
         when e.status = 'active' and e.metrc_license_status is distinct from 'Active'
           then 'DISAGREEMENT - we say they work here, Metrc does not show an active licence. They may not legally handle product.'
         else 'agrees'
       end                                       as roster_vs_metrc
from employees e
where e.badge_expires is not null
   or e.status = 'active'
   or (e.status = 'inactive' and e.metrc_license_status = 'Active')
order by
  case when e.badge_expires < current_date then 0
       when e.badge_expires <= current_date + 14 then 1
       when e.status = 'inactive' and e.metrc_license_status = 'Active' then 2
       else 3 end,
  e.badge_expires nulls last;

comment on view v_metrc_credential_risk is
  'Who may legally handle product, and where the two records disagree. Massachusetts requires a valid agent registration; an expired badge or a former employee holding a live one is a control question a regulator asks. Nothing read badge_expires before 9 Aug 2026 - agent_hr owns expiry and has never run. This view does NOT decide who is right: it shows both sides. Fourteen people marked inactive here carry an Active Metrc licence, and A5 says ask rather than infer, because the two readings point opposite ways and both are serious.';

grant select on v_metrc_credential_risk to authenticated;

select count(*) filter (where badge_standing like 'EXPIRE%')      as badge_urgent,
       count(*) filter (where roster_vs_metrc like 'DISAGREEMENT%') as disagreements,
       count(*) filter (where badge_standing like 'ACTIVE STAFF WITH NO BADGE%') as active_no_badge
from v_metrc_credential_risk;;
