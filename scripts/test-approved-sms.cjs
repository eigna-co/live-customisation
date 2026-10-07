// One explicitly approved test only. A durable staging claim prevents resends.
const path = require('node:path');
const { collectionMessage } = require('../firebase-functions/sms-notification');
const settings = require('../firebase-functions/integration-config.json').sms;
const database = 'projects/tgelive-1b68d/databases/(default)';
const document = `${database}/documents/events/nuvei-staging-20261007/smsChecks/approved-collection-test`;
// Supply the explicitly approved recipient privately at execution time.
const recipient = process.env.NUVEI_SMS_TEST_PHONE;
let stage = 'initialise';
async function main() {
  if (process.argv[3] !== '--send-approved-one') throw new Error('Explicit single-test flag required');
  if (!/^\+65[89]\d{7}$/.test(recipient || '')) throw new Error('Approved Singapore test recipient required');
  const auth = require(path.join(process.argv[2], 'lib/auth.js'));
  const account = auth.getGlobalDefaultAccount();
  if (account?.user?.email !== 'jerryl@evfy.sg') throw new Error('Expected administrator not signed in');
  const access = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const googleHeaders = { Authorization: `Bearer ${access.access_token}`, 'Content-Type': 'application/json' };
  const secretValues = {};
  for (const name of ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_BALANCE_AUTH_TOKEN']) {
    stage = 'read-secret';
    const result = await fetch(`https://secretmanager.googleapis.com/v1/projects/tgelive-1b68d/secrets/${name}/versions/latest:access`, { headers: googleHeaders, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!result.ok) throw new Error('Secret unavailable');
    const value = await result.json(); secretValues[name] = Buffer.from(value.payload.data, 'base64').toString('utf8').trim();
  }
  if (!/^AC[0-9a-f]{32}$/i.test(secretValues.TWILIO_ACCOUNT_SID) || !/^SK[0-9a-f]{32}$/i.test(secretValues.TWILIO_API_KEY)) throw new Error('Invalid credential identifiers');
  const body = '[TEST] ' + collectionMessage({ ticket: 'NU·0000000001' });
  if (body.length > 160 || !/^[\x20-\x7E]+$/.test(body)) throw new Error('Test must fit one ASCII segment');
  stage = 'durable-attempt-claim';
  const claim = await fetch(`https://firestore.googleapis.com/v1/${database}/documents:commit`, {
    method: 'POST', headers: googleHeaders, redirect: 'error', signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ writes: [{ update: { name: document, fields: { state: { stringValue: 'Sending' }, purpose: { stringValue: 'User-approved one SMS test; no live order or inventory' }, attemptedAt: { integerValue: String(Date.now()) } } }, currentDocument: { exists: false } }] }),
  });
  if (!claim.ok) { console.log('Test not sent: durable claim could not be created or a previous attempt already exists. Review the staging record before any resend.'); process.exitCode = 1; return; }
  stage = 'send-one-test';
  const messageUrl = `https://api.twilio.com/2010-04-01/Accounts/${secretValues.TWILIO_ACCOUNT_SID}/Messages`;
  const send = await fetch(`${messageUrl}.json`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Basic ${Buffer.from(`${secretValues.TWILIO_API_KEY}:${secretValues.TWILIO_API_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: recipient, From: settings.from, Body: body }).toString(),
  });
  const response = await send.json();
  const accepted = send.ok && /^SM[0-9a-f]{32}$/i.test(response.sid || '');
  const patch = { state: { stringValue: accepted ? 'Accepted' : 'Review' } };
  if (accepted) patch.messageSid = { stringValue: response.sid };
  await fetch(`https://firestore.googleapis.com/v1/${document}?updateMask.fieldPaths=state${accepted ? '&updateMask.fieldPaths=messageSid' : ''}`, { method: 'PATCH', headers: googleHeaders, body: JSON.stringify({ fields: patch }), redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!accepted) { console.log(JSON.stringify({ state: 'Review', providerHttpStatus: send.status, providerErrorCode: Number.isInteger(response.code) ? response.code : null, resend: 'Disabled' })); process.exitCode = 1; return; }
  stage = 'read-exact-message-status';
  const status = await fetch(`${messageUrl}/${response.sid}.json`, { headers: { Authorization: `Basic ${Buffer.from(`${secretValues.TWILIO_ACCOUNT_SID}:${secretValues.TWILIO_BALANCE_AUTH_TOKEN}`).toString('base64')}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  const delivery = status.ok ? await status.json() : {};
  console.log(JSON.stringify({ state: 'Accepted', providerStatus: typeof delivery.status === 'string' ? delivery.status : 'Unknown', providerErrorCode: delivery.error_code || null, testMessagesSubmitted: 1, liveOrdersCreated: 0, liveSmsEnabled: false }));
}
main().catch(() => { console.error(`Test stopped at ${stage}. Do not automatically resend; inspect the durable staging claim and Twilio logs.`); process.exitCode = 1; });
