-- ═══ Owner-set conversion factors. No number is hardcoded in a view. ═══
create table if not exists conversion_factors (
  key text primary key,
  value numeric not null,
  unit text,
  label text not null,
  what_it_means text not null,
  where_it_came_from text not null,
  set_by text,
  updated_at timestamptz not null default now()
);
alter table conversion_factors enable row level security;
drop policy if exists cf_read on conversion_factors;
create policy cf_read on conversion_factors for select to authenticated using (true);
drop policy if exists cf_write on conversion_factors;
create policy cf_write on conversion_factors for all to authenticated
  using (exists (select 1 from app_users u where u.user_id=auth.uid() and u.role in ('owner','executive')))
  with check (exists (select 1 from app_users u where u.user_id=auth.uid() and u.role in ('owner','executive')));

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by) values
('fresh_frozen_wet_to_dry', 4.5, 'ratio',
 'Fresh frozen wet-to-dry-equivalent ratio',
 'How many pounds of fresh frozen material it takes to equal one pound of dried flower. Fresh frozen is packaged at field moisture, so it still contains all its water. Dividing frozen pounds by this number gives the dry-equivalent - the only figure that can honestly be compared against, or added to, dried flower pounds.',
 'Fresh cannabis is 75 to 80 percent water, giving a commercial wet-to-dry ratio of 4:1 to 5:1. 4.5 is the midpoint. CHANGE THIS if your own extraction yields prove a different number - every fresh frozen figure on the platform recalculates from this one row.',
 'default - awaiting Vincent'),
('dry_window_min_days', 10, 'days', 'Shortest acceptable dry time',
 'Cut to first package. Below this, moisture is locked into the flower.',
 'Standard commercial dry window is 10 to 14 days.', 'default'),
('dry_window_max_days', 14, 'days', 'Longest acceptable dry time',
 'Cut to first package. Every day past this burns off saleable weight permanently.',
 'Standard commercial dry window is 10 to 14 days.', 'default'),
('target_cost_per_lb', 1100, 'USD', 'Cost to produce one saleable pound',
 'Period operating cost divided by saleable pounds. Used to value real losses in dollars.',
 'Supplied by the owner. CHANGE THIS as payroll and overheads move.', 'owner'),
('expected_moisture_pct_min', 70, 'percent', 'Lowest normal moisture loss',
 'Percentage of wet weight expected to evaporate from dried flower.',
 'Fresh flower is 75 to 80 percent water; 70 is the low bound allowing for stem weight.', 'default'),
('expected_moisture_pct_max', 82, 'percent', 'Highest normal moisture loss',
 'Percentage of wet weight expected to evaporate from dried flower.',
 'Above this suggests over-drying or a packaged weight recorded low.', 'default')
on conflict (key) do nothing;

-- ═══ Plain-English explainers shown on the pages themselves ═══
create table if not exists page_explainers (
  view_key text primary key,
  headline text not null,
  the_question text not null,
  how_it_works text not null,
  the_arithmetic text not null,
  why_it_matters text not null,
  plain_english text not null,
  watch_out_for text,
  updated_at timestamptz not null default now()
);
alter table page_explainers enable row level security;
drop policy if exists pe_read on page_explainers;
create policy pe_read on page_explainers for select to authenticated using (true);
drop policy if exists pe_write on page_explainers;
create policy pe_write on page_explainers for all to authenticated using (true) with check (true);

insert into page_explainers (view_key, headline, the_question, how_it_works, the_arithmetic, why_it_matters, plain_english, watch_out_for) values
('fresh_frozen_equiv',
 'Fresh frozen is water. It cannot be added to dried flower until it is converted.',
 'How much dried flower is our fresh frozen actually worth?',
 'Fresh frozen is packaged straight off the plant at field moisture and put in the freezer, so almost none of its water has left. Dried flower has lost roughly three quarters of its weight to evaporation. A pound of each is not the same thing. Every fresh frozen pound is divided by the wet-to-dry ratio set in Conversion Factors to give a dry-equivalent pound, and only that dry-equivalent figure is ever compared against or added to dried flower.',
 'dry-equivalent pounds = fresh frozen pounds / wet-to-dry ratio. At the current ratio, 603.9 lb of fresh frozen equals roughly 134 lb dry-equivalent.',
 'Without the conversion, fresh frozen looked like a third of production. Converted, it is closer to a tenth. Every yield, cost-per-pound and inventory figure that added the two together was overstating output.',
 'Weed is mostly water when you cut it. If you freeze it wet, the water is still in the bag. If you dry it, the water leaves and the bag gets much lighter. Ten pounds of frozen wet weed is about the same as two pounds of dried weed. Adding them together as if they were the same thing makes you think you have far more product than you do.',
 'The ratio is an estimate until your own extraction yields prove otherwise. Record real dry-equivalent on each fresh frozen batch and this becomes a measured number rather than a factor.'),
('moisture_accounting',
 'Every pound of wet weight is accounted for. None of it is missing.',
 'We cut 18,476 lb of wet plant but only packaged 5,200 lb. Where did the rest go?',
 'Every pound of wet weight ends up in exactly one of three places: packaged product, recorded waste, or water that evaporated during drying. This page proves the three add back to the wet weight for every harvest, and checks the result against the current-weight field Metrc keeps independently. Any harvest where the two disagree by more than two percent is flagged by name.',
 'wet weight = packaged + recorded waste + evaporated moisture. Across all closed harvests: 13,144.1 lb wet = 4,609.9 packaged + 1,332.7 waste + 7,201.5 moisture. Metrc independently reports 7,201.4 lb - a match to within a tenth of a pound.',
 'Metrc never debits evaporated water from a harvest, so the residual sits there looking like unsold inventory. It is not product and must never be counted as stock, valued, or reported as a loss. Treating it as missing product is how a business convinces itself it has been robbed.',
 'You cut a hundred pounds of wet plant. About seventy-five pounds of that is water, and it dries into the air. You bag up the twenty-odd pounds of actual weed left. Nothing was stolen and nothing was lost - the water was never sellable. This page proves that, harvest by harvest.',
 'A harvest that does not reconcile is a genuine warning: either weights were entered wrong or product left without being recorded. Those are the rows to work.'),
('real_loss',
 'What we actually lost, with the arithmetic shown for every pound.',
 'How much money have we genuinely lost, as opposed to weight that was never sellable?',
 'A loss only counts here if the pound existed as sellable product and can no longer be sold. Evaporated moisture is excluded because it was never product. Routine stem and fan-leaf waste is excluded because it is already inside cost per pound and charging it again double counts. Relative measures - scoring a harvest against the company average - are excluded because they measure variance, not loss.',
 'Failed testing: pounds that passed through packaging and then failed a laboratory test, valued at the cost per pound set in Conversion Factors. Dry-time weight loss: pounds lost by drying beyond the window, measured as the gap between a harvest conversion and the average conversion of harvests that dried inside the window, applied only to harvests that dried too long.',
 'The previous $2,251,040 yield underperformance figure was not a loss. It scored every harvest against the company average conversion, so half the harvests were guaranteed to show a shortfall by definition, and the average it used blended fresh frozen with dried flower. It has been withdrawn.',
 'If you grew it, bagged it, and then could not sell it, that is a loss. If it dried out into the air, that was never yours to sell. If it just did worse than average, that is not a loss either - half of everything is below average by definition. This page only counts the first kind.',
 'Failed testing is the only loss here that is beyond doubt. Dry-time loss is an estimate and is labelled as one.')
on conflict (view_key) do update set
  headline=excluded.headline, the_question=excluded.the_question, how_it_works=excluded.how_it_works,
  the_arithmetic=excluded.the_arithmetic, why_it_matters=excluded.why_it_matters,
  plain_english=excluded.plain_english, watch_out_for=excluded.watch_out_for, updated_at=now();;
