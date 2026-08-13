-- Agent I, 13 Aug 2026. DBI-100.
--
-- OWNER RULING, verbatim: "Track Zen seperate from TG" then "we manufacture for them and need
-- that tracked seperate as if 3rd license".
--
-- WHAT ZEN ACTUALLY IS, measured before building anything. It surfaced as 15 certificates naming
-- client "Zen MA" against OUR OWN manufacturing licence MP281909, which read as either a DBA or
-- a parser fault. It is neither: Zen is a CLIENT WE MANUFACTURE FOR.
--     120 held tags · 13,635 units · every one Infused (edible)
--     item names: "Gummy - ZEN - Indica Fruit Punch", "1:1 Cherry 100mg", "10:1 Orange 20mg"
--     ItemFromFacilityName "Twisted Growers LLC", licence MP281909, packaged Jan-Aug 2026
-- We make it, under our licence, in our building, and it is theirs.
--
-- THE RULE FOR THIS ALREADY EXISTED AND NOTHING IMPLEMENTED IT. `custody-is-not-purchase` in the
-- 280E doctrine: "A transfer that moves custody without transferring title is neither a purchase
-- nor a sale. Storage at a third-party warehouse, TOLLING, and consignment all move material
-- without changing who owns it." That is precisely this, and it has been sitting unread while
-- 13,635 units of somebody else's product counted as ours. Same shape as the certificate bridge
-- that sat unconsumed for five days.
--
-- WHY A REGISTRY AND NOT A CASE STATEMENT. The tell is the ITEM NAME, and matching on one is
-- where this goes wrong: my first pass used `item_name ilike '%zen%'` and matched FRESH FROZEN,
-- attributing all 418.3 lb of fresh frozen to Zen. The pattern belongs in one owner-editable row
-- with word boundaries, not copied into every surface that needs it.
--
-- WHAT THIS DOES NOT DO. It changes NO published figure. `origin` still reads "Grown by us" on
-- all 120 tags and inventory value is untouched. The restatement question - whether tolled
-- product is our asset, our COGS, our revenue, or a service fee - is filed for the owner, because
-- under 280E that distinction decides what may be deducted and it is not mine to settle.
--
-- UNDO: drop view v_manufacturing_client; drop table manufacturing_client.

create table if not exists manufacturing_client (
  client_key        text primary key,
  client_name       text not null,
  their_licence     text,
  we_make_it_under  text not null,
  item_name_pattern text not null,
  certificate_client text,
  relationship      text not null default 'tolling',
  why               text not null,
  set_by            text not null default 'Owner (Vinny)',
  set_at            timestamptz not null default now()
);

alter table manufacturing_client enable row level security;
drop policy if exists mc_read  on manufacturing_client;
drop policy if exists mc_write on manufacturing_client;
create policy mc_read  on manufacturing_client for select to authenticated using (true);
create policy mc_write on manufacturing_client for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table manufacturing_client is
 'Companies we MANUFACTURE FOR. Their product, our licence, our building - tolling. The owner '
 'ruled 13 Aug 2026 that each is tracked "as if 3rd license", separate from Twisted Growers. '
 'item_name_pattern is a regex WITH WORD BOUNDARIES for a reason: matching Zen as ''%zen%'' also '
 'matches "fresh froZEN" and misattributed 418.3 lb on the first attempt. One registry, so no '
 'surface re-invents the match.';

insert into manufacturing_client
 (client_key, client_name, their_licence, we_make_it_under, item_name_pattern,
  certificate_client, relationship, why)
values
('zen', 'Zen MA', null, 'MP281909', '(^|[^a-z])zen([^a-z]|$)', 'Zen MA', 'tolling',
 'Owner, 13 Aug 2026: "we manufacture for them and need that tracked seperate as if 3rd license". '
 'Measured: 120 held tags, 13,635 units, all Infused (edible), made by Twisted Growers LLC under '
 'MP281909, packaged Jan-Aug 2026. 15 certificates name Zen MA as client against our own licence, '
 'which is what surfaced it. Their licence number is not yet recorded - ask them.')
on conflict (client_key) do nothing;

create or replace view public.v_manufacturing_client_stock as
select coalesce(mc.client_name, 'Twisted Growers')                as brand_owner,
       coalesce(mc.client_key, 'tg')                              as brand_owner_key,
       case when mc.client_key is null then 'ours'
            else 'made for a client — ' || mc.relationship end    as ownership_basis,
       s.package_tag, s.item_name, s.stream, s.license,
       s.pounds, s.units, s.quantity_shown, s.packaged_on, s.location,
       s.evidence_source, s.certificate_document, s.certificate_grade,
       mc.their_licence                                           as client_licence,
       case when mc.client_key is not null then
         'We manufacture this for ' || mc.client_name || ' under our own licence ' ||
         mc.we_make_it_under || '. Custody is ours; title is theirs. Owner ruling 13 Aug 2026: '
         'track it as if a third licence. It still counts in Metrc against us, which is correct '
         '— Metrc tracks custody, not ownership.'
       end                                                        as what_this_means
from v_stock_packages s
left join manufacturing_client mc
  on s.item_name ~* mc.item_name_pattern;

comment on view public.v_manufacturing_client_stock is
 'Every held package with the BRAND OWNER attached — us, or a client we manufacture for. Built on '
 'the owner ruling of 13 Aug 2026 that Zen is tracked separately "as if 3rd license". Metrc counts '
 'this material against our licence and that is correct, because Metrc tracks CUSTODY. Ownership '
 'is a different question and this view is where it is answered. NOTE: no published figure moves '
 'because of this view — whether tolled product is our inventory, our COGS or a service fee is an '
 'owner and CPA decision under 280E, filed and not assumed.';;
