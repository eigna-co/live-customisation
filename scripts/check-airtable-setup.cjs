// Read-only schema preflight. FALSE() prevents customer records being returned.
// Credentials are loaded privately from Secret Manager and are never printed.
const path = require('node:path');
const settings = require('../firebase-functions/integration-config.json').airtable;
const requiredFields = ['Name', 'Company', 'Email', 'Phone', 'Gift', 'Decoration', 'Font', 'Ticket', 'Status'];
let stage = 'initialise';
async function main() {
  const cliDirectory = process.argv[2];
  if (!cliDirectory) throw new Error('Firebase CLI library directory required');
  const auth = require(path.join(cliDirectory, 'lib/auth.js'));
  const account = auth.getGlobalDefaultAccount();
  if (account?.user?.email !== 'jerryl@evfy.sg') throw new Error('Expected administrator is not signed in');
  stage = 'secret-access';
  const access = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const secret = await fetch('https://secretmanager.googleapis.com/v1/projects/tgelive-1b68d/secrets/AIRTABLE_TOKEN/versions/latest:access', {
    headers: { Authorization: `Bearer ${access.access_token}` }, redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!secret.ok) { const error = new Error('Secret access failed'); error.code = `HTTP-${secret.status}`; throw error; }
  const payload = await secret.json();
  const token = Buffer.from(payload.payload.data, 'base64').toString('utf8').trim();
  stage = 'field-check';
  const url = `https://api.airtable.com/v0/${encodeURIComponent(settings.baseId)}/${encodeURIComponent(settings.tableId)}`;
  const checks = [];
  for (const field of requiredFields) {
    const query = new URLSearchParams({ filterByFormula: 'FALSE()', maxRecords: '1', 'fields[]': field });
    const response = await fetch(`${url}?${query}`, {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    if (response.ok) {
      if (!Array.isArray(body.records) || body.records.length !== 0) throw new Error('Unexpected preflight response');
      checks.push({ field, state: 'Present' });
    } else if (response.status === 422 && body.error?.type === 'UNKNOWN_FIELD_NAME') {
      checks.push({ field, state: 'Missing' });
    } else {
      const error = new Error('Provider check failed'); error.code = `HTTP-${response.status}`; throw error;
    }
  }
  console.log(JSON.stringify({ readAccess: 'Verified', writeAccess: 'Not tested', checks, customerRecordsRead: 0, recordsWritten: 0 }));
  if (checks.some(check => check.state === 'Missing')) process.exitCode = 2;
}
main().catch(error => {
  console.error('Airtable setup check failed:', stage, /^HTTP-\d{3}$/.test(String(error.code)) ? error.code : 'setup-error');
  process.exitCode = 1;
});
