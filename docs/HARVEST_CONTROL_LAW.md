# Harvest control law — 28 Aug 2026

Owner: schedules, dried weight, and policy are not optional. Ignored variance is a management failure.

## Systems of record
- Schedule / rooms / pull dates / contracted monthly dry min: TG policy (editable by owner/CFO/exec, never hardcoded).
- Plants, harvest events, wet weight, waste, packaged, tests: Metrc.
- Who was on the clock: TG roster / kiosk. Not Metrc.

Never blend a scheduled pound into a Metrc pound. Show both. Gap is the finding.

## Must detect the same day (SLA 4 hours to a named manager)
1. Harvest still open past the scheduled pull + owner limit (queue 4 already).
2. Dried / packaged weight vs that harvest's scheduled dry target — shortfall %.
3. Monthly contracted dry min vs Metrc packaged dry-equivalent MTD.
4. Wet recorded, dry never recorded (weight missing, not zero).
5. Moisture / residual outside owner band 70–77% (queue 1; band is the flag).
6. Never submitted for test / failed no disposition (queues 2–3).
7. Staff clock vs scheduled start when a harvest or pack-out was the day's work.

## Immediate attention
Finding row: who / what / when / Metrc id / scheduled vs actual / settle test / owner_role / sla_hours.
In-app banner on Cultivation home + Tower for severity >= 3.
alert_outbox for severity >= 3. Email when TG-08 delivery is live. Do not wait for a weekly meeting.

## What may not happen
- Scheduled weight printed as harvested weight.
- Empty or 0 dry read as "no harvest" when Metrc has a harvest id.
- Quiet close of a shortfall.
- Agent write-back to Metrc to "fix" a number.
- Fake pipeline_runs to look busy.

## Settle tests
A harvest finding closes only when Metrc weight is present AND a manager acknowledges the gap, or the schedule row is edited by a permitted role with a reason. Agents do not close by rewriting history.
