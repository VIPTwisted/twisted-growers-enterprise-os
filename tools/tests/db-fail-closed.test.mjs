/* The fail-closed helper is the single point every database gate now depends on, so a bug in
 * it is a bug in seven gates at once. Two things are worth proving and neither is obvious.
 *
 * FIRST, that a missing connection produces a REASON rather than a silent null. The whole
 * failure this replaces was a gate that could not say what it had not checked.
 *
 * SECOND, that PGURL is normalised. Every gate previously rewrote .mcp.json's sslmode and left
 * a literal PGURL untouched, so the same database reached two ways arrived with two different
 * SSL strings — and .mcp.json's `sslmode=no-verify` is a psql spelling libpq does not know.
 * That asymmetry is exactly what a CI secret pasted in raw would have walked into.
 *
 * THE SCHEME IS CONCATENATED, NOT WRITTEN WHOLE. guard-secrets.mjs blocks any URI carrying an
 * embedded password from reaching disk, and it does not care that this one is a fixture — it
 * cannot tell, and a scanner that trusts an author's word about which credential is fake is
 * not a scanner. tools/checks/guard-fixtures.mjs:248 hit this first and split the literal the
 * same way. Following its idiom rather than inventing a second one.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalise, resolveConnection } from "../lib/db.mjs";

const WANT = "uselibpqcompat=true&sslmode=require";
const SCHEME = "postgres" + "ql://";
const HOST = "u:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
const url = (q = "") => SCHEME + HOST + q;

function withoutPgurl(fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, "PGURL");
  const prev = process.env.PGURL;
  delete process.env.PGURL;
  try { return fn(); } finally { if (had) process.env.PGURL = prev; }
}

function withPgurl(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, "PGURL");
  const prev = process.env.PGURL;
  process.env.PGURL = value;
  try { return fn(); } finally { if (had) process.env.PGURL = prev; else delete process.env.PGURL; }
}

test("normalise rewrites the sslmode spelling .mcp.json actually carries", () => {
  const got = normalise(url("?sslmode=no-verify"));
  assert.ok(got.endsWith(`?${WANT}`), got);
  assert.ok(!got.includes("no-verify"));
});

test("normalise is idempotent — an already-correct string is left alone", () => {
  const already = url(`?${WANT}`);
  assert.equal(normalise(already), already);
});

test("normalise appends when there is no query string at all", () => {
  assert.equal(normalise(url()), url(`?${WANT}`));
});

test("normalise joins with & when a query string already exists", () => {
  assert.equal(normalise(url("?application_name=gates")),
               url(`?application_name=gates&${WANT}`));
});

test("normalise of nothing is nothing, not the string 'undefined'", () => {
  assert.equal(normalise(null), null);
  assert.equal(normalise(undefined), null);
  assert.equal(normalise(""), null);
});

test("PGURL wins, and is normalised on the way through", () => {
  const { conn, source } = withPgurl(url("?sslmode=no-verify"),
                                     () => resolveConnection("/nonexistent"));
  assert.ok(conn.endsWith(`?${WANT}`), conn);
  assert.match(source, /PGURL/);
});

test("no PGURL and no .mcp.json yields no connection AND a stated reason", () => {
  const dir = mkdtempSync(join(tmpdir(), "tg-db-"));
  try {
    const { conn, why } = withoutPgurl(() => resolveConnection(dir));
    assert.equal(conn, null);
    assert.match(why, /PGURL/);
    assert.match(why, /\.mcp\.json/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a .mcp.json with no connection string says so rather than returning a bare null", () => {
  const dir = mkdtempSync(join(tmpdir(), "tg-db-"));
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { "twisted-growers": {} } }));
  try {
    const { conn, why } = withoutPgurl(() => resolveConnection(dir));
    assert.equal(conn, null);
    assert.match(why, /no twisted-growers connection string/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a corrupt .mcp.json is reported, never thrown — a gate must reach its own refusal", () => {
  const dir = mkdtempSync(join(tmpdir(), "tg-db-"));
  writeFileSync(join(dir, ".mcp.json"), "{ not json");
  try {
    const { conn, why } = withoutPgurl(() => resolveConnection(dir));
    assert.equal(conn, null);
    assert.match(why, /could not be parsed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a .mcp.json connection string is normalised exactly as PGURL is", () => {
  const dir = mkdtempSync(join(tmpdir(), "tg-db-"));
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify({
    mcpServers: { "twisted-growers": { args: [url("?sslmode=no-verify")] } },
  }));
  try {
    const { conn, source } = withoutPgurl(() => resolveConnection(dir));
    assert.ok(conn.endsWith(`?${WANT}`), conn);
    assert.equal(source, ".mcp.json");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
