-- Agent I (Database COO), 12 Aug 2026. DBI-057.
--
-- OWNER ORDER, VERBATIM: "we need major reform here B needs verifiers and confirmation no less
-- than 3, all have to agree, agents to verify to ensure 100% build design perfect for users and
-- the damn data is flawess 100% accurate and a guard the final just to review and approve."
--
-- WHY IT IS NEEDED, STATED HONESTLY. Schema changes already pass three reviewers (V, X, W).
-- FRONT-END deliveries passed NONE. B built, I glanced, the owner found the defects. Tonight he
-- found four in one sitting: a tile drilling into a contradiction of itself, vaults reporting
-- plants, no way back from a drill except the menu, and a 15-second reload when you take it.
-- Reviewer count for all of that: zero. This gate makes that arithmetic impossible.
--
-- THE THREE LANES ARE DELIBERATELY DIFFERENT. Three agents asked the same question give one
-- answer three times. Each verifier here owns a lane the others cannot see into:
--   data      - every figure on the page re-derived a SECOND way from a different base
--   design    - DDC density bar, frozen surfaces pixel-identical, theme and menus untouched
--   usability - every drill opens AND CLOSES, every route back, load time measured in seconds
-- Then the guard reviews all three and approves. The guard cannot be one of the three.
--
-- UNANIMITY IS ENFORCED IN THE TRIGGER, not requested in a document. A single "concerns" verdict
-- blocks approval. A missing lane blocks approval. A guard who also verified blocks approval.
--
-- UNDO: drop trigger trg_delivery_gate on delivery; drop function tg_delivery_gate;
--       drop view v_delivery_board; drop table delivery_verification; drop table delivery.

create table if not exists delivery (
  id            bigserial primary key,
  page          text not null,
  built_by      text not null,
  summary       text not null,
  commit_ref    text,
  submitted_at  timestamptz not null default now(),
  status        text not null default 'submitted'
                check (status in ('submitted','verifying','approved','rejected','shipped')),
  guard         text,
  guard_note    text,
  guard_at      timestamptz
);

create table if not exists delivery_verification (
  id           bigserial primary key,
  delivery_id  bigint not null references delivery(id) on delete cascade,
  lane         text not null check (lane in ('data','design','usability')),
  verifier     text not null,
  verdict      text not null check (verdict in ('agree','concerns','refute')),
  what_i_ran   text not null,
  what_i_found text not null,
  checked_at   timestamptz not null default now(),
  unique (delivery_id, lane)
);

alter table delivery              enable row level security;
alter table delivery_verification enable row level security;
drop policy if exists dl_read  on delivery;
drop policy if exists dl_write on delivery;
drop policy if exists dv_read  on delivery_verification;
drop policy if exists dv_write on delivery_verification;
create policy dl_read  on delivery for select to authenticated using (true);
create policy dl_write on delivery for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());
create policy dv_read  on delivery_verification for select to authenticated using (true);
create policy dv_write on delivery_verification for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table delivery is
 'No front-end page reaches the owner without THREE verifiers in three different lanes all '
 'agreeing, plus a guard who is none of the three. Ordered 12 Aug 2026 after four defects in one '
 'sitting reached him with zero reviewers between B and his eyes.';

comment on table delivery_verification is
 'One row per lane per delivery. data = every figure re-derived a second way from a different '
 'base. design = DDC density, frozen surfaces pixel-identical, theme and menus untouched. '
 'usability = every drill opens AND CLOSES, every route back exists, load time measured. '
 'what_i_ran and what_i_found are mandatory and must be substantial: "looks good" is not a '
 'verification and the length check below says so.';

alter table delivery_verification
  drop constraint if exists dv_what_i_ran_check,
  drop constraint if exists dv_what_i_found_check;
alter table delivery_verification
  add constraint dv_what_i_ran_check   check (length(btrim(what_i_ran))   >= 40),
  add constraint dv_what_i_found_check check (length(btrim(what_i_found)) >= 40);

create or replace function tg_delivery_gate() returns trigger
language plpgsql as $$
declare lanes int; agreed int; dissent text; guard_also_verified boolean;
begin
  if new.status <> 'approved' or old.status = 'approved' then return new; end if;

  select count(distinct lane), count(*) filter (where verdict = 'agree')
    into lanes, agreed
    from delivery_verification where delivery_id = new.id;

  if lanes < 3 then
    raise exception
      'Cannot approve "%": % of 3 lanes verified. All three of data, design and usability must '
      'report before the guard sees it.', new.page, lanes;
  end if;

  if agreed < 3 then
    select string_agg(lane||' ('||verifier||'): '||verdict||' — '||what_i_found, E'\n')
      into dissent from delivery_verification
     where delivery_id = new.id and verdict <> 'agree';
    raise exception
      'Cannot approve "%": the three verifiers are NOT unanimous. Unresolved:%s%s',
      new.page, E'\n', dissent;
  end if;

  if new.guard is null or length(btrim(coalesce(new.guard_note,''))) < 40 then
    raise exception
      'Cannot approve "%": a named guard must review all three lanes and record what they '
      'checked. An empty note is not a review.', new.page;
  end if;

  select exists(select 1 from delivery_verification
                 where delivery_id = new.id and verifier = new.guard)
    into guard_also_verified;
  if guard_also_verified then
    raise exception
      'Cannot approve "%": % verified one of the lanes and cannot also be the guard. The guard '
      'is the independent fourth pair of eyes, not a verifier signing their own work.',
      new.page, new.guard;
  end if;

  new.guard_at := now();
  return new;
end $$;

drop trigger if exists trg_delivery_gate on delivery;
create trigger trg_delivery_gate before update on delivery
for each row execute function tg_delivery_gate();

create or replace view public.v_delivery_board as
select d.id, d.page, d.built_by, d.summary, d.status, d.submitted_at,
       count(v.id)                                          as lanes_reported,
       count(*) filter (where v.verdict = 'agree')           as lanes_agreeing,
       string_agg(v.lane || ': ' || v.verdict || ' (' || v.verifier || ')', ' · '
                  order by v.lane)                           as lane_detail,
       string_agg(v.lane, ', ') filter (where v.verdict <> 'agree') as lanes_blocking,
       d.guard, d.guard_at,
       case when d.status = 'approved' then 'APPROVED'
            when count(v.id) < 3       then 'WAITING — ' || (3 - count(v.id)) || ' lane(s) not yet verified'
            when count(*) filter (where v.verdict <> 'agree') > 0
                                       then 'BLOCKED — verifiers disagree'
            when d.guard is null       then 'READY FOR GUARD'
            else 'READY' end                                 as gate_state
from delivery d left join delivery_verification v on v.delivery_id = d.id
group by d.id;

comment on view public.v_delivery_board is
 'Where every front-end delivery stands against the three-lane unanimous gate plus guard. This is '
 'the board the owner reads instead of discovering defects himself.';;
