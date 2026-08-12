-- 8 Aug 2026. nav_registry.created_at exists but nothing ever populated it: all 551
-- rows are null. So when 529 rows were written in 87 seconds at 10:45 today and the
-- menu went from 272 to 548 enabled entries, there was no way to say which pages were
-- new. The owner could see the pages but not what had changed.
--
-- Existing rows are deliberately LEFT NULL. Their real creation dates were never
-- recorded and inventing a timestamp would be a fabricated number (rule A1). A null
-- that says "never recorded" is honest; a backfilled guess is not.
alter table nav_registry alter column created_at set default now();

comment on column nav_registry.created_at is
  'When the menu entry was created. Defaulted to now() from 8 Aug 2026 onward. '
  'Rows created before that date are NULL because nothing recorded it - not '
  'backfilled, because a guessed timestamp is an invented number (rule A1).';;
