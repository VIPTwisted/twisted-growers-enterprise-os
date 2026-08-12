-- 0029: privacy by default - private unless deliberately shared (owner law)
alter table whiteboards alter column is_private set default true;
update whiteboards set is_private = true where is_private = false;
alter table spaces alter column is_private set default true;
-- seeded department spaces stay shared by design (they are the pre-configured containers)

insert into configurations (key, value) values ('privacy_default',
'{"rule":"Every object that can be private or shared is PRIVATE by default - whiteboards, custom spaces, docs, views, forms, dashboards, clips. Sharing is an explicit act by the owner or an admin. Department spaces are the deliberate exception: shared by design as pre-configured containers.","set_by":"owner directive 2026-08-05"}'::jsonb)
on conflict (key) do update set value = excluded.value;

update actions_register set note = note || ' PRIVACY LAW: block-public-sharing / private-by-default is now a standing rule (configurations.privacy_default) - every future shareable object (docs, views, forms, clips) ships private-by-default; sharing is explicit.'
where title = 'Sitewide permission enforcement sweep: hide every unpermitted control';;
