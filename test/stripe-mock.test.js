// Validates the real Checkout Session request against Stripe's API spec using stripe-mock
// (https://github.com/stripe/stripe-mock), which rejects any parameter Stripe would reject.
// Skipped unless STRIPE_MOCK_PORT is set:
//   go install github.com/stripe/stripe-mock@latest && stripe-mock -http-port 12111
//   STRIPE_MOCK_PORT=12111 npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const { createApp } = require('../server');
const { openDb } = require('../db');

const port = Number(process.env.STRIPE_MOCK_PORT);

test('checkout session request is accepted by stripe-mock', { skip: !port && 'STRIPE_MOCK_PORT not set' }, async () => {
  const stripe = new Stripe('sk_test_123', { host: 'localhost', port, protocol: 'http' });
  for (const publicUrl of ['http://localhost:3000', 'https://veya.example.com']) {
    process.env.PUBLIC_URL = publicUrl; // https adds product images to the request
    const server = createApp(openDb(':memory:'), { stripe }).listen(0);
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    const call = async (path, body) => {
      const res = await fetch(base + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie && { cookie }) }, body: JSON.stringify(body),
      });
      const set = res.headers.getSetCookie().find((c) => c.startsWith('veya_sid='));
      if (set) cookie = set.split(';')[0];
      return { status: res.status, body: await res.json() };
    };
    try {
      await call('/api/cart', { productId: 'heavyweight-zip-hoodie', size: 'M' });
      await call('/api/cart', { productId: 'everyday-crew', size: 'L', color: 'Charcoal', qty: 2 });
      const r = await call('/api/checkout', {
        name: 'Ada', email: 'ada@example.com', address: '1 St', city: 'X', postalCode: '1', country: 'US',
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.match(r.body.redirectUrl, /^https:\/\/checkout\.stripe\.com\//);
    } finally {
      server.close();
      delete process.env.PUBLIC_URL;
    }
  }
});
