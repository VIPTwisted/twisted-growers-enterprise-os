import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { permissionMatrixFixture } from './permission-matrix.fixture.mjs';

test('permission saves are authorized, atomic and reject stale revisions', async () => {
  const url = new URL(process.env.MONEY_TEST_PGURL);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Fixtures require isolated local PostgreSQL');
  const admin = new pg.Client({connectionString:url.href}); await admin.connect();
  const name = `permission_fixture_${process.pid}`;
  await admin.query(`create database ${name}`);
  const fixtureUrl = new URL(url); fixtureUrl.pathname=`/${name}`;
  const db = new pg.Client({connectionString:fixtureUrl.href});
  try {
    await db.connect();
    await permissionMatrixFixture(async sql => {const result=await db.query(sql); return Array.isArray(result)?result.at(-1):result;});
  } finally {
    await db.end(); await admin.query(`drop database ${name}`);
    await admin.query('drop role if exists anon,authenticated'); await admin.end();
  }
});
