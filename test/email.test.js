const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { openDb } = require('../db');
const { createMailer } = require('../email');

process.env.ADMIN_TOKEN = 'test-admin-token';
process.env.EMAIL_FROM = 'VEYA <news@veya.example>';
process.env.MAILING_ADDRESS = '123 Example St, Brooklyn, NY 11201';
process.env.PUBLIC_URL = 'https://veya.example';

// Fake Resend API: records every batch request; can be told to fail.
const requests = [];
let failNext = [];
async function fakeResend(url, init) {
  requests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
  const status = failNext.shift();
  if (status) return new Response(JSON.stringify({ message: 'Rate limited' }), { status });
  return new Response(JSON.stringify({ data: JSON.parse(init.body).map((_, i) => ({ id: `id-${i}` })) }), { status: 200 });
}
const mailer = createMailer({ apiKey: 're_test', from: process.env.EMAIL_FROM, fetchImpl: fakeResend, sleep: async () => {} });

let db;
let app;
let server;
let base;
before(async () => {
  db = openDb(':memory:');
  app = createApp(db, { stripe: null, shopify: null, mailer });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const admin = (path, { method = 'GET', body } = {}) => fetch(base + path, {
  method,
  headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-token' },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }));
const subscribe = (email) => fetch(`${base}/api/subscribe`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
}).then((r) => r.status);

test('campaign routes need the admin token', async () => {
  const res = await fetch(`${base}/api/admin/campaigns`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: 'x', body: 'y' }),
  });
  assert.equal(res.status, 401);
  assert.equal((await fetch(`${base}/api/admin/subscribers.csv`)).status, 401);
});

test('sends to every active subscriber in batches of 100, with unsubscribe links', async () => {
  for (let i = 0; i < 205; i += 1) assert.equal(await subscribe(`person${i}@example.com`), 201);
  assert.equal(await subscribe('person0@example.com'), 200); // duplicate sign-up

  // One subscriber unsubscribes through their link before the send.
  const leaver = db.prepare("SELECT unsubscribe_token FROM subscribers WHERE email = 'person7@example.com'").get();
  const page = await fetch(`${base}/unsubscribe?token=${leaver.unsubscribe_token}`);
  assert.match(await page.text(), /<form method="post">/);
  const done = await fetch(`${base}/unsubscribe?token=${leaver.unsubscribe_token}`, { method: 'POST' });
  assert.match(await done.text(), /You are unsubscribed/);

  requests.length = 0;
  const r = await admin('/api/admin/campaigns', { method: 'POST', body: { subject: 'Hoodies are back', body: 'Hello!\n\nThe heavyweight hoodie restocked.' } });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.equal(r.body.recipients, 204);
  await app.locals.campaignJob;

  assert.deepEqual(requests.map((q) => q.body.length), [100, 100, 4]);
  assert.ok(requests.every((q) => q.url === 'https://api.resend.com/emails/batch'));
  assert.ok(requests.every((q) => q.headers.Authorization === 'Bearer re_test' && q.headers['Idempotency-Key']));
  const all = requests.flatMap((q) => q.body);
  assert.equal(new Set(all.map((m) => m.to[0])).size, 204, 'each person once');
  assert.ok(!all.some((m) => m.to[0] === 'person7@example.com'), 'unsubscribed person is skipped');
  const first = all[0];
  assert.equal(first.from, 'VEYA <news@veya.example>');
  assert.equal(first.subject, 'Hoodies are back');
  assert.match(first.headers['List-Unsubscribe'], /^<https:\/\/veya\.example\/unsubscribe\?token=[0-9a-f]{48}>$/);
  assert.equal(first.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(first.html, /123 Example St, Brooklyn, NY 11201/);
  assert.match(first.html, /The heavyweight hoodie restocked\./);
  assert.match(first.text, /Unsubscribe: https:\/\/veya\.example\/unsubscribe\?token=/);

  const summary = (await admin('/api/admin/summary')).body;
  assert.equal(summary.campaigns[0].status, 'sent');
  assert.equal(summary.campaigns[0].sent_count, 204);
  assert.equal(summary.email.activeSubscribers, 204);
});

test('message text is escaped in the email HTML', async () => {
  requests.length = 0;
  await admin('/api/admin/campaigns/test', { method: 'POST', body: { subject: 'Hi', body: '<script>alert(1)</script>', to: 'me@example.com' } });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body[0].subject, '[Test] Hi');
  assert.ok(!requests[0].body[0].html.includes('<script>'));
});

test('retries when rate limited, and records a failure if the provider keeps refusing', async () => {
  requests.length = 0;
  failNext = [429];
  let r = await admin('/api/admin/campaigns', { method: 'POST', body: { subject: 'Retry', body: 'Body' } });
  await app.locals.campaignJob;
  assert.equal((await admin('/api/admin/summary')).body.campaigns[0].status, 'sent');
  assert.equal(requests[0].headers['Idempotency-Key'], requests[1].headers['Idempotency-Key'], 'retry reuses the key, so no duplicates');

  failNext = [401];
  r = await admin('/api/admin/campaigns', { method: 'POST', body: { subject: 'Fail', body: 'Body' } });
  assert.equal(r.status, 202);
  await app.locals.campaignJob;
  const latest = (await admin('/api/admin/summary')).body.campaigns[0];
  assert.equal(latest.status, 'failed');
  assert.match(latest.error, /Rate limited/);
});

test('signing up again after unsubscribing resubscribes', async () => {
  assert.equal(await subscribe('person7@example.com'), 201);
  assert.equal((await admin('/api/admin/summary')).body.email.activeSubscribers, 205);
});

test('preview works without sending; CSV export is quoted and formula-safe', async () => {
  const preview = await admin('/api/admin/campaigns/preview', { method: 'POST', body: { subject: 'Preview', body: 'Line one' } });
  assert.match(preview.body.html, /Line one/);
  assert.equal(await subscribe('=cmd@example.com'), 201);
  const csv = await (await fetch(`${base}/api/admin/subscribers.csv`, { headers: { 'x-admin-token': 'test-admin-token' } })).text();
  assert.match(csv, /^email,signed_up,status\n/);
  assert.match(csv, /"'=cmd@example.com"/);
  assert.match(csv, /"person0@example.com","[^"]+","subscribed"/);
});

test('refuses to send until email settings are complete', async () => {
  const noMail = createApp(openDb(':memory:'), { stripe: null, shopify: null, mailer: null }).listen(0);
  await new Promise((r) => noMail.once('listening', r));
  try {
    const res = await fetch(`http://127.0.0.1:${noMail.address().port}/api/admin/campaigns`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-token' },
      body: JSON.stringify({ subject: 'x', body: 'y' }),
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /RESEND_API_KEY/);
  } finally {
    noMail.close();
  }
  const saved = process.env.MAILING_ADDRESS;
  delete process.env.MAILING_ADDRESS;
  try {
    const r = await admin('/api/admin/campaigns', { method: 'POST', body: { subject: 'x', body: 'y' } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /MAILING_ADDRESS/);
  } finally {
    process.env.MAILING_ADDRESS = saved;
  }
});

test('a send interrupted by a restart is marked failed on startup', async () => {
  const restartDb = openDb(':memory:');
  restartDb.prepare("INSERT INTO campaigns (subject, body, status, recipients) VALUES ('x', 'y', 'sending', 5)").run();
  createApp(restartDb, { stripe: null, shopify: null, mailer });
  const row = restartDb.prepare('SELECT status, error FROM campaigns').get();
  assert.equal(row.status, 'failed');
  assert.match(row.error, /server restart/);
});
