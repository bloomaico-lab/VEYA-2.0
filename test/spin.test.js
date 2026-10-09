const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { openDb } = require('../db');
const discounts = require('../discounts');

process.env.ADMIN_TOKEN = 'test-admin-token';

function startServer(db, options) {
  return new Promise((resolve) => {
    const server = createApp(db, options).listen(0, () => resolve(server));
  });
}

// Minimal cookie-keeping client so each "browser" has its own session.
function clientFor(base) {
  return () => {
    let cookie = '';
    return async (path, { method = 'GET', body, headers = {} } = {}) => {
      const res = await fetch(base + path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.getSetCookie().find((c) => c.startsWith('veya_sid='));
      if (set) cookie = set.split(';')[0];
      return { status: res.status, body: await res.json().catch(() => null) };
    };
  };
}

test('the wheel: every spin lands on 25% off', () => {
  assert.equal(discounts.SLICES.length, 8);
  assert.equal(discounts.SLICES.reduce((s, x) => s + x.weight, 0), 100);
  assert.ok(discounts.SLICES.every((s) => discounts.PRIZES[s.prize]), 'every slice is a real deal');
  const top = discounts.SLICES.findIndex((s) => s.prize === 'pct25');
  assert.equal(top, 7);
  for (const r of [0, 0.15, 0.35, 0.5, 0.97, 0.999999]) assert.equal(discounts.pickSlice(() => r), top, `random ${r}`);
});

test('the wheel: weighted picks when the deals are mixed up', () => {
  const { pickSlice } = discounts;
  // Cumulative weights 15, 33, 49, 63, 71, 86, 96, 100.
  const mixed = [15, 18, 16, 14, 8, 15, 10, 4].map((weight, i) => ({ ...discounts.SLICES[i], weight }));
  assert.equal(pickSlice(() => 0, mixed), 0);
  assert.equal(pickSlice(() => 0.149, mixed), 0);
  assert.equal(pickSlice(() => 0.15, mixed), 1);
  assert.equal(pickSlice(() => 0.35, mixed), 2);
  assert.equal(pickSlice(() => 0.97, mixed), 7);
  assert.equal(pickSlice(() => 0.999999, mixed), 7);
  // The 25% slice comes up about 4 times in 100.
  const counts = Array(8).fill(0);
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 20000; i += 1) counts[pickSlice(rng, mixed)] += 1;
  assert.ok(counts[7] / 20000 > 0.03 && counts[7] / 20000 < 0.05, `25% off came up ${counts[7]} times`);
  // Slices with no weight never win, even at the very ends of the range.
  const sparse = [{ weight: 0 }, { weight: 3 }, { weight: 0 }, { weight: 1 }, { weight: 0 }];
  assert.equal(pickSlice(() => 0, sparse), 1);
  assert.equal(pickSlice(() => 0.74, sparse), 1);
  assert.equal(pickSlice(() => 0.75, sparse), 3);
  assert.equal(pickSlice(() => 0.999999, sparse), 3);
});

test('discount codes and maths', () => {
  assert.match(discounts.uniqueCode('pct15'), /^SPIN15-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}$/);
  assert.equal(discounts.normalizeCode('  spin15-ab2cd '), 'SPIN15-AB2CD');

  const { evaluate, PRIZES } = discounts;
  assert.deepEqual(evaluate(PRIZES.pct15, 12000), { amount: 1800, freeShipping: false, eligible: true });
  assert.equal(evaluate(PRIZES.pct10, 2299).amount, 230, 'percent rounds to the nearest cent');
  assert.equal(evaluate(PRIZES.usd5, 300).amount, 300, 'money off never goes below zero');
  assert.equal(evaluate(PRIZES.usd10, 5999).eligible, false);
  assert.match(evaluate(PRIZES.usd10, 5999).note, /Spend \$60/);
  assert.equal(evaluate(PRIZES.usd10, 6000).amount, 1000);
  assert.deepEqual(evaluate(PRIZES.ship, 2400), { amount: 0, freeShipping: true, eligible: true });
});

describe('spin to win on the built-in store', () => {
  let server;
  let db;
  let client;
  before(async () => {
    db = openDb(':memory:');
    // Whatever random() says, the wheel lands on 25% off.
    server = await startServer(db, { stripe: null, random: () => 0.35 });
    client = clientFor(`http://127.0.0.1:${server.address().port}`);
  });
  after(() => server.close());

  const details = { name: 'Ada', email: 'ada@example.com', address: '1 Main St', city: 'London', postalCode: 'N1', country: 'UK' };

  test('spin once, claim with an email, and the code comes off the bag', async () => {
    const api = client();
    const wheel = await api('/api/spin');
    assert.equal(wheel.body.slices.length, 8);
    assert.deepEqual(wheel.body.slices[1], { big: 'FREE', small: 'SHIPPING', style: 'sand', title: 'Free shipping on your order' });
    assert.equal(wheel.body.result, null);
    assert.equal((await api('/api/spin/claim', { method: 'POST', body: { email: 'win@example.com' } })).status, 400, 'spin first');

    const spin = await api('/api/spin', { method: 'POST' });
    assert.equal(spin.status, 201);
    assert.deepEqual(spin.body, { slice: 7, title: '25% off your order', claimed: null });
    const again = await api('/api/spin', { method: 'POST' });
    assert.equal(again.status, 200);
    assert.equal(again.body.slice, 7, 'spinning again returns the first result');

    await api('/api/cart', { method: 'POST', body: { productId: 'oversized-hoodie', size: 'M', color: 'Black', qty: 2 } });
    assert.equal((await api('/api/spin/claim', { method: 'POST', body: { email: 'not-an-email' } })).status, 400);
    const claim = await api('/api/spin/claim', { method: 'POST', body: { email: 'Win@Example.com' } });
    assert.equal(claim.status, 201);
    assert.match(claim.body.code, /^SPIN25-[A-Z2-9]{5}$/);
    assert.equal(claim.body.title, '25% off your order');
    assert.equal(claim.body.existing, false);
    assert.equal(claim.body.emailed, false, 'no email provider in this test');
    assert.match(claim.body.expiresAt, /^\d{4}-\d{2}-\d{2} /);

    const cart = (await api('/api/cart')).body;
    assert.equal(cart.subtotal, 120);
    assert.deepEqual(cart.discount, {
      code: claim.body.code, title: '25% off your order', amount: 30, freeShipping: false, applied: true, note: '',
    });
    assert.equal(cart.total, 90, '$120 - 25% ($30), with free shipping over $75');
    assert.equal((await api('/api/spin')).body.result.claimed.code, claim.body.code);

    // Claiming again (any email) gives the same code back.
    const reclaim = await api('/api/spin/claim', { method: 'POST', body: { email: 'other@example.com' } });
    assert.equal(reclaim.body.code, claim.body.code);
    assert.equal(reclaim.body.existing, true);

    // The email joined the list.
    const admin = await api('/api/admin/summary', { headers: { 'x-admin-token': 'test-admin-token' } });
    assert.ok(admin.body.subscribers.some((s) => s.email === 'win@example.com'));
    assert.equal(admin.body.discountCodes[0].code, claim.body.code);
    assert.equal(admin.body.discountCodes[0].title, '25% off your order');
    assert.ok(admin.body.spins >= 1);
  });

  test('one code per email, even from another browser', async () => {
    const first = client();
    await first('/api/spin', { method: 'POST' });
    const a = await first('/api/spin/claim', { method: 'POST', body: { email: 'once@example.com' } });
    const second = client();
    await second('/api/spin', { method: 'POST' });
    const b = await second('/api/spin/claim', { method: 'POST', body: { email: 'once@example.com' } });
    assert.equal(b.status, 200);
    assert.equal(b.body.code, a.body.code);
    assert.equal(b.body.existing, true);
  });

  test('checkout charges the discounted total and the code then works only once', async () => {
    const api = client();
    await api('/api/spin', { method: 'POST' });
    const { code } = (await api('/api/spin/claim', { method: 'POST', body: { email: 'buyer@example.com' } })).body;
    await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-crewneck', size: 'M', color: 'Black' } });
    const order = await api('/api/checkout', { method: 'POST', body: details });
    assert.equal(order.status, 201);
    assert.equal(order.body.total, 42, '$48 - 25% ($12) + $6 shipping');
    const row = db.prepare('SELECT * FROM orders WHERE number = ?').get(order.body.number);
    assert.equal(row.discount_code, code);
    assert.equal(row.discount_cents, 1200);
    assert.equal(row.subtotal_cents, 4800);
    assert.ok(db.prepare('SELECT used_at FROM discount_codes WHERE code = ?').get(code).used_at, 'code is spent');
    assert.equal((await api('/api/cart')).body.discount, null, 'the spent code leaves the bag');

    const r = await api('/api/cart/discount', { method: 'POST', body: { code } });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /already been used/);
  });

  test('typing a code in the bag: unknown, expired, minimum spend and free shipping', async () => {
    const api = client();
    assert.equal((await api('/api/cart/discount', { method: 'POST', body: { code: '' } })).status, 400);
    assert.equal((await api('/api/cart/discount', { method: 'POST', body: { code: 'NOPE-12345' } })).status, 404);
    const add = (code, prize, expires = "datetime('now', '+14 days')") => db.prepare(`INSERT INTO discount_codes
      (code, email, prize, kind, value, min_subtotal_cents, expires_at) VALUES (?, 'x@example.com', ?, ?, ?, ?, ${expires})`)
      .run(code, prize, discounts.PRIZES[prize].kind, discounts.PRIZES[prize].value, discounts.PRIZES[prize].min || 0);
    add('SPIN10-OLDOO', 'pct10', "datetime('now', '-1 day')");
    add('TAKE10-AAAAA', 'usd10');
    add('SHIPFREE-BBBBB', 'ship');
    const expired = await api('/api/cart/discount', { method: 'POST', body: { code: 'spin10-oldoo' } });
    assert.equal(expired.status, 409);
    assert.match(expired.body.error, /expired/);

    await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-crewneck', size: 'M', color: 'Black' } }); // $48
    let cart = (await api('/api/cart/discount', { method: 'POST', body: { code: 'take10-aaaaa' } })).body;
    assert.equal(cart.discount.applied, false);
    assert.match(cart.discount.note, /Spend \$60/);
    assert.equal(cart.total, 54, 'no discount until the minimum spend');
    const item = cart.items[0].id;
    cart = (await api(`/api/cart/${item}`, { method: 'PATCH', body: { qty: 2 } })).body; // $96
    assert.equal(cart.discount.applied, true);
    assert.equal(cart.discount.amount, 10);
    assert.equal(cart.total, 86);

    cart = (await api('/api/cart/discount', { method: 'POST', body: { code: 'SHIPFREE-BBBBB' } })).body;
    cart = (await api(`/api/cart/${item}`, { method: 'PATCH', body: { qty: 1 } })).body; // $48, normally $6 shipping
    assert.equal(cart.discount.freeShipping, true);
    assert.equal(cart.shipping, 0);
    assert.equal(cart.total, 48);

    cart = (await api('/api/cart/discount', { method: 'DELETE' })).body;
    assert.equal(cart.discount, null);
    assert.equal(cart.total, 54);
  });

  test('a code that expires while in the bag is taken off at checkout', async () => {
    const api = client();
    db.prepare(`INSERT INTO discount_codes (code, email, prize, kind, value, expires_at)
      VALUES ('SPIN20-CCCCC', 'y@example.com', 'pct20', 'percent', 20, datetime('now', '+1 day'))`).run();
    await api('/api/cart', { method: 'POST', body: { productId: 'heavyweight-crewneck', size: 'M', color: 'Black' } });
    assert.equal((await api('/api/cart/discount', { method: 'POST', body: { code: 'SPIN20-CCCCC' } })).body.discount.amount, 9.6);
    db.prepare("UPDATE discount_codes SET expires_at = datetime('now', '-1 minute') WHERE code = 'SPIN20-CCCCC'").run();
    const cart = (await api('/api/cart')).body;
    assert.equal(cart.discount.applied, false);
    assert.equal(cart.total, 54);
    const order = await api('/api/checkout', { method: 'POST', body: details });
    assert.equal(order.status, 409);
    assert.match(order.body.error, /expired/);
    assert.equal((await api('/api/cart')).body.discount, null);
  });
});

test('the won code is emailed when email sending is set up', async () => {
  const sent = [];
  const mailer = { sendAll: async (messages, opts) => { sent.push({ messages, opts }); return messages.length; } };
  const saved = { from: process.env.EMAIL_FROM, address: process.env.MAILING_ADDRESS };
  process.env.EMAIL_FROM = 'VEYA <hello@veya.example>';
  process.env.MAILING_ADDRESS = '1 Example St, Miami FL';
  const server = await startServer(openDb(':memory:'), { stripe: null, mailer });
  try {
    const api = clientFor(`http://127.0.0.1:${server.address().port}`)();
    await api('/api/spin', { method: 'POST' });
    const claim = await api('/api/spin/claim', { method: 'POST', body: { email: 'mail@example.com' } });
    assert.equal(claim.body.emailed, true);
    assert.match(claim.body.code, /^SPIN25-/);
    assert.equal(sent.length, 1);
    const [message] = sent[0].messages;
    assert.equal(message.to, 'mail@example.com');
    assert.equal(message.subject, 'Your VEYA code: 25% off your order');
    assert.ok(message.text.includes(claim.body.code));
    assert.match(message.unsubscribeUrl, /\/unsubscribe\?token=[0-9a-f]{48}$/);
  } finally {
    server.close();
    if (saved.from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = saved.from;
    if (saved.address === undefined) delete process.env.MAILING_ADDRESS; else process.env.MAILING_ADDRESS = saved.address;
  }
});
