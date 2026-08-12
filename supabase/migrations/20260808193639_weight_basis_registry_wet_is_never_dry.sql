-- ============================================================================
-- WET IS NEVER DRY — made mechanical (owner ruling, 8 Aug 2026)
--
-- THE PROBLEM, from this platform's own history rather than theory. 59 relations
-- carry BOTH money and weight columns and only 9 of them say anywhere which
-- weight basis they mean. A dollars-per-pound figure that does not state which
-- pound is the most dangerous shape in the system: own production reads $950/lb
-- and bought-in $289/lb, and the difference between a wet and a dry denominator
-- is roughly a factor of four. I broke this rule myself this week by reading
-- still_in_room_lb -- a WET residual -- as dry material, overstating open-harvest
-- stock by about 3.8x, hours after quoting rule B4.
--
-- THE APPROACH. Do NOT rename 184 relations' columns today: every consumer would
-- break, and the front end is another lane. Instead DECLARE the basis, enforce the
-- declaration, and let renaming follow as hygiene. The declaration is the control.
--
-- SEEDED FROM EVIDENCE, NOT GUESSWORK. A column literally named wet_lb declares
-- itself; that is reading, not inferring. A column named `pounds` or `quantity`
-- declares nothing and is left UNDECLARED for a human -- filling those in from a
-- hunch is exactly the invention rule A1 forbids.
-- ============================================================================

create table if not exists weight_basis_registry (
  relation      text not null,
  column_name   text not null,
  basis         text not null check (basis in
                  ('wet','dry','fresh_frozen','count','currency_per_wet',
                   'currency_per_dry','not_a_weight')),
  declared_by   text not null default 'seed:column-name-evidence',
  evidence      text,
  declared_on   timestamptz not null default now(),
  primary key (relation, column_name)
);
alter table weight_basis_registry enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid='public.weight_basis_registry'::regclass
                   and polname='wbr_read') then
    create policy wbr_read on weight_basis_registry for select to authenticated using (true);
  end if;
end $$;

comment on table weight_basis_registry is
'Which weight basis every weight-bearing column means. Rule B4: wet and dry are NOT the same quantity and must never be summed, averaged or compared. A column with no row here is UNDECLARED and any figure derived from it is unsafe to quote.';

-- Seed only what the column name itself states. Nothing inferred.
insert into weight_basis_registry (relation, column_name, basis, evidence)
select c.relname, a.attname,
       case
         when a.attname ~ 'fresh_frozen|_ff_|^ff_' then 'fresh_frozen'
         when a.attname ~ 'wet'                    then 'wet'
         when a.attname ~ 'dry'                    then 'dry'
       end,
       'Column name contains its own basis token: ' || a.attname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where c.relkind in ('r','v','m')
  and a.attname ~ '(pounds|_lb|lbs|grams|weight|qty|quantity)'
  and a.attname ~ '(wet|dry|fresh_frozen|_ff_|^ff_)'
on conflict (relation, column_name) do nothing;

-- Every weight-bearing column and whether its basis is known.
create or replace view v_weight_basis_gaps as
select c.relname as relation,
       case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'matview' end as kind,
       a.attname as column_name,
       w.basis,
       (w.basis is null) as undeclared,
       exists (select 1 from pg_attribute m
                where m.attrelid = c.oid and m.attnum > 0 and not m.attisdropped
                  and m.attname ~ '(dollar|revenue|price|cost|margin|amount|cash|value_at)')
         as relation_also_carries_money
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
left join weight_basis_registry w
       on w.relation = c.relname and w.column_name = a.attname
where c.relkind in ('r','v','m')
  and a.attname ~ '(pounds|_lb$|_lbs|lbs_|grams|weight)'
  and a.attname !~ '(weighted|weight_in_parent)';

comment on view v_weight_basis_gaps is
'Rule B4 coverage. undeclared = true means nobody has stated whether that column is wet, dry or fresh frozen. relation_also_carries_money = true makes it worse: a currency figure divided by an undeclared weight is the shape that produced the 3.8x overstatement on 7 Aug 2026.';

-- The dangerous case: one relation mixing bases, where a total could silently add them.
create or replace view v_weight_basis_collisions as
select relation, kind,
       count(distinct basis) as distinct_bases,
       string_agg(distinct basis, ', ' order by basis) as bases_present,
       count(*) filter (where undeclared) as undeclared_columns,
       bool_or(relation_also_carries_money) as carries_money
from v_weight_basis_gaps
group by relation, kind
having count(distinct basis) > 1 or count(*) filter (where undeclared) > 0;

comment on view v_weight_basis_collisions is
'Relations holding more than one weight basis at once, or holding an undeclared weight. These cannot be summed safely without saying which basis the total is in. Reported, never auto-resolved -- picking a basis for the caller is how wet became dry.';;
