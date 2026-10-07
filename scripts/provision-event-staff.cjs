// Run only after explicit approval to grant this account Nuvei queue access.
// Uses the signed-in Firebase CLI credential in memory; never prints credentials.
const path = require('node:path');
const backendRequire = require('node:module').createRequire(path.join(__dirname, '../firebase-functions/package.json'));
const { initializeApp } = backendRequire('firebase-admin/app');
const { getAuth } = backendRequire('firebase-admin/auth');

async function main() {
  const cliDirectory = process.argv[2];
  if (!cliDirectory) throw new Error('Firebase CLI library directory required');
  const email = process.argv[3];
  if (!['siewping.fong@thegiftexpert.com', 'jerryl@evfy.sg'].includes(email)) throw new Error('Explicitly approved staff email required');
  const cliAuth = require(path.join(cliDirectory, 'lib/auth.js'));
  const account = cliAuth.getGlobalDefaultAccount();
  if (account?.user?.email !== 'jerryl@evfy.sg') throw new Error('Expected project administrator is not signed in');
  const app = initializeApp({
    projectId: 'tgelive-1b68d',
    credential: { getAccessToken: async () => {
      const token = await cliAuth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
      return { access_token: token.access_token, expires_in: token.expires_in || 3600 };
    } },
  });
  const auth = getAuth(app);
  const user = await auth.getUserByEmail(email);
  if (user.disabled) throw new Error('Approved staff account is disabled');
  const existing = user.customClaims || {};
  if (existing.eventStaff && existing.eventStaff !== 'nuvei') throw new Error('Existing event role needs administrator review');
  if (process.argv[4] !== '--check') await auth.setCustomUserClaims(user.uid, { ...existing, eventStaff: 'nuvei' });
  const verified = await auth.getUser(user.uid);
  if (verified.customClaims?.eventStaff !== 'nuvei') throw new Error('Role verification failed');
  console.log(JSON.stringify({ email, eventStaff: verified.customClaims.eventStaff, emailVerified: verified.emailVerified, disabled: verified.disabled }));
}
main().catch(error => { console.error('Staff provisioning failed:', error.code || 'setup-error'); process.exitCode = 1; });
