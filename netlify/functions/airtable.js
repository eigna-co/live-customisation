const crypto = require('node:crypto');

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

const ALLOWED_GIFTS = new Set([
  'coffee tumbler',
  'notebook',
  'nets prepaid card',
]);

function reply(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength || /[\u0000-\u001f\u007f]/.test(cleaned)) return null;
  return cleaned;
}

function normaliseEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalisePhone(value) {
  if (typeof value !== 'string') return null;
  const phone = value.replace(/[\s-]/g, '');
  return /^\+65[89]\d{7}$/.test(phone) ? phone : null;
}

function escapeFormulaString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function emailQuery(email) {
  const params = new URLSearchParams();
  params.set('maxRecords', '1');
  params.append('fields[]', 'Email');
  params.set('filterByFormula', `LOWER({Email})="${escapeFormulaString(email)}"`);
  return params.toString();
}

function makeTicket() {
  return `CC·${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function validateRedemption(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const name = cleanText(payload.name, 100);
  const company = cleanText(payload.company, 100);
  const email = normaliseEmail(payload.email);
  const phone = normalisePhone(payload.phone);
  const gift = cleanText(payload.gift, 80)?.toLowerCase();
  const decoration = cleanText(payload.decoration, 8)?.toUpperCase();

  if (!name || !company || !email || !phone || !gift || !decoration || !ALLOWED_GIFTS.has(gift)) {
    return null;
  }

  return { name, company, email, phone, gift, decoration };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return reply(405, { error: 'Method not allowed' }, { Allow: 'POST' });
  }

  if (!event.body || event.body.length > 10_000) {
    return reply(400, { error: 'Invalid request' });
  }

  let request;
  try {
    request = JSON.parse(event.body);
  } catch {
    return reply(400, { error: 'Invalid JSON' });
  }

  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE;
  const table = process.env.AIRTABLE_TABLE;

  if (!token || !base || !table) {
    return reply(500, { error: 'Service is not configured' });
  }

  const airtableUrl = `https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    if (request.action === 'check-email') {
      const email = normaliseEmail(request.email);
      if (!email) return reply(422, { error: 'Invalid email' });

      const response = await fetch(`${airtableUrl}?${emailQuery(email)}`, { headers });
      if (!response.ok) return reply(502, { error: 'Unable to check redemption' });

      const data = await response.json();
      return reply(200, { exists: Array.isArray(data.records) && data.records.length > 0 });
    }

    if (request.action === 'create-redemption') {
      const redemption = validateRedemption(request.redemption);
      if (!redemption) return reply(422, { error: 'Invalid redemption details' });

      const duplicateResponse = await fetch(`${airtableUrl}?${emailQuery(redemption.email)}`, { headers });
      if (!duplicateResponse.ok) return reply(502, { error: 'Unable to verify redemption' });

      const duplicateData = await duplicateResponse.json();
      if (Array.isArray(duplicateData.records) && duplicateData.records.length > 0) {
        return reply(409, { error: 'Email has already been used' });
      }

      const ticket = makeTicket();
      const response = await fetch(airtableUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fields: {
            Name: redemption.name,
            Company: redemption.company,
            Email: redemption.email,
            Phone: redemption.phone,
            Gift: redemption.gift,
            Decoration: redemption.decoration,
            Ticket: ticket,
            Status: 'Queued',
          },
        }),
      });

      if (!response.ok) return reply(502, { error: 'Unable to create redemption' });
      return reply(201, { ticket });
    }

    return reply(400, { error: 'Unknown action' });
  } catch {
    return reply(502, { error: 'Airtable is unavailable' });
  }
};

exports._test = {
  emailQuery,
  normaliseEmail,
  normalisePhone,
  validateRedemption,
};
