/* WHAT THE ASSISTANT SHOULD ALREADY KNOW BEFORE IT ANSWERS.

   One call, returning the three things that turn a stateless answering machine
   into something that learns:

     corrections  what a human has said is WRONG, approved by an owner. These
                  outrank everything, including the assistant's own training,
                  because a person who watched it get something wrong is better
                  evidence than a paragraph written last week.
     facts        what has been learned and confirmed, each with the query behind
                  it so it can be re-derived rather than believed.
     recent       what THIS person asked in the last day, so a follow-up does not
                  start from nothing and a repeated question is recognised.

   Deliberately bounded. Memory that grows without limit becomes the context
   problem it was meant to solve - by Thursday every question would carry a
   month of history and the answers would slow to a crawl. Corrections are the
   only unbounded set, and they are unbounded ON PURPOSE: an owner approved each
   one individually, and silently dropping the oldest would mean the assistant
   starts repeating a mistake somebody already took the trouble to correct. */
create or replace function f_brain_memory_for(p_user uuid default auth.uid())
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'corrections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'about', about, 'was_wrong', was_wrong,
               'what_is_true', what_is_true, 'evidence', evidence)
               order by decided_at desc nulls last)
      from brain_correction where status = 'approved'), '[]'::jsonb),

    'facts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fact', fact, 'because', because, 'query', source_sql)
               order by learned_at desc)
      from (select * from brain_fact where retired_at is null
            order by learned_at desc limit 40) f), '[]'::jsonb),

    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'asked', question, 'answered', left(coalesce(answer,''), 400))
               order by at desc)
      from (select * from brain_conversation
            where user_id = p_user and at > now() - interval '1 day'
            order by at desc limit 6) r), '[]'::jsonb),

    'how_to_use', 'CORRECTIONS OUTRANK YOUR TRAINING. A person watched you get that wrong; a paragraph written last week did not. If a correction contradicts what you were about to say, the correction wins and you say so plainly. FACTS carry the query that produced them - re-derive rather than trust when the number matters. RECENT is this person''s last day, so a follow-up continues rather than restarting.'
  );
$$;

comment on function f_brain_memory_for is
  'Everything the assistant should know before answering: approved corrections, confirmed facts, and this person''s recent questions. Bounded except for corrections, which are unbounded deliberately - an owner approved each one, and dropping the oldest would mean repeating a mistake somebody already corrected.';

revoke all on function f_brain_memory_for(uuid) from public;
grant execute on function f_brain_memory_for(uuid) to authenticated;

/* Raising a correction is one call, so it can be done from a thumbs-down
   without a form. It lands as PROPOSED and changes nothing until an owner
   agrees - the assistant must not be re-trainable by whoever is loudest. */
create or replace function f_raise_correction(
  p_about text, p_was_wrong text, p_what_is_true text, p_evidence text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if coalesce(btrim(p_what_is_true), '') = '' then
    return jsonb_build_object('ok', false,
      'message', 'A correction needs to say what IS true, not only that something was wrong. "That is wrong" trains nothing.');
  end if;
  insert into brain_correction (about, was_wrong, what_is_true, evidence)
  values (p_about, p_was_wrong, p_what_is_true, p_evidence)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id,
    'message', 'Recorded. It changes nothing until an owner approves it - then every assistant carries it, everywhere, permanently.');
end $$;

revoke all on function f_raise_correction(text, text, text, text) from public;
grant execute on function f_raise_correction(text, text, text, text) to authenticated;

select f_brain_memory_for() -> 'how_to_use' as wired;;
