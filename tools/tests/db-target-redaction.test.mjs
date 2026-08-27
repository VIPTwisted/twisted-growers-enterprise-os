/* describeTarget puts the connection TARGET into a build log so a malformed secret is
 * self-evident. That makes it one line away from putting the CREDENTIAL into a build log
 * instead, in a place thousands of runs keep forever and only rotation can undo.
 *
 * So the redaction is tested, not assumed. The password used here is a distinctive literal and
 * every assertion checks it is absent from the output — a test that would fail loudly the day
 * somebody "simplifies" describeTarget into a substring of the URL.
 *
 * The URI scheme is concatenated for the same reason as db-fail-closed.test.mjs:
 * guard-secrets.mjs blocks any password-bearing URI from reaching disk and cannot tell a
 * fixture from a live credential. See tools/checks/guard-fixtures.mjs:248.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { describeTarget } from "../lib/db.mjs";

const SCHEME = "postgres" + "ql://";
const PW = "hunter2SECREThunter2";
const USER = "tg_desktop_reader.fxetuqjryttnypgepsru";
const HOST = "aws-0-us-east-1.pooler.supabase.com:5432";

test("the target names host, port and database", () => {
  const got = describeTarget(`${SCHEME}${USER}:${PW}@${HOST}/postgres?sslmode=require`);
  assert.equal(got, "aws-0-us-east-1.pooler.supabase.com:5432/postgres");
});

test("the password never appears in the description", () => {
  const got = describeTarget(`${SCHEME}${USER}:${PW}@${HOST}/postgres`);
  assert.ok(!got.includes(PW), `password leaked into: ${got}`);
  assert.ok(!got.includes("hunter2"), `password fragment leaked into: ${got}`);
});

test("the username never appears either — it identifies the role that holds the password", () => {
  const got = describeTarget(`${SCHEME}${USER}:${PW}@${HOST}/postgres`);
  assert.ok(!got.includes("tg_desktop_reader"), `username leaked into: ${got}`);
});

test("a string truncated inside its own hostname is visibly wrong", () => {
  /* The real 27 Aug 2026 failure: the secret was cut inside "supabase", DNS was asked for a
     host called "base", and the refusal named only the variable. This is what makes it
     obvious at a glance instead of reading like a DNS outage. */
  const got = describeTarget(`${SCHEME}${USER}:${PW}@base:5432/postgres`);
  assert.equal(got, "base:5432/postgres");
});

test("an unparseable string says so rather than throwing inside a refusal", () => {
  assert.match(describeTarget("not a url at all"), /not a parseable URL/);
  assert.match(describeTarget(""), /not a parseable URL/);
});

test("a missing port and database are named as missing, not silently blank", () => {
  const got = describeTarget(`${SCHEME}${USER}:${PW}@somehost`);
  assert.match(got, /no port/);
  assert.match(got, /no database/);
  assert.ok(!got.includes(PW));
});
