-- Owner, 11 Aug 2026: "WE HAVE TO GET ALL AGENTS BACK IN THEIR LANES THEY ARE
-- DRIFTING INTO ONE ANOTHERS LANES."
--
-- THE PARSE FOUND THE CAUSE, and it is in a document I wrote myself.
-- brain/AGENT_ROSTER.md says "The four live lanes are A, B, C and D", and its own
-- gap list says "the lanes exist on paper and in the hooks, not in the record."
--
-- There are now NINE agents. E, F, F-fork, G and H have no lane defined anywhere.
-- They are not drifting out of their lanes - THEY HAVE NEVER HAD ONE. Nobody can
-- stay inside a boundary that was never drawn.
--
-- Three naming systems also exist with no mapping between them: the charter files
-- under .claude, the runtime watchers in agent_registry, and the letters A to H
-- that the owner actually uses. A roster kept only in markdown cannot be enforced
-- by anything, which is what the roster's own gap list asked to fix.

create table if not exists public.agent_lane (
  agent            text primary key,
  display_name     text not null,
  charter_file     text,
  owns_paths       text[] not null default '{}',
  owns_tables      text[] not null default '{}',
  may_review_all   boolean not null default false,
  notes            text,
  added_on         date not null default current_date
);

comment on table public.agent_lane is
  'The lane each session agent owns, as DATA rather than prose, so a guard can enforce it. A lane kept only in markdown is a lane nothing can check - which is how E, F, G and H ended up with none at all.';

insert into public.agent_lane (agent, display_name, charter_file, owns_paths, owns_tables, may_review_all, notes) values
 ('A','Metrc & Document Importer','tg01-metrc-compliance.md',
  array['app/supabase/functions/metrc-%','app/supabase/functions/parse-documents/%','app/supabase/functions/coa-extract/%','app/supabase/functions/manifest-parse/%','app/supabase/functions/report-ingest/%'],
  array['metrc_%','import_%','manifest_%'], false,
  'Metrc report import and document ingestion. Verified against Metrc own exports, never against our copy.'),
 ('B','Twisted Growers enterprise planner',null,
  array['app/web/src/App.jsx','app/web/src/lib/%','supabase/%'],
  array[]::text[], false,
  'The platform build. The largest lane and the most collided-with: App.jsx is 9,700 lines and four agents edited it in two days.'),
 ('C','Code Review BOSS',null,
  array[]::text[], array[]::text[], true,
  'Reviews the diff before it ships. OWNS NO FILES BY DESIGN - a reviewer who also builds cannot review their own work. Still unanswered from the roster: is C the Watchdog, and if not, who owns grants and RLS?'),
 ('D','Brains, Loop & Agents','tg09-brain-loops.md',
  array['.claude/agents/%','.claude/skills/%','brain/%','tools/checks/%','tools/lib/%','bridge/%','app/web/src/budz.jsx','app/supabase/functions/budz-chat/%','app/supabase/functions/bridge-queue/%'],
  array['agent_%','sentinel_%','duplicate_key','brain_%','ai_%'], false,
  'Brains, loops, agents, guards, knowledge recovery. CEO of the fleet per the roster - which is exactly why D must never review itself. The Inspector does.'),
 ('E','UV/UI design',null,
  array['app/web/src/styles%','app/web/src/patches.css'],
  array[]::text[], false,
  'NEW LANE 11 Aug 2026 - had none before. Colour and mode are OWNER-LOCKED; layout, spacing and geometry are free. theme-lock is the boundary.'),
 ('F','Figma UX/UI page designer','tg10-design.md',
  array['app/web/src/hrdash.jsx','app/web/src/roster.jsx','app/web/src/empfile.jsx','app/web/src/schedbuild.jsx','app/web/src/timesheets.jsx','app/web/src/hrqueue.jsx','app/web/src/kiosk.jsx','app/web/src/myweek.jsx','app/web/src/terminals.jsx'],
  array[]::text[], false,
  'NEW LANE 11 Aug 2026. Page-level screens as separate files, the HR pattern. Share primitives, never layouts. A FORK of this agent also exists - two sessions in one lane is itself a collision risk.'),
 ('G','Apex Sales',null,
  array['app/web/src/sales/%','app/supabase/functions/apex-sync/%','docs/apex/%','docs/briefs/%'],
  array['apex_%','sales_%','sync_item'], false,
  'NEW LANE 11 Aug 2026. Briefed in docs/briefs. Apex is the sales source of record; Metrc stays read-only forever.'),
 ('H','COA, strain & product library',null,
  array['tools/coa_%'],
  array['coa_%','cultivar%','strain%','product_famil%','sku%'], false,
  'NEW LANE 11 Aug 2026. Identity is the TAG, never a name string - f_strain_by_tag returning BLEND for a multi-harvest package is correct, not a gap.')
on conflict (agent) do update
  set display_name = excluded.display_name, owns_paths = excluded.owns_paths,
      owns_tables = excluded.owns_tables, notes = excluded.notes;

alter table public.agent_lane enable row level security;
drop policy if exists agent_lane_read on public.agent_lane;
create policy agent_lane_read on public.agent_lane for select to authenticated using (true);
grant select on public.agent_lane to tg_desktop_reader;

-- WHO OWNS A PATH. Returns EVERY claimant, most specific first, because an overlap
-- is a finding in itself - App.jsx is claimed by B and has been edited by four.
create or replace function public.f_lane_for_path(p text)
returns table (agent text, display_name text, pattern text)
language sql stable as $fn$
  select l.agent, l.display_name, pat
  from public.agent_lane l, unnest(l.owns_paths) pat
  where p like pat
  order by length(pat) desc
$fn$;

comment on function public.f_lane_for_path(text) is
  'Which agent owns this file. Returns ALL claimants, most specific first. An overlap is a finding, not something to resolve silently.';;
