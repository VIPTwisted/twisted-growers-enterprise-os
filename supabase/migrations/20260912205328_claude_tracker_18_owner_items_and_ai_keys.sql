-- Owner, 12 Sep 2026: "add my items to the deployment tracker; this will use the same AI keys as the bots".
insert into public.deployment_check (check_key, section, title, why, kind, severity, expected, status, value, detail, last_run_at, active, sort_order)
values
 ('owner.hr_ai_same_keys', '18 HR platform', 'Owner ruling: the HR platform''s AI uses the same AI keys and gateway as the bots', 'Ruled 12 Sep 2026. The HR screens with AI (AI Assistant, AI CEO Command, AI Scheduler, greeting batches, Doc AI generator, AI Advisor) do not get their own key store. VIP kept provider keys in hr.ai_providers.api_key_encrypted; here that column stays empty and every AI call goes through TG''s gateway — ai_settings (provider, model, caps, bridge), ai_models, usage into ai_usage_log — under the same limits and the same roles (ai_allowed_roles). Keys are the bots lane (Grok); the bridge from the HR schema to the gateway is Claude''s.', 'owner', 'OWNER', 'one key store, one gateway', 'PASS', 'ruled 12 Sep 2026', 'Recorded as ruled; implementation is hrp.ai_through_tg_gateway.', now(), true, 181),
 ('hrp.ai_through_tg_gateway', '18 HR platform', 'Every HR AI feature calls TG''s AI gateway; hr.ai_providers holds no keys', 'Six HR features call AI. Each is routed to the gateway the bots use (ai_settings / ai_models, logged to ai_usage_log, capped by hard_monthly_cost_cap_usd, gated by ai_allowed_roles). hr.ai_providers.api_key_encrypted stays null — checked. Precondition: the bots'' gateway endpoint is stable (Grok). Lane: Claude (bridge RPC + checks); Grok (keys, gateway).', 'manual', 'NO-GO', '6 features routed; 0 keys in hr.ai_providers', 'PENDING', null, 'AI Assistant, AI CEO Command, AI Scheduler, greetings_generate_batch, Doc Manager AI generator, AI Advisor.', null, true, 182),
 ('hr.set_employee_pins', '18 HR platform', 'Every active employee has a PIN for the time clock / kiosk', 'The kiosk signs in with Employee ID + PIN (pin_login, bcrypt). PINs are set by HR in the OS onboarding page (f_set_punch_pin) or in the HR platform (admin_reset_pin) and flow to hr.people by trigger. 0 of 27 active have one today. Re-measured hourly; closes at 0 without.', 'auto', 'NO-GO', '0 active without a PIN', 'FAIL', null, null, null, true, 183),
 ('hrp.greetings_for_tg', '18 HR platform', 'Greetings to employees at login and clock-in are Twisted Growers'' own', 'Owner asked for greetings. The engine is VIP''s (50 built-in lines, AI proposes 25 more every 30 days for approval, no repeats); the 50 lines and the clock-in reminder were rewritten for a cultivation/manufacturing crew — no retail, no VIP. Approval of AI batches stays with the owner/HR in AI Greeting Approvals. Lane: Claude (done).', 'manual', 'GO', '50 TG lines; 0 VIP', 'PASS', '50 / 0', 'src/lib/greetings.js', now(), true, 184),
 ('hrp.theme_selector', '18 HR platform', 'Users can pick VIP Aurora or Twisted Growers, in dark, light or system mode', 'Owner asked for a TG colour theme beside VIP''s, with light mode. Both families carry dark, light and system; Settings › Appearance applies the choice at once, remembers it for the next boot and saves it on the person (people.theme_pref) so it follows them; Theme Studio has the two TG presets. In VIP the Light option saved a key nothing read. Lane: Claude (done).', 'manual', 'GO', '2 families × 3 modes; persisted per person', 'PASS', 'aurora, tg × dark, light, system', null, now(), true, 185),
 ('hrp.retail_modules_kept', '18 HR platform', 'Retail modules stay for the dispensary', 'Owner 12 Sep: keep all retail items — Sales Tracker, Inventory, Products, Promotions, Spiffs, Contests, Leaderboards, store visits, Key Holder / Cashier roles, AM/PM shifts, location model. Nothing was stripped; the dispensary becomes a second location node when it opens. Lane: Claude (done).', 'manual', 'GO', 'all retail screens present', 'PASS', 'kept', null, now(), true, 186),
 ('hrp.policies_procedures_module', '18 HR platform', 'Policies & procedures: Handbook Builder, Policies hub, Doc Center, acknowledgments and quizzes work on TG content', 'The modules are VIP''s (hr_policies, hr_policy_versions/acknowledgments/quizzes, handbook_documents, tracked_documents, sign_requests). Content is TG''s: DRAFT skeletons with Massachusetts references until HR publishes. Acknowledgment and signature flows are live the moment a policy is published. Lane: Claude (module verified once schema exposed); HR (content).', 'manual', 'WATCH', 'publish → acknowledge → quiz works end to end', 'PENDING', null, null, null, true, 187),
 ('hrp.ceo_strip_dollars', '18 HR platform', 'The CEO company strip shows TG revenue, not dashes', 'ceo_company_kpi_strip returns dollar tiles as null (rendered —) because no certified revenue view exists in the OS yet; counts (2 licences, 1 location) are real. Fill from the Apex lane''s certified revenue view when it lands. Lane: Claude (function); GPT/Apex lane (the view).', 'manual', 'WATCH', 'revenue MTD / today from a certified view', 'PENDING', null, null, null, true, 188),
 ('owner.netlify_git_link', '18 HR platform', 'Owner: finish "Link to Git repository" for tg-hr in the Netlify UI so every push builds by itself', 'The site is linked by API (repo, branch claude/hr-platform, base app/hr, deploy key on GitHub) and builds when triggered; the GitHub webhook that makes pushes build automatically is only installed through the Netlify UI. Netlify › tg-hr › Site configuration › Build & deploy › Link repository. After merge, switch the production branch to main.', 'owner', 'OWNER', 'push → build', 'PENDING', null, 'https://app.netlify.com/projects/tg-hr/configuration/deploys', null, true, 189),
 ('hrp.os_proxy_live', '18 HR platform', '/hr on the OS domain serves the HR platform', 'netlify.toml on the branch proxies /hr/* to tg-hr; it goes live when PR #238 merges and the OS redeploys. Until then the HR platform is reached at tg-hr.netlify.app/hr/. Lane: owner (merge).', 'manual', 'WATCH', 'twisted-growers-enterprise-os.netlify.app/hr/ → login', 'PENDING', null, null, null, true, 190)
on conflict (check_key) do update set section = excluded.section, title = excluded.title, why = excluded.why, kind = excluded.kind, severity = excluded.severity,
  expected = excluded.expected, status = excluded.status, value = excluded.value, detail = excluded.detail, last_run_at = excluded.last_run_at, sort_order = excluded.sort_order, active = true;

-- hourly measurement for the PIN row rides on the scheduling runner
create or replace function public.f_deployment_checks_run_hr()
returns table (ran int, failed int, warned int)
language plpgsql security definer set search_path to 'public', 'hr' as $$
declare r int := 0; f int := 0; w int := 0; s text; n int; m int; k int;
begin
  begin
    select count(*) filter (where pin_hash = '!no-pin-set'), count(*) into n, m from hr.people where is_active;
    s := case when n = 0 then 'PASS' else 'FAIL' end;
    perform f_deployment_check_record('hr.set_employee_pins', s, n || ' of ' || m || ' active without a PIN',
      case when n = 0 then 'Every active person can sign in at the kiosk.' else 'HR sets PINs in OS onboarding (f_set_punch_pin) or HR › admin_reset_pin; they sync to hr.people by trigger.' end);
    r := r + 1; if s = 'FAIL' then f := f + 1; end if;
  exception when others then perform f_deployment_check_record('hr.set_employee_pins', 'FAIL', 'error', left(sqlerrm, 200)); r := r + 1; f := f + 1; end;

  begin
    select count(*) into k from hr.ai_providers where api_key_encrypted is not null;
    if k > 0 then
      perform f_deployment_check_record('hrp.ai_through_tg_gateway', 'FAIL', k || ' key(s) stored in hr.ai_providers', 'Owner ruling: HR AI uses the bots'' keys through TG''s gateway; hr.ai_providers must hold no key.');
      f := f + 1;
    end if;
    r := r + 1;
  exception when others then r := r + 1; end;

  return query select r, f, w;
end $$;
select cron.schedule('deployment-tracker-hr', '13 * * * *', 'select * from public.f_deployment_checks_run_hr();');
select * from public.f_deployment_checks_run_hr();
