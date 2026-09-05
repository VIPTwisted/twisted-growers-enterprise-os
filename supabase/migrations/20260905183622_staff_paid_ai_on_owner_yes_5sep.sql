-- Applied prod 20260905183622.
-- Owner 5 Sep 2026: Staff bots live with AI immediately.
-- $100 monthly cap UNCHANGED. leftover_grok 0. Metrc read-only.
-- Apex invoice remains money source of record. No certified number invented in chat.

update public.ai_settings
   set paid_model_enabled = true,
       note = 'Owner 5 Sep 2026: Staff bots live with AI immediately. $100 monthly cap unchanged. Metrc read-only. Apex invoice is money SoR. No certified number invented in chat.',
       updated_at = now()
 where id = 1
   and paid_model_enabled is distinct from true;
