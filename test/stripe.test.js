const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const { createApp } = require('../server');
const { openDb } = require('../db');

const WEBHOOK_SECRET = 'whsec_test_secret';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.ADMIN_TOKEN = 'test-admin-token';

// Fake Stripe API: records created sessions; payment status is controlled by the test.
// Webhook verification uses the real SDK so signature handling is exercised for real.
const realStripe = new Stripe('sk_test_dummy');
const sessions = new Map();
const fakeStripe = {
  checkout: {
    sessions: {
      async create(params) {
        const id = `cs_test_${sessions.size + 1}`;
        const session = { id, url: `https://checkout.stripe.test/${id}`, payment_status: 'unpaid', metadata: params.metadata, params };
        sessions.set(id, session);
        return session;
      },
      async retrieve(id) { return sessions.get(id); },
    },
  },
  webhooks: realStripe.webhooks,
};

let server;
let base;
let db;
before(async () => {
  db = openDb(':memory:');
  server = createApp(db, { stripe: fakeStripe }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function client() {
  let cookie = '';
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie().find((c) => c.startsWith('veya_sid='));
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

const details = { name: 'Ada', email: 'ada@example.com', address: '1 Main St', city: 'London', postalCode: 'N1', country: 'UK' };
const stockOf = (id) => db.prepare('SELECT stock FROM products WHERE id = ?').get(id).stock;

function sendWebhook(event) {
  const payload = JSON.stringify(event);
  const header = realStripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return fetch(`${base}/api/stripe/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload,
  });
}

test('config reports stripe mode', async () => {
  assert.equal((await client()('/api/config')).body.payments, 'stripe');
});

test('checkout redirects to Stripe and only finalizes once paid', async () => {
  const api = client();
  await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-boxy-tee', size: 'M', qty: 2 } });
  const stockBefore = stockOf('heavyweight-boxy-tee');

  const r = await api('/api/checkout', { method: 'POST', body: details });
  assert.equal(r.status, 201);
  assert.match(r.body.redirectUrl, /^https:\/\/checkout\.stripe\.test\//);
  const session = [...sessions.values()].at(-1);
  assert.equal(session.params.line_items[0].price_data.unit_amount, 2200);
  assert.equal(session.params.line_items[0].quantity, 2);
  assert.equal(session.params.shipping_options[0].shipping_rate_data.fixed_amount.amount, 600); // $44 is under the $75 free-shipping threshold
  assert.equal(session.params.customer_email, 'ada@example.com');

  // Not paid yet: bag kept, stock untouched, order pending.
  assert.equal((await api('/api/cart')).body.count, 2);
  let confirm = await api(`/api/checkout/confirm?session_id=${session.id}`);
  assert.equal(confirm.body.status, 'pending_payment');
  assert.equal(stockOf('heavyweight-boxy-tee'), stockBefore);

  session.payment_status = 'paid';
  confirm = await api(`/api/checkout/confirm?session_id=${session.id}`);
  assert.equal(confirm.body.status, 'confirmed');
  assert.equal(confirm.body.number, r.body.number);
  assert.equal(stockOf('heavyweight-boxy-tee'), stockBefore - 2);
  assert.equal((await api('/api/cart')).body.count, 0);

  // A duplicate webhook for the same session must not take stock twice.
  const res = await sendWebhook({ type: 'checkout.session.completed', data: { object: session } });
  assert.equal(res.status, 200);
  assert.equal(stockOf('heavyweight-boxy-tee'), stockBefore - 2);
});

test('webhook finalizes paid orders and cancels expired ones', async () => {
  const api = client();
  await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-sweatpants', size: 'M' } });
  const paid = await api('/api/checkout', { method: 'POST', body: details });
  const paidSession = [...sessions.values()].at(-1);
  const stockBefore = stockOf('heavyweight-sweatpants');
  paidSession.payment_status = 'paid';
  assert.equal((await sendWebhook({ type: 'checkout.session.completed', data: { object: paidSession } })).status, 200);
  assert.equal(db.prepare('SELECT status FROM orders WHERE number = ?').get(paid.body.number).status, 'confirmed');
  assert.equal(stockOf('heavyweight-sweatpants'), stockBefore - 1);

  await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-sweatpants', size: 'L' } });
  const abandoned = await api('/api/checkout', { method: 'POST', body: details });
  const expired = [...sessions.values()].at(-1);
  await sendWebhook({ type: 'checkout.session.expired', data: { object: expired } });
  assert.equal(db.prepare('SELECT status FROM orders WHERE number = ?').get(abandoned.body.number).status, 'cancelled');
  assert.equal((await api('/api/cart')).body.count, 1); // bag kept so they can try again
});

test('webhook rejects bad signatures', async () => {
  const res = await fetch(`${base}/api/stripe/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=bad' }, body: '{}',
  });
  assert.equal(res.status, 400);
});

test('unpaid orders stay out of the customer order history', async () => {
  const api = client();
  await api('/api/auth/register', { method: 'POST', body: { name: 'Pat', email: 'pat@example.com', password: 'supersecret' } });
  await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-hoodie' } });
  await api('/api/checkout', { method: 'POST', body: details });
  assert.equal((await api('/api/orders')).body.length, 0);
  const session = [...sessions.values()].at(-1);
  session.payment_status = 'paid';
  await api(`/api/checkout/confirm?session_id=${session.id}`);
  assert.equal((await api('/api/orders')).body.length, 1);
});
