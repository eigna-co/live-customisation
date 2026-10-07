const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { checkBalance, balanceSummary, balancePath, maxAgeMs } = require('../firebase-functions/twilio-balance');
const { createQueueHandler } = require('../firebase-functions/queue-service');
const { fakeDb } = require('./fake-db');
const at = Date.parse('2026-10-20T02:00:00Z');
const config = { balanceMonitor: { enabled: true, lowBalanceUsd: 5 } };
const env = { TWILIO_ACCOUNT_SID: `AC${'1'.repeat(32)}`, TWILIO_BALANCE_AUTH_TOKEN: 'test-only-token' };
const record = balance => ({ state: 'Available', currency: 'USD', balance, checkedAt: at });

test('low balance includes the threshold, zero and negative balances', () => {
  for (const balance of [5, 4.99, 0, -1]) assert.equal(balanceSummary(record(balance), at).state, 'Low');
  assert.equal(balanceSummary(record(5.01), at).state, 'Available');
});

test('missing, failed, stale, future or invalid balances are not shown as healthy', () => {
  for (const value of [null, { ...record(12), state: 'Unavailable' }, { ...record(12), checkedAt: at - maxAgeMs }, { ...record(12), checkedAt: at + 1 }, { ...record(12), currency: 'SGD' }, record(NaN)]) {
    const result = balanceSummary(value, at);
    assert.equal(result.state, 'Unavailable'); assert.equal(result.balance, null);
  }
});

test('monitor performs one read-only balance request and caches a safe summary', async () => {
  const db = fakeDb(); let calls = 0;
  await checkBalance({ db, config, env, now: () => at, fetchImpl: async (url, options) => {
    calls++; assert.ok(url.endsWith('/Balance.json')); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => ({ account_sid: env.TWILIO_ACCOUNT_SID, currency: 'USD', balance: '4.25000' }) };
  } });
  assert.equal(calls, 1); assert.deepEqual(db.rows.get(balancePath), record(4.25));
  assert.doesNotMatch(JSON.stringify(db.rows.get(balancePath)), /test-only-token|account_sid/);
});

test('disabled monitoring makes no request; missing secrets and failed checks clear old balances', async () => {
  const db = fakeDb(); let calls = 0;
  const failFetch = async () => { calls++; throw new Error('provider details must not leak'); };
  await checkBalance({ db, config: { balanceMonitor: { enabled: false } }, env, fetchImpl: failFetch });
  assert.equal(calls, 0); assert.equal(db.rows.size, 0);
  db.rows.set(balancePath, record(12));
  await checkBalance({ db, config, env: {}, now: () => at, fetchImpl: failFetch });
  assert.equal(calls, 0); assert.deepEqual(db.rows.get(balancePath), { state: 'Unavailable', checkedAt: at });
  await checkBalance({ db, config, env, now: () => at, fetchImpl: failFetch });
  assert.equal(calls, 1); assert.deepEqual(db.rows.get(balancePath), { state: 'Unavailable', checkedAt: at });
});

test('provider authentication errors and malformed or wrong-account responses are unavailable', async () => {
  for (const response of [{ ok: false }, { ok: true, json: async () => ({ account_sid: env.TWILIO_ACCOUNT_SID, currency: 'USD', balance: '' }) }, { ok: true, json: async () => ({ account_sid: 'wrong', currency: 'USD', balance: '12' }) }]) {
    const db = fakeDb();
    await checkBalance({ db, config, env, now: () => at, fetchImpl: async () => response });
    assert.equal(db.rows.get(balancePath).state, 'Unavailable');
  }
});

test('balance data requires approved staff authentication and never invokes the provider API', async () => {
  const db = fakeDb(); db.rows.set(balancePath, { ...record(4), privateField: 'not-for-client' });
  const handler = createQueueHandler({ getDb: () => db, now: () => at, authFetch: async () => { throw new Error('No provider call allowed'); }, verifyToken: async () => ({ eventStaff: 'nuvei', email_verified: true }) });
  const call = token => handler({ httpMethod: 'POST', body: JSON.stringify({ action: 'staff-list-orders' }), headers: token ? { authorization: 'Bearer test' } : {} });
  assert.equal((await call(false)).statusCode, 401);
  const result = await call(true);
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).twilioBalance.state, 'Low');
  assert.doesNotMatch(result.body, /not-for-client/);
});

test('staff warning is dismissible and non-modal, with no persisted dismissal across visits', () => {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/staff.jsx'), 'utf8');
  assert.match(source, /lowBalance && !balanceDismissed/);
  assert.match(source, /onClick=\{\(\) => setBalanceDismissed\(true\)\}/);
  assert.match(source, /aria-label="Twilio low balance notice"/);
  assert.doesNotMatch(source, /window\.alert|alertdialog|aria-modal|localStorage|sessionStorage/);
});
