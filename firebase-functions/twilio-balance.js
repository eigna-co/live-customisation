const settings = require('./integration-config.json');
const EVENT = require('./event-config.json');
const balancePath = `events/${EVENT.id}/integrations/twilioBalance`;
const maxAgeMs = 2 * 60 * 60 * 1000;

function balanceSummary(record, now = Date.now(), config = settings) {
  const threshold = config.balanceMonitor?.lowBalanceUsd ?? 5;
  const checkedAt = Number.isFinite(record?.checkedAt) ? record.checkedAt : null;
  const fresh = checkedAt !== null && checkedAt <= now && now - checkedAt < maxAgeMs;
  if (record?.state !== 'Available' || !fresh || record.currency !== 'USD' || !Number.isFinite(record.balance)) {
    return { state: 'Unavailable', balance: null, currency: 'USD', threshold, checkedAt };
  }
  return { state: record.balance <= threshold ? 'Low' : 'Available', balance: record.balance, currency: 'USD', threshold, checkedAt };
}

// Runs separately from the public queue API. Never sends messages or tops up.
async function checkBalance({ db, config = settings, env = process.env, fetchImpl = fetch, now = Date.now }) {
  if (!config.balanceMonitor?.enabled) return;
  let record = { state: 'Unavailable', checkedAt: now() };
  try {
    if (!/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID || '') || !env.TWILIO_BALANCE_AUTH_TOKEN) throw new Error('Not configured');
    const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Balance.json`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_BALANCE_AUTH_TOKEN}`).toString('base64')}` },
    });
    if (!response.ok) throw new Error('Unavailable');
    const data = await response.json();
    const balance = typeof data.balance === 'string' && /^-?\d+(\.\d+)?$/.test(data.balance) ? Number(data.balance) : NaN;
    if (data.account_sid !== env.TWILIO_ACCOUNT_SID || data.currency !== 'USD' || !Number.isFinite(balance)) throw new Error('Invalid balance');
    record = { state: 'Available', balance, currency: data.currency, checkedAt: now() };
  } catch {
    // Do not expose credentials, provider errors or an old balance as current.
    record.checkedAt = now();
  }
  await db.runTransaction(async tx => { tx.set(db.doc(balancePath), record); });
}

module.exports = { checkBalance, balanceSummary, balancePath, maxAgeMs };
