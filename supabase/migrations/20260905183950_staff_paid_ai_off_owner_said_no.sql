-- Applied prod 20260905183950.
-- Owner 5 Sep 2026: "NO I DONT WANT TO PAY."
-- Reverses 20260905183622. paid_model_enabled is false.
-- $100 cap unused. leftover_grok 0. Metrc read-only.
-- Staff answers through the desktop bridge (already-paid Claude/GPT subscription).

update public.ai_settings
   set paid_model_enabled = false,
       note = 'Owner 5 Sep 2026: NO I DONT WANT TO PAY. Paid API off. Staff uses the desktop bridge (already-paid Claude/GPT subscription). $100 cap unused. Metrc read-only.',
       updated_at = now()
 where id = 1;
