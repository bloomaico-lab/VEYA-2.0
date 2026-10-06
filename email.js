// Newsletter email: builds campaign emails and sends them through Resend (https://resend.com).
//
// Env: RESEND_API_KEY (turns sending on), EMAIL_FROM (e.g. "VEYA <news@yourdomain.com>", on a
// domain verified in Resend), MAILING_ADDRESS (your postal address — US CAN-SPAM requires one in
// every marketing email), EMAIL_REPLY_TO (optional).

const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';
const BATCH_SIZE = 100; // Resend's per-request maximum
const RETRIES = 3;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// Plain-text message from the admin -> branded HTML + text versions with the legal footer.
function renderCampaign({ subject, body, unsubscribeUrl, mailingAddress, siteUrl }) {
  const paragraphs = body.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const htmlParagraphs = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1B2A41;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F5EFE4;font-family:Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE4;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FBF8F2;border-radius:8px;">
<tr><td style="padding:28px 32px 8px;font-family:Georgia,serif;font-size:26px;letter-spacing:1px;color:#1B2A41;">VEYA<span style="color:#34507A;">.</span></td></tr>
<tr><td style="padding:16px 32px 8px;">${htmlParagraphs}
<p style="margin:24px 0 8px;"><a href="${escapeHtml(siteUrl)}" style="display:inline-block;background:#1B2A41;color:#F5EFE4;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;">Shop VEYA</a></p></td></tr>
<tr><td style="padding:24px 32px 28px;border-top:1px solid #E2D8C6;font-size:12px;line-height:18px;color:#4A5568;">
You're receiving this because you joined the VEYA list.<br>
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#4A5568;">Unsubscribe</a><br>
${escapeHtml(mailingAddress)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${paragraphs.join('\n\n')}\n\nShop VEYA: ${siteUrl}\n\n--\nYou're receiving this because you joined the VEYA list.\nUnsubscribe: ${unsubscribeUrl}\n${mailingAddress}\n`;
  return { html, text };
}

function createMailer({ apiKey, from, replyTo, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  async function postBatch(emails, idempotencyKey) {
    for (let attempt = 1; ; attempt += 1) {
      const res = await fetchImpl(RESEND_BATCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(emails),
      });
      if (res.ok) return;
      const body = await res.json().catch(() => ({}));
      // Rate limited or a temporary server error: back off and retry (same idempotency key, so no duplicates).
      if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
        await sleep(1000 * attempt);
        continue;
      }
      throw new Error(body.message || `Email provider returned HTTP ${res.status}.`);
    }
  }

  // messages: [{ to, subject, html, text, unsubscribeUrl }]. Sends in batches of 100.
  async function sendAll(messages, { idempotencyPrefix, onProgress = () => {} } = {}) {
    let sent = 0;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const chunk = messages.slice(i, i + BATCH_SIZE).map((m) => ({
        from,
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
        headers: {
          // One-click unsubscribe (RFC 8058), required by Gmail and Yahoo for bulk senders.
          'List-Unsubscribe': `<${m.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }));
      await postBatch(chunk, `${idempotencyPrefix}-${i / BATCH_SIZE}`);
      sent += chunk.length;
      onProgress(sent);
      if (i + BATCH_SIZE < messages.length) await sleep(150); // stay well under 10 requests/second
    }
    return sent;
  }

  return { sendAll };
}

function mailerFromEnv(env = process.env) {
  if (!env.RESEND_API_KEY) return null;
  return createMailer({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, replyTo: env.EMAIL_REPLY_TO });
}

module.exports = { createMailer, mailerFromEnv, renderCampaign, BATCH_SIZE };
