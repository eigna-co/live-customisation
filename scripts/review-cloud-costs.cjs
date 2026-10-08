// Read-only billing budget and deployment artifact policy inspection.
// No billing changes, API activation, payment details, deletions or alert creation.
const path = require('node:path');
async function main() {
  const auth = require(path.join(process.argv[2], 'lib/auth.js'));
  const account = auth.getGlobalDefaultAccount();
  if (account?.user?.email !== 'jerryl@evfy.sg') throw new Error('Unexpected administrator');
  const access = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const read = async url => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${access.access_token}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    return { ok: response.ok, status: response.status, data: await response.json() };
  };
  const repo = await read('https://artifactregistry.googleapis.com/v1/projects/tgelive-1b68d/locations/asia-southeast1/repositories/gcf-artifacts');
  console.log(JSON.stringify({ artifactPolicyAccess: repo.status, cleanupPolicies: repo.ok ? repo.data.cleanupPolicies || {} : null, dryRun: repo.ok ? repo.data.cleanupPolicyDryRun || false : null }));
  const billing = await read('https://cloudbilling.googleapis.com/v1/projects/tgelive-1b68d/billingInfo');
  console.log(JSON.stringify({ billingInfoAccess: billing.status, billingEnabled: billing.ok ? billing.data.billingEnabled : null }));
  if (!billing.ok || !billing.data.billingAccountName) return;
  const budgets = await read(`https://billingbudgets.googleapis.com/v1/${billing.data.billingAccountName}/budgets?pageSize=100`);
  if (!budgets.ok) { console.log(JSON.stringify({ budgetAccess: budgets.status, budgetVerification: 'Unavailable', changesMade: false })); return; }
  const relevant = (budgets.data.budgets || []).filter(b => !b.budgetFilter?.projects?.length || b.budgetFilter.projects.includes('projects/619881848023'));
  console.log(JSON.stringify({ budgetAccess: budgets.status, applicableBudgets: relevant.map(b => ({
    displayName: b.displayName, scope: b.budgetFilter?.projects?.length ? 'Includes event project' : 'Billing account',
    amount: b.amount, thresholds: b.thresholdRules, defaultEmailRecipientsEnabled: !b.allUpdatesRule?.disableDefaultIamRecipients,
  })), moreBudgetsExist: !!budgets.data.nextPageToken, changesMade: false }));
}
main().catch(() => { console.error('Read-only cloud cost review unavailable; no settings changed.'); process.exitCode = 1; });
