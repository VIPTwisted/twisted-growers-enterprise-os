---
name: brief
description: The owner's operating picture — what needs your decision, what moved, what is overdue, in dollars. Use for a Monday review, a "where are we" question, or before any session where the owner must prioritise. Distinct from /pulse, which measures the platform; this one is about the business and the decisions.
---

# Brief — the operating picture

One page, plain English, decisions first. The owner's stated preference is
binding: **a recommendation, not a menu**; when only he can decide, **one
clear question with the consequences of each answer**.

## Assemble (measure, never quote a stale document)
1. **Decisions waiting on the owner** — `brain/CONTRADICTIONS.md`, plus
   `open_questions` (unanswered), plus anything in `finding_state` needing a
   ruling. Rank by what settling each one unlocks, in dollars or unblocked
   work.
2. **Money at risk** — open `watchdog_findings` with dollars/pounds, criticals
   first, each with its arithmetic. Note anything that aged since last brief.
3. **What moved** — diff against the previous brief and `brain/hot.md`:
   resolved findings, new criticals, figures that changed materially.
4. **Overdue and blocked** — `alert_outbox` reminders still unresolved,
   `metrc_corrections` open, `golive_items` open count, cron jobs failing,
   `ddl_guard_log` rows unresolved.
5. **Compliance clock** — untested material, material out at the laboratory
   past the turnaround limit, harvests past the open limit. These carry legal
   exposure, not just cost.

## Report
- **Lead with the decisions** — numbered, each one line, each with the
  consequence of answering it and the cost of not.
- **Then money at risk**, biggest first, with the arithmetic in words.
- **Then what moved since last time**, including anything that got worse.
- **Then blocked/overdue**, with who is accountable.
- Keep it under one screen. Detail lives in the brain; link, do not paste.
- If nothing changed in a section, say so in one line rather than padding.

## After
Write anything newly settled to `brain/DECISIONS.md`, anything newly learned
to `brain/LESSONS.md`, and refresh `brain/hot.md` if the pulse is stale. A
brief that does not update the brain has to be rebuilt from scratch next week.
