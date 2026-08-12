-- ---------------------------------------------------------------------------
-- 0017 — Year-end 2024 forensic reports. Three of them, per the owner:
--   v_rpt_2024_grown    what came off our plants and where every pound went
--   v_rpt_2024_sold     what was sold, line by line, to 31 Dec 2024
--   v_rpt_2024_onhand   what was held at 31 Dec 2024, by room and tag
--
-- BASIS, STATED RATHER THAN ASSUMED. Metrc packages carry TODAY'S quantity, not
-- a historical one, and there is no quantity ledger. So a point-in-time position
-- has to be reconstructed, and the reconstruction is declared on every row rather
-- than buried: qty_basis says whether the figure is the package's CREATED
-- quantity or its current one, and adjusted_after_period flags any tag whose
-- weight was changed after 31 Dec 2024. A year-end figure that hides which of
-- those it is, is not an audit.
-- ---------------------------------------------------------------------------

create or replace view v_rpt_2024_grown as
with h as (
  select h.license                                                        as licence,
         h.raw->>'Name'                                                   as harvest,
         nullif(h.raw->>'DryingLocationName','')                          as room,
         (h.raw->>'HarvestStartDate')::date                               as harvested_on,
         nullif(h.raw->>'FinishedDate','')::date                          as finished_on,
         f_strain_from_item(h.raw->>'Name')                               as strain,
         f_to_pounds((h.raw->>'TotalWetWeight')::numeric,'Grams')         as wet_lb,
         f_to_pounds((h.raw->>'TotalWasteWeight')::numeric,'Grams')       as waste_lb,
         f_to_pounds((h.raw->>'TotalPackagedWeight')::numeric,'Grams')    as packaged_lb,
         f_to_pounds((h.raw->>'CurrentWeight')::numeric,'Grams')          as metrc_residual_lb,
         (h.raw->>'PlantCount')::numeric                                  as plants
  from metrc_harvests h
  where (h.raw->>'HarvestStartDate')::date between '2024-01-01' and '2024-12-31'
)
select licence, harvest, strain, room, harvested_on, finished_on, plants,
       /* Fresh frozen never dries and must never be added to dried flower at face
          weight. The room is the discriminator: HarvestType reads "WholePlant" on
          every single row and cannot separate them. */
       case when room = 'Freezer/Biomass Storage' then 'FRESH FROZEN (wet basis)'
            else 'DRIED (dry basis)' end                                  as stream,
       round(wet_lb,2)                                                    as wet_lb,
       round(waste_lb,2)                                                  as waste_lb,
       round(wet_lb - waste_lb,2)                                         as usable_wet_lb,
       round(packaged_lb,2)                                               as packaged_off_lb,
       round(metrc_residual_lb,2)                                         as metrc_residual_lb,
       /* THE RESIDUAL IS NOT PRODUCT. Water is what the moisture band predicts;
          anything beyond the band's top is unexplained and is named as such. */
       round(greatest((wet_lb - waste_lb) * (f_rule('expected_moisture_pct_min')/100.0), 0),2) as water_lb_low,
       round(greatest((wet_lb - waste_lb) * (f_rule('expected_moisture_pct_max')/100.0), 0),2) as water_lb_high,
       round(greatest(metrc_residual_lb
             - (wet_lb - waste_lb) * (f_rule('expected_moisture_pct_max')/100.0), 0),2)        as unexplained_lb,
       round(case when wet_lb - waste_lb > 0
                  then packaged_lb / (wet_lb - waste_lb) * 100 else null end,1)                as dry_yield_pct,
       (finished_on is null)                                              as still_open
from h;

comment on view v_rpt_2024_grown is
  'YEAR-END 2024: what came off our own plants. Dried and fresh frozen are '
  'separated by ROOM because HarvestType reads WholePlant on every row. '
  'unexplained_lb is residual beyond the top of the company moisture band.';


create or replace view v_rpt_2024_sold as
select a.invoice,
       a.order_date,
       a.buyer,
       a.buyer_licence,
       case when a.buyer_licence ilike 'MT%' then 'TRANSPORTER — not a sale'
            when a.buyer_licence ilike 'ML%' then 'LAB — not a sale'
            when a.buyer_licence is null     then 'licence not recorded on the order'
            else 'Arm''s length sale' end                                 as classification,
       it->>'product_name'                                                as product,
       it->>'product_category'                                            as category,
       it->>'cultivar'                                                    as strain,
       nullif(it->>'metrc_package_label','')                              as metrc_tag,
       it->>'batch_name'                                                  as batch,
       (it->>'order_quantity')::numeric                                   as qty,
       it->>'order_unit_measurement'                                      as uom,
       round(coalesce((it->>'order_price_raw')::numeric,0)/100.0,2)       as unit_price_usd,
       round(coalesce((it->>'order_price_raw')::numeric,0)
             * coalesce((it->>'order_quantity')::numeric,0)/100.0,2)      as line_total_usd,
       a.order_total_usd,
       a.collected_usd,
       a.payment_status,
       a.manifest,
       a.cancelled
from (
  select payload->>'invoice_number'                                       as invoice,
         coalesce((payload->>'order_date')::date,(payload->>'created_at')::date) as order_date,
         payload->'buyer'->>'name'                                        as buyer,
         payload->>'buyer_state_license'                                  as buyer_licence,
         payload->>'payment_status'                                       as payment_status,
         nullif(payload->>'manifest_number','')                           as manifest,
         (payload->>'cancelled')::boolean                                 as cancelled,
         round(coalesce((payload->>'total_raw')::numeric,0)/100.0,2)      as order_total_usd,
         round(coalesce((payload->>'total_payments_raw')::numeric,0)/100.0,2) as collected_usd,
         payload->'items'                                                 as items
  from apex_raw where entity = 'shipping-orders'
) a, lateral jsonb_array_elements(a.items) it
where a.order_date between '2024-01-01' and '2024-12-31';

comment on view v_rpt_2024_sold is
  'YEAR-END 2024: sales line by line, from APEX -- the record of truth for sales. '
  'Metrc is seed-to-sale and its price fields are unreliable. All money is derived '
  'from Apex *_raw fields, which are integer CENTS, divided by 100. Cancelled '
  'orders are included and flagged rather than dropped.';


create or replace view v_rpt_2024_onhand as
with p as (
  select p.license                                                        as licence,
         p.raw->>'Label'                                                  as tag,
         coalesce(nullif(btrim(p.raw->>'LocationName'),''),'(no room)')    as room,
         coalesce(nullif(p.raw#>>'{Item,ProductCategoryName}',''),'(none)') as category,
         p.raw#>>'{Item,Name}'                                            as item,
         f_strain_from_item(p.raw#>>'{Item,Name}')                        as strain,
         nullif(p.raw->>'SourceHarvestNames','')                          as source_harvest,
         nullif(p.raw->>'SourcePackageLabels','')                         as source_packages,
         nullif(p.raw->>'ReceivedFromFacilityName','')                    as received_from,
         nullif(p.raw->>'ReceivedFromFacilityLicenseNumber','')           as received_from_licence,
         (p.raw->>'PackagedDate')::date                                   as packaged_on,
         (p.raw->>'ReceivedDateTime')::timestamptz                        as received_at,
         nullif(p.raw->>'FinishedDate','')::timestamptz                   as finished_at,
         p.raw->>'LabTestingState'                                        as lab_state,
         coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')         as uom,
         coalesce((p.raw->>'CreatedQuantity')::numeric,0)                 as created_qty,
         coalesce((p.raw->>'Quantity')::numeric,0)                        as current_qty,
         (p.raw->>'LastModified')::timestamptz                            as last_modified
  from metrc_packages p
)
select licence, room, category, tag, item, strain,
       source_harvest, source_packages,
       case when received_from_licence is null            then 'OURS — made here'
            when f_is_ours(received_from_licence)         then 'OURS — from our other licence'
            else 'THIRD PARTY — bought in' end                            as ownership,
       received_from, received_from_licence,
       packaged_on, received_at, lab_state, uom,
       round(f_to_pounds(created_qty, uom)::numeric,3)                    as created_lb,
       round(f_to_pounds(current_qty, uom)::numeric,3)                    as current_lb,
       case when f_is_weight(uom) then null else created_qty end          as created_units,
       /* THE BASIS, ON EVERY ROW. There is no quantity ledger, so a 31 Dec 2024
          weight cannot be read directly. A package untouched since then still
          carries its period-end weight; one modified afterwards does not, and
          saying which is the difference between an audit and an estimate. */
       case when last_modified <= '2024-12-31 23:59:59+00'
            then 'EXACT — untouched since 31 Dec 2024'
            else 'CREATED QUANTITY — this tag was modified after period end' end as qty_basis,
       (last_modified > '2024-12-31 23:59:59+00')                         as modified_after_period,
       last_modified
from p
where coalesce(packaged_on, received_at::date) <= '2024-12-31'
  and (finished_at is null or finished_at > '2024-12-31 23:59:59+00')
  and created_qty > 0;

comment on view v_rpt_2024_onhand is
  'YEAR-END 2024: what was held at 31 Dec 2024, by room and tag. Metrc carries '
  'TODAY''S quantity and there is no quantity ledger, so qty_basis declares on '
  'every row whether the weight is exact (tag untouched since period end) or the '
  'created quantity (tag modified afterwards). Never total this without reading it.';

grant select on v_rpt_2024_grown, v_rpt_2024_sold, v_rpt_2024_onhand to authenticated;
;
