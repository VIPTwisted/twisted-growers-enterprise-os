/* A NARROW, TEMPORARY GRANT ON A TRANSIENT TABLE, AND NOTHING ELSE.
   29 August 2026.

   WHY. The 2025 close is 441 KB of file content. Moving it through tool calls
   means retyping it, which risks a silent transcription error in a certified
   position — the one kind of error this house least tolerates. Streaming it
   straight from the file over the existing read-only connection removes the
   retyping entirely: the bytes go from the .xls to the database without passing
   through anything that could paraphrase them.

   WHAT IS GRANTED, EXACTLY. Insert on tmp_pit_2025_close. That table holds
   tab-separated lines and nothing else, it is not read by any view, report or
   page, and it is DROPPED by the migration that consumes it — which takes this
   grant with it. tg_desktop_reader gains no privilege on
   metrc_rpt_point_in_time or on any other object, and remains unable to write
   anything that a person will ever read as a fact.

   WHAT STILL GUARANTEES THE IMPORT. Staging is not importing. The real table is
   written by a separate migration that asserts the staged content against an
   md5 computed from the file BEFORE it was sent, asserts the row count, writes,
   re-derives the count, and drops this table — all in one transaction. A
   corrupted or partial stage fails that assertion and metrc_rpt_point_in_time
   is never touched. */
grant insert on table public.tmp_pit_2025_close to tg_desktop_reader;