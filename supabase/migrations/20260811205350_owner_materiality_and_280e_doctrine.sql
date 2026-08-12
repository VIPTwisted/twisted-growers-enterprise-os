-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-009 (reviewers V, X, W).
--
-- PART 1 — MATERIALITY, SET BY THE OWNER.
-- Owner ruling 11 Aug 2026: $1,000 planning / $500 inventory / $100 trivial. These REPLACE my
-- proposed $71,000 / $25,000 / $3,500 and are recorded as owner_set, not provisional.
--
-- I AM RECORDING THE CONSEQUENCE, BECAUSE THAT IS MY JOB, NOT TO ARGUE THE NUMBER.
-- $1,000 against $7,146,829 of revenue is 0.014%. A financial-statement audit would use
-- something near 1%. At 0.014% almost nothing is immaterial, which means materiality stops
-- acting as a filter and becomes an instruction: INVESTIGATE EVERYTHING. That is a coherent
-- and defensible posture for a forensic rebuild and a receivership-style watch, which is what
-- this is. It is NOT the number a CPA would use to form an opinion on a return.
-- So there are two different thresholds serving two different purposes, and only one is set:
--   OPERATIONAL (set here, by the owner) - what our agents chase. Deliberately near zero.
--   REPORTING (still unset) - what a signing CPA would use to decide whether a misstatement
--       changes the return. That one needs the CPA and remains open.
-- Conflating them would be the error. An agent must never quote the operational threshold to
-- a regulator as though it were audit materiality.
--
-- PART 2 — 280E DOCTRINE, so every agent is trained rather than merely instructed.
-- cost_classes already exists and already carries irc_280e_deductible - but it classifies
-- LABOUR only, in four classes, for the payroll journal. It stays the single classification
-- authority. This table is the TEACHING layer that points at it: the rules, the traps we have
-- actually hit, and the things an agent must never do. Doctrine is not a second classifier.
--
-- CITATIONS ARE UNVERIFIED. Written from knowledge, not from opening the Code or the cases.
-- Not quotable to a regulator, an accountant or a lawyer until read at primary source.
--
-- UNDO: drop table tax_280e_doctrine;
--       update conversion_factors set value = 71000 where key='materiality_planning_usd'; (etc.)

update conversion_factors set
  value = 1000, evidence_status = 'owner_set', set_by = 'Owner (Vinny)', updated_at = now(),
  where_it_came_from = 'Owner ruling 11 Aug 2026, set directly. Replaces Agent I proposal of $71,000.',
  evidence_note = 'OWNER SET. 0.014% of revenue against a ~1% audit convention. At this level materiality no longer filters - it instructs us to investigate everything, which is the intended forensic posture. This is the OPERATIONAL threshold our agents work to. It is NOT reporting materiality for a return, which remains unset and needs the signing CPA.'
where key = 'materiality_planning_usd';

update conversion_factors set
  value = 500, evidence_status = 'owner_set', set_by = 'Owner (Vinny)', updated_at = now(),
  where_it_came_from = 'Owner ruling 11 Aug 2026, set directly. Replaces Agent I proposal of $25,000.',
  evidence_note = 'OWNER SET. Half the planning threshold, preserving the principle that inventory and COGS are held tighter than everything else because IRC 280E makes an inventory error flow to taxable income close to dollar for dollar.'
where key = 'materiality_inventory_usd';

update conversion_factors set
  value = 100, evidence_status = 'owner_set', set_by = 'Owner (Vinny)', updated_at = now(),
  where_it_came_from = 'Owner ruling 11 Aug 2026, set directly. Replaces Agent I proposal of $3,500.',
  evidence_note = 'OWNER SET. Below $100 an individual difference is recorded and not chased - but it still ACCUMULATES and the running total is tested against the $1,000 planning threshold. Ten $99 errors are material.'
where key = 'materiality_trivial_usd';

create table if not exists tax_280e_doctrine (
  rule_key        text primary key,
  headline        text not null,
  the_rule        text not null,
  why_it_matters  text not null,
  agents_must     text not null,
  agents_must_never text not null,
  trap_seen_here  text,
  authority       text,
  authority_status text not null default 'unverified'
                  check (authority_status in ('unverified','verified_primary_source','withdrawn')),
  sort_order      int not null default 100
);

alter table tax_280e_doctrine enable row level security;

comment on table tax_280e_doctrine is
 'IRC 280E doctrine, as rows, so every agent is trained at runtime instead of relying on prose '
 'somebody may not have read. This is the TEACHING layer. cost_classes remains the single '
 'classification authority and this table points at it - there is deliberately no second '
 'classifier here. Read this before touching any cost, price, margin or inventory value. '
 'AUTHORITIES ARE UNVERIFIED and must not be quoted externally until read at primary source.';

insert into tax_280e_doctrine
 (rule_key, headline, the_rule, why_it_matters, agents_must, agents_must_never, trap_seen_here, authority, sort_order) values

('the-rule-itself','280E disallows the deductions, not the cost of goods',
 'A business trafficking in a Schedule I controlled substance may not take ordinary business deductions or credits. Cannabis is Schedule I federally regardless of Massachusetts law. Cost of goods sold survives because COGS is not a deduction - it is subtracted in arriving at gross income in the first place.',
 'It means the entire federal tax outcome turns on one question: what legitimately belongs in COGS. Everything else - rent, marketing, most salaries, most professional fees - is disallowed no matter how ordinary and necessary it is.',
 'Treat every cost question as a classification question with a tax consequence, not as bookkeeping.',
 'Never describe a disallowed operating expense as a cost of production in order to shelter it. That is the abusive position examiners are specifically looking for, and it converts a tax dispute into a penalty case.',
 null,'IRC 280E; CHAMP v. Commissioner, 128 T.C. 173 (2007)',10),

('cogs-is-471','What may enter COGS is governed by 471, not by preference',
 'COGS is computed under the inventory rules. For a producer that means direct materials, direct labour, and the indirect production costs the rules permit to be absorbed into inventory. Costs outside those rules stay outside COGS even when they feel production-related.',
 'This is where the money is won or lost, and it is the reason cost_classes exists with an irc_280e_deductible flag rather than a free-text note.',
 'Classify against cost_classes. If a cost does not fit an existing class, raise it - do not improvise a class.',
 'Never invent a cost class to make something inventoriable.',
 'cost_classes today covers LABOUR only, in four classes. Non-labour costs have no classifier yet. That is a live gap, not a solved problem.',
 'IRC 471 and the regulations thereunder',20),

('producer-vs-reseller','We are a producer, and that is worth more than it sounds',
 'A producer who cultivates and manufactures may absorb a wider set of production costs into inventory than a reseller, whose cost of goods is essentially what was paid for the item plus getting it there.',
 'Twisted Growers is both: we cultivate and manufacture our own material, and we buy third-party material. The two are NOT costed the same way, and treating purchased material like produced material overstates COGS.',
 'Establish for every unit whether it was produced by us or bought in, and cost it on that basis. The ownership lens already distinguishes them - use it.',
 'Never apply producer absorption to bought-in material.',
 'The third-party population is 3,801.3 lb - not a rounding item. It must be costed as purchased, not produced.',
 'IRC 471; Patients Mutual (Harborside), 151 T.C. No. 11 (2018)',30),

('substantiation-or-nothing','A cost with no document is not a cost',
 'The burden of proof is on the taxpayer. An amount that cannot be traced to a source document created at the time does not survive examination, and estimation relief is not available here.',
 'This is the single most likely way we lose money in an examination - not through a wrong position, but through a right position we cannot evidence.',
 'State the BASIS of every cost figure: invoice, payment record, declared transfer price, or estimate. Carry the basis with the number everywhere it travels.',
 'Never let an estimated cost enter COGS. Never quote a cost without its basis.',
 '1,691.2 lb of third-party material - 44.5% of third-party pounds - has no price in Metrc at all. A further set carries only the $0.01 placeholder. None of that can enter COGS as it stands.',
 'IRC 6001',40),

('transfer-price-is-not-cost','A Metrc declared transfer price is not what we paid',
 'The wholesale price recorded on a compliance manifest is a regulatory declaration. It is not an invoice, not a payment, and not evidence of cost.',
 'It is the most tempting number in the database because it is populated and looks like money. An examiner will not accept it, and quoting it as cost invites a penalty argument.',
 'Label it exactly as what it is: declared transfer price. Where it is the only figure available, say so and mark the cost indicative.',
 'Never present declared transfer price as cost paid, and never build a $/lb on it without labelling the basis.',
 'The best available third-party figure is $838,952 of DECLARED price across 292 tags. It has been quoted as spend. It is not spend.',
 'IRC 6001',50),

('custody-is-not-purchase','Material moving is not material bought',
 'A transfer that moves custody without transferring title is neither a purchase nor a sale. Storage at a third-party warehouse, tolling, and consignment all move material without changing who owns it.',
 'Booking a custody movement as a purchase inflates COGS, which under 280E flows almost dollar-for-dollar to understated taxable income. It is a costly error in the direction examiners look hardest.',
 'Check counterparty_role before treating any movement as a purchase or a sale. Check the licence type - a transporter licence cannot be a seller.',
 'Never infer a purchase from the direction of a manifest.',
 'MEASURED AND CONFIRMED: $374,346 of our own material returning from the Eagle Eyes 3PL warehouse sits in the third-party spend tile as though purchased. Of that, exactly one cent is a real purchase. The same movement outbound is booked as 890.5 lb of sales.',
 'IRC 471; owner ruling C6d',60),

('shrinkage-is-not-a-deduction','Weight lost in drying is not a deductible loss',
 'Material that loses mass while we hold it has not generated a deduction. The cost stays with the units that remain, which raises the cost per unit of what is left.',
 'This is specific to agriculture and it is where generic accounting advice goes wrong. Treating shrinkage as a loss both overstates deductions and understates the cost of remaining inventory.',
 'Account for yield loss inside the costing of the surviving units.',
 'Never book normal process loss as an expense or a write-off.',
 null,'IRC 471',70),

('agents-do-not-take-positions','We substantiate. We do not opine.',
 'An agent computes figures, states their basis, and names what cannot be supported. Deciding what position to take on a return is the work of a qualified tax professional who signs it.',
 'An assistant asserting a tax position creates exposure and is worth nothing in an examination, because the person who signs is the one who carries it.',
 'Present the computation, the basis, and the alternatives. Say plainly where the evidence runs out.',
 'Never state that a cost IS deductible or IS disallowed as settled fact. Never advise on a filing position. Escalate to the owner and the CPA.',
 null,null,80)

on conflict (rule_key) do nothing;

comment on column tax_280e_doctrine.trap_seen_here is
 'A trap we have actually hit, with its measured size. A rule with a real incident attached is '
 'followed; an abstract rule is skimmed. NULL means the trap has not bitten us yet.';;
