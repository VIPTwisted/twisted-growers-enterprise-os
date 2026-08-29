-- stg_mc_transfers_limited: part 1 of 1, 1330 rows. NOT APPLIED, branch only.
-- Licence on every row comes from the FILE, never the filename.
create table if not exists public.stg_mc_transfers_limited (
  col text,
  col_2 text,
  created text,
  manifest text,
  inv_nbr text,
  col_3 text,
  origin_lic text,
  origin_facility text,
  origin_type text,
  dest_lic text,
  destination_facility text,
  dest_type text,
  type text,
  received text,
  voided text,
  item_category text,
  ship_d text,
  rcv_d text,
  var text,
  ship_d_2 text,
  rcv_d_2 text,
  var_2 text,
  source_file text not null,
  file_sha256 text not null,
  licence text not null,
  file_window text,
  ingested_at timestamptz not null default now()
);
alter table public.stg_mc_transfers_limited enable row level security;
drop policy if exists stg_mc_transfers_limited_read on public.stg_mc_transfers_limited;
create policy stg_mc_transfers_limited_read on public.stg_mc_transfers_limited for select to authenticated using (true);
insert into public.stg_mc_transfers_limited (col,col_2,created,manifest,inv_nbr,col_3,origin_lic,origin_facility,origin_type,dest_lic,destination_facility,dest_type,type,received,voided,item_category,ship_d,rcv_d,var,ship_d_2,rcv_d_2,var_2,source_file,file_sha256,licence,file_window) values
(null,null,'45442.48030092593','0002266505',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','5/31/2024','No','Buds','0
ea','0
ea','0','0.0132
lb','0.0138
lb','4.6','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45484.59137731481','0002343351',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','7/12/2024','No','Buds','0
ea','0
ea','0','0.086
lb','0.086
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45491.46483796296','0002357182',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/18/2024','No','Buds','0
ea','0
ea','0','91.0289
lb','91.0289
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45505.43394675926','0002385184',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','8/1/2024','No','Buds','0
ea','0
ea','0','0.269
lb','0.269
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','0.0265
lb','0.0265
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45511.50530092592','0002396606',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','8/8/2024','No','Immature Plants','4
ea','4
ea','0','0
lb','0
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45517.520266203705','0002407821',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/13/2024','No','Buds','0
ea','0
ea','0','7.1165
lb','7.1165
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45519.728125','0002412512',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/15/2024','No','Buds','0
ea','0
ea','0','4.4379
lb','4.4379
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45520.517129629625','0002414309',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','8/16/2024','No','Buds','0
ea','0
ea','0','0.0309
lb','0.0309
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45523.35638888889','0002418226',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC283122','Flower Power Growers, Inc.','Marijuana Cultivator','Unaffiliated Transfer','8/19/2024','No','Immature Plants','140
ea','140
ea','0','0
lb','0
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45530.417719907404','0002432065',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','8/26/2024','No','Buds','0
ea','0
ea','0','41.8217
lb','41.8217
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45532.535682870366','0002436926',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','8/30/2024','No','Buds','0
ea','0
ea','0','0.0265
lb','0.0265
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','0.0132
lb','0.0132
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45532.685335648144','0002437564',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/29/2024','No','Buds','0
ea','0
ea','0','16.4178
lb','16.4178
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','60.0275
lb','60.0275
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45548.38372685185','0002468441',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer',null,'Yes','Shake/Trim (by strain)','0
ea','0
ea','0','19.0523
lb','0
lb','100','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45552.75575231481','0002476920',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/18/2024','No','Shake/Trim (by strain)','0
ea','0
ea','0','19.0523
lb','19.0523
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45559.434375','0002488872',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281278','MCR Labs, LLC','Independent Testing Laboratory','Lab Transfer','9/26/2024','No','Buds','0
ea','0
ea','0','0.0066
lb','0.0066
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45559.436875','0002488693',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281279','ProVerde Laboratories, Inc.','Independent Testing Laboratory','Lab Transfer','9/27/2024','No','Buds','0
ea','0
ea','0','0.0066
lb','0.0066
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45565.50659722222','0002499813',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','9/30/2024','No','Buds','0
ea','0
ea','0','66.4826
lb','66.4826
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45568.49438657407','0002506287',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','10/3/2024','No','Buds','0
ea','0
ea','0','0.119
lb','0.119
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45573.32184027778','0002516124',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281279','ProVerde Laboratories, Inc.','Independent Testing Laboratory','Lab Transfer','10/8/2024','No','Buds','0
ea','0
ea','0','0.2006
lb','0.2006
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45574.595567129625','0002519372',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/9/2024','No','Buds','0
ea','0
ea','0','267.919
lb','267.919
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45580.401608796295','0002528054',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','10/15/2024','No','Buds','0
ea','0
ea','0','0.0926
lb','0.0926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45580.76001157407','0002529301',null,null,'MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','10/16/2024','No','Buds','0
ea','0
ea','0','34.5685
lb','34.5685
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45582.338425925926','0002533024',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','10/17/2024','No','Buds','0
ea','0
ea','0','0.2469
lb','0.2469
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45586.67215277778','0002541420',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','10/22/2024','No','Buds','0
ea','0
ea','0','80.7994
lb','80.7994
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45587.29736111111','0002542501',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','10/22/2024','No','Buds','0
ea','0
ea','0','0.108
lb','0.108
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45593.38486111111','0002553543',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','10/28/2024','No','Buds','0
ea','0
ea','0','16.6669
lb','16.6669
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45594.68331018518','0002557047',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281360','Assured Testing Laboratories LLC','Independent Testing Laboratory','Lab Transfer','10/31/2024','No','Buds','0
ea','0
ea','0','0.1345
lb','0.1214
lb','9.72','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45596.42254629629','0002560062',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','10/31/2024','No','Buds','0
ea','0
ea','0','0.2072
lb','0.2072
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45596.50320601852','0002560294',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','10/31/2024','No','Buds','0
ea','0
ea','0','28.0252
lb','28.0252
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45596.653287037036','0002560774',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','11/4/2024','No','Buds','0
ea','0
ea','0','4.8843
lb','4.8843
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45600.49810185185','0002566403',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/5/2024','No','Buds','0
ea','0
ea','0','2.1561
lb','2.1561
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45602.59853009259','0002570953',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','11/7/2024','No','Buds','0
ea','0
ea','0','0.4079
lb','0.4079
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','0.0066
lb','0.0066
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45604.29858796296','0002574001',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','11/8/2024','No','Buds','0
ea','0
ea','0','45.0404
lb','45.0404
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45609.51530092592','0002584006',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/12/2024','No','Buds','0
ea','0
ea','0','155.7136
lb','155.7136
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45609.527708333335','0002584013',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','11/15/2024','No','Buds','0
ea','0
ea','0','157.7915
lb','157.7915
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45609.535046296296','0002584119',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/14/2024','No','Buds','0
ea','0
ea','0','255.227
lb','255.227
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','31.8083
lb','31.8083
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45610.274375','0002585701',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/14/2024','No','Buds','0
ea','0
ea','0','16.9337
lb','16.9337
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45614.331874999996','0002591616',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','11/21/2024','No','Buds','0
ea','0
ea','0','42.6881
lb','42.6881
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45616.46445601852','0002596548',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','11/21/2024','No','Buds','0
ea','0
ea','0','0.0926
lb','0.0926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45631.40915509259','0002624047',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','12/6/2024','No','Buds','0
ea','0
ea','0','7.9168
lb','7.9168
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45634.785219907404','0002630002',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer',null,'Yes','Buds','0
ea','0
ea','0','98.7318
lb','0
lb','100','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45634.78631944444','0002630201',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer',null,'Yes','Buds','0
ea','0
ea','0','3.2011
lb','0
lb','100','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45635.385787037034','0002630443',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','12/9/2024','No','Buds','0
ea','0
ea','0','8.1637
lb','8.1637
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45637.54858796296','0002636414',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','12/12/2024','No','Buds','0
ea','0
ea','0','0.1389
lb','0.1389
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','0.0728
lb','0.0728
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45645.28917824074','0002650901',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','12/19/2024','No','Buds','0
ea','0
ea','0','5.5556
lb','5.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45645.32550925926','0002650612',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','12/19/2024','No','Buds','0
ea','0
ea','0','0.1543
lb','0.1543
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45646.46368055556','0002652817',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/20/2024','No','Shake/Trim (by strain)','0
ea','0
ea','0','165.0755
lb','165.0755
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45650.40028935185','0002659247',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/26/2024','No','Buds','0
ea','0
ea','0','6.0715
lb','6.0715
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45652.41630787037','0002661839',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','12/26/2024','No','Buds','0
ea','0
ea','0','0.0463
lb','0.0463
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45656.32638888889','0002667816',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','12/30/2024','No','Buds','0
ea','0
ea','0','5.5556
lb','5.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45665.34328703704','0002683121',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','1/9/2025','No','Buds','0
ea','0
ea','0','0.1543
lb','0.1543
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45670.324953703705','0002691820',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','1/20/2025','No','Buds','0
ea','0
ea','0','215.1932
lb','215.1932
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45673.471712962964','0002698436',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','1/20/2025','No','Buds','0
ea','0
ea','0','21.6053
lb','21.6053
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45679.69835648148','0002709307',null,null,'RMD1245-C','BeWell Organic Medicine Inc.','Medical Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','1/23/2025','No','Buds','0
ea','0
ea','0','91.6704
lb','91.6704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45680.36981481481','0002710539',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MT281320','Eagle Eyes Transport Solutions, LLC','Third Party Marijuana Transporter','Unaffiliated Transfer','1/23/2025','No','Buds','0
ea','0
ea','0','5.5556
lb','5.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45685.54430555555','0002720228',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','1/28/2025','No','Buds','0
ea','0
ea','0','2.1605
lb','2.1605
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45687.414560185185','0002725502',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/30/2025','No','Buds','0
ea','0
ea','0','4.3211
lb','4.3211
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45687.48111111111','0002725622',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','1/30/2025','No','Buds','0
ea','0
ea','0','0.022
lb','0.022
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','0.1433
lb','0.1433
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45688.2755787037','0002727402',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','1/31/2025','No','Buds','0
ea','0
ea','0','15.0135
lb','15.0135
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Infused (edible)','1,742
ea','1,742
ea','0','0
lb','0
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45688.34177083333','0002727211',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD1245-C','BeWell Organic Medicine Inc.','Medical Marijuana Cultivator','Unaffiliated Transfer','1/31/2025','No','Buds','0
ea','0
ea','0','91.6704
lb','91.6704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45688.3462037037','0002727118',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC282136','JAMACO, LLC','Marijuana Cultivator','Unaffiliated Transfer','1/31/2025','No','Buds','0
ea','0
ea','0','32.0288
lb','32.0288
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45688.3603125','0002727124',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','1/31/2025','No','Buds','0
ea','0
ea','0','154.9354
lb','154.9354
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45688.36887731481','0002727430',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/31/2025','No','Infused (edible)','1,742
ea','1,742
ea','0','0
lb','0
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45688.37033564815','0002727432',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','1/31/2025','No','Buds','0
ea','0
ea','0','3.0027
lb','3.0027
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45692.367256944446','0002733343',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR282958','GTE Taunton LLC','Marijuana Retailer','Unaffiliated Transfer','2/4/2025','No','Buds','0
ea','0
ea','0','0.3086
lb','0.3086
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45694.2540625','0002737401',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/6/2025','No','Buds','0
ea','0
ea','0','1.2346
lb','1.2346
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45694.258518518516','0002737501',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR284729','BeWell Organic Medicine, Inc.','Marijuana Retailer','Unaffiliated Transfer','2/6/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45694.29918981481','0002737803',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR281811','Mellow Fellows LLC','Marijuana Retailer','Unaffiliated Transfer','2/6/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45694.33118055556','0002737518',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/6/2025','No','Buds','0
ea','0
ea','0','6.2887
lb','6.2887
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45694.37278935185','0002737536',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/6/2025','No','Buds','0
ea','0
ea','0','26.0234
lb','26.0234
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45694.38061342592','0002737842',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD786-P','Green Gold Group, Inc.','Medical Marijuana Product Manufacturer','Unaffiliated Transfer','2/7/2025','No','Buds','0
ea','0
ea','0','27.3594
lb','27.3594
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','89.2872
lb','89.2872
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45694.418969907405','0002737758',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR282902','Green Era LLC','Marijuana Retailer','Unaffiliated Transfer','2/6/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45694.425532407404','0002737576',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR284022','Pioneer Valley Trading Company, Inc.','Marijuana Retailer','Unaffiliated Transfer','2/6/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45694.446608796294','0002737774',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/6/2025','No','Buds','0
ea','0
ea','0','10.009
lb','10.009
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45694.4515625','0002737595',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD445-R','Bask, Inc.','Medical Marijuana Retailer','Unaffiliated Transfer','2/6/2025','No','Buds','0
ea','0
ea','0','4.0036
lb','4.0036
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45694.45460648148','0002737596',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD445-R','Bask, Inc.','Medical Marijuana Retailer','Unaffiliated Transfer','2/6/2025','No','Buds','0
ea','0
ea','0','6.0054
lb','6.0054
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45694.458761574075','0002737901',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR281248','Late Spring, Inc. D/B/A Gage Cannabis Company','Marijuana Retailer','Unaffiliated Transfer','2/7/2025','No','Buds','0
ea','0
ea','0','1.2346
lb','1.2346
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45694.462905092594','0002737784',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/6/2025','No','Buds','0
ea','0
ea','0','0.4244
lb','0.4244
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45695.33280092593','0002739513',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/7/2025','No','Buds','0
ea','0
ea','0','0.3086
lb','0.3086
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45695.346979166665','0002739225',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR281754','Healthy Pharms, Inc.','Marijuana Retailer','Unaffiliated Transfer','2/7/2025','No','Buds','0
ea','0
ea','0','3.7038
lb','3.7038
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45695.382893518516','0002739345',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR281259','Mission MA, Inc.','Marijuana Retailer','Unaffiliated Transfer','2/7/2025','No','Buds','0
ea','0
ea','0','2.4692
lb','2.4692
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45695.39465277777','0002739350',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/7/2025','No','Buds','0
ea','0
ea','0','1.5432
lb','1.5432
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45697.44233796296','0002742205',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/9/2025','No','Buds','0
ea','0
ea','0','117.4028
lb','117.4028
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45698.42618055555','0002743927',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR282474','Full Harvest Moonz, Inc.','Marijuana Retailer','Unaffiliated Transfer','2/11/2025','No','Buds','0
ea','0
ea','0','2.1605
lb','2.1605
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45698.4843287037','0002744133',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR282527','The Vault Retail, Inc.','Marijuana Retailer','Unaffiliated Transfer','2/11/2025','No','Buds','0
ea','0
ea','0','2.4692
lb','2.4692
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Raw Pre-Rolls','0
ea','0
ea','0','0.1058
lb','0.1058
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45698.54541666667','0002744724',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/10/2025','No','Raw Pre-Rolls','0
ea','0
ea','0','0.1058
lb','0.1058
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45699.35673611111','0002745731',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/11/2025','No','Raw Pre-Rolls','0
ea','0
ea','0','0.2116
lb','0.2116
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45699.45579861111','0002746019','Twiste-208',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD445-R','Bask, Inc.','Medical Marijuana Retailer','Unaffiliated Transfer','2/12/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Raw Pre-Rolls','0
ea','0
ea','0','0.2116
lb','0.2116
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45699.458761574075','0002746301','Twiste-142',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR283033','Major Bloom, LLC','Marijuana Retailer','Unaffiliated Transfer','2/14/2025','No','Buds','0
ea','0
ea','0','14.0126
lb','14.0126
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45700.45694444444','0002747960',null,null,'MC282136','JAMACO, LLC','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','2/13/2025','No','Buds','0
ea','0
ea','0','64.8049
lb','64.8049
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45700.526874999996','0002748439',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','2/13/2025','No','Buds','0
ea','0
ea','0','0.3395
lb','0.3395
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45701.50425925926','0002750086',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/13/2025','No','Raw Pre-Rolls','0
ea','0
ea','0','0.2116
lb','0.2116
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45701.54883101852','0002750339','209',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR283714','Thrive Cultivation & Dispensary, LLC','Marijuana Retailer','Unaffiliated Transfer','2/17/2025','No','Buds','0
ea','0
ea','0','0.6173
lb','0.6173
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Raw Pre-Rolls','0
ea','0
ea','0','0.2116
lb','0.2116
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45702.39686342592','0002751822',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/14/2025','No','Buds','0
ea','0
ea','0','0.8378
lb','0.8378
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45704.34880787037','0002753701',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD786-P','Green Gold Group, Inc.','Medical Marijuana Product Manufacturer','Unaffiliated Transfer','2/20/2025','No','Buds','0
ea','0
ea','0','50.0449
lb','50.0449
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45704.40453703704','0002753903',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR281791','Green Gold Group, INC','Marijuana Retailer','Unaffiliated Transfer','2/24/2025','No','Buds','0
ea','0
ea','0','3.7038
lb','3.7038
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45707.49792824074','0002759206',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/19/2025','No','Concentrate','0
ea','0
ea','0','0.0794
lb','0.0794
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45707.545393518514','0002759226','222',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR282474','Full Harvest Moonz, Inc.','Marijuana Retailer','Unaffiliated Transfer','2/21/2025','No','Buds','0
ea','0
ea','0','2.4692
lb','2.4692
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Concentrate','0
ea','0
ea','0','0.0794
lb','0.0794
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45707.553206018514','0002759142',null,null,'MC283122','Flower Power Growers, Inc.','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','2/21/2025','No','Buds','0
ea','0
ea','0','140.6505
lb','140.6505
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45707.63962962963','0002759512',null,null,'RMD1245-C','BeWell Organic Medicine Inc.','Medical Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','2/28/2025','No','Buds','0
ea','0
ea','0','40.7425
lb','40.7425
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45708.32848379629','0002760217',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/20/2025','No','Infused Pre-Rolls','0
ea','0
ea','0','0.0882
lb','0.0882
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Raw Pre-Rolls','0
ea','0
ea','0','0.1058
lb','0.1058
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Vape Product','72
ea','72
ea','0','0
lb','0
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45708.374710648146','0002760518',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','2/20/2025','No','Buds','0
ea','0
ea','0','0.022
lb','0.022
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','0.022
lb','0.022
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45708.40770833333','0002760538',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281507','Bud''s Goods & Service MA Corp.','Marijuana Product Manufacturer','Unaffiliated Transfer','2/21/2025','No','Buds','0
ea','0
ea','0','64.8049
lb','64.8049
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45708.59958333333','0002761152','218',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR283842','Calyx Peak of MA, Inc.','Marijuana Retailer','Unaffiliated Transfer','2/21/2025','No','Buds','0
ea','0
ea','0','1.2346
lb','1.2346
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Infused Pre-Rolls','0
ea','0
ea','0','0.0882
lb','0.0882
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Raw Pre-Rolls','0
ea','0
ea','0','0.1058
lb','0.1058
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Vape Product','72
ea','72
ea','0','0
lb','0
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45708.61351851852','0002761416','217',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR282937','Legal Greens, LLC','Marijuana Retailer','Unaffiliated Transfer','2/21/2025','No','Buds','0
ea','0
ea','0','50.0449
lb','50.0449
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45712.57363425926','0002766748','219',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR281274','Caroline''s Cannabis, LLC','Marijuana Retailer','Unaffiliated Transfer','2/26/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Concentrate','0
ea','0
ea','0','0.0794
lb','0.0794
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45712.57997685185','0002766570',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR283694','Caroline''s Cannabis, LLC','Marijuana Retailer','Unaffiliated Transfer','2/26/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Concentrate','0
ea','0
ea','0','0.0794
lb','0.0794
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45713.28271990741','0002767703',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/25/2025','No','Concentrate','0
ea','0
ea','0','0.1587
lb','0.1587
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45713.29445601851','0002767605',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/25/2025','No','Buds','0
ea','0
ea','0','3.4877
lb','3.4877
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45713.30310185185','0002767708',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC283122','Flower Power Growers, Inc.','Marijuana Cultivator','Unaffiliated Transfer','2/26/2025','No','Buds','0
ea','0
ea','0','140.6505
lb','140.6505
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45714.40349537037','0002770051',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/26/2025','No','Buds','0
ea','0
ea','0','3.8338
lb','3.8338
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45716.39087962963','0002774015','223',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR282885','LMCC, LLC','Marijuana Retailer','Unaffiliated Transfer','3/11/2025','No','Buds','0
ea','0
ea','0','1.2346
lb','1.2346
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Concentrate','0
ea','0
ea','0','0.0794
lb','0.0794
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Infused Pre-Rolls','0
ea','0
ea','0','0.0882
lb','0.0882
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Vape Product','96
ea','96
ea','0','0
lb','0
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45716.40778935185','0002774240',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/28/2025','No','Concentrate','0
ea','0
ea','0','0.0794
lb','0.0794
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Vape Product','96
ea','96
ea','0','0
lb','0
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45721.397939814815','0002783323',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','3/5/2025','No','Raw Pre-Rolls','0
ea','0
ea','0','0.2116
lb','0.2116
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45721.63576388889','0002783836','226',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR282474','Full Harvest Moonz, Inc.','Marijuana Retailer','Unaffiliated Transfer','3/6/2025','No','Buds','0
ea','0
ea','0','2.7778
lb','2.7778
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Raw Pre-Rolls','0
ea','0
ea','0','0.2116
lb','0.2116
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45723.41427083333','0002786736',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/7/2025','No','Buds','0
ea','0
ea','0','6.6227
lb','6.6227
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45723.44421296296','0002786567',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/7/2025','No','Buds','0
ea','0
ea','0','0.3086
lb','0.3086
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45727.345138888886','0002792404',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','3/11/2025','No','Infused Pre-Rolls','0
ea','0
ea','0','0.0882
lb','0.0882
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45727.357569444444','0002792414',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/11/2025','No','Buds','0
ea','0
ea','0','2.1605
lb','2.1605
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45728.43284722222','0002794374',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/12/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45728.536215277774','0002794749','236',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR282937','Legal Greens, LLC','Marijuana Retailer','Unaffiliated Transfer','3/25/2025','No','Buds','0
ea','0
ea','0','74.8646
lb','74.8646
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45729.38576388889','0002796325',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD1245-C','BeWell Organic Medicine Inc.','Medical Marijuana Cultivator','Unaffiliated Transfer','3/17/2025','No','Buds','0
ea','0
ea','0','40.7425
lb','40.7425
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45729.57236111111','0002796659',null,null,'MR283694','Caroline''s Cannabis, LLC','Marijuana Retailer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','3/17/2025','No','Buds','0
ea','0
ea','0','1.4892
lb','1.4892
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45729.57915509259','0002796735',null,null,'MR281274','Caroline''s Cannabis, LLC','Marijuana Retailer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','3/17/2025','No','Buds','0
ea','0
ea','0','1.3812
lb','1.3812
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45733.375185185185','0002801717',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2025','No','Buds','0
ea','0
ea','0','3.5406
lb','3.5406
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45733.410682870366','0002801731',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45733.42519675926','0002801553',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45733.42570601852','0002801653','242',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD705-P','Temescal Wellness of Massachusetts, LLC','Medical Marijuana Product Manufacturer','Unaffiliated Transfer','3/18/2025','No','Buds','0
ea','0
ea','0','9.0081
lb','9.0081
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45733.43827546296','0002801662',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45734.4946412037','0002803688',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/18/2025','No','Buds','0
ea','0
ea','0','28.4132
lb','28.4132
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45735.561331018514','0002806104',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/19/2025','No','Buds','0
ea','0
ea','0','3.0865
lb','3.0865
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45735.571967592594','0002806113',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/19/2025','No','Buds','0
ea','0
ea','0','2.4692
lb','2.4692
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45736.55376157407','0002807743','246',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD445-R','Bask, Inc.','Medical Marijuana Retailer','Unaffiliated Transfer','3/25/2025','No','Buds','0
ea','0
ea','0','10.009
lb','10.009
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45736.55652777778','0002807842','247',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD145-C','Central Ave Compassionate Care, Inc.','Medical Marijuana Cultivator','Unaffiliated Transfer','3/26/2025','No','Buds','0
ea','0
ea','0','30.027
lb','30.027
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45737.353692129625','0002809309',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/21/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45742.39386574074','0002816642',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/26/2025','No','Buds','0
ea','0
ea','0','2.4692
lb','2.4692
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45742.460752314815','0002816767',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','3/27/2025','No','Buds','0
ea','0
ea','0','0.0309
lb','0.0309
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0066
lb','0.0066
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45742.54822916666','0002817163','258',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC281599','140 Industrial Road, LLC','Marijuana Cultivator','Unaffiliated Transfer','3/27/2025','No','Buds','0
ea','0
ea','0','30.027
lb','30.027
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45743.38637731481','0002818541',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/27/2025','No','Buds','0
ea','0
ea','0','2.4692
lb','2.4692
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45743.525567129625','0002819129',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/27/2025','No','Buds','0
ea','0
ea','0','0.6173
lb','0.6173
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45744.41568287037','0002820738','259',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC282052','COASTAL CULTIVARS, INC.','Marijuana Cultivator','Unaffiliated Transfer','4/1/2025','No','Buds','0
ea','0
ea','0','14.0126
lb','14.0126
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45748.414814814816','0002825821',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/1/2025','No','Buds','0
ea','0
ea','0','5.6967
lb','5.6967
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45749.41657407407','0002827908',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','4/3/2025','No','Buds','0
ea','0
ea','0','0.0772
lb','0.0772
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45749.42355324074','0002827924',null,null,'MC282106','UC Cultivation, LLC','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','4/7/2025','No','Buds','0
ea','0
ea','0','52.6243
lb','52.6243
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45750.36325231481','0002829318',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/3/2025','No','Fresh Frozen Flower','0
ea','0
ea','0','46.253
lb','46.253
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45754.42605324074','0002832633',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/7/2025','No','Buds','0
ea','0
ea','0','15.0135
lb','15.0135
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45754.45986111111','0002833102',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','4/11/2025','No','Buds','0
ea','0
ea','0','0.0375
lb','0.0375
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','0.0066
lb','0.0066
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45754.4680787037','0002833110',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/8/2025','No','Buds','0
ea','0
ea','0','40.1859
lb','40.1859
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45754.49576388889','0002833242',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC282106','UC Cultivation, LLC','Marijuana Cultivator','Unaffiliated Transfer','4/10/2025','No','Buds','0
ea','0
ea','0','52.6243
lb','52.6243
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45755.501655092594','0002834912',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/9/2025','No','Buds','0
ea','0
ea','0','0.0463
lb','0.0463
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45756.51664351852','0002836928','264',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR283033','Major Bloom, LLC','Marijuana Retailer','Unaffiliated Transfer','4/25/2025','No','Buds','0
ea','0
ea','0','7.639
lb','7.639
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45757.313321759255','0002837530',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/10/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45761.340277777774','0002842233',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45762.453148148146','0002844451',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD285-P','Healthy Pharms, Inc.','Medical Marijuana Product Manufacturer','Unaffiliated Transfer','4/16/2025','No','Buds','0
ea','0
ea','0','16.0144
lb','16.0144
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45762.61734953704','0002845505',null,null,'MC282106','UC Cultivation, LLC','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','4/19/2025','No','Buds','0
ea','0
ea','0','135.0001
lb','135.0001
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45763.32231481481','0002846433',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/16/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45764.41511574074','0002848457',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','4/17/2025','No','Buds','0
ea','0
ea','0','0.0463
lb','0.0463
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45766.452210648145','0002851902',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/19/2025','No','Buds','0
ea','0
ea','0','7.0923
lb','7.0923
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45768.2896412037','0002852607','275',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD1085-C','ARL Healthcare, Inc.','Medical Marijuana Cultivator','Unaffiliated Transfer','4/22/2025','No','Buds','0
ea','0
ea','0','10.009
lb','10.009
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45768.31273148148','0002852516',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/21/2025','No','Buds','0
ea','0
ea','0','14.7357
lb','14.7357
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45770.322800925926','0002855433',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/23/2025','No','Buds','0
ea','0
ea','0','0.0386
lb','0.0386
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45771.30746527777','0002856909',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/24/2025','No','Buds','0
ea','0
ea','0','12.4186
lb','12.4186
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45771.34662037037','0002856938',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','4/24/2025','No','Buds','0
ea','0
ea','0','0.0617
lb','0.0617
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0132
lb','0.0132
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45771.41043981481','0002857118',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/24/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45771.52192129629','0002857537',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR282633','UC Retail, LLC','Marijuana Retailer','Unaffiliated Transfer','4/25/2025','No','Buds','0
ea','0
ea','0','135.0001
lb','135.0001
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45777.317141203705','0002863710',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/30/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45777.41260416667','0002864004',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281417','Pioneer Valley Extracts, LLC','Marijuana Product Manufacturer','Unaffiliated Transfer','5/5/2025','No','Shake/Trim (by strain)','0
ea','0
ea','0','44.6436
lb','44.6436
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45777.60863425926','0002864758','269',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR282937','Legal Greens, LLC','Marijuana Retailer','Unaffiliated Transfer','5/1/2025','No','Buds','0
ea','0
ea','0','50.0449
lb','50.0449
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45778.36623842592','0002865541',null,null,'RMD1245-C','BeWell Organic Medicine Inc.','Medical Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','5/2/2025','No','Buds','0
ea','0
ea','0','65.1466
lb','65.1466
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45779.35203703703','0002866922',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/2/2025','No','Buds','0
ea','0
ea','0','46.5219
lb','46.5219
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','87.3868
lb','87.3868
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45782.32754629629','0002868448',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/5/2025','No','Buds','0
ea','0
ea','0','3.3334
lb','3.3334
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45782.48162037037','0002869115',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/5/2025','No','Buds','0
ea','0
ea','0','4.7796
lb','4.7796
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45782.56912037037','0002869513',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/5/2025','No','Buds','0
ea','0
ea','0','1.6402
lb','1.6402
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45783.4353125','0002870314',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/6/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45783.56905092592','0002870907',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/6/2025','No','Buds','0
ea','0
ea','0','12.5134
lb','12.5134
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45784.336134259254','0002871643',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','5/8/2025','No','Buds','0
ea','0
ea','0','0.0375
lb','0.0375
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0287
lb','0.0287
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45784.58181712963','0002872671',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD1245-C','BeWell Organic Medicine Inc.','Medical Marijuana Cultivator','Unaffiliated Transfer','5/8/2025','No','Buds','0
ea','0
ea','0','65.1466
lb','65.1466
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45786.31502314815','0002874853',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/9/2025','No','Buds','0
ea','0
ea','0','2.5309
lb','2.5309
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45786.39986111111','0002875369',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/9/2025','No','Buds','0
ea','0
ea','0','27.0728
lb','27.0728
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45791.30427083333','0002880037',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/14/2025','No','Buds','0
ea','0
ea','0','7.7426
lb','7.7426
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45792.27633101852','0002881803',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/15/2025','No','Buds','0
ea','0
ea','0','0.0309
lb','0.0309
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','93.2114
lb','93.2114
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45792.28986111111','0002881625',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/15/2025','No','Buds','0
ea','0
ea','0','0.0309
lb','0.0309
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45796.329421296294','0002885220',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','5/19/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45796.33217592593','0002885327',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/19/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45796.3383449074','0002885228',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/19/2025','No','Buds','0
ea','0
ea','0','0.0309
lb','0.0309
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45799.29225694444','0002890713',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','5/22/2025','No','Buds','0
ea','0
ea','0','0.1235
lb','0.1235
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0331
lb','0.0331
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45799.36861111111','0002890906',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/22/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45800.31570601852','0002892217',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/23/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45804.303576388884','0002894714',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/27/2025','No','Buds','0
ea','0
ea','0','6.0054
lb','6.0054
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45804.42011574074','0002895127',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/27/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45804.44940972222','0002895183',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/27/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45804.510613425926','0002895397',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/27/2025','No','Buds','0
ea','0
ea','0','4.0036
lb','4.0036
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45804.525925925926','0002895517',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/27/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45804.63667824074','0002895910',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/27/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45805.45025462963','0002896948',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/28/2025','No','Buds','0
ea','0
ea','0','50.0449
lb','50.0449
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45805.463229166664','0002897040',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/28/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45805.52297453704','0002897315',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/28/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45805.604166666664','0002897616',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/28/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45805.66335648148','0002897761',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/28/2025','No','Fresh Frozen Flower','0
ea','0
ea','0','243.4234
lb','243.4234
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45806.40130787037','0002898200',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','5/29/2025','No','Buds','0
ea','0
ea','0','0.0926
lb','0.0926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Raw Pre-Rolls','0
ea','0
ea','0','0.0066
lb','0.0066
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45806.515069444446','0002898876',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','5/29/2025','No','Buds','0
ea','0
ea','0','17.0153
lb','17.0153
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45806.52043981481','0002898948',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/29/2025','No','Buds','0
ea','0
ea','0','17.0153
lb','17.0153
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45810.85559027777','0002903705',null,null,'RMD1245-C','BeWell Organic Medicine Inc.','Medical Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','6/5/2025','No','Buds','0
ea','0
ea','0','111.3246
lb','111.3246
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45812.42417824074','0002906414',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/4/2025','No','Buds','0
ea','0
ea','0','4.0036
lb','4.0036
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45812.54723379629','0002907218',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/4/2025','No','Raw Pre-Rolls','0
ea','0
ea','0','13.069
lb','13.069
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45813.39232638889','0002908033',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/5/2025','No','Buds','0
ea','0
ea','0','9.9561
lb','9.9561
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45817.29027777778','0002910706',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/9/2025','No','Buds','0
ea','0
ea','0','13.2674
lb','13.2674
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45818.27438657407','0002911949',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/10/2025','No','Buds','0
ea','0
ea','0','0.0154
lb','0.0154
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45819.46092592592','0002914508',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/11/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45820.37034722222','0002915665',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/12/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45820.42704861111','0002915780',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD1245-C','BeWell Organic Medicine Inc.','Medical Marijuana Cultivator','Unaffiliated Transfer','6/13/2025','No','Buds','0
ea','0
ea','0','111.3246
lb','111.3246
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45824.35513888889','0002918753',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/16/2025','No','Buds','0
ea','0
ea','0','75.8082
lb','75.8082
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45824.4640162037','0002919184',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','6/17/2025','No','Buds','0
ea','0
ea','0','0.1455
lb','0.1363
lb','6.31','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45825.27056712963','0002920275',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/17/2025','No','Buds','0
ea','0
ea','0','7.7845
lb','7.7845
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45825.33097222222','0002920407',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','6/17/2025','No','Buds','0
ea','0
ea','0','43.8169
lb','43.8169
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45826.27993055555','0002922210',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281354','SafeTiva Labs LLC','Independent Testing Laboratory','Lab Transfer','6/18/2025','No','Fresh Frozen Flower','0
ea','0
ea','0','0.0132
lb','0.0132
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45831.43219907407','0002927622',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/23/2025','No','Fresh Frozen Flower','0
ea','0
ea','0','45.6225
lb','45.6225
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45831.47130787037','0002927739',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/23/2025','No','Buds','0
ea','0
ea','0','10.009
lb','10.009
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45833.61278935185','0002932141',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/25/2025','No','Buds','0
ea','0
ea','0','46.1736
lb','46.1736
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45838.47802083333','0002937293',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','7/1/2025','No','Buds','0
ea','0
ea','0','0.582
lb','0.6419
lb','10.29','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45838.48410879629','0002937298',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/30/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45839.49804398148','0002939099',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/1/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45839.51917824074','0002939301',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/1/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45839.547118055554','0002939417',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/1/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45839.632581018515','0002939755',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/1/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45840.514710648145','0002940840','351',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR282742','Olde World Remedies, Inc.','Marijuana Retailer','Unaffiliated Transfer','7/3/2025','No','Buds','0
ea','0
ea','0','5.0045
lb','5.0045
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45840.66228009259','0002941605','343',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281361','Cresco HHH, LLC','Marijuana Product Manufacturer','Unaffiliated Transfer','7/8/2025','No','Buds','0
ea','0
ea','0','60.0539
lb','59.9479
lb','0.18','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45845.62950231481','0002945015','1333',null,'MC282136','JAMACO, LLC','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','7/9/2025','No','Buds','0
ea','0
ea','0','32.8453
lb','32.8453
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45846.44893518518','0002946054',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','7/9/2025','No','Fresh Frozen Flower','0
ea','0
ea','0','0.0595
lb','0.0725
lb','21.78','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45846.46021990741','0002946072',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/8/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45846.53837962963','0002946421',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/8/2025','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45846.617384259254','0002946724',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/8/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45847.47635416666','0002948003',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/9/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45847.5003125','0002948122',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/9/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45847.55092592593','0002948368',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/9/2025','No','Buds','0
ea','0
ea','0','13.4923
lb','13.4923
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45847.61203703703','0002948561',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/9/2025','No','Buds','0
ea','0
ea','0','2.112
lb','2.112
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45847.624872685185','0002948681',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/9/2025','No','Buds','0
ea','0
ea','0','6.0054
lb','6.0054
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45847.65684027778','0002948860',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/9/2025','No','Buds','0
ea','0
ea','0','3.9639
lb','3.9639
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45847.76449074074','0002948970',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/9/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45848.18746527778','0002949108',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/10/2025','No','Buds','0
ea','0
ea','0','30.027
lb','30.027
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45848.20946759259','0002949109',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/10/2025','No','Buds','0
ea','0
ea','0','1.0009
lb','1.0009
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45848.26616898148','0002948987',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/10/2025','No','Buds','0
ea','0
ea','0','3.0027
lb','3.0027
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45848.28674768518','0002949203',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/10/2025','No','Buds','0
ea','0
ea','0','1.5013
lb','1.5013
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45848.2971412037','0002949213',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/10/2025','No','Buds','0
ea','0
ea','0','6.0054
lb','6.0054
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45848.50927083333','0002950043',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/10/2025','No','Buds','0
ea','0
ea','0','2.963
lb','2.963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45849.32565972222','0002951126',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/11/2025','No','Buds','0
ea','0
ea','0','1.5013
lb','1.5013
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45849.62824074074','0002952018','PROCESSING TRANSFER 
- 1',null,'MC282527','Grow One Inc.','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','7/15/2025','No','Buds','0
ea','0
ea','0','23.0934
lb','23.0934
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45852.40798611111','0002953106',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/14/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45852.45942129629','0002953307',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/14/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45852.65862268519','0002954107','344',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281361','Cresco HHH, LLC','Marijuana Product Manufacturer','Unaffiliated Transfer','7/15/2025','No','Buds','0
ea','0
ea','0','81.2073
lb','81.2518
lb','0.05','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45853.38878472222','0002954575',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2025','No','Buds','0
ea','0
ea','0','2.963
lb','2.963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45853.413263888884','0002954714',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2025','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45853.463275462964','0002955010',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2025','No','Buds','0
ea','0
ea','0','12.0108
lb','12.0108
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45853.59554398148','0002955284',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281507','Bud''s Goods & Service MA Corp.','Marijuana Product Manufacturer','Unaffiliated Transfer','7/16/2025','No','Buds','0
ea','0
ea','0','32.8453
lb','32.8453
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45853.6102662037','0002955546',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45853.62825231481','0002955572','383',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR282766','GTE Franklin LLC','Marijuana Retailer','Unaffiliated Transfer','7/16/2025','No','Buds','0
ea','0
ea','0','23.0207
lb','23.0207
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45854.27862268518','0002956202',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','7/16/2025','No','Buds','0
ea','0
ea','0','0.2381
lb','0.2535
lb','6.45','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0198
lb','0.0509
lb','156.33','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45854.314155092594','0002956218',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/16/2025','No','Fresh Frozen Flower','0
ea','0
ea','0','463.4844
lb','463.4844
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45854.470555555556','0002956903','374',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR284914','Underground Legacy Social Club, LLC','Marijuana Retailer','Unaffiliated Transfer','7/18/2025','No','Buds','0
ea','0
ea','0','2.2972
lb','2.2972
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45854.496458333335','0002956893',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/16/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45854.514386574076','0002957212','377',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD145-C','Central Ave Compassionate Care, Inc.','Medical Marijuana Cultivator','Unaffiliated Transfer','7/17/2025','No','Buds','0
ea','0
ea','0','14.0126
lb','14.0126
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45854.54456018518','0002957056','378',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD145-C','Central Ave Compassionate Care, Inc.','Medical Marijuana Cultivator','Unaffiliated Transfer','7/17/2025','No','Buds','0
ea','0
ea','0','19.0171
lb','19.0171
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45855.34793981481','0002958403',null,null,'MP281361','Cresco HHH, LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','7/17/2025','No','Buds','0
ea','0
ea','0','14.9288
lb','14.9288
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45855.50222222222','0002959119',null,null,'MC282136','JAMACO, LLC','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','7/21/2025','No','Buds','0
ea','0
ea','0','26.8016
lb','26.8016
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45856.59230324074','0002960727',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC282527','Grow One Inc.','Marijuana Cultivator','Unaffiliated Transfer','7/23/2025','No','Buds','0
ea','0
ea','0','7.6108
lb','7.6108
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45856.59497685185','0002960733',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281325','Nova Farms, LLC','Marijuana Product Manufacturer','Unaffiliated Transfer','7/22/2025','No','Buds','0
ea','0
ea','0','15.4826
lb','15.4826
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45859.30013888889','0002961685',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/21/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45859.37231481481','0002962014',null,null,'MC282690','Mayflower Medicinals, Inc.','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','7/22/2025','No','Buds','0
ea','0
ea','0','110.1518
lb','110.1518
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45859.527928240735','0002962464','387',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR283963','617 Therapeutic Health Care, Inc.','Marijuana Retailer','Unaffiliated Transfer',null,'Yes','Buds','0
ea','0
ea','0','6.0054
lb','0
lb','100','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45859.53371527778','0002962559','386',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR283963','617 Therapeutic Health Care, Inc.','Marijuana Retailer','Unaffiliated Transfer',null,'Yes','Buds','0
ea','0
ea','0','4.0036
lb','0
lb','100','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45860.42605324074','0002963765',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/22/2025','No','Buds','0
ea','0
ea','0','2.7778
lb','2.7778
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45860.48092592593','0002964124',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/22/2025','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45860.63009259259','0002964650',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/22/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45860.6558912037','0002964673',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/22/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45861.20274305555','0002965202',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','7/23/2025','No','Buds','0
ea','0
ea','0','0.4343
lb','0.4678
lb','7.71','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45861.422060185185','0002965665',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/23/2025','No','Buds','0
ea','0
ea','0','6.0054
lb','6.0054
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45861.47747685185','0002966021',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC282136','JAMACO, LLC','Marijuana Cultivator','Unaffiliated Transfer','7/24/2025','No','Buds','0
ea','0
ea','0','11.5544
lb','11.5544
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45861.50785879629','0002966062',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281507','Bud''s Goods & Service MA Corp.','Marijuana Product Manufacturer','Unaffiliated Transfer','7/25/2025','No','Buds','0
ea','0
ea','0','15.2472
lb','15.2472
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45861.55842592593','0002966232',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/23/2025','No','Buds','0
ea','0
ea','0','4.374
lb','4.374
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45862.360810185186','0002967150',null,null,'MC282136','JAMACO, LLC','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','7/24/2025','No','Buds','0
ea','0
ea','0','22.2909
lb','22.2909
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45862.421319444446','0002967333',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/24/2025','No','Buds','0
ea','0
ea','0','14.9288
lb','14.9288
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','177.6286
lb','177.6286
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45862.45045138889','0002967518',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/24/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45862.51510416666','0002967723',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD145-C','Central Ave Compassionate Care, Inc.','Medical Marijuana Cultivator','Unaffiliated Transfer','7/25/2025','No','Buds','0
ea','0
ea','0','2.0018
lb','2.0018
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45863.36872685185','0002968664',null,null,'RMD145-C','Central Ave Compassionate Care, Inc.','Medical Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','7/25/2025','No','Buds','0
ea','0
ea','0','2.0018
lb','2.0018
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45863.60472222222','0002969574',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/25/2025','No','Buds','0
ea','0
ea','0','3.0027
lb','3.0027
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45866.48091435185','0002971221',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/28/2025','No','Buds','0
ea','0
ea','0','3.2981
lb','3.2981
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45866.52868055555','0002971620',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/28/2025','No','Buds','0
ea','0
ea','0','10.009
lb','10.009
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45866.538564814815','0002971541',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/28/2025','No','Buds','0
ea','0
ea','0','3.0027
lb','3.0027
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45867.61666666666','0002973723',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC282690','Mayflower Medicinals, Inc.','Marijuana Cultivator','Unaffiliated Transfer','7/30/2025','No','Buds','0
ea','0
ea','0','90.3102
lb','90.3102
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45868.28611111111','0002974203',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/30/2025','No','Buds','0
ea','0
ea','0','0.0617
lb','0.0617
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45868.444768518515','0002974495',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/30/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45868.57059027778','0002975244',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/30/2025','No','Buds','0
ea','0
ea','0','6.0054
lb','6.0054
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45869.25064814815','0002976120',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/31/2025','No','Buds','0
ea','0
ea','0','0.0617
lb','0.0617
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45869.27216435185','0002976060',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/31/2025','No','Buds','0
ea','0
ea','0','1.0009
lb','1.0009
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45869.44699074074','0002976621',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281507','Bud''s Goods & Service MA Corp.','Marijuana Product Manufacturer','Unaffiliated Transfer','8/1/2025','No','Buds','0
ea','0
ea','0','22.2909
lb','22.2909
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45869.59657407407','0002977113',null,null,'MC282136','JAMACO, LLC','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','8/1/2025','No','Buds','0
ea','0
ea','0','21.7155
lb','21.7155
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45873.337546296294','0002979591',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/4/2025','No','Buds','0
ea','0
ea','0','71.529
lb','71.529
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45873.382326388884','0002979647',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/4/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45874.3302662037','0002981433',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','8/6/2025','No','Buds','0
ea','0
ea','0','0.5027
lb','0.5321
lb','5.86','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45874.41540509259','0002981811',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/5/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45874.51585648148','0002982154',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281507','Bud''s Goods & Service MA Corp.','Marijuana Product Manufacturer','Unaffiliated Transfer','8/7/2025','No','Buds','0
ea','0
ea','0','21.7155
lb','21.7155
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45874.6066087963','0002982446',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/5/2025','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45875.455613425926','0002983367','396',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281361','Cresco HHH, LLC','Marijuana Product Manufacturer','Unaffiliated Transfer','8/8/2025','No','Buds','0
ea','0
ea','0','106.7368
lb','106.7368
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45875.52922453704','0002983829',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/6/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45875.58640046296','0002983924',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/6/2025','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45875.63260416666','0002984201','410',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR281352','Pure Oasis LLC','Marijuana Retailer','Unaffiliated Transfer','8/7/2025','No','Buds','0
ea','0
ea','0','3.1482
lb','3.1482
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45875.6502199074','0002984215','412',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR284576','Pure Oasis LLC','Marijuana Retailer','Unaffiliated Transfer','8/7/2025','No','Buds','0
ea','0
ea','0','3.1482
lb','3.1482
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45875.67625','0002984227',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/6/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45880.375659722224','0002987941',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/11/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45880.41583333333','0002988205',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/11/2025','No','Buds','0
ea','0
ea','0','53.8501
lb','53.8501
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45881.3452662037','0002989429',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','8/14/2025','No','Buds','0
ea','0
ea','0','0.1698
lb','0.1948
lb','14.76','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0198
lb','0.0239
lb','20.67','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45881.39377314815','0002989492',null,null,'MC282690','Mayflower Medicinals, Inc.','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','8/13/2025','No','Buds','0
ea','0
ea','0','101.5141
lb','101.5141
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45881.40384259259','0002989582',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/12/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45881.41255787037','0002989617',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/12/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45881.42172453704','0002989595',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/12/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45881.46806712963','0002989867',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/12/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45882.37125','0002990786',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/13/2025','No','Buds','0
ea','0
ea','0','2.7778
lb','2.7778
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45882.531759259255','0002991510',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/13/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45882.59804398148','0002991694',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/13/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45882.62600694444','0002991743',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/13/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45883.40597222222','0002992465',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/14/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45883.69798611111','0002993441',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/14/2025','No','Buds','0
ea','0
ea','0','26.4422
lb','26.4422
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45887.42230324074','0002995604',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/18/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45887.442453703705','0002995624',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/18/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45887.52222222222','0002995771',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/18/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45888.40797453703','0002996766',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/19/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45888.500185185185','0002996987',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/19/2025','No','Buds','0
ea','0
ea','0','18.3866
lb','18.3866
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45888.511516203704','0002997336',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/19/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45888.53253472222','0002997355',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/19/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45888.554085648146','0002997446',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/19/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45889.45346064815','0002998360',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/20/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45889.47474537037','0002998389',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/22/2025','No','Buds','0
ea','0
ea','0','60.0539
lb','60.0539
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','237.5503
lb','237.5503
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45889.500081018516','0002998291',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','8/22/2025','No','Buds','0
ea','0
ea','0','0.3175
lb','0.3114
lb','1.92','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45889.6205324074','0002998798',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/20/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45890.40189814815','0002999470',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/21/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45890.41063657407','0002999746',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/21/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45890.42119212963','0002999805',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/21/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45890.57239583333','0003000222',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/21/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45890.59982638889','0003000246',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/21/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45894.37292824074','0003002674',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/25/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45894.4293287037','0003002481',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/25/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45894.476689814815','0003002941',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/25/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45894.48895833333','0003002796',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/25/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45895.41534722222','0003004155',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','8/27/2025','No','Buds','0
ea','0
ea','0','0.0265
lb','0.0262
lb','1.08','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0265
lb','0.0711
lb','168.75','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45895.42952546296','0003004356',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/26/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45895.48114583333','0003004609',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/26/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45895.51034722222','0003004545',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/26/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45895.556874999995','0003004755',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/26/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45895.58728009259','0003004781',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/26/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45895.612233796295','0003004934',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/26/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45895.64040509259','0003004856','366',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC282690','Mayflower Medicinals, Inc.','Marijuana Cultivator','Unaffiliated Transfer','8/27/2025','No','Buds','0
ea','0
ea','0','53.0476
lb','53.0476
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45896.5218287037','0003006340',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/27/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45896.6337037037','0003006803',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/27/2025','No','Buds','0
ea','0
ea','0','8.9331
lb','8.9331
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45897.376817129625','0003006976',null,null,'MC282690','Mayflower Medicinals, Inc.','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','8/29/2025','No','Buds','0
ea','0
ea','0','135.042
lb','135.042
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45897.379432870366','0003007126',null,null,'MC282690','Mayflower Medicinals, Inc.','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','8/29/2025','No','Buds','0
ea','0
ea','0','141.2854
lb','141.2854
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45897.428564814814','0003007321',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/28/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45897.43194444444','0003007226',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR284871','CATDOGG LLC','Marijuana Retailer','Unaffiliated Transfer','8/28/2025','No','Buds','0
ea','0
ea','0','0.0231
lb','0.0231
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45897.48796296296','0003007601',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC282690','Mayflower Medicinals, Inc.','Marijuana Cultivator','Unaffiliated Transfer','8/29/2025','No','Buds','0
ea','0
ea','0','121.3557
lb','121.3557
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45897.50421296296','0003007484',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/28/2025','No','Buds','0
ea','0
ea','0','3.5186
lb','3.5186
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45897.539722222224','0003007643',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/28/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45898.34747685185','0003008332',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/29/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45898.36053240741','0003008528',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/29/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45898.377187499995','0003008256',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/29/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45898.50268518518','0003008752',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/29/2025','No','Fresh Frozen Flower','0
ea','0
ea','0','46.1207
lb','46.1207
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45902.394537037035','0003010270',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/2/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45902.42126157407','0003010294',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/2/2025','No','Buds','0
ea','0
ea','0','44.9875
lb','44.9875
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','137.6875
lb','137.6875
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45904.53530092593','0003013902',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/4/2025','No','Buds','0
ea','0
ea','0','20.018
lb','20.018
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45908.57171296296','0003017069',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/8/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45908.57777777778','0003017073',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/8/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45908.58283564814','0003017076',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/8/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45908.58804398148','0003017082',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/8/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45908.657905092594','0003017352',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/8/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45909.40571759259','0003017938','484',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR281271','Silver Therapeutics, Inc.','Marijuana Retailer','Unaffiliated Transfer','9/11/2025','No','Buds','0
ea','0
ea','0','15.0135
lb','15.0135
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45909.41517361111','0003017956',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/9/2025','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45909.485243055555','0003018125',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/9/2025','No','Buds','0
ea','0
ea','0','24.0216
lb','24.0216
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45910.46710648148','0003019355',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','9/11/2025','No','Buds','0
ea','0
ea','0','0.1058
lb','0.1104
lb','4.35','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0397
lb','0.1002
lb','152.56','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45912.34054398148','0003021725',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC282690','Mayflower Medicinals, Inc.','Marijuana Cultivator','Unaffiliated Transfer','9/12/2025','No','Buds','0
ea','0
ea','0','66.2621
lb','66.2621
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45912.38967592592','0003021830',null,null,'MC282690','Mayflower Medicinals, Inc.','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','9/12/2025','No','Buds','0
ea','0
ea','0','107.0104
lb','107.0104
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45915.39202546296','0003023358',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/15/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45915.40130787037','0003023269',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/15/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45915.42123842592','0003023290',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/15/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45915.45920138889','0003023531',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/15/2025','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45915.55535879629','0003023790',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/15/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45915.58609953704','0003023836',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR284871','CATDOGG LLC','Marijuana Retailer','Unaffiliated Transfer','9/16/2025','No','Buds','0
ea','0
ea','0','0.0309
lb','0.0309
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45916.362974537034','0003024481',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/16/2025','No','Fresh Frozen Flower','0
ea','0
ea','0','361.9153
lb','361.9153
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45916.39435185185','0003024543',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','9/17/2025','No','Buds','0
ea','0
ea','0','0.011
lb','0.01
lb','9.02','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45916.47372685185','0003024696','452',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC282052','COASTAL CULTIVARS, INC.','Marijuana Cultivator','Unaffiliated Transfer','9/17/2025','No','Buds','0
ea','0
ea','0','35.0315
lb','35.0315
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45917.39341435185','0003025918',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/17/2025','No','Buds','0
ea','0
ea','0','9.0081
lb','9.0081
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45917.40290509259','0003025925',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/17/2025','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45918.605578703704','0003028106',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC282690','Mayflower Medicinals, Inc.','Marijuana Cultivator','Unaffiliated Transfer','9/19/2025','No','Buds','0
ea','0
ea','0','135.0486
lb','135.0486
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45919.44734953703','0003028735',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC282690','Mayflower Medicinals, Inc.','Marijuana Cultivator','Unaffiliated Transfer','9/19/2025','No','Buds','0
ea','0
ea','0','90.028
lb','90.028
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45919.60655092592','0003029075',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/19/2025','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45922.55978009259','0003030725',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/22/2025','No','Buds','0
ea','0
ea','0','9.7995
lb','9.7995
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45922.588900462964','0003030756',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/22/2025','No','Buds','0
ea','0
ea','0','5.8356
lb','5.8356
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45922.621620370366','0003031128',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/22/2025','No','Buds','0
ea','0
ea','0','9.449
lb','9.449
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45922.65372685185','0003031220',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/22/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45923.438472222224','0003031589',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/23/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45923.4942824074','0003031794',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/23/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45923.665983796294','0003032287',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR284871','CATDOGG LLC','Marijuana Retailer','Unaffiliated Transfer','9/24/2025','No','Buds','0
ea','0
ea','0','0.0231
lb','0.0231
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45924.34255787037','0003032745',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','9/26/2025','No','Buds','0
ea','0
ea','0','0.366
lb','0.3789
lb','3.53','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0265
lb','0.0396
lb','49.67','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45924.38099537037','0003032978',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/24/2025','No','Buds','0
ea','0
ea','0','2.5926
lb','2.5926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45924.616631944446','0003033838','508',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281507','Bud''s Goods & Service MA Corp.','Marijuana Product Manufacturer','Unaffiliated Transfer','9/26/2025','No','Buds','0
ea','0
ea','0','14.5726
lb','14.5726
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45925.40493055555','0003034705',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/25/2025','No','Buds','0
ea','0
ea','0','3.5186
lb','3.5186
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45925.437951388885','0003034580',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/25/2025','No','Buds','0
ea','0
ea','0','3.889
lb','3.889
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45925.55278935185','0003034990',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/25/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45926.40715277778','0003036109','526',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD145-C','Central Ave Compassionate Care, Inc.','Medical Marijuana Cultivator','Unaffiliated Transfer','9/29/2025','No','Buds','0
ea','0
ea','0','27.0243
lb','27.0243
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45930.39362268518','0003039252',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/30/2025','No','Buds','0
ea','0
ea','0','2.5926
lb','2.5926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45930.508888888886','0003039466',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','10/3/2025','No','Buds','0
ea','0
ea','0','0.1808
lb','0.1799
lb','0.47','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45930.577951388885','0003039687',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','9/30/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45931.34206018518','0003040335',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/1/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45931.34773148148','0003040435',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/1/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45931.38335648148','0003040811',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/1/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45931.40626157407','0003040826',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/1/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45931.42152777778','0003040557',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/1/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45931.52003472222','0003041116',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/1/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45931.581238425926','0003041171',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/1/2025','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45931.605520833335','0003041187',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/1/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45932.34043981481','0003041716',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/2/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45932.43041666666','0003041794',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/2/2025','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45932.46324074074','0003041897',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/2/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45932.51849537037','0003041965',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/2/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45932.61974537037','0003042241',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/2/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45936.41166666667','0003044773',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/6/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45936.417546296296','0003044899',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/6/2025','No','Buds','0
ea','0
ea','0','60.0539
lb','60.0539
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','234.2786
lb','234.2786
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45936.42228009259','0003044783',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','10/8/2025','No','Buds','0
ea','0
ea','0','0.1587
lb','0.1652
lb','4.06','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45936.48131944444','0003045406',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/6/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45936.508125','0003045323',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/6/2025','No','Buds','0
ea','0
ea','0','2.5926
lb','2.5926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45937.38917824074','0003045978',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MC282690','Mayflower Medicinals, Inc.','Marijuana Cultivator','Unaffiliated Transfer','10/7/2025','No','Buds','0
ea','0
ea','0','91.9991
lb','91.9991
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45937.41532407407','0003046196','540',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281764','Coastal Cultivars, Inc.','Marijuana Product Manufacturer','Unaffiliated Transfer','10/8/2025','No','Buds','0
ea','0
ea','0','13.0117
lb','13.0117
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45937.48991898148','0003046457',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/7/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45938.41846064814','0003047482',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/8/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45938.46121527778','0003047775',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/8/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45938.61662037037','0003048427',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/8/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45938.62777777777','0003048187',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/8/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45939.31849537037','0003049251',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/9/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45939.34407407407','0003049412',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/9/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45939.35461805556','0003049524',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/9/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45939.35612268518','0003049295',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/9/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45939.45228009259','0003049807',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/9/2025','No','Buds','0
ea','0
ea','0','60.0275
lb','60.0275
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45943.55274305555','0003052970',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/13/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45944.441458333335','0003053845',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/14/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45944.49640046296','0003054203',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/14/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45944.525821759256','0003054072',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/14/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45945.431759259256','0003055345',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/15/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45945.46408564815','0003055551',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/15/2025','No','Buds','0
ea','0
ea','0','1.2412
lb','1.2412
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45945.474340277775','0003055463',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/15/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45945.51429398148','0003055634',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/15/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45945.65103009259','0003056043',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/15/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45946.3699537037','0003056539',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/16/2025','No','Buds','0
ea','0
ea','0','45.0063
lb','45.0063
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45946.408229166664','0003056618','569',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR284914','Underground Legacy Social Club, LLC','Marijuana Retailer','Unaffiliated Transfer','10/17/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45946.45136574074','0003056751',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/16/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45946.55805555556','0003057050',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/16/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45946.55915509259','0003056898',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/16/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45946.56828703704','0003057062',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/16/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45946.61447916667','0003057173','576',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MD1298','Green Flash Delivery LLC','Marijuana Delivery Operator','Unaffiliated Transfer','10/17/2025','No','Buds','0
ea','0
ea','0','9.0081
lb','9.0081
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45946.638078703705','0003057281','571',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MR284871','CATDOGG LLC','Marijuana Retailer','Unaffiliated Transfer','10/17/2025','No','Buds','0
ea','0
ea','0','0.0309
lb','0.0309
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45950.54280092593','0003059582',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/21/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026');
insert into public.stg_mc_transfers_limited (col,col_2,created,manifest,inv_nbr,col_3,origin_lic,origin_facility,origin_type,dest_lic,destination_facility,dest_type,type,received,voided,item_category,ship_d,rcv_d,var,ship_d_2,rcv_d_2,var_2,source_file,file_sha256,licence,file_window) values
(null,null,'45951.43494212963','0003060876',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/21/2025','No','Buds','0
ea','0
ea','0','6.6668
lb','6.6668
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45951.50340277777','0003061235',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/21/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45951.52835648148','0003061186',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/21/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45951.62348379629','0003061547',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/21/2025','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45952.29622685185','0003062207',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','10/22/2025','No','Buds','0
ea','0
ea','0','0.1653
lb','0.1699
lb','2.73','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45953.36673611111','0003063772',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/23/2025','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45953.38993055555','0003063846',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/23/2025','No','Buds','0
ea','0
ea','0','3.3334
lb','3.3334
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45953.42712962963','0003063871',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/23/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45954.397268518514','0003065313',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','10/24/2025','No','Fresh Frozen Flower','0
ea','0
ea','0','0.0331
lb','0.0946
lb','185.99','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45957.50489583333','0003067187',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/27/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45958.4902662037','0003068760',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/28/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45958.532546296294','0003068700',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/28/2025','No','Buds','0
ea','0
ea','0','0.0309
lb','0.0309
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45958.59466435185','0003069223',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/28/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45959.36493055555','0003069494',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/29/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45959.368125','0003069807',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','10/29/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45959.36876157407','0003069809',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/29/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45959.41144675926','0003070101',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/29/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45960.321435185186','0003070972',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','10/30/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45960.325474537036','0003071056',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/30/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45960.382893518516','0003071263',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/30/2025','No','Buds','0
ea','0
ea','0','14.987
lb','14.987
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','108.1257
lb','108.1257
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45960.42028935185','0003071298',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','10/31/2025','No','Buds','0
ea','0
ea','0','0.5093
lb','0.5137
lb','0.88','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45960.51134259259','0003071678',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/30/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45961.37635416666','0003072571',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/31/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45961.415300925924','0003072808',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/31/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45961.4996412037','0003072769',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','10/31/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45965.45767361111','0003075736',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/4/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45965.59888888889','0003076088',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/4/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45965.628541666665','0003076512',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/4/2025','No','Buds','0
ea','0
ea','0','15.0135
lb','15.0135
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45965.67358796296','0003076907',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/4/2025','No','Buds','0
ea','0
ea','0','4.0036
lb','4.0036
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45966.42493055556','0003077443',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','11/7/2025','No','Buds','0
ea','0
ea','0','0.1257
lb','0.1266
lb','0.75','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0397
lb','0.0954
lb','140.52','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45966.463067129625','0003077590',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/5/2025','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45967.42817129629','0003079208',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/6/2025','No','Buds','0
ea','0
ea','0','6.1112
lb','6.1112
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45967.523460648146','0003079508',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/6/2025','No','Buds','0
ea','0
ea','0','6.0054
lb','6.0054
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45967.6596412037','0003079930',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/6/2025','No','Buds','0
ea','0
ea','0','3.7038
lb','3.7038
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45967.661828703705','0003079795',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/6/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45968.552037037036','0003080805',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/7/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45971.44440972222','0003082304',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/10/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45971.47289351852','0003082448',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/10/2025','No','Buds','0
ea','0
ea','0','60.0539
lb','60.0539
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45971.47692129629','0003082457',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/10/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45972.55855324074','0003083715',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','11/12/2025','No','Buds','0
ea','0
ea','0','0.1323
lb','0.137
lb','3.59','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45973.36574074074','0003084518',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/12/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45973.38304398148','0003084536',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/12/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45973.45804398148','0003084853',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/12/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45973.55819444444','0003085329',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/12/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45974.44850694444','0003086336',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/13/2025','No','Fresh Frozen Flower','0
ea','0
ea','0','68.48
lb','68.48
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45974.45878472222','0003086420',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/17/2025','No','Buds','0
ea','0
ea','0','45.0404
lb','45.0404
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45974.58847222222','0003086753',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/13/2025','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45975.40590277778','0003087482',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/14/2025','No','Buds','0
ea','0
ea','0','0.0661
lb','0.0661
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45978.37628472222','0003089149',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/17/2025','No','Buds','0
ea','0
ea','0','15.0003
lb','15.0003
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45978.38998842592','0003089372',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/17/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45978.401550925926','0003089163',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/17/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45978.433483796296','0003089520',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/17/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45978.549421296295','0003090023',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/17/2025','No','Buds','0
ea','0
ea','0','10.009
lb','10.009
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45978.55540509259','0003089692',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/17/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45979.38640046296','0003090685',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/18/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45979.418287037035','0003091081',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','11/21/2025','No','Buds','0
ea','0
ea','0','0.4431
lb','0.4359
lb','1.63','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0463
lb','0.1163
lb','151.18','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45979.46380787037','0003091331',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/18/2025','No','Buds','0
ea','0
ea','0','3.7038
lb','3.7038
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45979.50724537037','0003091435',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/18/2025','No','Buds','0
ea','0
ea','0','2.963
lb','2.963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45979.6330787037','0003092125',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/18/2025','No','Buds','0
ea','0
ea','0','4.2593
lb','4.2593
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45980.314733796295','0003092409',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/19/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45980.47511574074','0003092889',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/19/2025','No','Buds','0
ea','0
ea','0','2.4074
lb','2.4074
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45980.48956018518','0003092923',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/19/2025','No','Buds','0
ea','0
ea','0','2.4074
lb','2.4074
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45980.49711805555','0003093006',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/19/2025','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45980.51086805556','0003093217',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/19/2025','No','Buds','0
ea','0
ea','0','2.5926
lb','2.5926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45980.55490740741','0003093249',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/19/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45980.589594907404','0003093394',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/19/2025','No','Buds','0
ea','0
ea','0','2.5926
lb','2.5926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45981.415810185186','0003094528',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/20/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45981.43021990741','0003094715',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/20/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45981.43586805555','0003094719',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/20/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45981.47388888889','0003094767',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/20/2025','No','Buds','0
ea','0
ea','0','3.7038
lb','3.7038
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45981.48574074074','0003095102',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/20/2025','No','Buds','0
ea','0
ea','0','5.6901
lb','5.6901
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45981.486874999995','0003095104',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/20/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45981.50326388889','0003095302',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/20/2025','No','Buds','0
ea','0
ea','0','4.4445
lb','4.4445
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45981.54292824074','0003095450',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/20/2025','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45981.58635416666','0003095493',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/20/2025','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45981.594629629624','0003095513',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/20/2025','No','Buds','0
ea','0
ea','0','2.5022
lb','2.5022
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45981.60347222222','0003095609',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/20/2025','No','Buds','0
ea','0
ea','0','5.0045
lb','5.0045
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45981.61535879629','0003095618',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/20/2025','No','Buds','0
ea','0
ea','0','3.5031
lb','3.5031
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45981.658379629625','0003095665',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/20/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45982.33427083333','0003096041',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/21/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45982.43131944444','0003096542',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/21/2025','No','Buds','0
ea','0
ea','0','44.9611
lb','44.9611
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45982.45648148148','0003096671',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/21/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45982.5044212963','0003096745',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/21/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45982.94657407407','0003097461','1360',null,'RMD1245-C','BeWell Organic Medicine Inc.','Medical Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','11/25/2025','No','Buds','0
ea','0
ea','0','39.0946
lb','39.0946
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45984.596770833334','0003097934',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/23/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45985.40159722222','0003098419',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/24/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45985.41988425926','0003098535',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/24/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45985.439988425926','0003098451',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/24/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45986.39653935185','0003100302',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/25/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45986.50189814815','0003100801',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/25/2025','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45987.36313657407','0003101703',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/26/2025','No','Fresh Frozen Flower','0
ea','0
ea','0','216.0508
lb','216.0508
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45989.3481712963','0003102714',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/28/2025','No','Buds','0
ea','0
ea','0','65.0584
lb','65.0584
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45989.42126157407','0003102846',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','12/1/2025','No','Buds','0
ea','0
ea','0','0.3505
lb','0.3499
lb','0.19','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45989.43645833333','0003102955',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/28/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45989.4440625','0003102753',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/28/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45989.446967592594','0003102755',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/28/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45989.5165162037','0003102889',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','11/28/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45989.51946759259','0003102782',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','11/28/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45989.52055555555','0003102995',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','11/28/2025','No','Buds','0
ea','0
ea','0','5.1853
lb','5.1853
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45992.416180555556','0003103995',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281507','Bud''s Goods & Service MA Corp.','Marijuana Product Manufacturer','Unaffiliated Transfer','12/1/2025','No','Buds','0
ea','0
ea','0','39.0946
lb','39.0946
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45993.5525','0003105498',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/2/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45995.39204861111','0003107767',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/4/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45996.48821759259','0003109417',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/5/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45996.498252314814','0003109345',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/5/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45999.286828703705','0003110415',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/8/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45999.37428240741','0003110459',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','12/8/2025','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45999.375555555554','0003110654',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','12/8/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45999.43736111111','0003110719',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/8/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'45999.51626157407','0003111009',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/8/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46000.333611111106','0003111745',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','12/9/2025','No','Buds','0
ea','0
ea','0','0.1587
lb','0.162
lb','2.05','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46000.35546296296','0003111817',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/9/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46000.389398148145','0003111840',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/9/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46000.39256944444','0003112103',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/9/2025','No','Buds','0
ea','0
ea','0','15.0135
lb','15.0135
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46000.49664351852','0003112275',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/9/2025','No','Buds','0
ea','0
ea','0','6.2964
lb','6.2964
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46000.58813657407','0003112483',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/9/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46001.33329861111','0003112977',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','12/11/2025','No','Buds','0
ea','0
ea','0','0.2381
lb','0.2448
lb','2.83','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46001.37275462963','0003113171',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','12/10/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46001.374398148146','0003113086',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/10/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46001.37731481481','0003113226',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','12/10/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46001.37826388889','0003113177',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/10/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46001.421759259254','0003113272',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/10/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46001.61525462963','0003114160',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','12/10/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46001.61974537037','0003113886',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/10/2025','No','Buds','0
ea','0
ea','0','5.5556
lb','5.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46001.6646875','0003114193',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','12/10/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46001.66548611111','0003114323',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/10/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46002.37153935185','0003114817',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/11/2025','No','Buds','0
ea','0
ea','0','2.7778
lb','2.7778
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46002.4242824074','0003114657',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/11/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46002.498090277775','0003114983',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/11/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46002.50643518518','0003115061',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/11/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46006.47634259259','0003118527',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/15/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46006.63543981481','0003118947',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','12/15/2025','No','Buds','0
ea','0
ea','0','5.926
lb','5.926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46007.24797453704','0003119403',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/16/2025','No','Buds','0
ea','0
ea','0','14.987
lb','14.987
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46007.253958333335','0003119404',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/16/2025','No','Buds','0
ea','0
ea','0','14.987
lb','14.987
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46007.293912037036','0003119409',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','12/17/2025','No','Buds','0
ea','0
ea','0','0.1587
lb','0.1537
lb','3.17','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0265
lb','0.0622
lb','135','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46007.33','0003119629',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/16/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46007.33497685185','0003119635',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/16/2025','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46007.34028935185','0003119533',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/16/2025','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46007.39446759259','0003119580',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','12/16/2025','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46007.530694444446','0003120265',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/16/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46007.584918981476','0003120420',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/16/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46007.59527777778','0003120510',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/16/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46008.379340277774','0003122171',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/17/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46008.41348379629','0003122532',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/17/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46008.42203703704','0003122631',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/17/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46008.424166666664','0003122547',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/17/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46008.48918981481','0003122834',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/17/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46008.521782407406','0003122767',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/17/2025','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46008.5883449074','0003123218',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/17/2025','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46008.60440972222','0003123329',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/17/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46008.614490740736','0003123420',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/17/2025','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46009.27452546296','0003124104',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/18/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46009.27732638889','0003123908',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/18/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46009.297060185185','0003123717',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/18/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46009.30608796296','0003124113',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer',null,'Yes','Buds','0
ea','0
ea','0','0.0529
lb','0
lb','100','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46009.36991898148','0003123825',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/18/2025','No','Buds','0
ea','0
ea','0','14.987
lb','14.987
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46009.387407407405','0003123834',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/18/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46009.44782407407','0003123882',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/18/2025','No','Buds','0
ea','0
ea','0','3.1173
lb','3.1173
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46009.52719907407','0003124338',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/18/2025','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46009.54290509259','0003124346',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/18/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46009.55384259259','0003124534',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/18/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46010.2658912037','0003125037',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/19/2025','No','Buds','0
ea','0
ea','0','5.926
lb','5.926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46010.30583333333','0003124948',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/19/2025','No','Buds','0
ea','0
ea','0','5.7408
lb','5.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46010.334826388884','0003124792',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','12/22/2025','No','Buds','0
ea','0
ea','0','0.1587
lb','0.166
lb','4.57','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46010.34217592592','0003125224',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/19/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46010.37899305555','0003125409',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/19/2025','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46010.38935185185','0003125263',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/19/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46010.45931712963','0003125385',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/19/2025','No','Buds','0
ea','0
ea','0','44.9611
lb','44.9611
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46013.391018518516','0003127648',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/22/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46013.42836805555','0003127664',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/22/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46013.46528935185','0003128017',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/22/2025','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46013.613599537035','0003128334',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/22/2025','No','Buds','0
ea','0
ea','0','0.5633
lb','0.5633
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46013.63222222222','0003128509',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/22/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46013.6474537037','0003128460',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/22/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46014.35134259259','0003128746',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/23/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46014.40070601852','0003128882',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/23/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46014.43746527778','0003129512',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/23/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46014.439247685186','0003128994',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/23/2025','No','Buds','0
ea','0
ea','0','90.0809
lb','90.0809
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','210.03
lb','210.03
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46014.594456018516','0003129475','728',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/23/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46020.535729166666','0003133430',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/29/2025','No','Buds','0
ea','0
ea','0','4.0036
lb','4.0036
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46020.545960648145','0003133615',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/29/2025','No','Buds','0
ea','0
ea','0','3.5031
lb','3.5031
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46020.56518518518','0003133364',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/29/2025','No','Buds','0
ea','0
ea','0','2.5022
lb','2.5022
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46020.56707175926','0003133445',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','12/29/2025','No','Buds','0
ea','0
ea','0','0.5004
lb','0.5004
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46020.572280092594','0003133556',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/29/2025','No','Buds','0
ea','0
ea','0','0.5004
lb','0.5004
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46020.57765046296','0003133568',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','12/29/2025','No','Buds','0
ea','0
ea','0','1.5013
lb','1.5013
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46020.57861111111','0003133374',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/29/2025','No','Buds','0
ea','0
ea','0','1.5013
lb','1.5013
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46021.34637731481','0003134519',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','12/30/2025','No','Buds','0
ea','0
ea','0','4.0036
lb','4.0036
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46021.37672453703','0003134446',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/30/2025','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46021.384201388886','0003134380',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/30/2025','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46021.59222222222','0003134865',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','12/30/2025','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46024.34741898148','0003137014',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','1/2/2026','No','Fresh Frozen Flower','0
ea','0
ea','0','0.0198
lb','0.0558
lb','181.06','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46024.46158564815','0003136945',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/2/2026','No','Buds','0
ea','0
ea','0','14.987
lb','14.987
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46027.539085648146','0003139236',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/5/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46027.56555555556','0003138962',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/5/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46027.641597222224','0003139502',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/5/2026','No','Buds','0
ea','0
ea','0','2.4383
lb','2.4383
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46028.39618055555','0003140303',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','1/7/2026','No','Buds','0
ea','0
ea','0','0.2646
lb','0.2728
lb','3.11','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Immature Plants','2
ea','2
ea','0','0
lb','0
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46028.457407407404','0003140340',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/6/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46028.469675925924','0003140199',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/6/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46028.56270833333','0003140562',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/6/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46028.63628472222','0003140768',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/6/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46029.36163194444','0003141359',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/7/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46029.529548611106','0003141926',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/7/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46029.57708333333','0003142339',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/7/2026','No','Fresh Frozen Flower','0
ea','0
ea','0','227.2768
lb','227.2768
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46029.59415509259','0003142171',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/7/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46029.61230324074','0003142472',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/7/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46030.61288194444','0003143827',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/8/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46031.46747685185','0003144832',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/9/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46031.485509259255','0003144666',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/9/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46031.50722222222','0003144771',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/9/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46034.31960648148','0003146222',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','1/12/2026','No','Immature Plants','2
ea','2
ea','0','0
lb','0
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46034.35114583333','0003146342',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/12/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46034.38355324074','0003146278',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/12/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46034.436018518514','0003146634',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/12/2026','No','Buds','0
ea','0
ea','0','4.2593
lb','4.2593
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46034.4562037037','0003146556',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/12/2026','No','Buds','0
ea','0
ea','0','4.2593
lb','4.2593
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46034.470196759255','0003146725',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/12/2026','No','Buds','0
ea','0
ea','0','2.7778
lb','2.7778
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46034.532372685186','0003147007',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/12/2026','No','Buds','0
ea','0
ea','0','3.2254
lb','3.2254
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46034.540196759255','0003147016',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/12/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46035.369317129625','0003147577',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','1/15/2026','No','Buds','0
ea','0
ea','0','0.2646
lb','0.2627
lb','0.71','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0265
lb','0.0809
lb','205.98','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46035.464594907404','0003148109',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/13/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46035.49642361111','0003148072',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/13/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46035.53359953703','0003148244',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/13/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46036.70961805555','0003150191',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/14/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46036.734571759254','0003150374',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/14/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46037.32105324074','0003150623',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/15/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46037.340057870366','0003150923',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/15/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46037.36173611111','0003150657',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/15/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46037.49439814815','0003151298',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/15/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46038.4365625','0003152627',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/16/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46041.288194444445','0003154102',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','1/19/2026','No','Buds','0
ea','0
ea','0','0.2116
lb','0.225
lb','6.3','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46041.39579861111','0003154050',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/19/2026','No','Buds','0
ea','0
ea','0','15.0135
lb','15.0135
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','375.3546
lb','375.3546
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46041.41087962963','0003154267',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/19/2026','No','Buds','0
ea','0
ea','0','5.0045
lb','5.0045
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46041.43314814815','0003154287',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/19/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46041.63815972222','0003154727',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/19/2026','No','Buds','0
ea','0
ea','0','0.0386
lb','0.0386
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46042.44224537037','0003155447',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','1/21/2026','No','Buds','0
ea','0
ea','0','0.1058
lb','0.117
lb','10.56','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46042.48957175926','0003155707',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/20/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46042.57256944444','0003156038',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/20/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46042.59342592592','0003155965',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/20/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46042.602743055555','0003155972',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/20/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46042.63228009259','0003156219',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/20/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46043.358888888884','0003156732',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/21/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46043.39420138889','0003156565',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/21/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46044.29565972222','0003157907',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','1/22/2026','No','Buds','0
ea','0
ea','0','0.2381
lb','0.252
lb','5.84','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46044.33251157407','0003157858',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/22/2026','No','Buds','0
ea','0
ea','0','5.0045
lb','5.0045
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46044.41806712963','0003158233',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/22/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46044.497465277775','0003158496',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/22/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46044.59196759259','0003158588',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/22/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46045.37071759259','0003159516',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/23/2026','No','Buds','0
ea','0
ea','0','0.0154
lb','0.0154
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46045.51861111111','0003159868',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/23/2026','No','Buds','0
ea','0
ea','0','44.9611
lb','44.9611
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46050.43440972222','0003163422',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/28/2026','No','Buds','0
ea','0
ea','0','5.926
lb','5.926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46050.48931712963','0003163465',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/28/2026','No','Buds','0
ea','0
ea','0','6.852
lb','6.852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46050.505960648145','0003163807',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/28/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46050.53196759259','0003163917',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/28/2026','No','Buds','0
ea','0
ea','0','6.1112
lb','6.1112
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46050.54722222222','0003163687',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/28/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46051.384050925924','0003165088',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/29/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46051.395578703705','0003165099',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/29/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46051.41369212963','0003165286',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/29/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46051.4749537037','0003165559',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/29/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46051.560162037036','0003165863',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/29/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46051.58189814815','0003166058',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/29/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46051.61552083333','0003166189',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/29/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46051.685486111106','0003166338',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/29/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46052.411412037036','0003166885',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','1/30/2026','No','Fresh Frozen Flower','0
ea','0
ea','0','0.0132
lb','0.0338
lb','155.43','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46052.411724537036','0003166782',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','1/30/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46055.372569444444','0003168466',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/2/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46055.380636574075','0003168378',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/2/2026','No','Buds','0
ea','0
ea','0','74.9351
lb','74.9351
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46055.45756944444','0003168642',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/2/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46056.43696759259','0003169798',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','2/5/2026','No','Buds','0
ea','0
ea','0','0.1587
lb','0.1644
lb','3.54','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46056.553668981476','0003170409',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/3/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46056.589895833335','0003170454',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/3/2026','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46059.34475694444','0003174425',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/6/2026','No','Buds','0
ea','0
ea','0','10.009
lb','10.009
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','96.2406
lb','96.2406
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46062.35806712963','0003176055',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/9/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46062.37541666666','0003176251',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/9/2026','No','Buds','0
ea','0
ea','0','4.8149
lb','4.8149
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46062.48168981481','0003176353',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/9/2026','No','Buds','0
ea','0
ea','0','2.963
lb','2.963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46063.30670138889','0003177191',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/10/2026','No','Buds','0
ea','0
ea','0','75.0409
lb','75.0409
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46063.509363425925','0003177774',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/10/2026','No','Buds','0
ea','0
ea','0','5.0045
lb','5.0045
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46063.56997685185','0003178067',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/10/2026','No','Buds','0
ea','0
ea','0','60.0448
lb','60.0448
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46063.607048611106','0003178141',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','2/11/2026','No','Buds','0
ea','0
ea','0','0.0661
lb','0.066
lb','0.27','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46063.63439814815','0003178316',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/10/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46064.562696759254','0003179502',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/11/2026','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46064.59039351852','0003179519',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/11/2026','No','Buds','0
ea','0
ea','0','3.5186
lb','3.5186
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46064.59337962963','0003179624',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/11/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46065.37375','0003180266',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/12/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46065.4853125','0003180807',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/12/2026','No','Buds','0
ea','0
ea','0','4.8149
lb','4.8149
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46066.49513888889','0003182415',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/13/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46066.60791666667','0003182486',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/13/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46069.40859953703','0003183464',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/16/2026','No','Buds','0
ea','0
ea','0','3.3334
lb','3.3334
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46069.425891203704','0003183481',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/16/2026','No','Buds','0
ea','0
ea','0','5.0001
lb','5.0001
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46069.46116898148','0003183600',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/16/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46070.32355324074','0003184632',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','2/18/2026','No','Buds','0
ea','0
ea','0','0.2381
lb','0.2486
lb','4.43','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0132
lb','0.0269
lb','103','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46070.57166666666','0003185452',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/17/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46071.34415509259','0003186044',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/18/2026','No','Buds','0
ea','0
ea','0','30.027
lb','30.027
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46071.4065162037','0003186414',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/18/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46071.45165509259','0003186468',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/18/2026','No','Buds','0
ea','0
ea','0','2.7778
lb','2.7778
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46071.463124999995','0003186556',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/18/2026','No','Buds','0
ea','0
ea','0','2.7778
lb','2.7778
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46071.47719907407','0003186571',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/18/2026','No','Buds','0
ea','0
ea','0','2.5926
lb','2.5926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46071.48884259259','0003186702',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/18/2026','No','Buds','0
ea','0
ea','0','2.4074
lb','2.4074
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46071.563310185185','0003186848',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/18/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46071.64270833333','0003187307',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/18/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46072.42288194444','0003187899',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/19/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46072.424479166664','0003188029',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','2/19/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46072.606840277775','0003188640',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/19/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46073.60104166666','0003189855',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/20/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46078.35377314815','0003192840',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/25/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46078.392384259256','0003192964',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/25/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46078.52180555555','0003193457',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/25/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46078.669710648144','0003194127',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/25/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46079.283229166664','0003194301',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/26/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46079.33917824074','0003194335',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/26/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46079.39096064815','0003194458',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/26/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46079.68981481481','0003195447',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/26/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46080.35759259259','0003195917',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/27/2026','No','Buds','0
ea','0
ea','0','2.4074
lb','2.4074
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46080.38788194444','0003195939',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/27/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46080.54487268518','0003196407',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','2/27/2026','No','Buds','0
ea','0
ea','0','30.027
lb','30.027
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','106.6464
lb','106.6464
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46083.37594907407','0003197822',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/2/2026','No','Buds','0
ea','0
ea','0','0.0309
lb','0.0309
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46084.358831018515','0003198944',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/3/2026','No','Buds','0
ea','0
ea','0','15.0135
lb','15.0135
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46084.428831018515','0003199361',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','3/5/2026','No','Buds','0
ea','0
ea','0','0.2381
lb','0.2445
lb','2.68','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46084.47755787037','0003199608',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/3/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46085.36337962963','0003200481',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/4/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46085.4284375','0003200679',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/4/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46085.52920138889','0003201307',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/4/2026','No','Buds','0
ea','0
ea','0','4.4269
lb','4.4269
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46086.55626157407','0003202561',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/5/2026','No','Buds','0
ea','0
ea','0','0.0231
lb','0.0231
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46086.6190162037','0003203015',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/5/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46090.397372685184','0003205182',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/9/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46090.42454861111','0003205413',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/9/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46090.44949074074','0003205343',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/9/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46090.4590625','0003205355',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/9/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46090.60922453704','0003206009',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/9/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46091.3009375','0003206247',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/10/2026','No','Buds','0
ea','0
ea','0','120.1078
lb','120.1078
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46091.31601851852','0003206315',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','3/11/2026','No','Buds','0
ea','0
ea','0','0.291
lb','0.3029
lb','4.1','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46091.39197916666','0003206537',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/10/2026','No','Buds','0
ea','0
ea','0','4.4445
lb','4.4445
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46091.535682870366','0003207064',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/10/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46091.610925925925','0003207411',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/10/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46092.427141203705','0003208227',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/11/2026','No','Buds','0
ea','0
ea','0','6.852
lb','6.852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46092.54696759259','0003208829',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/11/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46092.56513888889','0003208936',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/11/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46093.47300925926','0003210023',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/12/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46093.540185185186','0003210072',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/12/2026','No','Buds','0
ea','0
ea','0','2.6081
lb','2.6081
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46093.5495949074','0003210228',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/12/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46093.56196759259','0003210087',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/12/2026','No','Buds','0
ea','0
ea','0','1.659
lb','1.659
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46097.37598379629','0003212767',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/16/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46097.40708333333','0003212893',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/16/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46097.42892361111','0003212915',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/16/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46097.57060185185','0003213611',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/16/2026','No','Buds','0
ea','0
ea','0','3.889
lb','3.889
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46097.58179398148','0003213534',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/16/2026','No','Buds','0
ea','0
ea','0','3.889
lb','3.889
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.38847222222','0003214309',null,null,'MR284920','FFD Enterprises MA, Inc.','Marijuana Retailer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer',null,'Yes','Concentrate','0
ea','0
ea','0','0.0243
lb','0
lb','100','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.39387731481','0003214311',null,null,'MC282761','Coastal Healing','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','3/20/2026','No','Buds','0
ea','0
ea','0','13.6378
lb','13.6378
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim','0
ea','0
ea','0','23.4255
lb','23.4255
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','54.5973
lb','54.5973
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.394641203704','0003214313',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2026','No','Buds','0
ea','0
ea','0','6.6668
lb','6.6668
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.39556712963','0003214409',null,null,'MR284920','FFD Enterprises MA, Inc.','Marijuana Retailer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','3/20/2026','No','Concentrate','0
ea','0
ea','0','0.022
lb','0.022
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.44672453703','0003214539',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.47204861111','0003214729',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2026','No','Buds','0
ea','0
ea','0','0.0309
lb','0.0309
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.4765162037','0003214479',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2026','No','Buds','0
ea','0
ea','0','75.0674
lb','75.0674
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.47802083333','0003214484',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','3/17/2026','No','Buds','0
ea','0
ea','0','0.0231
lb','0.0231
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.48070601852','0003214736',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2026','No','Buds','0
ea','0
ea','0','0.0231
lb','0.0231
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.57643518518','0003214851',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2026','No','Buds','0
ea','0
ea','0','2.9553
lb','2.9553
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.604791666665','0003214974',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2026','No','Buds','0
ea','0
ea','0','3.1482
lb','3.1482
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.645219907405','0003215207',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.663935185185','0003215121',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.68293981481','0003215141',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2026','No','Buds','0
ea','0
ea','0','0.0926
lb','0.0926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46098.698171296295','0003215149',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/17/2026','No','Buds','0
ea','0
ea','0','0.0849
lb','0.0849
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46099.38859953704','0003215806',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/18/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46099.394895833335','0003215781',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','3/18/2026','No','Buds','0
ea','0
ea','0','6.852
lb','6.852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46099.40327546296','0003215793',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/18/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46099.42471064815','0003216018',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/18/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46099.43239583333','0003215845',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/18/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46099.45177083333','0003216106',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Unaffiliated Transfer','3/18/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46099.48643518519','0003216080',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/18/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46099.49456018519','0003216094',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/18/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46099.49616898148','0003216097',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/18/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46099.52037037037','0003216231',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/18/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46100.326944444445','0003217123',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','3/20/2026','No','Buds','0
ea','0
ea','0','0.291
lb','0.2971
lb','2.08','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46100.33571759259','0003217041',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','3/19/2026','No','Buds','0
ea','0
ea','0','21.6818
lb','21.6818
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46100.43373842593','0003217199',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/19/2026','No','Buds','0
ea','0
ea','0','4.4214
lb','4.4214
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46100.61476851851','0003218215',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/19/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46101.402916666666','0003218725',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/20/2026','No','Concentrate','0
ea','0
ea','0','0.022
lb','0.022
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46101.501134259255','0003218874',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/20/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46101.503182870365','0003219014',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/20/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46101.5643287037','0003219167',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/20/2026','No','Buds','0
ea','0
ea','0','2.963
lb','2.963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46104.42173611111','0003220425',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/23/2026','No','Buds','0
ea','0
ea','0','6.852
lb','6.852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46104.49012731481','0003220500',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/23/2026','No','Buds','0
ea','0
ea','0','2.7778
lb','2.7778
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46104.51222222222','0003220712',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/23/2026','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46105.35729166667','0003221522',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/24/2026','No','Buds','0
ea','0
ea','0','3.3334
lb','3.3334
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46105.40042824074','0003221724',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/24/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46105.56936342592','0003222187',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/24/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46105.58033564815','0003222326',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/24/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46105.60104166666','0003222244',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/24/2026','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46105.672071759254','0003222708',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/24/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46105.690729166665','0003222618',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/24/2026','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46106.30504629629','0003223110',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','3/25/2026','No','Fresh Frozen Flower','0
ea','0
ea','0','0.0066
lb','0.0173
lb','161.53','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46106.4109837963','0003223083',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/25/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46106.47012731481','0003223388',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/25/2026','No','Buds','0
ea','0
ea','0','2.5926
lb','2.5926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46106.503749999996','0003223587',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/25/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46106.55927083333','0003224114',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/25/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46106.61083333333','0003224173',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/25/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46106.70350694444','0003224348',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/25/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46107.33840277778','0003224589',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/26/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46107.355902777774','0003224710',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/26/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46107.38071759259','0003224826',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/26/2026','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46107.47037037037','0003225121',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/26/2026','No','Buds','0
ea','0
ea','0','135.0155
lb','135.0155
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46108.37646990741','0003226155',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/27/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46108.591203703705','0003227109',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/27/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46111.38366898148','0003228456',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/30/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46111.42378472222','0003228656',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/30/2026','No','Buds','0
ea','0
ea','0','15.0135
lb','15.0135
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','65.8455
lb','65.8455
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46111.57491898148','0003229233',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/30/2026','No','Buds','0
ea','0
ea','0','3.7038
lb','3.7038
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46111.65320601852','0003229458',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/30/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46112.37721064815','0003229940',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/31/2026','No','Buds','0
ea','0
ea','0','3.3334
lb','3.3334
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46112.41643518519','0003229974',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/31/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46112.416874999995','0003230137',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','4/1/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1878
lb','1.43','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46112.45238425926','0003230343',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/31/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46112.47927083333','0003230379',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/31/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46112.639826388884','0003230906',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','3/31/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46113.384560185186','0003231353',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/1/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46113.56222222222','0003231975',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/1/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46114.550995370366','0003233523',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/2/2026','No','Buds','0
ea','0
ea','0','0.0926
lb','0.0926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46114.57872685185','0003233620',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/2/2026','No','Buds','0
ea','0
ea','0','10.0002
lb','10.0002
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46115.4296875','0003234246',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','4/3/2026','No','Buds','0
ea','0
ea','0','0.0198
lb','0.0243
lb','22.68','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46118.3862037037','0003235488',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/6/2026','No','Buds','0
ea','0
ea','0','5.3705
lb','5.3705
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46118.41300925926','0003235914',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/6/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46118.42525462963','0003235843',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/6/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46118.49873842592','0003236107',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/6/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46118.57266203703','0003236440',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/6/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46118.609571759254','0003236541',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/6/2026','No','Buds','0
ea','0
ea','0','0.0463
lb','0.0463
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46118.638090277775','0003236566',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/6/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46118.63915509259','0003236719',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/6/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46119.299259259256','0003236824',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','4/8/2026','No','Buds','0
ea','0
ea','0','0.0794
lb','0.0779
lb','1.83','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0132
lb','0.0213
lb','60.73','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46119.314988425926','0003236835',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/7/2026','No','Buds','0
ea','0
ea','0','15.0135
lb','15.0135
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46120.2971412037','0003238705',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/8/2026','No','Buds','0
ea','0
ea','0','45.1
lb','45.1
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46120.38648148148','0003238652',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/8/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46121.50483796296','0003240951',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/9/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46121.580925925926','0003241123',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/9/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46121.63909722222','0003241275',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/9/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46125.375196759254','0003244061',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/13/2026','No','Buds','0
ea','0
ea','0','4.6297
lb','4.6297
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46125.41199074074','0003243997',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/13/2026','No','Buds','0
ea','0
ea','0','2.963
lb','2.963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46125.558541666665','0003244848',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/13/2026','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46125.58226851852','0003244957',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/13/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46125.59836805555','0003245106',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/13/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46125.61053240741','0003245119',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/13/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46125.61642361111','0003245046',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/13/2026','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46125.71042824074','0003245284',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/13/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.333611111106','0003245732',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2026','No','Buds','0
ea','0
ea','0','30.027
lb','30.027
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.35303240741','0003245740',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','4/15/2026','No','Buds','0
ea','0
ea','0','0.2116
lb','0.2123
lb','0.3','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.36636574074','0003245663',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2026','No','Fresh Frozen Flower','0
ea','0
ea','0','170.9332
lb','170.9332
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.37966435185','0003245684',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2026','No','Buds','0
ea','0
ea','0','45.0404
lb','45.0404
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.4515162037','0003245992',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.46099537037','0003246214',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.483194444445','0003246331',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.54344907407','0003246449',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.578993055555','0003246801',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.599548611106','0003246901',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.620671296296','0003246923',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2026','No','Buds','0
ea','0
ea','0','3.889
lb','3.889
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.65390046296','0003246945',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2026','No','Buds','0
ea','0
ea','0','3.889
lb','3.889
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.67556712963','0003247033',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2026','No','Buds','0
ea','0
ea','0','4.2593
lb','4.2593
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46126.72790509259','0003246985',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/14/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46127.36377314814','0003247242',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/15/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46127.46135416666','0003247711',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/15/2026','No','Buds','0
ea','0
ea','0','4.4445
lb','4.4445
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46127.59484953703','0003247785',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/15/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46127.610034722224','0003247794',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/15/2026','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46127.61443287037','0003247991',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/15/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46127.64555555555','0003247893',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/15/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46127.655590277776','0003248119',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/15/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46127.673854166664','0003248097',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/15/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46128.43388888889','0003248981',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/16/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46128.49653935185','0003249070',null,null,'MC283350','Trifecta Farms Corp','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','4/17/2026','No','Buds','0
ea','0
ea','0','8.3408
lb','8.3408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46129.36545138889','0003250047',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','4/17/2026','No','Buds','0
ea','0
ea','0','4.41
lb','4.41
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46133.310625','0003253214',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/21/2026','No','Buds','0
ea','0
ea','0','30.027
lb','30.027
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46133.350752314815','0003253231',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/21/2026','No','Buds','0
ea','0
ea','0','4.6297
lb','4.6297
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46133.40515046296','0003253318',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/21/2026','No','Buds','0
ea','0
ea','0','2.4074
lb','2.4074
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46133.441782407404','0003253504',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','4/22/2026','No','Buds','0
ea','0
ea','0','0.1323
lb','0.1312
lb','0.82','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46133.470613425925','0003253284',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/21/2026','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46134.37716435185','0003254544',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/22/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46134.53511574074','0003255029',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/22/2026','No','Buds','0
ea','0
ea','0','4.3982
lb','4.3982
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46135.36445601851','0003255709',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/23/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46136.33798611111','0003256464',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','4/24/2026','No','Shake/Trim','0
ea','0
ea','0','25
lb','25
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46136.44033564815','0003256769',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/24/2026','No','Buds','0
ea','0
ea','0','2.7778
lb','2.7778
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46136.64571759259','0003257208',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/24/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46136.67600694444','0003257162',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/24/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46139.36494212963','0003258084',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','4/27/2026','No','Buds','0
ea','0
ea','0','40.4391
lb','40.4391
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim','0
ea','0
ea','0','20
lb','20
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46139.37962962963','0003258094',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/27/2026','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46139.41135416667','0003258416',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/27/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46139.42185185185','0003258349',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/27/2026','No','Buds','0
ea','0
ea','0','6.4816
lb','6.4816
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46139.50116898148','0003258491',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/27/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46139.514710648145','0003258508',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/27/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46140.29579861111','0003259172',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','4/29/2026','No','Buds','0
ea','0
ea','0','0.3571
lb','0.3487
lb','2.37','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0198
lb','0.0299
lb','50.81','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46140.38699074074','0003259524',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/28/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46140.408217592594','0003259620',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/28/2026','No','Buds','0
ea','0
ea','0','2.4074
lb','2.4074
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026');
insert into public.stg_mc_transfers_limited (col,col_2,created,manifest,inv_nbr,col_3,origin_lic,origin_facility,origin_type,dest_lic,destination_facility,dest_type,type,received,voided,item_category,ship_d,rcv_d,var,ship_d_2,rcv_d_2,var_2,source_file,file_sha256,licence,file_window) values
(null,null,'46140.444074074076','0003259398',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/28/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46141.40416666667','0003260877',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/29/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46141.46837962963','0003261151',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/29/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46141.65524305555','0003261688',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/29/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46142.392858796295','0003262070',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/30/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46142.421875','0003262279',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/30/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46142.45045138889','0003262604',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/30/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46142.64560185185','0003263130',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','4/30/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46146.40144675926','0003265192',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/4/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46146.40908564815','0003265274','1157',null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer',null,'Yes','Raw Pre-Rolls','0
ea','0
ea','0','0.4409
lb','0
lb','100','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46146.49049768518','0003265673',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/4/2026','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46146.51155092593','0003265684',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/4/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46146.59643518518','0003265875',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/4/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46147.28969907407','0003266460',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/5/2026','No','Buds','0
ea','0
ea','0','45.0801
lb','45.0801
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','248.0443
lb','248.0443
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46147.39456018518','0003266914',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/5/2026','No','Buds','0
ea','0
ea','0','8.1483
lb','8.1483
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46147.43523148148','0003266780',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Affiliated Transfer','5/7/2026','No','Buds','0
ea','0
ea','0','0.5027
lb','0.495
lb','1.52','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46147.490023148144','0003267149',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/5/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46147.50344907407','0003267246',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/5/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46148.321377314816','0003267775',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/6/2026','No','Buds','0
ea','0
ea','0','119.9756
lb','119.9756
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46148.417337962965','0003268000',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/6/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46148.47134259259','0003268416',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/6/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46148.664722222224','0003268927',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/6/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46148.67637731481','0003268789',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/6/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46148.696701388886','0003269002',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/6/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46149.61568287037','0003269899',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/7/2026','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46149.64635416667','0003270331',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/7/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46150.40384259259','0003270944',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/8/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46150.419699074075','0003270964',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/8/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46153.395787037036','0003273001',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/11/2026','No','Buds','0
ea','0
ea','0','3.3334
lb','3.3334
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46153.41993055555','0003273512',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/11/2026','No','Buds','0
ea','0
ea','0','2.7778
lb','2.7778
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46153.534224537034','0003273762',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/11/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46153.60655092592','0003273937',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/11/2026','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46154.3821875','0003274631',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/12/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46154.41607638889','0003274705',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/12/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46154.51626157407','0003275038',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/12/2026','No','Buds','0
ea','0
ea','0','1.713
lb','1.713
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46154.632256944446','0003275268',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/12/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46154.63875','0003275508',null,null,'RMD1045-C','Nature Medicines, Inc','Medical Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','5/13/2026','No','Buds','0
ea','0
ea','0','4.0036
lb','4.0036
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46155.31708333333','0003275922',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','5/13/2026','No','Fresh Frozen Flower','0
ea','0
ea','0','0.0198
lb','0.0527
lb','165.54','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46155.44559027778','0003276347',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/13/2026','No','Buds','0
ea','0
ea','0','1.9908
lb','1.9908
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46155.47228009259','0003276362',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/13/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46155.55746527777','0003276661',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/13/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46155.58461805555','0003276874',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/13/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46155.61755787037','0003277103',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/13/2026','No','Buds','0
ea','0
ea','0','3.9198
lb','3.9198
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46156.34403935185','0003277465',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/14/2026','No','Buds','0
ea','0
ea','0','285.2561
lb','285.2561
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46156.34675925926','0003277259',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','5/14/2026','No','Buds','0
ea','0
ea','0','27.8099
lb','27.8099
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46156.46194444444','0003277757',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/14/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46156.50407407407','0003278009',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/14/2026','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46156.537361111106','0003277891',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/14/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46157.56296296296','0003279410',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/15/2026','No','Buds','0
ea','0
ea','0','0.9954
lb','0.9954
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46157.63769675926','0003279373',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/15/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46160.335810185185','0003280632',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/18/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46160.34202546296','0003280423',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/18/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46160.390625','0003280451',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/18/2026','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46160.40219907407','0003280685',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/18/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46160.413634259254','0003280488',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/18/2026','No','Fresh Frozen Flower','0
ea','0
ea','0','218.5024
lb','218.5024
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46160.465960648144','0003280836',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/18/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46160.46730324074','0003280777',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/18/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46160.5937037037','0003281337',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/18/2026','No','Buds','0
ea','0
ea','0','0.0463
lb','0.0463
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46161.361666666664','0003281772',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/19/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46161.37952546296','0003281691',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/19/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46161.45429398148','0003282158',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/19/2026','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46161.583611111106','0003282392',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/19/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46162.28681712963','0003282929',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','5/20/2026','No','Buds','0
ea','0
ea','0','0.1389
lb','0.1238
lb','10.86','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0066
lb','0.0131
lb','98.27','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46162.3440162037','0003283170',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','6/3/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1833
lb','1.02','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46162.401296296295','0003283518',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/20/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46162.4515162037','0003283618',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/20/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46162.57717592592','0003284035',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/20/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46163.41099537037','0003284841',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/21/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46163.55604166666','0003285244',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/21/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46164.317777777775','0003286419',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','5/22/2026','No','Buds','0
ea','0
ea','0','42.6418
lb','42.6418
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46164.319247685184','0003286324',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','5/22/2026','No','Buds','0
ea','0
ea','0','10.3176
lb','10.3176
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','4.288
lb','4.288
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46164.382581018515','0003286287',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/22/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46164.52856481481','0003286746',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/22/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46164.61568287037','0003287129',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/22/2026','No','Buds','0
ea','0
ea','0','5.5556
lb','5.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46168.43116898148','0003288852',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/26/2026','No','Buds','0
ea','0
ea','0','6.2655
lb','6.2655
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46168.44262731481','0003288864',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/26/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46168.486712962964','0003289120',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/26/2026','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46168.54449074074','0003289163',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/26/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46168.61136574074','0003289518',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/26/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46168.63223379629','0003289614',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/26/2026','No','Buds','0
ea','0
ea','0','5.5556
lb','5.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46168.64608796296','0003289627',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/26/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46168.67097222222','0003289644',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/26/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46169.337916666664','0003289880',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','5/27/2026','No','Fresh Frozen Flower','0
ea','0
ea','0','0.0132
lb','0.0134
lb','1.67','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46169.36138888889','0003290057',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','5/27/2026','No','Shake/Trim','0
ea','0
ea','0','62.6377
lb','62.6377
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46169.36332175926','0003290123',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','5/27/2026','No','Shake/Trim (by strain)','0
ea','0
ea','0','125.3703
lb','125.3703
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46169.364710648144','0003289952',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','5/27/2026','No','Shake/Trim (by strain)','0
ea','0
ea','0','74.6992
lb','74.6992
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46170.46398148148','0003292204',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/28/2026','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46171.345243055555','0003293253',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','5/29/2026','No','Buds','0
ea','0
ea','0','0.1323
lb','0.1323
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46171.42424768519','0003293438',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','5/29/2026','No','Buds','0
ea','0
ea','0','5.0045
lb','5.0045
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46174.37645833333','0003295299',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/1/2026','No','Buds','0
ea','0
ea','0','4.2593
lb','4.2593
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46174.40820601852','0003295619',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/1/2026','No','Fresh Frozen Flower','0
ea','0
ea','0','108.2778
lb','108.2778
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46174.47091435185','0003295902',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/1/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46174.53555555555','0003296152',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/1/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46174.57074074074','0003296094',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/1/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46175.41144675926','0003297040',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/2/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46175.53707175926','0003297651',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/2/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46181.61802083333','0003303361',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/8/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46181.641331018516','0003303390',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/8/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46182.30876157407','0003303556',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/9/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46182.386249999996','0003303910',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/9/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46182.45364583333','0003304142',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/9/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46182.455312499995','0003303899',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/9/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46182.460625','0003304303',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/9/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46182.466423611106','0003304156',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/9/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46182.53791666667','0003304526',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/9/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46182.57966435185','0003304606',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/9/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46182.61646990741','0003304600',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/9/2026','No','Buds','0
ea','0
ea','0','3.1482
lb','3.1482
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46182.647465277776','0003304754',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/9/2026','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46183.46041666666','0003305553',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/10/2026','No','Buds','0
ea','0
ea','0','2.963
lb','2.963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46183.47054398148','0003305564',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/10/2026','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46183.61228009259','0003306289',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/10/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46183.61350694444','0003305876',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','6/10/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46183.617118055554','0003306297',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/10/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46183.659953703704','0003306336',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/10/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46183.68329861111','0003306355',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/10/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46184.24234953704','0003306386',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/11/2026','No','Buds','0
ea','0
ea','0','103.7716
lb','103.7716
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46184.3065162037','0003306522',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/11/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46184.444398148145','0003307017',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','6/12/2026','No','Buds','0
ea','0
ea','0','0.3439
lb','0.3373
lb','1.94','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0198
lb','0.0749
lb','277.59','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46184.46234953703','0003307038',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/11/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46184.481469907405','0003307054',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/11/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46184.49471064815','0003307205',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/11/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46184.573287037034','0003307316',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/11/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46185.310023148144','0003307695',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/12/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46185.3355787037','0003307926',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/12/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46188.36572916667','0003309574',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/15/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46188.43619212963','0003309903',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/15/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46188.50747685185','0003309850',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer',null,'Yes','Buds','0
ea','0
ea','0','2.963
lb','0
lb','100','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46188.50903935185','0003309853',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/15/2026','No','Buds','0
ea','0
ea','0','2.963
lb','2.963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46188.6687962963','0003310567',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/15/2026','No','Buds','0
ea','0
ea','0','7.7779
lb','7.7779
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46189.453252314815','0003311349',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/16/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46189.47586805555','0003311089',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','6/17/2026','No','Buds','0
ea','0
ea','0','0.3439
lb','0.3207
lb','6.75','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46189.53871527778','0003311540',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/16/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46189.62715277778','0003311675',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/16/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46190.4496875','0003312426',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/17/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46190.48170138889','0003312460',null,null,'RMD1045-C','Nature Medicines, Inc','Medical Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','6/18/2026','No','Buds','0
ea','0
ea','0','4.0014
lb','4.0014
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46192.451898148145','0003314477',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/19/2026','No','Fresh Frozen Flower','0
ea','0
ea','0','203.07
lb','203.07
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46192.466469907406','0003314725',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/19/2026','No','Buds','0
ea','0
ea','0','120.1519
lb','120.1519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46192.47876157407','0003314487',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','6/19/2026','No','Buds','0
ea','0
ea','0','15.0135
lb','15.0135
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46195.542708333334','0003316349',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/22/2026','No','Buds','0
ea','0
ea','0','5.5556
lb','5.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46195.558229166665','0003316465',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/22/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46195.57672453704','0003316565',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/22/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46196.473240740735','0003317191',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/23/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46196.50153935185','0003317484',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/23/2026','No','Buds','0
ea','0
ea','0','2.7778
lb','2.7778
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46196.542187499996','0003317730',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/23/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46196.6249537037','0003317931',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/23/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46196.65665509259','0003318043',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/23/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46197.32167824074','0003319026',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/24/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46197.3827662037','0003319174',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/24/2026','No','Buds','0
ea','0
ea','0','105.101
lb','105.101
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46197.42030092592','0003319469',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/24/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46197.45768518518','0003319750',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/24/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46197.49711805555','0003319802',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/24/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46197.5877199074','0003319923',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/24/2026','No','Buds','0
ea','0
ea','0','7.4075
lb','7.4075
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46197.59065972222','0003319925',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/24/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46198.51138888889','0003321241',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/25/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46198.62019675926','0003321603',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/25/2026','No','Buds','0
ea','0
ea','0','2.4074
lb','2.4074
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46198.689363425925','0003321651',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/25/2026','No','Buds','0
ea','0
ea','0','2.4074
lb','2.4074
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46199.44548611111','0003322432',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/26/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46199.49925925926','0003322478',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/26/2026','No','Buds','0
ea','0
ea','0','7.5952
lb','7.5952
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46199.54579861111','0003322713',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/26/2026','No','Buds','0
ea','0
ea','0','3.7038
lb','3.7038
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46199.68152777778','0003322899',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/26/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46202.444444444445','0003324654',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','7/1/2026','No','Buds','0
ea','0
ea','0','0.2116
lb','0.2053
lb','2.98','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0198
lb','0.0493
lb','148.54','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46202.49123842592','0003324497',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/29/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46202.596562499995','0003325063',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/29/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46202.68835648148','0003325425',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/29/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46203.29193287037','0003325464',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/30/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46203.385196759256','0003326007',null,null,'MC282690','Mayflower Medicinals, Inc.','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','7/2/2026','No','Buds','0
ea','0
ea','0','25.4943
lb','25.4943
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46203.4737962963','0003326192','632',null,'MC281592','Solar Therapeutics Inc','Marijuana Cultivator','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer','7/2/2026','No','Buds','0
ea','0
ea','0','51.3393
lb','51.3393
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46203.493425925924','0003326312',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','6/30/2026','No','Buds','0
ea','0
ea','0','6.4441
lb','6.4441
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46203.56637731481','0003326452',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/30/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46203.61277777777','0003326807',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','6/30/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46204.37887731481','0003327170',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/1/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46204.39258101852','0003327174',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/1/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46204.451261574075','0003327636',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/1/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46204.46017361111','0003327476',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/1/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46204.48918981481','0003327669',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/1/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46204.50549768518','0003327807',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/1/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46204.60747685185','0003327987',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/1/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46204.63489583333','0003328212',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/1/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46205.31898148148','0003328615',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/2/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46205.33065972222','0003328491',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/2/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46205.3362037037','0003328566',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/2/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46205.34069444444','0003328625',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','7/2/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46205.34159722222','0003328570',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/2/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46205.35386574074','0003328577',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/2/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46205.36577546296','0003328640',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/2/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46205.43587962963','0003328928',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/2/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46205.43881944444','0003328933',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','7/2/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46205.44103009259','0003329028',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/2/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46206.39215277778','0003329487',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/3/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46206.40825231481','0003329581',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/3/2026','No','Buds','0
ea','0
ea','0','8.1483
lb','8.1483
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46209.40787037037','0003331332',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/6/2026','No','Buds','0
ea','0
ea','0','3.3334
lb','3.3334
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46209.46130787037','0003331390',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/6/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46209.47011574074','0003331419',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/6/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46209.53126157407','0003331477',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/6/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46209.588437499995','0003331669',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/6/2026','No','Buds','0
ea','0
ea','0','3.3334
lb','3.3334
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46209.61817129629','0003331934',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/6/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46210.34232638888','0003332146',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/7/2026','No','Fresh Frozen Flower','0
ea','0
ea','0','124.9823
lb','124.9823
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46210.35989583333','0003332335',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/7/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46210.449328703704','0003332612',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/7/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46210.561585648145','0003332959',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/7/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46210.57538194444','0003332880',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/7/2026','No','Buds','0
ea','0
ea','0','1.2963
lb','1.2963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46210.58903935185','0003332999',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/7/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46210.61363425926','0003333128',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/7/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46210.62809027777','0003333143',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/7/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46211.30063657407','0003333081',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','7/8/2026','No','Buds','0
ea','0
ea','0','0.291
lb','0.2809
lb','3.47','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46211.31864583333','0003333702',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','7/8/2026','No','Shake/Trim','0
ea','0
ea','0','25
lb','25
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46211.348391203705','0003333468',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/8/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46211.357407407406','0003333472',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/8/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46211.4615625','0003333981',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/8/2026','No','Buds','0
ea','0
ea','0','8.3335
lb','8.3335
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46211.49657407407','0003334205',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/8/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46211.64841435185','0003334729',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/8/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46212.4243287037','0003335283',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/9/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46212.5237037037','0003335571',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/9/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46212.59167824074','0003336004',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/9/2026','No','Buds','0
ea','0
ea','0','3.7038
lb','3.7038
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46212.60277777778','0003336016',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/9/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46216.42716435185','0003338409',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/13/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46216.45458333333','0003338533',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/13/2026','No','Buds','0
ea','0
ea','0','120.1078
lb','120.1078
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46216.476122685184','0003338804',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','0.0529
lb','0.0517
lb','2.28','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0198
lb','0.0487
lb','145.42','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46217.35631944444','0003339948',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','7/14/2026','No','Buds','0
ea','0
ea','0','1.0009
lb','1.0009
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46217.37415509259','0003340108',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/14/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46217.41878472222','0003340201',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/14/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46217.44510416666','0003340191',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/14/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46217.44850694444','0003340221',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/14/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46217.466053240736','0003340333',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/14/2026','No','Buds','0
ea','0
ea','0','3.7038
lb','3.7038
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46217.480266203704','0003340343',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/14/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46217.50262731481','0003340266',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/14/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46217.59052083333','0003340568',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/14/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46217.59667824074','0003340819',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/14/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46217.60188657407','0003340826',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/14/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46217.61710648148','0003340910',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/14/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46218.307870370365','0003341211',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','120.11
lb','120.11
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46218.35892361111','0003341170',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46218.36671296296','0003341265',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46218.37535879629','0003341333',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46218.39125','0003341286',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46218.41170138889','0003341360',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46218.46848379629','0003341636',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46218.504108796296','0003341782',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46218.53040509259','0003341900',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46218.6005787037','0003342069',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','2.5926
lb','2.5926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46218.60707175926','0003341965',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46218.61324074074','0003342088',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','1.6667
lb','1.6667
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46218.64246527778','0003342268',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/15/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46219.413460648146','0003343028',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/16/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46219.41994212963','0003343127',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/16/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46219.478946759256','0003343183',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/16/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46219.48539351852','0003343185',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/16/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46220.41836805555','0003344426',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/17/2026','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46223.41275462963','0003346005',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/20/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46223.4265625','0003346023',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/20/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46223.47934027777','0003346138',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/20/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46223.514756944445','0003346406',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/20/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46223.64895833333','0003346728',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/20/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46224.35193287037','0003346991',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','7/21/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46224.353854166664','0003347146',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/21/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46224.3821875','0003347326',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','7/22/2026','No','Buds','0
ea','0
ea','0','0.291
lb','0.27
lb','7.23','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Immature Plants','6
ea','6
ea','0','0
lb','0
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46224.38805555555','0003347189',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/21/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46224.394479166665','0003347194',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/21/2026','No','Fresh Frozen Flower','0
ea','0
ea','0','186.9322
lb','186.9322
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46224.444502314815','0003347092',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/21/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46224.44855324074','0003347504',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/21/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46224.51734953703','0003347666',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/21/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46224.6062962963','0003347784',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/21/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46224.64861111111','0003347798',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/21/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46225.32625','0003348181',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','7/22/2026','No','Buds','0
ea','0
ea','0','28.616
lb','28.616
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46225.34881944444','0003348437',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/22/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46225.3993287037','0003348585',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/22/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46225.42612268518','0003348809',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/22/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46225.42994212963','0003348799',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/22/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46225.47650462963','0003348850',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/22/2026','No','Buds','0
ea','0
ea','0','0.7408
lb','0.7408
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46225.48868055555','0003348869',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/22/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46225.496527777774','0003348882',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/22/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46225.50487268518','0003348891',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/22/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46225.51065972222','0003349106',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/22/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46226.410787037035','0003350203',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/23/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46226.4290162037','0003350405',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/23/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46226.437893518516','0003350504',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/23/2026','No','Buds','0
ea','0
ea','0','0.1852
lb','0.1852
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46226.55871527777','0003350792',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/23/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46226.586493055554','0003350913',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/23/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46227.41398148148','0003351384',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/24/2026','No','Buds','0
ea','0
ea','0','2.963
lb','2.963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46231.33421296296','0003354551','1495',null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','RMD1045-C','Nature Medicines, Inc','Medical Marijuana Cultivator','Unaffiliated Transfer','7/28/2026','No','Immature Plants','24
ea','24
ea','0','0
lb','0
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46231.419699074075','0003355017',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/28/2026','No','Buds','0
ea','0
ea','0','1.4815
lb','1.4815
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46231.45454861111','0003355119',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/28/2026','No','Buds','0
ea','0
ea','0','2.5926
lb','2.5926
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46231.46347222222','0003355038',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/28/2026','No','Buds','0
ea','0
ea','0','150.1348
lb','150.1348
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46231.46579861111','0003355128',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/28/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46231.48133101852','0003354894',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','7/29/2026','No','Buds','0
ea','0
ea','0','0.0661
lb','0.0602
lb','9.05','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','0.0132
lb','0.0266
lb','101.28','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46231.65325231481','0003355623',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/28/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46231.67265046296','0003355816',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/28/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46232.36145833333','0003356168',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/29/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46232.469560185185','0003356561',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/29/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46232.52903935185','0003356594',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/29/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46233.47640046296','0003357836',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','7/30/2026','No','Buds','0
ea','0
ea','0','3.1482
lb','3.1482
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46237.42663194444','0003360723',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/3/2026','No','Buds','0
ea','0
ea','0','3.3334
lb','3.3334
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46237.487604166665','0003361225',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/3/2026','No','Buds','0
ea','0
ea','0','0.9259
lb','0.9259
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46237.51484953704','0003361442',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/3/2026','No','Buds','0
ea','0
ea','0','1.8519
lb','1.8519
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46237.6155787037','0003361581',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/3/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46237.62090277777','0003361586',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/3/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46237.63586805556','0003361734',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/3/2026','No','Buds','0
ea','0
ea','0','2.0371
lb','2.0371
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46237.65395833333','0003361802',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/3/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46238.37150462963','0003362021',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/4/2026','No','Buds','0
ea','0
ea','0','2.963
lb','2.963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46238.38403935185','0003362109',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/4/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46238.470497685186','0003362439',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/4/2026','No','Buds','0
ea','0
ea','0','2.963
lb','2.963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46238.480625','0003362358',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/4/2026','No','Buds','0
ea','0
ea','0','30.0666
lb','30.0666
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Fresh Frozen Flower','0
ea','0
ea','0','106.3378
lb','106.3378
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46238.486712962964','0003362366',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/4/2026','No','Buds','0
ea','0
ea','0','2.963
lb','2.963
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46238.523993055554','0003362607',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','IL281359','Green Valley Analytics LLC','Independent Testing Laboratory','Lab Transfer','8/6/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3529
lb','4.73','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46238.587118055555','0003362642',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','8/4/2026','No','Buds','0
ea','0
ea','0','8.7096
lb','8.7096
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim','0
ea','0
ea','0','28.0104
lb','28.0104
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','28.81
lb','28.81
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46238.61356481481','0003362902',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/4/2026','No','Buds','0
ea','0
ea','0','2.2223
lb','2.2223
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46239.335509259254','0003363149','TBD',null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Unaffiliated Transfer',null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','200.8125
lb','0
lb','100','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46239.36864583333','0003363211',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/5/2026','No','Buds','0
ea','0
ea','0','12.778
lb','12.778
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46239.38303240741','0003363193',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/5/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46239.397951388884','0003363410',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/5/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46239.41572916666','0003363448',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/5/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46239.42347222222','0003363335',null,null,'MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','MC281714','Twisted Growers LLC','Marijuana Cultivator','Affiliated Transfer','8/5/2026','No','Buds','0
ea','0
ea','0','5.3799
lb','5.3799
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,'No','Shake/Trim (by strain)','0
ea','0
ea','0','14.9958
lb','14.9958
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46239.54456018518','0003363919',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/5/2026','No','Buds','0
ea','0
ea','0','0.3704
lb','0.3704
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46239.584085648145','0003363949',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/5/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46239.59371527778','0003363887',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/5/2026','No','Buds','0
ea','0
ea','0','0.5556
lb','0.5556
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46239.61295138889','0003364201',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/5/2026','No','Buds','0
ea','0
ea','0','1.1111
lb','1.1111
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,'46240.44342592592','0003364736',null,null,'MC281714','Twisted Growers LLC','Marijuana Cultivator','MP281909','Twisted Growers LLC','Marijuana Product Manufacturer','Affiliated Transfer','8/6/2026','No','Buds','0
ea','0
ea','0','3.7038
lb','3.7038
lb','0','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026'),
(null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,'Totals:','3,998
ea','3,998
ea','0
%','17,396.8151
lb','17,062.3166
lb','1.92
%','Transfers(limited)Report.xls','9aff331f02242614d413b38ead591c0fc0eab52a270c499bd7ac137d8cda84a6','MC281714','From 1/1/2024 To 8/6/2026');
