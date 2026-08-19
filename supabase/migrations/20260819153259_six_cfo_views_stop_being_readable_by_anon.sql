/* ═══════════════════════════════════════════════════════════════════════════
   THE PLATFORM'S OWN HANDOFF SAID "SECURITY: FAILING". IT WAS RIGHT TO.

   Six views carried SELECT to `anon`: five of them CFO spend surfaces, plus
   v_goal_status. None was on security_anon_allowlist, so nothing in the
   platform knew they existed.

   HOW BAD IT ACTUALLY WAS, tested rather than assumed: all six are
   security_invoker, and SET ROLE anon on the chain already fails at
   v_monthly_conversion_truth and v_third_party_forensic. ZERO ROWS LEAK. These
   are dead grants, not an open door, and calling them a breach would put two
   more entries in a critical queue that is already 179 deep and unread.

   They are revoked anyway, for two reasons. A grant nobody declared is a grant
   nobody is watching, and it stays dead only for as long as the view chain
   underneath it happens to deny — one future view rewrite turns a dead grant
   into a live one with no alarm in between. And the nightly self-check counts
   grants, so while these existed HANDOFF.md opened with "SECURITY: FAILING"
   every morning, which is how a real failure gets read as background noise.

   PUBLIC is revoked alongside anon: revoking from anon alone is a no-op while
   PUBLIC holds the same grant, and that exact mistake has been made here before.
   ═══════════════════════════════════════════════════════════════════════════ */
revoke select on public.v_cfo_spend_ageing       from anon, public;
revoke select on public.v_cfo_spend_by_supplier  from anon, public;
revoke select on public.v_cfo_spend_by_tag       from anon, public;
revoke select on public.v_cfo_spend_by_year      from anon, public;
revoke select on public.v_cfo_spend_coverage     from anon, public;
revoke select on public.v_goal_status            from anon, public;

/* v_goal_status is now the registered object behind the Goals & Scorecards menu
   entry, wired earlier today. authenticated must keep its read or the page that
   was just given a source loses it again. Stated explicitly so the next person
   revoking grants here knows this one is load-bearing. */
grant select on public.v_goal_status to authenticated;