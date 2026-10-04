const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { createHttpHandler } = require('./http-adapter');
const { createQueueHandler } = require('./queue-service');
const { syncOrder } = require('./airtable-mirror');
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
  secrets: ['AIRTABLE_TOKEN', 'AIRTABLE_BASE', 'AIRTABLE_TABLE'].map(name => defineSecret(name)),
}, async event => {
  if (event.data?.after.exists && event.data.after.data().mirrorState === 'Pending') {
    await syncOrder({ db: getDb(), orderRef: event.data.after.ref });
  }
});
