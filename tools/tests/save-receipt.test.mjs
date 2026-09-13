import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requireSavedRow, createSaveQueue, upsertConfirmed } from '../../app/web/src/lib/save-receipt.js';

test('matching returned identity and values confirm a save', () => {
  const row = { user_id: 'fixture-user', enabled: false, width: 250, label: null };
  assert.equal(requireSavedRow({ data: row, error: null }, row), row);
});
test('HTTP success without a returned row cannot confirm a save', () => {
  for (const data of [null, undefined, [], [{ id: 1 }], 'saved', 1]) {
    assert.throws(() => requireSavedRow({ data, error: null }, { id: 1 }), /not confirmed/);
  }
});
test('wrong identity, missing fields and changed values cannot confirm a save', () => {
  for (const data of [{ id: 2, enabled: true }, { id: 1 }, { id: 1, enabled: false }]) {
    assert.throws(() => requireSavedRow({ data, error: null }, { id: 1, enabled: true }), /differs/);
  }
});
test('a database error wins over a plausible returned row', () => {
  const error = new Error('write denied');
  assert.throws(() => requireSavedRow({ data: { id: 1 }, error }, { id: 1 }), /write denied/);
});
test('JSON preferences compare values independently of object key order', () => {
  const data = { theme: { light: { color: 'green', enabled: true }, list: [1, 2] } };
  assert.equal(requireSavedRow({ data }, { theme: { list: [1, 2], light: { enabled: true, color: 'green' } } }), data);
  assert.throws(() => requireSavedRow({ data }, { theme: { list: [2, 1], light: { enabled: true, color: 'green' } } }), /differs/);
});
test('confirmed upsert selects identity and values without relying on client timestamps', async () => {
  let selected;
  const client = { from: () => ({ upsert: () => ({ select: columns => {
    selected = columns; return { single: async () => ({ data: { user_id: 'u', enabled: true } }) };
  } }) }) };
  const result = await upsertConfirmed(client, 'preferences', { user_id: 'u', enabled: true, updated_at: 'client-time' }, {});
  assert.equal(result.error, null);
  assert.equal(selected, 'user_id,enabled');
});
test('confirmed upsert exposes thrown network and no-row failures to existing callers', async () => {
  const absent = { from: () => ({ upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) }) };
  assert.match((await upsertConfirmed(absent, 'preferences', { id: 1 }, {})).error.message, /not confirmed/);
  const failed = { from: () => { throw new Error('network unavailable'); } };
  assert.match((await upsertConfirmed(failed, 'preferences', { id: 1 }, {})).error.message, /network unavailable/);
});
test('queued writes retain order when the first write is slow', async () => {
  const enqueue = createSaveQueue(); const events = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const first = enqueue(async () => { events.push('first started'); await pending; events.push('first saved'); });
  const second = enqueue(async () => { events.push('second saved'); });
  await Promise.resolve();
  assert.deepEqual(events, ['first started']);
  release(); await Promise.all([first, second]);
  assert.deepEqual(events, ['first started', 'first saved', 'second saved']);
});
test('a rejected write remains rejected but does not block the next save', async () => {
  const enqueue = createSaveQueue();
  const first = enqueue(async () => { throw new Error('offline'); });
  const second = enqueue(async () => 'saved');
  await assert.rejects(first, /offline/);
  assert.equal(await second, 'saved');
});
test('Users and Menu Manager invoke the receipt check after selecting the saved row', () => {
  const users = readFileSync(new URL('../../app/web/src/os-users.jsx', import.meta.url), 'utf8');
  assert.equal((users.match(/requireSavedRow\(result, expected/g) || []).length, 2);
  assert.equal((users.match(/\.select\("user_id,display_name,role,must_change_password"\)\.single\(\)/g) || []).length, 2);
  const app = readFileSync(new URL('../../app/web/src/App.jsx', import.meta.url), 'utf8');
  const menu = app.slice(app.indexOf('function MenuManager('), app.indexOf('function MenuManager(') + 3300);
  assert.ok(menu.includes('requireSavedRow(result, expected'));
  assert.ok(menu.includes('.eq("enabled", row.enabled)'));
  assert.ok(menu.includes('.select("id,enabled").single()'));
});
