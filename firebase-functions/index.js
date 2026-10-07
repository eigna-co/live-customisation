const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { createHttpHandler } = require('./http-adapter');
const { createQueueHandler } = require('./queue-service');
const { syncOrder } = require('./airtable-mirror');
const { notifyReady } = require('./sms-notification');
const { checkBalance } = require('./twilio-balance');
const EVENT = require('./event-config.json');
const webApiKey = defineString('FIREBASE_WEB_API_KEY', { default: '' });
const getDb = () => { if (!getApps().length) initializeApp(); return getFirestore(); };
const handler = createQueueHandler({ getDb, verifyToken: token => { getDb(); return getAuth().verifyIdToken(token, true); }, webApiKey: () => webApiKey.value() });

exports.redemptions = onRequest({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  minInstances: 0,
  maxInstances: 2,
  invoker: 'public',
}, createHttpHandler(handler));

exports.mirrorOrders = onDocumentWritten({
  document: `events/${EVENT.id}/orders/{orderId}`,
  region: 'asia-southeast1', timeoutSeconds: 60, maxInstances: 2,
  retry: false,
  secrets: ['AIRTABLE_TOKEN'].map(name => defineSecret(name)),
}, async event => {
  if (event.data?.after.exists && event.data.after.data().mirrorState === 'Pending') {
    await syncOrder({ db: getDb(), orderRef: event.data.after.ref });
  }
});

exports.notifyCollection = onDocumentWritten({
  document: `events/${EVENT.id}/orders/{orderId}`,
  region: 'asia-southeast1', timeoutSeconds: 30, maxInstances: 2,
  retry: false,
  secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET'].map(name => defineSecret(name)),
}, async event => {
  if (event.data?.after.exists && event.data.after.data().smsState === 'Pending') {
    await notifyReady({ db: getDb(), orderRef: event.data.after.ref });
  }
});

exports.monitorTwilioBalance = onSchedule({
  schedule: 'every 60 minutes',
  region: 'asia-southeast1', timeoutSeconds: 30, minInstances: 0, maxInstances: 1,
  retryCount: 0,
  secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_BALANCE_AUTH_TOKEN'].map(name => defineSecret(name)),
}, async () => { await checkBalance({ db: getDb() }); });
