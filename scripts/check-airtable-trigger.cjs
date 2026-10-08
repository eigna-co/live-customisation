// Wake only the existing isolated rehearsal record, then inspect trigger output.
// No order creation, stock changes, Airtable direct writes, or Twilio requests.
const path = require('node:path');
const settings = require('../firebase-functions/integration-config.json').airtable;
const root = 'projects/tgelive-1b68d/databases/(default)/documents/events/nuvei-rehearsal-1791427527019-cc12594a';
let stage = 'initialise';
async function main() {
  const mode = process.argv[3];
  if (!['--wake-once', '--check-only'].includes(mode)) throw new Error('Explicit mode required');
  const auth = require(path.join(process.argv[2], 'lib/auth.js'));
  const account = auth.getGlobalDefaultAccount();
  if (account?.user?.email !== 'jerryl@evfy.sg') throw new Error('Unexpected administrator');
  const access = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const api = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${access.access_token}`, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Object.assign(new Error('Cloud operation failed'), { code: `HTTP-${response.status}` });
    return response.json();
  };
  stage = 'read-existing-test-only';
  const list = await api(`https://firestore.googleapis.com/v1/${root}/orders?pageSize=2`);
  if (list.documents?.length !== 1) throw new Error('Unexpected test record count');
  let doc = list.documents[0];
  const value = doc.fields;
  const string = key => value[key]?.stringValue;
  if (string('ticket') !== 'NU·5265A58B3B' || string('name') !== 'REHEARSAL TEST - NOT A GIFT ORDER' ||
      string('status') !== 'Collected' || !/^rec[A-Za-z0-9]+$/.test(string('airtableRecordId') || '') ||
      !doc.name.startsWith(`${root}/orders/`)) throw new Error('Not the approved rehearsal record');
  if (mode === '--wake-once') {
    if (value.triggerTestRequestedAt || string('mirrorState') !== 'Synced') throw new Error('Test already requested or previous sync incomplete; use check-only');
    stage = 'wake-existing-test-once';
    const query = new URLSearchParams({ 'currentDocument.updateTime': doc.updateTime });
    query.append('updateMask.fieldPaths', 'mirrorState'); query.append('updateMask.fieldPaths', 'triggerTestRequestedAt');
    await api(`https://firestore.googleapis.com/v1/${doc.name}?${query}`, { method: 'PATCH', body: JSON.stringify({ fields: {
      mirrorState: { stringValue: 'Pending' }, triggerTestRequestedAt: { integerValue: String(Date.now()) },
    } }) });
  }
  stage = 'inspect-trigger-result';
  doc = await api(`https://firestore.googleapis.com/v1/${doc.name}`);
  const saved = doc.fields;
  const state = saved.mirrorState?.stringValue;
  console.log(JSON.stringify({ mirrorState: state, requested: !!saved.triggerTestRequestedAt,
    testOnly: true, realSmsSent: 0, liveStockChanged: false }));
  if (state !== 'Synced' || !saved.triggerTestRequestedAt) return;
  if (Number(saved.mirrorStartedAt?.integerValue) < Number(saved.triggerTestRequestedAt.integerValue)) throw new Error('Sync predates this test');
  stage = 'read-airtable-result';
  const secret = await api('https://secretmanager.googleapis.com/v1/projects/tgelive-1b68d/secrets/AIRTABLE_TOKEN/versions/latest:access');
  const token = Buffer.from(secret.payload.data, 'base64').toString('utf8').trim();
  const result = await fetch(`https://api.airtable.com/v0/${settings.baseId}/${settings.tableId}/${saved.airtableRecordId.stringValue}`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw new Error('Airtable verification failed');
  const fields = (await result.json()).fields;
  if (fields.Ticket !== 'NU·5265A58B3B' || fields.Status !== 'Collected' || fields.Font !== 'Segoe Print' || fields.Phone) throw new Error('Airtable mismatch');
  console.log(JSON.stringify({ deployedTriggerDelivery: 'Passed', airtableStatus: fields.Status, fontSaved: true,
    realSmsSent: 0, liveStockChanged: false, testRecordRetained: true }));
}
main().catch(error => { console.error(`Trigger check stopped at ${stage}: ${String(error.code || error.name).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50)}. Use check-only; do not repeat the wake.`); process.exitCode = 1; });
