import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Executed only in an isolated, disposable PostgreSQL database.
export async function anonymousAccessFixture(query) {
  const names = ['apex_stated_invoices_20260830', 'apex_stated_sales_20260830', 'population_snapshot_receipt', 'v_forensic_room_census', 'v_s2s_rooms'];
  await query('create role anon; create role authenticated; create role service_role;');
  for (const name of names) {
    await query(`create table public.${name}(id integer); grant select on public.${name} to anon,authenticated,service_role;`);
  }
  const inspect = () => query(`select c.relname,
    has_table_privilege('anon',c.oid,'SELECT') as anon_read,
    has_table_privilege('authenticated',c.oid,'SELECT') as signed_in_read,
    has_table_privilege('service_role',c.oid,'SELECT') as service_read
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (${names.map(n => `'${n}'`).join(',')}) order by c.relname`);
  const before = await inspect();
  assert.equal(before.rows.length, names.length);
  assert.ok(before.rows.every(row => row.anon_read));
  const sql = readFileSync(new URL('../../supabase/migrations/20260912155139_gpt_close_anonymous_relation_access.sql', import.meta.url), 'utf8');
  await query('begin');
  await query(sql);
  await query('commit');
  const after = await inspect();
  assert.equal(after.rows.length, names.length);
  assert.ok(after.rows.every(row => !row.anon_read && row.signed_in_read && row.service_read));
  await query('set role anon');
  await assert.rejects(query(`select * from public.${names[0]}`), /permission denied/i);
  await query('reset role');
  await query('set role authenticated');
  assert.deepEqual((await query(`select * from public.${names[0]}`)).rows, []);
  await query('reset role');
  // Reapplication is safe; it cannot restore anonymous privileges.
  await query('begin'); await query(sql); await query('commit');
  assert.ok((await inspect()).rows.every(row => !row.anon_read));
}
