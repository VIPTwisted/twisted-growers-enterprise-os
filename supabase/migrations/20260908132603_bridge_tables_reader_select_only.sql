-- The desktop reader must be able to SEE the bridge tables. SELECT only.
--
-- WHY: 457 public tables carry tg_reader_select_only for tg_desktop_reader. The three bridge
-- tables added on 7 Sep did not, so the read-only role got "permission denied" on all three.
-- That is the exact regression recorded before: when the reader loses sight of a table, a gate
-- that reads through it does not fail loudly - it concludes the rows do not exist. A blind
-- reader reports zero, and zero looks like a fact.
--
-- SELECT ONLY, and the grant matches. The reader must never write; that is the whole point of
-- the role, and it is why the loader had to go through a privileged connection instead.
grant select on public.bridge_manifest         to tg_desktop_reader;
grant select on public.bridge_manifest_package to tg_desktop_reader;
grant select on public.bridge_manual_link      to tg_desktop_reader;

drop policy if exists tg_reader_select_only on public.bridge_manifest;
create policy tg_reader_select_only on public.bridge_manifest
  for select to tg_desktop_reader using (true);

drop policy if exists tg_reader_select_only on public.bridge_manifest_package;
create policy tg_reader_select_only on public.bridge_manifest_package
  for select to tg_desktop_reader using (true);

drop policy if exists tg_reader_select_only on public.bridge_manual_link;
create policy tg_reader_select_only on public.bridge_manual_link
  for select to tg_desktop_reader using (true);
