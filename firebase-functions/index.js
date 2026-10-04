const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { createHttpHandler } = require('./http-adapter');
const { handler } = require('./redemption');

exports.redemptions = onRequest({
  region: 'asia-southeast1',
  timeoutSeconds: 30,
  memory: '256MiB',
  minInstances: 0,
  maxInstances: 2,
  invoker: 'public',
  secrets: ['AIRTABLE_TOKEN', 'AIRTABLE_BASE', 'AIRTABLE_TABLE'].map((name) => defineSecret(name)),
}, createHttpHandler(handler));
