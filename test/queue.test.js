const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createQueueHandler, paths, digest } = require('../firebase-functions/queue-service');
const { syncOrder } = require('../firebase-functions/airtable-mirror');
const { _test } = require('../firebase-functions/redemption');
const { fakeDb } = require('./fake-db');
const details = (email = 'guest@example.test') => ({ name: 'Jane Tan', company: 'Example', email, phone: '+65 9123 4567', gift: 'Travel Adaptor', decoration: 'Jane', font: 'segoe-print' });
const eventConfig = { ...require('../firebase-functions/event-config.json'), schedule: { ...require('../firebase-functions/event-config.json').schedule, year: 2026 } };
function setup({ at = Date.parse('2026-10-20T02:00:00Z'), configOverride = eventConfig } = {}) {
  _test.resetRateLimit();
  const db = fakeDb();
  const handler = createQueueHandler({ getDb: () => db, eventConfig: configOverride, now: () => at, authFetch: async () => ({ ok: true, json: async () => ({ idToken: 'allowed', expiresIn: '3600' }) }), webApiKey: () => 'test-key', verifyToken: async token => {
    if (token === 'expired') throw new Error('Revoked');
    return { uid: 'staff-1', eventStaff: token === 'allowed' ? 'nuvei' : 'other', email_verified: token !== 'unverified' };
  } });
  const call = async (action, payload = {}, token) => {
    const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ action, ...(action === 'create-redemption' ? { reviewConfirmed: true } : {}), ...payload }), clientAddress: 'test', headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { ...JSON.parse(result.body), httpStatus: result.statusCode };
  };
  let phoneCounter = 1000000;
  return { db, call, setTime: value => { at = Date.parse(value); }, create: (email, requestId = randomUUID()) => call('create-redemption', { requestId, redemption: { ...details(email), phone: email ? `+659${String(phoneCounter++).padStart(7, '0')}` : '+6591234567' } }) };
}
test('simultaneous last-unit submissions produce one order and one reservation', async () => {
  const { db, create } = setup();
  db.rows.set(`${paths.root}/inventory/adaptor`, { capacity: 1, reserved: 0 });
  const results = await Promise.all([create('a@example.test'), create('b@example.test')]);
  assert.deepEqual(results.map(result => result.httpStatus).sort(), [201, 409]);
  assert.equal(results.find(result => result.httpStatus === 409).code, 'sold-out');
  assert.equal(db.rows.get(`${paths.root}/inventory/adaptor`).reserved, 1);
  assert.equal([...db.rows.keys()].filter(path => path.includes('/orders/')).length, 1);
});
test('retry after a lost response returns the same reference without consuming stock', async () => {
  const { db, call } = setup();
  const payload = { requestId: randomUUID(), redemption: details() };
  const first = await call('create-redemption', payload);
  const retry = await call('create-redemption', payload);
  assert.equal(first.httpStatus, 201); assert.equal(retry.httpStatus, 200);
  assert.equal(retry.ticket, first.ticket); assert.equal(retry.trackingToken, first.trackingToken);
  assert.equal(db.rows.get(`${paths.root}/inventory/adaptor`).reserved, 1);
  const conflict = await call('create-redemption', { ...payload, redemption: { ...payload.redemption, decoration: 'Mark' } });
  assert.equal(conflict.code, 'request-conflict');
});
test('normalised emails cannot claim another gift on day two even with a different phone', async () => {
  const { call, setTime, db } = setup();
  assert.equal((await call('create-redemption', { requestId: randomUUID(), redemption: details() })).httpStatus, 201);
  setTime('2026-10-21T02:00:00Z');
  assert.equal((await call('create-redemption', { requestId: randomUUID(), redemption: { ...details(' GUEST@EXAMPLE.TEST '), phone: '+6591234568' } })).code, 'duplicate-email');
  assert.equal(db.rows.get(`${paths.root}/inventory/adaptor`).reserved, 1);
  assert.equal(db.rows.has(`${paths.root}/inventory/adaptor-2026-10-21`), false);
});

test('concurrent submissions of the same email reserve one gift only', async () => {
  const { db, call } = setup();
  const results = await Promise.all([
    call('create-redemption', { requestId: randomUUID(), redemption: details() }),
    call('create-redemption', { requestId: randomUUID(), redemption: { ...details('GUEST@EXAMPLE.TEST'), phone: '+6591234568' } }),
  ]);
  assert.deepEqual(results.map(result => result.httpStatus).sort(), [201, 409]);
  assert.equal(results.find(result => result.httpStatus === 409).code, 'duplicate-email');
  assert.equal(db.rows.get(`${paths.root}/inventory/adaptor`).reserved, 1);
  assert.equal([...db.rows.keys()].filter(path => path.includes('/orders/')).length, 1);
});

test('bad engraving and request references never reserve stock', async () => {
  const { db, call } = setup();
  for (const payload of [{ requestId: '-'.repeat(36), redemption: details() }, { requestId: randomUUID(), redemption: { ...details(), decoration: 'Jane1' } }]) assert.equal((await call('create-redemption', payload)).httpStatus, 422);
  assert.equal(db.rows.size, 0);
});
test('staff access requires verified, event-authorised, non-revoked identity', async () => {
  const { call } = setup();
  for (const [token, status] of [[undefined, 401], ['expired', 401], ['other', 403], ['unverified', 403], ['allowed', 200]]) assert.equal((await call('staff-list-orders', {}, token)).httpStatus, status);
  assert.equal((await call('staff-sign-in', { email: 'staff@example.test', password: 'test-only' })).idToken, 'allowed');
});
test('every staff mutation rejects missing, revoked, wrong-event and unverified accounts without database writes', async () => {
  const { db, call } = setup();
  const before = [...db.rows.entries()];
  for (const action of ['staff-update-status', 'staff-retry-sms', 'staff-retry-sync']) {
    for (const [token, expected] of [[undefined, 401], ['expired', 401], ['other', 403], ['unverified', 403]]) {
      const result = await call(action, { orderId: 'a'.repeat(64), status: 'Ready', version: 0 }, token);
      assert.equal(result.httpStatus, expected, `${action}: ${token || 'anonymous'}`);
      assert.deepEqual([...db.rows.entries()], before);
    }
  }
});
test('staff changes are ordered, conflict-checked and audited; tracking exposes no personal data', async () => {
  const { db, call, create } = setup();
  const receipt = await create();
  const id = digest('guest@example.test');
  const update = (status, version) => call('staff-update-status', { orderId: id, status, version }, 'allowed');
  assert.equal((await update('Collected', 0)).httpStatus, 422);
  assert.equal((await update('Decorating', 0)).status, 'Decorating');
  assert.equal((await update('Ready', 0)).httpStatus, 409);
  assert.equal((await update('Ready', 1)).version, 2);
  assert.equal(db.rows.get(`${paths.root}/orders/${id}`).smsState, 'Pending');
  assert.equal((await update('Ready', 1)).version, 2);
  assert.equal((await update('Collected', 2)).version, 3);
  assert.equal((await update('Collected', 2)).version, 3);
  assert.equal([...db.rows.keys()].filter(path => path.includes('/audit/')).length, 3);
  const tracked = await call('get-order-status', { trackingToken: receipt.trackingToken });
  assert.deepEqual(Object.keys(tracked).sort(), ['httpStatus', 'status', 'ticket']);
  assert.equal(tracked.status, 'Collected');
  assert.equal((await call('get-order-status', { trackingToken: receipt.ticket })).httpStatus, 404);
});
const mirrorEnv = { AIRTABLE_TOKEN: 'test', AIRTABLE_BASE: 'base', AIRTABLE_TABLE: 'table' };
test('only authorised staff can requeue an SMS that has never been attempted', async () => {
  const { db, create, call } = setup(); await create();
  const id = digest('guest@example.test'); const ref = db.doc(`${paths.root}/orders/${id}`);
  await ref.update({ status: 'Ready', smsState: 'Blocked' });
  assert.equal((await call('staff-retry-sms', { orderId: id })).httpStatus, 401);
  assert.equal((await call('staff-retry-sms', { orderId: id }, 'allowed')).queued, true);
  await ref.update({ smsState: 'Review', smsAttempted: true });
  assert.equal((await call('staff-retry-sms', { orderId: id }, 'allowed')).httpStatus, 409);
  await ref.update({ smsState: 'Blocked' });
  assert.equal((await call('staff-retry-sms', { orderId: id }, 'allowed')).httpStatus, 409);
});
test('fifty per Singapore event day, with no rollover and at most one hundred total', async () => {
  const { db, create, call, setTime } = setup();
  for (let i = 0; i < 50; i++) assert.equal((await create(`day1-${i}@example.test`)).httpStatus, 201);
  assert.equal((await create('overflow1@example.test')).code, 'sold-out');
  assert.equal((await call('get-availability')).products[0].remaining, 0);
  setTime('2026-10-20T16:00:00Z'); // Midnight in Singapore starts day two.
  assert.equal((await call('get-availability')).eventDay, '2026-10-21');
  assert.equal((await call('get-availability')).products[0].remaining, 50);
  for (let i = 0; i < 50; i++) assert.equal((await create(`day2-${i}@example.test`)).httpStatus, 201);
  assert.equal((await create('overflow2@example.test')).code, 'sold-out');
  assert.equal(db.rows.get(`${paths.root}/inventory/adaptor`).reserved, 100);
});

test('a sixty-customer concurrent wave accepts exactly fifty gifts on each event day', async () => {
  const { db, create, setTime } = setup();
  for (const day of [20, 21]) {
    setTime(`2026-10-${day}T02:00:00Z`);
    const results = await Promise.all(Array.from({ length: 60 }, (_, index) => create(`wave-${day}-${index}@example.test`)));
    assert.equal(results.filter(result => result.httpStatus === 201).length, 50);
    assert.equal(results.filter(result => result.code === 'sold-out').length, 10);
    assert.equal(db.rows.get(`${paths.root}/inventory/adaptor-2026-10-${day}`).reserved, 50);
  }
  assert.equal(db.rows.get(`${paths.root}/inventory/adaptor`).reserved, 100);
});

test('fifty concurrent submissions for the same email consume exactly one gift', async () => {
  const { db, create } = setup();
  const results = await Promise.all(Array.from({ length: 50 }, () => create('wave-same@example.test')));
  assert.equal(results.filter(result => result.httpStatus === 201).length, 1);
  assert.equal(results.filter(result => result.code === 'duplicate-email').length, 49);
  assert.equal(db.rows.get(`${paths.root}/inventory/adaptor`).reserved, 1);
  assert.equal([...db.rows.keys()].filter(path => path.includes('/orders/')).length, 1);
});
test('unused first-day stock does not increase the second-day allocation', async () => {
  const { create, call, setTime } = setup(); await create();
  setTime('2026-10-21T02:00:00Z');
  assert.equal((await call('get-availability')).products[0].remaining, 50);
});
test('concurrent requests for the last daily unit reserve only one gift', async () => {
  const { db, create } = setup();
  db.rows.set(`${paths.root}/inventory/adaptor-2026-10-20`, { capacity: 50, reserved: 49 });
  const results = await Promise.all([create('a@example.test'), create('b@example.test')]);
  assert.deepEqual(results.map(result => result.httpStatus).sort(), [201, 409]);
  assert.equal(db.rows.get(`${paths.root}/inventory/adaptor-2026-10-20`).reserved, 50);
});
test('unconfirmed event year fails closed; outside event dates cannot reserve stock', async () => {
  const missingYear = setup({ configOverride: { ...eventConfig, schedule: { ...eventConfig.schedule, year: null } } });
  assert.equal((await missingYear.create()).code, 'event-unconfigured');
  assert.equal((await missingYear.call('get-availability')).httpStatus, 503);
  assert.equal(missingYear.db.rows.size, 0);
  const outside = setup({ at: Date.parse('2026-10-19T15:59:59Z') });
  assert.equal((await outside.create()).code, 'event-closed');
  assert.equal((await outside.call('get-availability')).eventClosed, true);
  assert.equal(outside.db.rows.size, 0);
});
test('an old successful request can be retried on another day without using more stock', async () => {
  const { call, setTime, db } = setup();
  const payload = { requestId: randomUUID(), redemption: details() };
  const first = await call('create-redemption', payload);
  setTime('2026-10-22T02:00:00Z');
  const retry = await call('create-redemption', payload);
  assert.equal(retry.ticket, first.ticket); assert.equal(retry.httpStatus, 200);
  assert.equal(db.rows.get(`${paths.root}/inventory/adaptor`).reserved, 1);
});
test('different emails with the same contact number are allowed; unchecked review is rejected', async () => {
  const { call, db } = setup();
  assert.equal((await call('create-redemption', { requestId: randomUUID(), redemption: details(), reviewConfirmed: false })).code, 'review-required');
  assert.equal(db.rows.size, 0);
  assert.equal((await call('create-redemption', { requestId: randomUUID(), redemption: details() })).httpStatus, 201);
  assert.equal((await call('create-redemption', { requestId: randomUUID(), redemption: details('other@example.test') })).httpStatus, 201);
});
test('top-only engraving accepts longer names and saves the full customer text', async () => {
  const { db, call } = setup();
  const result = await call('create-redemption', { requestId: randomUUID(), redemption: { ...details(), decoration: 'Catherin' } });
  assert.equal(result.httpStatus, 201);
  const order = db.rows.get(`${paths.root}/orders/${digest('guest@example.test')}`);
  assert.equal(order.decorationBottom, undefined);
  assert.equal(order.decoration, 'Catherin');
});
test('any submitted bottom engraving is rejected before reserving stock', async () => {
  const { db, call } = setup();
  for (const bottom of [null, '', 'ABCDE', 'ABCDEF', '123', 'A B']) {
    assert.equal((await call('create-redemption', { requestId: randomUUID(), redemption: { ...details(), decorationBottom: bottom } })).httpStatus, 422);
  }
  assert.equal(db.rows.size, 0);
});
test('duplicate mirror deliveries create only one Airtable copy', async () => {
  const { db, create } = setup(); await create();
  const orderRef = db.doc(`${paths.root}/orders/${digest('guest@example.test')}`);
  let posts = 0;
  const fetchImpl = async (url, options) => ({ ok: true, json: async () => options.method === 'POST' ? (posts++, { id: 'rec-test' }) : { records: [] } });
  await Promise.all([syncOrder({ db, orderRef, fetchImpl, env: mirrorEnv }), syncOrder({ db, orderRef, fetchImpl, env: mirrorEnv })]);
  assert.equal(posts, 1); assert.equal(db.rows.get(orderRef.path).mirrorState, 'Synced');
});
test('uncertain Airtable writes enter review and recheck without posting twice', async () => {
  const { db, call, create } = setup(); await create();
  const orderRef = db.doc(`${paths.root}/orders/${digest('guest@example.test')}`);
  let posts = 0;
  const fetchImpl = async (url, options) => { if (options.method === 'POST') { posts++; throw new Error('Lost response'); } return { ok: true, json: async () => ({ records: [] }) }; };
  await syncOrder({ db, orderRef, fetchImpl, env: mirrorEnv });
  assert.equal(db.rows.get(orderRef.path).mirrorState, 'Review');
  await call('staff-retry-sync', { orderId: orderRef.id }, 'allowed');
  await syncOrder({ db, orderRef, fetchImpl, env: mirrorEnv });
  assert.equal(posts, 1); assert.equal(db.rows.get(orderRef.path).mirrorState, 'Review');
});
test('stalled sync recovery waits two minutes and preserves uncertain-create guard', async () => {
  const { db, call, create } = setup(); await create();
  const ref = db.doc(`${paths.root}/orders/${digest('guest@example.test')}`);
  const at = Date.parse('2026-10-20T02:00:00Z');
  await ref.update({ mirrorState: 'Processing', mirrorStartedAt: at, mirrorCreateAttempted: true });
  assert.equal((await call('staff-retry-sync', { orderId: ref.id }, 'allowed')).httpStatus, 409);
  await ref.update({ mirrorStartedAt: at - 121000 });
  assert.equal((await call('staff-retry-sync', { orderId: ref.id }, 'allowed')).queued, true);
  assert.equal(db.rows.get(ref.path).mirrorCreateAttempted, true);
});
