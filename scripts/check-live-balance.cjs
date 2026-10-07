// Approved balance check only: no SMS, top-up or customer record writes.
const path = require('node:path');
const { checkBalance, balanceSummary, balancePath } = require('../firebase-functions/twilio-balance');
let stage = 'initialise';
async function main() {
  const cliDirectory = process.argv[2];
  if (!cliDirectory) throw new Error('Firebase CLI library directory required');
  const cliAuth = require(path.join(cliDirectory, 'lib/auth.js'));
  const account = cliAuth.getGlobalDefaultAccount();
  if (account?.user?.email !== 'jerryl@evfy.sg') throw new Error('Expected project administrator is not signed in');
  const access = async () => cliAuth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  if (process.argv[3] === '--verify-schedule') {
    stage = 'read-schedule';
    const token = await access();
    const root = 'https://cloudscheduler.googleapis.com/v1/projects/tgelive-1b68d/locations/asia-southeast1/jobs';
    const headers = { Authorization: `Bearer ${token.access_token}` };
    const response = await fetch(root, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) { const error = new Error('Scheduler read failed'); error.code = `HTTP-${response.status}`; throw error; }
    const data = await response.json();
    const jobs = (data.jobs || []).filter(job => job.name.split('/').at(-1) === 'firebase-schedule-monitorTwilioBalance-asia-southeast1');
    if (jobs.length !== 1 || jobs[0].state !== 'ENABLED') throw new Error('Expected enabled balance schedule not found');
    const job = jobs[0];
    console.log(JSON.stringify({ name: job.name, state: job.state, schedule: job.schedule, timeZone: job.timeZone, lastAttemptTime: job.lastAttemptTime }));
    stage = 'run-balance-schedule';
    const run = await fetch(`https://cloudscheduler.googleapis.com/v1/${job.name}:run`, { method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!run.ok) { const error = new Error('Scheduler run failed'); error.code = `HTTP-${run.status}`; throw error; }
    console.log('Managed balance-only check requested; no SMS or top-up.');
    return;
  }
  const env = {};
  const readOnly = process.argv[3] === '--read-cache';
  if (!readOnly) {
  for (const name of ['TWILIO_ACCOUNT_SID', 'TWILIO_BALANCE_AUTH_TOKEN']) {
    stage = `access-${name}`;
    const token = await access();
    const result = await fetch(`https://secretmanager.googleapis.com/v1/projects/tgelive-1b68d/secrets/${name}/versions/latest:access`, { headers: { Authorization: `Bearer ${token.access_token}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!result.ok) { const error = new Error('Secret access unavailable'); error.code = `HTTP-${result.status}`; throw error; }
    const data = await result.json(); env[name] = Buffer.from(data.payload.data, 'base64').toString('utf8').trim();
  }
  stage = 'balance-and-cache';
  // Local CLI OAuth works with the documented Firestore REST API. The live
  // worker continues to use Admin SDK and its managed service identity.
  const documentUrl = `https://firestore.googleapis.com/v1/projects/tgelive-1b68d/databases/(default)/documents/${balancePath}`;
  const db = { doc: value => ({ path: value }), runTransaction: async callback => {
    let write;
    await callback({ set: (ref, record) => { if (ref.path !== balancePath || write) throw new Error('Only the balance cache may be written'); write = record; } });
    if (!write) throw new Error('No balance cache to write');
    const fields = Object.fromEntries(Object.entries(write).map(([key, value]) => [key, typeof value === 'number' ? (Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }) : { stringValue: value }]));
    const token = await access();
    const saved = await fetch(documentUrl, { method: 'PATCH', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }), redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!saved.ok) { const error = new Error('Cache write failed'); error.code = `HTTP-${saved.status}`; throw error; }
  } };
  await checkBalance({ db, env });
  for (const name of Object.keys(env)) env[name] = '';
  }
  stage = 'read-cache';
  const token = await access();
  const documentUrl = `https://firestore.googleapis.com/v1/projects/tgelive-1b68d/databases/(default)/documents/${balancePath}`;
  const snapshot = await fetch(documentUrl, { headers: { Authorization: `Bearer ${token.access_token}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!snapshot.ok) { const error = new Error('Cache read failed'); error.code = `HTTP-${snapshot.status}`; throw error; }
  const data = await snapshot.json();
  const record = Object.fromEntries(Object.entries(data.fields || {}).map(([key, value]) => [key, value.stringValue ?? Number(value.integerValue ?? value.doubleValue)]));
  const summary = balanceSummary(record);
  console.log(JSON.stringify(summary));
  if (summary.state === 'Unavailable') process.exitCode = 1;
}
main().catch(error => { console.error('Balance setup check failed:', stage, /^[a-zA-Z0-9_/-]+$/.test(String(error.code)) ? error.code : 'setup-error'); process.exitCode = 1; });
