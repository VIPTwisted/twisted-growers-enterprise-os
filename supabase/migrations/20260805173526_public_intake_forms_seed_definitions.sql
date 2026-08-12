-- Seed three form definitions. Structure only, no business data.

insert into public.forms (name, description, target, fields)
select
  'Report an Issue',
  'Tell the management team about something that is blocking work right now, such as broken equipment, missing people, or material that has run out.',
  'issue_reports',
  '[
    {"key":"issue_type","label":"What is the problem","type":"select","required":true,
     "options":["Equipment down","Short staffed","Out of material","Other"]},
    {"key":"location","label":"Location","type":"text","required":true,
     "help":"Which room or area is affected"},
    {"key":"urgency","label":"How urgent is this","type":"select","required":true,
     "options":["Low","Medium","High","Stop work"]},
    {"key":"description","label":"Describe what is happening","type":"textarea","required":true,
     "help":"Include what you were doing when you noticed it and anything you already tried"}
  ]'::jsonb
where not exists (select 1 from public.forms where name = 'Report an Issue');

insert into public.forms (name, description, target, fields)
select
  'Weekly Weight Report',
  'Record the weights taken off a harvest for the week, broken out by grade so yield can be reconciled.',
  'harvest_weights',
  '[
    {"key":"harvest_name","label":"Harvest name","type":"text","required":true},
    {"key":"room","label":"Room","type":"text","required":true},
    {"key":"wet_weight_pounds","label":"Wet weight in pounds","type":"number","required":true,"min":0,"step":0.01},
    {"key":"waste_weight_pounds","label":"Waste weight in pounds","type":"number","required":false,"min":0,"step":0.01},
    {"key":"grade_a_pounds","label":"Grade A weight in pounds","type":"number","required":false,"min":0,"step":0.01},
    {"key":"grade_b_pounds","label":"Grade B weight in pounds","type":"number","required":false,"min":0,"step":0.01},
    {"key":"grade_c_pounds","label":"Grade C weight in pounds","type":"number","required":false,"min":0,"step":0.01},
    {"key":"trim_pounds","label":"Trim weight in pounds","type":"number","required":false,"min":0,"step":0.01}
  ]'::jsonb
where not exists (select 1 from public.forms where name = 'Weekly Weight Report');

insert into public.forms (name, description, target, fields)
select
  'Time Off Request',
  'Ask for time away from work so the schedule can be adjusted before the dates arrive.',
  'tasks',
  '[
    {"key":"employee_name","label":"Employee name","type":"text","required":true},
    {"key":"start_date","label":"First day off","type":"date","required":true},
    {"key":"end_date","label":"Last day off","type":"date","required":true},
    {"key":"reason","label":"Reason for the request","type":"textarea","required":true},
    {"key":"coverage_arranged","label":"Has coverage been arranged","type":"radio","required":true,
     "options":["Yes","No"],
     "help":"If yes, say who is covering in the reason box above"}
  ]'::jsonb
where not exists (select 1 from public.forms where name = 'Time Off Request');
;
