-- The generator is read-only and returns markdown. tg_desktop_reader is the read-only
-- desktop role; app_secrets is denied to it and it holds no write privilege anywhere.
-- Named role only. NOT public, NOT anon - the 7 Aug default-privileges revoke that made
-- this necessary is doing its job and must stay.
grant execute on function public.tg_handoff_state_md() to tg_desktop_reader;
grant execute on function public.f_actor() to tg_desktop_reader;;
