// One approved Firestore-trigger test; no gift orders, stock or Airtable writes.
// --check-only reads the existing attempt, never resends or recreates it.
const path = require('node:path');
const database = 'projects/tgelive-1b68d/databases/(default)';
const document = `${database}/documents/events/nuvei-staging-20261008/smsChecks/approved-automatic-test`;
let stage = 'initialise';
async function main() {
  const mode = process.argv[3];
  if (!['--send-approved-one', '--check-only', '--resume-unattempted'].includes(mode)) throw new Error('Explicit test mode required');
  const auth = require(path.join(process.argv[2], 'lib/auth.js'));
  const account = auth.getGlobalDefaultAccount();
  if (account?.user?.email !== 'jerryl@evfy.sg') throw new Error('Expected administrator not signed in');
  const access = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const headers = { Authorization: `Bearer ${access.access_token}`, 'Content-Type': 'application/json' };
  const api = (url, options = {}) => fetch(url, { ...options, headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (mode === '--send-approved-one') {
    const recipient = process.env.NUVEI_SMS_TEST_PHONE;
    if (!/^\+65[89]\d{7}$/.test(recipient || '')) throw new Error('Approved recipient required');
    stage = 'create-once';
    const initial = {
      status: { stringValue: 'Queued' }, smsState: { stringValue: 'Not queued' },
      phone: { stringValue: recipient }, ticket: { stringValue: 'NU·0000000002' },
      purpose: { stringValue: 'Approved single automatic SMS test, no gift or inventory' },
      createdAt: { integerValue: String(Date.now()) },
    };
    const create = await api(`https://firestore.googleapis.com/v1/${database}/documents:commit`, {
      method: 'POST', body: JSON.stringify({ writes: [{ update: { name: document, fields: initial }, currentDocument: { exists: false } }] }),
    });
    if (!create.ok) throw new Error('Attempt already exists or create failed; do not resend');
    stage = 'read-before-ready';
    const queued = await api(`https://firestore.googleapis.com/v1/${document}`);
    if (!queued.ok) throw new Error('Queued read failed');
    const saved = await queued.json();
    if (saved.fields.status.stringValue !== 'Queued' || saved.fields.smsState.stringValue !== 'Not queued') throw new Error('Unexpected queued state');
    stage = 'ready-transition';
    const ready = await api(`https://firestore.googleapis.com/v1/${database}/documents:commit`, {
      method: 'POST', body: JSON.stringify({ writes: [{ update: { name: document, fields: {
        status: { stringValue: 'Ready' }, smsState: { stringValue: 'Pending' },
      } }, updateMask: { fieldPaths: ['status', 'smsState'] }, currentDocument: { updateTime: saved.updateTime } }] }),
    });
    if (!ready.ok) throw new Error('Ready transition uncertain; use check-only, never resend');
    console.log(JSON.stringify({ readyTransition: 'Committed', testRecordOnly: true, liveOrdersCreated: 0, inventoryChanged: false }));
  }
  stage = 'read-attempt';
  const response = await api(`https://firestore.googleapis.com/v1/${document}`);
  if (!response.ok) throw new Error('Test attempt unavailable');
  const saved = (await response.json()).fields;
  const state = saved.smsState?.stringValue;
  if (mode === '--resume-unattempted') {
    // Only wake the same pending test after fixing a pre-claim startup failure.
    // The worker's durable claim still allows at most one provider submission.
    if (state !== 'Pending' || saved.smsAttempted?.booleanValue === true ||
        saved.phone?.stringValue !== process.env.NUVEI_SMS_TEST_PHONE ||
        saved.ticket?.stringValue !== 'NU·0000000002') throw new Error('Unsafe resume rejected');
    stage = 'wake-unattempted-test';
    const wake = await api(`https://firestore.googleapis.com/v1/${document}?updateMask.fieldPaths=testWakeAt&currentDocument.exists=true`, {
      method: 'PATCH', body: JSON.stringify({ fields: { testWakeAt: { integerValue: String(Date.now()) } } }),
    });
    if (!wake.ok) throw new Error('Wake result uncertain; check-only');
    console.log(JSON.stringify({ existingUnattemptedTestWoken: true, newOrders: 0 }));
  }
  console.log(JSON.stringify({ smsState: state, attempted: saved.smsAttempted?.booleanValue === true,
    providerStatus: saved.smsProviderStatus?.stringValue || null, liveOrdersCreated: 0, inventoryChanged: false }));
  if (state !== 'Accepted') return;
  const messageSid = saved.smsMessageSid?.stringValue;
  if (!/^SM[0-9a-f]{32}$/i.test(messageSid || '')) throw new Error('Invalid message reference');
  const values = {};
  for (const name of ['TWILIO_ACCOUNT_SID', 'TWILIO_BALANCE_AUTH_TOKEN']) {
    stage = 'read-status-credentials';
    const secret = await api(`https://secretmanager.googleapis.com/v1/projects/tgelive-1b68d/secrets/${name}/versions/latest:access`);
    if (!secret.ok) throw new Error('Status credentials unavailable');
    values[name] = Buffer.from((await secret.json()).payload.data, 'base64').toString('utf8').trim();
  }
  stage = 'read-exact-provider-message';
  const delivery = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${values.TWILIO_ACCOUNT_SID}/Messages/${messageSid}.json`, {
    headers: { Authorization: `Basic ${Buffer.from(`${values.TWILIO_ACCOUNT_SID}:${values.TWILIO_BALANCE_AUTH_TOKEN}`).toString('base64')}` },
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!delivery.ok) throw new Error('Provider status unavailable');
  const result = await delivery.json();
  console.log(JSON.stringify({ providerStatus: result.status, providerErrorCode: result.error_code || null, resend: 'Disabled' }));
}
main().catch(() => { console.error(`Automatic SMS test stopped at ${stage}. Inspect with --check-only; never automatically resend.`); process.exitCode = 1; });
