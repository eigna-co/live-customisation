// Non-mutating deployment checks: no login attempts, orders, SMS or credentials.
import assert from 'node:assert/strict';
const endpoint = 'https://redemptions-s3i7tgf25a-as.a.run.app';
async function check(name, body, expectedStatus, validate = () => {}, method = 'POST', platformRejection = false) {
  const response = await fetch(endpoint, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, expectedStatus, `${name}: unexpected HTTP status`);
  // Google's HTTP framework rejects malformed JSON before our handler runs.
  // Its response format/headers are platform-owned, not our JSON API contract.
  if (platformRejection) { console.log(`PASS ${name}`); return; }
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const data = await response.json();
  validate(data);
  console.log(`PASS ${name}`);
}
try {
  await check('service configuration', { action: 'get-service-config' }, 200, data => {
    assert.deepEqual(data, { transactional: true, staffLoginConfigured: true });
  });
  await check('public availability contains no customer information', { action: 'get-availability' }, 200, data => {
    assert.deepEqual(Object.keys(data).sort(), ['eventClosed', 'eventDay', 'products']);
    assert.equal(typeof data.eventClosed, 'boolean');
    assert.equal(data.products.length, 1);
    assert.equal(data.products[0].id, 'adaptor');
    assert.ok(Number.isInteger(data.products[0].remaining) && data.products[0].remaining >= 0 && data.products[0].remaining <= 50);
    if (data.eventClosed) assert.equal(data.products[0].remaining, 0);
  });
  for (const action of ['staff-list-orders', 'staff-update-status', 'staff-retry-sms', 'staff-retry-sync']) {
    await check(`${action} rejects anonymous callers`, { action }, 401, data => assert.deepEqual(Object.keys(data), ['error']));
  }
  await check('invalid tracking reference is rejected', { action: 'get-order-status', trackingToken: 'not-a-secret' }, 404);
  await check('malformed JSON is rejected by the platform', '{', 400, () => {}, 'POST', true);
  await check('unsupported HTTP method is rejected', undefined, 405, () => {}, 'GET');
  console.log('All 9 live read-only checks passed. No customer records or SMS were created.');
} catch {
  console.error('Cloud service check failed. No response bodies or credentials are printed.');
  process.exitCode = 1;
}
