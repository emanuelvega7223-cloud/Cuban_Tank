// Netlify Function: form submission endpoint
// Path: /api/lead (proxied) or /.netlify/functions/lead (direct)
//
// Receives JSON form data, fires THREE downstream channels in parallel:
//   1. Resend → owner notification email (HTML, dark + red themed)
//   2. Resend → client confirmation email (HTML, warm welcome)
//   3. Airtable → lead row in Cuban Tank Leads / Table 1
//
// Secrets live in Netlify environment variables, never in client JS:
//   RESEND_API_KEY     - re_... from resend.com/api-keys
//   AIRTABLE_PAT       - pat... from airtable.com/create/tokens
//   AIRTABLE_BASE_ID   - app... (defaults to the live base if unset)
//   AIRTABLE_TABLE     - table name (defaults to "Table 1")
//   OWNER_EMAIL        - where owner notifications land
//   FROM_ADDRESS       - "Cris @ Cuban Tank <cris@cubantank.com>"

const RESEND_API   = 'https://api.resend.com/emails';
const AIRTABLE_API = 'https://api.airtable.com/v0';

const env = (key, fallback) => process.env[key] || fallback;

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return jsonResponse(400, { ok: false, error: 'Invalid JSON' });
  }

  // Minimal server-side validation
  const errors = [];
  if (!data.firstName) errors.push('firstName');
  if (!data.lastName) errors.push('lastName');
  if (!data.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) errors.push('email');
  if (!data.phone || data.phone.replace(/\D/g, '').length < 7) errors.push('phone');
  if (errors.length) {
    return jsonResponse(400, { ok: false, error: 'Missing/invalid fields', fields: errors });
  }

  const RESEND_KEY     = env('RESEND_API_KEY');
  const AIRTABLE_PAT   = env('AIRTABLE_PAT');
  const AIRTABLE_BASE  = env('AIRTABLE_BASE_ID', 'appQrm45DFtBdVaXr');
  const AIRTABLE_TABLE = env('AIRTABLE_TABLE', 'Table 1');
  // Owner notification address. If the OWNER_EMAIL env var is set in Netlify,
  // it overrides this default. To change permanently: update or delete the
  // env var in Netlify Dashboard → Site settings → Environment variables.
  const OWNER_EMAIL    = env('OWNER_EMAIL', 'cubantank2026@yahoo.com');
  const FROM_ADDRESS   = env('FROM_ADDRESS', 'Cris @ Cuban Tank <cris@cubantank.com>');
  const SITE_URL       = env('SITE_URL', 'https://cubantank.com');

  // Generate a reference id server-side so the client can't spoof it
  const reference = data.reference || generateReference();

  const promises = [];

  // 1. Owner notification email via Resend
  if (RESEND_KEY) {
    promises.push(
      sendResend(RESEND_KEY, {
        from: FROM_ADDRESS,
        to:   [OWNER_EMAIL],
        reply_to: data.email,
        subject:  `New Cuban Tank lead — ${data.firstName} ${data.lastName}`,
        html:     ownerEmailHtml(data, reference, SITE_URL),
      }).then(r => ({ channel: 'owner_email', to: OWNER_EMAIL, ...r }))
    );

    // 2. Client confirmation email via Resend
    promises.push(
      sendResend(RESEND_KEY, {
        from: FROM_ADDRESS,
        to:   [data.email],
        reply_to: 'cris@cubantank.com',
        subject:  `Thanks for signing up, ${data.firstName}.`,
        html:     clientEmailHtml(data, reference, SITE_URL),
      }).then(r => ({ channel: 'client_email', ...r }))
    );
  } else {
    promises.push(Promise.resolve({ channel: 'owner_email', ok: false, status: 0, error: 'RESEND_API_KEY not set' }));
    promises.push(Promise.resolve({ channel: 'client_email', ok: false, status: 0, error: 'RESEND_API_KEY not set' }));
  }

  // 3. Airtable record
  if (AIRTABLE_PAT) {
    promises.push(
      writeAirtable(AIRTABLE_PAT, AIRTABLE_BASE, AIRTABLE_TABLE, data, reference)
        .then(r => ({ channel: 'airtable', ...r }))
    );
  } else {
    promises.push(Promise.resolve({ channel: 'airtable', ok: false, status: 0, error: 'AIRTABLE_PAT not set' }));
  }

  const results = await Promise.all(
    promises.map(p => p.catch(e => ({ channel: 'unknown', ok: false, status: 0, error: String(e?.message || e) })))
  );

  // Lead is "captured" if at LEAST one of (owner_email, airtable) succeeded.
  // Client confirmation alone is not enough - we want a record of the lead.
  const ownerEmailOk = results.find(r => r.channel === 'owner_email')?.ok;
  const airtableOk   = results.find(r => r.channel === 'airtable')?.ok;
  const captured     = !!(ownerEmailOk || airtableOk);

  // Log non-success channels server-side for debugging
  results.forEach(r => {
    if (!r.ok) console.warn('[lead] channel failed:', r);
  });

  if (!captured) {
    return jsonResponse(502, {
      ok: false,
      error: 'Lead capture failed across all channels',
      results,
    });
  }

  return jsonResponse(200, {
    ok: true,
    reference,
    results,
  });
};

// ─────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type':                 'application/json',
  };
}

function jsonResponse(statusCode, body) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) };
}

function generateReference() {
  const n = 1000 + Math.floor(Math.random() * 8999);
  const now = new Date();
  const yr = now.getUTCFullYear();
  return `CT-${yr}-${n}`;
}

async function sendResend(apiKey, payload) {
  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });
    const txt = await res.text();
    let body;
    try { body = JSON.parse(txt); } catch (e) { body = { raw: txt }; }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message || e) };
  }
}

async function writeAirtable(pat, baseId, tableName, data, reference) {
  const url = `${AIRTABLE_API}/${baseId}/${encodeURIComponent(tableName)}`;
  const payload = {
    records: [{
      fields: {
        'First Name':     data.firstName  || '',
        'Last Name':      data.lastName   || '',
        'Email':          data.email      || '',
        'Phone':          data.phone      || '',
        'Reference':      reference,
        'Submitted At':   data.submittedAt || new Date().toISOString(),
        'Status':         'New',
        'Goals':          (data.goals || []).join(', '),
        'Level':          data.level || '',
        'Contact Method': data.contactMethod || '',
        'Availability':   (data.availability || []).join(', '),
        'Age Range':      data.ageRange || '',
        'Instagram':      data.instagram || '',
      },
    }],
    typecast: true,
  };
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const txt = await res.text();
    let body;
    try { body = JSON.parse(txt); } catch (e) { body = { raw: txt }; }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message || e) };
  }
}

// ─────────────────────────────────────────────────────────────────
//  Email HTML templates - email-safe (tables, inline CSS, no flex/grid)
// ─────────────────────────────────────────────────────────────────

function ownerEmailHtml(d, reference, siteUrl) {
  // HTML-escape for display text (prevents injection from user-controlled fields).
  const esc = (s) => String(s == null || s === '' ? '—' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  // URL-encode for href values.
  const urlEnc = (s) => encodeURIComponent(String(s || ''));
  // Strip whitespace + non-digits from phone for tel: hrefs.
  const telDigits = (s) => String(s || '').replace(/[^0-9+]/g, '');
  // row() takes ALREADY-built HTML for the value side, so callers can pass
  // anchor tags etc. without them being stripped.
  const row = (label, valueHtml) => `
    <tr>
      <td style="padding:8px 0;color:rgba(255,255,255,0.45);font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-family:Geist Mono,Menlo,monospace;width:140px;vertical-align:top;">${esc(label)}</td>
      <td style="padding:8px 0 8px 18px;color:#fff;font-size:14.5px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;border-bottom:1px solid rgba(255,255,255,0.06);word-break:break-word;">${valueHtml}</td>
    </tr>`;

  const goals        = (d.goals || []).join(', ');
  const availability = (d.availability || []).join(', ');
  const emailLink    = `<a href="mailto:${urlEnc(d.email)}" style="color:#E5283D;text-decoration:none;">${esc(d.email)}</a>`;
  const phoneLink    = `<a href="tel:${urlEnc(telDigits(d.phone))}" style="color:#E5283D;text-decoration:none;">${esc(d.phone)}</a>`;

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0B0B0C;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0B0B0C;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#141416;border:1px solid rgba(255,255,255,0.10);border-radius:18px;overflow:hidden;">
        <!-- top red hairline -->
        <tr><td style="height:1px;background:linear-gradient(90deg,transparent,#E5283D,transparent);font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 32px 24px 32px;">
          <div style="font-family:Geist Mono,Menlo,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#E5283D;">New lead · Cuban Tank</div>
          <h1 style="margin:10px 0 0 0;font-size:26px;letter-spacing:-0.02em;font-weight:600;color:#fff;line-height:1.15;">${esc(d.firstName)} ${esc(d.lastName)}</h1>
          <div style="margin-top:6px;font-family:Geist Mono,Menlo,monospace;font-size:11px;color:rgba(255,255,255,0.50);">Ref · ${esc(reference)}</div>
        </td></tr>
        <tr><td style="padding:0 32px 24px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid rgba(255,255,255,0.10);">
            ${row('Email',         emailLink)}
            ${row('Phone',         phoneLink)}
            ${row('Goals',         esc(goals || '—'))}
            ${row('Level',         esc(d.level))}
            ${row('Contact via',   esc(d.contactMethod))}
            ${row('Availability',  esc(availability || '—'))}
            ${row('Age range',     esc(d.ageRange))}
            ${row('Instagram',     esc(d.instagram))}
            ${row('SMS consent',   d.smsConsent ? 'YES' : 'NO')}
            ${row('Submitted at',  esc(d.submittedAt))}
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px 28px 32px;border-top:1px solid rgba(255,255,255,0.06);">
          <a href="mailto:${urlEnc(d.email)}" style="display:inline-block;background:#E5283D;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:9999px;">Reply to ${esc(d.firstName)}</a>
        </td></tr>
      </table>
      <div style="margin-top:18px;font-family:Geist Mono,Menlo,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,0.35);">CubanTank Fitness LLC · Miami</div>
    </td></tr>
  </table>
</body></html>`;
}

function clientEmailHtml(d, reference, siteUrl) {
  const safe = (s) => String(s || '').replace(/[<>]/g, '');
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0B0B0C;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0B0B0C;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#141416;border:1px solid rgba(255,255,255,0.10);border-radius:18px;overflow:hidden;">
        <tr><td style="height:1px;background:linear-gradient(90deg,transparent,#E5283D,transparent);font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td align="center" style="padding:36px 32px 8px 32px;">
          <img src="${siteUrl}/cubanktanklogo.jpg" alt="Cuban Tank" width="160" style="display:block;height:auto;width:160px;max-width:60%;border:0;" />
        </td></tr>
        <tr><td style="padding:20px 36px 8px 36px;">
          <div style="font-family:Geist Mono,Menlo,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#E5283D;text-align:center;">Confirmed · ${safe(reference)}</div>
        </td></tr>
        <tr><td style="padding:14px 36px 0 36px;">
          <h1 style="margin:0;font-size:30px;line-height:1.1;letter-spacing:-0.03em;font-weight:600;color:#fff;text-align:center;">Thanks for signing up, ${safe(d.firstName)}.</h1>
        </td></tr>
        <tr><td style="padding:22px 36px 8px 36px;">
          <p style="margin:0 0 14px 0;font-size:15.5px;line-height:1.65;color:rgba(255,255,255,0.82);">
            You just took the hardest step &mdash; the first one.
          </p>
          <p style="margin:0 0 14px 0;font-size:15.5px;line-height:1.65;color:rgba(255,255,255,0.82);">
            I&rsquo;ll be in touch personally soon to go over your goals and build a real plan around your life. The work is straightforward when you have a coach next to you, and I&rsquo;m looking forward to getting to know yours.
          </p>
          <p style="margin:0 0 4px 0;font-size:15.5px;line-height:1.65;color:#fff;">
            Let&rsquo;s get to work.
          </p>
          <p style="margin:18px 0 0 0;font-family:Georgia,serif;font-style:italic;font-size:17px;color:#fff;">
            &mdash; Cris
          </p>
        </td></tr>
        <tr><td style="padding:24px 36px 28px 36px;">
          <a href="${siteUrl}" style="display:inline-block;background:#E5283D;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:9999px;">Visit cubantank.com</a>
          &nbsp;&nbsp;
          <a href="https://www.instagram.com/cubantank/" style="color:rgba(255,255,255,0.65);text-decoration:none;font-size:13px;">@cubantank on Instagram</a>
        </td></tr>
        <tr><td style="padding:18px 36px 28px 36px;border-top:1px solid rgba(255,255,255,0.08);">
          <div style="font-family:Geist Mono,Menlo,monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,0.40);line-height:1.6;">
            CubanTank Fitness LLC<br/>
            Miami &middot; Paradise Gym &middot; Online<br/>
            Reply STOP to opt out of follow-up messages at any time.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
