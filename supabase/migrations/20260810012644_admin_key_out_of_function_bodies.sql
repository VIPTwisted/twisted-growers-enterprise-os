-- Rule G1 / E6. TWO LIVE FUNCTIONS HARDCODED THE EDGE-FUNCTION ADMIN KEY in their bodies:
-- tg_call_function and tg_metrc_fire. Both already read the anon key properly, from
-- integration_secrets, on the line above — and then pasted the admin key as a literal beside it.
--
-- Because a function body is captured by pg_get_functiondef, every schema dump carries the
-- key, and every dump is committed. That is how it reached the repository twice.
--
-- THE VALUE IS NEVER TYPED IN THIS MIGRATION. It is read out of the existing function body and
-- moved into integration_secrets, so this file — which will itself be committed — carries no
-- credential. Writing it here to fix it being written elsewhere would be self-defeating.
--
-- THIS IS NOT A ROTATION. The owner has deferred all credential rotation to onboarding and that
-- stands. This only stops the key being copied into every future dump.
do $$
declare v_key text; v_def text; v_fn text;
begin
  select substring(pg_get_functiondef(p.oid) from 'tg-seed-[A-Za-z0-9]+-[0-9]{4}')
    into v_key
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'tg_call_function';

  if v_key is null or length(v_key) < 8 then
    raise exception 'could not recover the admin key from tg_call_function - aborting rather than guessing';
  end if;

  insert into integration_secrets (name, value)
  values ('TG_ADMIN_KEY', v_key)
  on conflict (name) do update set value = excluded.value;

  /* Rewrite both bodies from their live definitions, so nothing else can drift. The literal
     becomes a lookup against the same table, in the same style as the anon key beside it. */
  foreach v_fn in array array['tg_call_function','tg_metrc_fire'] loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_fn;

    if v_def is null then raise exception 'function % not found', v_fn; end if;

    v_def := replace(v_def,
      '''' || v_key || '''',
      '(select value from integration_secrets where name = ''TG_ADMIN_KEY'')');

    if v_def ~ ('tg-seed-') then
      raise exception 'a literal key survived the rewrite in % - aborting', v_fn;
    end if;

    execute v_def;
  end loop;
end $$;;
