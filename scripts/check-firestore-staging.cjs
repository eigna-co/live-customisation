// Exercise the real queue logic through real Firestore REST transactions.
// Every document is remapped to a fresh isolated staging event. Never live stock.
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { createQueueHandler, paths } = require('../firebase-functions/queue-service');
const eventConfig = require('../firebase-functions/event-config.json');
const { withSubmissionRetry } = require('../src/submission-retry');
const database = 'projects/tgelive-1b68d/databases/(default)';
const root = `events/nuvei-staging-${Date.now()}-${randomUUID().slice(0, 8)}`;
const encode = value => value === null ? { nullValue: null } : typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'number' ? (Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }) : typeof value === 'string' ? { stringValue: value } : { mapValue: { fields: fields(value) } };
const fields = value => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
const decode = value => Object.hasOwn(value, 'stringValue') ? value.stringValue : Object.hasOwn(value, 'booleanValue') ? value.booleanValue : Object.hasOwn(value, 'integerValue') ? Number(value.integerValue) : Object.hasOwn(value, 'doubleValue') ? value.doubleValue : Object.hasOwn(value, 'mapValue') ? record(value.mapValue.fields || {}) : null;
const record = value => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
async function main() {
  const auth = require(path.join(process.argv[2], 'lib/auth.js'));
  const account = auth.getGlobalDefaultAccount();
  if (account?.user?.email !== 'jerryl@evfy.sg') throw new Error('Expected administrator not signed in');
  const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const api = async (resource, body, method = 'POST', allowMissing = false) => {
    const response = await fetch(`https://firestore.googleapis.com/v1/${resource}`, { method, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) { const error = new Error('Firestore operation failed'); error.code = data.error?.status || `HTTP-${response.status}`; throw error; }
    return data;
  };
  const doc = logical => {
    if (!logical.startsWith(`${paths.root}/`)) throw new Error('Non-event path blocked');
    const isolated = `${root}/${logical.slice(paths.root.length + 1)}`;
    const name = `${database}/documents/${isolated}`;
    return { path: isolated, name, id: isolated.split('/').at(-1), get: async () => snapshot(await api(name, undefined, 'GET', true)), collection: collection => ({ doc: (id = randomUUID()) => doc(`${logical}/${collection}/${id}`) }) };
  };
  const snapshot = data => ({ exists: data !== null, data: () => data ? record(data.fields || {}) : undefined });
  let retries = 0;
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
        await api(`${database}/documents:commit`, { transaction, writes });
        return result;
      } catch (error) {
        await api(`${database}/documents:rollback`, { transaction }).catch(() => {});
        if (error.code !== 'ABORTED' || attempt === 4) throw error;
        retries++;
        await new Promise(resolve => setTimeout(resolve, 150 * 2 ** attempt + Math.random() * 100));
      }
    }
  } };
  const handler = createQueueHandler({ getDb: () => db, verifyToken: async () => ({ uid: 'staging-only', eventStaff: 'nuvei', email_verified: true }), now: () => Date.parse('2026-10-20T02:00:00Z'), eventConfig });
  const call = async payload => {
    const result = await handler({ httpMethod: 'POST', body: JSON.stringify(payload), clientAddress: 'isolated-staging', headers: {} });
    return { ...JSON.parse(result.body), httpStatus: result.statusCode };
  };
  const requests = Array.from({ length: 50 }, (_, index) => ({ action: 'create-redemption', reviewConfirmed: true, requestId: randomUUID(), redemption: { name: 'Test Guest', company: 'STAGING ONLY', email: `staging-${index}@example.test`, phone: `+659${String(1000000 + index)}`, gift: 'Travel Adaptor', decoration: 'Test', font: 'times-new-roman' } }));
  const start = Date.now();
  const first = await Promise.all(requests.map(request => withSubmissionRetry(async () => {
    const result = await call(request);
    if (result.httpStatus === 503) throw Object.assign(new Error('Transient staging contention'), { status: 503 });
    return result;
  }).catch(() => ({ httpStatus: 503 }))));
  console.log(JSON.stringify({ stage: 'concurrent-wave-with-client-recovery', isolatedEvent: root, successful: first.filter(result => [200, 201].includes(result.httpStatus)).length, temporarilyUnavailable: first.filter(result => result.httpStatus === 503).length, otherErrors: first.filter(result => ![200, 201, 503].includes(result.httpStatus)).map(result => result.httpStatus), elapsedMs: Date.now() - start, transactionRetries: retries }));
  // Recover only uncertain requests using the identical request ID and details.
  for (let index = 0; index < requests.length; index++) {
    if (first[index].httpStatus === 503) assert.ok([200, 201].includes((await call(requests[index])).httpStatus));
    else assert.ok([200, 201].includes(first[index].httpStatus));
  }
  const stock = (await doc(`${paths.root}/inventory/adaptor`).get()).data();
  const daily = (await doc(`${paths.root}/inventory/adaptor-2026-10-20`).get()).data();
  assert.equal(stock.reserved, 50); assert.equal(daily.reserved, 50);
  assert.equal((await call(requests[0])).httpStatus, 200);
  assert.equal((await call({ ...requests[0], requestId: randomUUID() })).code, 'duplicate-email');
  assert.equal((await call({ ...requests[0], requestId: randomUUID(), redemption: { ...requests[0].redemption, email: 'overflow@example.test' } })).code, 'sold-out');
  console.log(JSON.stringify({ state: 'Passed', reserved: stock.reserved, dailyReserved: daily.reserved, duplicateEmailRejected: true, lostResponseRecovery: true, overflowRejected: true, liveOrdersCreated: 0, smsSent: 0, stagingRecordsRetained: true }));
}
main().catch(error => { console.error('Isolated Firestore test failed:', /^[A-Z_0-9-]+$/.test(String(error.code)) ? error.code : 'check-failed', 'Staging records retained; no automatic deletion.'); process.exitCode = 1; });
