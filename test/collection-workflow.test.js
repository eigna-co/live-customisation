// Service-level rehearsal only: in-memory stock and fake provider, never real SMS.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fakeDb } = require('./fake-db');
const { createQueueHandler, paths, digest } = require('../firebase-functions/queue-service');
const { notifyReady } = require('../firebase-functions/sms-notification');
const { _test } = require('../firebase-functions/redemption');
const liveSms = require('../firebase-functions/integration-config.json').sms;

async function rehearsal({ enabled = true, uncertain = false } = {}) {
  _test.resetRateLimit();
  const db = fakeDb();
  const handler = createQueueHandler({ getDb: () => db,
    authFetch: async () => { throw new Error('No real authentication network calls in rehearsal'); },
    now: () => Date.parse('2026-10-20T02:00:00Z'),
    verifyToken: async () => ({ uid: 'rehearsal-staff', eventStaff: 'nuvei', email_verified: true }),
  });
  const call = async (action, payload = {}, staff = false) => {
    const response = await handler({ httpMethod: 'POST', clientAddress: 'rehearsal',
      headers: staff ? { authorization: 'Bearer sample-only' } : {},
      body: JSON.stringify({ action, ...payload }),
    });
    return { ...JSON.parse(response.body), httpStatus: response.statusCode };
  };
  const receipt = await call('create-redemption', { requestId: randomUUID(), reviewConfirmed: true,
    redemption: { name: 'Test Guest', company: 'Example', email: 'rehearsal@example.test',
      phone: '+6591234567', gift: 'Travel Adaptor', decoration: 'Catherine', font: 'times-new-roman' },
  });
  assert.equal(receipt.httpStatus, 201);
  const orderId = digest('rehearsal@example.test');
  const orderRef = db.doc(`${paths.root}/orders/${orderId}`);
  const messages = [];
  const runWorker = () => notifyReady({ db, orderRef, config: { ...liveSms, enabled },
    env: { TWILIO_ACCOUNT_SID: `AC${'1'.repeat(32)}`, TWILIO_API_KEY: `SK${'2'.repeat(32)}`, TWILIO_API_SECRET: 'fake-only' },
    fetchImpl: async (_url, options) => {
      messages.push(new URLSearchParams(options.body));
      if (uncertain) throw new Error('Simulated lost response');
      return { ok: true, json: async () => ({ sid: `SM${'3'.repeat(32)}`, status: 'queued' }) };
    },
  });
  const advance = (status, version) => call('staff-update-status', { orderId, status, version }, true);
  const track = () => call('get-order-status', { trackingToken: receipt.trackingToken });
  return { db, call, receipt, orderId, orderRef, messages, runWorker, advance, track };
}

test('full queue rehearsal sends only on Ready and preserves stock, long name and private tracking', async () => {
  const s = await rehearsal();
  await s.runWorker(); assert.equal(s.messages.length, 0);
  assert.equal((await s.advance('Decorating', 0)).status, 'Decorating');
  await s.runWorker(); assert.equal(s.messages.length, 0);
  assert.equal((await s.advance('Ready', 1)).status, 'Ready');
  assert.equal((await s.track()).status, 'Ready');
  await Promise.all([s.runWorker(), s.runWorker()]);
  assert.equal(s.messages.length, 1);
  assert.match(s.messages[0].get('Body'), /at the booth/);
  assert.doesNotMatch(s.messages[0].get('Body'), /Nuvei/);
  assert.ok(s.messages[0].get('Body').includes(s.receipt.ticket.replace('·', '-')));
  assert.equal((await s.advance('Collected', 2)).status, 'Collected');
  await s.runWorker(); assert.equal(s.messages.length, 1);
  assert.equal((await s.track()).status, 'Collected');
  assert.deepEqual(Object.keys(await s.track()).sort(), ['httpStatus', 'status', 'ticket']);
  const order = (await s.orderRef.get()).data();
  assert.equal(order.decoration, 'Catherine');
  assert.equal(order.smsState, 'Accepted'); // Provider acceptance is not handset delivery.
  assert.equal(s.db.rows.get(`${paths.root}/inventory/adaptor`).reserved, 1);
  assert.equal(s.db.rows.get(`${paths.root}/inventory/adaptor-2026-10-20`).reserved, 1);
});

test('disabled SMS configuration cannot send, and collection still works', async () => {
  const s = await rehearsal({ enabled: false });
  await s.advance('Decorating', 0); await s.advance('Ready', 1);
  await s.runWorker();
  assert.equal(s.messages.length, 0);
  assert.equal((await s.orderRef.get()).data().smsState, 'Blocked');
  assert.equal((await s.advance('Collected', 2)).status, 'Collected');
});

test('uncertain Ready notification cannot be resent through staff retry', async () => {
  const s = await rehearsal({ uncertain: true });
  await s.advance('Decorating', 0); await s.advance('Ready', 1);
  await s.runWorker(); await s.runWorker();
  assert.equal((await s.orderRef.get()).data().smsState, 'Review');
  assert.equal((await s.call('staff-retry-sms', { orderId: s.orderId }, true)).httpStatus, 409);
  assert.equal(s.messages.length, 1);
  assert.equal((await s.advance('Collected', 2)).status, 'Collected');
});

test('unauthenticated status change cannot schedule a notification', async () => {
  const s = await rehearsal();
  assert.equal((await s.call('staff-update-status', { orderId: s.orderId, status: 'Ready', version: 0 })).httpStatus, 401);
  await s.runWorker();
  assert.equal(s.messages.length, 0);
  assert.equal((await s.track()).status, 'Queued');
});
