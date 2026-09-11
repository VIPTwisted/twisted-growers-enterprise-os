# Preview safety prerequisite

This change is a build safeguard, not a working isolated preview environment.
Netlify deploy-preview and branch-deploy builds, unknown hosted contexts, and
explicit local preview/staging modes are blocked pending complete isolation.
Production and ordinary local builds keep the existing pinned database connection.
Ordinary local development must therefore not be treated as isolated.

A separately configured client alone is insufficient: direct function calls and
downloadable extension assets must also be isolated and tested. The guard has no
bypass switch. Enabling previews requires replacing it with complete isolation
checks in the same reviewed change that introduces the isolated environment.

The guard runs when Vite resolves configuration, before producing build output.
It does not change application components, CSS, navigation or page text.
Tests cover production compatibility, hosted contexts, local preview modes,
misleading environment overrides and incomplete connection changes.

The date-range test fixture also uses its intended local calendar day rather
than assuming a UTC timestamp belongs to that day in every timezone. It checks
that the following day remains excluded. Application behavior is unchanged.

Validation: 78 unit tests passed; the date-range suite passed in UTC, New York
and Seoul. Baseline and candidate production builds had identical non-HTML
assets, with HTML differing only in the build timestamp. A deploy-preview build
was refused as expected. The full local release gate run stopped at the database
check because its required read-only connection was unavailable; later gates
were not run. No deployment or recovery rehearsal is claimed.

Recovery: revert this build/test change through the normal release process.
Keep previews disabled if restoring an earlier build removes the guard. This
change performs no data writes or database migrations.

Operational inventories and recovery references are held separately in the
owner's private review evidence; they are not included in this public repository.
