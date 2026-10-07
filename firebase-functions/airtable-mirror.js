const settings = require('./integration-config.json').airtable;
async function syncOrder({ db, orderRef, fetchImpl = fetch, env = process.env }) {
  let createStarted = false;
  let recordId;
  const order = await db.runTransaction(async tx => {
    const snap = await tx.get(orderRef);
    if (!snap.exists || snap.data().mirrorState !== 'Pending') return null;
    tx.update(orderRef, { mirrorState: 'Processing', mirrorStartedAt: Date.now() });
    return snap.data();
  });
  if (!order) return;
  try {
    if (!env.AIRTABLE_TOKEN) throw new Error('Missing configuration');
    const url = `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE || settings.baseId)}/${encodeURIComponent(env.AIRTABLE_TABLE || settings.tableId)}`;
    const headers = { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
    const request = async (target, options = {}) => {
      const result = await fetchImpl(target, { ...options, headers, signal: AbortSignal.timeout(8000) });
      if (!result.ok) throw new Error('Airtable request failed');
      return result.json();
    };
    recordId = order.airtableRecordId;
    if (!recordId) {
      const params = new URLSearchParams({ maxRecords: '2', filterByFormula: `{Ticket}="${order.ticket}"` });
      const found = await request(`${url}?${params}`);
      if (!Array.isArray(found.records)) throw new Error('Invalid mirror result');
      if (found.records.length > 1) { await orderRef.update({ mirrorState: 'Review' }); return; }
      recordId = found.records[0]?.id;
      if (!recordId && order.mirrorCreateAttempted) { await orderRef.update({ mirrorState: 'Review' }); return; }
    }
    const fields = { Name: order.name, Company: order.company, Email: order.email, Phone: order.phone, Gift: order.gift, Decoration: order.decoration, Font: order.font, Ticket: order.ticket, Status: order.status };
    if (!recordId) {
      // A timed-out POST may have succeeded remotely. Never blindly repeat it.
      await orderRef.update({ mirrorCreateAttempted: true });
      createStarted = true;
      const created = await request(url, { method: 'POST', body: JSON.stringify({ fields }) });
      if (typeof created.id !== 'string') throw new Error('Missing record reference');
      recordId = created.id;
    } else {
      await request(`${url}/${encodeURIComponent(recordId)}`, { method: 'PATCH', body: JSON.stringify({ fields: { Status: order.status } }) });
    }
    await db.runTransaction(async tx => {
      const current = await tx.get(orderRef);
      tx.update(orderRef, { airtableRecordId: recordId, syncedVersion: order.version, mirrorState: current.data().version === order.version ? 'Synced' : 'Pending' });
    });
  } catch {
    await orderRef.update({ mirrorState: createStarted && !recordId ? 'Review' : 'Error' });
  }
}
module.exports = { syncOrder };
