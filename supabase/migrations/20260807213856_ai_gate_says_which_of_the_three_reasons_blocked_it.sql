-- WHAT VINNY SAW, AND WHY IT WAS FALSE
--
-- The assistant told the owner "the monthly artificial intelligence budget cap has
-- been reached". Spend this month was $0.00 against a $100 cap and ai_usage_log held
-- exactly one row ever. Nothing had ever been charged.
--
-- tg_ai_budget_ok() ANDs three conditions and returns one boolean:
--   1. paid_model_enabled            — true
--   2. caller is owner or executive  — checked with auth.uid()
--   3. spend < cap                   — true, $0 of $100
--
-- budz-chat calls it through a SERVICE-ROLE client, which carries no user identity,
-- so auth.uid() is null and condition 2 can NEVER pass — for anybody, at any spend,
-- under any cap. The gate was not a budget gate. It was an unconditional block, and
-- the caller printed the one false it got back as a budget message.
--
-- Two defects, and the second is the worse one: three unrelated causes collapsed into
-- one sentence, and the sentence named the only cause that was not true. That is A3 —
-- absence must state WHICH reason, never a plausible-sounding stand-in. An owner
-- reading "cap reached" goes to Settings to raise a cap that was never the problem.
--
-- tg_ai_budget_ok() is left exactly as it is; anything else calling it keeps its
-- behaviour. This is additive.
create or replace function public.tg_ai_gate()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with s as (select * from ai_settings where id = 1),
       spend as (
         select coalesce(sum(cost_usd), 0) as used
         from ai_usage_log
         where created_at >= date_trunc('month', now())
       ),
       me as (select role::text as role from app_users where user_id = auth.uid())
  select case
    when not exists (select 1 from s) then jsonb_build_object(
      'allowed', false, 'reason', 'no_settings',
      'message', 'The assistant has no settings row, so nothing can tell me whether paid answers are switched on. An owner needs to open Settings and save the assistant options once.')

    when auth.uid() is null then jsonb_build_object(
      'allowed', false, 'reason', 'no_identity',
      'message', 'I could not tell who is asking, so I stopped rather than spend money for an unknown caller. Signing out and back in usually fixes it.')

    when not exists (select 1 from me) then jsonb_build_object(
      'allowed', false, 'reason', 'not_on_file',
      'message', 'You are signed in, but there is no record of you in the user list, so I cannot check whether you are allowed paid answers.')

    when (select role from me) not in ('owner','executive') then jsonb_build_object(
      'allowed', false, 'reason', 'not_permitted',
      'message', 'Free-form questions are limited to owners and executives. Every report, dashboard and suggestion button still works for you and costs nothing.',
      'your_role', (select role from me))

    when not coalesce((select paid_model_enabled from s), false) then jsonb_build_object(
      'allowed', false, 'reason', 'paid_model_off',
      'message', 'Paid answers are switched off in Settings. This is not a spending limit — the switch is simply off.')

    when (select used from spend) >= (select hard_monthly_cost_cap_usd from s) then jsonb_build_object(
      'allowed', false, 'reason', 'cap_reached',
      'message', format('The monthly cap really has been reached: $%s spent of a $%s cap. An owner can raise it in Settings.',
                        round((select used from spend), 2), (select hard_monthly_cost_cap_usd from s)),
      'spent_usd', round((select used from spend), 2),
      'cap_usd',   (select hard_monthly_cost_cap_usd from s))

    else jsonb_build_object(
      'allowed', true, 'reason', 'ok',
      'spent_usd', round((select used from spend), 2),
      'cap_usd',   (select hard_monthly_cost_cap_usd from s))
  end;
$$;

comment on function public.tg_ai_gate is
  'Whether a paid assistant answer may proceed, and WHICH of the six reasons stopped it. Reads auth.uid(), so it must be called on a client carrying the user JWT — a service-role client always reports no_identity, which is the defect this replaces.';

revoke all on function public.tg_ai_gate() from public, anon;
grant execute on function public.tg_ai_gate() to authenticated;;
