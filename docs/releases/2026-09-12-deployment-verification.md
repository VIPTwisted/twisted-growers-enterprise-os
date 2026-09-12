# Deployment verification repair

The existing deployment watcher could return PASS after a failed Git fetch by comparing the live site to a cached origin/main reference. That does not establish which commit is currently required. The repaired watcher returns UNVERIFIED and a nonzero exit code when it cannot obtain the current reference. It never substitutes local HEAD.

Git lookup and the HTTPS response, including its body, have bounded timeouts. Redirects are refused. The live HTML must carry exactly one matching commit stamp. The same response must retain the existing CSP framing, base URI and object protections, frame header, nosniff header and enabled HSTS. More restrictive framing and base policies remain valid. No browser policy or application layout is changed.

The existing deploy-watch workflow runs this verification after pushes, every thirty minutes and on manual dispatch. This is a post-deployment watcher, not a pre-deployment gate: it cannot stop an already published release. A failure does not automatically roll back the site. Existing workflow notification settings determine notification delivery; this change adds no person-directed messages.

## Verification

Eighteen executable tests cover positive and negative cases, including a failed origin lookup, wrong or duplicate stamps, missing headers, weakened duplicate CSP directives, HTTP and network failures and a stalled response body. Existing all-checks-wired and secret-scan checks pass. At 2026-09-12 15:36:41 UTC the repaired watcher passed against live commit dd55e7b97c001a0a1cc7b223caa721994421a996. That verifies the existing release, not deployment of this repair.

## Check design

The comparison can match: a fresh Git reference and the unique live build stamp identify the same full commit. Legitimate policy shapes include SAMEORIGIN or DENY and self or none where appropriate. There is no age-based data verdict; the observation records its check time. Wrong stamps and removed protections demonstrably fail. Failed retrieval is explicitly UNVERIFIED, so nothing checked cannot become PASS.

## Scope remaining

This repair covers web release identity and the listed response protections only. It does not certify database contents, access-control coverage, source freshness, navigation, offline operation or external integration workflows. No credentials were rotated and no database records were changed.
