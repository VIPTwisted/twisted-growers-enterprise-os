import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDeployment } from '../lib/deployment-proof.mjs';

const sha = 'a'.repeat(40);
const stamp = `<meta name="tg-build-commit" content="${sha}">`;
const headers = {
  'content-type': 'text/html; charset=UTF-8',
  'content-security-policy': "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
  'x-frame-options': 'SAMEORIGIN',
  'x-content-type-options': 'nosniff',
  'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
};
const check = (options = {}) => verifyDeployment({
  readExpected: () => sha, site: 'https://example.com',
  fetchImpl: async () => new Response(stamp, { headers }), ...options,
});

test('matching current commit and protected response pass', async () => {
  assert.equal((await check()).status, 'PASS');
});
test('unreachable origin never passes using cached state', async () => {
  let fetched = false;
  const result = await check({ readExpected: () => { throw new Error('offline'); }, fetchImpl: () => { fetched = true; } });
  assert.equal(result.status, 'UNVERIFIED');
  assert.equal(fetched, false);
});
test('invalid expected SHA is unverified', async () => {
  assert.equal((await check({ readExpected: () => 'unknown' })).status, 'UNVERIFIED');
});
for (const [name, body] of [['old', stamp.replace(sha, 'b'.repeat(40))], ['missing', '<html></html>'], ['unknown', stamp.replace(sha, 'unknown')], ['duplicate', stamp + stamp]]) {
  test(`${name} build stamp fails`, async () => {
    assert.equal((await check({ fetchImpl: async () => new Response(body, { headers }) })).status, 'FAIL');
  });
}
for (const name of Object.keys(headers)) {
  test(`missing ${name} fails`, async () => {
    const copy = { ...headers }; delete copy[name];
    assert.equal((await check({ fetchImpl: async () => new Response(stamp, { headers: copy }) })).status, 'FAIL');
  });
}
test('weakened first CSP directive is not hidden by a stronger duplicate', async () => {
  const copy = { ...headers, 'content-security-policy': "frame-ancestors *; " + headers['content-security-policy'] };
  assert.equal((await check({ fetchImpl: async () => new Response(stamp, { headers: copy }) })).status, 'FAIL');
});
test('stricter policies pass', async () => {
  const copy = { ...headers, 'content-security-policy': "frame-ancestors 'none'; base-uri 'none'; object-src 'none'", 'x-frame-options': 'DENY' };
  assert.equal((await check({ fetchImpl: async () => new Response(stamp, { headers: copy }) })).status, 'PASS');
});
test('disabled HSTS fails', async () => {
  const copy = { ...headers, 'strict-transport-security': 'max-age=0' };
  assert.equal((await check({ fetchImpl: async () => new Response(stamp, { headers: copy }) })).status, 'FAIL');
});
test('HTTP errors and network errors cannot pass', async () => {
  for (const fetchImpl of [async () => new Response('', { status: 503 }), async () => { throw new Error('network unavailable'); }]) {
    assert.equal((await check({ fetchImpl })).status, 'FAIL');
  }
});
test('request has a finite timeout and forbids redirects', async () => {
  await check({ fetchImpl: async (_url, options) => {
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(stamp, { headers });
  } });
});
test('timeout remains active while reading the response body', async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const result = await check({ timeoutMs: 5, fetchImpl: async (_url, options) => ({
      ok: true, headers: new Headers(headers), text: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      }),
    }) });
    assert.equal(result.status, 'FAIL');
    assert.match(result.errors[0], /timeout/i);
  } finally { clearTimeout(keepAlive); }
});
