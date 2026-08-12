-- 956 open strain discrepancies are 73 distinct name pairs repeated. Nobody was ever
-- going to read 956 rows, which is why they sat untouched since the day they were raised.
--
-- The machine can say which side is a REGISTERED strain - that is data. It cannot say
-- whether "TG Fuji Tart" is a marketing name for Apple Fritter material or a mislabel -
-- that is business practice, and rule A5 forbids inferring it. So this table holds the
-- 73 pairs and waits for a person, and one ruling closes every package behind it.

create table if not exists strain_name_ruling (
  pair_key        text primary key,
  item_name       text not null,
  strain_field    text not null,
  packages        integer not null,
  item_registered boolean not null,
  strain_registered boolean not null,
  machine_verdict text not null,
  ruling          text not null default 'not yet ruled'
                  check (ruling in (
                    'not yet ruled',
                    'item name is a product name - both are correct',
                    'item name is wrong - correct it in Metrc',
                    'strain field is wrong - correct it in Metrc',
                    'genuinely different material - not a discrepancy')),
  ruled_by        text,
  ruled_at        timestamptz,
  note            text,
  -- A ruling is a decision about the legal record. It carries who made it (H1).
  constraint ruling_needs_its_author check (
    ruling = 'not yet ruled' or (ruled_by is not null and ruled_at is not null)
  ),
  -- "Genuinely different material" contradicts the machine on both sides. That is
  -- allowed - the owner outranks the check - but it must say why.
  constraint contradicting_the_machine_needs_a_reason check (
    ruling <> 'genuinely different material - not a discrepancy'
    or length(btrim(coalesce(note,''))) >= 15
  )
);
alter table strain_name_ruling enable row level security;
create policy strain_name_ruling_read on strain_name_ruling for select to authenticated using (true);
create policy strain_name_ruling_write on strain_name_ruling for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

insert into strain_name_ruling
  (pair_key, item_name, strain_field, packages, item_registered, strain_registered, machine_verdict)
select lower(btrim(d.source_a_says))||' >> '||lower(btrim(d.source_b_says)),
       min(d.source_a_says), min(d.source_b_says), count(*)::int,
       bool_or(lower(btrim(d.source_a_says)) in (select lower(btrim(name)) from metrc_strains)),
       bool_or(lower(btrim(d.source_b_says)) in (select lower(btrim(name)) from metrc_strains)),
       case
         when lower(btrim(min(d.source_a_says))) in (select lower(btrim(name)) from metrc_strains)
          and lower(btrim(min(d.source_b_says))) in (select lower(btrim(name)) from metrc_strains)
           then 'both are registered strains - the machine cannot choose'
         when lower(btrim(min(d.source_b_says))) in (select lower(btrim(name)) from metrc_strains)
           then 'only the strain field is a registered strain'
         when lower(btrim(min(d.source_a_says))) in (select lower(btrim(name)) from metrc_strains)
           then 'only the item name is a registered strain'
         else 'neither side is a registered strain'
       end
from discrepancy_register d
where d.resolved_at is null and d.class = 'strain'
group by lower(btrim(d.source_a_says)), lower(btrim(d.source_b_says))
on conflict (pair_key) do update set packages = excluded.packages;

comment on table strain_name_ruling is
  'The 73 decisions hiding inside 956 strain discrepancies. One ruling closes every '
  'package behind it. The machine fills machine_verdict from the strain register; only '
  'a person may fill ruling, because whether a name is a product name is business '
  'practice and rule A5 forbids inferring it.';;
