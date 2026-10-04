const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createQueueHandler, paths, digest } = require('../firebase-functions/queue-service');
const { syncOrder } = require('../firebase-functions/airtable-mirror');
const { _test } = require('../firebase-functions/redemption');
const { fakeDb } = require('./fake-db');
const details = (email = 'guest@example.test') => ({ name: 'Jane Tan', company: 'Example', email, phone: '+65 9123 4567', gift: 'Travel Adaptor', decoration: 'Jane', decorationBottom: 'Mark', font: 'segoe-print' });
function setup() {
  _test.resetRateLimit();
  const db = fakeDb();
  const handler = createQueueHandler({ getDb: () => db, authFetch: async () => ({ ok: true, json: async () => ({ idToken: 'allowed', expiresIn: '3600' }) }), webApiKey: () => 'test-key', verifyToken: async token => {
    if (token === 'expired') throw new Error('Revoked');
    return { uid: 'staff-1', eventStaff: token === 'allowed' ? 'nuvei' : 'other', email_verified: token !== 'unverified' };
  } });
  const call = async (action, payload = {}, token) => {
    const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ action, ...payload }), clientAddress: 'test', headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { ...JSON.parse(result.body), httpStatus: result.statusCode };
  };
  return { db, call, create: (email, requestId = randomUUID()) => call('create-redemption', { requestId, redemption: details(email) }) };
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
test('normalised duplicate emails cannot claim another gift', async () => {
  const { create } = setup();
  assert.equal((await create('Jane@Example.test')).httpStatus, 201);
  assert.equal((await create(' jane@example.test ')).code, 'duplicate-email');
});
test('bad engraving and request references never reserve stock', async () => {
  const { db, call } = setup();
  for (const payload of [{ requestId: '-'.repeat(36), redemption: details() }, { requestId: randomUUID(), redemption: { ...details(), decoration: 'TOOLONG' } }]) assert.equal((await call('create-redemption', payload)).httpStatus, 422);
  assert.equal(db.rows.size, 0);
});
test('staff access requires verified, event-authorised, non-revoked identity', async () => {
  const { call } = setup();
  for (const [token, status] of [[undefined, 401], ['expired', 401], ['other', 403], ['unverified', 403], ['allowed', 200]]) assert.equal((await call('staff-list-orders', {}, token)).httpStatus, status);
  assert.equal((await call('staff-sign-in', { email: 'staff@example.test', password: 'test-only' })).idToken, 'allowed');
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
  assert.equal((await update('Collected', 2)).version, 3);
  assert.equal((await update('Collected', 2)).version, 3);
  assert.equal([...db.rows.keys()].filter(path => path.includes('/audit/')).length, 3);
  const tracked = await call('get-order-status', { trackingToken: receipt.trackingToken });
  assert.deepEqual(Object.keys(tracked).sort(), ['httpStatus', 'status', 'ticket']);
  assert.equal(tracked.status, 'Collected');
  assert.equal((await call('get-order-status', { trackingToken: receipt.ticket })).httpStatus, 404);
});
const mirrorEnv = { AIRTABLE_TOKEN: 'test', AIRTABLE_BASE: 'base', AIRTABLE_TABLE: 'table' };
test('both engraving areas accept five letters independently and persist their positions', async () => {
  const { db, call } = setup();
  const result = await call('create-redemption', { requestId: randomUUID(), redemption: { ...details(), decoration: 'ABCDE', decorationBottom: 'FGHIJ' } });
  assert.equal(result.httpStatus, 201);
  const order = db.rows.get(`${paths.root}/orders/${digest('guest@example.test')}`);
  assert.equal(order.decorationTop, 'ABCDE'); assert.equal(order.decorationBottom, 'FGHIJ');
  assert.equal(order.decoration, 'Top: ABCDE | Bottom: FGHIJ');
});
test('missing, blank, invalid and overlong bottom engraving are rejected before reserving stock', async () => {
  const { db, call } = setup();
  for (const bottom of [undefined, '', 'ABCDEF', '123', 'A B']) {
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
  await ref.update({ mirrorState: 'Processing', mirrorStartedAt: Date.now(), mirrorCreateAttempted: true });
  assert.equal((await call('staff-retry-sync', { orderId: ref.id }, 'allowed')).httpStatus, 409);
  await ref.update({ mirrorStartedAt: Date.now() - 121000 });
  assert.equal((await call('staff-retry-sync', { orderId: ref.id }, 'allowed')).queued, true);
  assert.equal(db.rows.get(ref.path).mirrorCreateAttempted, true);
});
