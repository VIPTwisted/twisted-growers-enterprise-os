import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { anonymousAccessFixture } from './anonymous-access.fixture.mjs';

test('anonymous relation access is removed without changing signed-in reads', async () => {
  const url = new URL(process.env.MONEY_TEST_PGURL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Security fixtures require isolated local PostgreSQL');
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  const name = `security_fixture_${process.pid}`;
  await admin.query(`create database ${name}`);
  const fixtureUrl = new URL(url); fixtureUrl.pathname = `/${name}`;
  const db = new pg.Client({ connectionString: fixtureUrl.href });
  try {
    await db.connect();
    await anonymousAccessFixture(async sql => {
      const result = await db.query(sql);
      return Array.isArray(result) ? result.at(-1) : result;
    });
  } finally {
    await db.end();
    await admin.query(`drop database ${name}`);
    // These test roles are created only in the disposable CI cluster.
    await admin.query('drop role if exists anon, authenticated, service_role');
    await admin.end();
  }
});
