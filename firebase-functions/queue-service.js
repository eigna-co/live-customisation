const crypto = require('node:crypto');
const config = require('./event-config.json');
const { _test: validation } = require('./redemption');
const { balanceSummary, balancePath } = require('./twilio-balance');

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const paths = { root: `events/${config.id}` };
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const fail = (status, message, code) => { throw new ApiError(status, message, code); };
const nextStatus = { Queued: 'Decorating', Decorating: 'Ready', Ready: 'Collected' };
const receipt = order => ({ ticket: order.ticket, trackingToken: order.trackingToken, status: order.status });

function createQueueHandler({ getDb, verifyToken, webApiKey = () => '', authFetch = fetch, now = Date.now, eventConfig = config }) {
  function eventDay(at) {
    const schedule = eventConfig.schedule;
    if (!Number.isInteger(schedule?.year)) fail(503, 'The event year has not been configured.', 'event-unconfigured');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: schedule.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at)).map(part => [part.type, part.value]));
    if (Number(parts.year) !== schedule.year || Number(parts.month) !== schedule.month || !schedule.days.includes(Number(parts.day))) return null;
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function inventoryData(snap, capacity) {
    const value = snap.exists ? snap.data() : { capacity, reserved: 0 };
    if (!Number.isSafeInteger(value.capacity) || value.capacity < 0 || !Number.isSafeInteger(value.reserved) || value.reserved < 0) fail(503, 'Stock is unavailable. Please contact the event team.');
    return value;
  }
  function orderWindow(at) {
    const day = eventDay(at);
    if (day) return { day, isTest: false };
    const trial = eventConfig.trial;
    const start = Date.parse(trial?.startsAt), end = Date.parse(trial?.expiresAt);
    if (trial?.enabled !== true || !/^[a-z0-9-]{1,64}$/.test(trial.id || '') ||
        !Number.isSafeInteger(trial.capacity) || trial.capacity < 1 || trial.capacity > 50 ||
        !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 7 * 86400000 || at < start || at >= end) return null;
    return { day: `trial-${trial.id}`, isTest: true, trialId: trial.id, capacity: trial.capacity };
  }
  function stockPlan(product, window) {
    return { key: window.isTest ? `${window.day}-${product.id}` : product.id,
      total: window.isTest ? window.capacity : product.quantity,
      daily: window.isTest ? window.capacity : product.dailyQuantity };
  }
  async function staff(event) {
    const token = event.headers?.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) fail(401, 'Please sign in.');
    let identity;
    try { identity = await verifyToken(token); } catch { fail(401, 'Your session has expired. Please sign in again.'); }
    if (identity.eventStaff !== config.id || identity.email_verified !== true) fail(403, 'This account does not have access to this event.');
    return identity;
  }

  async function createOrder(request) {
    if (request.reviewConfirmed !== true) fail(422, 'Please review and confirm your engraving details.', 'review-required');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(request.requestId || '')) fail(422, 'Invalid request reference.');
    if (Object.hasOwn(request.redemption || {}, 'decorationBottom')) fail(422, 'Only the top area can be personalised. The bottom has a pre-engraved Nuvei logo.');
    const details = validation.validateRedemption(request.redemption);
    if (!details) fail(422, 'Invalid redemption details.');
    const product = eventConfig.products.find(product => product.name.toLowerCase() === details.gift);
    const fingerprint = digest(JSON.stringify(details));
    const db = getDb();
    const at = now();
    const window = orderWindow(at);
    const orderId = digest(window?.isTest ? `${window.trialId}:${details.email}` : details.email);
    const requestRef = db.doc(`${paths.root}/requests/${request.requestId}`);
    // Generate these once, outside the callback: Firestore may retry transactions.
    const ticket = `${config.ticketPrefix}·${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const trackingToken = crypto.randomBytes(32).toString('hex');
    return db.runTransaction(async tx => {
      const savedRequest = await tx.get(requestRef);
      const orderRef = db.doc(`${paths.root}/orders/${savedRequest.exists ? savedRequest.data().orderId : orderId}`);
      const existing = await tx.get(orderRef);
      if (savedRequest.exists) {
        if (savedRequest.data().fingerprint !== fingerprint) fail(409, 'This request reference was already used for different details.', 'request-conflict');
        if (!existing.exists) fail(503, 'Please contact the event team with your reference.');
        return { ...receipt(existing.data()), replayed: true };
      }
      if (existing.exists) fail(409, 'This email has already claimed a gift for this event.', 'duplicate-email');
      if (!window) fail(409, 'Orders are only accepted on the event dates.', 'event-closed');
      const day = window.day;
      const plan = stockPlan(product, window);
      const stockRef = db.doc(`${paths.root}/inventory/${plan.key}`);
      const dailyRef = db.doc(`${paths.root}/inventory/${plan.key}-${day}`);
      const [stock, dailyStock] = await Promise.all([tx.get(stockRef), tx.get(dailyRef)]);
      const inventory = inventoryData(stock, plan.total);
      const daily = inventoryData(dailyStock, plan.daily);
      if (inventory.reserved >= Math.min(inventory.capacity, plan.total) || daily.reserved >= Math.min(daily.capacity, plan.daily)) fail(409, 'Today’s allocation is sold out.', 'sold-out');
      const order = { ...details, eventDay: day, ...(window.isTest ? { isTest: true, trialId: window.trialId } : {}), reviewConfirmedAt: at, productId: product.id, ticket, trackingToken, status: 'Queued', createdAt: at, updatedAt: at, version: 0, mirrorState: 'Pending' };
      tx.create(orderRef, order);
      tx.create(requestRef, { orderId, fingerprint });
      tx.create(db.doc(`${paths.root}/tracking/${digest(trackingToken)}`), { orderId });
      tx.set(stockRef, { ...inventory, reserved: inventory.reserved + 1 });
      tx.set(dailyRef, { ...daily, reserved: daily.reserved + 1 });
      return receipt(order);
    });
  }

  async function availability() {
    const db = getDb();
    const window = orderWindow(now());
    const day = window?.day || null;
    const products = await Promise.all(eventConfig.products.map(async product => {
      if (!day) return { id: product.id, remaining: 0 };
      const plan = stockPlan(product, window);
      const snap = await db.doc(`${paths.root}/inventory/${plan.key}`).get();
      const dailySnap = await db.doc(`${paths.root}/inventory/${plan.key}-${day}`).get();
      const data = inventoryData(snap, plan.total);
      const daily = inventoryData(dailySnap, plan.daily);
      return { id: product.id, remaining: Math.max(0, Math.min(Math.min(data.capacity, plan.total) - data.reserved, Math.min(daily.capacity, plan.daily) - daily.reserved)) };
    }));
    return { products, eventDay: day, eventClosed: !day };
  }

  return async event => {
    if (event.httpMethod !== 'POST') return { ...reply(405, { error: 'Method not allowed' }), headers: { ...headers, Allow: 'POST' } };
    if (!event.body || Buffer.byteLength(event.body) > 10000) return reply(400, { error: 'Invalid request' });
    let request;
    try { request = JSON.parse(event.body); } catch { return reply(400, { error: 'Invalid JSON' }); }
    if (!request || typeof request !== 'object' || Array.isArray(request)) return reply(400, { error: 'Invalid request' });
    try {
      if (request.action === 'create-redemption') {
        const address = `${event.clientAddress || 'unknown'}:${digest(validation.normalisePhone(request.redemption?.phone) || 'invalid')}`;
        if (validation.isRateLimited({ clientAddress: address })) return { ...reply(429, { error: 'Too many requests. Please wait and try again.' }), headers: { ...headers, 'Retry-After': '60' } };
        const result = await createOrder(request);
        return reply(result.replayed ? 200 : 201, result);
      }
      if (request.action === 'get-availability') return reply(200, await availability());
      if (request.action === 'get-service-config') return reply(200, { transactional: true, staffLoginConfigured: !!webApiKey() });
      if (request.action === 'get-order-status') {
        if (!/^[a-f0-9]{64}$/.test(request.trackingToken || '')) fail(404, 'Order not found.');
        const db = getDb();
        const tracking = await db.doc(`${paths.root}/tracking/${digest(request.trackingToken)}`).get();
        if (!tracking.exists) fail(404, 'Order not found.');
        const order = await db.doc(`${paths.root}/orders/${tracking.data().orderId}`).get();
        if (!order.exists) fail(404, 'Order not found.');
        return reply(200, { ticket: order.data().ticket, status: order.data().status });
      }
      if (request.action === 'staff-sign-in') {
        if (validation.isRateLimited(event)) fail(429, 'Too many attempts. Please wait.');
        const key = webApiKey();
        if (!key) fail(503, 'Staff sign-in has not been configured yet.');
        if (typeof request.email !== 'string' || typeof request.password !== 'string' || request.password.length > 1000) fail(422, 'Enter your email and password.');
        const response = await authFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: request.email, password: request.password, returnSecureToken: true }),
          signal: AbortSignal.timeout(10000),
        });
        const data = await response.json();
        if (!response.ok || !data.idToken) fail(401, 'Unable to sign in. Check your details or contact the event administrator.');
        let identity;
        try { identity = await verifyToken(data.idToken); } catch { fail(401, 'Unable to verify your session. Please sign in again.'); }
        if (identity.eventStaff !== config.id) fail(403, 'This account does not have access to this event.');
        if (identity.email_verified !== true) {
          const verification = await authFetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(key)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken: data.idToken }),
            signal: AbortSignal.timeout(10000),
          });
          if (!verification.ok) fail(403, 'Your email needs verification. The verification email could not be sent; please contact the event administrator.', 'verification-required');
          fail(403, 'A verification email has been sent. Check your inbox or spam folder, open the link, then sign in again.', 'verification-required');
        }
        return reply(200, { idToken: data.idToken, expiresIn: Number(data.expiresIn) || 3600 });
      }
      if (request.action === 'staff-list-orders') {
        await staff(event);
        const snap = await getDb().collection(`${paths.root}/orders`).orderBy('createdAt', 'asc').limit(200).get();
        let twilioBalance = balanceSummary(null, now());
        try {
          const balance = await getDb().doc(balancePath).get();
          twilioBalance = balanceSummary(balance.exists ? balance.data() : null, now());
        } catch { /* A balance check must not prevent staff from using the queue. */ }
        return reply(200, { orders: snap.docs.map(doc => {
          const { name, gift, decoration, font, ticket, status, version, createdAt, mirrorState, smsState, smsProviderStatus, isTest } = doc.data();
          return { id: doc.id, name, gift, decoration, font, ticket, status, version, createdAt, mirrorState, isTest: isTest === true, smsState: smsState || 'Not queued', smsProviderStatus: smsProviderStatus || null };
        }), twilioBalance, ...await availability() });
      }
      if (request.action === 'staff-update-status') {
        const identity = await staff(event);
        if (!/^[a-f0-9]{64}$/.test(request.orderId || '') || !Number.isSafeInteger(request.version)) fail(422, 'Invalid order reference.');
        const db = getDb();
        const ref = db.doc(`${paths.root}/orders/${request.orderId}`);
        const result = await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists) fail(404, 'Order not found.');
          const order = snap.data();
          if (order.status === request.status) return { status: order.status, version: order.version };
          if (order.version !== request.version) fail(409, 'Another staff member updated this order. Refresh and try again.');
          if (nextStatus[order.status] !== request.status) fail(422, 'Invalid queue status change.');
          tx.update(ref, { status: request.status, version: order.version + 1, updatedAt: now(), mirrorState: ['Processing', 'Review'].includes(order.mirrorState) ? order.mirrorState : 'Pending', ...(request.status === 'Ready' && !order.smsState ? { smsState: 'Pending' } : {}) });
          tx.create(ref.collection('audit').doc(), { from: order.status, to: request.status, staffUid: identity.uid, at: now() });
          return { status: request.status, version: order.version + 1 };
        });
        return reply(200, result);
      }
      if (request.action === 'staff-retry-sms') {
        const identity = await staff(event);
        if (!/^[a-f0-9]{64}$/.test(request.orderId || '')) fail(422, 'Invalid order reference.');
        const db = getDb();
        const ref = db.doc(`${paths.root}/orders/${request.orderId}`);
        await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists) fail(404, 'Order not found.');
          const order = snap.data();
          if (!['Ready', 'Collected'].includes(order.status) || order.smsState !== 'Blocked' || order.smsAttempted) fail(409, 'Check Twilio logs. An attempted SMS cannot be automatically resent.');
          tx.update(ref, { smsState: 'Pending' });
          tx.create(ref.collection('audit').doc(), { action: 'retry-blocked-sms', staffUid: identity.uid, at: now() });
        });
        return reply(200, { queued: true });
      }
      if (request.action === 'staff-retry-sync') {
        await staff(event);
        if (!/^[a-f0-9]{64}$/.test(request.orderId || '')) fail(422, 'Invalid order reference.');
        const db = getDb();
        const ref = db.doc(`${paths.root}/orders/${request.orderId}`);
        await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists) fail(404, 'Order not found.');
          const order = snap.data();
          const stale = order.mirrorState === 'Processing' && Number.isFinite(order.mirrorStartedAt) && now() - order.mirrorStartedAt > 120000;
          if (!['Error', 'Review'].includes(order.mirrorState) && !stale) fail(409, 'This order is already syncing or synced.');
          tx.update(ref, { mirrorState: 'Pending' });
        });
        return reply(200, { queued: true });
      }
      return reply(400, { error: 'Unknown action' });
    } catch (error) {
      return reply(error instanceof ApiError ? error.status : 503, { error: error instanceof ApiError ? error.message : 'Service temporarily unavailable. Please retry with the same details.', ...(error.code ? { code: error.code } : {}) });
    }
  };
}

module.exports = { createQueueHandler, digest, paths };
