-- ---------------------------------------------------------------------------
-- 0091 — REMARKS per tag, PROCESSING DATE when it goes into our product, and the
-- DESTROYED-WITHOUT-REASON alert.
--
-- THE REMARK EXISTS BECAUSE I GOT THIS WRONG AND IT MATTERS COMMERCIALLY:
-- PackagedDate is when the SUPPLIER packaged the material; ReceivedDateTime is when
-- WE took delivery. I read the first as the second and reported that Paper City's
-- fresh frozen "sat in our freezer for eight months". It did not. Packaged
-- 2023-10-09, DELIVERED TO US 2024-04-25 -- already 199 days old on arrival -- and
-- written off 42 days later. The age was the SUPPLIER'S, not ours.
--
-- Owner 11 Aug 2026: "IF IT GOES INTO OUR PRODUCT NOTE DATE TAG IS USED FOR OUR
-- PROCESSING OF" -- so the remark names the processing date and what it became.
-- ---------------------------------------------------------------------------
create or replace view v_third_party_remarks as
select f.tag, f.supplier, f.category, f.strain,
       f.date_supplier_packaged, f.date_received, f.age_on_arrival_days,
       f.date_processed, f.date_sold, f.date_destroyed,
       f.days_held_total, f.days_to_process, f.days_unsold_still_here,
       f.current_room, f.lb_on_hand, f.status,
       concat_ws(' ',
         'Supplier packaged this ' || coalesce(f.date_supplier_packaged::text,'on an unrecorded date') || '.',
         case when f.date_received is not null
              then 'WE TOOK DELIVERY ' || f.date_received::text
                   || coalesce(' on manifest ' || f.inbound_manifest,'')
                   || case when f.age_on_arrival_days is not null
                           then ' — already ' || f.age_on_arrival_days
                                || ' DAYS OLD ON ARRIVAL. That age is the SUPPLIER''S, not ours.'
                      else '.' end
              else 'No delivery date recorded.' end,
         case when f.date_processed is not null
              then 'USED IN OUR PROCESSING ON ' || f.date_processed::text
                   || ' — ' || coalesce(f.days_to_process::text,'?') || ' days after delivery — made into '
                   || coalesce(f.made_into,'product') || ' (' || coalesce(f.made_lb::text,'?') || ' lb'
                   || coalesce(', child tags ' || left(f.child_tags,120),'') || ').'
              else '' end,
         case when f.date_sold is not null
              then 'Sold ' || f.date_sold::text || ' to ' || coalesce(f.sold_to,'')
                   || coalesce(' on manifest ' || f.outbound_manifest,'') || '.' else '' end,
         case when f.status like 'DESTROYED%'
              then 'DESTROYED ' || coalesce(f.date_destroyed::text,'') || ' by '
                   || coalesce(f.destroyed_by,'unknown') || ', reason ' || coalesce(f.destroy_reason,'NONE')
                   || ', note "' || coalesce(f.destroy_note,'none given') || '".'
                   || case when coalesce(f.lab_failures,0)=0
                           then ' NO FAILING LAB TEST EXISTS FOR THIS TAG.' else '' end
              else '' end,
         case when f.lb_on_hand > 0
              then 'STILL ON HAND: ' || f.lb_on_hand || ' lb in ' || f.current_room
                   || coalesce(' / ' || f.current_sublocation,'')
                   || ', unsold ' || coalesce(f.days_unsold_still_here::text,'?') || ' days ('
                   || coalesce(f.ageing_band,'') || ').'
              when f.date_processed is null and f.date_sold is null and f.status not like 'DESTROYED%'
              then 'NO OUTCOME RECORDED — open item.'
              else '' end)                                                    as remarks
from v_third_party_forensic f;

grant select on v_third_party_remarks to authenticated;

comment on view v_third_party_remarks is
  'Plain-language remarks per tag, naming the PROCESSING DATE when the material went '
  'into our product and what it became. States explicitly that age on arrival is the '
  'SUPPLIER''S age, not ours — the distinction reported wrongly on the Paper City '
  'write-off (packaged 2023-10-09, delivered 2024-04-25, 199 days old on arrival, held '
  'by us only 42 days).';


create or replace view v_alert_destroyed_unexplained as
select 'destroyed_unexplained:' || d.tag                      as fingerprint,
       case when coalesce(d.destroy_note,'') = '' then 'critical' else 'elevated' end as severity,
       'Inventory'                                            as area,
       case when coalesce(d.destroy_note,'') = ''
            then 'DESTROYED WITH NO EXPLANATION — ' || abs(d.lb_adjusted) || ' lb'
            else 'Destroyed with no failing lab test — ' || abs(d.lb_adjusted) || ' lb' end as headline,
       concat_ws(' ',
         'Tag ' || d.tag || ' (' || coalesce(d.category,'?') || coalesce(', ' || d.strain,'') || ')',
         'from ' || coalesce(d.supplier,'unknown supplier') || '.',
         abs(d.lb_adjusted) || ' lb destroyed ' || coalesce(d.date_destroyed::text,'?')
           || ' by ' || coalesce(d.destroyed_by,'an unrecorded user') || '.',
         'Reason code: ' || coalesce(nullif(d.destroy_reason,''),'NONE GIVEN') || '.',
         'Note: ' || coalesce(nullif(d.destroy_note,''),'NONE GIVEN') || '.',
         case when coalesce(d.lab_failures,0)=0
              then 'NO FAILING LAB TEST on record for this tag.' else '' end,
         'Received ' || coalesce(d.date_received::text,'?')
           || coalesce(' on manifest ' || d.inbound_manifest,'')
           || case when d.age_on_arrival_days is not null
                   then ', already ' || d.age_on_arrival_days || ' days old on arrival' else '' end || '.') as detail,
       'Confirm the reason with ' || coalesce(d.destroyed_by,'the user who adjusted it')
         || ' today, record it against the tag, and decide whether a supplier claim is warranted.' as what_to_do,
       'third_party_forensic'                                 as drill,
       round(abs(d.lb_adjusted)::numeric,1)                   as pounds,
       d.date_destroyed                                       as raised_for_date,
       d.tag, d.supplier, d.destroyed_by, d.destroy_reason, d.destroy_note, d.lab_failures
from v_third_party_forensic d
where d.lb_adjusted <= -1
  and (coalesce(d.destroy_note,'') = '' or coalesce(d.lab_failures,0) = 0);

grant select on v_alert_destroyed_unexplained to authenticated;

comment on view v_alert_destroyed_unexplained is
  'Raises whenever material is destroyed with NO reason code, NO note, or NO failing '
  'lab test behind it. Owner ruling 11 Aug 2026: admins, CEO, CFO and anyone the admin '
  'nominates must be alerted the same or next day — destruction without an explanation '
  'is a serious control failure.';

insert into report_alert_recipients (role, notify_in_app, notify_email, min_severity, note)
values
 ('owner',    true, true, 'elevated', 'Owner ruling 11 Aug 2026: must be alerted when anything is destroyed with no reason code or explanation.'),
 ('executive',true, true, 'elevated', 'Owner ruling 11 Aug 2026: destruction without explanation.'),
 ('cfo',      true, true, 'elevated', 'Owner ruling 11 Aug 2026: destruction without explanation — cash impact.'),
 ('admin',    true, true, 'critical', 'Owner ruling 11 Aug 2026: admin nominates any further recipients.')
on conflict (role) do update set
  notify_in_app=true, notify_email=true,
  min_severity=excluded.min_severity, note=excluded.note, updated_at=now();
;
