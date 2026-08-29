# Branch protection for `main`

Every rule below was earned on 29 August 2026. Each one names the incident that
bought it, because a rule with no scar attached gets relaxed by whoever finds it
inconvenient.

---

## The exact Settings recipe

**Settings → Branches → Add branch protection rule**

| Field | Value |
|---|---|
| Branch name pattern | `main` |
| **Require a pull request before merging** | ✅ on |
| ↳ Required approvals | `1` |
| ↳ Dismiss stale approvals when new commits are pushed | ✅ on |
| ↳ Require review from Code Owners | ✅ on (`.github/CODEOWNERS` exists) |
| **Require status checks to pass before merging** | ✅ on |
| ↳ Require branches to be up to date before merging | ✅ on |
| ↳ **Required check** | **`gates`** |
| **Require conversation resolution before merging** | ✅ on |
| **Allow force pushes** | ❌ **off** |
| **Allow deletions** | ❌ **off** |
| **Do not allow bypassing the above settings** | ✅ **on** — admins included |

### The required check name is `gates`, lower case

Not `Gates`. `Gates` is the **workflow** name in `.github/workflows/ci.yml` line 1;
`gates` is the **job** id on line 22, and the job id is what GitHub publishes as the
check. Confirmed by reading a real run rather than guessing:

```
gh run view <id> --json jobs --jq '.jobs[].name'  ->  gates
```

Type `Gates` into the required-checks box and protection silently matches nothing.
The box goes green, the rule does nothing, and you find out on the day it mattered.

### `deploy-watch` is deliberately NOT required

It publishes the job `is-the-live-site-running-what-we-pushed`, and it fails when
Netlify is *behind* — a condition a PR author cannot fix by editing the PR. Making
it required would block every merge on someone else's deploy. It stays a loud
signal, not a gate. **P35 still applies: `deploy-watch` red is a P0.**

---

## Ingest must never open a PR

`ingest/metrc-aug26-drop` carries **67 staged migrations, ~362,000 rows, ~145 MB**
of `INSERT` statements generated from the Metrc export drop. It exists so the data
is reviewable and reproducible. **It is not a candidate for `main`.**

* Never open a PR from `ingest/*`.
* Never click **Compare & pull request** on the banner GitHub shows after a push.
* Never merge it "to keep branches tidy".

Merging it would put a six-figure row count of staged data into the migration tree
in one commit, move the money-grain digest by an amount nobody can review line by
line, and place `stg_*` tables into production the next time migrations are applied.
The correct end state is a reviewed load path, not a merge.

**Ingest is verified off production by counting, not by memory:**

```sql
select count(*) from information_schema.tables
 where table_schema = 'public' and table_name like 'stg\_%';   -- must be 0
```

---

## Force push is banned on `main`

Not a style preference. On 29 Aug a hygiene branch was **deleted and recreated from
main by another agent mid-review**; both commits survived only because they were
still loose objects and could be recovered from `git reflog`. On a protected `main`
that recovery is not available to everyone, and the window in which nobody notices is
long.

Branches other than `main` may be force-pushed, and **`--force-with-lease` is the only
acceptable form** — it refuses when someone else has pushed since your last fetch,
which is exactly the collision that happened.

---

## Admin bypass is off

"Do not allow bypassing the above settings" must be **on**, which means the rules
apply to administrators too.

The whole point of the gates is that they catch what a confident person misses.
On 29 August alone, on work that all looked finished:

* `schema-baseline` caught **523 vs 524 views** — one object live and nowhere else.
* `money-grain` caught the tree digest moving on **four** separate occasions.
* `Forbidden SQL patterns` caught **three real `grant select … to anon`** statements
  in a migration that had already been reviewed and merged into a hygiene PR.
* `migration-drift` caught **six** migrations running in production with no file.

Every one of those was found by a machine after a person had said "this is ready".
An admin bypass is a button that turns all of it off for the person most likely to
be in a hurry.

---

## What protection does NOT cover

Stated so nobody mistakes a green tick for a guarantee:

* **`gates` runs the repo's checks, not production.** `schema-baseline` and
  `migration-drift` compare against the live database, but nothing here stops a
  migration being applied straight to production outside a PR. That is a discipline,
  not a control.
* **A file can match its pin and still be the wrong SQL.** On 29 Aug two migrations
  were filed under the right stamped versions with a valid pin and green gates, and
  the content was still the pre-adaptation draft rather than what production ran.
  Only comparing against `schema_migrations.statements` found it.
* **`deploy-watch` is not required**, so main can be green while the live site is
  serving older software.
