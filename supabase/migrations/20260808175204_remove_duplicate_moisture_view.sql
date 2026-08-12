-- Removing v_moisture_loss, which I created earlier today and should not have.
--
-- v_moisture_loss_register already existed and is strictly better: it reads the band from
-- f_rule() (G1), separates water that is EXPECTED from the excess that is genuinely
-- unaccounted, joins moisture_loss_entries to track whether each loss has actually been
-- entered in Metrc, and carries a plain-English status per harvest. Mine did none of that.
--
-- The rule broken was the platform's own: THERE MUST BE EXACTLY ONE HOME for a figure.
-- HANDOFF D5 records that lesson about potency, and I reproduced it for moisture within a
-- day of reading it. The failure was not the SQL; it was not looking first.
--
-- tg.allow_drop is set because the view-drop trigger requires it and demands the dependents
-- be checked first. Checked: ZERO dependent relations - the view is hours old and nothing
-- was ever built on it. Plain DROP, never CASCADE (rule E1).
set local tg.allow_drop = 'yes';
drop view if exists public.v_moisture_loss;;
