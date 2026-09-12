-- ─────────────────────────────────────────────────────────────────────────────
-- Weekly Drills (src/screens/WeeklyDrills.jsx) — real backend.
--
-- The screen is a gamified, quiz-style weekly training drill (questions, score,
-- time, XP, streak) for every associate, plus an HR "Manage Drills" authoring
-- view and forensic drill-downs. It previously ran ENTIRELY on hardcoded content
-- (DRILL_LIBRARY), a deterministic seed() generator, MOCK_EMPLOYEES and
-- localStorage. This migration replaces all of that with real tables + RPCs.
--
-- NOTE ON EXISTING OBJECTS:
--   * public.training_drills / get_training_drills() already exist but model a
--     DIFFERENT concept — scheduled fire/safety drill *events* (a date + a
--     mandatory flag), not the interactive quiz drills this screen runs. They are
--     left untouched.
--   * get_drill_history() also already exists in the DB but its return shape /
--     backing table are opaque via the API and it returns nothing; rather than
--     depend on an unknown contract, this screen uses the explicit RPCs below.
--
-- Only the quiz-drill *curriculum* (questions authored by the design as product
-- content) is seeded. NO user activity is fabricated — every score, completion,
-- streak and benchmark comes from real rows written by real associates.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Curriculum: the quiz drills ─────────────────────────────────────────────
create table if not exists public.drill_definitions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,
  node_id     uuid,                                   -- null → applies to all locations
  slug        text unique,                            -- stable key for idempotent seeding
  title       text not null,
  category    text not null default 'Sales',
  minutes     int  not null default 5,
  points      int  not null default 50,
  week_order  int,                                    -- rotation order (nulls sort last)
  assign_to   text not null default 'all',
  questions   jsonb not null default '[]'::jsonb,     -- [{ q, options[], correct, tip }]
  active      boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists drill_definitions_active_idx
  on public.drill_definitions (active, week_order);

alter table public.drill_definitions enable row level security;

-- ── Completions: one row per person / drill / iso-week ──────────────────────
create table if not exists public.drill_completions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  person_id     uuid not null,
  node_id       uuid,
  drill_id      uuid not null references public.drill_definitions (id) on delete cascade,
  iso_week      int  not null,
  iso_year      int  not null,
  score_pct     int  not null default 0,
  time_sec      int  not null default 0,
  points_earned int  not null default 0,
  completed_at  timestamptz not null default now(),
  unique (person_id, drill_id, iso_year, iso_week)
);

create index if not exists drill_completions_person_idx
  on public.drill_completions (person_id, iso_year);
create index if not exists drill_completions_drill_idx
  on public.drill_completions (drill_id, iso_year);

alter table public.drill_completions enable row level security;

-- ── READ: active curriculum for a set of locations ──────────────────────────
create or replace function public.get_drill_definitions(p_node_ids uuid[])
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(row_to_json(t) order by t.week_order nulls last, t.created_at),
    '[]'::jsonb)
  from (
    select d.id, d.title, d.category, d.minutes, d.points,
           d.week_order, d.assign_to, d.questions, d.created_at
    from public.drill_definitions d
    where d.active
      and (d.node_id is null or p_node_ids is null or d.node_id = any(p_node_ids))
  ) t;
$$;

-- ── READ: one person's completions for a year (KPIs / streak / history) ─────
create or replace function public.get_drill_completions(p_person_id uuid, p_year int)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(row_to_json(t) order by t.completed_at desc),
    '[]'::jsonb)
  from (
    select c.drill_id, c.iso_week, c.iso_year,
           c.score_pct, c.time_sec, c.points_earned, c.completed_at,
           d.title, d.category
    from public.drill_completions c
    join public.drill_definitions d on d.id = c.drill_id
    where c.person_id = p_person_id
      and (p_year is null or c.iso_year = p_year)
  ) t;
$$;

-- ── WRITE: record (or overwrite) a drill completion ─────────────────────────
create or replace function public.drill_complete(
  p_person_id uuid, p_drill_id uuid, p_node_id uuid,
  p_iso_week int, p_iso_year int,
  p_score_pct int, p_time_sec int, p_points_earned int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if p_person_id is null or p_drill_id is null then
    return jsonb_build_object('ok', false, 'error', 'person_id and drill_id required');
  end if;

  select tenant_id into v_tenant from public.org_nodes
    where p_node_id is not null and id = p_node_id limit 1;
  if v_tenant is null then
    select tenant_id into v_tenant from public.org_nodes order by tenant_id limit 1;
  end if;

  insert into public.drill_completions
    (tenant_id, person_id, node_id, drill_id, iso_week, iso_year,
     score_pct, time_sec, points_earned)
  values
    (v_tenant, p_person_id, p_node_id, p_drill_id, p_iso_week, p_iso_year,
     coalesce(p_score_pct, 0), coalesce(p_time_sec, 0), coalesce(p_points_earned, 0))
  on conflict (person_id, drill_id, iso_year, iso_week) do update
    set score_pct     = excluded.score_pct,
        time_sec      = excluded.time_sec,
        points_earned = excluded.points_earned,
        completed_at  = now(),
        node_id       = coalesce(excluded.node_id, public.drill_completions.node_id)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── WRITE: author / edit a drill (HR "Manage Drills") ───────────────────────
create or replace function public.drill_definition_upsert(
  p_id uuid, p_node_id uuid, p_title text, p_category text,
  p_minutes int, p_points int, p_questions jsonb, p_assign_to text, p_actor uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if coalesce(length(trim(p_title)), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'title required');
  end if;

  select tenant_id into v_tenant from public.org_nodes
    where p_node_id is not null and id = p_node_id limit 1;
  if v_tenant is null then
    select tenant_id into v_tenant from public.org_nodes order by tenant_id limit 1;
  end if;

  if p_id is not null then
    update public.drill_definitions
       set node_id    = p_node_id,
           title      = trim(p_title),
           category   = coalesce(nullif(trim(p_category), ''), category),
           minutes    = coalesce(p_minutes, minutes),
           points     = coalesce(p_points, points),
           questions  = coalesce(p_questions, questions),
           assign_to  = coalesce(nullif(trim(p_assign_to), ''), assign_to),
           updated_at = now()
     where id = p_id
     returning id into v_id;
  else
    insert into public.drill_definitions
      (tenant_id, node_id, title, category, minutes, points, questions, assign_to, created_by)
    values
      (v_tenant, p_node_id, trim(p_title),
       coalesce(nullif(trim(p_category), ''), 'Sales'),
       coalesce(p_minutes, 5), coalesce(p_points, 50),
       coalesce(p_questions, '[]'::jsonb),
       coalesce(nullif(trim(p_assign_to), ''), 'all'), p_actor)
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── READ: per-drill completion stats for HR library table ───────────────────
-- total_assigned = distinct active people in scope; completed_count / avg_score
-- are computed from real completions this calendar year.
create or replace function public.get_drill_stats(p_node_ids uuid[])
returns jsonb
language sql security definer set search_path = public as $$
  with scoped_people as (
    select distinct a.person_id
    from public.assignments a
    join public.people p on p.id = a.person_id and p.is_active
    where p_node_ids is null or a.node_id = any(p_node_ids)
  ),
  headcount as ( select count(*)::int as n from scoped_people )
  select coalesce(
    jsonb_agg(row_to_json(t) order by t.week_order nulls last, t.created_at),
    '[]'::jsonb)
  from (
    select d.id, d.title, d.category, d.points, d.minutes,
           d.week_order, d.created_at,
           (select n from headcount)                                as total_assigned,
           count(distinct c.person_id)::int                         as completed_count,
           coalesce(round(avg(c.score_pct))::int, 0)                as avg_score
    from public.drill_definitions d
    left join public.drill_completions c
      on c.drill_id = d.id
     and c.iso_year = extract(isoyear from now())::int
     and c.person_id in (select person_id from scoped_people)
    where d.active
      and (d.node_id is null or p_node_ids is null or d.node_id = any(p_node_ids))
    group by d.id
  ) t;
$$;

-- ── READ: per-employee drill benchmark for the team drill-down ──────────────
create or replace function public.get_drill_team_benchmark(p_node_ids uuid[])
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(row_to_json(t) order by t.avg_score desc nulls last, t.name),
    '[]'::jsonb)
  from (
    select p.id as person_id,
           coalesce(nullif(trim(p.display_name), ''), p.full_name) as name,
           coalesce(n.name, '—')                                   as location,
           coalesce(r.name, '—')                                   as role,
           count(c.id)::int                                        as completed,
           coalesce(round(avg(c.score_pct))::int, 0)               as avg_score,
           coalesce(sum(c.points_earned), 0)::int                  as pts
    from public.people p
    join lateral (
      select a.node_id, a.role_id
      from public.assignments a
      where a.person_id = p.id
        and (p_node_ids is null or a.node_id = any(p_node_ids))
      order by a.effective_from desc nulls last
      limit 1
    ) asg on true
    left join public.org_nodes n on n.id = asg.node_id
    left join public.roles r on r.id = asg.role_id
    left join public.drill_completions c
      on c.person_id = p.id
     and c.iso_year = extract(isoyear from now())::int
    where p.is_active
    group by p.id, p.display_name, p.full_name, n.name, r.name
  ) t;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
grant execute on function public.get_drill_definitions(uuid[])                                     to anon, authenticated;
grant execute on function public.get_drill_completions(uuid, int)                                  to anon, authenticated;
grant execute on function public.drill_complete(uuid, uuid, uuid, int, int, int, int, int)         to anon, authenticated;
grant execute on function public.drill_definition_upsert(uuid, uuid, text, text, int, int, jsonb, text, uuid) to anon, authenticated;
grant execute on function public.get_drill_stats(uuid[])                                           to anon, authenticated;
grant execute on function public.get_drill_team_benchmark(uuid[])                                  to anon, authenticated;

-- ── Seed the curriculum (product content — idempotent, no user activity) ────
insert into public.drill_definitions (slug, title, category, minutes, points, week_order, questions) values
('overcoming-objections','Overcoming Objections','Sales',3,50,1, $json$[
  {"q":"A customer says 'this is too expensive.' How do you respond?","options":["Apologize and offer a discount immediately","Acknowledge the concern, highlight value, and share comparable examples","Tell them it's the cheapest option available","Walk away and let them browse"],"correct":1,"tip":"Empathize first, then pivot to value. Customers pay for confidence — give them a reason to feel good about the purchase."},
  {"q":"A customer compares your price to a competitor. What's your move?","options":["Match the competitor's price immediately","Acknowledge the comparison and explain your unique value and service","Tell them to buy from the competitor then","Ignore the comment and change the subject"],"correct":1,"tip":"Never devalue your brand. Focus on what makes your product and service different and worth it."},
  {"q":"When a customer hesitates after hearing the price, you should:","options":["Stay silent and let them think for 30 seconds","Immediately start discounting","Summarize the key benefit that justifies the price","Call your manager over"],"correct":2,"tip":"A well-timed benefit summary refocuses the conversation on value, not cost."}
]$json$::jsonb),
('product-upselling','Product Upselling','Sales',4,60,2, $json$[
  {"q":"How do you suggest a higher-priced item without being pushy?","options":["Mention it only if the customer asks directly","Frame it as 'what most customers choose' and explain the specific benefit","Place the expensive item at eye level so they notice","Tell them the cheaper one is almost out of stock"],"correct":1,"tip":"Social proof + a clear benefit does the heavy lifting. Never create false urgency — it erodes trust."},
  {"q":"Best time to introduce an upsell?","options":["Before the customer has chosen anything","Right after they've expressed interest in a specific item","At the register when they're about to pay","Only when the customer asks 'is there anything better?'"],"correct":1,"tip":"Once a customer shows real interest, they're emotionally invested. That's your window."},
  {"q":"A customer is buying a basic product. You notice a premium version at $20 more. You:","options":["Say nothing — they chose what they wanted","Ask if they've seen the premium version and explain one key advantage","Tell them the basic version breaks easily","Add it to their basket without asking"],"correct":1,"tip":"A single, genuine recommendation feels helpful — not pushy. Always tie it to a clear customer benefit."},
  {"q":"After an upsell is declined, you should:","options":["Keep pushing — persistence wins","Ask why they declined so you can counter","Accept gracefully and continue serving them with full energy","Mention the upsell again at checkout"],"correct":2,"tip":"Respecting a 'no' builds long-term trust. The customer will come back more often if they never feel pressured."}
]$json$::jsonb),
('customer-greeting','Customer Greeting','Customer Service',2,40,3, $json$[
  {"q":"A customer walks in looking uncomfortable. What do you do first?","options":["Immediately approach and ask what they're looking for","Give a warm, low-pressure greeting and let them set the pace","Ignore them until they approach the counter","Ask another associate to handle it"],"correct":1,"tip":"Discomfort in adult retail is common. A relaxed, non-judgmental greeting sets the entire tone of the visit."},
  {"q":"The ideal greeting for a new customer entering is:","options":["'Can I help you find something specific?'","'Welcome in! Let me know if you have any questions.'","'Are you looking for anything in particular today?'","A smile and brief eye contact, then let them settle"],"correct":3,"tip":"Many customers need 30 seconds to acclimate. A friendly non-verbal welcome honors that without creating pressure."},
  {"q":"Two customers enter at the same time and you're alone. You:","options":["Help the first one fully before acknowledging the second","Acknowledge both verbally, then assist in order of arrival","Ask the second to wait outside","Call for backup immediately before greeting anyone"],"correct":1,"tip":"A quick 'Hi, I'll be right with you!' to the second customer prevents them from feeling invisible."}
]$json$::jsonb),
('closing-the-sale','Closing the Sale','Sales',3,55,4, $json$[
  {"q":"Customer is interested but hesitant. What's your closing move?","options":["Tell them to take their time and come back whenever","Offer a summary of benefits, ask if they have questions, then invite the decision","Apply urgency — say today is the last day for this price","Offer to hold it behind the counter for free"],"correct":1,"tip":"The assumptive close — 'Would you like to take this home today?' — is gentle and effective. Remove friction, not autonomy."},
  {"q":"Which closing signal should you watch for?","options":["Customer looks at the price tag twice","Customer asks about return policy","Customer asks 'does this come in other colors?'","Customer checks their phone"],"correct":1,"tip":"Questions about logistics (returns, payment, delivery) signal a customer mentally trying on ownership."},
  {"q":"After a customer says 'let me think about it,' you:","options":["Walk away immediately to give them space","Ask what specifically is holding them back","Offer a 10% discount to close it now","Tell them another customer was looking at the same item"],"correct":1,"tip":"Uncovering the real objection lets you address it. 'What specifically are you thinking through?' is pure gold."}
]$json$::jsonb),
('store-policy-essentials','Store Policy Essentials','Policy',5,70,5, $json$[
  {"q":"Customer asks for a refund outside the return window. You:","options":["Just give the refund to avoid conflict","Refuse bluntly and point to the sign","Acknowledge their frustration, explain the policy clearly, and offer alternatives","Tell them to call corporate"],"correct":2,"tip":"Policy enforcement with empathy keeps customers and protects the business. Alternatives (exchange, store credit) soften the 'no.'"},
  {"q":"A customer mentions our competitor has a better return policy. You:","options":["Agree that our policy could be better","Explain that our policy exists to ensure product quality and customer protection","Tell them to go to the competitor then","Offer to match the competitor's policy on the spot"],"correct":1,"tip":"Turn policy into a benefit story — it protects customers from buying pre-used products, which matters in our category."},
  {"q":"The age verification policy requires you to check ID when:","options":["The customer looks under 25","The customer looks under 21","Always, for every customer purchasing age-restricted items","Only when the customer looks under 18"],"correct":2,"tip":"Consistent policy application protects you legally and removes any possibility of bias or discrimination claims."},
  {"q":"A coworker skips the ID check because 'the customer is obviously old enough.' You:","options":["Stay quiet — it's their choice","Remind them privately that the policy is always-ID, every time","Report them to the manager immediately in front of the customer","Tell the customer you're required to check"],"correct":1,"tip":"Private correction preserves team morale. Skipping ID checks even once creates legal exposure for the store."},
  {"q":"A customer wants to use an expired coupon. You:","options":["Accept it — the customer won't know the difference","Politely explain it's expired and offer to check for any current promotions","Refuse without explanation","Tell them to email corporate for approval"],"correct":1,"tip":"Offering to find a current promotion turns a 'no' into a 'let me help you anyway' — a much better customer experience."}
]$json$::jsonb),
('safety-loss-prevention','Safety & Loss Prevention','Safety',4,65,6, $json$[
  {"q":"You notice a customer pocketing merchandise. First action:","options":["Confront them loudly in the store","Alert your manager or loss prevention immediately without confronting the customer","Block the exit so they can't leave","Pretend you didn't see it"],"correct":1,"tip":"Employee safety first. Confronting a shoplifter can escalate to violence. Let trained staff and management handle it."},
  {"q":"A spill occurs near the register. You:","options":["Wipe it up quickly and move on","Block the area immediately, post a wet floor sign, and clean it up properly","Tell the next customer to watch out","Wait for a manager to authorize cleanup"],"correct":1,"tip":"Slip-and-fall injuries are one of the most common retail liabilities. Fast, proper response protects customers and the business."},
  {"q":"End-of-shift register count shows a $20 shortage. You:","options":["Put $20 from your pocket in to make it balance","Report the shortage accurately to your manager","Assume the previous shift made the error","Wait and see if it corrects itself tomorrow"],"correct":1,"tip":"Accurate reporting — even shortages — builds trust. Covering shortages personally creates a pattern that can look like theft."},
  {"q":"Proper procedure when you close the store alone:","options":["Lock the front, count the drawer, leave","Call your manager to notify you're closing, do a full walk-through, secure all entry points, set alarm, then leave","Whatever gets you out fastest","Leave the lights on as a deterrent"],"correct":1,"tip":"The close-out checklist exists for your safety and store security. Skipping steps creates liability."}
]$json$::jsonb),
('team-communication','Team Communication','Customer Service',3,45,7, $json$[
  {"q":"A coworker made a mistake on a transaction. How do you handle it?","options":["Correct the mistake publicly so everyone knows","Fix it silently and tell the manager later","Pull the coworker aside privately and explain calmly","Ignore it — it's not your problem"],"correct":2,"tip":"Private, calm correction preserves dignity and reinforces team trust. Public callouts create resentment."},
  {"q":"You disagree with a manager's decision on the floor. You:","options":["Argue your point in front of customers","Comply in the moment, then raise your concern privately after","Refuse to follow through until it's resolved","Complain to coworkers"],"correct":1,"tip":"Professionalism means separating the floor from the office. Challenge decisions in private, not in front of customers."},
  {"q":"Shift handoff best practice:","options":["Leave a sticky note on the register","Verbally brief the incoming associate on key events, inventory issues, and customer concerns","Just punch out — they'll figure it out","Send a text with the important stuff"],"correct":1,"tip":"A quality verbal handoff prevents errors, ensures continuity, and shows professionalism to both your team and customers."}
]$json$::jsonb),
('product-knowledge-basics','Product Knowledge Basics','Product',5,75,8, $json$[
  {"q":"Customer asks about a product you don't know. What do you do?","options":["Make up an answer so you don't look uninformed","Say 'I'm not sure' and leave it at that","Say 'Great question — let me find out right now' and check immediately","Direct them to a competitor who might know"],"correct":2,"tip":"Honesty + action wins every time. 'I'll find out now' builds far more trust than a confident wrong answer."},
  {"q":"The most effective way to learn new products is:","options":["Read the box when it comes in","Wait for formal training","Proactively try samples when available, read supplier materials, and ask questions","Let experienced associates handle those questions"],"correct":2,"tip":"Hands-on knowledge converts better than memorized specs. The more you know from experience, the more naturally you recommend."},
  {"q":"A customer asks for 'the best' product in a category. You:","options":["Show them the most expensive item","Ask a couple questions about their needs and then make a tailored recommendation","Show them what's on sale","'Best' is subjective — tell them to look around"],"correct":1,"tip":"Need discovery before recommendation is the foundation of consultative selling. Two questions can double your close rate."},
  {"q":"A product you personally dislike is recommended by the manager. You:","options":["Tell customers it's not your favorite","Refuse to recommend it","Present the product's objective benefits without injecting your personal opinion","Say nothing and hope customers don't ask"],"correct":2,"tip":"Your personal preferences don't determine what's right for every customer. Present facts and let them decide."},
  {"q":"Which is most important when recommending products?","options":["Price point","Matching the product's benefits to the customer's stated needs","What's in stock","What has the highest margin"],"correct":1,"tip":"Customer-need alignment creates satisfaction, repeat visits, and referrals. That beats a single high-margin sale."}
]$json$::jsonb)
on conflict (slug) do nothing;
