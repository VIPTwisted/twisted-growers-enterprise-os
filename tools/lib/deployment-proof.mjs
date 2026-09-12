// Post-deployment evidence only. Never substitute a cached branch for a fresh read.
export async function verifyDeployment({ readExpected, fetchImpl = fetch, site, timeoutMs = 20000 }) {
  const checkedAt = new Date().toISOString();
  let expected;
  try {
    expected = await readExpected();
    if (!/^[a-f0-9]{40}$/.test(expected)) throw new Error('Invalid commit SHA');
  } catch {
    return { status: 'UNVERIFIED', checkedAt, errors: ['Current origin/main could not be verified; cached references are not proof.'] };
  }
  const result = { status: 'FAIL', checkedAt, expected, errors: [] };
  try {
    const url = new URL(site);
    if (url.protocol !== 'https:') throw new Error('HTTPS is required');
    url.searchParams.set('deploycheck', Date.now().toString());
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!/^text\/html\b/i.test(response.headers.get('content-type') || '')) throw new Error('Expected an HTML response');
    const html = await response.text();
    const stamps = [...html.matchAll(/<meta\s+name="tg-build-commit"\s+content="([^"]*)"\s*\/?\s*>/g)];
    result.liveCommit = stamps.length === 1 ? stamps[0][1] : null;
    if (result.liveCommit !== expected) result.errors.push('Live build stamp does not uniquely match current origin/main.');
    const csp = response.headers.get('content-security-policy') || '';
    const directives = new Map();
    for (const part of csp.split(';')) {
      const [name, ...values] = part.trim().split(/\s+/);
      // Browsers use the first duplicate directive, not the last.
      if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), values.join(' '));
    }
    for (const [name, allowed] of [['frame-ancestors', ["'self'", "'none'"]], ['base-uri', ["'self'", "'none'"]], ['object-src', ["'none'"]]]) {
      if (!allowed.includes(directives.get(name))) result.errors.push(`Missing or weakened CSP ${name}.`);
    }
    if (!['SAMEORIGIN', 'DENY'].includes((response.headers.get('x-frame-options') || '').trim().toUpperCase())) result.errors.push('Missing or invalid X-Frame-Options.');
    if ((response.headers.get('x-content-type-options') || '').trim().toLowerCase() !== 'nosniff') result.errors.push('Missing X-Content-Type-Options nosniff.');
    const hsts = response.headers.get('strict-transport-security') || '';
    if (!/(?:^|;)\s*max-age\s*=\s*[1-9]\d*\s*(?:;|$)/i.test(hsts)) result.errors.push('Missing or disabled HSTS.');
    result.status = result.errors.length ? 'FAIL' : 'PASS';
  } catch (error) {
    result.errors.push(`Live response could not be verified: ${error.message}`);
  }
  return result;
}
