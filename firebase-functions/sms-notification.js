const settings = require('./integration-config.json').sms;
const sidPattern = /^SM[0-9a-f]{32}$/i;

function collectionMessage(order, config = settings) {
  if (!/^NU·[0-9A-F]{10}$/.test(order.ticket || '')) throw new Error('Invalid ticket');
  // Use ASCII in SMS: the displayed ticket's middle dot can cause Unicode segmentation.
  return `Your personalised travel adaptor is ready! Please collect it at ${config.collectionLocation} and show your order reference ${order.ticket.replace('·', '-')}.`;
}

async function notifyReady({ db, orderRef, config = settings, env = process.env, fetchImpl = fetch, now = Date.now }) {
  const order = await db.runTransaction(async tx => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return null;
    const value = snap.data();
    if (!['Ready', 'Collected'].includes(value.status) || value.smsState !== 'Pending' || value.smsAttempted) return null;
    if (!config.enabled || !/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID || '') || !/^\+[1-9]\d{7,14}$/.test(config.from || '') || !env.TWILIO_API_KEY || !env.TWILIO_API_SECRET) {
      tx.update(orderRef, { smsState: 'Blocked', smsError: 'SMS is not configured.' });
      return null;
    }
    if (!/^SK[0-9a-f]{32}$/i.test(env.TWILIO_API_KEY) || !/^\+65[89]\d{7}$/.test(value.phone || '')) {
      tx.update(orderRef, { smsState: 'Blocked', smsError: 'Invalid SMS configuration or recipient.' });
      return null;
    }
    let body;
    try { body = collectionMessage(value, config); } catch {
      tx.update(orderRef, { smsState: 'Blocked', smsError: 'Invalid SMS template or order reference.' });
      return null;
    }
    if (!/^[\x20-\x7E]+$/.test(body) || body.length > 160) {
      tx.update(orderRef, { smsState: 'Blocked', smsError: 'SMS template exceeds the single-segment limit.' });
      return null;
    }
    // Durable claim BEFORE network I/O. A timeout or crash must never cause an automatic second SMS.
    tx.update(orderRef, { smsState: 'Sending', smsAttempted: true, smsAttemptedAt: now() });
    return { ...value, body };
  });
  if (!order) return;
  let patch;
  try {
    const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST', redirect: 'error',
      headers: { Authorization: `Basic ${Buffer.from(`${env.TWILIO_API_KEY}:${env.TWILIO_API_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: order.phone, From: config.from, Body: order.body }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok || !sidPattern.test(result.sid || '')) throw new Error('Unconfirmed SMS submission');
    patch = { smsState: 'Accepted', smsMessageSid: result.sid, smsProviderStatus: typeof result.status === 'string' ? result.status.slice(0, 30) : 'unknown', smsSubmittedAt: now() };
  } catch {
    patch = { smsState: 'Review', smsError: 'Check Twilio logs before any resend. Submission may have succeeded.' };
  }
  // If this write fails, the persisted Sending claim still prevents a second attempt.
  await orderRef.update(patch);
}
module.exports = { notifyReady, collectionMessage };
