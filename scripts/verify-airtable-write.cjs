// One labelled integration record, no customer data, gift stock or SMS.
// A fixed ticket and lookup prevent repeated runs creating duplicate test rows.
const path = require('node:path');
const settings = require('../firebase-functions/integration-config.json').airtable;
const { syncOrder } = require('../firebase-functions/airtable-mirror');
const { fakeDb } = require('../test/fake-db');
const ticket = 'TEST-AIRTABLE-20261008';
let stage = 'initialise';
async function main() {
  const auth = require(path.join(process.argv[2], 'lib/auth.js'));
  const account = auth.getGlobalDefaultAccount();
  if (account?.user?.email !== 'jerryl@evfy.sg') throw new Error('Unexpected administrator');
  const access = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  stage = 'secret-access';
  const secret = await fetch('https://secretmanager.googleapis.com/v1/projects/tgelive-1b68d/secrets/AIRTABLE_TOKEN/versions/latest:access', {
    headers: { Authorization: `Bearer ${access.access_token}` }, redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!secret.ok) throw new Error('Secret unavailable');
  const token = Buffer.from((await secret.json()).payload.data, 'base64').toString('utf8').trim();
  const url = `https://api.airtable.com/v0/${settings.baseId}/${settings.tableId}`;
  const request = async (target, options = {}) => {
    const response = await fetch(target, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    if (!response.ok) {
      console.log(JSON.stringify({ stage, httpStatus: response.status, providerCode: body.error?.type || 'Unavailable', customerRecordsChanged: 0, smsSent: 0 }));
      throw new Error('Provider rejected verification');
    }
    return body;
  };
  stage = 'lookup-test-only';
  const query = new URLSearchParams({ filterByFormula: `{Ticket}="${ticket}"`, maxRecords: '2' });
  const found = await request(`${url}?${query}`);
  if (!Array.isArray(found.records) || found.records.length > 1) throw new Error('Unexpected test records');
  let record = found.records[0];
  if (!record) {
    stage = 'create-test-once';
    record = await request(url, { method: 'POST', body: JSON.stringify({ fields: {
      Name: 'INTEGRATION TEST - NOT A GIFT ORDER', Company: 'System verification',
      Email: 'airtable-check@example.invalid', Gift: 'TEST ONLY', Decoration: 'Catherine',
      Font: 'Times New Roman', Ticket: ticket, Status: 'Queued',
    } }) });
  }
  if (!/^rec[A-Za-z0-9]+$/.test(record.id || '') || record.fields?.Ticket !== ticket) throw new Error('Invalid test reference');
  const db = fakeDb();
  const orderRef = db.doc('isolated-airtable-check/test');
  const verifiedStatuses = [];
  for (const [index, status] of ['Queued', 'Decorating', 'Ready', 'Collected'].entries()) {
    stage = 'shared-mirror-status-update';
    db.rows.set(orderRef.path, { ticket, status, version: index, mirrorState: 'Pending', airtableRecordId: record.id });
    await syncOrder({ db, orderRef, env: { AIRTABLE_TOKEN: token, AIRTABLE_BASE: settings.baseId, AIRTABLE_TABLE: settings.tableId } });
    if (db.rows.get(orderRef.path).mirrorState !== 'Synced') throw new Error('Mirror did not sync');
    stage = 'verify-test-only';
    const saved = await request(`${url}/${record.id}`);
    const expected = status === 'Decorating' ? 'Engraving' : status;
    if (saved.fields?.Ticket !== ticket || saved.fields?.Font !== 'Times New Roman' || saved.fields?.Status !== expected || saved.fields?.Phone) throw new Error('Verification mismatch');
    verifiedStatuses.push(expected);
  }
  console.log(JSON.stringify({ writeAccess: 'Verified', fontSaved: true, verifiedStatuses, sharedMirrorHandler: 'Passed', labelledTestRecord: ticket, customerRecordsChanged: 0, inventoryChanged: false, smsSent: 0 }));
}
main().catch(() => { console.error(`Airtable verification stopped at ${stage}. Check the labelled test record before any retry.`); process.exitCode = 1; });
