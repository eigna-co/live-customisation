// Isolated HTTP/shared-service integration rehearsal. Not a live event order.
// Real Firestore and Airtable, simulated staff identity and SMS; no production triggers.
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createQueueHandler, paths, digest } = require('../firebase-functions/queue-service');
const { createHttpHandler } = require('../firebase-functions/http-adapter');
const { syncOrder } = require('../firebase-functions/airtable-mirror');
const { notifyReady } = require('../firebase-functions/sms-notification');
const settings = require('../firebase-functions/integration-config.json');
let stage = 'initialise';
let server;
async function main() {
  const auth = require(path.join(process.argv[2], 'lib/auth.js'));
  const account = auth.getGlobalDefaultAccount();
  if (account?.user?.email !== 'jerryl@evfy.sg') throw new Error('Unexpected administrator');
  const credential = { getAccessToken: async () => {
    const access = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
    return { access_token: access.access_token, expires_in: access.expires_in || 3600 };
  } };
  const access = await credential.getAccessToken();
  const database = 'projects/tgelive-1b68d/databases/(default)';
  const encode = value => value === null ? { nullValue: null } : typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'number' ? { integerValue: String(value) } : typeof value === 'string' ? { stringValue: value } : { mapValue: { fields: fields(value) } };
  const fields = value => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
  const decode = value => Object.hasOwn(value, 'stringValue') ? value.stringValue : Object.hasOwn(value, 'booleanValue') ? value.booleanValue : Object.hasOwn(value, 'integerValue') ? Number(value.integerValue) : Object.hasOwn(value, 'mapValue') ? record(value.mapValue.fields || {}) : null;
  const record = value => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
  const api = async (resource, body, method = 'POST', allowMissing = false) => {
    const response = await fetch(`https://firestore.googleapis.com/v1/${resource}`, { method, headers: { Authorization: `Bearer ${access.access_token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw Object.assign(new Error('Firestore operation failed'), { code: data.error?.status });
    return data;
  };
  const root = `events/nuvei-rehearsal-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const remap = logical => {
    if (!logical.startsWith(`${paths.root}/`)) throw new Error('Non-event data access blocked');
    return `${root}/${logical.slice(paths.root.length + 1)}`;
  };
  const snapshot = data => ({ exists: data !== null, data: () => data ? record(data.fields || {}) : undefined });
  const doc = logical => {
    const isolated = remap(logical); const name = `${database}/documents/${isolated}`;
    return { path: isolated, name, id: isolated.split('/').at(-1),
      get: async () => snapshot(await api(name, undefined, 'GET', true)),
      update: async patch => {
        const query = new URLSearchParams(); for (const key of Object.keys(patch)) query.append('updateMask.fieldPaths', key);
        query.set('currentDocument.exists', 'true');
        await api(`${name}?${query}`, { fields: fields(patch) }, 'PATCH');
      }, collection: collection => ({ doc: (id = randomUUID()) => doc(`${logical}/${collection}/${id}`), get: async () => {
        const result = await api(`${name}/${collection}?pageSize=100`, undefined, 'GET');
        return { size: (result.documents || []).length };
      } }),
    };
  };
  const db = { doc, runTransaction: async callback => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { transaction } = await api(`${database}/documents:beginTransaction`, { options: { readWrite: {} } });
      const writes = [];
      const update = (ref, value, extra = {}) => writes.push({ update: { name: ref.name, fields: fields(value) }, ...extra });
      try {
        const result = await callback({
          get: async ref => snapshot(await api(`${ref.name}?transaction=${encodeURIComponent(transaction)}`, undefined, 'GET', true)),
          create: (ref, value) => update(ref, value, { currentDocument: { exists: false } }),
          set: (ref, value) => update(ref, value),
          update: (ref, value) => update(ref, value, { updateMask: { fieldPaths: Object.keys(value) }, currentDocument: { exists: true } }),
        });
        await api(`${database}/documents:commit`, { transaction, writes }); return result;
      } catch (error) {
        await api(`${database}/documents:rollback`, { transaction }).catch(() => {});
        if (error.code !== 'ABORTED' || attempt === 4) throw error;
      }
    }
  } };
  stage = 'airtable-secret';
  const secret = await fetch('https://secretmanager.googleapis.com/v1/projects/tgelive-1b68d/secrets/AIRTABLE_TOKEN/versions/latest:access', {
    headers: { Authorization: `Bearer ${access.access_token}` }, redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!secret.ok) throw new Error('Airtable secret unavailable');
  const airtableToken = Buffer.from((await secret.json()).payload.data, 'base64').toString('utf8').trim();
  const staffToken = randomUUID();
  const handler = createQueueHandler({ getDb: () => db, now: () => Date.parse('2026-10-20T02:00:00Z'),
    verifyToken: async token => {
      if (token !== staffToken) throw new Error('Invalid rehearsal token');
      return { uid: 'isolated-rehearsal-only', eventStaff: 'nuvei', email_verified: true };
    }, authFetch: async () => { throw new Error('Staff sign-in intentionally skipped'); },
  });
  const httpHandler = createHttpHandler(handler);
  server = http.createServer(async (req, res) => {
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 10000) throw new Error('Too large'); chunks.push(chunk); }
      req.rawBody = Buffer.concat(chunks);
      await httpHandler(req, { set: values => { for (const [key, value] of Object.entries(values)) res.setHeader(key, value); }, status: code => { res.statusCode = code; return { send: value => res.end(value) }; } });
    } catch { res.statusCode = 500; res.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const call = async (action, payload = {}, staff = false) => {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(staff ? { authorization: `Bearer ${staffToken}` } : {}) }, body: JSON.stringify({ action, ...payload }), signal: AbortSignal.timeout(30000) });
    return { ...await response.json(), httpStatus: response.status };
  };
  const request = { requestId: randomUUID(), reviewConfirmed: true, redemption: {
    name: 'REHEARSAL TEST - NOT A GIFT ORDER', company: 'System verification',
    email: `${randomUUID()}@example.invalid`, phone: '+6591234567', gift: 'Travel Adaptor', decoration: 'Catherine', font: 'segoe-print',
  } };
  stage = 'customer-submit';
  const before = await call('get-availability');
  assert.equal(before.products[0].remaining, 50);
  const receipt = await call('create-redemption', request);
  assert.equal(receipt.httpStatus, 201);
  assert.equal((await call('create-redemption', request)).httpStatus, 200);
  assert.equal((await call('create-redemption', { ...request, requestId: randomUUID() })).code, 'duplicate-email');
  const orderId = digest(request.redemption.email);
  const orderRef = db.doc(`${paths.root}/orders/${orderId}`);
  let simulatedMessages = 0;
  const sms = () => notifyReady({ db, orderRef, config: settings.sms,
    env: { TWILIO_ACCOUNT_SID: `AC${'1'.repeat(32)}`, TWILIO_API_KEY: `SK${'2'.repeat(32)}`, TWILIO_API_SECRET: 'simulated-only' },
    fetchImpl: async (_url, options) => {
      simulatedMessages++;
      const text = new URLSearchParams(options.body).get('Body');
      assert.ok(text.includes(receipt.ticket.replace('·', '-')));
      assert.ok(text.includes('at the booth'));
      return { ok: true, json: async () => ({ sid: `SM${'3'.repeat(32)}`, status: 'queued' }) };
    },
  });
  const mirror = async expected => {
    // Keep even synthetic phone numbers out of Airtable. Legacy SMS automation is off.
    await syncOrder({ db, orderRef, env: { AIRTABLE_TOKEN: airtableToken }, fetchImpl: async (url, options) => {
      if (options.method === 'POST') {
        const body = JSON.parse(options.body); delete body.fields.Phone;
        options = { ...options, body: JSON.stringify(body) };
      }
      return fetch(url, { ...options, redirect: 'error' });
    } });
    const saved = (await orderRef.get()).data();
    assert.equal(saved.mirrorState, 'Synced');
    const result = await fetch(`https://api.airtable.com/v0/${settings.airtable.baseId}/${settings.airtable.tableId}/${saved.airtableRecordId}`, {
      headers: { Authorization: `Bearer ${airtableToken}` }, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    assert.ok(result.ok);
    const fields = (await result.json()).fields;
    assert.equal(fields.Ticket, receipt.ticket); assert.equal(fields.Status, expected);
    assert.equal(fields.Decoration, 'Catherine'); assert.equal(fields.Font, 'Segoe Print');
    assert.ok(!fields.Phone);
  };
  stage = 'queued-sync'; await mirror('Queued'); await sms(); assert.equal(simulatedMessages, 0);
  assert.equal((await call('staff-update-status', { orderId, status: 'Decorating', version: 0 })).httpStatus, 401);
  const statuses = ['Queued'];
  for (const [index, status] of ['Decorating', 'Ready', 'Collected'].entries()) {
    stage = `status-${status}`;
    const updated = await call('staff-update-status', { orderId, status, version: index }, true);
    assert.equal(updated.httpStatus, 200); assert.equal(updated.status, status);
    await mirror(status === 'Decorating' ? 'Engraving' : status);
    await Promise.all([sms(), sms()]);
    assert.equal(simulatedMessages, index === 0 ? 0 : 1);
    const tracked = await call('get-order-status', { trackingToken: receipt.trackingToken });
    assert.equal(tracked.status, status);
    assert.deepEqual(Object.keys(tracked).sort(), ['httpStatus', 'status', 'ticket']);
    statuses.push(status === 'Decorating' ? 'Engraving' : status);
  }
  stage = 'final-check';
  const after = await call('get-availability'); assert.equal(after.products[0].remaining, 49);
  const stock = (await db.doc(`${paths.root}/inventory/adaptor`).get()).data(); assert.equal(stock.reserved, 1);
  const audit = await orderRef.collection('audit').get(); assert.equal(audit.size, 3);
  assert.equal((await orderRef.get()).data().smsState, 'Accepted');
  console.log(JSON.stringify({ result: 'Passed', isolatedEvent: root, ticket: receipt.ticket, statuses,
    realFirestore: true, realAirtable: true, localHttp: true, auditEntries: 3, duplicateEmailRejected: true,
    idempotentSubmission: true, guestTrackingPrivate: true, simulatedSmsRequests: simulatedMessages,
    realSmsSent: 0, liveInventoryChanged: false, staffSignIn: 'Skipped as requested', cloudTriggerDelivery: 'Not exercised by this rehearsal', testRecordsRetained: true }));
}
main().catch(error => { console.error(`Rehearsal stopped at ${stage}; diagnostic=${String(error.code || error.name).replace(/[^A-Za-z0-9_/-]/g, '').slice(0, 60)}; test records retained. Do not automatically repeat the submission.`); process.exitCode = 1; })
  .finally(async () => { if (server) await new Promise(resolve => server.close(resolve)); });
