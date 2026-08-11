# GitHub Actions storage — what filled it, what was deleted, 11 August 2026

**Agent D. Owner authorised the deletion: "OUTDOOR MEDIA DO WHATEVER YOU HAVE TO
AND THEN UPDATE THE REPO SO I REMEMBER WHAT WE DID."**

## What triggered it

GitHub emailed on 9 Aug: *"You have used 100% of the Actions storage included for
the VIPTwisted account"* — 0.5 GB of 0.5 GB, resetting 1 September.

## What it was NOT

**Not this project.** `twisted-growers-enterprise-os` consumed **zero** Actions
storage across all eleven days of the usage report — not one row. Its CI workflow
uploads no artifacts and uses no cache. Checked before anything was blamed or
deleted, because the obvious suspect is the repo you happen to be standing in.

**Not the Netlify failures.** Netlify does not use GitHub Actions; it watches the
repo and builds on its own infrastructure. The 14 failed builds were gate
regressions, unrelated to this.

## What it actually was

One repository, `outdoor_runner_repo2_dnd`, held **89.8%** of the account's
Actions storage — and had done every single day since 1 August at an unvarying
**400.478 GB-hours/day**. Flat, not growing: a pile parked there, charged daily.

| repository | GB-hours (9 Aug) | share |
|---|---|---|
| **outdoor_runner_repo2_dnd** | **400.48** | **89.8%** |
| vip-enterprise-os | 45.27 | 10.1% |
| ddc-topg-platform | 0.45 | 0.1% |
| twisted-growers-enterprise-os | **0.00** | **0%** |

The repo itself is **115 KB of code, last pushed 20 May 2026** — dormant nearly
three months. All of the weight was artifacts:

- **661 artifacts**, every one named `blip-diagnostics-<run id>`
- **27 MB each, 16.69 GB total** — 33× the entire 0.5 GB account allowance
- Produced roughly hourly through 17–19 July by `.github/workflows/blip-sync.yml`
  ("BLIP Sync (Windows Runner)")

## What was done

1. **661 artifacts deleted** — 661 succeeded, 0 failed. 16.69 GB reclaimed.
   Verified afterwards: `total_count` = 0.
2. **727 workflow runs deleted** — 727 succeeded, 0 failed. Verified: 0 remaining.
3. **Artifact and log retention set to 30 days** (from GitHub's 90-day default) on
   all five repositories that appear in the usage report:
   outdoor_runner_repo2_dnd · twisted-growers-enterprise-os · vip-enterprise-os ·
   ceo-hq-dashboard · ddc-topg-platform.
   Confirmed by reading the setting back on each; all five report 30.

**The BLIP workflow needed no pausing** — GitHub had already set it to
`disabled_inactivity`, its automatic state after 60 days without repo activity.
It cannot fire again on its own. Owner's position: *"I won't resume build until I
have a customer or someone interested in that platform."*

## What this cost

**Nothing. $0.00.** Every line of the eleven-day usage report shows
`gross_amount` fully offset by `discount_amount`, net zero. The 100% alert was
about consuming the allowance, not about money already spent. Exposure had the
discount stopped: about **$0.13/day**, roughly **$4/month**.

## Still running, and NOT touched

Two scheduled jobs on other repositories are still firing daily. **Deliberately
left alone** — one is named like a backup, and disabling a backup because it
appears in a cost report is how you discover what it was for:

- `vip-enterprise-os` · `preservation-and-recovery.yml` — 5 to 72 min/day
- `ceo-hq-dashboard` · `satellite-sync.yml` — exactly 2 min every day, unbroken

**Owner decision needed** on whether either should stop.

## The lesson, and where it belongs

This is the **third** thing in three days that failed quietly with nothing
watching it: 14 Netlify builds, edge functions drifting from production, and a
billing meter reaching 100%. In every case the signal existed and no one was
looking at it.

The first two now have owners and sentinels. **This one has neither, and cannot
easily get one** — it lives outside the repository, so no build gate can see it.
The honest options are a dashboard tile reading the GitHub billing API, or
accepting that the monthly email is the alarm. Recorded here rather than left as
a resolved incident, because "we cleaned it up" is not the same as "it cannot
happen again".

**Also worth knowing:** this project's CI burned **103 minutes across five days**,
most of it on **failing** builds — 45 min on 8 Aug, 30 min on 9 Aug. A failed
build costs the same minutes as a passing one. It was the largest single minute
consumer on the account that week.
