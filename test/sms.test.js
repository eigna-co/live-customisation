const test = require('node:test');
const assert = require('node:assert/strict');
const { fakeDb } = require('./fake-db');
const { notifyReady, collectionMessage } = require('../firebase-functions/sms-notification');
const config = { enabled: true, from: '+18142643662', collectionLocation: 'the booth' };
const env = { TWILIO_ACCOUNT_SID: `AC${'1'.repeat(32)}`, TWILIO_API_KEY: `SK${'2'.repeat(32)}`, TWILIO_API_SECRET: 'fake-secret' };
function setup(patch = {}) {
  const db = fakeDb(); const orderRef = db.doc('events/nuvei/orders/test');
  db.rows.set(orderRef.path, { status: 'Ready', smsState: 'Pending', phone: '+6591234567', ticket: 'NU·0123456789', ...patch });
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(url, `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`);
    assert.equal(options.redirect, 'error');
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('To'), '+6591234567'); assert.equal(body.get('From'), config.from);
    assert.equal(body.get('Body'), collectionMessage(db.rows.get(orderRef.path), config));
    assert.equal(body.has('StatusCallback'), false);
    return { ok: true, json: async () => ({ sid: `SM${'3'.repeat(32)}`, status: 'queued' }) };
  };
  return { db, orderRef, run: overrides => notifyReady({ db, orderRef, config, env, fetchImpl, ...overrides }), calls: () => calls, order: () => db.rows.get(orderRef.path) };
}
test('collection SMS is one ASCII segment with a recognisable order reference', () => {
  const body = collectionMessage({ ticket: 'NU·0123456789' }, config);
  assert.ok(body.length <= 160); assert.match(body, /^[\x20-\x7E]+$/);
  assert.match(body, /at the booth/); assert.doesNotMatch(body, /Nuvei/); assert.match(body, /NU-0123456789/);
});
test('concurrent trigger deliveries submit only one SMS and do not claim delivery', async () => {
  const s = setup(); await Promise.all([s.run(), s.run()]); await s.run();
  assert.equal(s.calls(), 1); assert.equal(s.order().smsState, 'Accepted');
  assert.equal(s.order().smsProviderStatus, 'queued'); assert.equal(s.order().smsAttempted, true);
});
test('disabled configuration or missing secrets blocks SMS without network calls', async () => {
  for (const override of [{ config: { ...config, enabled: false } }, { env: {} }]) {
    const s = setup(); await s.run(override);
    assert.equal(s.calls(), 0); assert.equal(s.order().smsState, 'Blocked'); assert.equal(s.order().smsAttempted, undefined);
  }
});
test('queued, decorating, already attempted and invalid recipient orders do not send', async () => {
  for (const patch of [{ status: 'Queued' }, { status: 'Decorating' }, { smsAttempted: true }, { phone: '+123' }, { ticket: 'bad' }]) {
    const s = setup(patch); await s.run(); assert.equal(s.calls(), 0);
  }
});
test('lost response is flagged for review and never blindly sent twice', async () => {
  const s = setup(); let attempts = 0;
  const fetchImpl = async () => { attempts++; throw new Error('Timeout'); };
  await s.run({ fetchImpl }); await s.run({ fetchImpl });
  assert.equal(attempts, 1); assert.equal(s.order().smsState, 'Review');
});
test('rejected or malformed provider responses are not retried automatically', async () => {
  for (const response of [{ ok: false, json: async () => ({ code: 21608 }) }, { ok: true, json: async () => ({}) }]) {
    const s = setup(); let attempts = 0;
    const fetchImpl = async () => { attempts++; return response; };
    await s.run({ fetchImpl }); await s.run({ fetchImpl });
    assert.equal(attempts, 1); assert.equal(s.order().smsState, 'Review');
  }
});
test('crash after a send preserves durable claim and prevents another send', async () => {
  const s = setup();
  const brokenRef = { ...s.orderRef, update: async () => { throw new Error('DB unavailable'); } };
  await assert.rejects(s.run({ orderRef: brokenRef }));
  assert.equal(s.order().smsState, 'Sending');
  await s.run(); assert.equal(s.calls(), 1);
});
test('delayed Ready trigger still sends once after collection', async () => {
  const s = setup({ status: 'Collected' }); await s.run(); assert.equal(s.calls(), 1);
});
test('oversized or non-ASCII collection location blocks before submitting', async () => {
  for (const location of ['x'.repeat(160), 'booth 🧭']) {
    const s = setup(); await s.run({ config: { ...config, collectionLocation: location } });
    assert.equal(s.calls(), 0); assert.equal(s.order().smsState, 'Blocked');
  }
});
